import { DatabaseService } from '../../../database/database.service';
import { AiStrategyRepository } from './ai-strategy.repository';

describe('AiStrategyRepository', () => {
  describe('listMine', () => {
    it('scopes the query to AI_GENERATED rows owned by the caller — regression guard for ownership scoping', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const database = { query } as unknown as DatabaseService;
      const repository = new AiStrategyRepository(database);

      await repository.listMine('user-1');

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0];
      // If someone strips the ownership predicate, this fails: the query
      // must filter on both type = 'AI_GENERATED' and owner_user_id = $1.
      expect(sql).toMatch(/owner_user_id\s*=\s*\$1/);
      expect(sql).toMatch(/type\s*=\s*'AI_GENERATED'/);
      expect(params).toEqual(['user-1']);
    });

    it("never returns another user's AI strategies even if both share a query surface", async () => {
      const allRows = [
        { id: 'mine-1', type: 'AI_GENERATED', owner_user_id: 'user-1' },
        { id: 'theirs-1', type: 'AI_GENERATED', owner_user_id: 'user-2' },
        { id: 'sys-1', type: 'SYSTEM', owner_user_id: null },
      ];
      const query = jest.fn(async (_sql: string, params: unknown[]) => {
        const userId = params[0];
        return { rows: allRows.filter((row) => row.type === 'AI_GENERATED' && row.owner_user_id === userId) };
      });
      const database = { query } as unknown as DatabaseService;
      const repository = new AiStrategyRepository(database);

      const rows = await repository.listMine('user-1');
      expect(rows.map((r) => r.id)).toEqual(['mine-1']);
      expect(rows.some((r) => r.id === 'theirs-1')).toBe(false);
    });
  });

  describe('findMineById', () => {
    it('scopes by id AND owner_user_id, returning null instead of another user\'s row', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const database = { query } as unknown as DatabaseService;
      const repository = new AiStrategyRepository(database);

      const result = await repository.findMineById('strat-1', 'user-1');

      expect(result).toBeNull();
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/owner_user_id\s*=\s*\$2/);
      expect(params).toEqual(['strat-1', 'user-1']);
    });
  });

  describe('createVersion', () => {
    it('inserts a new AI_GENERATED row rather than updating an existing one', async () => {
      const clientQuery = jest
        .fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ next_version: 1 }] }) // MAX(version)+1
        .mockResolvedValueOnce({
          rows: [{ id: 'new-row', name: 'MY_STRAT', version: 1, type: 'AI_GENERATED', owner_user_id: 'user-1' }],
        }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT
      const client = { query: clientQuery, release: jest.fn() };
      const database = {
        getClient: jest.fn().mockResolvedValue(client),
        withTransaction: DatabaseService.prototype.withTransaction,
      } as unknown as DatabaseService;
      const repository = new AiStrategyRepository(database);

      const result = await repository.createVersion('user-1', 'MY_STRAT', 'def generate_signals(candles):\n    return []', 'MOMENTUM');

      expect(result).toEqual(
        expect.objectContaining({ id: 'new-row', version: 1, type: 'AI_GENERATED', owner_user_id: 'user-1' }),
      );
      const insertCall = clientQuery.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO strategies'));
      expect(insertCall[0]).toMatch(/'AI_GENERATED'/);
      expect(insertCall[0]).toMatch(/'PYTHON'/);
      expect(insertCall[1][0]).toBe('user-1');
      expect(insertCall[1][1]).toBe('MY_STRAT');
    });

    it('retries once on a unique-constraint collision (23505) instead of failing the save', async () => {
      let attempt = 0;
      const makeClient = () => ({
        query: jest.fn(async (sql: string) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
          if (sql.includes('MAX(version)')) return { rows: [{ next_version: 2 }] };
          if (sql.includes('INSERT INTO strategies')) {
            attempt++;
            if (attempt === 1) {
              const err: any = new Error('duplicate key value violates unique constraint');
              err.code = '23505';
              throw err;
            }
            return { rows: [{ id: 'new-row', version: 3, type: 'AI_GENERATED' }] };
          }
          throw new Error(`unexpected query: ${sql}`);
        }),
        release: jest.fn(),
      });
      const database = {
        getClient: jest.fn(async () => makeClient()),
        withTransaction: DatabaseService.prototype.withTransaction,
      } as unknown as DatabaseService;
      const repository = new AiStrategyRepository(database);

      const result = await repository.createVersion('user-1', 'MY_STRAT', 'def generate_signals(candles):\n    return []', 'MOMENTUM');
      expect(result).toEqual({ id: 'new-row', version: 3, type: 'AI_GENERATED' });
      expect(attempt).toBe(2);
    });
  });
});
