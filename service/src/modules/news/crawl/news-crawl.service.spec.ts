import { EventEmitter } from 'events';

const spawnMock = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { NewsCrawlService } from './news-crawl.service';

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  signals: string[] = [];
  kill(signal?: string) {
    this.killed = true;
    this.signals.push(signal ?? 'SIGKILL');
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

    await expect(promise).resolves.toEqual({
      exitCode: 0,
      summary: null,
      cancelled: false,
    });
  });

  // The counts are the whole point of the summary line: a crawl that
  // writes 0 new rows because the RSS feed has not moved is a SUCCESS, and
  // without this the UI cannot tell it from a broken crawler.
  it('parses the worker summary line off stdout', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const promise = service.execute();
    child.stdout.emit(
      'data',
      Buffer.from(
        'NEWS_CRAWL_SUMMARY {"new": 3, "updated": 39, "scored": 42, "model": "lexicon-v1"}\n',
      ),
    );
    child.emit('close', 0, null);

    await expect(promise).resolves.toEqual({
      exitCode: 0,
      summary: { new: 3, updated: 39, scored: 42, model: 'lexicon-v1' },
      cancelled: false,
    });
  });

  // FinBERT silently degrading to the lexicon provider is the exact case
  // the UI must be able to name, so the model has to survive the hop from
  // the worker's stdout to the job result.
  it('reports model null when an older worker prints a summary without one', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const promise = service.execute();
    child.stdout.emit(
      'data',
      Buffer.from('NEWS_CRAWL_SUMMARY {"new": 1, "updated": 2, "scored": 3}\n'),
    );
    child.emit('close', 0, null);

    await expect(promise).resolves.toMatchObject({
      summary: { new: 1, updated: 2, scored: 3, model: null },
    });
  });

  // "unknown" and "zero new articles" are different answers; a worker that
  // died before printing its summary must not be reported as a clean run
  // that found nothing.
  it('reports summary null when the worker printed no summary line', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();

    const promise = service.execute();
    child.stdout.emit('data', Buffer.from('some unrelated output\n'));
    child.emit('close', 0, null);

    await expect(promise).resolves.toMatchObject({ summary: null });
  });

  // Before this, cancellation wrote a flag into the BullMQ job that nothing
  // read, so "Dừng Crawl" left the Python worker running for up to its full
  // 10-minute timeout.
  it('terminates the worker when the abort signal fires', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();
    const controller = new AbortController();

    const promise = service.execute({ signal: controller.signal });
    controller.abort();

    await expect(promise).resolves.toMatchObject({ cancelled: true });
    expect(child.signals[0]).toBe('SIGTERM');
  });

  // A user-requested stop is a normal outcome. Rejecting here would make
  // BullMQ mark the job FAILED and the UI show an error the user caused on
  // purpose.
  it('resolves rather than rejects when cancelled, even though the worker exits non-zero', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const service = new NewsCrawlService();
    const controller = new AbortController();

    const promise = service.execute({ signal: controller.signal });
    controller.abort();

    await expect(promise).resolves.toMatchObject({ cancelled: true });
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
