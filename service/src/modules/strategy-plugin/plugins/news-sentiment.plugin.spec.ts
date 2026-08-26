import { NewsSentimentPlugin } from './news-sentiment.plugin';
import { CandidateMember } from '../../strategy-search/domain/search.types';
import { SignalContext } from '../../strategy-engine/strategy.types';

describe('NewsSentimentPlugin', () => {
  const plugin = new NewsSentimentPlugin();

  const member: CandidateMember = {
    type: 'NEWS_SENTIMENT',
    domain: 'INFORMATION',
    pluginVersion: 1,
    parameters: { lookbackHours: 24, buyThreshold: 0.3, sellThreshold: -0.3 },
  };

  function contextWith(scores: Array<number | null> | undefined, index: number): SignalContext {
    return { candles: [], index, sentimentScores: scores };
  }

  it('is registered in the INFORMATION domain the brief groups News Sentiment under', () => {
    expect(plugin.domain).toBe('INFORMATION');
    expect(plugin.type).toBe('NEWS_SENTIMENT');
  });

  it('returns BUY once the windowed sentiment reaches buyThreshold', () => {
    expect(plugin.analyze(member, contextWith([0.3], 0))).toBe('BUY');
    expect(plugin.analyze(member, contextWith([0.9], 0))).toBe('BUY');
  });

  it('returns SELL once the windowed sentiment reaches sellThreshold', () => {
    expect(plugin.analyze(member, contextWith([-0.3], 0))).toBe('SELL');
    expect(plugin.analyze(member, contextWith([-0.85], 0))).toBe('SELL');
  });

  it('returns HOLD strictly between the thresholds', () => {
    expect(plugin.analyze(member, contextWith([0.29], 0))).toBe('HOLD');
    expect(plugin.analyze(member, contextWith([0], 0))).toBe('HOLD');
    expect(plugin.analyze(member, contextWith([-0.29], 0))).toBe('HOLD');
  });

  // The distinction that matters: "no article in this window" is not the
  // same fact as "articles averaging out to neutral". Voting 0 for missing
  // coverage would let a silent data gap look like a confident neutral
  // reading in the weighted formula.
  it('abstains (HOLD) when the window has no news at all, rather than treating it as neutral', () => {
    expect(plugin.analyze(member, contextWith([null], 0))).toBe('HOLD');
  });

  it('abstains when no sentiment series was precomputed for this run', () => {
    expect(plugin.analyze(member, contextWith(undefined, 0))).toBe('HOLD');
    expect(plugin.analyze(member, { candles: [], index: 0 })).toBe('HOLD');
  });

  it('reads the score at its own candle index, not the latest one', () => {
    const scores = [0.9, -0.9, 0];
    expect(plugin.analyze(member, contextWith(scores, 0))).toBe('BUY');
    expect(plugin.analyze(member, contextWith(scores, 1))).toBe('SELL');
    expect(plugin.analyze(member, contextWith(scores, 2))).toBe('HOLD');
  });

  it('honours per-candidate thresholds so Search can explore them', () => {
    const strict: CandidateMember = {
      ...member,
      parameters: { lookbackHours: 24, buyThreshold: 0.8, sellThreshold: -0.8 },
    };
    // 0.5 clears the default 0.3 gate but not this candidate's 0.8 gate.
    expect(plugin.analyze(member, contextWith([0.5], 0))).toBe('BUY');
    expect(plugin.analyze(strict, contextWith([0.5], 0))).toBe('HOLD');
  });
});
