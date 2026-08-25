import { LeaderboardService } from './leaderboard.service';
import { leaderboardVersionKey } from './leaderboard-cache-keys';

function makeDatabase() {
  const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'leaderboard-1' }] }) };
  return {
    withTransaction: jest.fn((callback: (c: unknown) => unknown) => callback(client)),
    client,
  };
}

function makeCache() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    incr: jest.fn().mockResolvedValue(1),
  };
}

describe('LeaderboardService', () => {
  it('bumps the leaderboard cache version after a successful rebuild (cross-process invalidation)', async () => {
    const database = makeDatabase();
    const cache = makeCache();
    const service = new LeaderboardService(database as any, cache as any);

    await service.rebuildForExperiment('exp-1', 10, 20);

    expect(database.withTransaction).toHaveBeenCalledTimes(1);
    expect(cache.incr).toHaveBeenCalledWith(leaderboardVersionKey('exp-1'));
  });

  it('still rebuilds the leaderboard even if the cache version bump fails (Redis down)', async () => {
    const database = makeDatabase();
    const cache = makeCache();
    cache.incr.mockResolvedValue(null); // simulates CacheService swallowing a Redis error

    const service = new LeaderboardService(database as any, cache as any);

    await expect(service.rebuildForExperiment('exp-1', 10, 20)).resolves.toBeUndefined();
    expect(database.withTransaction).toHaveBeenCalledTimes(1);
  });
});
