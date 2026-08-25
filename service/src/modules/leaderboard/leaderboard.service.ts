import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CacheService } from '../../cache/cache.service';
import { leaderboardVersionKey } from './leaderboard-cache-keys';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
  ) {}

  async rebuildForExperiment(
    experimentId: string,
    topK: number,
    minimumTrades: number,
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
           WHERE ei.experiment_id = $2 AND ev.number_of_trades >= $4
           ORDER BY ev.overall_score DESC
           LIMIT $3
         ) ranked`,
        [leaderboardId, experimentId, topK, minimumTrades],
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
    await this.cache.incr(leaderboardVersionKey(experimentId));
  }
}
