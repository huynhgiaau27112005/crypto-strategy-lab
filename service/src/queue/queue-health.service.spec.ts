import { QueueHealthService } from './queue-health.service';

function makeQueue(name: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name,
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }),
    getWorkers: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('QueueHealthService', () => {
  it('reports redis "up" with live counts when both queues respond', async () => {
    const search = makeQueue('search', {
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 2,
        active: 1,
        completed: 10,
        failed: 0,
        delayed: 0,
      }),
      getWorkers: jest.fn().mockResolvedValue([{ id: 'w1' }]),
    });
    const crawl = makeQueue('news-crawl');
    const service = new QueueHealthService(search as any, crawl as any);

    const snapshot = await service.snapshot();

    expect(snapshot.redis).toBe('up');
    expect(snapshot.queues).toHaveLength(2);
    expect(snapshot.queues[0]).toEqual({
      name: 'search',
      counts: { waiting: 2, active: 1, completed: 10, failed: 0, delayed: 0 },
      workers: 1,
    });
  });

  it('reports redis "down" instead of throwing when a queue call fails', async () => {
    const search = makeQueue('search', {
      getJobCounts: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const crawl = makeQueue('news-crawl');
    const service = new QueueHealthService(search as any, crawl as any);

    const snapshot = await service.snapshot();

    expect(snapshot.redis).toBe('down');
    expect(snapshot.queues.every((q) => q.workers === 0)).toBe(true);
  });
});
