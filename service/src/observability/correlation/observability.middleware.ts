import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithCorrelationId } from './correlation-context';
import { MetricsService } from '../metrics/metrics.service';
import { StructuredLogger } from '../logging/structured-logger.service';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Applied globally (AppModule.configure) to every HTTP request. Does three
 * things in one place, in this order:
 *
 * 1. Correlation (task-18 requirement #2): accept an inbound X-Request-Id
 *    if present, otherwise generate one via crypto.randomUUID(); echo it
 *    back on the response; run the rest of the request inside
 *    AsyncLocalStorage so every log line for this request — no matter how
 *    deep in the call stack — carries it without threading it through
 *    function signatures.
 * 2. HTTP metrics: request count + duration, labelled by route TEMPLATE
 *    (not the resolved URL) so id-bearing paths don't blow up cardinality.
 * 3. Access log: one structured line per request on completion.
 *
 * Route template is read from `req.route.path` on the `res.on('finish')`
 * callback rather than at the top of `use()`: Nest's global middleware
 * (mounted via `app.use()`) runs BEFORE the internal Express router
 * matches the request, so `req.route` isn't populated yet when `use()`
 * starts — but it is set on this same `req` object by the time the
 * response finishes, since routing has long since happened by then.
 */
@Injectable()
export class ObservabilityMiddleware implements NestMiddleware {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLogger,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.header(REQUEST_ID_HEADER);
    const correlationId = inbound && inbound.trim().length > 0 ? inbound.trim() : randomUUID();
    res.setHeader('X-Request-Id', correlationId);

    runWithCorrelationId(correlationId, () => {
      const startedAt = process.hrtime.bigint();

      res.on('finish', () => {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
        const route = this.routeTemplate(req);
        const status = String(res.statusCode);

        this.metrics.httpRequestsTotal.inc({ method: req.method, route, status });
        this.metrics.httpRequestDurationSeconds.observe(
          { method: req.method, route, status },
          durationSeconds,
        );

        this.logger.logWithMeta(
          `${req.method} ${route} ${res.statusCode} ${(durationSeconds * 1000).toFixed(1)}ms`,
          'HTTP',
          {
            method: req.method,
            route,
            status: res.statusCode,
            durationMs: Math.round(durationSeconds * 1000),
          },
        );
      });

      next();
    });
  }

  private routeTemplate(req: Request): string {
    const route = (req as unknown as { route?: { path?: string } }).route;
    if (route?.path) {
      return `${req.baseUrl ?? ''}${route.path}` || req.path;
    }
    // No matched route (404, or the request errored before routing) — a
    // fixed label instead of the raw path, so a bot scanning random paths
    // can't create unbounded label cardinality.
    return 'unmatched';
  }
}
