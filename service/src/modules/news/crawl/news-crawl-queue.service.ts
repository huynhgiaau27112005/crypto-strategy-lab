import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { NEWS_CRAWL_QUEUE } from '../../../queue/queue.constants';
import { withTimeout } from '../../../queue/with-timeout';
import { getCorrelationId } from '../../../observability/correlation/correlation-context';
import { NewsCrawlSummary } from './news-crawl.service';

export type NewsCrawlStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  /**
   * The run ended because the user pressed "Dừng Crawl". Distinct from
   * FAILED on purpose: a stop the user asked for is not an error, and
   * showing it as one would send them hunting for a problem that does not
   * exist.
   */
  | 'CANCELLED';

export interface NewsCrawlJob {
  jobId: string;
  status: NewsCrawlStatus;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  /**
   * True while a stop has been requested but the worker has not exited
   * yet, so the UI can say "Đang dừng…" instead of either lying that it
   * already stopped or looking frozen.
   */
  stopping: boolean;
  /**
   * What the last finished run actually wrote. Null while a run is still
   * in flight, and also when the worker produced no summary (crash, or an
   * older worker build) — the UI must not render "0 tin mới" for
   * "unknown".
   */
  summary: NewsCrawlSummary | null;
}

const IN_FLIGHT_STATES = [
  'active',
  'waiting',
  'delayed',
  'waiting-children',
  'prioritized',
] as const;

/**
 * Producer + status-reader for the "news-crawl" BullMQ queue. Replaces the
 * old in-memory `currentJob` map (task-16): job state now lives in Redis,
 * so a restarted API process reads exactly the state a still-running
 * worker is updating, instead of losing it.
 *
 * "One crawl at a time" (task-16 requirement): trigger() scans for an
 * already in-flight job before adding a new one, coalescing a double
 * POST /news/crawl into the same job id rather than spawning a second
 * crawler over the same sources. See SearchQueueService's doc comment for
 * why this scan-and-coalesce approach is used instead of a fixed jobId.
 */
@Injectable()
export class NewsCrawlQueueService {
  constructor(@InjectQueue(NEWS_CRAWL_QUEUE) private readonly queue: Queue) {}

  async trigger(): Promise<NewsCrawlJob> {
    const active = await withTimeout(this.findInFlightJob());
    // Coalesce onto the in-flight job — EXCEPT one that is already
    // stopping. Handing that job back would answer "start crawling" with
    // a job about to terminate, and the UI would show a crawl that
    // immediately stops. Queueing a fresh one instead is correct and needs
    // no race against the cancel flag: concurrency is 1, so it simply
    // waits for the cancelling job to exit and then runs.
    if (active && !active.data?.cancelRequested) return this.toJobStatus(active);

    const correlationId = getCorrelationId() ?? randomUUID();
    const job = await withTimeout(
      this.queue.add(
        'crawl',
        { correlationId },
        {
          jobId: `crawl-${Date.now()}`,
          // A blind retry risks re-crawling the same sources back-to-back
          // (double work, not idempotent). NewsCrawlService.execute()
          // already bounds itself with a hard timeout+kill; a failed
          // crawl surfaces as FAILED and a human/cron can trigger a fresh
          // one, rather than BullMQ silently retrying.
          attempts: 1,
          removeOnComplete: { count: 20 },
          removeOnFail: { count: 20 },
        },
      ),
    );
    return this.toJobStatus(job);
  }

  // Polled by the client after trigger() — null before any crawl has ever
  // been triggered against this queue.
  async getStatus(): Promise<NewsCrawlJob | null> {
    const active = await withTimeout(this.findInFlightJob());
    if (active) return this.toJobStatus(active);
    const latest = await withTimeout(this.findLatestFinishedJob());
    return latest ? this.toJobStatus(latest) : null;
  }

  /**
   * Stops the current crawl on the user's command.
   *
   * A queued job is removed outright. A job already executing inside the
   * worker is marked for cooperative cancellation: NewsCrawlProcessor
   * polls this flag (once a second) and aborts the crawl, which SIGTERMs
   * the spawned Python process. `getStatus()` reports `stopping: true`
   * between the request and the worker actually exiting, so the UI can
   * show the real intermediate state rather than claiming an instant halt.
   *
   * Before the processor learned to read this flag, writing it here was
   * the whole of "cancellation" — nothing consumed it, so pressing "Dừng
   * Crawl" left the crawler running for up to its full 10-minute timeout.
   */
  async cancel(): Promise<{ cancelled: boolean; state: string | null }> {
    const job = await this.findInFlightJob();
    if (!job) return { cancelled: false, state: null };
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'prioritized') {
      await job.remove();
      return { cancelled: true, state };
    }
    // Active: cooperative stop. The processor polls this flag (see
    // NewsCrawlProcessor.checkCancelled) and terminates the worker
    // process; the worker's own upsert runs in a single transaction, so a
    // mid-run termination cannot leave half-written rows behind.
    await job.updateData({ ...(job.data ?? {}), cancelRequested: true });
    return { cancelled: true, state };
  }

  private async findInFlightJob(): Promise<Job | undefined> {
    const jobs = await this.queue.getJobs([...IN_FLIGHT_STATES]);
    return jobs[0];
  }

  private async findLatestFinishedJob(): Promise<Job | undefined> {
    const [completed, failed] = await Promise.all([
      this.queue.getJobs(['completed'], 0, 20),
      this.queue.getJobs(['failed'], 0, 20),
    ]);
    const all = [...completed, ...failed];
    if (all.length === 0) return undefined;
    all.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));
    return all[0];
  }

  private async toJobStatus(job: Job): Promise<NewsCrawlJob> {
    const state = await job.getState();
    // A cancelled worker still exits and BullMQ still marks the job
    // 'completed' (execute() resolves rather than rejects — see its doc
    // comment), so the distinction has to come from the return value.
    const cancelled = Boolean(job.returnvalue?.cancelled);
    const status: NewsCrawlStatus =
      state === 'completed'
        ? cancelled
          ? 'CANCELLED'
          : 'COMPLETED'
        : state === 'failed'
          ? 'FAILED'
          : 'RUNNING';
    return {
      jobId: String(job.id),
      status,
      startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      exitCode: job.returnvalue?.exitCode ?? null,
      error: status === 'FAILED' ? job.failedReason ?? null : null,
      stopping: status === 'RUNNING' && Boolean(job.data?.cancelRequested),
      summary: (job.returnvalue?.summary as NewsCrawlSummary | undefined) ?? null,
    };
  }
}
