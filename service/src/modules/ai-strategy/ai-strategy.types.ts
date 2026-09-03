export type Signal = 'BUY' | 'SELL' | 'HOLD';

// Mirrors strategy-search/domain/search.types.ts's StrategyDomain exactly
// (a fixed set of 4 values, unlikely to ever change). Duplicated as a
// plain type here rather than importing across modules, so ai-strategy
// stays independent of strategy-search — a saved AI strategy's domain is
// meaningful (and validated) on its own, whether or not the search module
// is even wired up. See AiStrategyRepository.createVersion and
// artifacts/ai-strategy.md "Domain assignment".
export type AiStrategyDomain = 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'STRUCTURE';

export interface ValidationCheck {
  key: 'parses' | 'contract' | 'safety' | 'smoke';
  passed: boolean;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
}

export interface CandleInput {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface GeneratedStrategy {
  /** The extracted Python source (what gets validated/saved). */
  code: string;
  /** The full, unprocessed model response — kept for debugging/audit. */
  raw: string;
  /** Name of the live provider that produced this code. */
  providerName: string;
}

/**
 * Provider abstraction for "prompt -> Python strategy source". Selected by
 * configuration (service/src/modules/ai-strategy/providers/provider.factory.ts),
 * never hard-coded to one model — see artifacts/ai-strategy.md.
 */
export interface LlmProvider {
  readonly name: string;
  generateStrategy(prompt: string): Promise<GeneratedStrategy>;
}

export interface AiStrategySummary {
  id: string;
  name: string;
  version: number;
  createdAt: Date;
  isActive: boolean;
  // null only for a row saved before domain selection existed on this
  // form (no migration backfills it) — such a row is excluded from the
  // Strategy Search catalog (see strategy-plugin.service.ts) but still
  // shown here so the user can see it exists.
  domain: AiStrategyDomain | null;
}

export interface AiStrategyDetail extends AiStrategySummary {
  sourceCode: string;
}
