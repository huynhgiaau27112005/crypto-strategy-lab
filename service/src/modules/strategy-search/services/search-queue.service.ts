import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { SEARCH_QUEUE } from '../../../queue/queue.constants';
import { withTimeout } from '../../../queue/with-timeout';

export interface SearchJobData {
  experimentId: string;
}

const IN_FLIGHT_STATES = [
  'active',
  'waiting',
  'delayed',
  'waiting-children',
  'prioritized',
] as const;

/**
 * Producer-side wrapper around the "search" BullMQ queue — the only place
 * in the API process that touches this queue's Queue instance.
 *
 * "One search per experiment at a time" (task-16 requirement) is enforced
 * here by scanning in-flight jobs for a matching experimentId before
 * adding a new one, rather than reusing a fixed jobId = experimentId
 * across calls. A fixed jobId cannot be reused for this: BullMQ silently
 * no-ops `add()` for a jobId that already exists, *including* one that
 * already finished — verified empirically against the project's Redis
 * (see artifacts/queue.md "Why not jobId = experimentId"). That would
 * make extend() a no-op instead of running the extra iterations. A fresh
 * jobId (`${experimentId}-run-${timestamp}`) per enqueue avoids that trap
 * while the scan-and-coalesce check still gives "at most one job per
 * experiment in flight" for a racing double POST. (`:` is deliberately
 * avoided in the jobId — BullMQ reserves it as an internal delimiter and
 * rejects custom ids containing it.)
 */
@Injectable()
export class SearchQueueService {
  private readonly logger = new Logger(SearchQueueService.name);

  constructor(@InjectQueue(SEARCH_QUEUE) private readonly queue: Queue<SearchJobData>) {}

  async enqueue(experimentId: string): Promise<void> {
    const existing = await withTimeout(this.findInFlightJob(experimentId));
    if (existing) {
      this.logger.log(
        `Search ${experimentId} already queued/running as job ${existing.id}; coalescing.`,
      );
      return;
    }

    await withTimeout(
      this.queue.add(
        'run',
        { experimentId },
        {
          jobId: `${experimentId}-run-${Date.now()}`,
          // Retries are safe here: StrategySearchService.run() only
          // proceeds past setRunning() when the experiment is still
          // PENDING/RUNNING, so a retry of an attempt that already
          // finished (COMPLETED/FAILED/CANCELLED) is a no-op, not a
          // second search loop over the same iterations.
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 50 },
        },
      ),
    );
  }

  /**
   * Best-effort: removes a queued-but-not-yet-started job so cancel()
   * takes effect immediately for a job still waiting in Redis, instead of
   * waiting for a worker to pick it up. An already-active job is left
   * alone — StrategySearchService.run() polls experiments.isCancelled()
   * between iterations and stops itself; see artifacts/queue.md
   * "Cancellation".
   */
  async cancelIfQueued(experimentId: string): Promise<void> {
    const job = await withTimeout(this.findInFlightJob(experimentId));
    if (!job) return;
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'prioritized') {
      await job.remove();
    }
  }

  private async findInFlightJob(experimentId: string): Promise<Job<SearchJobData> | undefined> {
    const jobs = await this.queue.getJobs([...IN_FLIGHT_STATES]);
    return jobs.find((job) => job.data?.experimentId === experimentId);
  }
}
