import { CandleEntity } from '../../database/types';
import {
  CompositeStrategyService,
  StrategyWeightMap,
} from '../composite-strategy/composite-strategy.service';
import { CandidateDefinition } from '../strategy-search/domain/search.types';
import { StrategySignal } from '../strategy-engine/strategy.types';
import { BacktestingService } from './backtesting.service';
import { BacktestCosts, DEFAULT_BACKTEST_COSTS } from './backtesting.types';

/**
 * A stub composite that replays a fixed BUY/SELL/HOLD script, so these
 * tests exercise the cost model and the protective exits directly instead
 * of depending on what real indicators happen to emit.
 */
function scriptedComposite(signals: StrategySignal[]): CompositeStrategyService {
  return {
    analyze: (
      _candidate: CandidateDefinition,
      context: { index: number },
      _weights: StrategyWeightMap,
    ) => ({ signal: signals[context.index] ?? 'HOLD' }),
  } as unknown as CompositeStrategyService;
}

const CANDIDATE: CandidateDefinition = {
  schemaVersion: 1,
  combination: { method: 'WEIGHTED_VOTE', buyThreshold: 0.3, sellThreshold: -0.3 },
  members: [],
};

function candle(
  index: number,
  { open, high, low, close }: { open: number; high: number; low: number; close: number },
): CandleEntity {
  return {
    timeframe: '5m',
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, index * 5)),
    open: String(open),
    high: String(high),
    low: String(low),
    close: String(close),
    volume: '10',
  } as CandleEntity;
}

function costs(overrides: Partial<BacktestCosts> = {}): BacktestCosts {
  return { ...DEFAULT_BACKTEST_COSTS, ...overrides };
}

describe('BacktestingService — configurable costs and protective exits', () => {
  // Flat prices: BUY on bar 0, SELL on bar 2. Without frictions this is a
  // break-even round trip, so anything left over IS the modelled cost.
  const flatCandles = [
    candle(0, { open: 100, high: 100, low: 100, close: 100 }),
    candle(1, { open: 100, high: 100, low: 100, close: 100 }),
    candle(2, { open: 100, high: 100, low: 100, close: 100 }),
  ];
  const flatScript: StrategySignal[] = ['BUY', 'HOLD', 'SELL'];

  it('respects the configured starting capital', () => {
    const service = new BacktestingService(scriptedComposite(flatScript));
    const result = service.run(
      CANDIDATE,
      flatCandles,
      {},
      undefined,
      undefined,
      costs({ initialCapital: 2_500 }),
    );

    // 2500 of capital, no fee/slippage, entry at 100 -> 25 units.
    expect(result.trades[0].quantity).toBeCloseTo(25, 8);
    expect(result.evaluation.profitLoss).toBeCloseTo(0, 8);
    expect(result.evaluation.totalReturn).toBeCloseTo(0, 8);
  });

  it('charges commission on both sides of a break-even round trip', () => {
    const service = new BacktestingService(scriptedComposite(flatScript));
    const result = service.run(
      CANDIDATE,
      flatCandles,
      {},
      undefined,
      undefined,
      costs({ initialCapital: 1_000, transactionCostPct: 0.1 }),
    );

    // notional = 1000 / 1.001 ≈ 999.001; fees = 0.1% entry + 0.1% exit.
    const notional = 1_000 / 1.001;
    const expected = -(notional * 0.001 + notional * 0.001);
    expect(result.evaluation.profitLoss).toBeCloseTo(expected, 6);
    expect(result.evaluation.profitLoss).toBeLessThan(0);
  });

  it('fills the buy above and the sell below the reference price (slippage)', () => {
    const service = new BacktestingService(scriptedComposite(flatScript));
    const result = service.run(
      CANDIDATE,
      flatCandles,
      {},
      undefined,
      undefined,
      costs({ initialCapital: 1_000, slippageBps: 10 }),
    );

    const trade = result.trades[0];
    expect(trade.entryPrice).toBeCloseTo(100 * 1.001, 8);
    expect(trade.exitPrice).toBeCloseTo(100 * 0.999, 8);
    expect(trade.profitLoss).toBeLessThan(0);
  });

  it('exits at the stop-loss level on the candle that touches it, not at its close', () => {
    // Bar 1 dips to 90 intrabar but closes back at 100 — a close-only
    // check would miss the stop entirely.
    const candles = [
      candle(0, { open: 100, high: 100, low: 100, close: 100 }),
      candle(1, { open: 100, high: 101, low: 90, close: 100 }),
      candle(2, { open: 100, high: 100, low: 100, close: 100 }),
    ];
    const service = new BacktestingService(scriptedComposite(['BUY', 'HOLD', 'HOLD']));
    const result = service.run(
      CANDIDATE,
      candles,
      {},
      undefined,
      undefined,
      costs({ initialCapital: 1_000, stopLossPct: 5 }),
    );

    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.exitReason).toBe('STOP_LOSS');
    expect(trade.stopLoss).toBeCloseTo(95, 8);
    expect(trade.exitPrice).toBeCloseTo(95, 8);
    expect(trade.profitLoss).toBeLessThan(0);
  });

  it('exits at the take-profit level when price runs through it', () => {
    const candles = [
      candle(0, { open: 100, high: 100, low: 100, close: 100 }),
      candle(1, { open: 100, high: 120, low: 99, close: 101 }),
      candle(2, { open: 101, high: 101, low: 101, close: 101 }),
    ];
    const service = new BacktestingService(scriptedComposite(['BUY', 'HOLD', 'HOLD']));
    const result = service.run(
      CANDIDATE,
      candles,
      {},
      undefined,
      undefined,
      costs({ initialCapital: 1_000, takeProfitPct: 10 }),
    );

    const trade = result.trades[0];
    expect(trade.exitReason).toBe('TAKE_PROFIT');
    expect(trade.takeProfit).toBeCloseTo(110, 8);
    expect(trade.exitPrice).toBeCloseTo(110, 8);
    expect(trade.profitLoss).toBeGreaterThan(0);
  });

  it('prefers the stop-loss when one candle touches both levels', () => {
    const candles = [
      candle(0, { open: 100, high: 100, low: 100, close: 100 }),
      candle(1, { open: 100, high: 130, low: 80, close: 100 }),
      candle(2, { open: 100, high: 100, low: 100, close: 100 }),
    ];
    const service = new BacktestingService(scriptedComposite(['BUY', 'HOLD', 'HOLD']));
    const result = service.run(
      CANDIDATE,
      candles,
      {},
      undefined,
      undefined,
      costs({ initialCapital: 1_000, stopLossPct: 5, takeProfitPct: 10 }),
    );

    expect(result.trades[0].exitReason).toBe('STOP_LOSS');
  });

  it('records null stop-loss/take-profit when neither is configured', () => {
    const service = new BacktestingService(scriptedComposite(flatScript));
    const result = service.run(CANDIDATE, flatCandles, {});

    expect(result.trades[0].stopLoss).toBeNull();
    expect(result.trades[0].takeProfit).toBeNull();
    expect(result.trades[0].exitReason).toBe('SIGNAL');
  });

  it('opens a SHORT on SELL and closes it profitably on BUY after price falls', () => {
    const candles = [
      candle(0, { open: 100, high: 100, low: 100, close: 100 }),
      candle(1, { open: 90, high: 90, low: 90, close: 90 }),
      candle(2, { open: 80, high: 80, low: 80, close: 80 }),
    ];
    const service = new BacktestingService(
      scriptedComposite(['SELL', 'HOLD', 'BUY']),
    );
    const result = service.run(
      CANDIDATE,
      candles,
      {},
      undefined,
      undefined,
      costs({ initialCapital: 1_000 }),
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].side).toBe('SHORT');
    expect(result.trades[0].entryPrice).toBeCloseTo(100, 8);
    expect(result.trades[0].exitPrice).toBeCloseTo(80, 8);
    expect(result.trades[0].profitLoss).toBeCloseTo(200, 8);
    expect(result.evaluation.profitLoss).toBeCloseTo(200, 8);
  });

  it('mirrors slippage, fees, stop-loss and take-profit for SHORT positions', () => {
    const candles = [
      candle(0, { open: 100, high: 100, low: 100, close: 100 }),
      candle(1, { open: 100, high: 106, low: 89, close: 100 }),
      candle(2, { open: 100, high: 100, low: 100, close: 100 }),
    ];
    const service = new BacktestingService(
      scriptedComposite(['SELL', 'HOLD', 'HOLD']),
    );
    const result = service.run(
      CANDIDATE,
      candles,
      {},
      undefined,
      undefined,
      costs({
        initialCapital: 1_000,
        transactionCostPct: 0.1,
        slippageBps: 10,
        stopLossPct: 5,
        takeProfitPct: 10,
      }),
    );

    const trade = result.trades[0];
    expect(trade.side).toBe('SHORT');
    expect(trade.entryPrice).toBeCloseTo(100 * 0.999, 8);
    expect(trade.stopLoss).toBeCloseTo(trade.entryPrice * 1.05, 8);
    expect(trade.takeProfit).toBeCloseTo(trade.entryPrice * 0.9, 8);
    // Both levels are touched, so the conservative stop-first rule applies.
    expect(trade.exitReason).toBe('STOP_LOSS');
    expect(trade.exitPrice).toBeCloseTo((trade.stopLoss as number) * 1.001, 8);
    expect(trade.profitLoss).toBeLessThan(0);
  });
});
