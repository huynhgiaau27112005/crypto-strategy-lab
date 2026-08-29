import * as path from 'path';
import { resolvePythonBin } from '../../common/python-bin';

export const AI_STRATEGY_PYTHON_BIN_ENV = 'AI_STRATEGY_PYTHON_BIN';

/**
 * Python interpreter for the validation/execution workers in
 * workers/ai-strategy/.
 *
 * Resolution order is shared with the news crawler — see `resolvePythonBin`:
 * `AI_STRATEGY_PYTHON_BIN` -> the news worker's venv if it exists (in this
 * platform's layout) -> a PATH interpreter.
 *
 * The PATH fallback is fully sufficient here, unlike for the news crawler:
 * validate.py/run.py only use the standard library (ast, json, signal,
 * threading), so any CPython 3.10+ works and the venv is a convenience.
 */
export function getAiStrategyPythonBin(): string {
  const venvDir = path.resolve(process.cwd(), '..', 'workers', 'news', '.venv');
  return resolvePythonBin(venvDir, process.env[AI_STRATEGY_PYTHON_BIN_ENV]);
}

export function getAiStrategyWorkerDir(): string {
  return process.env.AI_STRATEGY_WORKER_DIR ?? path.resolve(process.cwd(), '..', 'workers', 'ai-strategy');
}

// The smoke run inside validate.py already bounds itself to 5s (SIGALRM on
// POSIX, a watchdog thread on Windows); this is the outer process-level
// bound (interpreter startup + AST work + the smoke run), matching the
// "uncontrolled infinite loop" anti-pattern this project forbids.
export function getValidateTimeoutMs(): number {
  const configured = Number(process.env.AI_STRATEGY_VALIDATE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 10_000;
}

// run.py bounds itself to 20s internally; give it headroom for interpreter
// startup plus a larger real candle series than the smoke run's 30 rows.
export function getRunTimeoutMs(): number {
  const configured = Number(process.env.AI_STRATEGY_RUN_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 30_000;
}

export function getGenerateTimeoutMs(): number {
  const configured = Number(process.env.AI_STRATEGY_GENERATE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 90_000;
}

// Caps how much stdout we buffer from the worker process, so a strategy
// that returns a pathologically large payload cannot grow this in-memory
// buffer unboundedly.
export function getMaxOutputBytes(): number {
  const configured = Number(process.env.AI_STRATEGY_MAX_OUTPUT_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 5_000_000;
}

export const MAX_PROMPT_LENGTH = 1000;
