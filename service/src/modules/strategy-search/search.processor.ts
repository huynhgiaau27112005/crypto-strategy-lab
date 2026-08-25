import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SEARCH_QUEUE } from '../../queue/queue.constants';
import { StrategySearchService } from './strategy-search.service';
import { SearchJobData } from './services/search-queue.service';

// This class is only ever instantiated inside WorkerModule (worker.ts),
// never inside AppModule (the HTTP process) — that is the whole
// architectural point of task-16: the API enqueues, the worker executes.
// It calls straight into StrategySearchService.run(), the exact same
// method the search loop always ran (no second/forked search loop).
//
// Concurrency 5: bounds how many experiments this one worker process runs
// simultaneously. "One search per experiment at a time" is enforced by
// SearchQueueService (producer side, see its doc comment), not here.
@Processor(SEARCH_QUEUE, { concurrency: 5 })
export class SearchProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchProcessor.name);

  constructor(private readonly strategySearchService: StrategySearchService) {
    super();
  }

  async process(job: Job<SearchJobData>): Promise<void> {
    const { experimentId } = job.data;
    this.logger.log(
      `[worker] Starting search job ${job.id} (attempt ${job.attemptsMade + 1}) for experiment ${experimentId}`,
    );
    await this.strategySearchService.run(experimentId);
    this.logger.log(`[worker] Search job ${job.id} for experiment ${experimentId} finished`);
  }
}
