import { DatabaseService } from '../../../database/database.service';
import { NewsRepository } from './news.repository';

describe('NewsRepository', () => {
  describe('findMany', () => {
    it('omits the WHERE clause entirely when no sentiment filter is supplied', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const database = { query } as unknown as DatabaseService;
      const repository = new NewsRepository(database);

      await repository.findMany(undefined, 1, 20);

      const [rowsSql, rowsParams] = query.mock.calls[0];
      expect(rowsSql).not.toMatch(/WHERE/);
      expect(rowsSql).not.toContain('sentiment =');
      expect(rowsParams).toEqual([20, 0]);

      const [countSql, countParams] = query.mock.calls[1];
      expect(countSql).not.toMatch(/WHERE/);
      expect(countParams).toEqual([]);
    });

    it('applies a WHERE sentiment = $1 clause, bound as a parameter, when a filter is supplied', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const database = { query } as unknown as DatabaseService;
      const repository = new NewsRepository(database);

      await repository.findMany('POSITIVE', 1, 20);

      const [rowsSql, rowsParams] = query.mock.calls[0];
      expect(rowsSql).toContain('WHERE sentiment = $1');
      expect(rowsParams).toEqual(['POSITIVE', 20, 0]);

      const [countSql, countParams] = query.mock.calls[1];
      expect(countSql).toContain('WHERE sentiment = $1');
      expect(countParams).toEqual(['POSITIVE']);
    });

    it('binds LIMIT and OFFSET as parameters, computed from page and pageSize', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const database = { query } as unknown as DatabaseService;
      const repository = new NewsRepository(database);

      await repository.findMany(undefined, 3, 10);

      const [rowsSql, rowsParams] = query.mock.calls[0];
      expect(rowsSql).toContain('LIMIT $1 OFFSET $2');
      expect(rowsParams).toEqual([10, 20]); // offset = (3-1)*10
    });

    it('orders newest first: published_at DESC NULLS LAST, then crawled_at DESC', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const database = { query } as unknown as DatabaseService;
      const repository = new NewsRepository(database);

      await repository.findMany(undefined, 1, 20);

      const [rowsSql] = query.mock.calls[0];
      expect(rowsSql).toContain('ORDER BY published_at DESC NULLS LAST, crawled_at DESC');
    });

    it('returns total from the COUNT(*) query, not from the returned page length', async () => {
      const rows = [{ id: 'n1' }, { id: 'n2' }];
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows: [{ count: 137 }] });
      const database = { query } as unknown as DatabaseService;
      const repository = new NewsRepository(database);

      const result = await repository.findMany(undefined, 1, 2);

      expect(result.rows).toHaveLength(2);
      expect(result.total).toBe(137);
    });

    it('handles the empty-database case: zero rows, zero total, no throw', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const database = { query } as unknown as DatabaseService;
      const repository = new NewsRepository(database);

      const result = await repository.findMany(undefined, 1, 20);

      expect(result).toEqual({ rows: [], total: 0 });
    });
  });

  describe('summarizeSentiment', () => {
    it('groups by sentiment and restricts to published_at >= now() - interval, excluding unanalyzed rows', async () => {
      const query = jest.fn().mockResolvedValueOnce({
        rows: [
          { sentiment: 'POSITIVE', count: 5, avg_score: '0.812345' },
          { sentiment: 'NEGATIVE', count: 2, avg_score: '0.700000' },
        ],
      });
      const database = { query } as unknown as DatabaseService;
      const repository = new NewsRepository(database);

      const result = await repository.summarizeSentiment(24);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('GROUP BY sentiment');
      expect(sql).toContain('published_at >= now() - make_interval(hours => $1::int)');
      expect(sql).toContain('sentiment IS NOT NULL');
      expect(params).toEqual([24]);

      expect(result).toEqual([
        { sentiment: 'POSITIVE', count: 5, avgScore: 0.812345 },
        { sentiment: 'NEGATIVE', count: 2, avgScore: 0.7 },
      ]);
    });

    it('returns an empty array when there are no analyzed rows in the window (empty-database case)', async () => {
      const query = jest.fn().mockResolvedValueOnce({ rows: [] });
      const database = { query } as unknown as DatabaseService;
      const repository = new NewsRepository(database);

      const result = await repository.summarizeSentiment(24);

      expect(result).toEqual([]);
    });
  });
});
