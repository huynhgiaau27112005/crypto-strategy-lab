import { Global, Module } from '@nestjs/common';
import { StructuredLogger } from './logging/structured-logger.service';
import { MetricsService } from './metrics/metrics.service';
import { MetricsController } from './metrics/metrics.controller';
import { HealthService } from './health/health.service';
import { HealthController } from './health/health.controller';
import { ObservabilityMiddleware } from './correlation/observability.middleware';

/**
 * Global module (task-18): imported once by AppModule (API process) and
 * once by WorkerModule (worker process), everything it exports becomes
 * injectable anywhere without a per-module import — this is what lets
 * CacheService, SearchQueueService, SearchProcessor, BinanceClient etc.
 * inject MetricsService/StructuredLogger without every one of those
 * modules declaring a dependency on this one.
 *
 * Depends on QueueModule (for MetricsController's queue-depth gauge, via
 * @InjectQueue) and CacheModule (for HealthService's Redis ping) — both are
 * themselves @Global, so no explicit `imports` entry is needed for them,
 * but the module graph still requires them to have been instantiated
 * first; AppModule/WorkerModule both already import QueueModule and
 * CacheModule ahead of this one.
 */
@Global()
@Module({
  controllers: [MetricsController, HealthController],
  providers: [StructuredLogger, MetricsService, HealthService, ObservabilityMiddleware],
  exports: [StructuredLogger, MetricsService, HealthService, ObservabilityMiddleware],
})
export class ObservabilityModule {}
