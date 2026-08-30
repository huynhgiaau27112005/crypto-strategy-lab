import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LeaderboardService } from './leaderboard.service';
import { DomainEventNames } from '../../domain-events';
// `import type` is required, not stylistic: these interfaces appear in the
// signatures of @OnEvent-decorated methods, and emitDecoratorMetadata +
// isolatedModules reject a value import there (TS1272).
import type {
  BacktestCompletedPayload,
  BacktestFailedPayload,
  CandidatesRegeneratedPayload,
} from '../../domain-events';

/**
 * The Leaderboard's half of the Search→Leaderboard decoupling: everything
 * StrategySearchService used to do by calling rebuildForExperiment()
 * directly now happens here, in the module that owns the read model.
 *
 * The two methods below look near-identical and are deliberately NOT
 * merged. They encode the two different error policies the original call
 * sites had, and collapsing them would silently change one of them — see
 * each method's comment.
 *
 * Lives (and is instantiated) in the WORKER process as well as the API
 * process, because the search loop that emits these events runs in the
 * worker. WorkerModule imports LeaderboardModule explicitly to guarantee
 * that; see the comment there.
 */
@Injectable()
export class LeaderboardEventsHandler {
  private readonly logger = new Logger(LeaderboardEventsHandler.name);

  constructor(private readonly leaderboard: LeaderboardService) {}

  /**
   * One search iteration finished — either outcome. Both are subscribed
   * because the rebuild this triggers is an ITERATION-BOUNDARY concern:
   * StrategySearchService.run() has always rebuilt after every iteration,
   * failures included (the rebuild sat outside its backtest try/catch), and
   * listening only to the success event would cut the rebuild count below
   * what the system has always done.
   *
   * Swallows errors, matching run()'s original try/catch around the direct
   * call: a transient failure rebuilding the read model must not fail the
   * search job, whose backtest rows are already committed.
   */
  // Two stacked decorators, NOT @OnEvent([a, b]). The array form is in the
  // type signature but is handed straight to eventemitter2's on(), which
  // reads an array as a namespaced event path rather than as "these two
  // events" — with wildcard:false the subscription silently matches
  // neither. Verified by the wiring test in this module's spec, which is
  // the only kind of test that can see it.
  @OnEvent(DomainEventNames.BacktestCompleted)
  @OnEvent(DomainEventNames.BacktestFailed)
  async onIterationBoundary(
    payload: BacktestCompletedPayload | BacktestFailedPayload,
  ): Promise<void> {
    try {
      await this.leaderboard.rebuildForExperiment(
        payload.experimentId,
        payload.topK,
      );
    } catch (error) {
      this.logger.warn(
        `Leaderboard rebuild failed for experiment ${payload.experimentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * A strategy-version cascade produced new candidates.
   *
   * Does NOT swallow: this event is emitted on a synchronous user request
   * (the regenerate endpoint), where a failed rebuild has always surfaced
   * as a 5xx rather than a 200 carrying a stale leaderboard. Letting the
   * rejection escape lets emitAsync propagate it to the controller, which
   * is what preserves that.
   */
  // suppressErrors: false is load-bearing. @nestjs/event-emitter defaults
  // it to TRUE — it wraps every listener in a try/catch that logs and
  // swallows — which would turn the failed rebuild below into a silent log
  // line and let the regenerate endpoint answer 200 with a stale
  // leaderboard. That is precisely the behavior change this refactor must
  // not make, so the wrapper is opted out of here.
  @OnEvent(DomainEventNames.CandidatesRegenerated, { suppressErrors: false })
  async onCandidatesRegenerated(
    payload: CandidatesRegeneratedPayload,
  ): Promise<void> {
    await this.leaderboard.rebuildForExperiment(
      payload.experimentId,
      payload.topK,
    );
  }
}
