import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { StrategyEntity } from '../../../database/types';

@Injectable()
export class StrategyRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByName(name: string): Promise<StrategyEntity> {
    const result = await this.database.query<StrategyEntity>(
      `SELECT * FROM strategies WHERE name = $1 AND type = 'SYSTEM' AND is_active = true`,
      [name],
    );
    if (!result.rows[0]) {
      throw new NotFoundException(`No active SYSTEM strategy named "${name}".`);
    }
    return result.rows[0];
  }

  async listSystemStrategies(): Promise<StrategyEntity[]> {
    const result = await this.database.query<StrategyEntity>(
      `SELECT * FROM strategies WHERE type = 'SYSTEM' AND is_active = true ORDER BY name`,
    );
    return result.rows;
  }
}
