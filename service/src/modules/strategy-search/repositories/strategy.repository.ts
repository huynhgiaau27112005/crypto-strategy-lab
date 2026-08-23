import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { StrategyEntity } from '../../../database/types';
import { CandidateDefinition } from '../domain/search.types';

@Injectable()
export class StrategyRepository {
  constructor(private readonly database: DatabaseService) {}

  async findOrCreate(
    sessionId: string,
    name: string,
    candidate: CandidateDefinition,
    fingerprint: string,
  ): Promise<StrategyEntity> {
    return this.database.withTransaction(async (client) => {
      const existing = await client.query<StrategyEntity>(
        `SELECT * FROM strategies WHERE session_id = $1 AND configuration_hash = $2`,
        [sessionId, fingerprint],
      );
      if (existing.rows[0]) return existing.rows[0];

      const versionResult = await client.query<{ version: number }>(
        `SELECT COALESCE(MAX(version), 0)::int + 1 AS version
         FROM strategies WHERE session_id = $1 AND name = $2`,
        [sessionId, name],
      );
      const inserted = await client.query<StrategyEntity>(
        `INSERT INTO strategies (
           session_id, name, version, type, parameters, configuration_hash
         ) VALUES ($1, $2, $3, 'COMPOSITE', $4, $5)
         RETURNING *`,
        [
          sessionId,
          name,
          versionResult.rows[0].version,
          JSON.stringify(candidate),
          fingerprint,
        ],
      );
      return inserted.rows[0];
    });
  }
}
