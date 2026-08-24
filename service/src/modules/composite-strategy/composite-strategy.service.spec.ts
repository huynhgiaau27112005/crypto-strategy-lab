import { CompositeStrategyService } from './composite-strategy.service';
import {
  CandidateDefinition,
  CandidateMember,
} from '../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from '../strategy-engine/strategy.types';

function member(type: CandidateMember['type']): CandidateMember {
  const domain =
    type === 'MA'
      ? 'TREND'
      : type === 'RSI'
        ? 'MOMENTUM'
        : type === 'BOLLINGER'
          ? 'VOLATILITY'
          : 'STRUCTURE';
  return { type, domain, pluginVersion: 1, parameters: {} };
}

function candidateWith(
  members: CandidateMember[],
  buyThreshold = 0.3,
  sellThreshold = -0.3,
): CandidateDefinition {
  return {
    schemaVersion: 1,
    combination: { method: 'WEIGHTED_VOTE', buyThreshold, sellThreshold },
    members,
  };
}

const context: SignalContext = { candles: [], index: 0 };

describe('CompositeStrategyService', () => {
  // Every test drives a fake StrategyEngineService that returns a signal
  // purely based on member.type, so the composite math under test is fully
  // isolated from any real indicator logic.
  function buildService(signalsByType: Record<string, StrategySignal>) {
    const strategyEngine = {
      analyze: jest.fn(
        (member: CandidateMember): StrategySignal => signalsByType[member.type],
      ),
    };
    const service = new CompositeStrategyService(strategyEngine as any);
    return { service, strategyEngine };
  }

  it('computes a weighted AVERAGE (divides by Σ weights), not a weighted sum, when weights already sum to 1', () => {
    const { service } = buildService({ MA: 'BUY', RSI: 'BUY' });
    const candidate = candidateWith([member('MA'), member('RSI')]);

    const result = service.analyze(candidate, context, { MA: 0.5, RSI: 0.5 });

    // (0.5*1 + 0.5*1) / (0.5+0.5) = 1
    expect(result.score).toBeCloseTo(1);
    expect(result.signal).toBe('BUY');
  });

  it('keeps the score inside [-1, 1] when weights sum to something other than 1', () => {
    const { service } = buildService({ MA: 'BUY', RSI: 'SELL' });
    const candidate = candidateWith([member('MA'), member('RSI')]);

    // Weights sum to 1.15 — the exact shape of the reported bug
    // (0.25/0.25/0.20/0.45-style non-1 sum).
    const result = service.analyze(candidate, context, { MA: 0.7, RSI: 0.45 });

    expect(result.score).toBeGreaterThanOrEqual(-1);
    expect(result.score).toBeLessThanOrEqual(1);
    // (0.7*1 + 0.45*-1) / 1.15
    expect(result.score).toBeCloseTo((0.7 - 0.45) / 1.15);
  });

  it('produces the same score for two weight sets that are proportional to each other', () => {
    const { service } = buildService({
      MA: 'BUY',
      RSI: 'SELL',
      BOLLINGER: 'HOLD',
      SUPPORT_RESISTANCE: 'BUY',
    });
    const candidate = candidateWith([
      member('MA'),
      member('RSI'),
      member('BOLLINGER'),
      member('SUPPORT_RESISTANCE'),
    ]);

    const unit = service.analyze(candidate, context, {
      MA: 1,
      RSI: 1,
      BOLLINGER: 1,
      SUPPORT_RESISTANCE: 1,
    });
    const quarter = service.analyze(candidate, context, {
      MA: 0.25,
      RSI: 0.25,
      BOLLINGER: 0.25,
      SUPPORT_RESISTANCE: 0.25,
    });

    expect(quarter.score).toBeCloseTo(unit.score);
  });

  it('counts a HOLD member in the denominator, dragging the score toward zero like a genuine abstention', () => {
    const { service } = buildService({ MA: 'BUY', RSI: 'HOLD' });
    const candidate = candidateWith([member('MA'), member('RSI')]);

    const result = service.analyze(candidate, context, { MA: 1, RSI: 1 });

    // (1*1 + 1*0) / (1+1) = 0.5, not 1 — RSI's weight still counts even
    // though it contributed 0 to the numerator.
    expect(result.score).toBeCloseTo(0.5);
  });

  it('returns score 0 and signal HOLD (never NaN) when all weights are zero', () => {
    const { service } = buildService({ MA: 'BUY', RSI: 'SELL' });
    const candidate = candidateWith([member('MA'), member('RSI')]);

    const result = service.analyze(candidate, context, { MA: 0, RSI: 0 });

    expect(result.score).toBe(0);
    expect(Number.isNaN(result.score)).toBe(false);
    expect(result.signal).toBe('HOLD');
  });

  it('returns score 0 and signal HOLD (never NaN) when no weights are supplied at all', () => {
    const { service } = buildService({ MA: 'BUY', RSI: 'SELL' });
    const candidate = candidateWith([member('MA'), member('RSI')]);

    const result = service.analyze(candidate, context, {});

    expect(result.score).toBe(0);
    expect(Number.isNaN(result.score)).toBe(false);
    expect(result.signal).toBe('HOLD');
  });
});
