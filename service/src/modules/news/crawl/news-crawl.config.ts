import * as path from 'path';

// The Python interpreter must never be hard-coded to one machine's absolute
// path (env var makes it configurable per environment). The default matches
// the venv set up in workers/news/README.md, resolved relative to the
// service's own working directory (`service/`, per its `start`/`start:dev`
// scripts) rather than __dirname, so it survives being run from either
// `src` (ts-node) or `dist` (compiled) without pointing at the wrong tree.
export function getPythonBin(): string {
  return (
    process.env.NEWS_WORKER_PYTHON_BIN ??
    path.resolve(process.cwd(), '..', 'workers', 'news', '.venv', 'bin', 'python')
  );
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
