import { Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { CandleEntity, ExperimentEntity } from '../../../database/types';

export interface SearchStatusRow extends ExperimentEntity {
  generated: number;
  completed: number;
  failed: number;
  running: number;
  best_score: string | null;
  current_candidate_id: string | null;
}

export interface SearchTopRow {
  rank: number;
  candidate_id: string;
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

  async create(
    userId: string,
    name: string | null,
    client?: PoolClient,
  ): Promise<ExperimentEntity> {
    const sql = `INSERT INTO experiments (user_id, name, status)
       VALUES ($1, $2, 'PENDING') RETURNING *`;
    const params = [userId, name];
    const result = client
      ? await client.query<ExperimentEntity>(sql, params)
      : await this.database.query<ExperimentEntity>(sql, params);
    return result.rows[0];
  }

  async findOwned(
    experimentId: string,
    userId: string,
  ): Promise<ExperimentEntity | null> {
    const result = await this.database.query<ExperimentEntity>(
      `SELECT * FROM experiments WHERE id = $1 AND user_id = $2`,
      [experimentId, userId],
    );
    return result.rows[0] ?? null;
  }

  async findByIdOrThrow(experimentId: string): Promise<ExperimentEntity> {
    const result = await this.database.query<ExperimentEntity>(
      `SELECT * FROM experiments WHERE id = $1`,
      [experimentId],
    );
    if (!result.rows[0]) throw new NotFoundException('Experiment not found.');
    return result.rows[0];
  }

  async findResumable(): Promise<ExperimentEntity[]> {
    const result = await this.database.query<ExperimentEntity>(
      `SELECT * FROM experiments WHERE status IN ('PENDING', 'RUNNING') ORDER BY created_at ASC`,
    );
    return result.rows;
  }

  async setRunning(experimentId: string): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE experiments SET status = 'RUNNING', started_at = COALESCE(started_at, NOW())
       WHERE id = $1 AND status IN ('PENDING', 'RUNNING')`,
      [experimentId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async finish(experimentId: string, status: string): Promise<void> {
    await this.database.query(
      `UPDATE experiments SET status = $2, completed_at = NOW() WHERE id = $1`,
      [experimentId, status],
    );
  }

  async isCancelled(experimentId: string): Promise<boolean> {
    const result = await this.database.query<{ status: string }>(
      `SELECT status FROM experiments WHERE id = $1`,
      [experimentId],
    );
    return result.rows[0]?.status === 'CANCELLED';
  }

  async cancel(experimentId: string, userId: string): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE experiments SET status = 'CANCELLED', completed_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status IN ('PENDING', 'RUNNING')`,
      [experimentId, userId],
    );
    return (result.rowCount ?? 0) > 0;
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
    userId: string,
  ): Promise<SearchStatusRow | null> {
    const result = await this.database.query<SearchStatusRow>(
      `SELECT e.*,
         COUNT(ei.id)::int AS generated,
         COUNT(ei.id) FILTER (WHERE ei.status = 'COMPLETED')::int AS completed,
         COUNT(ei.id) FILTER (WHERE ei.status = 'FAILED')::int AS failed,
         COUNT(ei.id) FILTER (WHERE ei.status = 'RUNNING')::int AS running,
         MAX(ev.overall_score) AS best_score,
         -- Postgres has no MAX(uuid); ARRAY_AGG preserves the uuid type.
         (ARRAY_AGG(c.id) FILTER (WHERE ei.status = 'RUNNING'))[1] AS current_candidate_id
       FROM experiments e
       LEFT JOIN experiment_iterations ei ON ei.experiment_id = e.id
       LEFT JOIN candidates c ON c.iteration_id = ei.id
       LEFT JOIN backtest_runs br ON br.candidate_id = c.id
       LEFT JOIN evaluations ev ON ev.backtest_run_id = br.id
       WHERE e.id = $1 AND e.user_id = $2
       GROUP BY e.id`,
      [experimentId, userId],
    );
    return result.rows[0] ?? null;
  }

  async top(
    experimentId: string,
    userId: string,
    limit: number,
    minimumTrades: number,
  ): Promise<SearchTopRow[]> {
    const result = await this.database.query<Omit<SearchTopRow, 'rank'>>(
      `SELECT c.id AS candidate_id,
         ev.total_return, ev.profit_loss, ev.win_rate, ev.max_drawdown,
         ev.number_of_trades, ev.profit_factor, ev.sharpe_ratio, ev.overall_score
       FROM experiments e
       JOIN experiment_iterations ei ON ei.experiment_id = e.id
       JOIN candidates c ON c.iteration_id = ei.id
       JOIN backtest_runs br ON br.candidate_id = c.id AND br.status = 'COMPLETED'
       JOIN evaluations ev ON ev.backtest_run_id = br.id
       WHERE e.id = $1 AND e.user_id = $2 AND ev.number_of_trades >= $3
       ORDER BY ev.overall_score DESC NULLS LAST
       LIMIT $4`,
      [experimentId, userId, minimumTrades, limit],
    );
    return result.rows.map((row, index) => ({ rank: index + 1, ...row }));
  }
}
