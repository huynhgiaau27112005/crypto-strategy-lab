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

  describe('listVersions', () => {
    it('scopes the query to SYSTEM rows plus the caller\'s own rows — regression guard for ownership scoping', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const database = { query } as unknown as DatabaseService;
      const repository = new StrategyRepository(database);

      await repository.listVersions('MA', 'user-1');

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0];
      // If someone strips the ownership predicate down to just `name = $1`,
      // this assertion fails: it requires the query to both filter by
      // owner_user_id and pass the calling user's id as a parameter.
      expect(sql).toMatch(/owner_user_id\s*=\s*\$2/);
      expect(sql).toMatch(/type\s*=\s*'SYSTEM'/);
      expect(params).toEqual(['MA', 'user-1']);
    });

    it("never lets one user's query return another user's private rows", async () => {
      const allRows = [
        { id: 'sys-1', name: 'MA', type: 'SYSTEM', owner_user_id: null, version: 1 },
        { id: 'mine-1', name: 'MA', type: 'USER', owner_user_id: 'user-1', version: 2 },
        { id: 'theirs-1', name: 'MA', type: 'USER', owner_user_id: 'user-2', version: 3 },
      ];
      const query = jest.fn(async (_sql: string, params: unknown[]) => {
        const userId = params[1];
        return {
          rows: allRows.filter((row) => row.type === 'SYSTEM' || row.owner_user_id === userId),
        };
      });
      const database = { query } as unknown as DatabaseService;
      const repository = new StrategyRepository(database);

      const rows = await repository.listVersions('MA', 'user-1');
      expect(rows.map((r) => r.id)).toEqual(['sys-1', 'mine-1']);
      expect(rows.some((r) => r.id === 'theirs-1')).toBe(false);
    });
  });

  describe('listLatestForUser', () => {
    it('queries DISTINCT ON (name) scoped to SYSTEM rows plus the caller\'s own rows, preferring the caller\'s row', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const database = { query } as unknown as DatabaseService;
      const repository = new StrategyRepository(database);

      await repository.listLatestForUser('user-1');

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/DISTINCT ON \(name\)/);
      expect(sql).toMatch(/type\s*=\s*'SYSTEM'/);
      expect(sql).toMatch(/owner_user_id\s*=\s*\$1/);
      expect(params).toEqual(['user-1']);
    });

    it("returns the caller's own latest saved version for a name instead of the shared SYSTEM row", async () => {
      // Mirrors the real ORDER BY: caller's own row first (highest
      // version), SYSTEM row last — DISTINCT ON (name) keeps only the
      // first row per group, so this fixture asserts the repository
      // hands back exactly that first row per name, unchanged.
      const rows = [
        { id: 'mine-ma-v5', name: 'MA', type: 'USER', owner_user_id: 'user-1', version: 5 },
        { id: 'other-rsi-sys', name: 'RSI', type: 'SYSTEM', owner_user_id: null, version: 1 },
      ];
      const query = jest.fn().mockResolvedValue({ rows });
      const database = { query } as unknown as DatabaseService;
      const repository = new StrategyRepository(database);

      const result = await repository.listLatestForUser('user-1');
      expect(result).toEqual(rows);
      expect(result.find((r) => r.name === 'MA')?.version).toBe(5);
    });
  });

  describe('createVersion', () => {
    it('inserts a new USER-owned row rather than updating the existing one', async () => {
      const clientQuery = jest
        .fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ next_version: 2 }] }) // MAX(version)+1
        .mockResolvedValueOnce({
          rows: [{ id: 'sys-1', name: 'MA', description: 'd', language: 'TYPESCRIPT', source_code: null }],
        }) // latest row
        .mockResolvedValueOnce({ rows: [{ id: 'new-row', name: 'MA', version: 2, type: 'USER' }] }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT
      const client = { query: clientQuery, release: jest.fn() };
      const database = {
        getClient: jest.fn().mockResolvedValue(client),
        withTransaction: DatabaseService.prototype.withTransaction,
      } as unknown as DatabaseService;
      const repository = new StrategyRepository(database);

      const result = await repository.createVersion('MA', 'user-1', { fastPeriod: 10 });

      expect(result).toEqual({ id: 'new-row', name: 'MA', version: 2, type: 'USER' });
      const insertCall = clientQuery.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO strategies'));
      expect(insertCall[0]).toMatch(/'USER'/);
      expect(insertCall[1][0]).toBe('user-1');
    });

    it('retries once on a unique-constraint collision (23505) instead of failing the save', async () => {
      let attempt = 0;
      const makeClient = () => ({
        query: jest.fn(async (sql: string) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
          if (sql.includes('MAX(version)')) return { rows: [{ next_version: 2 }] };
          if (sql.includes('ORDER BY version DESC LIMIT 1')) {
            return { rows: [{ id: 'sys-1', name: 'MA', description: null, language: null, source_code: null }] };
          }
          if (sql.includes('INSERT INTO strategies')) {
            attempt++;
            if (attempt === 1) {
              const err: any = new Error('duplicate key value violates unique constraint');
              err.code = '23505';
              throw err;
            }
            return { rows: [{ id: 'new-row', name: 'MA', version: 3, type: 'USER' }] };
          }
          throw new Error(`unexpected query: ${sql}`);
        }),
        release: jest.fn(),
      });
      const database = {
        getClient: jest.fn(async () => makeClient()),
        withTransaction: DatabaseService.prototype.withTransaction,
      } as unknown as DatabaseService;
      const repository = new StrategyRepository(database);

      const result = await repository.createVersion('MA', 'user-1', { fastPeriod: 10 });
      expect(result).toEqual({ id: 'new-row', name: 'MA', version: 3, type: 'USER' });
      expect(attempt).toBe(2);
    });
  });
});
