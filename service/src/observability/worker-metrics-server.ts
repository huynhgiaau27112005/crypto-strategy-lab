import { createServer, Server } from 'node:http';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { MetricsService } from './metrics/metrics.service';
import { HealthService } from './health/health.service';

/**
 * The worker process (worker.ts) is a Nest application CONTEXT, not an
 * HTTP application (see worker.ts's top comment — no app.listen()), by
 * design: it must never accept business-logic HTTP traffic. But several of
 * task-18's domain metrics (search jobs completed/failed, search duration,
 * candidates generated, backtests run) are only ever produced inside this
 * process, and its liveness needs to be checkable on its own (task-18
 * requirement #4: "the worker process must expose its own health too, or
 * report liveness through Redis — say which you chose").
 *
 * Decision: BOTH. `queue.getWorkers()` (see QueueHealthService,
 * GET /queue/health on the API) already reports worker liveness
 * indirectly through Redis — a connected BullMQ Worker client is visible
 * there with no extra code, which is the "or report liveness through
 * Redis" option. In addition, this file gives the worker a tiny dedicated
 * HTTP listener — plain `node:http`, not a second Nest HTTP app — exposing
 * only GET /metrics and GET /health/live, so its own domain metrics are
 * independently scrapeable and its own liveness can be probed directly
 * without going through the API or Redis. This reuses the exact same
 * MetricsService/HealthService classes the API uses (no duplicated logic),
 * just with the worker process's own Registry instance and its own
 * process-level liveness check.
 *
 * Default port 3001, overridable via WORKER_METRICS_PORT — separate from
 * the API's PORT (default 3000) since they are different processes that
 * may run on the same host.
 */
export function startWorkerMetricsServer(app: INestApplicationContext): Server {
  const logger = new Logger('WorkerMetricsServer');
  const metrics = app.get(MetricsService);
  const health = app.get(HealthService);
  const port = Number(process.env.WORKER_METRICS_PORT ?? 3001);

  const server = createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    if (req.url === '/metrics') {
      metrics.registry
        .metrics()
        .then((body: string) => {
          res.writeHead(200, { 'Content-Type': metrics.registry.contentType });
          res.end(body);
        })
        .catch((error: unknown) => {
          logger.warn(`Failed to render worker metrics: ${String(error)}`);
          res.writeHead(500).end();
        });
      return;
    }
    if (req.url === '/health/live') {
      const result = health.liveness();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }
    res.writeHead(404).end();
  });

  server.listen(port, () => {
    logger.log(`Worker metrics/health server listening on :${port} (GET /metrics, GET /health/live)`);
  });

  return server;
}
