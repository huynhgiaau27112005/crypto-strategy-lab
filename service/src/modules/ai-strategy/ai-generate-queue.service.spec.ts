import { ConflictException } from '@nestjs/common';
import { AiGenerateQueueService } from './ai-generate-queue.service';

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1-gen-1',
    data: { userId: 'u1', prompt: 'MA cross', correlationId: 'c1' },
    processedOn: 1000,
    finishedOn: null,
    returnvalue: undefined,
    failedReason: null,
    getState: jest.fn().mockResolvedValue('active'),
    ...overrides,
  };
}

describe('AiGenerateQueueService', () => {
  function buildService(queueOverrides: Record<string, unknown> = {}) {
    const queue = {
      add: jest.fn(),
      getJobs: jest.fn().mockResolvedValue([]),
      ...queueOverrides,
    };
    const service = new AiGenerateQueueService(queue as any);
    return { service, queue };
  }

  describe('enqueue()', () => {
    it('adds a generate job with the required per-user id and options', async () => {
      const added = makeJob({ getState: jest.fn().mockResolvedValue('waiting') });
      const { service, queue } = buildService({
        add: jest.fn().mockResolvedValue(added),
      });

      const result = await service.enqueue('u1', 'MA cross');

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        'generate',
        expect.objectContaining({ userId: 'u1', prompt: 'MA cross' }),
        {
          jobId: expect.stringMatching(/^u1-gen-\d+$/),
          attempts: 1,
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 50 },
        },
      );
      expect(queue.add.mock.calls[0][2].jobId).not.toContain(':');
      expect(result.jobId).toBe('u1-gen-1');
    });

    it('rejects a second in-flight job for the same user', async () => {
      const { service, queue } = buildService({
        getJobs: jest.fn().mockResolvedValue([makeJob()]),
      });

      await expect(service.enqueue('u1', 'RSI')).rejects.toEqual(
        new ConflictException('A generate job is already running for this account.'),
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('allows enqueue when the in-flight job belongs to another user', async () => {
      const otherUserJob = makeJob({
        data: { userId: 'u2', prompt: 'RSI', correlationId: 'c2' },
      });
      const added = makeJob({ getState: jest.fn().mockResolvedValue('waiting') });
      const { service, queue } = buildService({
        getJobs: jest.fn().mockResolvedValue([otherUserJob]),
        add: jest.fn().mockResolvedValue(added),
      });

      await service.enqueue('u1', 'MA cross');

      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus()', () => {
    it('returns null when the user has no jobs', async () => {
      const { service } = buildService();

      await expect(service.getStatus('u1')).resolves.toBeNull();
    });

    it('returns the current user in-flight job as RUNNING', async () => {
      const { service } = buildService({
        getJobs: jest.fn().mockResolvedValue([makeJob()]),
      });

      await expect(service.getStatus('u1')).resolves.toEqual({
        jobId: 'u1-gen-1',
        status: 'RUNNING',
        prompt: 'MA cross',
        startedAt: new Date(1000).toISOString(),
        finishedAt: null,
        error: null,
        result: null,
      });
    });

    it('never returns another user job from in-flight or completed states', async () => {
      const otherInFlight = makeJob({
        data: { userId: 'u2', prompt: 'Other active', correlationId: 'c2' },
      });
      const otherCompleted = makeJob({
        data: { userId: 'u2', prompt: 'Other done', correlationId: 'c3' },
        finishedOn: 2000,
        getState: jest.fn().mockResolvedValue('completed'),
      });
      const { service } = buildService({
        getJobs: jest.fn().mockImplementation((states: string[]) => {
          if (states.includes('active')) return Promise.resolve([otherInFlight]);
          if (states[0] === 'completed') return Promise.resolve([otherCompleted]);
          return Promise.resolve([]);
        }),
      });

      await expect(service.getStatus('u1')).resolves.toBeNull();
    });

    it('returns the latest completed job with its result', async () => {
      const result = {
        code: 'def generate_signals(candles): pass',
        raw: 'raw response',
        providerName: 'fake',
        validation: { valid: true, checks: [] },
      };
      const completed = makeJob({
        finishedOn: 2000,
        returnvalue: result,
        getState: jest.fn().mockResolvedValue('completed'),
      });
      const { service } = buildService({
        getJobs: jest.fn().mockImplementation((states: string[]) => {
          if (states[0] === 'completed') return Promise.resolve([completed]);
          return Promise.resolve([]);
        }),
      });

      await expect(service.getStatus('u1')).resolves.toEqual({
        jobId: 'u1-gen-1',
        status: 'COMPLETED',
        prompt: 'MA cross',
        startedAt: new Date(1000).toISOString(),
        finishedAt: new Date(2000).toISOString(),
        error: null,
        result,
      });
    });

    it('returns the latest failed job with its error and no result', async () => {
      const failed = makeJob({
        finishedOn: 3000,
        failedReason: 'provider unavailable',
        returnvalue: { code: 'must not leak' },
        getState: jest.fn().mockResolvedValue('failed'),
      });
      const { service } = buildService({
        getJobs: jest.fn().mockImplementation((states: string[]) => {
          if (states[0] === 'failed') return Promise.resolve([failed]);
          return Promise.resolve([]);
        }),
      });

      const status = await service.getStatus('u1');

      expect(status?.status).toBe('FAILED');
      expect(status?.error).toBe('provider unavailable');
      expect(status?.result).toBeNull();
    });
  });
});
