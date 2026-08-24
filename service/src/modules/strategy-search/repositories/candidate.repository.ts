import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { CandidateEntity } from '../../../database/types';

export interface CandidateStrategyInput {
  strategyId: string;
  parameters: Record<string, unknown>;
}

@Injectable()
export class CandidateRepository {
  async createForIteration(
    client: PoolClient,
    iterationId: string,
    members: CandidateStrategyInput[],
  ): Promise<CandidateEntity> {
    const candidateResult = await client.query<CandidateEntity>(
      `INSERT INTO candidates (iteration_id) VALUES ($1) RETURNING *`,
      [iterationId],
    );
    const candidate = candidateResult.rows[0];
    for (const member of members) {
      await client.query(
        `INSERT INTO candidate_strategies (candidate_id, strategy_id, parameters)
         VALUES ($1, $2, $3)`,
        [candidate.id, member.strategyId, JSON.stringify(member.parameters)],
      );
    }
    return candidate;
  }
}
