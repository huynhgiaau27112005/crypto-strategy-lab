import { BinanceKline } from '../modules/market-data/clients/binance.client';
import { backfillInterval } from './seed-candles';

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

describe('backfillInterval', () => {
    it('does not persist an unclosed (still-forming) candle even when it is the last row of the page', async () => {
        // Mirrors the real corruption: the most recent page's last element
        // is the candle still forming on Binance right now.
        const closedA = makeRow({ openTime: 1_000, closeTime: 1_059, volume: '10' });
        const closedB = makeRow({ openTime: 2_000, closeTime: 2_059, volume: '20' });
        const unclosed = makeRow({
            openTime: 3_000,
            closeTime: 3_059,
            volume: '999', // would be an obviously-wrong partial volume if persisted
            isClosed: false,
        });

        const binanceClient = {
            getKlines: jest.fn().mockResolvedValue([closedA, closedB, unclosed]),
        };
        const candleRepository = {
            insertCandles: jest.fn().mockResolvedValue(undefined),
        };

        const total = await backfillInterval(
            binanceClient as any,
            candleRepository as any,
            '5m',
            10,
        );

        expect(candleRepository.insertCandles).toHaveBeenCalledTimes(1);
        const persisted = candleRepository.insertCandles.mock.calls[0][0] as Array<{
            volume: string;
        }>;
        expect(persisted).toHaveLength(2);
        expect(persisted.map((c) => c.volume)).toEqual(['10', '20']);
        expect(persisted.some((c) => c.volume === '999')).toBe(false);
        expect(total).toBe(2);
    });

    it('persists nothing and reports zero when the entire page is unclosed', async () => {
        const binanceClient = {
            getKlines: jest
                .fn()
                .mockResolvedValue([makeRow({ openTime: 1_000, isClosed: false })]),
        };
        const candleRepository = {
            insertCandles: jest.fn(),
        };

        const total = await backfillInterval(
            binanceClient as any,
            candleRepository as any,
            '1m',
            10,
        );

        expect(candleRepository.insertCandles).not.toHaveBeenCalled();
        expect(total).toBe(0);
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
        const candleRepository = {
            insertCandles: jest.fn().mockResolvedValue(undefined),
        };

        const total = await backfillInterval(
            binanceClient as any,
            candleRepository as any,
            '15m',
            10,
        );

        expect(candleRepository.insertCandles).toHaveBeenCalledTimes(1);
        expect(
            (candleRepository.insertCandles.mock.calls[0][0] as unknown[]).length,
        ).toBe(2);
        expect(total).toBe(2);
    });
});
