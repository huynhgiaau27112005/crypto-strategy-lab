export type StrategyDomain = 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'STRUCTURE';

export type SearchStrategyType =
  'MA' | 'RSI' | 'BOLLINGER' | 'SUPPORT_RESISTANCE';

export interface CandidateMember {
  type: SearchStrategyType;
  domain: StrategyDomain;
  pluginVersion: number;
  parameters: Record<string, number>;
}

export interface CandidateDefinition {
  schemaVersion: 1;
  combination: {
    method: 'WEIGHTED_VOTE';
    buyThreshold: number;
    sellThreshold: number;
  };
  members: CandidateMember[];
}

export interface StrategyWeight {
  type: SearchStrategyType;
  weight: number;
}

export interface SearchConfig {
  enabledDomains: StrategyDomain[];
  minMembers: number;
  maxMembers: number;
  maxCandidates: number;
  maxDurationSeconds: number;
  maxNoImprovement: number;
  topK: number;
  minimumTrades: number;
  parameterSpaceVersion: 1;
}

export interface StartSearchRequest {
  timeframe: string;
  startTime: string;
  endTime: string;
  maxCandidates?: number;
  maxDurationSeconds?: number;
  maxNoImprovement?: number;
  topK?: number;
  minimumTrades?: number;
  randomSeed?: number;
  enabledDomains?: StrategyDomain[];
  strategyWeights?: StrategyWeight[];
}

export interface SearchAlgorithm {
  generate(random: () => number, config: SearchConfig): CandidateDefinition;
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  enabledDomains: ['TREND', 'MOMENTUM', 'VOLATILITY', 'STRUCTURE'],
  minMembers: 2,
  maxMembers: 4,
  maxCandidates: 100,
  maxDurationSeconds: 3600,
  maxNoImprovement: 50,
  topK: 10,
  minimumTrades: 20,
  parameterSpaceVersion: 1,
};

// Equal-weight default when the caller does not specify strategyWeights,
// applied per artifacts/decisions.md §4b (weight is fixed per Experiment
// Configuration, not randomized per candidate).
export function defaultEqualWeights(
  types: SearchStrategyType[],
): StrategyWeight[] {
  const weight = Number((1 / types.length).toFixed(6));
  return types.map((type, index) => ({
    type,
    weight:
      index === types.length - 1
        ? Number((1 - weight * (types.length - 1)).toFixed(6))
        : weight,
  }));
}
