import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { ExperimentConfigEntity } from '../../../database/types';

export interface StrategyWeightInput {
  strategyId: string;
  weight: number;
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

  async weightsByExperimentId(
    experimentId: string,
  ): Promise<Array<{ strategy_id: string; name: string; weight: string }>> {
    const result = await this.database.query<{
      strategy_id: string;
      name: string;
      weight: string;
    }>(
      `SELECT ecs.strategy_id, s.name, ecs.weight
       FROM experiment_config_strategies ecs
       JOIN experiment_configs ec ON ec.id = ecs.experiment_config_id
       JOIN strategies s ON s.id = ecs.strategy_id
       WHERE ec.experiment_id = $1`,
      [experimentId],
    );
    return result.rows;
  }
}
