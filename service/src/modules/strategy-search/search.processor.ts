import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SEARCH_QUEUE } from '../../queue/queue.constants';
import { StrategySearchService } from './strategy-search.service';
import { SearchJobData } from './services/search-queue.service';
import { runWithCorrelationId } from '../../observability/correlation/correlation-context';
import { MetricsService } from '../../observability/metrics/metrics.service';

// This class is only ever instantiated inside WorkerModule (worker.ts),
// never inside AppModule (the HTTP process) — that is the whole
// architectural point of task-16: the API enqueues, the worker executes.
// It calls straight into StrategySearchService.run(), the exact same
// method the search loop always ran (no second/forked search loop).
//
// Concurrency 5: bounds how many experiments this one worker process runs
// simultaneously. "One search per experiment at a time" is enforced by
// SearchQueueService (producer side, see its doc comment), not here.
//
// task-18: wraps the whole job in runWithCorrelationId(job.data.correlationId)
// — this is the cross-process half of correlation. SearchQueueService
// (running in the API process) put the HTTP request's correlation id into
// the job payload when it enqueued this job; re-entering that same id here
// means every log line StrategySearchService.run() produces — several
// process boundaries and a Redis hop away from the original HTTP request —
// carries the identical correlationId, without StrategySearchService (or
// anything it calls) needing to know correlation ids exist.
@Processor(SEARCH_QUEUE, { concurrency: 5 })
export class SearchProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchProcessor.name);

  constructor(
    private readonly strategySearchService: StrategySearchService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<SearchJobData>): Promise<void> {
    const { experimentId, correlationId } = job.data;
    return runWithCorrelationId(correlationId ?? String(job.id), async () => {
      this.logger.log(
        `[worker] Starting search job ${job.id} (attempt ${job.attemptsMade + 1}) for experiment ${experimentId}`,
      );
      const stopTimer = this.metrics.searchDurationSeconds.startTimer();
      try {
        await this.strategySearchService.run(experimentId);
        stopTimer();
        this.metrics.searchJobsCompletedTotal.inc();
        this.logger.log(`[worker] Search job ${job.id} for experiment ${experimentId} finished`);
      } catch (error) {
        stopTimer();
        this.metrics.searchJobsFailedTotal.inc();
        throw error;
      }
    });
  }
}
