/**
 * Payload contracts for the events in `event-names.ts`. Field names here
 * are the ones artifacts/event-catalog.md documents — keep the two in step.
 *
 * Two rules hold across every payload:
 *
 * 1. `correlationId` is optional and read from getCorrelationId() at the
 *    emit site, so a listener's log lines join up with the HTTP request
 *    that (several process boundaries away) started the search.
 * 2. Payloads carry `topK`/`minimumTrades` rather than making the listener
 *    look them up. Those values live in the experiment's SearchConfig,
 *    which the emitting code already holds in memory; re-reading them in
 *    the handler would add a database round-trip per iteration that the
 *    direct call this refactor replaced never made.
 */

/** Fields shared by every leaderboard-triggering event. */
interface LeaderboardRebuildContext {
  experimentId: string;
  /** From the experiment's SearchConfig — the persisted leaderboard size. */
  topK: number;
  /** From the experiment's SearchConfig — evaluation filter for ranking. */
  minimumTrades: number;
  correlationId?: string;
}

export interface BacktestCompletedPayload extends LeaderboardRebuildContext {
  candidateId: string;
  iterationId: string;
}

export interface BacktestFailedPayload extends LeaderboardRebuildContext {
  /**
   * Absent when the failure happened before the candidate row existed —
   * the same condition run() already guards when deciding whether to mark
   * a backtest_runs row FAILED.
   */
  candidateId?: string;
  iterationId: string;
  reason: string;
}

export interface CandidatesRegeneratedPayload
  extends LeaderboardRebuildContext {
  candidateIds: string[];
}

export interface LeaderboardUpdatedPayload {
  experimentId: string;
  topK: number;
  /**
   * Null when the Redis INCR that bumps the cache version failed. The
   * rebuild itself is already committed at that point, so a null version is
   * a degraded-cache signal, not a failed rebuild.
   */
  leaderboardVersion: number | null;
  correlationId?: string;
}

/** Maps each event name to the payload its listeners receive. */
export interface DomainEventPayloads {
  'backtest.completed': BacktestCompletedPayload;
  'backtest.failed': BacktestFailedPayload;
  'candidates.regenerated': CandidatesRegeneratedPayload;
  'leaderboard.updated': LeaderboardUpdatedPayload;
}
