import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { StrategyRepository } from './strategy.repository';

describe('StrategyRepository', () => {
  it('throws NotFoundException when a strategy name has no seed row', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as DatabaseService;
    const repository = new StrategyRepository(database);
    await expect(repository.findByName('UNKNOWN')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the strategy row when found', async () => {
    const row = { id: 's1', name: 'MA', type: 'SYSTEM' };
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [row] }),
    } as unknown as DatabaseService;
    const repository = new StrategyRepository(database);
    await expect(repository.findByName('MA')).resolves.toEqual(row);
  });
});
