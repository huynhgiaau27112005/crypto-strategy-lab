import { BadRequestException } from '@nestjs/common';
import { RealtimeSignalService } from './realtime-signal.service';
import { StrategyEngineService } from './strategy-engine.service';
import { CompositeStrategyService } from '../composite-strategy/composite-strategy.service';
import { StrategyRegistry } from '../strategy-plugin/strategy-registry';
import { MarketDataService } from '../market-data/market-data.service';
import { MarketCandle } from '../market-data/market-data.service';
import { StrategyPlugin } from '../strategy-plugin/strategy-plugin.types';

function candle(open: string, close: string, timestamp: string): MarketCandle {
  return { timeframe: '5m', timestamp: new Date(timestamp), open, high: open, low: close, close, volume: '1' };
}

/** A downtrend series: price-direction logic would call this SELL. */
function downtrendCandles(): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 200;
  for (let i = 0; i < 25; i += 1) {
    const open = String(price);
    price -= 1;
    const close = String(price);
    candles.push(candle(open, close, `2026-01-01T00:${String(i).padStart(2, '0')}:00.000Z`));
  }
  return candles;
}

function fakePlugin(
  type: StrategyPlugin['type'],
  domain: StrategyPlugin['domain'],
  signal: 'BUY' | 'SELL' | 'HOLD',
): StrategyPlugin {
  return {
    type,
    domain,
    displayName: type,
    description: type,
    parameterSchema: [],
    analyze: () => signal,
  };
}

describe('RealtimeSignalService', () => {
  it('rejects an interval outside the shared allow-list', async () => {
    const registry = { list: () => [] } as unknown as StrategyRegistry;
    const marketData = { getCandles: jest.fn() } as unknown as MarketDataService;
    const strategyEngine = new StrategyEngineService(registry);
    const composite = new CompositeStrategyService(strategyEngine);
    const service = new RealtimeSignalService(marketData, registry, composite);

    await expect(service.getSignal('7m')).rejects.toThrow(BadRequestException);
    expect(marketData.getCandles).not.toHaveBeenCalled();
  });

  it('derives the composite signal from plugin outputs, not from price direction', async () => {
    const plugins = [fakePlugin('MA', 'TREND', 'BUY'), fakePlugin('RSI', 'MOMENTUM', 'BUY')];
    const registry = {
      list: () => plugins,
      get: (type: string) => plugins.find((p) => p.type === type),
      resolve: (type: string) => plugins.find((p) => p.type === type),
    } as unknown as StrategyRegistry;
    const strategyEngine = new StrategyEngineService(registry);
    const composite = new CompositeStrategyService(strategyEngine);

    // Strictly declining price: naive "up = close > first open" logic would
    // say SELL/down. Both plugins are forced to BUY, so the composite
    // result must be BUY — proving the signal comes from the engine, not
    // from the candle trend.
    const candles = downtrendCandles();
    const marketData = {
      getCandles: jest.fn().mockResolvedValue(candles),
    } as unknown as MarketDataService;

    const service = new RealtimeSignalService(marketData, registry, composite);
    const result = await service.getSignal('5m');

    expect(marketData.getCandles).toHaveBeenCalledWith('BTCUSDT', '5m', 300);
    expect(result.signal).toBe('BUY');
    expect(result.perStrategy).toEqual([
      { type: 'MA', signal: 'BUY' },
      { type: 'RSI', signal: 'BUY' },
    ]);
    expect(result.lastClose).toBe(Number(candles[candles.length - 1].close));
    expect(result.changePct).not.toBeNull();
    expect(result.changePct as number).toBeLessThan(0); // price did fall
    expect(result.ma20).not.toBeNull();
  });

  it('combines mixed plugin signals through the same WEIGHTED_VOTE thresholds as search', async () => {
    const plugins = [
      fakePlugin('MA', 'TREND', 'SELL'),
      fakePlugin('RSI', 'MOMENTUM', 'HOLD'),
    ];
    const registry = {
      list: () => plugins,
      get: (type: string) => plugins.find((p) => p.type === type),
      resolve: (type: string) => plugins.find((p) => p.type === type),
    } as unknown as StrategyRegistry;
    const strategyEngine = new StrategyEngineService(registry);
    const composite = new CompositeStrategyService(strategyEngine);
    const candles = downtrendCandles();
    const marketData = {
      getCandles: jest.fn().mockResolvedValue(candles),
    } as unknown as MarketDataService;

    const service = new RealtimeSignalService(marketData, registry, composite);
    const result = await service.getSignal('1h');

    // score = -1 * 0.5 + 0 * 0.5 = -0.5 < sellThreshold(-0.3) => SELL
    expect(result.signal).toBe('SELL');
  });

  it('returns a neutral placeholder when the market has no candles yet', async () => {
    const registry = { list: () => [] } as unknown as StrategyRegistry;
    const strategyEngine = new StrategyEngineService(registry);
    const composite = new CompositeStrategyService(strategyEngine);
    const marketData = {
      getCandles: jest.fn().mockResolvedValue([]),
    } as unknown as MarketDataService;

    const service = new RealtimeSignalService(marketData, registry, composite);
    const result = await service.getSignal('1m');

    expect(result).toEqual({
      interval: '1m',
      signal: 'HOLD',
      perStrategy: [],
      ma20: null,
      lastClose: 0,
      changePct: null,
    });
  });
});
