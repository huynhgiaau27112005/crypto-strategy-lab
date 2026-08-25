import { EventEmitter } from 'events';

const spawnMock = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { NewsCrawlService } from './news-crawl.service';

class FakeChildProcess extends EventEmitter {
  stderr = new EventEmitter();
  killed = false;
  kill(signal?: string) {
    this.killed = true;
    // Simulate the OS actually terminating the process: a real SIGKILL
    // eventually fires a 'close' event too.
    this.emit('close', null, signal ?? 'SIGKILL');
  }
}

describe('NewsCrawlService', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    jest.useRealTimers();
  });

  it('returns a RUNNING job immediately on trigger, without waiting for the process to exit', () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const job = service.trigger();

    expect(job.status).toBe('RUNNING');
    expect(job.jobId).toBeTruthy();
    expect(job.exitCode).toBeNull();
  });

  it('marks the job COMPLETED when the worker exits 0', () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const job = service.trigger();
    child.emit('close', 0, null);

    expect(job.status).toBe('COMPLETED');
    expect(job.exitCode).toBe(0);
    expect(job.error).toBeNull();
    expect(service.getStatus()).toEqual(job);
  });

  it('marks the job FAILED and captures stderr when the worker exits non-zero', () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const job = service.trigger();
    child.stderr.emit('data', Buffer.from('psycopg2.OperationalError: could not connect\n'));
    child.emit('close', 1, null);

    expect(job.status).toBe('FAILED');
    expect(job.exitCode).toBe(1);
    expect(job.error).toContain('could not connect');
  });

  it('marks the job FAILED when spawning the process itself errors (e.g. bad interpreter path)', () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const job = service.trigger();
    child.emit('error', new Error('ENOENT'));

    expect(job.status).toBe('FAILED');
    expect(job.error).toContain('ENOENT');
  });

  it('coalesces a second trigger while a crawl is RUNNING instead of spawning a parallel process', () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const first = service.trigger();
    const second = service.trigger();

    expect(second).toBe(first);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('spawns a new process for a fresh trigger once the previous job has finished', () => {
    const child1 = new FakeChildProcess();
    const child2 = new FakeChildProcess();
    spawnMock.mockReturnValueOnce(child1).mockReturnValueOnce(child2);
    const service = new NewsCrawlService();

    const first = service.trigger();
    child1.emit('close', 0, null);

    const second = service.trigger();

    expect(second.jobId).not.toBe(first.jobId);
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('kills the worker and marks the job FAILED after exceeding the configured timeout', () => {
    jest.useFakeTimers();
    process.env.NEWS_WORKER_TIMEOUT_MS = '1000';
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const job = service.trigger();
    jest.advanceTimersByTime(1001);

    expect(child.killed).toBe(true);
    expect(job.status).toBe('FAILED');
    expect(job.error).toContain('timeout');

    delete process.env.NEWS_WORKER_TIMEOUT_MS;
    jest.useRealTimers();
  });
});
