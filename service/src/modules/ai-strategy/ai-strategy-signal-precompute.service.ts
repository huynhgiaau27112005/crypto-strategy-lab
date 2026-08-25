import { Injectable, Logger } from '@nestjs/common';
import { AiStrategyRunnerService } from './ai-strategy-runner.service';
import { CandleInput, Signal } from './ai-strategy.types';

export interface PrecomputeStrategyInput {
  /** The SearchStrategyType key ("AI:<strategyId>") this result will be looked up by. */
  key: string;
  sourceCode: string;
}

/**
 * Runs each AI strategy's whole-series contract EXACTLY ONCE for a given
 * candle series and returns a lookup by key — the reconciliation of the
 * per-candle (built-in) vs whole-series (AI) cost asymmetry described in
 * artifacts/ai-strategy.md and ai-strategy-plugin.adapter.ts.
 *
 * Called once per Strategy Search experiment run (StrategySearchService),
 * NOT once per candidate: every candidate generated within one run shares
 * the same candle series, so precomputing here amortizes the subprocess
 * cost across the whole run instead of paying it per candidate or, worse,
 * per candle.
 *
 * Failure isolation: strategies are run sequentially (bounding peak
 * subprocess concurrency — the "uncontrolled infinite loop"/unbounded
 * fan-out anti-pattern this project forbids) and each one's failure
 * (validation drift, a timeout from AiStrategyRunnerService's bounded
 * subprocess, a malformed signals array) is caught and logged rather than
 * thrown: a broken or slow AI strategy is simply OMITTED from the
 * returned map, never lets its failure abort the other strategies or the
 * search run. The caller (StrategySearchService) excludes any key missing
 * from the result from candidate generation for this run.
 */
@Injectable()
export class AiStrategySignalPrecomputeService {
  private readonly logger = new Logger(AiStrategySignalPrecomputeService.name);

  constructor(private readonly runner: AiStrategyRunnerService) {}

  async precompute(
    strategies: PrecomputeStrategyInput[],
    candles: CandleInput[],
  ): Promise<Map<string, Signal[]>> {
    const result = new Map<string, Signal[]>();
    for (const strategy of strategies) {
      try {
        const signals = await this.runner.run(strategy.sourceCode, candles);
        if (signals.length !== candles.length) {
          throw new Error(
            `expected ${candles.length} signals, got ${signals.length}`,
          );
        }
        result.set(strategy.key, signals);
      } catch (error) {
        this.logger.warn(
          `AI strategy "${strategy.key}" failed to precompute signals; excluding it from this run: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return result;
  }
}
