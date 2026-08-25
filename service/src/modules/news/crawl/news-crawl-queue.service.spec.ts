import { NewsCrawlQueueService } from './news-crawl-queue.service';

function makeJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'crawl-1',
    processedOn: 1000,
    finishedOn: null,
    returnvalue: undefined,
    failedReason: null,
    getState: jest.fn().mockResolvedValue('active'),
    ...overrides,
  };
}

describe('NewsCrawlQueueService', () => {
  function buildService(queueOverrides: Partial<Record<string, unknown>> = {}) {
    const queue = {
      add: jest.fn(),
      getJobs: jest.fn().mockResolvedValue([]),
      ...queueOverrides,
    };
    const service = new NewsCrawlQueueService(queue as any);
    return { service, queue };
  }

  describe('trigger()', () => {
    it('coalesces onto an already in-flight job instead of adding a new one', async () => {
      const inFlight = makeJob({ getState: jest.fn().mockResolvedValue('active') });
      const { service, queue } = buildService({
        getJobs: jest.fn().mockResolvedValue([inFlight]),
      });

      const result = await service.trigger();

      expect(queue.add).not.toHaveBeenCalled();
      expect(result.jobId).toBe('crawl-1');
      expect(result.status).toBe('RUNNING');
    });

    it('adds a new job when nothing is in flight', async () => {
      const added = makeJob({ id: 'crawl-2', getState: jest.fn().mockResolvedValue('waiting') });
      const { service, queue } = buildService({
        getJobs: jest.fn().mockResolvedValue([]),
        add: jest.fn().mockResolvedValue(added),
      });

      const result = await service.trigger();

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(result.jobId).toBe('crawl-2');
    });
  });

  describe('getStatus()', () => {
    it('returns null when nothing was ever triggered', async () => {
      const { service } = buildService({
        getJobs: jest.fn().mockResolvedValue([]),
      });

      await expect(service.getStatus()).resolves.toBeNull();
    });

    it('reports the in-flight job as RUNNING', async () => {
      const inFlight = makeJob({ getState: jest.fn().mockResolvedValue('active') });
      const { service } = buildService({
        getJobs: jest.fn().mockResolvedValue([inFlight]),
      });

      const status = await service.getStatus();
      expect(status?.status).toBe('RUNNING');
    });

    it('reports a completed job with its exitCode once nothing is in flight', async () => {
      const completed = makeJob({
        id: 'crawl-3',
        finishedOn: 2000,
        returnvalue: { exitCode: 0 },
        getState: jest.fn().mockResolvedValue('completed'),
      });
      const { service } = buildService({
        // First call (in-flight scan) empty, second/third calls (finished scan) return the job.
        getJobs: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([completed])
          .mockResolvedValueOnce([]),
      });

      const status = await service.getStatus();
      expect(status).toEqual({
        jobId: 'crawl-3',
        status: 'COMPLETED',
        startedAt: new Date(1000).toISOString(),
        finishedAt: new Date(2000).toISOString(),
        exitCode: 0,
        error: null,
      });
    });

    it('reports a failed job with its error once nothing is in flight', async () => {
      const failed = makeJob({
        id: 'crawl-4',
        finishedOn: 3000,
        failedReason: 'worker exited with code 1',
        getState: jest.fn().mockResolvedValue('failed'),
      });
      const { service } = buildService({
        getJobs: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([failed]),
      });

      const status = await service.getStatus();
      expect(status?.status).toBe('FAILED');
      expect(status?.error).toBe('worker exited with code 1');
    });
  });
});
