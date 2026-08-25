import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { NEWS_CRAWL_QUEUE } from '../../../queue/queue.constants';
import { withTimeout } from '../../../queue/with-timeout';
import { getCorrelationId } from '../../../observability/correlation/correlation-context';

export type NewsCrawlStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface NewsCrawlJob {
  jobId: string;
  status: NewsCrawlStatus;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
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
    if (active) return this.toJobStatus(active);

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
    const status: NewsCrawlStatus =
      state === 'completed' ? 'COMPLETED' : state === 'failed' ? 'FAILED' : 'RUNNING';
    return {
      jobId: String(job.id),
      status,
      startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      exitCode: job.returnvalue?.exitCode ?? null,
      error: status === 'FAILED' ? job.failedReason ?? null : null,
    };
  }
}
