import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NEWS_CRAWL_QUEUE } from '../../../queue/queue.constants';
import { NewsCrawlResult, NewsCrawlService } from './news-crawl.service';

// Only ever instantiated inside WorkerModule (worker.ts), never AppModule —
// same reasoning as SearchProcessor. concurrency: 1 backstops "one crawl
// globally" at the worker level even though NewsCrawlQueueService already
// coalesces at enqueue time; two API instances racing trigger() at the
// exact same instant (before either add() lands in Redis) is the case
// this catches.
@Processor(NEWS_CRAWL_QUEUE, { concurrency: 1 })
export class NewsCrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsCrawlProcessor.name);

  constructor(private readonly newsCrawlService: NewsCrawlService) {
    super();
  }

  async process(job: Job): Promise<NewsCrawlResult> {
    this.logger.log(`[worker] Starting news crawl job ${job.id}`);
    const result = await this.newsCrawlService.execute();
    this.logger.log(`[worker] News crawl job ${job.id} finished`);
    return result;
  }
}
