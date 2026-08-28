import {
  BacktestCosts,
  DEFAULT_BACKTEST_COSTS,
} from '../../backtesting/backtesting.types';

// INFORMATION is the "Information (News Sentiment)" group the brief lists
// alongside Trend/Momentum/Volatility/Structure
// (docs/about-projects/04-examples-in-the-brief.md #17). It is deliberately
// NEITHER directional nor confirmation in the generator's sense: a
// composite still needs one directional + one confirmation domain, and a
// sentiment member can only ever join as a supplementary voice — which is
// exactly what required-flow #17 describes ("Sentiment combinations
// participate in the same composite, backtest, evaluation, and ranking
// lifecycle").
export type StrategyDomain =
  | 'TREND'
  | 'MOMENTUM'
  | 'VOLATILITY'
  | 'STRUCTURE'
  | 'INFORMATION';

export type BuiltInStrategyType =
  | 'MA'
  | 'RSI'
  | 'BOLLINGER'
  | 'SUPPORT_RESISTANCE'
  | 'NEWS_SENTIMENT';

// An AI-generated strategy is identified by the `AI:<strategyId>` namespace
// instead of a fixed literal — it is a per-user row in `strategies`
// (type = AI_GENERATED), not a plugin known at boot time. `strategyId` is
// the exact `strategies.id` whose `source_code` produced the signals, so a
// candidate that includes an AI member always pins the exact immutable
// version that ran (see artifacts/ai-strategy.md "Reproducibility").
export type SearchStrategyType = BuiltInStrategyType | `AI:${string}`;

const AI_TYPE_PREFIX = 'AI:';

export function isAiStrategyType(type: string): type is `AI:${string}` {
  return type.startsWith(AI_TYPE_PREFIX);
}

export function aiStrategyType(strategyId: string): SearchStrategyType {
  return `${AI_TYPE_PREFIX}${strategyId}` as SearchStrategyType;
}

export function aiStrategyIdFromType(type: SearchStrategyType): string {
  if (!isAiStrategyType(type)) {
    throw new Error(`"${type}" is not an AI strategy type.`);
  }
  return type.slice(AI_TYPE_PREFIX.length);
}

// Reverse of the built-in catalog's fixed domain assignment (see
// catalog/strategy-catalog.ts) — used to resolve a SYSTEM strategy row's
// domain from its name without re-deriving it from STRATEGY_CATALOG (whose
// job is sampling parameters, not domain lookup).
export const BUILTIN_DOMAIN_BY_NAME: Record<BuiltInStrategyType, StrategyDomain> = {
  MA: 'TREND',
  RSI: 'MOMENTUM',
  BOLLINGER: 'VOLATILITY',
  SUPPORT_RESISTANCE: 'STRUCTURE',
  NEWS_SENTIMENT: 'INFORMATION',
};

const VALID_DOMAINS: readonly StrategyDomain[] = [
  'TREND',
  'MOMENTUM',
  'VOLATILITY',
  'STRUCTURE',
  'INFORMATION',
];

// Resolves the StrategyDomain for one `strategies` row, built-in or AI.
// A built-in's domain comes from its fixed name; an AI strategy's domain
// is whatever the user picked when saving it (stored in the existing
// `parameters` jsonb column as `{ domain }` — see artifacts/ai-strategy.md
// "Domain assignment": asked at save time, never silently defaulted).
// Throws for an AI row saved before domain selection existed (no
// migration needed to backfill — callers that can tolerate skipping such
// a row should catch this and omit it rather than fail outright).
export function strategyRowDomain(row: {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
}): StrategyDomain {
  if (row.type === 'AI_GENERATED') {
    const domain = row.parameters?.domain;
    if (typeof domain === 'string' && (VALID_DOMAINS as string[]).includes(domain)) {
      return domain as StrategyDomain;
    }
    throw new Error(
      `AI strategy "${row.name}" has no valid domain recorded and cannot be used in search.`,
    );
  }
  const domain = BUILTIN_DOMAIN_BY_NAME[row.name as BuiltInStrategyType];
  if (!domain) {
    throw new Error(`Unknown built-in strategy name "${row.name}".`);
  }
  return domain;
}

// Resolves the SearchStrategyType key used throughout candidate members,
// weight maps, and the generator's per-run catalog: a built-in's own name
// (e.g. "MA", matching strategies.name for SYSTEM rows) or "AI:<id>" for an
// AI_GENERATED row.
export function strategyTypeKey(row: {
  id: string;
  name: string;
  type: string;
}): SearchStrategyType {
  return row.type === 'AI_GENERATED'
    ? aiStrategyType(row.id)
    : (row.name as SearchStrategyType);
}

export interface CandidateMember {
  type: SearchStrategyType;
  domain: StrategyDomain;
  pluginVersion: number;
  /**
   * The exact `strategies` row this member's parameters came from.
   *
   * Present for every member the search generates, because a member's
   * parameters are now always ONE version's stored parameters rather than
   * a fresh random draw (artifacts/decisions.md §11). Carrying the row id
   * on the member is what lets `run()` persist
   * `candidate_strategies.strategy_id` pointing at that same version, so
   * "which version" and "which parameters" can never drift apart.
   * Optional only for hand-built members in older tests.
   */
  strategyId?: string;
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
  /**
   * Trading frictions and protective exits every candidate in this
   * experiment is backtested with. Part of the search config (not a
   * per-candidate value) because comparing candidates only means anything
   * when they all paid the same costs.
   */
  costs: BacktestCosts;
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
  /** Starting equity in USD. Defaults to DEFAULT_BACKTEST_COSTS.initialCapital. */
  initialCapital?: number;
  /** Commission per side in percent of notional. */
  transactionCostPct?: number;
  /** Execution slippage per side in basis points. */
  slippageBps?: number;
  /** Stop-loss distance below entry in percent; omitted/null disables it. */
  stopLossPct?: number | null;
  /** Take-profit distance above entry in percent; omitted/null disables it. */
  takeProfitPct?: number | null;
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
  costs: DEFAULT_BACKTEST_COSTS,
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
