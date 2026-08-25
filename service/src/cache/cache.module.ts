import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';
import { CacheService } from './cache.service';
import { redisConnectionOptions } from './redis-connection';

const logger = new Logger('CacheModule');

/**
 * Owns the Redis client used for response caching. Imported by both
 * AppModule (main.ts) and WorkerModule (worker.ts) — cache invalidation
 * happens in the worker process (leaderboard rebuilds) while cache reads
 * happen in the API process, and both need to reach the same Redis keys
 * (see artifacts/cache.md, "cross-process invalidation").
 *
 * A separate ioredis client from QueueModule's BullMQ connection on
 * purpose (BullMQ owns its own Queue/Worker client lifecycle internally),
 * but built from the exact same `redisConnectionOptions()` so host/port
 * never drift between the two (task-17 requirement #1).
 *
 * `enableOfflineQueue: false` + a short `maxRetriesPerRequest` are the
 * opposite tradeoff from QueueModule: a queued search job must never be
 * lost, so BullMQ buffers commands while Redis is down. A cache GET/SET is
 * disposable — if Redis is unreachable we want the command to fail
 * immediately so CacheService's try/catch can fall through to the real
 * data source right away, instead of an HTTP request hanging while ioredis
 * buffers and retries.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const client = new Redis({
          ...redisConnectionOptions(),
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 1000,
          retryStrategy: (attempts: number) => Math.min(attempts * 500, 5000),
        });
        // ioredis crashes the process on an unhandled 'error' event; a
        // Redis outage must only ever surface as a warning + cache miss
        // (CacheService's try/catch), never as a process crash.
        client.on('error', (error: Error) => {
          logger.warn(`Redis connection error: ${error.message}`);
        });
        return client;
      },
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class CacheModule {}
