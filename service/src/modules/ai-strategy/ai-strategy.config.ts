import * as path from 'path';

/**
 * Python interpreter for the validation/execution workers in
 * workers/ai-strategy/. Defaults to the same venv the news worker already
 * set up (workers/news/.venv) — validate.py/run.py only use the Python
 * standard library (ast, json, signal), so no extra dependency install is
 * needed there. Never hard-code an absolute machine path; override via
 * AI_STRATEGY_PYTHON_BIN for a different environment (e.g. a dedicated venv).
 */
export function getAiStrategyPythonBin(): string {
  return (
    process.env.AI_STRATEGY_PYTHON_BIN ??
    path.resolve(process.cwd(), '..', 'workers', 'news', '.venv', 'bin', 'python')
  );
}

export function getAiStrategyWorkerDir(): string {
  return process.env.AI_STRATEGY_WORKER_DIR ?? path.resolve(process.cwd(), '..', 'workers', 'ai-strategy');
}

// The smoke run inside validate.py already bounds itself to 5s via
// signal.alarm; this is the outer process-level bound (interpreter
// startup + AST work + the smoke run), matching the
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

// Caps how much stdout we buffer from the worker process, so a strategy
// that returns a pathologically large payload cannot grow this in-memory
// buffer unboundedly.
export function getMaxOutputBytes(): number {
  const configured = Number(process.env.AI_STRATEGY_MAX_OUTPUT_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 5_000_000;
}

export const MAX_PROMPT_LENGTH = 1000;
