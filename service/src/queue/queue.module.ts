import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NEWS_CRAWL_QUEUE, SEARCH_QUEUE } from './queue.constants';
import { QueueHealthService } from './queue-health.service';
import { QueueHealthController } from './queue-health.controller';

/**
 * Single owner of the BullMQ/Redis connection — no other module constructs
 * its own Redis client (task-16 requirement #1). Both the API process
 * (main.ts, producer only) and the worker process (worker.ts, producer +
 * consumer) import this same module so the connection settings and queue
 * definitions never drift between them.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ for the blocking
 * commands its Worker uses internally; it is harmless for the Queue
 * (producer) side. `enableOfflineQueue: true` (ioredis default) is what
 * lets the API boot even when Redis is unreachable: ioredis buffers
 * commands in memory and keeps retrying the connection in the background
 * instead of throwing at construction time (task-16 requirement "Startup
 * independence"). A command only rejects once `retryStrategy` gives up —
 * see QueueHealthService for how callers observe that state instead of
 * the app crashing at boot.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          maxRetriesPerRequest: null,
          retryStrategy: (attempts: number) => Math.min(attempts * 500, 5000),
        },
      }),
    }),
    BullModule.registerQueue({ name: SEARCH_QUEUE }, { name: NEWS_CRAWL_QUEUE }),
  ],
  controllers: [QueueHealthController],
  providers: [QueueHealthService],
  exports: [BullModule, QueueHealthService],
})
export class QueueModule {}
