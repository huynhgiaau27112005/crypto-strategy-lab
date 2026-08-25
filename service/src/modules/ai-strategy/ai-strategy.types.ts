export type Signal = 'BUY' | 'SELL' | 'HOLD';

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
  /** Name of the provider that produced this ('openai-compatible' | 'fake'). */
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
}

export interface AiStrategyDetail extends AiStrategySummary {
  sourceCode: string;
}
