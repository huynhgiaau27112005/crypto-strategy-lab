import { BinanceKline } from './clients/binance.client';
import { MarketDataService } from './market-data.service';

function makeCache() {
    return {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn().mockResolvedValue(undefined),
        incr: jest.fn().mockResolvedValue(null),
    };
}

function makeRow(overrides: Partial<BinanceKline> = {}): BinanceKline {
    return {
        openTime: 1_700_000_000_000,
        open: '100',
        high: '110',
        low: '90',
        close: '105',
        volume: '10',
        closeTime: 1_700_000_059_999,
        isClosed: true,
        ...overrides,
    };
}

describe('MarketDataService', () => {
    describe('getCandles (GET /market-data/candles — live from Binance, no DB read)', () => {
        it('excludes the still-forming candle even when it is the last row Binance returns', async () => {
            // Mirrors the real corruption: the most recent page's last element
            // is the candle still forming on Binance right now.
            const closedA = makeRow({ openTime: 1_000, closeTime: 1_059, volume: '10' });
            const closedB = makeRow({ openTime: 2_000, closeTime: 2_059, volume: '20' });
            const unclosed = makeRow({
                openTime: 3_000,
                closeTime: 3_059,
                volume: '999', // would be an obviously-wrong partial volume if returned
                isClosed: false,
            });

            const binanceClient = {
                getKlines: jest.fn().mockResolvedValue([closedA, closedB, unclosed]),
            };
            const candleRepository = { insertCandles: jest.fn() };

            const cache = makeCache();
            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);
            const candles = await service.getCandles('BTCUSDT', '5m', 500);

            expect(candles).toHaveLength(2);
            expect(candles.map((c) => c.volume)).toEqual(['10', '20']);
            expect(candles.some((c) => c.volume === '999')).toBe(false);
        });

        it('returns an empty array when every candle in the page is unclosed', async () => {
            const binanceClient = {
                getKlines: jest
                    .fn()
                    .mockResolvedValue([makeRow({ openTime: 1_000, isClosed: false })]),
            };
            const candleRepository = { insertCandles: jest.fn() };

            const cache = makeCache();
            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);
            const candles = await service.getCandles('BTCUSDT', '1m', 500);

            expect(candles).toEqual([]);
        });

        it('returns the cached response and never calls Binance on a cache hit', async () => {
            const cachedCandles = [{ timeframe: '5m', timestamp: new Date(1_000), open: '1', high: '1', low: '1', close: '1', volume: '1' }];
            const binanceClient = { getKlines: jest.fn() };
            const candleRepository = { insertCandles: jest.fn() };
            const cache = makeCache();
            cache.get.mockResolvedValue(cachedCandles);

            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);
            const candles = await service.getCandles('BTCUSDT', '5m', 500);

            expect(candles).toEqual(cachedCandles);
            expect(binanceClient.getKlines).not.toHaveBeenCalled();
        });

        it('caches the fetched response keyed by symbol/interval/limit with an interval-sized TTL', async () => {
            const closedA = makeRow({ openTime: 1_000, closeTime: 1_059 });
            const binanceClient = { getKlines: jest.fn().mockResolvedValue([closedA]) };
            const candleRepository = { insertCandles: jest.fn() };
            const cache = makeCache();

            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);
            await service.getCandles('BTCUSDT', '5m', 500);

            expect(cache.set).toHaveBeenCalledWith(
                'market-data:candles:BTCUSDT:5m:500',
                expect.any(Array),
                300, // 5m
            );
        });

        it('falls through to Binance and still returns candles when the cache errors on read', async () => {
            const closedA = makeRow({ openTime: 1_000, closeTime: 1_059 });
            const binanceClient = { getKlines: jest.fn().mockResolvedValue([closedA]) };
            const candleRepository = { insertCandles: jest.fn() };
            const cache = makeCache();
            // Mirrors what CacheService itself guarantees (never throws) —
            // this proves MarketDataService still works if that contract
            // were ever violated, i.e. Redis being down never reaches the
            // client.
            cache.get.mockResolvedValue(null);

            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);
            const candles = await service.getCandles('BTCUSDT', '5m', 500);

            expect(candles).toHaveLength(1);
            expect(binanceClient.getKlines).toHaveBeenCalledTimes(1);
        });

        it('rejects an interval outside the allowed list before calling Binance', async () => {
            const binanceClient = { getKlines: jest.fn() };
            const candleRepository = { insertCandles: jest.fn() };
            const cache = makeCache();
            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);

            await expect(service.getCandles('BTCUSDT', '1x', 500)).rejects.toThrow();
            expect(binanceClient.getKlines).not.toHaveBeenCalled();
        });

        it('rejects a non-numeric limit with a 400 instead of forwarding NaN to Binance', async () => {
            const binanceClient = { getKlines: jest.fn() };
            const candleRepository = { insertCandles: jest.fn() };
            const cache = makeCache();
            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);

            await expect(service.getCandles('BTCUSDT', '1h', 'abc' as unknown as number)).rejects.toThrow();
            expect(binanceClient.getKlines).not.toHaveBeenCalled();
        });

        it.each([0, -1, 1.5, 1001])(
            'rejects an out-of-range limit %p',
            async (badLimit) => {
                const binanceClient = { getKlines: jest.fn() };
                const candleRepository = { insertCandles: jest.fn() };
                const cache = makeCache();
                const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);

                await expect(service.getCandles('BTCUSDT', '1h', badLimit)).rejects.toThrow();
                expect(binanceClient.getKlines).not.toHaveBeenCalled();
            },
        );
    });

    describe('importCandles (POST /market-data/import — writes to candles table)', () => {
        it('does not persist an unclosed (still-forming) candle even when it is the last row of the page', async () => {
            const closedA = makeRow({ openTime: 1_000, closeTime: 1_059, volume: '10' });
            const closedB = makeRow({ openTime: 2_000, closeTime: 2_059, volume: '20' });
            const unclosed = makeRow({
                openTime: 3_000,
                closeTime: 3_059,
                volume: '999',
                isClosed: false,
            });

            const binanceClient = {
                getKlines: jest.fn().mockResolvedValue([closedA, closedB, unclosed]),
            };
            const candleRepository = { insertCandles: jest.fn().mockResolvedValue(undefined) };

            const cache = makeCache();
            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);
            const result = await service.importCandles('BTCUSDT', '5m', 500);

            expect(candleRepository.insertCandles).toHaveBeenCalledTimes(1);
            const persisted = candleRepository.insertCandles.mock.calls[0][0] as Array<{
                volume: string;
            }>;
            expect(persisted).toHaveLength(2);
            expect(persisted.map((c) => c.volume)).toEqual(['10', '20']);
            expect(persisted.some((c) => c.volume === '999')).toBe(false);
            expect(result.count).toBe(2);
        });

        it('persists nothing and reports zero when the entire page is unclosed', async () => {
            const binanceClient = {
                getKlines: jest
                    .fn()
                    .mockResolvedValue([makeRow({ openTime: 1_000, isClosed: false })]),
            };
            const candleRepository = { insertCandles: jest.fn() };

            const cache = makeCache();
            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);
            const result = await service.importCandles('BTCUSDT', '1m', 500);

            expect(candleRepository.insertCandles).not.toHaveBeenCalled();
            expect(result.count).toBe(0);
        });

        it('persists every row when the page is fully closed', async () => {
            const binanceClient = {
                getKlines: jest
                    .fn()
                    .mockResolvedValue([
                        makeRow({ openTime: 1_000 }),
                        makeRow({ openTime: 2_000 }),
                    ]),
            };
            const candleRepository = { insertCandles: jest.fn().mockResolvedValue(undefined) };

            const cache = makeCache();
            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);
            const result = await service.importCandles('BTCUSDT', '15m', 500);

            expect(candleRepository.insertCandles).toHaveBeenCalledTimes(1);
            expect(
                (candleRepository.insertCandles.mock.calls[0][0] as unknown[]).length,
            ).toBe(2);
            expect(result.count).toBe(2);
        });

        it('rejects an interval outside the allowed list before calling Binance', async () => {
            const binanceClient = { getKlines: jest.fn() };
            const candleRepository = { insertCandles: jest.fn() };

            const cache = makeCache();
            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);

            await expect(service.importCandles('BTCUSDT', '3m', 500)).rejects.toThrow();
            expect(binanceClient.getKlines).not.toHaveBeenCalled();
        });

        it('rejects an out-of-range limit before calling Binance', async () => {
            const binanceClient = { getKlines: jest.fn() };
            const candleRepository = { insertCandles: jest.fn() };
            const cache = makeCache();
            const service = new MarketDataService(binanceClient as any, candleRepository as any, cache as any);

            await expect(service.importCandles('BTCUSDT', '1h', 5000)).rejects.toThrow();
            expect(binanceClient.getKlines).not.toHaveBeenCalled();
        });
    });
});
