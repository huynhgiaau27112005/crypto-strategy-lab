import { spawn } from 'child_process';
import { describeSpawnFailure } from '../../common/python-bin';
import {
  AI_STRATEGY_PYTHON_BIN_ENV,
  getAiStrategyPythonBin,
  getAiStrategyWorkerDir,
  getMaxOutputBytes,
} from './ai-strategy.config';

export class PythonProcessError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'PythonProcessError';
  }
}

/**
 * Runs one of the workers/ai-strategy/*.py scripts as a subprocess: writes
 * `payload` as JSON on stdin, reads one JSON object back from stdout.
 *
 * Bounded on every axis the task requires:
 * - hard wall-clock timeout (`timeoutMs`) — SIGKILL on overrun, never lets
 *   a hung/looping strategy run forever (the project's anti-pattern list
 *   names "uncontrolled infinite loop" explicitly);
 * - stdout size cap (`getMaxOutputBytes`) — a pathological return value
 *   cannot grow this process's memory unboundedly;
 * - non-zero exit surfaced as a real thrown error with the captured
 *   stderr, never swallowed.
 *
 * This subprocess boundary is a validation/execution gate, not a security
 * sandbox — see workers/ai-strategy/sandbox.py and artifacts/ai-strategy.md.
 */
export function runPythonWorker<T>(script: string, payload: unknown, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const pythonBin = getAiStrategyPythonBin();
    const workerDir = getAiStrategyWorkerDir();
    const maxOutputBytes = getMaxOutputBytes();

    let child;
    try {
      child = spawn(pythonBin, [script], { cwd: workerDir, env: process.env });
    } catch (err) {
      reject(
        new PythonProcessError(
          `Failed to start Python worker (${script}): ${errorMessage(err)}`,
          null,
          '',
        ),
      );
      return;
    }

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    timer.unref();

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length >= maxOutputBytes) {
        stdoutTruncated = true;
        return;
      }
      stdout += chunk.toString();
      if (stdout.length > maxOutputBytes) {
        stdoutTruncated = true;
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) {
        stderr = stderr.slice(stderr.length - 8000);
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new PythonProcessError(
          `Python worker process error (${script}): ${describeSpawnFailure(err, pythonBin, AI_STRATEGY_PYTHON_BIN_ENV)}`,
          null,
          stderr,
        ),
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        reject(
          new PythonProcessError(
            `Python worker (${script}) exceeded ${timeoutMs}ms and was killed.`,
            code,
            stderr,
          ),
        );
        return;
      }
      if (stdoutTruncated) {
        reject(
          new PythonProcessError(`Python worker (${script}) output exceeded ${maxOutputBytes} bytes.`, code, stderr),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new PythonProcessError(
            stderr.trim() || `Python worker (${script}) exited with code ${code}.`,
            code,
            stderr,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (err) {
        reject(
          new PythonProcessError(
            `Python worker (${script}) did not return valid JSON: ${errorMessage(err)}`,
            code,
            stderr,
          ),
        );
      }
    });

    child.stdin?.on('error', () => {
      // EPIPE if the child already exited (e.g. crashed before reading
      // stdin) — the 'close' handler above reports the real failure.
    });
    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

