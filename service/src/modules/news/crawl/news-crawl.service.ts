import { Injectable, Logger } from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import { describeSpawnFailure } from '../../../common/python-bin';
import {
  NEWS_PYTHON_BIN_ENV,
  getPythonBin,
  getTimeoutMs,
  getWorkerDir,
  getWorkerScript,
} from './news-crawl.config';

// Capped so a runaway stderr stream from the worker cannot grow this
// in-memory buffer unboundedly for the lifetime of a long crawl.
const MAX_STDERR_CHARS = 8000;

export interface NewsCrawlResult {
  exitCode: number | null;
}

/**
 * Launches the Python news worker (workers/news/main.py) as a separate OS
 * process — ADR-005 (artifacts/decisions.md §7): Crawler and Sentiment are
 * their own process, never crawled in-process here.
 *
 * `execute()` resolves once the worker exits 0, and rejects (with the
 * captured stderr, or a timeout/spawn-error message) otherwise. It does
 * not decide *when* a crawl runs or track status across the API's
 * lifetime any more — that moved to NewsCrawlQueueService, backed by the
 * "news-crawl" BullMQ queue (task-16). This method is the "do the actual
 * work" half that NewsCrawlProcessor (worker process only) awaits: a
 * rejection here is what makes BullMQ mark the job FAILED with a
 * meaningful reason, and (if the OS process itself dies) let it be
 * retried instead of leaving Postgres/Redis silently out of sync.
 */
@Injectable()
export class NewsCrawlService {
  private readonly logger = new Logger(NewsCrawlService.name);

  execute(): Promise<NewsCrawlResult> {
    return new Promise((resolve, reject) => {
      const pythonBin = getPythonBin();
      const workerDir = getWorkerDir();
      const script = getWorkerScript();
      const timeoutMs = getTimeoutMs();

      let child: ChildProcess;
      try {
        child = spawn(pythonBin, [script], { cwd: workerDir, env: process.env });
      } catch (err) {
        reject(
          new Error(
            `Failed to start worker process: ${describeSpawnFailure(err, pythonBin, NEWS_PYTHON_BIN_ENV)}`,
          ),
        );
        return;
      }

      let stderrBuf = '';
      let settled = false;
      let timedOut = false;

      // Bounds the run: an unbounded child process here would be exactly
      // the "uncontrolled infinite loop" anti-pattern this project's docs
      // forbid.
      const timer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        this.logger.warn(`News crawl exceeded ${timeoutMs}ms; killing worker process.`);
        child.kill('SIGKILL');
      }, timeoutMs);
      timer.unref();

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.length > MAX_STDERR_CHARS) {
          stderrBuf = stderrBuf.slice(stderrBuf.length - MAX_STDERR_CHARS);
        }
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new Error(
            `Worker process error: ${describeSpawnFailure(err, pythonBin, NEWS_PYTHON_BIN_ENV)}`,
          ),
        );
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (timedOut) {
          reject(new Error(`Worker killed after exceeding timeout of ${timeoutMs}ms.`));
          return;
        }
        if (code === 0) {
          this.logger.log('News crawl completed.');
          resolve({ exitCode: code });
          return;
        }
        // Real exit code + captured stderr, not a silently-swallowed
        // failure.
        const reason = stderrBuf.trim() || `Worker exited with code ${code}.`;
        reject(new Error(reason));
      });
    });
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
