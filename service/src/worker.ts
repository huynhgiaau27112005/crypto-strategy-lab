import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { StructuredLogger } from './observability/logging/structured-logger.service';
import { startWorkerMetricsServer } from './observability/worker-metrics-server';

// Separate entry point / separate OS process from main.ts (task-16
// requirement #3). Boots a Nest application CONTEXT — no HTTP server, no
// app.listen() — whose only side effect is that WorkerModule's providers
// include the @Processor() classes, which makes @nestjs/bullmq start
// BullMQ Workers that connect to Redis and pull jobs. This is the process
// that actually runs StrategySearchService.run() / NewsCrawlService.execute();
// the API process (main.ts) only ever enqueues onto the same queues.
async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(StructuredLogger));

  // See src/observability/worker-metrics-server.ts for why this process
  // gets its own tiny plain-http listener instead of a second Nest HTTP app.
  const metricsServer = startWorkerMetricsServer(app);
  process.on('SIGTERM', () => metricsServer.close());
  process.on('SIGINT', () => metricsServer.close());

  // Required for graceful shutdown: BullExplorer/Queue register their
  // close logic on the "onApplicationShutdown" lifecycle hook, which Nest
  // only invokes when a process signal handler is registered via this
  // call. On SIGTERM, BullMQ's Worker.close() waits for any in-flight
  // job(s) to finish before the process exits — a currently-running
  // search/crawl is allowed to complete (or is released back to the
  // queue if it can't finish quickly) rather than left locked forever.
  app.enableShutdownHooks();

  logger.log(
    `Worker started (REDIS_HOST=${process.env.REDIS_HOST ?? 'localhost'}, REDIS_PORT=${process.env.REDIS_PORT ?? '6379'}). Listening on "search" and "news-crawl" queues.`,
  );
}
void bootstrap();
