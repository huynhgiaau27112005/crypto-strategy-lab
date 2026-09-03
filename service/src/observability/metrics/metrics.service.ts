import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Single owner of the prom-client Registry and every metric this codebase
 * exposes (task-18 requirement #3). Deliberately one flat service instead
 * of a metric-per-module scatter: every metric name/label/bucket decision
 * lives in one file, so avoiding an accidental high-cardinality label (raw
 * path, user id, ...) is a one-file review instead of an audit across the
 * whole tree. See artifacts/observability.md for the full catalogue and the
 * counter-vs-histogram-vs-gauge reasoning behind each one.
 *
 * Instantiated once per process (Nest singleton). The API process and the
 * worker process each get their own Registry/values — the worker exposes
 * its copy on its own small HTTP listener (see worker.ts), because the
 * metrics that matter most here (search jobs completed/failed, search
 * duration, candidates generated, backtests run) are produced inside the
 * worker, not the API.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  // --- HTTP -----------------------------------------------------------
  // Route TEMPLATE, never the resolved URL/path params — labelling by raw
  // path would let cardinality grow with every distinct id ever requested.
  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests received, by route template and outcome.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpRequestDurationSeconds = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds, by route template and outcome.',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  // --- Strategy search jobs (BullMQ "search" queue) --------------------
  readonly searchJobsEnqueuedTotal = new Counter({
    name: 'search_jobs_enqueued_total',
    help: 'Total search jobs enqueued onto the "search" BullMQ queue.',
    registers: [this.registry],
  });

  readonly searchJobsCompletedTotal = new Counter({
    name: 'search_jobs_completed_total',
    help: 'Total search jobs that finished without throwing, in the worker process.',
    registers: [this.registry],
  });

  readonly searchJobsFailedTotal = new Counter({
    name: 'search_jobs_failed_total',
    help: 'Total search jobs that threw in the worker process.',
    registers: [this.registry],
  });

  // Wide buckets: a search job legitimately runs from seconds (tiny
  // maxCandidates) to minutes (maxDurationSeconds-bounded runs).
  readonly searchDurationSeconds = new Histogram({
    name: 'search_duration_seconds',
    help: 'Wall-clock duration of one search job (StrategySearchService.run), in seconds.',
    buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800],
    registers: [this.registry],
  });

  // --- Search internals --------------------------------------------------
  readonly candidatesGeneratedTotal = new Counter({
    name: 'candidates_generated_total',
    help: 'Total strategy candidates generated and persisted across all search jobs.',
    registers: [this.registry],
  });

  // Candidates the generator drew that this experiment had already
  // evaluated, rejected by migration 005's unique fingerprint index before
  // any backtest ran. A ratio of this to candidates_generated_total that
  // climbs toward 1 means the configured parameter space is close to
  // exhausted — the signal that precedes a SEARCH_SPACE_EXHAUSTED stop.
  readonly candidatesDuplicateTotal = new Counter({
    name: 'candidates_duplicate_total',
    help: 'Total generated candidates rejected as duplicates of one already evaluated in the same experiment.',
    registers: [this.registry],
  });

  readonly backtestsRunTotal = new Counter({
    name: 'backtests_run_total',
    help: 'Total backtests executed (one per candidate) across all search jobs.',
    registers: [this.registry],
  });

  // --- Cache ---------------------------------------------------------
  // "namespace" = the key prefix before the first ":" (e.g. "market-data",
  // "leaderboard") — a small, fixed set owned by each call site's key
  // format, not the raw key (which carries ids and would blow up
  // cardinality).
  readonly cacheHitsTotal = new Counter({
    name: 'cache_hits_total',
    help: 'Cache reads that found a value, by key namespace.',
    labelNames: ['namespace'] as const,
    registers: [this.registry],
  });

  readonly cacheMissesTotal = new Counter({
    name: 'cache_misses_total',
    help: 'Cache reads that found nothing (or failed open), by key namespace.',
    labelNames: ['namespace'] as const,
    registers: [this.registry],
  });

  // --- Queues ---------------------------------------------------------
  // Gauge, not Counter: depth is a point-in-time level, refreshed on every
  // /metrics scrape from live BullMQ job counts (see MetricsController).
  // "queue" and "state" are both small fixed sets (3 queues, 5 states).
  readonly queueDepth = new Gauge({
    name: 'queue_depth',
    help: 'Current BullMQ job count per queue and state (waiting/active/delayed/failed).',
    labelNames: ['queue', 'state'] as const,
    registers: [this.registry],
  });

  // --- Binance outbound calls ------------------------------------------
  readonly binanceRequestsTotal = new Counter({
    name: 'binance_requests_total',
    help: 'Total outbound requests to the Binance REST API, by endpoint and outcome.',
    labelNames: ['endpoint', 'outcome'] as const,
    registers: [this.registry],
  });

  readonly binanceRequestDurationSeconds = new Histogram({
    name: 'binance_request_duration_seconds',
    help: 'Outbound Binance REST API call duration in seconds, by endpoint.',
    labelNames: ['endpoint'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  /** Key namespace = everything before the first ":" — see cacheHitsTotal doc comment. */
  static cacheNamespace(key: string): string {
    const idx = key.indexOf(':');
    return idx === -1 ? key : key.slice(0, idx);
  }
}
