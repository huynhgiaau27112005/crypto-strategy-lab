import { MarketDataService } from './market-data.service';

function makeCache() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  };
}

function kline(openTime: number, closed = true) {
  return {
    openTime,
    open: '100',
    high: '101',
    low: '99',
    close: '100',
    volume: '1',
    closeTime: openTime + 59_999,
    isClosed: closed,
  };
}

const START = new Date('2026-08-01T00:00:00.000Z');
const END = new Date('2026-08-02T00:00:00.000Z');

describe('MarketDataService.ensureCandleCoverage', () => {
  it('does nothing when the window already holds enough candles', async () => {
    const binanceClient = { getKlines: jest.fn() };
    const candleRepository = {
      countInWindow: jest.fn().mockResolvedValue(400),
      insertCandles: jest.fn(),
    };
    const service = new MarketDataService(
      binanceClient as never,
      candleRepository as never,
      makeCache() as never,
    );

    const result = await service.ensureCandleCoverage('BTCUSDT', '1m', START, END, 300);

    expect(binanceClient.getKlines).not.toHaveBeenCalled();
    expect(candleRepository.insertCandles).not.toHaveBeenCalled();
    expect(result).toEqual({ interval: '1m', before: 400, after: 400, fetched: 0 });
  });

  it('backfills from Binance when the window is short, persisting only closed candles', async () => {
    // One short page ends the walk immediately (fewer rows than the page
    // size means Binance has nothing more for this window).
    const rows = [kline(START.getTime()), kline(START.getTime() + 60_000, false)];
    const binanceClient = { getKlines: jest.fn().mockResolvedValue(rows) };
    const candleRepository = {
      countInWindow: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(301),
      insertCandles: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MarketDataService(
      binanceClient as never,
      candleRepository as never,
      makeCache() as never,
    );

    const result = await service.ensureCandleCoverage('BTCUSDT', '1m', START, END, 300);

    expect(binanceClient.getKlines).toHaveBeenCalledWith(
      'BTCUSDT',
      '1m',
      1000,
      END.getTime(),
      START.getTime(),
    );
    // The still-forming candle is fetched but never written.
    expect(candleRepository.insertCandles).toHaveBeenCalledWith([
      expect.objectContaining({ timeframe: '1m' }),
    ]);
    expect(candleRepository.insertCandles.mock.calls[0][0]).toHaveLength(1);
    expect(result.before).toBe(2);
    expect(result.after).toBe(301);
    expect(result.fetched).toBe(1);
  });

  it('stops instead of looping when Binance returns nothing for the window', async () => {
    const binanceClient = { getKlines: jest.fn().mockResolvedValue([]) };
    const candleRepository = {
      countInWindow: jest.fn().mockResolvedValue(0),
      insertCandles: jest.fn(),
    };
    const service = new MarketDataService(
      binanceClient as never,
      candleRepository as never,
      makeCache() as never,
    );

    const result = await service.ensureCandleCoverage('BTCUSDT', '4h', START, END, 300);

    expect(binanceClient.getKlines).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(0);
  });

  it('rejects an interval the project does not support', async () => {
    const service = new MarketDataService(
      { getKlines: jest.fn() } as never,
      { countInWindow: jest.fn(), insertCandles: jest.fn() } as never,
      makeCache() as never,
    );

    await expect(
      service.ensureCandleCoverage('BTCUSDT', '3d', START, END, 300),
    ).rejects.toThrow(/Unsupported interval/);
  });
});
