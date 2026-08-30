import { Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { NEWS_CRAWL_QUEUE } from '../../../queue/queue.constants';
import { NewsCrawlResult, NewsCrawlService } from './news-crawl.service';
import { runWithCorrelationId } from '../../../observability/correlation/correlation-context';

/**
 * How often the running job's data is re-read from Redis to see whether
 * the user pressed "Dừng Crawl".
 *
 * Polling (rather than a pub/sub push) because the cancel request is
 * written by the API process into the job's own data — the one piece of
 * state both processes already share, with no extra channel to keep alive.
 * One tiny Redis read per second against a crawl that runs for tens of
 * seconds is not a hot path.
 */
const CANCEL_POLL_INTERVAL_MS = 1000;

// Only ever instantiated inside WorkerModule (worker.ts), never AppModule —
// same reasoning as SearchProcessor. concurrency: 1 backstops "one crawl
// globally" at the worker level even though NewsCrawlQueueService already
// coalesces at enqueue time; two API instances racing trigger() at the
// exact same instant (before either add() lands in Redis) is the case
// this catches.
@Processor(NEWS_CRAWL_QUEUE, { concurrency: 1 })
export class NewsCrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsCrawlProcessor.name);

  constructor(
    private readonly newsCrawlService: NewsCrawlService,
    // The same queue NewsCrawlQueueService writes the cancel flag onto.
    // Injected rather than reached through `job.queue` so this reads the
    // flag through BullMQ's public API.
    @InjectQueue(NEWS_CRAWL_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<NewsCrawlResult> {
    const correlationId = (job.data?.correlationId as string | undefined) ?? String(job.id);
    return runWithCorrelationId(correlationId, async () => {
      this.logger.log(`[worker] Starting news crawl job ${job.id}`);

      // NewsCrawlQueueService.cancel() marks an already-active job by
      // writing `cancelRequested: true` into its data. Nothing used to
      // read that flag, so "Dừng Crawl" was a no-op against a running
      // crawler and the worker kept going for up to its full timeout.
      // This watcher is the missing consumer.
      const controller = new AbortController();
      const watcher = setInterval(() => {
        void this.checkCancelled(job).then((cancelRequested) => {
          if (cancelRequested && !controller.signal.aborted) {
            this.logger.log(`[worker] Cancel requested for news crawl job ${job.id}`);
            controller.abort();
          }
        });
      }, CANCEL_POLL_INTERVAL_MS);
      watcher.unref();

      try {
        const result = await this.newsCrawlService.execute({ signal: controller.signal });
        this.logger.log(
          `[worker] News crawl job ${job.id} ${result.cancelled ? 'cancelled' : 'finished'}`,
        );
        return result;
      } finally {
        clearInterval(watcher);
      }
    });
  }

  /**
   * Re-reads the job from Redis. Swallows read failures deliberately: a
   * transient Redis blip must not abort a healthy crawl — the worst case
   * of a missed poll is that cancellation takes one more second to land.
   */
  private async checkCancelled(job: Job): Promise<boolean> {
    try {
      const fresh = await this.queue.getJob(String(job.id));
      return Boolean(fresh?.data?.cancelRequested);
    } catch (error) {
      this.logger.warn(
        `[worker] Could not read cancel flag for job ${job.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
