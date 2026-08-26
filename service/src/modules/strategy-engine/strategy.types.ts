import { CandleEntity } from '../../database/types';
import {
  CandidateDefinition,
  CandidateMember,
  SearchStrategyType,
} from '../strategy-search/domain/search.types';

export type StrategySignal = 'BUY' | 'SELL' | 'HOLD';

export interface SignalContext {
  candles: CandleEntity[];
  index: number;
  // Precomputed whole-series signals for any AI-generated members in the
  // current candidate, keyed by "AI:<strategyId>". Populated ONCE per
  // backtest run (not per candidate, not per candle) by
  // AiStrategySignalPrecomputeService before the per-candle loop starts —
  // see AiStrategyPluginAdapter.analyze() and
  // artifacts/ai-strategy.md "Per-candle vs whole-series". Absent for
  // contexts that never involve an AI member (e.g. the live realtime
  // signal, which only evaluates built-in plugins).
  aiSignals?: Map<SearchStrategyType, StrategySignal[]>;
  /**
   * Signed aggregate news sentiment aligned 1:1 with `candles`, precomputed
   * ONCE per run by NewsSentimentPrecomputeService (same amortization point
   * as `aiSignals`: the whole series shares one DB read instead of one
   * query per candle per candidate).
   *
   * `null` at an index means "no news in this candle's lookback window" —
   * NOT "neutral". NewsSentimentPlugin returns HOLD for those rather than
   * inventing a 0.0 reading, so a period with no coverage abstains instead
   * of voting. Absent entirely for contexts with no sentiment member.
   */
  sentimentScores?: Array<number | null>;
}

export interface CompositeSignalResult {
  signal: StrategySignal;
  score: number;
  memberSignals: Array<{
    member: CandidateMember;
    signal: StrategySignal;
  }>;
  candidate: CandidateDefinition;
}
