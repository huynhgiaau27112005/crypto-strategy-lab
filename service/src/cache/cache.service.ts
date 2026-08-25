import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';

/**
 * The one place in the codebase that talks to Redis for response caching
 * (task-17 requirement — call sites never hand-roll their own key building,
 * TTLs, or ioredis calls). Every method swallows Redis errors: a cache miss
 * or a Redis outage must fall through to the real data source, never throw
 * to the caller (task-17 non-negotiable "Redis being down must not take the
 * API down").
 *
 * Deliberately does NOT know about market-data, leaderboards, or any other
 * domain — it is a plain get/set/del/incr wrapper. Each call site owns its
 * own key format and TTL reasoning (documented at the call site and in
 * artifacts/cache.md), which keeps this service reusable instead of growing
 * a method per feature.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      this.logger.warn(`cache GET failed for key "${key}": ${this.errorMessage(error)}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`cache SET failed for key "${key}": ${this.errorMessage(error)}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`cache DEL failed for key "${key}": ${this.errorMessage(error)}`);
    }
  }

  /**
   * Atomically bumps a version counter. Used to invalidate a whole family of
   * keys (e.g. every limit/page variant of one experiment's leaderboard) by
   * changing what key they read next, instead of tracking and deleting each
   * variant individually. Returns null on Redis failure — callers should
   * treat that the same as "no version available" (falls through to source).
   */
  async incr(key: string): Promise<number | null> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.warn(`cache INCR failed for key "${key}": ${this.errorMessage(error)}`);
      return null;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
