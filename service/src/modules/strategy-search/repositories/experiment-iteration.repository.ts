import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { ExperimentIterationEntity } from '../../../database/types';

@Injectable()
export class ExperimentIterationRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Opens the next iteration of an experiment, rejecting a candidate this
   * experiment has already tried.
   *
   * Returns `null` — rather than throwing — when `fingerprint` collides
   * with an existing iteration of the same experiment (migration 005's
   * `uk_iterations_experiment_fingerprint`). That is the duplicate-candidate
   * guard: the caller treats a null as "generated a combination we already
   * evaluated, draw another one" and must NOT count it toward `generated`.
   * `ON CONFLICT DO NOTHING` (not a pre-flight SELECT) so the check is one
   * round trip and has no window for a concurrent insert to slip through.
   *
   * A null `fingerprint` disables the guard for that insert, since Postgres
   * treats NULLs as distinct in a unique index — no caller in the search
   * loop does this, but it keeps rows written before migration 005 valid.
   */
  async createNext(
    client: PoolClient,
    experimentId: string,
    fingerprint: string | null,
  ): Promise<ExperimentIterationEntity | null> {
    const result = await client.query<ExperimentIterationEntity>(
      `INSERT INTO experiment_iterations
         (experiment_id, iteration_number, status, started_at, candidate_fingerprint)
       VALUES (
         $1,
         COALESCE(
           (SELECT MAX(iteration_number) FROM experiment_iterations WHERE experiment_id = $1),
           0
         ) + 1,
         'RUNNING',
         NOW(),
         $2
       )
       ON CONFLICT (experiment_id, candidate_fingerprint) DO NOTHING
       RETURNING *`,
      [experimentId, fingerprint],
    );
    return result.rows[0] ?? null;
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
