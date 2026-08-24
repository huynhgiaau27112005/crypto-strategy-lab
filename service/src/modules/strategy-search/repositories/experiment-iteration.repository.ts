import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { ExperimentIterationEntity } from '../../../database/types';

@Injectable()
export class ExperimentIterationRepository {
  constructor(private readonly database: DatabaseService) {}

  async createNext(
    client: PoolClient,
    experimentId: string,
  ): Promise<ExperimentIterationEntity> {
    const result = await client.query<ExperimentIterationEntity>(
      `INSERT INTO experiment_iterations (experiment_id, iteration_number, status, started_at)
       VALUES (
         $1,
         COALESCE(
           (SELECT MAX(iteration_number) FROM experiment_iterations WHERE experiment_id = $1),
           0
         ) + 1,
         'RUNNING',
         NOW()
       )
       RETURNING *`,
      [experimentId],
    );
    return result.rows[0];
  }

  async complete(id: string): Promise<void> {
    await this.database.query(
      `UPDATE experiment_iterations SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async fail(id: string, message: string): Promise<void> {
    await this.database.query(
      `UPDATE experiment_iterations
       SET status = 'FAILED', completed_at = NOW(), error_message = $2
       WHERE id = $1`,
      [id, message.slice(0, 4000)],
    );
  }

  async countByExperimentId(experimentId: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM experiment_iterations WHERE experiment_id = $1`,
      [experimentId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
