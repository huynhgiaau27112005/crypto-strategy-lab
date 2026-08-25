import { EventEmitter } from 'events';

const spawnMock = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { runPythonWorker, PythonProcessError } from './python-process.util';

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { write: jest.fn(), end: jest.fn(), on: jest.fn() };
  killed = false;
  kill(signal?: string) {
    this.killed = true;
    this.emit('close', null, signal ?? 'SIGKILL');
  }
}

describe('runPythonWorker', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    jest.useRealTimers();
  });

  it('resolves with the parsed JSON from stdout on a clean exit', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runPythonWorker('validate.py', { source: 'x' }, 5000);
    child.stdout.emit('data', Buffer.from(JSON.stringify({ valid: true })));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({ valid: true });
    expect(child.stdin.write).toHaveBeenCalledWith(JSON.stringify({ source: 'x' }));
  });

  it('rejects with the captured stderr when the worker exits non-zero', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runPythonWorker('run.py', {}, 5000);
    child.stderr.emit('data', Buffer.from('Traceback: boom'));
    child.emit('close', 1);

    await expect(promise).rejects.toBeInstanceOf(PythonProcessError);
    await expect(promise).rejects.toMatchObject({ message: expect.stringContaining('Traceback: boom') });
  });

  it('kills the process and rejects when it exceeds the timeout — never hangs forever', async () => {
    jest.useFakeTimers();
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runPythonWorker('validate.py', {}, 1000);
    jest.advanceTimersByTime(1000);
    // Flush the fake timer's kill() -> close event through microtasks.
    await Promise.resolve();

    await expect(promise).rejects.toMatchObject({ message: expect.stringContaining('exceeded 1000ms') });
    expect(child.killed).toBe(true);
    jest.useRealTimers();
  });

  it('rejects when stdout is not valid JSON', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runPythonWorker('validate.py', {}, 5000);
    child.stdout.emit('data', Buffer.from('not json'));
    child.emit('close', 0);

    await expect(promise).rejects.toMatchObject({ message: expect.stringContaining('did not return valid JSON') });
  });

  it('rejects when the output exceeds the configured size cap', async () => {
    process.env.AI_STRATEGY_MAX_OUTPUT_BYTES = '10';
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runPythonWorker('validate.py', {}, 5000);
    child.stdout.emit('data', Buffer.from('a'.repeat(100)));
    child.emit('close', 0);

    await expect(promise).rejects.toMatchObject({ message: expect.stringContaining('exceeded') });
    delete process.env.AI_STRATEGY_MAX_OUTPUT_BYTES;
  });
});
