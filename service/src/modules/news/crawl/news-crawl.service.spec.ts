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

  it('resolves with exitCode 0 when the worker exits 0', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const promise = service.execute();
    child.emit('close', 0, null);

    await expect(promise).resolves.toEqual({ exitCode: 0 });
  });

  it('rejects with captured stderr when the worker exits non-zero', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const promise = service.execute();
    child.stderr.emit('data', Buffer.from('psycopg2.OperationalError: could not connect\n'));
    child.emit('close', 1, null);

    await expect(promise).rejects.toThrow('could not connect');
  });

  it('rejects when spawning the process itself errors (e.g. bad interpreter path)', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const promise = service.execute();
    child.emit('error', new Error('ENOENT'));

    await expect(promise).rejects.toThrow('ENOENT');
  });

  it('kills the worker and rejects after exceeding the configured timeout', async () => {
    jest.useFakeTimers();
    process.env.NEWS_WORKER_TIMEOUT_MS = '1000';
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const promise = service.execute();
    const assertion = expect(promise).rejects.toThrow('timeout');
    jest.advanceTimersByTime(1001);
    await assertion;

    expect(child.killed).toBe(true);

    delete process.env.NEWS_WORKER_TIMEOUT_MS;
    jest.useRealTimers();
  });
});
