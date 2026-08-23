import { CandleEntity } from '../../database/types';
import { CompositeStrategyService } from '../composite-strategy/composite-strategy.service';
import { StrategyEngineService } from '../strategy-engine/strategy-engine.service';
import { CandidateDefinition } from '../strategy-search/domain/search.types';
import { BacktestingService } from './backtesting.service';

describe('BacktestingService', () => {
  const service = new BacktestingService(
    new CompositeStrategyService(new StrategyEngineService()),
  );

  it('produces a finite evaluation and reproducible trades', () => {
    const candles = makeCandles(260);
    const candidate: CandidateDefinition = {
      schemaVersion: 1,
      combination: {
        method: 'WEIGHTED_VOTE',
        buyThreshold: 0.3,
        sellThreshold: -0.3,
      },
      members: [
        {
          type: 'RSI',
          domain: 'MOMENTUM',
          pluginVersion: 1,
          parameters: { period: 14, buyThreshold: 35, sellThreshold: 65 },
        },
        {
          type: 'SUPPORT_RESISTANCE',
          domain: 'STRUCTURE',
          pluginVersion: 1,
          parameters: { lookback: 20, proximityPercent: 1.5 },
        },
      ],
    };
    const weights = { RSI: 0.5, SUPPORT_RESISTANCE: 0.5 };
    const first = service.run(candidate, candles, weights);
    const second = service.run(candidate, candles, weights);
    expect(first).toEqual(second);
    expect(Number.isFinite(first.evaluation.totalReturn)).toBe(true);
    expect(Number.isFinite(first.evaluation.overallScore)).toBe(true);
    expect(first.evaluation.numberOfTrades).toBe(first.trades.length);
  });
});

function makeCandles(count: number): CandleEntity[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 7) * 12 + index * 0.03;
    return {
      timeframe: '5m',
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, index * 5)),
      open: String(close - 0.2),
      high: String(close + 1),
      low: String(close - 1),
      close: String(close),
      volume: '10',
    };
  });
}
