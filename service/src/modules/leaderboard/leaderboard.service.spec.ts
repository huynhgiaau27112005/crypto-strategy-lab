import { LeaderboardService } from './leaderboard.service';
import { leaderboardVersionKey } from './leaderboard-cache-keys';
import { DomainEventNames } from '../../domain-events';

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

function makeEvents() {
  return { emitAsync: jest.fn().mockResolvedValue([]) };
}

describe('LeaderboardService', () => {
  it('bumps the leaderboard cache version after a successful rebuild (cross-process invalidation)', async () => {
    const database = makeDatabase();
    const cache = makeCache();
    const events = makeEvents();
    const service = new LeaderboardService(database as any, cache as any, events as any);

    await service.rebuildForExperiment('exp-1', 10);

    expect(database.withTransaction).toHaveBeenCalledTimes(1);
    expect(cache.incr).toHaveBeenCalledWith(leaderboardVersionKey('exp-1'));
  });

  it('announces leaderboard.updated with the version the bump returned', async () => {
    const database = makeDatabase();
    const cache = makeCache();
    cache.incr.mockResolvedValue(7);
    const events = makeEvents();
    const service = new LeaderboardService(database as any, cache as any, events as any);

    await service.rebuildForExperiment('exp-1', 10);

    expect(events.emitAsync).toHaveBeenCalledWith(DomainEventNames.LeaderboardUpdated, {
      experimentId: 'exp-1',
      topK: 10,
      leaderboardVersion: 7,
      correlationId: undefined,
    });
  });

  // A null version is the documented "Redis down" signal, not an absent
  // event: consumers must still learn the read model changed.
  it('still announces leaderboard.updated with a null version when the bump failed', async () => {
    const database = makeDatabase();
    const cache = makeCache();
    cache.incr.mockResolvedValue(null);
    const events = makeEvents();
    const service = new LeaderboardService(database as any, cache as any, events as any);

    await service.rebuildForExperiment('exp-1', 10);

    expect(events.emitAsync).toHaveBeenCalledWith(
      DomainEventNames.LeaderboardUpdated,
      expect.objectContaining({ leaderboardVersion: null }),
    );
  });

  // The rebuild is already committed by the time the announcement goes out,
  // so a broken listener must not turn a successful write into a failure.
  it('does not fail the rebuild when a leaderboard.updated listener throws', async () => {
    const database = makeDatabase();
    const cache = makeCache();
    const events = makeEvents();
    events.emitAsync.mockRejectedValue(new Error('listener exploded'));
    const service = new LeaderboardService(database as any, cache as any, events as any);

    await expect(service.rebuildForExperiment('exp-1', 10)).resolves.toBeUndefined();
  });

  it('still rebuilds the leaderboard even if the cache version bump fails (Redis down)', async () => {
    const database = makeDatabase();
    const cache = makeCache();
    cache.incr.mockResolvedValue(null); // simulates CacheService swallowing a Redis error

    const service = new LeaderboardService(database as any, cache as any, makeEvents() as any);

    await expect(service.rebuildForExperiment('exp-1', 10)).resolves.toBeUndefined();
    expect(database.withTransaction).toHaveBeenCalledTimes(1);
  });
});
