import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DomainEventNames,
  LeaderboardUpdatedPayload,
} from '../../domain-events';
import { getCorrelationId } from '../../observability/correlation/correlation-context';
import { DatabaseService } from '../../database/database.service';
import { CacheService } from '../../cache/cache.service';
import { leaderboardVersionKey } from './leaderboard-cache-keys';

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * CQRS write side (tactical — see artifacts/cqrs.md): materialises the
   * `leaderboard_entries` read model from the normalised write tables
   * (`experiment_iterations` / `candidates` / `backtest_runs` /
   * `evaluations`) in one transaction, then bumps the cache version the
   * read side keys on. Same database, separate paths.
   */
  async rebuildForExperiment(
    experimentId: string,
    topK: number,
  ): Promise<void> {
    await this.database.withTransaction(async (client) => {
      const leaderboard = await client.query<{ id: string }>(
        `INSERT INTO leaderboards (experiment_id, top_k) VALUES ($1, $2)
         ON CONFLICT (experiment_id) DO UPDATE SET updated_at = NOW(), top_k = EXCLUDED.top_k
         RETURNING id`,
        [experimentId, topK],
      );
      const leaderboardId = leaderboard.rows[0].id;
      await client.query(
        `DELETE FROM leaderboard_entries WHERE leaderboard_id = $1`,
        [leaderboardId],
      );
      await client.query(
        `INSERT INTO leaderboard_entries (leaderboard_id, candidate_id, rank, score)
         SELECT $1, ranked.candidate_id, ranked.rank, ranked.overall_score
         FROM (
           SELECT c.id AS candidate_id, ev.overall_score,
             ROW_NUMBER() OVER (ORDER BY ev.overall_score DESC)::int AS rank
           FROM experiment_iterations ei
           JOIN candidates c ON c.iteration_id = ei.id
           JOIN backtest_runs br ON br.candidate_id = c.id AND br.status = 'COMPLETED'
           JOIN evaluations ev ON ev.backtest_run_id = br.id
           WHERE ei.experiment_id = $2
           ORDER BY ev.overall_score DESC
           LIMIT $3
         ) ranked`,
        [leaderboardId, experimentId, topK],
      );
    });

    // Cross-process cache invalidation (task-17): this method runs inside
    // the WORKER process — StrategySearchService.run() (search.processor.ts)
    // calls it after every iteration — while the cached "top" response is
    // read by StrategySearchService.getTop() in the API process. An
    // in-process event/callback could never reach across that boundary;
    // an INCR against the shared Redis instance can, and is visible to the
    // API process's very next read (CacheService is a thin wrapper around
    // the same Redis this worker is already connected to via CacheModule).
    // Best-effort: a failed bump only means the next read serves a cached
    // response for up to LEADERBOARD_TOP_CACHE_TTL_SECONDS longer, not
    // that the rebuild itself (already committed above) is lost.
    const leaderboardVersion = await this.cache.incr(
      leaderboardVersionKey(experimentId),
    );

    // Fire-and-forget by design, and the ONLY emit in this codebase that is
    // not awaited: nothing downstream of it is required for correctness
    // (today: logging/metrics; later: a WebSocket push), and the rebuild it
    // reports is already committed. Awaiting it would let a future listener
    // slow down — or, worse, fail — a write path that has already succeeded.
    const payload: LeaderboardUpdatedPayload = {
      experimentId,
      topK,
      leaderboardVersion: leaderboardVersion ?? null,
      correlationId: getCorrelationId(),
    };
    void this.events
      .emitAsync(DomainEventNames.LeaderboardUpdated, payload)
      .catch((error: unknown) =>
        this.logger.warn(
          `leaderboard.updated listener failed for experiment ${experimentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
  }
}
