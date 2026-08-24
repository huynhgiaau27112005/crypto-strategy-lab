import 'dotenv/config';

import { BinanceClient } from '../modules/market-data/clients/binance.client';
import { CandleRepository } from '../modules/market-data/repositories/candle.repository';
import { DatabaseService } from '../database/database.service';
import { ALLOWED_INTERVALS } from '../modules/market-data/config';

/**
 * Repeatable historical backfill for BTCUSDT candles.
 *
 * The live database starts with only a handful of candles, which is not
 * enough lookback for any strategy to emit a signal (every domain needs at
 * least 23-202 candles, see artifacts/api-contract.md). Running this script
 * fetches enough real history from Binance for a meaningful search/backtest
 * run and for the multi-timeframe dashboard to render.
 *
 * Idempotent: CandleRepository.insertCandles upserts on the (timeframe,
 * timestamp) key, so running this twice never duplicates rows or errors.
 *
 * Usage: npm run seed:candles
 */

const SYMBOL = 'BTCUSDT';

// Binance's kline endpoint caps a single request at 1000 rows.
const REQUEST_LIMIT = 1000;

// Small pause between paged requests so this never hammers the Binance API.
const REQUEST_DELAY_MS = 300;

// How many candles to backfill per interval. 5m gets the deepest history
// (used most heavily by strategy search); the others get enough for the
// multi-timeframe dashboard and for any domain's lookback requirement.
const TARGET_COUNTS: Record<string, number> = {
    '1m': 2000,
    '5m': 5000,
    '15m': 3000,
    '1h': 2000,
    '4h': 1000,
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillInterval(
    binanceClient: BinanceClient,
    candleRepository: CandleRepository,
    interval: string,
    targetCount: number,
): Promise<number> {
    console.log(`\n[${interval}] backfilling towards ${targetCount} candles...`);

    let totalFetched = 0;
    // Paging cursor: undefined means "most recent"; subsequent pages walk
    // backward in time from there.
    let endTime: number | undefined;

    while (totalFetched < targetCount) {
        const remaining = targetCount - totalFetched;
        const limit = Math.min(REQUEST_LIMIT, remaining);

        const rows = await binanceClient.getKlines(SYMBOL, interval, limit, endTime);
        if (rows.length === 0) {
            console.log(`[${interval}] Binance returned no more candles; stopping.`);
            break;
        }

        await candleRepository.insertCandles(
            rows.map((row) => ({
                timeframe: interval,
                timestamp: new Date(row[0]),
                open: row[1],
                high: row[2],
                low: row[3],
                close: row[4],
                volume: row[5],
            })),
        );

        totalFetched += rows.length;
        console.log(
            `[${interval}] fetched ${rows.length} (running total ${totalFetched}/${targetCount})`,
        );

        // Binance returns each page in ascending time order, so the oldest
        // row in this batch becomes the cursor for the next, older page.
        endTime = rows[0][0] - 1;

        if (rows.length < limit) {
            console.log(`[${interval}] reached the earliest data Binance has; stopping.`);
            break;
        }

        await sleep(REQUEST_DELAY_MS);
    }

    return totalFetched;
}

async function main(): Promise<void> {
    const binanceClient = new BinanceClient();
    const database = new DatabaseService();
    const candleRepository = new CandleRepository(database);

    console.log(
        `Seeding historical ${SYMBOL} candles for intervals: ${ALLOWED_INTERVALS.join(', ')}`,
    );

    for (const interval of ALLOWED_INTERVALS) {
        const target = TARGET_COUNTS[interval] ?? 1000;
        await backfillInterval(binanceClient, candleRepository, interval, target);
    }

    console.log('\nFinal candle counts per interval (from the database):');
    const counts = await candleRepository.countByTimeframe();
    for (const interval of ALLOWED_INTERVALS) {
        console.log(`  ${interval}: ${counts[interval] ?? 0}`);
    }

    await database.onModuleDestroy();
}

main()
    .then(() => {
        console.log('\nBackfill complete.');
        process.exit(0);
    })
    .catch((error: unknown) => {
        console.error('Backfill failed:', error);
        process.exit(1);
    });
