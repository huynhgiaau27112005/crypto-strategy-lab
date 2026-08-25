import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { ExperimentConfigEntity } from '../../../database/types';

export interface StrategyWeightInput {
  strategyId: string;
  weight: number;
}

export interface WeightRow {
  strategy_id: string;
  name: string;
  type: 'SYSTEM' | 'USER' | 'AI_GENERATED';
  version: number;
  parameters: Record<string, unknown>;
  source_code: string | null;
  weight: string;
}

@Injectable()
export class ExperimentConfigRepository {
  constructor(private readonly database: DatabaseService) {}

  async createWithWeights(
    client: PoolClient,
    experimentId: string,
    timeframe: string,
    startTime: Date,
    endTime: Date,
    iterationLimit: number,
    strategyWeights: StrategyWeightInput[],
  ): Promise<ExperimentConfigEntity> {
    const configResult = await client.query<ExperimentConfigEntity>(
      `INSERT INTO experiment_configs (
         experiment_id, timeframe, start_time, end_time, iteration_limit
       ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [experimentId, timeframe, startTime, endTime, iterationLimit],
    );
    const config = configResult.rows[0];
    for (const item of strategyWeights) {
      await client.query(
        `INSERT INTO experiment_config_strategies (
           experiment_config_id, strategy_id, weight
         ) VALUES ($1, $2, $3)`,
        [config.id, item.strategyId, item.weight],
      );
    }
    return config;
  }

  async findByExperimentId(
    experimentId: string,
  ): Promise<ExperimentConfigEntity | null> {
    const result = await this.database.query<ExperimentConfigEntity>(
      `SELECT * FROM experiment_configs WHERE experiment_id = $1`,
      [experimentId],
    );
    return result.rows[0] ?? null;
  }

  // Raises the persisted candidate cap so a resumed `run()` loop (see
  // StrategySearchService.extend) has a new, higher target to run up to —
  // persisted (not just the in-memory config cache) so the extra
  // iterations survive a process restart mid-run, same as the original
  // iteration_limit set at experiment creation.
  async increaseIterationLimit(
    experimentId: string,
    additional: number,
  ): Promise<number> {
    const result = await this.database.query<{ iteration_limit: number }>(
      `UPDATE experiment_configs SET iteration_limit = iteration_limit + $2
       WHERE experiment_id = $1 RETURNING iteration_limit`,
      [experimentId, additional],
    );
    return result.rows[0].iteration_limit;
  }

  // `type`/`parameters`/`source_code` are included alongside the original
  // `strategy_id`/`name`/`weight` so a caller can resolve each row's
  // SearchStrategyType and (for an AI_GENERATED row) its domain and
  // executable source without a second query per row — see
  // strategy-search.service.ts's run(), which needs exactly this to build
  // the per-run generator catalog and to precompute AI signals.
  async weightsByExperimentId(experimentId: string): Promise<WeightRow[]> {
    const result = await this.database.query<WeightRow>(
      `SELECT ecs.strategy_id, s.name, s.type, s.version, s.parameters, s.source_code, ecs.weight
       FROM experiment_config_strategies ecs
       JOIN experiment_configs ec ON ec.id = ecs.experiment_config_id
       JOIN strategies s ON s.id = ecs.strategy_id
       WHERE ec.experiment_id = $1`,
      [experimentId],
    );
    return result.rows;
  }
}
