import { Controller, Get, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MetricsService } from './metrics.service';
import { NEWS_CRAWL_QUEUE, SEARCH_QUEUE } from '../../queue/queue.constants';
import { withTimeout } from '../../queue/with-timeout';

const DEPTH_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

/**
 * GET /metrics in Prometheus text exposition format.
 *
 * Deliberately UNAUTHENTICATED, same call as GET /queue/health and
 * GET /strategy-search/health elsewhere in this codebase: it is operational
 * telemetry (request counts, durations, queue depths), never user data,
 * business data, or secrets — redaction happens centrally in
 * StructuredLogger/CacheService, and none of that ever reaches a metric
 * label. The tradeoff being made explicitly: this does leak internal
 * structure (route list, queue names, dependency names) to anyone who can
 * reach the API, which is the standard argument for guarding /metrics in a
 * real deployment. For this project the API is only reachable inside the
 * docker-compose network / localhost during development and grading, so
 * the simplicity of an unauthenticated scrape target (matching how
 * Prometheus itself expects to reach it, and how the two existing health
 * endpoints already behave) wins. If this ever sits behind a public
 * ingress, the fix is a network-level allowlist (reverse proxy / firewall
 * rule restricting /metrics to the Prometheus scraper's IP), not app-level
 * auth — see artifacts/observability.md.
 */
@Controller('metrics')
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(
    private readonly metrics: MetricsService,
    @InjectQueue(SEARCH_QUEUE) private readonly searchQueue: Queue,
    @InjectQueue(NEWS_CRAWL_QUEUE) private readonly crawlQueue: Queue,
  ) {}

  @Get()
  async index(@Res() res: Response): Promise<void> {
    // Best-effort refresh of the queue-depth gauge from live Redis state
    // right before the scrape — see task-18 non-negotiable "observability
    // must not break the app": a Redis hiccup here must still let the rest
    // of the process metrics (which don't need Redis) through.
    await this.refreshQueueDepth().catch((error: unknown) => {
      this.logger.warn(`Could not refresh queue depth gauge: ${this.errorMessage(error)}`);
    });

    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }

  private async refreshQueueDepth(): Promise<void> {
    await Promise.all([
      this.refreshOneQueue(this.searchQueue),
      this.refreshOneQueue(this.crawlQueue),
    ]);
  }

  private async refreshOneQueue(queue: Queue): Promise<void> {
    const counts = await withTimeout(queue.getJobCounts(...DEPTH_STATES), 1500);
    for (const state of DEPTH_STATES) {
      this.metrics.queueDepth.set({ queue: queue.name, state }, counts[state] ?? 0);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
