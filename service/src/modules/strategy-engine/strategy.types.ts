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
