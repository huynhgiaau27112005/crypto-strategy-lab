import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AI_GENERATE_QUEUE, NEWS_CRAWL_QUEUE, SEARCH_QUEUE } from './queue.constants';
import { withTimeout } from './with-timeout';

export interface QueueSnapshot {
  name: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  /** Number of Worker processes currently connected and pulling jobs from this queue (from Redis CLIENT LIST, not a self-reported heartbeat). */
  workers: number;
}

export interface QueueHealthSnapshot {
  redis: 'up' | 'down';
  queues: QueueSnapshot[];
}

/**
 * Makes the queue real for the oral defence instead of a claim: this is
 * live Redis state (job counts + connected worker clients), not a cached
 * counter kept by the API process. `GET /queue/health` calls this.
 */
@Injectable()
export class QueueHealthService {
  constructor(
    @InjectQueue(SEARCH_QUEUE) private readonly searchQueue: Queue,
    @InjectQueue(NEWS_CRAWL_QUEUE) private readonly crawlQueue: Queue,
    @InjectQueue(AI_GENERATE_QUEUE) private readonly generateQueue: Queue,
  ) {}

  async snapshot(): Promise<QueueHealthSnapshot> {
    try {
      const [search, crawl, generate] = await withTimeout(
        Promise.all([
          this.snapshotQueue(this.searchQueue),
          this.snapshotQueue(this.crawlQueue),
          this.snapshotQueue(this.generateQueue),
        ]),
        1500,
      );
      return { redis: 'up', queues: [search, crawl, generate] };
    } catch {
      // Redis unreachable (or still connecting) — report degraded instead
      // of throwing or hanging, so this endpoint itself never breaks.
      return {
        redis: 'down',
        queues: [
          this.emptySnapshot(SEARCH_QUEUE),
          this.emptySnapshot(NEWS_CRAWL_QUEUE),
          this.emptySnapshot(AI_GENERATE_QUEUE),
        ],
      };
    }
  }

  private async snapshotQueue(queue: Queue): Promise<QueueSnapshot> {
    const [counts, workers] = await Promise.all([
      queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      queue.getWorkers(),
    ]);
    return {
      name: queue.name,
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      },
      workers: workers.length,
    };
  }

  private emptySnapshot(name: string): QueueSnapshot {
    return {
      name,
      counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
      workers: 0,
    };
  }
}
