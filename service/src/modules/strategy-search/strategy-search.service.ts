import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { BacktestingService } from '../backtesting/backtesting.service';
import { BacktestRunRepository } from '../backtesting/repositories/backtest-run.repository';
import { StrategyWeightMap } from '../composite-strategy/composite-strategy.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import {
  aiStrategyIdFromType,
  DEFAULT_SEARCH_CONFIG,
  isAiStrategyType,
  SearchConfig,
  SearchStrategyType,
  StartSearchRequest,
  strategyRowDomain,
  strategyTypeKey,
  StrategyDomain,
  StrategyWeight,
  defaultEqualWeights,
} from './domain/search.types';
import { aiCatalogEntry, STRATEGY_CATALOG } from './catalog/strategy-catalog';
import {
  DomainGuidedRandomGenerator,
  RunCatalog,
} from './generators/domain-guided-random.generator';
import {
  CandidateDetail,
  CandidateRepository,
} from './repositories/candidate.repository';
import {
  ExperimentConfigRepository,
  WeightRow,
} from './repositories/experiment-config.repository';
import { ExperimentIterationRepository } from './repositories/experiment-iteration.repository';
import { ExperimentRepository } from './repositories/experiment.repository';
import { StrategyRepository } from './repositories/strategy.repository';
import { CandidateFingerprintService } from './services/candidate-fingerprint.service';
import { createSeededRandom } from './services/seeded-random';
import { SearchQueueService } from './services/search-queue.service';
import { DatabaseService } from '../../database/database.service';
import { CacheService } from '../../cache/cache.service';
import {
  LEADERBOARD_TOP_CACHE_MAX_ENTRIES,
  LEADERBOARD_TOP_CACHE_TTL_SECONDS,
  leaderboardTopDataKey,
  leaderboardVersionKey,
} from '../leaderboard/leaderboard-cache-keys';
import type { SearchTopRow } from './repositories/experiment.repository';
import { MetricsService } from '../../observability/metrics/metrics.service';
import { AiStrategyRepository } from '../ai-strategy/repositories/ai-strategy.repository';
import { AiStrategySignalPrecomputeService } from '../ai-strategy/ai-strategy-signal-precompute.service';
import { CandleInput } from '../ai-strategy/ai-strategy.types';
import { CandleEntity } from '../../database/types';
import { StrategySignal } from '../strategy-engine/strategy.types';

@Injectable()
export class StrategySearchService implements OnApplicationBootstrap {
  private static readonly MAX_TRADE_PAGE_SIZE = 200;
  private static readonly DEFAULT_TRADE_PAGE_SIZE = 20;

  private readonly logger = new Logger(StrategySearchService.name);
  private readonly activeRuns = new Set<string>();
  private readonly configCache = new Map<string, SearchConfig>();

  constructor(
    private readonly database: DatabaseService,
    private readonly experiments: ExperimentRepository,
    private readonly experimentConfigs: ExperimentConfigRepository,
    private readonly iterations: ExperimentIterationRepository,
    private readonly candidates: CandidateRepository,
    private readonly strategies: StrategyRepository,
    private readonly generator: DomainGuidedRandomGenerator,
    private readonly fingerprintService: CandidateFingerprintService,
    private readonly backtesting: BacktestingService,
    private readonly backtestRuns: BacktestRunRepository,
    private readonly leaderboard: LeaderboardService,
    private readonly searchQueue: SearchQueueService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsService,
    private readonly aiStrategies: AiStrategyRepository,
    private readonly aiPrecompute: AiStrategySignalPrecomputeService,
  ) {}

  // Runs in BOTH the API process and the worker process (StrategySearchModule
  // is imported by both AppModule and WorkerModule) — deliberately: a
  // PENDING/RUNNING row left behind by a process that died before its job
  // ever reached the queue (e.g. crashed between experiments.create() and
  // the enqueue call) would otherwise poll forever with no job backing it.
  // enqueue() coalesces (SearchQueueService dedupes by experimentId among
  // in-flight jobs), so both processes calling this on boot is harmless —
  // at most one job per experiment ends up queued. Wrapped in try/catch so
  // a Redis outage at boot degrades this to a logged warning rather than
  // failing application startup (task-16 "Startup independence").
  async onApplicationBootstrap(): Promise<void> {
    try {
      const resumable = await this.experiments.findResumable();
      for (const experiment of resumable) await this.schedule(experiment.id);
    } catch (error) {
      this.logger.warn(
        `Could not resume search experiments: ${this.errorMessage(error)}`,
      );
    }
  }

  async start(userId: string, request: StartSearchRequest) {
    const { startTime, endTime, config } = this.validateRequest(request);
    const candles = await this.experiments.candles(
      request.timeframe,
      startTime,
      endTime,
    );
    const minimumCandles = this.minimumCandles(config.enabledDomains);
    if (candles.length < minimumCandles) {
      throw new BadRequestException(
        `Dataset has ${candles.length} candles; at least ${minimumCandles} are required.`,
      );
    }

    const systemStrategies = await this.strategies.listSystemStrategies();
    const byName = new Map(systemStrategies.map((s) => [s.name, s]));
    const weights: StrategyWeight[] =
      request.strategyWeights ??
      defaultEqualWeights(
        config.enabledDomains.map((domain) => this.builtinTypeForDomain(domain)),
      );
    this.assertWeightsValid(weights);

    // Resolve every requested type to its `strategies` row and domain —
    // built-in by name (shared, no ownership check), AI by id scoped to
    // this user and required to be active (see AiStrategyRepository.
    // findOwnedActiveById). A domain now comes from the actual resolved
    // row rather than a fixed domain->type table, since a domain can be
    // covered by a built-in, by one or more of the user's own AI
    // strategies, or both.
    const resolved = await Promise.all(
      weights.map(async (w) => {
        if (isAiStrategyType(w.type)) {
          const id = aiStrategyIdFromType(w.type);
          const row = await this.aiStrategies.findOwnedActiveById(id, userId);
          if (!row) {
            throw new BadRequestException(
              `AI strategy "${w.type}" not found, inactive, or not owned by this account.`,
            );
          }
          return { weight: w.weight, strategyId: row.id, domain: strategyRowDomain(row) };
        }
        const strategy = byName.get(w.type);
        if (!strategy) {
          throw new BadRequestException(`Unknown strategy type "${w.type}".`);
        }
        return { weight: w.weight, strategyId: strategy.id, domain: strategyRowDomain(strategy) };
      }),
    );
    this.assertWeightsCoverEnabledDomains(resolved, config.enabledDomains);
    const strategyWeights = resolved.map((r) => ({ strategyId: r.strategyId, weight: r.weight }));

    const experiment = await this.database.withTransaction(async (client) => {
      const created = await this.experiments.create(
        userId,
        null,
        client,
        this.persistableSearchConfig(config),
      );
      await this.experimentConfigs.createWithWeights(
        client,
        created.id,
        request.timeframe,
        startTime,
        endTime,
        config.maxCandidates,
        strategyWeights,
      );
      return created;
    });
    this.configCache.set(experiment.id, config);
    await this.schedule(experiment.id);
    return experiment;
  }

  // "Chạy thêm N iteration" (artifacts/api-contract.md §2). Deliberately
  // reuses run()/loadConfig() end-to-end instead of a second search loop:
  // - Ownership: `reopen()`'s WHERE binds both experimentId AND userId, so
  //   a caller can never flip another user's experiment back to PENDING.
  // - Concurrency: `reopen()` is a single atomic UPDATE guarded by
  //   `status = 'COMPLETED'`. Two racing calls both run this UPDATE; at
  //   most one affects a row (the other sees the row already flipped to
  //   PENDING and updates 0 rows), so at most one caller ever gets to
  //   schedule() a run — the second gets a 409 instead of a second loop
  //   racing the first over the same iteration sequence.
  // - Status: COMPLETED -> PENDING is the same state `start()` creates a
  //   fresh experiment in, so the existing polling contract holds exactly
  //   as-is (useExperiment keeps polling through PENDING/RUNNING, stops on
  //   COMPLETED/FAILED/CANCELLED) with no new status value to teach the UI.
  // - Iteration numbering: unchanged — ExperimentIterationRepository.createNext()
  //   already continues MAX(iteration_number)+1 for the experiment, so
  //   nothing here needs to compute or pass a starting offset.
  // - Config reuse: only experiment_configs.iteration_limit is raised;
  //   timeframe/window/weights/domains are read back by the existing
  //   loadConfig()/findByExperimentId() path inside run(), never rebuilt.
  async extend(experimentId: string, userId: string, iterations?: number) {
    const boundedIterations = this.integerInRange(
      iterations,
      1,
      50,
      10,
      'iterations',
    );
    const experiment = await this.experiments.findOwned(experimentId, userId);
    if (!experiment) throw new NotFoundException('Experiment not found.');

    const reopened = await this.experiments.reopen(experimentId, userId);
    if (!reopened) {
      throw new ConflictException(
        'Experiment must be COMPLETED to extend it (it may already be running, or ended abnormally).',
      );
    }

    await this.experimentConfigs.increaseIterationLimit(
      experimentId,
      boundedIterations,
    );
    // Force loadConfig() to re-read maxCandidates from the DB on the next
    // run() invocation instead of serving a stale cached value.
    this.configCache.delete(experimentId);

    await this.schedule(experimentId);
    return { id: experimentId, status: 'PENDING' as const };
  }

  async getStatus(experimentId: string, userId: string) {
    const status = await this.experiments.status(experimentId, userId);
    if (!status) throw new NotFoundException('Experiment not found.');
    return status;
  }

  // Cached (task-17): re-read constantly by the polling UI while a search
  // is RUNNING, and identical for every caller who requested a different
  // `limit` on the same experiment. See leaderboard-cache-keys.ts for the
  // key shape and LeaderboardService.rebuildForExperiment for the
  // cross-process invalidation this depends on — the worker process bumps
  // `leaderboardVersionKey(experimentId)` after every rebuild, and reading
  // an unbumped (or Redis-down, defaulting to 0) version here just means a
  // cache miss, never stale data served past LEADERBOARD_TOP_CACHE_TTL_SECONDS.
  async getTop(experimentId: string, userId: string, limit: number) {
    const experiment = await this.experiments.findOwned(experimentId, userId);
    if (!experiment) throw new NotFoundException('Experiment not found.');
    const config = await this.loadConfig(experimentId);
    const clampedLimit = Math.min(100, Math.max(1, limit));

    const version =
      (await this.cache.get<number>(leaderboardVersionKey(experimentId))) ?? 0;
    const dataKey = leaderboardTopDataKey(experimentId, userId, version);
    const cached = await this.cache.get<SearchTopRow[]>(dataKey);
    if (cached) return cached.slice(0, clampedLimit);

    // Always fetch (and cache) the top LEADERBOARD_TOP_CACHE_MAX_ENTRIES —
    // `limit` only slices an already-descending-sorted list, so it does not
    // need to be part of the cache key (see leaderboard-cache-keys.ts).
    const top = await this.experiments.top(
      experimentId,
      userId,
      LEADERBOARD_TOP_CACHE_MAX_ENTRIES,
      config.minimumTrades,
    );
    await this.cache.set(dataKey, top, LEADERBOARD_TOP_CACHE_TTL_SECONDS);
    return top.slice(0, clampedLimit);
  }

  async cancel(experimentId: string, userId: string) {
    const experiment = await this.experiments.findOwned(experimentId, userId);
    if (!experiment) throw new NotFoundException('Experiment not found.');
    const cancelled = await this.experiments.cancel(experimentId, userId);
    if (cancelled) {
      // Best-effort: drop the job from the queue if it never started
      // (see SearchQueueService.cancelIfQueued's doc comment). If the job
      // is already active in a worker, this is a no-op — the running
      // loop notices the CANCELLED status itself on its next iteration.
      try {
        await this.searchQueue.cancelIfQueued(experimentId);
      } catch (error) {
        this.logger.warn(
          `Could not remove queued job for cancelled experiment ${experimentId}: ${this.errorMessage(error)}`,
        );
      }
    }
    return { id: experimentId, cancelled };
  }

  async candidateDetail(
    userId: string,
    candidateId: string,
    tradePage: number,
    tradePageSize: number,
  ): Promise<CandidateDetail> {
    const page = Number.isInteger(tradePage) && tradePage > 0 ? tradePage : 1;
    // Clamp to at most MAX_TRADE_PAGE_SIZE so a client cannot request an
    // unbounded page; also fall back to the default on a non-numeric or
    // zero/negative page size.
    const pageSize =
      Number.isInteger(tradePageSize) && tradePageSize > 0
        ? Math.min(tradePageSize, StrategySearchService.MAX_TRADE_PAGE_SIZE)
        : StrategySearchService.DEFAULT_TRADE_PAGE_SIZE;
    const detail = await this.candidates.findDetail(
      candidateId,
      userId,
      page,
      pageSize,
    );
    if (!detail) throw new NotFoundException('Candidate not found.');
    return detail;
  }

  // Reconstructs the SearchConfig from the database rather than trusting
  // `configCache` alone, because `configCache` is only ever populated by
  // `start()`/`extend()`, both of which run in the API process — while
  // `run()` (the actual search loop) and job retries execute in the
  // separate worker process, whose `configCache` is always empty. Every
  // caller (API's getTop(), the worker's run()) therefore reads the same
  // source of truth regardless of process or restart, closing the
  // API/worker divergence described in artifacts/decisions.md.
  //
  // maxCandidates comes from experiment_configs.iteration_limit (unchanged
  // — extend() persists there); enabledDomains is derived from the
  // persisted experiment_config_strategies weight rows (see
  // domainsFromWeightRows); maxDurationSeconds/maxNoImprovement/topK/
  // minimumTrades come from experiments.search_config (JSONB, populated by
  // start() via persistableSearchConfig — see ExperimentEntity.search_config).
  // A pre-fix row (or any malformed JSON) falls back to
  // DEFAULT_SEARCH_CONFIG field-by-field via sanitizeSearchConfig, so this
  // never throws.
  private async loadConfig(experimentId: string): Promise<SearchConfig> {
    const cached = this.configCache.get(experimentId);
    if (cached) return cached;
    const experiment = await this.experiments.findByIdOrThrow(experimentId);
    const config = await this.experimentConfigs.findByExperimentId(experimentId);
    const weightRows =
      await this.experimentConfigs.weightsByExperimentId(experimentId);
    const enabledDomains =
      weightRows.length > 0
        ? this.domainsFromWeightRows(weightRows)
        : DEFAULT_SEARCH_CONFIG.enabledDomains;
    const resolved: SearchConfig = {
      ...DEFAULT_SEARCH_CONFIG,
      enabledDomains,
      maxCandidates:
        config?.iteration_limit ?? DEFAULT_SEARCH_CONFIG.maxCandidates,
      ...this.sanitizeSearchConfig(experiment.search_config),
    };
    this.configCache.set(experimentId, resolved);
    return resolved;
  }

  // The subset of SearchConfig that is not already persisted elsewhere
  // (maxCandidates -> experiment_configs.iteration_limit, enabledDomains ->
  // experiment_config_strategies) — written into experiments.search_config
  // at creation time so loadConfig() can reconstruct it truthfully from
  // any process.
  private persistableSearchConfig(
    config: SearchConfig,
  ): Record<string, unknown> {
    return {
      maxDurationSeconds: config.maxDurationSeconds,
      maxNoImprovement: config.maxNoImprovement,
      topK: config.topK,
      minimumTrades: config.minimumTrades,
    };
  }

  // Defensive parse of the JSONB round-trip: each field is validated with
  // the same bounds `validateRequest()` enforces on the way in, and any
  // missing/malformed field (pre-fix row, hand-edited data, driver
  // returning a raw string instead of a parsed object) falls back to
  // DEFAULT_SEARCH_CONFIG for that field alone rather than throwing.
  private sanitizeSearchConfig(
    raw: unknown,
  ): Pick<
    SearchConfig,
    'maxDurationSeconds' | 'maxNoImprovement' | 'topK' | 'minimumTrades'
  > {
    const obj =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const boundedOrDefault = (
      value: unknown,
      minimum: number,
      maximum: number,
      fallback: number,
    ): number =>
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= minimum &&
      value <= maximum
        ? value
        : fallback;
    return {
      maxDurationSeconds: boundedOrDefault(
        obj.maxDurationSeconds,
        1,
        86_400,
        DEFAULT_SEARCH_CONFIG.maxDurationSeconds,
      ),
      maxNoImprovement: boundedOrDefault(
        obj.maxNoImprovement,
        1,
        10_000,
        DEFAULT_SEARCH_CONFIG.maxNoImprovement,
      ),
      topK: boundedOrDefault(obj.topK, 1, 100, DEFAULT_SEARCH_CONFIG.topK),
      minimumTrades: boundedOrDefault(
        obj.minimumTrades,
        0,
        10_000,
        DEFAULT_SEARCH_CONFIG.minimumTrades,
      ),
    };
  }

  // Recovers which StrategyDomains are represented by the persisted
  // experiment_config_strategies rows, resolving each row's domain
  // directly (built-in by name, AI by its recorded `parameters.domain` —
  // see strategyRowDomain) rather than a fixed domain->type table, since a
  // domain can now be covered by a built-in, an AI strategy, or both. This
  // keeps a resumed-after-restart config's enabledDomains in sync with the
  // weights actually persisted for the experiment. A row whose domain
  // cannot be resolved (e.g. a legacy AI row with no domain recorded) is
  // skipped rather than failing the whole reconstruction.
  private domainsFromWeightRows(
    rows: Array<{ name: string; type: string; parameters: Record<string, unknown> }>,
  ): StrategyDomain[] {
    const domains = new Set<StrategyDomain>();
    for (const row of rows) {
      try {
        domains.add(strategyRowDomain(row));
      } catch {
        // Skip — see doc comment above.
      }
    }
    return domains.size > 0 ? [...domains] : DEFAULT_SEARCH_CONFIG.enabledDomains;
  }

  // Enqueues the search onto the "search" BullMQ queue instead of running
  // it inline (task-16: the API/bootstrap process only ever enqueues; only
  // SearchProcessor, running inside the separate worker process, calls
  // run()). Errors are logged rather than thrown so a Redis hiccup here
  // never turns into a 500 for start()/extend() after the experiment row
  // has already been created/reopened.
  private async schedule(experimentId: string): Promise<void> {
    try {
      await this.searchQueue.enqueue(experimentId);
    } catch (error) {
      this.logger.error(
        `Could not enqueue search job for experiment ${experimentId}: ${this.errorMessage(error)}`,
      );
    }
  }

  // Called by SearchProcessor (worker process only) — the actual search
  // loop, unchanged from before this task except for how it gets invoked.
  // `activeRuns` is a same-process guard, kept as defense-in-depth against
  // the same experimentId's job being dispatched twice concurrently within
  // one worker (e.g. a scheduling race); it is not how cross-experiment or
  // cross-process concurrency is bounded — see SearchQueueService for that.
  async run(experimentId: string): Promise<void> {
    if (this.activeRuns.has(experimentId)) return;
    this.activeRuns.add(experimentId);
    try {
      const experiment = await this.experiments.findByIdOrThrow(experimentId);
      if (experiment.status === 'CANCELLED') return;
      if (!(await this.experiments.setRunning(experimentId))) return;

      const config = await this.loadConfig(experimentId);
      const experimentConfig =
        await this.experimentConfigs.findByExperimentId(experimentId);
      if (!experimentConfig) throw new Error('Experiment config not found.');
      const weightRows =
        await this.experimentConfigs.weightsByExperimentId(experimentId);
      const keyedRows = weightRows.map((row) => ({
        row,
        key: strategyTypeKey({ id: row.strategy_id, name: row.name, type: row.type }),
      }));
      const strategyIdByType = new Map(
        keyedRows.map(({ row, key }) => [key, row.strategy_id]),
      );
      // Weights belong to the experiment CONFIG and are fixed for every
      // candidate in this run, so they are passed into the backtest rather
      // than carried on CandidateMember. See artifacts/decisions.md §4b.
      const weightMap = Object.fromEntries(
        keyedRows.map(({ row, key }) => [key, Number(row.weight)]),
      ) as StrategyWeightMap;

      const seed = Date.now() >>> 0;
      const random = createSeededRandom(seed);
      const candles = await this.experiments.candles(
        experimentConfig.timeframe,
        experimentConfig.start_time,
        experimentConfig.end_time,
      );
      if (candles.length < this.minimumCandles(config.enabledDomains)) {
        throw new Error(
          'The experiment dataset no longer contains enough candles.',
        );
      }

      // Precompute every AI strategy's whole-series signals EXACTLY ONCE
      // for this run — every candidate generated below shares this same
      // candle series (see AiStrategySignalPrecomputeService's doc
      // comment for why this, not per-candidate or per-candle, is the
      // right amortization point). A strategy that fails here (broken
      // code, a timed-out subprocess) is logged and simply excluded from
      // the run catalog below — see buildRunCatalog() — never lets one
      // broken AI strategy hang or fail the whole experiment.
      const aiRows = keyedRows.filter(({ row }) => row.type === 'AI_GENERATED');
      const aiSignalsByType = aiRows.length
        ? await this.aiPrecompute.precompute(
            aiRows.map(({ row, key }) => ({
              key,
              sourceCode: row.source_code ?? '',
            })),
            this.toAiCandleInput(candles),
          )
        : new Map<string, StrategySignal[]>();
      const aiSignals = aiSignalsByType as unknown as Map<
        SearchStrategyType,
        StrategySignal[]
      >;

      const runCatalog = this.buildRunCatalog(keyedRows, aiSignalsByType);
      const usableDomains = config.enabledDomains.filter(
        (domain) => runCatalog[domain].length > 0,
      );
      this.assertUsableDomains(usableDomains, config.enabledDomains);
      const runConfig: SearchConfig = { ...config, enabledDomains: usableDomains };

      let generated = await this.iterations.countByExperimentId(experimentId);
      let bestScore = Number.NEGATIVE_INFINITY;
      let noImprovement = 0;
      let attempts = 0;
      const maximumAttempts = Math.max(config.maxCandidates * 100, 1000);
      // Deliberately relative to "now" (when this run() invocation starts),
      // not experiment.created_at: for a fresh experiment the two are
      // effectively the same instant, but for a resumed/extended run
      // (see extend()) created_at is from the ORIGINAL experiment creation
      // — potentially long past — which would make this deadline already
      // expired and silently produce zero new iterations.
      const deadline = Date.now() + config.maxDurationSeconds * 1000;
      let stopReason = 'MAX_CANDIDATES';

      while (generated < config.maxCandidates) {
        if (await this.experiments.isCancelled(experimentId)) return;
        if (Date.now() >= deadline) {
          stopReason = 'MAX_DURATION';
          break;
        }
        if (noImprovement >= config.maxNoImprovement) {
          stopReason = 'NO_IMPROVEMENT';
          break;
        }
        if (attempts >= maximumAttempts) {
          stopReason = 'SEARCH_SPACE_EXHAUSTED';
          break;
        }
        attempts += 1;

        const generatedCandidate = this.generator.generate(random, runConfig, runCatalog);
        const candidateDefinition =
          this.fingerprintService.canonicalize(generatedCandidate);

        const iteration = await this.database.withTransaction((client) =>
          this.iterations.createNext(client, experimentId),
        );
        generated += 1;
        let candidateEntity:
          | Awaited<ReturnType<CandidateRepository['createForIteration']>>
          | undefined;

        try {
          candidateEntity = await this.database.withTransaction((client) =>
            this.candidates.createForIteration(
              client,
              iteration.id,
              candidateDefinition.members.map((member) => {
                const strategyId = strategyIdByType.get(member.type);
                if (!strategyId) {
                  throw new Error(
                    `No strategyId resolved for generated member type "${member.type}"; ` +
                      'this indicates enabledDomains/weights validation in start() has a gap.',
                  );
                }
                return { strategyId, parameters: member.parameters };
              }),
            ),
          );
          this.metrics.candidatesGeneratedTotal.inc();

          const result = this.backtesting.run(
            candidateDefinition,
            candles,
            weightMap,
            aiSignals,
          );
          this.metrics.backtestsRunTotal.inc();
          await this.backtestRuns.complete(candidateEntity.id, result);
          await this.iterations.complete(iteration.id);

          if (
            result.evaluation.numberOfTrades >= config.minimumTrades &&
            result.evaluation.overallScore > bestScore
          ) {
            bestScore = result.evaluation.overallScore;
            noImprovement = 0;
          } else {
            noImprovement += 1;
          }
        } catch (error) {
          noImprovement += 1;
          await this.iterations.fail(iteration.id, this.errorMessage(error));
          // Only mark backtest_runs FAILED if the candidate row was created —
          // an error thrown while creating the candidate itself has nothing
          // to attach a backtest_runs row to.
          if (candidateEntity) {
            await this.backtestRuns.fail(
              candidateEntity.id,
              this.errorMessage(error),
            );
          }
          this.logger.warn(
            `Iteration ${iteration.id} failed: ${this.errorMessage(error)}`,
          );
        }

        // Rebuild the leaderboard outside the backtest/persist try block: a
        // rebuild failure (e.g. transient DB error) must not retroactively
        // flip an already-COMPLETED backtest run / iteration to FAILED.
        try {
          await this.leaderboard.rebuildForExperiment(
            experimentId,
            config.topK,
            config.minimumTrades,
          );
        } catch (error) {
          this.logger.warn(
            `Leaderboard rebuild failed for experiment ${experimentId}: ${this.errorMessage(error)}`,
          );
        }

        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      this.logger.log(`Search ${experimentId} stopped: ${stopReason}`);

      if (!(await this.experiments.isCancelled(experimentId))) {
        await this.experiments.finish(experimentId, 'COMPLETED');
      }
    } catch (error) {
      if (!(await this.experiments.isCancelled(experimentId))) {
        await this.experiments.finish(experimentId, 'FAILED');
      }
      throw error;
    } finally {
      this.activeRuns.delete(experimentId);
    }
  }

  // The one built-in plugin type for a domain — used only for the
  // default-equal-weight fallback in start() when the caller omits
  // strategyWeights entirely (a caller that wants an AI strategy included
  // must say so explicitly via strategyWeights; the default never reaches
  // into "the user's AI strategies" on its own).
  private builtinTypeForDomain(
    domain: StrategyDomain,
  ): 'MA' | 'RSI' | 'BOLLINGER' | 'SUPPORT_RESISTANCE' {
    const map: Record<StrategyDomain, 'MA' | 'RSI' | 'BOLLINGER' | 'SUPPORT_RESISTANCE'> = {
      TREND: 'MA',
      MOMENTUM: 'RSI',
      VOLATILITY: 'BOLLINGER',
      STRUCTURE: 'SUPPORT_RESISTANCE',
    };
    return map[domain];
  }

  // Maps candle rows to the ai-strategy module's CandleInput contract —
  // same shape AiStrategyService.run() builds for the standalone "chạy
  // thử" endpoint, duplicated here (not imported) because it is a trivial,
  // one-way field mapping and importing it would pull a controller-facing
  // service into the search module for no benefit.
  private toAiCandleInput(candles: CandleEntity[]): CandleInput[] {
    return candles.map((c) => ({
      timestamp: new Date(c.timestamp).getTime(),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
    }));
  }

  // Builds this run's per-domain sampler catalog from the experiment's
  // actual weight rows: a built-in row contributes the fixed
  // STRATEGY_CATALOG entry for its domain, an AI row contributes a fixed
  // (non-randomized) member pinned to its exact strategyId/version — but
  // ONLY if its signals were successfully precomputed (aiSignalsByType has
  // its key). This is where a failed/excluded AI strategy actually stops
  // participating in candidate generation for this run — see run()'s
  // "Precompute" comment.
  private buildRunCatalog(
    keyedRows: Array<{ row: WeightRow; key: SearchStrategyType }>,
    aiSignalsByType: Map<string, StrategySignal[]>,
  ): RunCatalog {
    const catalog: RunCatalog = { TREND: [], MOMENTUM: [], VOLATILITY: [], STRUCTURE: [] };
    for (const { row, key } of keyedRows) {
      let domain: StrategyDomain;
      try {
        domain = strategyRowDomain(row);
      } catch (error) {
        this.logger.warn(
          `Weight row for "${row.name}" has no resolvable domain and is excluded from this run: ${this.errorMessage(error)}`,
        );
        continue;
      }
      if (row.type === 'AI_GENERATED') {
        if (!aiSignalsByType.has(key)) continue; // excluded — precompute failed
        catalog[domain].push(
          aiCatalogEntry({ id: row.strategy_id, domain, version: row.version }),
        );
      } else {
        const entry = STRATEGY_CATALOG[domain];
        if (entry.type === row.name) catalog[domain].push(entry);
      }
    }
    return catalog;
  }

  // Fails the run explicitly (rather than letting the generator crash
  // mid-loop on an empty domain array, or silently searching a narrower
  // space than the experiment was started with) when precompute
  // failures/domain-resolution gaps leave no directional or no
  // confirmation domain usable. A partial reduction that still leaves both
  // roles covered is allowed to proceed — logged, not fatal.
  private assertUsableDomains(
    usableDomains: StrategyDomain[],
    requestedDomains: StrategyDomain[],
  ): void {
    const dropped = requestedDomains.filter((d) => !usableDomains.includes(d));
    if (dropped.length === 0) {
      // Nothing was excluded by precompute failures/domain-resolution gaps
      // — trust the directional/confirmation invariant start()'s
      // validateRequest() already established before this experiment's
      // weights were persisted; re-deriving domains from persisted rows
      // (loadConfig()'s reconstruction path) can legitimately yield a
      // single domain in isolation (e.g. a resumed test/tooling fixture),
      // which is not this method's concern to re-validate.
      return;
    }
    this.logger.warn(
      `Domains unusable for this run (no available strategy): ${dropped.join(', ')}`,
    );
    const hasDirectional = usableDomains.some((d) => d === 'TREND' || d === 'STRUCTURE');
    const hasConfirmation = usableDomains.some((d) => d === 'MOMENTUM' || d === 'VOLATILITY');
    if (!hasDirectional || !hasConfirmation) {
      throw new Error(
        'No directional and confirmation domain pair is usable for this run — ' +
          'every candidate strategy for the missing role failed to precompute or resolve.',
      );
    }
  }

  // CompositeStrategyService.analyze() divides the weighted sum by the sum
  // of the weights (Điểm tổng hợp = Σ (trọng số × tín hiệu) / Σ trọng số),
  // so the weights do NOT need to sum to 1 — the formula normalizes them
  // itself. What must still hold, so the normalization stays well-defined:
  // every weight is a finite number >= 0 (negative would invert a
  // strategy's vote, which isn't a supported concept), and the weights
  // aren't all zero (that makes the denominator 0 — reject it here with a
  // clear message rather than let the composite service silently score 0).
  private assertWeightsValid(weights: StrategyWeight[]): void {
    const invalid = weights.filter(
      (item) => !Number.isFinite(item.weight) || item.weight < 0,
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `strategyWeights must be finite numbers >= 0 (invalid: ${invalid
          .map((item) => `${item.type}=${item.weight}`)
          .join(', ')}).`,
      );
    }

    const sum = weights.reduce((total, item) => total + item.weight, 0);
    if (sum === 0) {
      throw new BadRequestException(
        'strategyWeights must not all be zero (the composite score would have no denominator).',
      );
    }
  }

  // Guards against a weight set that does not exactly cover the enabled
  // domains: a domain with no matching weight would leave a generated
  // candidate member with no strategyId, and a weight for a type whose
  // domain isn't enabled is silently useless. Either case previously
  // produced an experiment that runs to COMPLETED with zero candidates.
  // Domain is read from each RESOLVED weight entry (built-in or AI) rather
  // than a fixed domain->type table — a domain can now be covered by a
  // built-in, one or more AI strategies, or both.
  private assertWeightsCoverEnabledDomains(
    resolved: Array<{ domain: StrategyDomain }>,
    enabledDomains: StrategyDomain[],
  ): void {
    const givenDomains = new Set(resolved.map((r) => r.domain));

    const missing = enabledDomains.filter((domain) => !givenDomains.has(domain));
    const unexpected = [...givenDomains].filter(
      (domain) => !enabledDomains.includes(domain),
    );

    if (missing.length > 0 || unexpected.length > 0) {
      const parts: string[] = [];
      if (missing.length > 0) {
        parts.push(
          `enabled domains have no matching weight: ${missing.join(', ')}`,
        );
      }
      if (unexpected.length > 0) {
        parts.push(
          `weights given for a domain that is not enabled: ${unexpected.join(', ')}`,
        );
      }
      throw new BadRequestException(
        `strategyWeights must exactly cover enabledDomains (${parts.join('; ')}).`,
      );
    }
  }

  private validateRequest(request: StartSearchRequest) {
    const startTime = new Date(request.startTime);
    const endTime = new Date(request.endTime);
    if (
      !request.timeframe ||
      !['1m', '5m', '15m', '1h', '4h'].includes(request.timeframe)
    ) {
      throw new BadRequestException('Unsupported timeframe.');
    }
    if (
      !Number.isFinite(startTime.getTime()) ||
      !Number.isFinite(endTime.getTime()) ||
      startTime >= endTime
    ) {
      throw new BadRequestException(
        'startTime and endTime must define a valid range.',
      );
    }
    const enabledDomains =
      request.enabledDomains ?? DEFAULT_SEARCH_CONFIG.enabledDomains;
    const allowedDomains: StrategyDomain[] = [
      'TREND',
      'MOMENTUM',
      'VOLATILITY',
      'STRUCTURE',
    ];
    if (enabledDomains.some((domain) => !allowedDomains.includes(domain))) {
      throw new BadRequestException(
        'enabledDomains contains an unsupported domain.',
      );
    }
    const config: SearchConfig = {
      ...DEFAULT_SEARCH_CONFIG,
      enabledDomains: [...new Set(enabledDomains)],
      maxCandidates: this.integerInRange(
        request.maxCandidates,
        1,
        10_000,
        100,
        'maxCandidates',
      ),
      maxDurationSeconds: this.integerInRange(
        request.maxDurationSeconds,
        1,
        86_400,
        3600,
        'maxDurationSeconds',
      ),
      maxNoImprovement: this.integerInRange(
        request.maxNoImprovement,
        1,
        10_000,
        50,
        'maxNoImprovement',
      ),
      topK: this.integerInRange(request.topK, 1, 100, 10, 'topK'),
      minimumTrades: this.integerInRange(
        request.minimumTrades,
        0,
        10_000,
        20,
        'minimumTrades',
      ),
    };
    const hasDirectional = config.enabledDomains.some(
      (item) => item === 'TREND' || item === 'STRUCTURE',
    );
    const hasConfirmation = config.enabledDomains.some(
      (item) => item === 'MOMENTUM' || item === 'VOLATILITY',
    );
    if (!hasDirectional || !hasConfirmation) {
      throw new BadRequestException(
        'Enable at least one directional and one confirmation domain.',
      );
    }
    config.maxMembers = Math.min(
      config.maxMembers,
      config.enabledDomains.length,
    );
    return { startTime, endTime, config };
  }

  private integerInRange(
    value: number | undefined,
    minimum: number,
    maximum: number,
    fallback: number,
    field: string,
  ): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
      throw new BadRequestException(
        `${field} must be an integer from ${minimum} to ${maximum}.`,
      );
    }
    return resolved;
  }

  private minimumCandles(domains: StrategyDomain[]): number {
    const requirements: Record<StrategyDomain, number> = {
      TREND: 202,
      MOMENTUM: 23,
      VOLATILITY: 31,
      STRUCTURE: 102,
    };
    return Math.max(...domains.map((domain) => requirements[domain]));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
