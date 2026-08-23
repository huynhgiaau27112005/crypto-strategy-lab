export type StrategyDomain = 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'STRUCTURE';

export type SearchStrategyType =
  'MA' | 'RSI' | 'BOLLINGER' | 'SUPPORT_RESISTANCE';

export interface CandidateMember {
  type: SearchStrategyType;
  domain: StrategyDomain;
  pluginVersion: number;
  parameters: Record<string, number>;
  weight: number;
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
