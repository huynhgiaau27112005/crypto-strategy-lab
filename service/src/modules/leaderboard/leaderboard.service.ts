import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class LeaderboardService {
  constructor(private readonly database: DatabaseService) {}

  async rebuildSession(sessionId: string, topK: number): Promise<void> {
    await this.database.withTransaction(async (client) => {
      const leaderboard = await client.query<{ id: string }>(
        `INSERT INTO leaderboards (session_id) VALUES ($1)
         ON CONFLICT (session_id) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [sessionId],
      );
      const leaderboardId = leaderboard.rows[0].id;
      await client.query(
        `DELETE FROM leaderboard_entries WHERE leaderboard_id = $1`,
        [leaderboardId],
      );
      await client.query(
        `INSERT INTO leaderboard_entries (
           leaderboard_id, experiment_strategy_id, rank, score
         )
         SELECT $1, ranked.experiment_strategy_id, ranked.rank, ranked.overall_score
         FROM (
           SELECT es.id AS experiment_strategy_id, ev.overall_score,
             ROW_NUMBER() OVER (ORDER BY ev.overall_score DESC)::int AS rank
           FROM experiments e
           JOIN experiment_strategies es ON es.experiment_id = e.id
           JOIN evaluations ev ON ev.experiment_strategy_id = es.id
           WHERE e.session_id = $2 AND es.status = 'COMPLETED'
             AND ev.number_of_trades >= COALESCE((e.search_config->>'minimumTrades')::int, 0)
           ORDER BY ev.overall_score DESC
           LIMIT $3
         ) ranked`,
        [leaderboardId, sessionId, topK],
      );
    });
  }
}
