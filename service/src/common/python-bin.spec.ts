import * as path from 'path';

// `fs.existsSync` is non-configurable on the real module in this Node
// build, so it cannot be spied on in place — mock the module instead.
jest.mock('fs', () => ({ existsSync: jest.fn() }));

import * as fs from 'fs';
import { describeSpawnFailure, resolvePythonBin, systemPythonName } from './python-bin';

const existsSync = fs.existsSync as unknown as jest.Mock;

describe('resolvePythonBin', () => {
  const originalPlatform = process.platform;
  const VENV = path.resolve('/repo', 'workers', 'news', '.venv');

  function setPlatform(value: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  }

  beforeEach(() => {
    existsSync.mockReset();
    existsSync.mockReturnValue(false);
  });

  afterEach(() => setPlatform(originalPlatform));

  it('uses the override verbatim when set', () => {
    expect(resolvePythonBin(VENV, 'C:\Python313\python.exe')).toBe('C:\Python313\python.exe');
    expect(existsSync).not.toHaveBeenCalled();
  });

  it('ignores a blank override rather than spawning an empty command', () => {
    setPlatform('linux');
    expect(resolvePythonBin(VENV, '   ')).toBe('python3');
  });

  it('picks the Windows venv layout (Scripts/python.exe), not bin/python', () => {
    setPlatform('win32');
    const wanted = path.join(VENV, 'Scripts', 'python.exe');
    existsSync.mockImplementation((p: string) => p === wanted);
    expect(resolvePythonBin(VENV)).toBe(wanted);
  });

  it('picks the POSIX venv layout when it exists', () => {
    setPlatform('linux');
    const wanted = path.join(VENV, 'bin', 'python');
    existsSync.mockImplementation((p: string) => p === wanted);
    expect(resolvePythonBin(VENV)).toBe(wanted);
  });

  // The actual bug behind both "Validation worker could not run ... ENOENT"
  // and "Crawl thất bại: Worker process error: spawn ... ENOENT": the old
  // code returned <venv>/bin/python unconditionally, on Windows, for a venv
  // that did not exist.
  it('falls back to a PATH interpreter when no venv exists', () => {
    setPlatform('win32');
    expect(resolvePythonBin(VENV)).toBe('python');

    setPlatform('darwin');
    expect(resolvePythonBin(VENV)).toBe('python3');
  });

  it('names the platform-appropriate PATH interpreter', () => {
    setPlatform('win32');
    expect(systemPythonName()).toBe('python');
    setPlatform('linux');
    expect(systemPythonName()).toBe('python3');
  });
});

describe('describeSpawnFailure', () => {
  it('turns ENOENT into an actionable message naming the env var to set', () => {
    const err = Object.assign(new Error('spawn /x/python ENOENT'), { code: 'ENOENT' });
    const message = describeSpawnFailure(err, '/x/python', 'NEWS_WORKER_PYTHON_BIN');
    expect(message).toContain('/x/python');
    expect(message).toContain('NEWS_WORKER_PYTHON_BIN');
  });

  it('passes any other failure through unchanged', () => {
    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    expect(describeSpawnFailure(err, '/x/python', 'NEWS_WORKER_PYTHON_BIN')).toBe(
      'EACCES: permission denied',
    );
  });
});
