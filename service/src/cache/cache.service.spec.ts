import { CacheService } from './cache.service';
import { MetricsService } from '../observability/metrics/metrics.service';

function makeClient(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    ping: jest.fn(),
    ...overrides,
  };
}

describe('CacheService', () => {
  it('get() parses the stored JSON value on a hit', async () => {
    const client = makeClient({ get: jest.fn().mockResolvedValue(JSON.stringify({ a: 1 })) });
    const cache = new CacheService(client as any, new MetricsService());

    await expect(cache.get('key')).resolves.toEqual({ a: 1 });
  });

  it('get() returns null on a miss without calling JSON.parse on null', async () => {
    const client = makeClient({ get: jest.fn().mockResolvedValue(null) });
    const cache = new CacheService(client as any, new MetricsService());

    await expect(cache.get('key')).resolves.toBeNull();
  });

  it('set() serializes the value and applies the TTL', async () => {
    const client = makeClient();
    const cache = new CacheService(client as any, new MetricsService());

    await cache.set('key', { a: 1 }, 30);

    expect(client.set).toHaveBeenCalledWith('key', JSON.stringify({ a: 1 }), 'EX', 30);
  });

  it('incr() returns the new counter value', async () => {
    const client = makeClient({ incr: jest.fn().mockResolvedValue(4) });
    const cache = new CacheService(client as any, new MetricsService());

    await expect(cache.incr('version-key')).resolves.toBe(4);
  });

  // Non-negotiable (task-17): a Redis error must never throw to the
  // caller — every method must fall through to a safe default so the
  // caller can fall back to the real data source.
  describe('Redis-down resilience', () => {
    it('get() swallows the error and returns null', async () => {
      const client = makeClient({ get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
      const cache = new CacheService(client as any, new MetricsService());

      await expect(cache.get('key')).resolves.toBeNull();
    });

    it('set() swallows the error instead of throwing', async () => {
      const client = makeClient({ set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
      const cache = new CacheService(client as any, new MetricsService());

      await expect(cache.set('key', 'value', 30)).resolves.toBeUndefined();
    });

    it('del() swallows the error instead of throwing', async () => {
      const client = makeClient({ del: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
      const cache = new CacheService(client as any, new MetricsService());

      await expect(cache.del('key')).resolves.toBeUndefined();
    });

    it('incr() swallows the error and returns null', async () => {
      const client = makeClient({ incr: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
      const cache = new CacheService(client as any, new MetricsService());

      await expect(cache.incr('key')).resolves.toBeNull();
    });
  });

  describe('cache hit/miss metrics', () => {
    it('increments cacheHitsTotal with the key namespace on a hit', async () => {
      const client = makeClient({ get: jest.fn().mockResolvedValue(JSON.stringify({ a: 1 })) });
      const metrics = new MetricsService();
      const cache = new CacheService(client as any, metrics);

      await cache.get('market-data:BTCUSDT:5m');

      expect(await metrics.cacheHitsTotal.get()).toMatchObject({
        values: [expect.objectContaining({ value: 1, labels: { namespace: 'market-data' } })],
      });
    });

    it('increments cacheMissesTotal with the key namespace on a miss', async () => {
      const client = makeClient({ get: jest.fn().mockResolvedValue(null) });
      const metrics = new MetricsService();
      const cache = new CacheService(client as any, metrics);

      await cache.get('leaderboard:top:exp-1');

      expect(await metrics.cacheMissesTotal.get()).toMatchObject({
        values: [expect.objectContaining({ value: 1, labels: { namespace: 'leaderboard' } })],
      });
    });
  });

  describe('ping()', () => {
    it('delegates to the underlying client', async () => {
      const client = makeClient({ ping: jest.fn().mockResolvedValue('PONG') });
      const cache = new CacheService(client as any, new MetricsService());

      await cache.ping();

      expect(client.ping).toHaveBeenCalled();
    });
  });
});
