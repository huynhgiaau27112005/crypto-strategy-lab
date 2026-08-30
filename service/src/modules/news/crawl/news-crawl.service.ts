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

// Capped so a runaway stdout/stderr stream from the worker cannot grow
// these in-memory buffers unboundedly for the lifetime of a long crawl.
const MAX_OUTPUT_CHARS = 8000;

/** Prefix of the worker's machine-readable stdout line — see main.py. */
const SUMMARY_PREFIX = 'NEWS_CRAWL_SUMMARY ';

/**
 * How long a cancelled worker is given to exit on its own after SIGTERM
 * before it is SIGKILLed. The Python worker's only interruptible work is
 * HTTP fetches and a Postgres upsert, both of which unwind in well under a
 * second; this is generous headroom, not a guess at a long teardown.
 */
const CANCEL_GRACE_MS = 3000;

/** What one crawl run actually changed in the `news` table. */
export interface NewsCrawlSummary {
  /** Rows that did not exist before this run. */
  new: number;
  /** Rows that already existed and were merely refreshed. */
  updated: number;
  /** How many of the crawled articles the sentiment provider scored. */
  scored: number;
  /**
   * The provider that ACTUALLY scored this batch, not the one configured.
   * FinBERT degrades to the lexicon provider when its weights/deps are
   * absent, and the UI has to be able to name what really ran — claiming
   * "FinBERT" over lexicon labels would be a straight misreport.
   * Null when an older worker build produced no model field.
   */
  model: string | null;
}

export interface NewsCrawlResult {
  exitCode: number | null;
  /**
   * Null when the worker produced no summary line — it crashed before
   * reaching the end of `run()`, or an older worker build is deployed.
   * Never fabricated: "we do not know" and "zero new articles" are
   * genuinely different answers and the UI shows them differently.
   */
  summary: NewsCrawlSummary | null;
  /** True when the run ended because the user asked it to stop. */
  cancelled: boolean;
}

export interface NewsCrawlOptions {
  /**
   * Aborting this signal terminates the worker process (SIGTERM, then
   * SIGKILL after CANCEL_GRACE_MS) and makes `execute()` RESOLVE with
   * `cancelled: true` rather than reject — a user-requested stop is a
   * normal outcome, not a job failure.
   */
  signal?: AbortSignal;
}

/**
 * Launches the Python news worker (workers/news/main.py) as a separate OS
 * process — ADR-005 (artifacts/decisions.md §7): Crawler and Sentiment are
 * their own process, never crawled in-process here.
 *
 * `execute()` resolves once the worker exits 0 (or is cancelled), and
 * rejects (with the captured stderr, or a timeout/spawn-error message)
 * otherwise. It does not decide *when* a crawl runs or track status across
 * the API's lifetime any more — that moved to NewsCrawlQueueService,
 * backed by the "news-crawl" BullMQ queue (task-16). This method is the
 * "do the actual work" half that NewsCrawlProcessor (worker process only)
 * awaits: a rejection here is what makes BullMQ mark the job FAILED with a
 * meaningful reason, and (if the OS process itself dies) let it be retried
 * instead of leaving Postgres/Redis silently out of sync.
 */
@Injectable()
export class NewsCrawlService {
  private readonly logger = new Logger(NewsCrawlService.name);

  execute(options: NewsCrawlOptions = {}): Promise<NewsCrawlResult> {
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

      let stdoutBuf = '';
      let stderrBuf = '';
      let settled = false;
      let timedOut = false;
      let cancelled = false;
      let killTimer: NodeJS.Timeout | undefined;

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

      // The user pressed "Dừng Crawl". Before this existed, cancellation
      // only ever wrote a flag into the BullMQ job that nothing read, so
      // the Python process kept crawling for up to the full 10-minute
      // timeout while the UI claimed it had stopped.
      const onAbort = () => {
        if (settled || cancelled) return;
        cancelled = true;
        this.logger.log('News crawl cancelled by user; terminating worker process.');
        child.kill('SIGTERM');
        // A worker wedged inside a socket read will not notice SIGTERM.
        // Escalate rather than hang the queue on it.
        killTimer = setTimeout(() => {
          if (!settled) child.kill('SIGKILL');
        }, CANCEL_GRACE_MS);
        killTimer.unref();
      };

      const signal = options.signal;
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        signal?.removeEventListener('abort', onAbort);
      };

      const append = (buffer: string, chunk: Buffer): string => {
        const next = buffer + chunk.toString();
        return next.length > MAX_OUTPUT_CHARS
          ? next.slice(next.length - MAX_OUTPUT_CHARS)
          : next;
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuf = append(stdoutBuf, chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf = append(stderrBuf, chunk);
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(
          new Error(
            `Worker process error: ${describeSpawnFailure(err, pythonBin, NEWS_PYTHON_BIN_ENV)}`,
          ),
        );
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        cleanup();

        // Checked before the exit code: a SIGTERMed process exits
        // non-zero, and reporting the stop the user asked for as a crawl
        // FAILURE would be a lie the UI then has to explain away.
        if (cancelled) {
          this.logger.log('News crawl stopped on user request.');
          resolve({ exitCode: code, summary: this.parseSummary(stdoutBuf), cancelled: true });
          return;
        }
        if (timedOut) {
          reject(new Error(`Worker killed after exceeding timeout of ${timeoutMs}ms.`));
          return;
        }
        if (code === 0) {
          const summary = this.parseSummary(stdoutBuf);
          this.logger.log(
            summary
              ? `News crawl completed: ${summary.new} new, ${summary.updated} already stored.`
              : 'News crawl completed.',
          );
          resolve({ exitCode: code, summary, cancelled: false });
          return;
        }
        // Real exit code + captured stderr, not a silently-swallowed
        // failure.
        const reason = stderrBuf.trim() || `Worker exited with code ${code}.`;
        reject(new Error(reason));
      });
    });
  }

  /**
   * Reads the last `NEWS_CRAWL_SUMMARY {...}` line the worker printed.
   *
   * Scans backwards so a truncated buffer (only the tail is kept) still
   * finds the most recent complete line, and returns null on anything
   * unparseable — a malformed summary must degrade to "unknown", never
   * throw and turn a successful crawl into a failed job.
   */
  private parseSummary(stdout: string): NewsCrawlSummary | null {
    const lines = stdout.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index].trim();
      if (!line.startsWith(SUMMARY_PREFIX)) continue;
      try {
        const parsed = JSON.parse(line.slice(SUMMARY_PREFIX.length)) as Record<
          string,
          unknown
        >;
        const count = (value: unknown): number =>
          typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
        return {
          new: count(parsed.new),
          updated: count(parsed.updated),
          scored: count(parsed.scored),
          model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model : null,
        };
      } catch {
        return null;
      }
    }
    return null;
  }
}
