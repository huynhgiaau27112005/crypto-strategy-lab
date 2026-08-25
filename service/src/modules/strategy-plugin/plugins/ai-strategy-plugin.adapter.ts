import { Injectable } from '@nestjs/common';
import { StrategyPlugin, ParameterSpec } from '../strategy-plugin.types';
import {
  CandidateMember,
  isAiStrategyType,
  SearchStrategyType,
  StrategyDomain,
} from '../../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from '../../strategy-engine/strategy.types';

/**
 * The single shared plugin instance every "AI:<strategyId>" member type
 * resolves to (see StrategyRegistry.resolve()). One adapter backs every
 * AI strategy any user has ever saved — it is stateless, so there is
 * nothing to register per-strategy.
 *
 * Cost-asymmetry reconciliation (the crux of task-15): a built-in plugin's
 * analyze() is a cheap in-process computation called once per candle. An
 * AI strategy instead needs one Python subprocess call for the WHOLE
 * candle series (workers/ai-strategy/run.py's contract). Calling out to
 * Python per candle here would be the "uncontrolled infinite loop"-shaped
 * anti-pattern the project forbids and would make every candidate an
 * order of magnitude slower. Instead, AiStrategySignalPrecomputeService
 * runs the whole-series call EXACTLY ONCE PER EXPERIMENT (not per
 * candidate — every candidate in one search run shares the same candle
 * series) before the backtest loop starts, and stashes the resulting
 * signal array on SignalContext.aiSignals. This adapter's analyze() is
 * then just an O(1) index lookup into that array — exactly as cheap as a
 * built-in plugin's per-candle call, from the backtest loop's point of
 * view.
 */
@Injectable()
export class AiStrategyPluginAdapter implements StrategyPlugin {
  // These four fields exist only to satisfy the StrategyPlugin interface.
  // A single instance backs every distinct AI strategy, each with its own
  // real name/domain/description held in its `strategies` row — nothing
  // reads these placeholder fields for an AI member. The user-facing
  // catalog for AI strategies is built directly from the `strategies`
  // table instead (see StrategyPluginService.listCatalog), not from this
  // adapter's static fields the way built-ins' catalog entries are.
  readonly type = 'AI:*' as SearchStrategyType;
  readonly domain: StrategyDomain = 'MOMENTUM';
  readonly displayName = 'AI Strategy';
  readonly description = 'LLM-generated strategy, evaluated out-of-process.';
  readonly parameterSchema: ParameterSpec[] = [];

  analyze(member: CandidateMember, context: SignalContext): StrategySignal {
    if (!isAiStrategyType(member.type)) {
      throw new Error(
        `AiStrategyPluginAdapter cannot analyze non-AI member type "${member.type}".`,
      );
    }
    const signals = context.aiSignals?.get(member.type);
    if (!signals) {
      // Defense in depth only: StrategySearchService's generator catalog
      // only ever includes an AI type after AiStrategySignalPrecomputeService
      // has successfully precomputed its signals for this run (a failed
      // precompute excludes the type from candidate generation entirely —
      // see run()'s "Failure isolation" comment). Reaching this branch
      // means that invariant was violated upstream.
      throw new Error(
        `No precomputed signals for AI strategy "${member.type}" for this backtest.`,
      );
    }
    return signals[context.index] ?? 'HOLD';
  }
}
