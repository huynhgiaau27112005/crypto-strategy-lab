import { Injectable } from '@nestjs/common';
import { BinanceClient, BinanceKline } from './clients/binance.client';
import { CandleRepository } from './repositories/candle.repository';
import { assertAllowedInterval, candleCacheTtlSeconds } from './config';
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

@Injectable()
export class MarketDataService {
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
        limit = 500,
    ): Promise<MarketCandle[]> {
        const cacheKey = `market-data:candles:${symbol}:${interval}:${limit}`;
        const cached = await this.cache.get<MarketCandle[]>(cacheKey);
        if (cached) return cached;

        const rows = await this.binanceClient.getKlines(
            symbol,
            interval,
            limit,
        );
        const candles = this.onlyClosed(rows).map((row) => this.toCandle(interval, row));

        await this.cache.set(cacheKey, candles, candleCacheTtlSeconds(interval));
        return candles;
    }

    async importCandles(
        symbol: string,
        interval: string,
        limit = 500,
    ): Promise<CandleImportResult> {
        assertAllowedInterval(interval);
        const rows = await this.binanceClient.getKlines(
            symbol,
            interval,
            limit,
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
