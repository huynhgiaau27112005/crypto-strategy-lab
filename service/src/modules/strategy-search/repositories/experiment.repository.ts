import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { CandleEntity, ExperimentEntity } from '../../../database/types';
import { SearchConfig } from '../domain/search.types';

export interface SearchStatusRow extends ExperimentEntity {
  generated: number;
  completed: number;
  failed: number;
  running: number;
  best_score: string | null;
  current_candidate: string | null;
}

export interface SearchTopRow {
  rank: number;
  experiment_strategy_id: string;
  strategy_id: string;
  name: string;
  version: number;
  parameters: Record<string, unknown>;
  configuration_hash: string;
  total_return: string;
  profit_loss: string;
  win_rate: string;
  max_drawdown: string;
  number_of_trades: number;
  profit_factor: string | null;
  sharpe_ratio: string | null;
  overall_score: string;
}

@Injectable()
export class ExperimentRepository {
  constructor(private readonly database: DatabaseService) {}

  async ensureSession(sessionId: string): Promise<void> {
    await this.database.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO sessions (id, last_seen_at) VALUES ($1, NOW())
         ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW()`,
        [sessionId],
      );
      await client.query(
        `INSERT INTO leaderboards (session_id) VALUES ($1)
         ON CONFLICT (session_id) DO NOTHING`,
        [sessionId],
      );
    });
  }

  async create(
    sessionId: string,
    timeframe: string,
    startTime: Date,
    endTime: Date,
    config: SearchConfig,
    randomSeed: number,
  ): Promise<ExperimentEntity> {
    const result = await this.database.query<ExperimentEntity>(
      `INSERT INTO experiments (
         session_id, timeframe, start_time, end_time, status,
         search_algorithm, search_config, random_seed
       ) VALUES ($1, $2, $3, $4, 'PENDING', 'DOMAIN_GUIDED_RANDOM', $5, $6)
       RETURNING *`,
      [
        sessionId,
        timeframe,
        startTime,
        endTime,
        JSON.stringify(config),
        randomSeed,
      ],
    );
    return result.rows[0];
  }

  async findOwned(
    experimentId: string,
    sessionId: string,
  ): Promise<ExperimentEntity | null> {
    const result = await this.database.query<ExperimentEntity>(
      `SELECT * FROM experiments WHERE id = $1 AND session_id = $2`,
      [experimentId, sessionId],
    );
    return result.rows[0] ?? null;
  }

  async findById(experimentId: string): Promise<ExperimentEntity | null> {
    const result = await this.database.query<ExperimentEntity>(
      `SELECT * FROM experiments WHERE id = $1`,
      [experimentId],
    );
    return result.rows[0] ?? null;
  }

  async findResumable(): Promise<ExperimentEntity[]> {
    const result = await this.database.query<ExperimentEntity>(
      `SELECT * FROM experiments
       WHERE search_algorithm = 'DOMAIN_GUIDED_RANDOM'
         AND status IN ('PENDING', 'RUNNING')
       ORDER BY created_at ASC`,
    );
    return result.rows;
  }

  async setRunning(experimentId: string): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE experiments SET status = 'RUNNING', error_message = NULL
       WHERE id = $1 AND status IN ('PENDING', 'RUNNING')`,
      [experimentId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async finish(
    experimentId: string,
    status: string,
    stopReason: string,
  ): Promise<void> {
    await this.database.query(
      `UPDATE experiments
       SET status = $2, stop_reason = $3, completed_at = NOW()
       WHERE id = $1`,
      [experimentId, status, stopReason],
    );
  }

  async fail(experimentId: string, message: string): Promise<void> {
    await this.database.query(
      `UPDATE experiments
       SET status = 'FAILED', stop_reason = 'ERROR', error_message = $2, completed_at = NOW()
       WHERE id = $1`,
      [experimentId, message.slice(0, 4000)],
    );
  }

  async cancel(experimentId: string, sessionId: string): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE experiments
       SET status = 'CANCELLED', stop_reason = 'USER_CANCELLED', completed_at = NOW()
       WHERE id = $1 AND session_id = $2 AND status IN ('PENDING', 'RUNNING')`,
      [experimentId, sessionId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async isCancelled(experimentId: string): Promise<boolean> {
    const result = await this.database.query<{ status: string }>(
      `SELECT status FROM experiments WHERE id = $1`,
      [experimentId],
    );
    return result.rows[0]?.status === 'CANCELLED';
  }

  async candles(
    timeframe: string,
    startTime: Date,
    endTime: Date,
  ): Promise<CandleEntity[]> {
    const result = await this.database.query<CandleEntity>(
      `SELECT timeframe, timestamp, open, high, low, close, volume
       FROM candles
       WHERE timeframe = $1 AND timestamp >= $2 AND timestamp < $3
       ORDER BY timestamp ASC`,
      [timeframe, startTime, endTime],
    );
    return result.rows;
  }

  async status(
    experimentId: string,
    sessionId: string,
  ): Promise<SearchStatusRow | null> {
    const result = await this.database.query<SearchStatusRow>(
      `SELECT e.*,
         COUNT(es.id)::int AS generated,
         COUNT(es.id) FILTER (WHERE es.status = 'COMPLETED')::int AS completed,
         COUNT(es.id) FILTER (WHERE es.status = 'FAILED')::int AS failed,
         COUNT(es.id) FILTER (WHERE es.status = 'RUNNING')::int AS running,
         MAX(ev.overall_score) FILTER (
           WHERE ev.number_of_trades >= COALESCE((e.search_config->>'minimumTrades')::int, 0)
         ) AS best_score,
         MAX(s.name) FILTER (WHERE es.status = 'RUNNING') AS current_candidate
       FROM experiments e
       LEFT JOIN experiment_strategies es ON es.experiment_id = e.id
       LEFT JOIN strategies s ON s.id = es.strategy_id
       LEFT JOIN evaluations ev ON ev.experiment_strategy_id = es.id
       WHERE e.id = $1 AND e.session_id = $2
       GROUP BY e.id`,
      [experimentId, sessionId],
    );
    return result.rows[0] ?? null;
  }

  async top(
    experimentId: string,
    sessionId: string,
    limit: number,
  ): Promise<SearchTopRow[]> {
    const result = await this.database.query<Omit<SearchTopRow, 'rank'>>(
      `SELECT es.id AS experiment_strategy_id, s.id AS strategy_id,
         s.name, s.version, s.parameters, s.configuration_hash,
         ev.total_return, ev.profit_loss, ev.win_rate, ev.max_drawdown,
         ev.number_of_trades, ev.profit_factor, ev.sharpe_ratio, ev.overall_score
       FROM experiments e
       JOIN experiment_strategies es ON es.experiment_id = e.id
       JOIN strategies s ON s.id = es.strategy_id
       JOIN evaluations ev ON ev.experiment_strategy_id = es.id
       WHERE e.id = $1 AND e.session_id = $2
         AND es.status = 'COMPLETED'
         AND ev.number_of_trades >= COALESCE((e.search_config->>'minimumTrades')::int, 0)
       ORDER BY ev.overall_score DESC NULLS LAST
       LIMIT $3`,
      [experimentId, sessionId, limit],
    );
    return result.rows.map((row, index) => ({ rank: index + 1, ...row }));
  }
}
