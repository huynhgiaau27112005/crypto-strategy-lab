import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CacheService } from '../../cache/cache.service';
import { withTimeout } from '../../queue/with-timeout';

export interface DependencyCheck {
  status: 'ok' | 'error';
  latencyMs?: number;
  message?: string;
}

export interface ReadinessResult {
  status: 'ok' | 'error';
  checks: {
    postgres: DependencyCheck;
    redis: DependencyCheck;
  };
}

export interface LivenessResult {
  status: 'ok';
  uptimeSeconds: number;
}

/**
 * Liveness vs readiness (task-18 requirement #4):
 *
 * - Liveness ("am I a stuck/deadlocked process that should be killed and
 *   restarted?") checks NOTHING external — it only proves the event loop
 *   is responsive. A Redis or Postgres blip must never fail liveness: that
 *   would make the orchestrator restart a perfectly healthy API process
 *   for a problem restarting it cannot fix, which just adds a boot-up
 *   window on top of the outage.
 * - Readiness ("should traffic be routed to me right now?") checks every
 *   hard dependency. Both Postgres and Redis are treated as hard here:
 *   almost every read in this API touches Postgres, and Redis backs both
 *   the response cache and the search/news-crawl queues that the write
 *   paths depend on — an instance that can't reach either is not able to
 *   serve the product, so it should be pulled out of rotation until the
 *   dependency recovers (verified in task-18 report: stopping the redis
 *   container flips readiness to 503 while liveness stays 200).
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
  ) {}

  liveness(): LivenessResult {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  async readiness(): Promise<ReadinessResult> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const healthy = postgres.status === 'ok' && redis.status === 'ok';
    return { status: healthy ? 'ok' : 'error', checks: { postgres, redis } };
  }

  private async checkPostgres(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      const healthy = await withTimeout(this.database.isHealthy(), 1500);
      return healthy
        ? { status: 'ok', latencyMs: Date.now() - start }
        : { status: 'error', message: 'SELECT 1 failed' };
    } catch (error) {
      return { status: 'error', message: this.errorMessage(error) };
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      await withTimeout(this.cache.ping(), 1500);
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'error', message: this.errorMessage(error) };
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
