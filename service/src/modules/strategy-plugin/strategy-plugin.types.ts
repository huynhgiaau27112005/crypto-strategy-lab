import {
  CandidateMember,
  SearchStrategyType,
  StrategyDomain,
} from '../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from '../strategy-engine/strategy.types';

export interface ParameterSpec {
  key: string;
  label: string;
  type: 'int' | 'float';
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface StrategyPlugin {
  readonly type: SearchStrategyType;
  readonly domain: StrategyDomain;
  readonly displayName: string;
  readonly description: string;
  readonly parameterSchema: ParameterSpec[];
  analyze(member: CandidateMember, context: SignalContext): StrategySignal;
}

export interface StrategyCatalogItem {
  type: SearchStrategyType;
  domain: StrategyDomain;
  displayName: string;
  description: string;
  parameterSchema: ParameterSpec[];
  strategyId: string | null;
  version: number | null;
}
