/**
 * Single source of truth for how any Redis client in this process connects.
 * QueueModule (BullMQ) and CacheModule (the response cache) both call this
 * instead of each reading REDIS_HOST/REDIS_PORT and constructing their own
 * options — task-17 requirement: reuse the queue's connection setup rather
 * than standing up a second, independently-configured Redis client.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
}

export function redisConnectionOptions(): RedisConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}
