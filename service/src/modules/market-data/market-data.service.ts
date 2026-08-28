import { Injectable, Logger } from '@nestjs/common';
import { BinanceClient, BinanceKline } from './clients/binance.client';
import { CandleRepository } from './repositories/candle.repository';
import {
    assertAllowedInterval,
    assertValidLimit,
    candleCacheTtlSeconds,
    intervalMs,
    MAX_CANDLE_LIMIT,
    MIN_CANDLES_PER_TIMEFRAME,
} from './config';
import { CacheService } from '../../cache/cache.service';

export interface MarketCandle {
    timeframe: string;
    timestamp: Date;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}

export interface CandleImportResult {
    symbol: string;
    interval: string;
    count: number;
}

export interface CandleCoverageResult {
    interval: string;
    /** Rows already in `candles` for the window before this call. */
    before: number;
    /** Rows in `candles` for the window after any backfill this call did. */
    after: number;
    /** How many candles were fetched from Binance and persisted. */
    fetched: number;
}

// Small pause between paged Binance requests during a backfill, matching
// scripts/seed-candles.ts — this must never hammer the upstream API.
const BACKFILL_REQUEST_DELAY_MS = 200;

// Hard ceiling on pages per ensureCandleCoverage() call. A window the user
// picked can be arbitrarily long; without this, one search request could
// walk Binance for thousands of pages. Bounded work per request is the
// "no uncontrolled loop" rule this project holds itself to.
const MAX_BACKFILL_PAGES = 30;

@Injectable()
export class MarketDataService {
    private readonly logger = new Logger(MarketDataService.name);

    constructor(
        private readonly binanceClient: BinanceClient,
        private readonly candleRepository: CandleRepository,
        private readonly cache: CacheService,
    ) { }

    /**
     * Fetches candles straight from Binance (no DB read — see
     * artifacts/api-contract.md), through a Redis cache keyed by every
     * parameter that changes the result (symbol, interval, limit — see
     * artifacts/cache.md). Binance's most recent page always ends with the
     * currently-forming candle, whose close/volume are partial and still
     * changing; returning it indistinguishable from a closed candle would
     * corrupt any chart or downstream computation reading this response the
     * same way persisting it would corrupt the `candles` table. So it's
     * dropped here rather than flagged, keeping "every MarketCandle this
     * service hands out already closed" true for every caller, with no
     * extra field for consumers to remember to check — and, because the
     * closed-candle set for one (symbol, interval, limit) provably cannot
     * change mid-interval, caching it never resurrects a forming candle
     * (see candleCacheTtlSeconds' doc comment for why the TTL is safe).
     * This is public market data (no user_id in the key) — every caller
     * sees the same Binance answer regardless of who is asking.
     */
    async getCandles(
        symbol: string,
        interval: string,
        limit: unknown = 500,
        startTime?: Date,
        endTime?: Date,
    ): Promise<MarketCandle[]> {
        assertAllowedInterval(interval);
        const boundedLimit = assertValidLimit(limit);
        // Both bounds are part of the answer, so both belong in the key —
        // otherwise a windowed request would be served the latest-candles
        // response cached under the same symbol/interval/limit.
        const windowKey = `${startTime?.getTime() ?? ''}:${endTime?.getTime() ?? ''}`;
        const cacheKey = `market-data:candles:${symbol}:${interval}:${boundedLimit}:${windowKey}`;
        const cached = await this.cache.get<MarketCandle[]>(cacheKey);
        if (cached) return cached;

        const rows = await this.binanceClient.getKlines(
            symbol,
            interval,
            boundedLimit,
            endTime?.getTime(),
            startTime?.getTime(),
        );
        const candles = this.onlyClosed(rows).map((row) => this.toCandle(interval, row));

        await this.cache.set(cacheKey, candles, candleCacheTtlSeconds(interval));
        return candles;
    }

    async importCandles(
        symbol: string,
        interval: string,
        limit: unknown = 500,
    ): Promise<CandleImportResult> {
        assertAllowedInterval(interval);
        const boundedLimit = assertValidLimit(limit);
        const rows = await this.binanceClient.getKlines(
            symbol,
            interval,
            boundedLimit,
        );
        // Same rule as MarketDataGateway (WebSocket) and seed-candles.ts
        // (backfill script): never persist the still-forming candle. All
        // three write paths into `candles` share this one derived flag
        // (BinanceKline#isClosed, computed once in binance.client.ts)
        // instead of each re-deriving "is this candle done" independently.
        const candles = this.onlyClosed(rows).map((row) => this.toCandle(interval, row));

        if (candles.length > 0) {
            await this.candleRepository.insertCandles(candles);
        }

        return {
            symbol,
            interval,
            count: candles.length,
        };
    }

    /**
     * Makes sure `[startTime, endTime)` holds at least `minimumCandles`
     * rows in the local `candles` table, backfilling from Binance when it
     * does not.
     *
     * This is the fix for "min = 202 candles required" and for long
     * timeframes never having enough history: the window the user asked
     * for was always valid, the database simply had never been filled that
     * far back, and nothing in the request path ever filled it. Idempotent
     * (insertCandles upserts on (timeframe, timestamp)) and bounded
     * (MAX_BACKFILL_PAGES), so it is safe to call on every search start.
     */
    async ensureCandleCoverage(
        symbol: string,
        interval: string,
        startTime: Date,
        endTime: Date,
        minimumCandles: number = MIN_CANDLES_PER_TIMEFRAME,
    ): Promise<CandleCoverageResult> {
        assertAllowedInterval(interval);
        const before = await this.candleRepository.countInWindow(
            interval,
            startTime,
            endTime,
        );
        if (before >= minimumCandles) {
            return { interval, before, after: before, fetched: 0 };
        }

        // Walk forward from the window's start, one page at a time, until
        // the window is covered or Binance runs out of data.
        let cursor = startTime.getTime();
        let fetched = 0;
        const step = intervalMs(interval) ?? 60_000;
        for (let page = 0; page < MAX_BACKFILL_PAGES; page += 1) {
            if (cursor >= endTime.getTime()) break;
            const rows = await this.binanceClient.getKlines(
                symbol,
                interval,
                MAX_CANDLE_LIMIT,
                endTime.getTime(),
                cursor,
            );
            if (rows.length === 0) break;

            const closed = this.onlyClosed(rows);
            if (closed.length > 0) {
                await this.candleRepository.insertCandles(
                    closed.map((row) => this.toCandle(interval, row)),
                );
                fetched += closed.length;
            }

            const lastOpenTime = rows[rows.length - 1].openTime;
            // Guard against a page that cannot advance the cursor (would
            // otherwise re-request the same page until MAX_BACKFILL_PAGES).
            const nextCursor = lastOpenTime + step;
            if (nextCursor <= cursor) break;
            cursor = nextCursor;

            if (rows.length < MAX_CANDLE_LIMIT) break;
            await new Promise((resolve) =>
                setTimeout(resolve, BACKFILL_REQUEST_DELAY_MS),
            );
        }

        const after = await this.candleRepository.countInWindow(
            interval,
            startTime,
            endTime,
        );
        this.logger.log(
            `Candle coverage for ${interval} ${startTime.toISOString()}..${endTime.toISOString()}: ` +
            `${before} -> ${after} (fetched ${fetched}, needed ${minimumCandles})`,
        );
        return { interval, before, after, fetched };
    }

    private onlyClosed(rows: BinanceKline[]): BinanceKline[] {
        return rows.filter((row) => row.isClosed);
    }

    private toCandle(
        interval: string,
        row: Awaited<ReturnType<BinanceClient['getKlines']>>[number],
    ): MarketCandle {
        return {
            timeframe: interval,
            timestamp: new Date(row.openTime),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
        };
    }
}
