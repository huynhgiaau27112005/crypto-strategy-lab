import * as path from 'path';
import { resolvePythonBin } from '../../../common/python-bin';

export const NEWS_PYTHON_BIN_ENV = 'NEWS_WORKER_PYTHON_BIN';

/**
 * The Python interpreter used to run the news crawler.
 *
 * Resolution (see `resolvePythonBin`, shared with the AI-strategy worker):
 * `NEWS_WORKER_PYTHON_BIN` -> the worker's own venv **if it exists**, in this
 * platform's layout -> a PATH interpreter. Paths are resolved relative to the
 * service's working directory (`service/`, per its `start`/`start:dev`
 * scripts) rather than __dirname, so it survives being run from either `src`
 * (ts-node) or `dist` (compiled) without pointing at the wrong tree.
 *
 * This used to return `<repo>/workers/news/.venv/bin/python` unconditionally:
 * POSIX-only, and for a venv that need not exist — so on Windows every crawl
 * failed with `spawn ... ENOENT` before the worker started.
 *
 * NOTE: unlike the AI-strategy worker (standard library only), this worker
 * needs real third-party packages (feedparser, beautifulsoup4, psycopg2, ...).
 * A PATH interpreter without them fails at import time, which is why
 * `workers/news/README.md` still describes creating the venv — the fallback
 * keeps the failure honest and readable, it does not conjure dependencies.
 */
export function getPythonBin(): string {
  const venvDir = path.resolve(process.cwd(), '..', 'workers', 'news', '.venv');
  return resolvePythonBin(venvDir, process.env[NEWS_PYTHON_BIN_ENV]);
}

export function getWorkerDir(): string {
  return process.env.NEWS_WORKER_DIR ?? path.resolve(process.cwd(), '..', 'workers', 'news');
}

export function getWorkerScript(): string {
  return process.env.NEWS_WORKER_SCRIPT ?? 'main.py';
}

// Hard ceiling on one crawl run: kills a hung/stuck worker rather than
// letting it run forever (docs/about-projects/03-anti-patterns-to-avoid.md
// names "uncontrolled infinite loop" explicitly). 10 minutes comfortably
// covers FinBERT weight loading (~5s) plus scoring ~30 short articles
// (~a few seconds) with headroom for slow RSS fetches.
export function getTimeoutMs(): number {
  const configured = Number(process.env.NEWS_WORKER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 10 * 60 * 1000;
}
