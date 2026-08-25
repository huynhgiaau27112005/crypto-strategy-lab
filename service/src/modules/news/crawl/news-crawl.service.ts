import { Injectable, Logger } from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import { getPythonBin, getTimeoutMs, getWorkerDir, getWorkerScript } from './news-crawl.config';

export type NewsCrawlStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface NewsCrawlJob {
  jobId: string;
  status: NewsCrawlStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  /** Non-null only when status is FAILED — the reason a caller should show. */
  error: string | null;
}

// Capped so a runaway stderr stream from the worker cannot grow this
// in-memory buffer unboundedly for the lifetime of a long crawl.
const MAX_STDERR_CHARS = 8000;

/**
 * Launches the Python news worker (workers/news/main.py) as a separate OS
 * process and tracks its status in memory — never runs the crawl in-process
 * inside the Nest API. This is ADR-005 (artifacts/decisions.md §7): Crawler
 * and Sentiment are their own process, the API only launches/queues it and
 * returns immediately with a job id for the client to poll.
 *
 * Job state lives in memory only (a single `currentJob` slot), which is
 * enough for this project's single-instance API process — it does not
 * survive a restart, and is not shared across horizontally-scaled
 * instances. That is an accepted limitation, not an oversight: adding a
 * persisted job table/queue is out of scope here (no new migration; see
 * the news table note in the task brief) and unnecessary for a
 * single-process demo deployment.
 */
@Injectable()
export class NewsCrawlService {
  private readonly logger = new Logger(NewsCrawlService.name);
  private currentJob: NewsCrawlJob | null = null;
  private jobCounter = 0;

  /**
   * Starts a crawl, or — if one is already RUNNING — returns that same job
   * instead of spawning a second crawler over the same sources
   * concurrently. This is the "only one crawl at a time" requirement:
   * coalesce, don't reject-with-error, so a client that double-clicks the
   * trigger just gets the in-flight job's id back.
   */
  trigger(): NewsCrawlJob {
    if (this.currentJob?.status === 'RUNNING') {
      return this.currentJob;
    }

    const job: NewsCrawlJob = {
      jobId: `crawl-${Date.now()}-${++this.jobCounter}`,
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      error: null,
    };
    this.currentJob = job;

    this.spawnWorker(job);
    return job;
  }

  getStatus(): NewsCrawlJob | null {
    return this.currentJob;
  }

  private spawnWorker(job: NewsCrawlJob): void {
    const pythonBin = getPythonBin();
    const workerDir = getWorkerDir();
    const script = getWorkerScript();
    const timeoutMs = getTimeoutMs();

    let child: ChildProcess;
    try {
      child = spawn(pythonBin, [script], { cwd: workerDir, env: process.env });
    } catch (err) {
      this.finish(job, 'FAILED', null, `Failed to start worker process: ${this.errorMessage(err)}`);
      return;
    }

    let stderrBuf = '';
    let settled = false;
    let timedOut = false;

    // Bounds the run: an unbounded child process here would be exactly the
    // "uncontrolled infinite loop" anti-pattern this project's docs forbid.
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      this.logger.warn(`News crawl ${job.jobId} exceeded ${timeoutMs}ms; killing worker process.`);
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
      this.finish(job, 'FAILED', null, `Worker process error: ${this.errorMessage(err)}`);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        this.finish(job, 'FAILED', code, `Worker killed after exceeding timeout of ${timeoutMs}ms.`);
        return;
      }
      if (code === 0) {
        this.finish(job, 'COMPLETED', code, null);
        return;
      }
      // Real exit code + captured stderr, not a silently-swallowed failure.
      const reason = stderrBuf.trim() || `Worker exited with code ${code}.`;
      this.finish(job, 'FAILED', code, reason);
    });
  }

  private finish(job: NewsCrawlJob, status: NewsCrawlStatus, exitCode: number | null, error: string | null): void {
    job.status = status;
    job.exitCode = exitCode;
    job.error = error;
    job.finishedAt = new Date().toISOString();
    if (status === 'FAILED') {
      this.logger.error(`News crawl ${job.jobId} failed: ${error}`);
    } else {
      this.logger.log(`News crawl ${job.jobId} completed.`);
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
