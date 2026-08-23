import { CandleEntity } from '../../database/types';
import {
  CandidateDefinition,
  CandidateMember,
} from '../strategy-search/domain/search.types';

export type StrategySignal = 'BUY' | 'SELL' | 'HOLD';

export interface SignalContext {
  candles: CandleEntity[];
  index: number;
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
