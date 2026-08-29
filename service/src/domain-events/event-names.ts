/**
 * The single registry of in-process domain event names.
 *
 * Names are plain string constants rather than class names (the other
 * common Nest convention) for one reason: `artifacts/event-catalog.md` has
 * to stay honest, and a grep for the literal `'backtest.completed'` finds
 * every emit site, every `@OnEvent`, and the catalog row in one search. A
 * class name only finds the TypeScript, so the catalog would be free to
 * drift out of sync unnoticed.
 *
 * Adding an event here without adding its row to artifacts/event-catalog.md
 * is a bug, not an omission — the catalog is the contract.
 */
export const DomainEventNames = {
  /**
   * One search iteration finished with a persisted, COMPLETED backtest run.
   */
  BacktestCompleted: 'backtest.completed',

  /**
   * One search iteration ended in failure (the backtest threw, or the
   * candidate row could not be created).
   *
   * This event exists because the Leaderboard rebuild it triggers is an
   * ITERATION-BOUNDARY concern, not a new-data concern: before this
   * refactor, StrategySearchService.run() rebuilt the leaderboard after
   * EVERY iteration, deliberately outside the backtest try/catch. Emitting
   * only on success would quietly reduce the number of rebuilds (and of
   * `leaderboard:version` cache bumps) versus the behavior this codebase
   * shipped. See artifacts/event-catalog.md for the full reasoning.
   */
  BacktestFailed: 'backtest.failed',

  /**
   * A strategy-version cascade finished and produced at least one new
   * candidate. Emitted ONCE per cascade, after the loop — not per candidate
   * — mirroring the single post-loop rebuild the cascade always performed.
   */
  CandidatesRegenerated: 'candidates.regenerated',

  /**
   * The `leaderboard_entries` read model was rebuilt and its cache version
   * bumped. Currently observed for logging/metrics only.
   */
  LeaderboardUpdated: 'leaderboard.updated',
} as const;

export type DomainEventName =
  (typeof DomainEventNames)[keyof typeof DomainEventNames];
