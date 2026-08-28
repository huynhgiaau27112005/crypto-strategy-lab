import * as fs from 'fs';
import * as path from 'path';

/**
 * Candidate interpreter locations inside a virtualenv, in the layout each
 * platform actually uses. Windows venvs put the executable in
 * `Scripts/python.exe`; POSIX venvs use `bin/python`.
 */
function venvInterpreters(venvDir: string): string[] {
  return process.platform === 'win32'
    ? [
        path.join(venvDir, 'Scripts', 'python.exe'),
        // A venv created under Git Bash / MSYS can still use the POSIX layout.
        path.join(venvDir, 'bin', 'python.exe'),
        path.join(venvDir, 'bin', 'python'),
      ]
    : [path.join(venvDir, 'bin', 'python'), path.join(venvDir, 'bin', 'python3')];
}

/** Interpreter name resolved from PATH — `python3` does not exist on a standard Windows install. */
export function systemPythonName(): string {
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Resolves the Python interpreter to spawn for a worker.
 *
 * Order, first hit wins:
 *  1. `override` (an env var) — used verbatim and never second-guessed; a
 *     deliberate choice must beat any auto-detection.
 *  2. `venvDir`, **if the interpreter is actually there**, in whichever
 *     layout this platform uses.
 *  3. A plain interpreter name resolved from `PATH`.
 *
 * ONE implementation, shared by every module that spawns Python (news
 * crawler, AI strategy validate/run). This existed twice, and both copies
 * hard-coded `<venv>/bin/python` unconditionally — a POSIX-only path, for a
 * venv that need not exist — so on Windows every spawn died with
 * `ENOENT`. Fixing one copy left the other broken, which is exactly why
 * there is only one now.
 */
export function resolvePythonBin(venvDir: string, override?: string): string {
  const explicit = override?.trim();
  if (explicit) return explicit;

  for (const candidate of venvInterpreters(venvDir)) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Unreadable path — treat as "not there" and keep looking.
    }
  }

  return systemPythonName();
}

/**
 * Turns a bare `spawn <path> ENOENT` into something the reader can act on.
 * ENOENT here means one thing only: the interpreter is not where we looked.
 * The raw message names the path but never says what to do about it.
 */
export function describeSpawnFailure(
  err: unknown,
  pythonBin: string,
  envVarName: string,
): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === 'ENOENT') {
    return (
      `Python interpreter not found at "${pythonBin}". ` +
      `Install Python 3.10+ and make sure it is on PATH, or set ${envVarName} ` +
      'to the interpreter to use (see service/.env.example).'
    );
  }
  return message;
}
