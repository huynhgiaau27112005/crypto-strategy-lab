import { SearchQueueService } from './search-queue.service';
import { MetricsService } from '../../../observability/metrics/metrics.service';

function makeJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'exp-1:123',
    data: { experimentId: 'exp-1' },
    getState: jest.fn().mockResolvedValue('active'),
    remove: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('SearchQueueService', () => {
  function buildService(queueOverrides: Partial<Record<string, unknown>> = {}) {
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJobs: jest.fn().mockResolvedValue([]),
      ...queueOverrides,
    };
    const metrics = new MetricsService();
    const service = new SearchQueueService(queue as any, metrics);
    return { service, queue, metrics };
  }

  describe('enqueue()', () => {
    it('adds a job with a jobId derived from the experimentId when nothing is in flight', async () => {
      const { service, queue } = buildService({ getJobs: jest.fn().mockResolvedValue([]) });

      await service.enqueue('exp-1');

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, data, options] = queue.add.mock.calls[0];
      expect(name).toBe('run');
      expect(data).toMatchObject({ experimentId: 'exp-1' });
      expect(typeof data.correlationId).toBe('string');
      expect(data.correlationId.length).toBeGreaterThan(0);
      expect(options.jobId).toContain('exp-1');
    });

    it('increments the searchJobsEnqueuedTotal metric on a successful enqueue', async () => {
      const { service, metrics } = buildService({ getJobs: jest.fn().mockResolvedValue([]) });

      await service.enqueue('exp-1');

      expect(await metrics.searchJobsEnqueuedTotal.get()).toMatchObject({
        values: [expect.objectContaining({ value: 1 })],
      });
    });

    it('coalesces (does not add) when a job for the same experimentId is already in flight', async () => {
      const existing = makeJob();
      const { service, queue } = buildService({ getJobs: jest.fn().mockResolvedValue([existing]) });

      await service.enqueue('exp-1');

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('adds a new job even when a different experiment is in flight', async () => {
      const otherExperiment = makeJob({ id: 'exp-2:123', data: { experimentId: 'exp-2' } });
      const { service, queue } = buildService({
        getJobs: jest.fn().mockResolvedValue([otherExperiment]),
      });

      await service.enqueue('exp-1');

      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelIfQueued()', () => {
    it('removes a job that is still waiting', async () => {
      const waiting = makeJob({ getState: jest.fn().mockResolvedValue('waiting') });
      const { service } = buildService({ getJobs: jest.fn().mockResolvedValue([waiting]) });

      await service.cancelIfQueued('exp-1');

      expect(waiting.remove).toHaveBeenCalled();
    });

    it('leaves an active job alone (the running loop notices CANCELLED itself)', async () => {
      const active = makeJob({ getState: jest.fn().mockResolvedValue('active') });
      const { service } = buildService({ getJobs: jest.fn().mockResolvedValue([active]) });

      await service.cancelIfQueued('exp-1');

      expect(active.remove).not.toHaveBeenCalled();
    });

    it('is a no-op when there is no matching job', async () => {
      const { service, queue } = buildService({ getJobs: jest.fn().mockResolvedValue([]) });

      await expect(service.cancelIfQueued('exp-1')).resolves.toBeUndefined();
      expect(queue.getJobs).toHaveBeenCalled();
    });
  });
});
