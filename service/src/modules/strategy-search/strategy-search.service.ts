import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getCorrelationId } from '../../observability/correlation/correlation-context';
import {
  BacktestCompletedPayload,
  BacktestFailedPayload,
  CandidatesRegeneratedPayload,
  DomainEventNames,
} from '../../domain-events';
import { BacktestingService } from '../backtesting/backtesting.service';
import {
  BacktestCosts,
  DEFAULT_BACKTEST_COSTS,
} from '../backtesting/backtesting.types';
import { MarketDataService } from '../market-data/market-data.service';
import {
  intervalMs,
  MIN_CANDLES_PER_TIMEFRAME,
} from '../market-data/config';
import { BacktestRunRepository } from '../backtesting/repositories/backtest-run.repository';
import { StrategyWeightMap } from '../composite-strategy/composite-strategy.service';
import {
  aiStrategyIdFromType,
  DEFAULT_SEARCH_CONFIG,
  SEARCH_ALGORITHM,
  isAiStrategyType,
  SearchConfig,
  SearchStrategyType,
  StartSearchRequest,
  strategyRowDomain,
  strategyTypeKey,
  StrategyDomain,
  StrategyWeight,
  BuiltInStrategyType,
  BUILTIN_DOMAIN_BY_NAME,
  defaultEqualWeights,
} from './domain/search.types';
import {
  aiCatalogEntry,
  STRATEGY_CATALOG,
  versionCatalogEntry,
} from './catalog/strategy-catalog';
import { RunCatalog } from './generators/domain-guided-random.generator';
// Type-only: named in a decorated constructor signature (isolatedModules +
// emitDecoratorMetadata), and an interface has no runtime value to emit.
import type { SearchAlgorithm } from './domain/search.types';
import {
  CandidateDetail,
  CandidateRepository,
  RankedCandidateSummary,
  TopCandidateMemberRow,
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

// Upper bound for the caller-supplied Top-K. The leaderboard is a
// shortlist meant to be read at a glance; letting a client ask for 100
// rows only produced a table nobody scrolls.
const MAX_TOP_K = 20;
import { MetricsService } from '../../observability/metrics/metrics.service';
import { AiStrategyRepository } from '../ai-strategy/repositories/ai-strategy.repository';
import { AiStrategySignalPrecomputeService } from '../ai-strategy/ai-strategy-signal-precompute.service';
import { CandleInput } from '../ai-strategy/ai-strategy.types';
import { CandleEntity, StrategyEntity } from '../../database/types';
import { StrategySignal } from '../strategy-engine/strategy.types';
import { StrategyPluginService } from '../strategy-plugin/strategy-plugin.service';
import { NewsSentimentPrecomputeService } from '../news/news-sentiment-precompute.service';
import { CandidateDefinition } from './domain/search.types';
import { MARKET_SCOPE } from '../../common/market-scope';

@Injectable()
export class StrategySearchService implements OnApplicationBootstrap {
  private static readonly MAX_TRADE_PAGE_SIZE = 200;
  private static readonly DEFAULT_TRADE_PAGE_SIZE = 20;

  private readonly logger = new Logger(StrategySearchService.name);
  private readonly activeRuns = new Set<string>();
  private readonly configCache = new Map<string, SearchConfig>();

  constructor(
    private readonly database: DatabaseService,
    private readonly marketData: MarketDataService,
    private readonly experiments: ExperimentRepository,
    private readonly experimentConfigs: ExperimentConfigRepository,
    private readonly iterations: ExperimentIterationRepository,
    private readonly candidates: CandidateRepository,
    private readonly strategies: StrategyRepository,
    // Injected by token, not as the concrete generator: the search loop
    // below only ever calls generate(), so the algorithm is swappable
    // without touching this file. See SEARCH_ALGORITHM.
    @Inject(SEARCH_ALGORITHM)
    private readonly generator: SearchAlgorithm<RunCatalog>,
    private readonly fingerprintService: CandidateFingerprintService,
    private readonly backtesting: BacktestingService,
    private readonly backtestRuns: BacktestRunRepository,
    private readonly searchQueue: SearchQueueService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsService,
    private readonly aiStrategies: AiStrategyRepository,
    private readonly aiPrecompute: AiStrategySignalPrecomputeService,
    private readonly strategyPlugin: StrategyPluginService,
    private readonly sentimentPrecompute: NewsSentimentPrecomputeService,
    // Replaces the former direct LeaderboardService dependency. Search no
    // longer knows the Leaderboard exists; it announces what happened and
    // LeaderboardEventsHandler decides what that means. See
    // artifacts/event-catalog.md.
    private readonly events: EventEmitter2,
  ) {}

  // One market for the whole deployment, shared with MarketDataGateway and
  // RealtimeSignalService — see common/market-scope.ts. Kept as a static
  // here so the auto-backfill below does not have to invent a symbol.
  private static readonly SYMBOL = MARKET_SCOPE.symbol;

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
    const warmupBars = this.minimumCandles(config.enabledDomains);
    const dataStartTime = this.candleDataStart(
      request.timeframe,
      startTime,
      warmupBars,
    );
    const requiredCandles = warmupBars + 2;

    // Fill the local `candles` table from Binance before deciding the
    // window is unusable. Strategies need warmup bars BEFORE the user's
    // configured start date, plus the backtest window itself — fetching
    // only [startTime, endTime] left long lookbacks (MA/STRUCTURE) without
    // history and made runs look like they "completed" with no visible
    // results. Idempotent and page-bounded — see ensureCandleCoverage.
    try {
      await this.marketData.ensureCandleCoverage(
        StrategySearchService.SYMBOL,
        request.timeframe,
        dataStartTime,
        endTime,
        Math.max(requiredCandles, MIN_CANDLES_PER_TIMEFRAME),
      );
    } catch (error) {
      // A Binance outage must not make an otherwise-runnable window fail:
      // fall through to the candle count check, which reports the real
      // situation either way.
      this.logger.warn(
        `Candle backfill for ${request.timeframe} failed: ${this.errorMessage(error)}`,
      );
    }

    const candles = await this.experiments.candles(
      request.timeframe,
      dataStartTime,
      endTime,
    );
    if (candles.length < requiredCandles) {
      throw new BadRequestException(
        `Khoảng thời gian đã chọn chỉ có ${candles.length} nến ${request.timeframe} ` +
          `(cần tối thiểu ${requiredCandles}, bao gồm ${warmupBars} nến warmup trước ngày bắt đầu). ` +
          'Hãy chọn khoảng ngày dài hơn, hoặc đổi sang timeframe nhỏ hơn.',
      );
    }

    // Pin each built-in to the version that is current FOR THIS USER right
    // now (their own latest saved parameter version, else the shared SYSTEM
    // row) — not the bare SYSTEM row. about-projects/02-architecture-goals
    // §9: "Every experiment remains traceable to the exact strategy
    // version, parameters, dataset, timeframe, result, and trades that
    // produced it." Pinning happens once, here, and the pinned rows are
    // immutable, so a later saved version never rewrites what this
    // experiment ran against.
    const systemStrategies = await this.strategies.listLatestForUser(userId);
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

  /**
   * The cascade behind ParameterPanel's "Lưu tham số → tạo version mới".
   *
   * The approved prototype's `saveParams()` does two things: it appends a
   * new parameter version to that ONE strategy's own history
   * (`hist[strategyId]`), and it then reports "hệ thống sinh lại N tổ hợp
   * có chứa strategy này thành version tổ hợp mới trong Leaderboard". The
   * first half is `StrategyPluginService.saveVersion` (a new immutable
   * `strategies` row). This method is the second half.
   *
   * Two-level versioning, straight from the prototype's own state logic:
   *   verNum(id) = base + histOf(id).length - 1          // strategy đơn
   *   bump       = Σ (histOf(memberId).length - 1)       // over members
   *   comboVer   = 1 + bump + comboRev                   // candidate
   * A candidate's version is DERIVED from the versions of its member
   * strategies — which is exactly what `candidate_strategies.strategy_id`
   * already encodes, since each row points at one specific, immutable
   * `strategies` version row. So nothing new needs storing: bumping a
   * member's version and re-running the combination IS the new combo
   * version, and about-projects #36's "Experiment #122 must remain linked
   * to the exact version it used" holds because the OLD candidates keep
   * pointing at the OLD rows, untouched.
   *
   * Scope and bound: only the combinations currently ON the Leaderboard
   * are regenerated (`listTopCandidateMembers`, limited to the
   * experiment's own Top-K), matching the prototype where `combos()` IS
   * the leaderboard. Candidates are grouped by their set of member
   * strategy names and one new candidate is produced per distinct
   * combination, seeded from that combination's best-ranked current
   * candidate — so this can never fan out into hundreds of synchronous
   * backtests, and re-saving does not pile up near-duplicate rows.
   */
  async regenerateForStrategyVersion(
    experimentId: string,
    userId: string,
    strategyName: string,
  ): Promise<{
    regenerated: number;
    skipped: number;
    candidateIds: string[];
    summaries: RankedCandidateSummary[];
  }> {
    const experiment = await this.experiments.findOwned(experimentId, userId);
    if (!experiment) throw new NotFoundException('Experiment not found.');

    const experimentConfig =
      await this.experimentConfigs.findByExperimentId(experimentId);
    if (!experimentConfig) throw new Error('Experiment config not found.');

    // The version row to switch affected combinations onto: this user's
    // current latest for that name (the one saveVersion just inserted).
    const latestForUser = await this.strategies.listLatestForUser(userId);
    const newRow = latestForUser.find((row) => row.name === strategyName);
    if (!newRow) {
      throw new BadRequestException(`Unknown strategy "${strategyName}".`);
    }

    const config = await this.loadConfig(experimentId);
    const memberRows = await this.candidates.listTopCandidateMembers(
      experimentId,
      userId,
      config.topK,
    );

    // Rebuild per-candidate member lists, preserving the score ordering the
    // query returned so the first candidate seen for a combination is its
    // best-ranked one.
    const byCandidate = new Map<string, TopCandidateMemberRow[]>();
    for (const row of memberRows) {
      const list = byCandidate.get(row.candidate_id);
      if (list) list.push(row);
      else byCandidate.set(row.candidate_id, [row]);
    }

    const combinationKey = (members: TopCandidateMemberRow[]): string =>
      members
        .map((m) => m.name)
        .sort()
        .join('+');

    // First pass: which combinations are ALREADY represented on the
    // Leaderboard by a candidate running the new version? Tracking this per
    // COMBINATION (not per candidate) is what makes the cascade idempotent.
    // Skipping merely the already-migrated candidate is not enough: the
    // older, still-on-the-previous-version candidates of that same
    // combination are also on the Leaderboard, and one of them would then
    // seed a duplicate regeneration on every subsequent save. Reproduced
    // live — a second cascade with no new version saved created a second
    // identical MA v8 + RSI v1 candidate.
    const alreadyOnNewVersion = new Set<string>();
    for (const members of byCandidate.values()) {
      const target = members.find((m) => m.name === strategyName);
      if (target && target.version === newRow.version) {
        alreadyOnNewVersion.add(combinationKey(members));
      }
    }

    // Second pass: one entry per distinct combination that contains the
    // changed strategy and is not already covered, seeded from its
    // best-ranked candidate (the query returns members in score order).
    const combinations = new Map<string, TopCandidateMemberRow[]>();
    for (const members of byCandidate.values()) {
      if (!members.some((m) => m.name === strategyName)) continue;
      const key = combinationKey(members);
      if (alreadyOnNewVersion.has(key)) continue;
      if (!combinations.has(key)) combinations.set(key, members);
    }

    if (combinations.size === 0) {
      return { regenerated: 0, skipped: 0, candidateIds: [], summaries: [] };
    }

    const warmupBars = this.minimumCandles(config.enabledDomains);
    const dataStartTime = this.candleDataStart(
      experimentConfig.timeframe,
      experimentConfig.start_time,
      warmupBars,
    );
    const candles = await this.experiments.candles(
      experimentConfig.timeframe,
      dataStartTime,
      experimentConfig.end_time,
    );

    // Weights come from the experiment's immutable config, keyed by
    // strategy NAME — the new version row is a different `strategies` row
    // than the pinned one, but weight belongs to the strategy, not to a
    // parameter version (see CandidateRepository.findDetail's join note).
    const weightRows =
      await this.experimentConfigs.weightsByExperimentId(experimentId);
    const weightByName = new Map(
      weightRows.map((row) => [row.name, Number(row.weight)]),
    );

    const newParameters = (newRow.parameters ?? {}) as Record<string, number>;
    const created: string[] = [];
    let skipped = 0;

    const sentimentLookbacks = new Set<number>();
    for (const members of combinations.values()) {
      const sentiment = members.find((member) => member.name === 'NEWS_SENTIMENT');
      if (!sentiment) continue;
      const parameters =
        strategyName === 'NEWS_SENTIMENT' ? newParameters : sentiment.parameters;
      const hours = Number(parameters.lookbackHours);
      if (Number.isFinite(hours) && hours > 0) sentimentLookbacks.add(hours);
    }
    const sentimentByLookback = await this.sentimentPrecompute.precomputeMany(
      candles,
      [...sentimentLookbacks],
    );

    for (const members of combinations.values()) {
      // Substitute ONLY the changed strategy: its new version row and its
      // newly saved parameters. Every other member keeps the exact row and
      // parameters its seed candidate ran with, so the comparison against
      // the previous combo version stays apples-to-apples.
      const substituted = members.map((member) =>
        member.name === strategyName
          ? {
              strategyId: newRow.id,
              name: newRow.name,
              type: newRow.type,
              version: newRow.version,
              parameters: newParameters,
            }
          : {
              strategyId: member.strategy_id,
              name: member.name,
              type: member.strategy_type,
              version: member.version,
              parameters: member.parameters,
            },
      );

      const keyed = substituted.map((member) => ({
        member,
        key: strategyTypeKey({
          id: member.strategyId,
          name: member.name,
          type: member.type,
        }),
      }));

      const weightMap = Object.fromEntries(
        keyed.map(({ member, key }) => [key, weightByName.get(member.name) ?? 0]),
      ) as StrategyWeightMap;

      const aiMembers = keyed.filter(({ member }) => member.type === 'AI_GENERATED');
      let aiSignals = new Map<SearchStrategyType, StrategySignal[]>();
      if (aiMembers.length > 0) {
        const sourceByKey = await this.aiSourceCodeByKey(aiMembers, userId);
        const precomputed = await this.aiPrecompute.precompute(
          sourceByKey,
          this.toAiCandleInput(candles),
        );
        aiSignals = precomputed as unknown as Map<SearchStrategyType, StrategySignal[]>;
        // An AI member whose signals could not be precomputed cannot be
        // backtested — skip this whole combination rather than scoring it
        // with a silently-missing member (same failure isolation as run()).
        if (aiMembers.some(({ key }) => !precomputed.has(key))) {
          skipped += 1;
          continue;
        }
      }

      let candidateDefinition: CandidateDefinition;
      try {
        candidateDefinition = {
          schemaVersion: 1,
          combination: {
            method: 'WEIGHTED_VOTE',
            buyThreshold: 0.3,
            sellThreshold: -0.3,
          },
          members: keyed.map(({ member, key }) => ({
            type: key,
            domain: strategyRowDomain({
              name: member.name,
              type: member.type,
              parameters: member.parameters,
            }),
            pluginVersion: member.version,
            parameters: member.parameters,
          })),
        };
      } catch (error) {
        // A member with no resolvable domain (legacy AI row) — skip the
        // combination, never fail the whole cascade.
        this.logger.warn(
          `Skipping regeneration of a combination: ${this.errorMessage(error)}`,
        );
        skipped += 1;
        continue;
      }

      const iteration = await this.database.withTransaction((client) =>
        this.iterations.createNext(client, experimentId),
      );
      let candidateEntity: Awaited<
        ReturnType<CandidateRepository['createForIteration']>
      >;
      try {
        candidateEntity = await this.database.withTransaction((client) =>
          this.candidates.createForIteration(
            client,
            iteration.id,
            keyed.map(({ member }) => ({
              strategyId: member.strategyId,
              parameters: member.parameters,
            })),
          ),
        );
      } catch (error) {
        await this.iterations.fail(iteration.id, this.errorMessage(error));
        skipped += 1;
        continue;
      }
      this.metrics.candidatesGeneratedTotal.inc();

      try {
        const result = this.backtesting.run(
          candidateDefinition,
          candles,
          weightMap,
          aiSignals,
          this.sentimentSeriesForCandidate(
            candidateDefinition,
            sentimentByLookback,
          ),
          config.costs,
          experimentConfig.start_time,
        );
        this.metrics.backtestsRunTotal.inc();
        await this.backtestRuns.complete(candidateEntity.id, result);
        await this.iterations.complete(iteration.id);
        created.push(candidateEntity.id);
      } catch (error) {
        await this.iterations.fail(iteration.id, this.errorMessage(error));
        await this.backtestRuns.fail(candidateEntity.id, this.errorMessage(error));
        this.logger.warn(
          `Regenerated candidate ${candidateEntity.id} failed to backtest: ${this.errorMessage(error)}`,
        );
        skipped += 1;
      }
    }

    if (created.length > 0) {
      // Deliberately NOT wrapped in try/catch, unlike the per-iteration
      // events in run(): this cascade is a synchronous user action, and a
      // rebuild failure here has always surfaced as a 5xx rather than a
      // 200 carrying a stale leaderboard. emitAsync propagates a listener
      // rejection, which is what preserves that. See
      // artifacts/event-catalog.md, "consumer failure".
      const payload: CandidatesRegeneratedPayload = {
        experimentId,
        candidateIds: created,
        topK: config.topK,
        correlationId: getCorrelationId(),
      };
      await this.events.emitAsync(DomainEventNames.CandidatesRegenerated, payload);
    }

    // The regenerated combinations are exactly what the user asked to
    // see, so return where each one landed against the whole population -
    // a version that scored outside the Top-K is otherwise invisible on
    // the Leaderboard and looks like it was never created.
    const summaries = await this.candidates.rankedSummaries(
      experimentId,
      userId,
      created,
    );

    return {
      regenerated: created.length,
      skipped,
      candidateIds: created,
      summaries,
    };
  }
  private sentimentSeriesForCandidate(
    candidate: CandidateDefinition,
    byLookback: Map<number, Array<number | null>>,
  ): Array<number | null> | undefined {
    const sentiment = candidate.members.find(
      (member) => member.type === 'NEWS_SENTIMENT',
    );
    if (!sentiment) return undefined;
    return byLookback.get(Number(sentiment.parameters.lookbackHours));
  }

  // Loads the Python source for each AI member being regenerated, keyed the
  // same way AiStrategySignalPrecomputeService expects.
  private async aiSourceCodeByKey(
    aiMembers: Array<{ member: { strategyId: string }; key: SearchStrategyType }>,
    userId: string,
  ): Promise<Array<{ key: string; sourceCode: string }>> {
    const out: Array<{ key: string; sourceCode: string }> = [];
    for (const { member, key } of aiMembers) {
      const row = await this.aiStrategies.findOwnedActiveById(
        member.strategyId,
        userId,
      );
      out.push({ key, sourceCode: row?.source_code ?? '' });
    }
    return out;
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
  //
  // `limit` is genuinely optional (undefined, not the controller defaulting
  // it) so this can tell "caller omitted it" from "caller asked for N" —
  // when omitted, the experiment's own persisted `topK` (same value
  // leaderboards.top_k / leaderboard_entries was rebuilt with — see
  // config.topK carried on run()'s `backtest.completed` event payload)
  // is the default, so a fresh page load with no explicit choice sees
  // exactly the persisted leaderboard, not a hard-coded row count that can
  // disagree with it. An explicit `limit` still overrides (legitimate
  // pagination) and is still clamped to [1, 100].
  // CQRS read side (tactical — see artifacts/cqrs.md). This method never
  // computes a ranking: it serves the `leaderboard_entries` read model that
  // the write side materialised, cache-aside behind a key versioned by
  // `leaderboardVersionKey`. Write and read share one database; only the
  // paths are separated, which is the whole claim being made.
  async getTop(experimentId: string, userId: string, limit?: number) {
    const experiment = await this.experiments.findOwned(experimentId, userId);
    if (!experiment) throw new NotFoundException('Experiment not found.');
    const config = await this.loadConfig(experimentId);
    const effectiveLimit = limit ?? config.topK;
    const clampedLimit = Math.min(100, Math.max(1, effectiveLimit));

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
  // domainsFromWeightRows); maxDurationSeconds/maxNoImprovement/topK
  // come from experiments.search_config (JSONB, populated by
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
      costs: config.costs,
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
    'maxDurationSeconds' | 'maxNoImprovement' | 'topK' | 'costs'
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
      topK: boundedOrDefault(obj.topK, 1, MAX_TOP_K, DEFAULT_SEARCH_CONFIG.topK),
      costs: this.sanitizeCosts(obj.costs),
    };
  }

  /**
   * Same defensive parse for the cost model. A row written before costs
   * were configurable has no `costs` key at all and falls back to
   * DEFAULT_BACKTEST_COSTS, which is exactly the behaviour that run
   * originally had - so re-running an old experiment reproduces it.
   */
  private sanitizeCosts(raw: unknown): BacktestCosts {
    const obj =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const num = (value: unknown, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : fallback;
    const optional = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;
    return {
      initialCapital:
        typeof obj.initialCapital === 'number' &&
        Number.isFinite(obj.initialCapital) &&
        obj.initialCapital > 0
          ? obj.initialCapital
          : DEFAULT_BACKTEST_COSTS.initialCapital,
      transactionCostPct: num(
        obj.transactionCostPct,
        DEFAULT_BACKTEST_COSTS.transactionCostPct,
      ),
      slippageBps: num(obj.slippageBps, DEFAULT_BACKTEST_COSTS.slippageBps),
      stopLossPct: optional(obj.stopLossPct),
      takeProfitPct: optional(obj.takeProfitPct),
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

      // Force a fresh DB read here, every time: `run()` is invoked once per
      // schedule() dispatch (a brand-new experiment via start(), or a
      // resumed one via extend()), never a hot/polling path — so the
      // process-local `configCache` buys nothing here and actively causes
      // a bug across processes. extend() persists a raised iteration_limit
      // and clears ITS OWN (API-process) configCache entry, but run() only
      // ever executes in the separate worker process — a different
      // in-memory Map. Once this worker's loadConfig() had cached this
      // experimentId's config from the FIRST run, that cached entry (with
      // the original, lower maxCandidates) would live for the rest of the
      // worker process's uptime: extend() would raise iteration_limit in
      // the DB, but this cached read would keep returning the stale value,
      // so `generated < config.maxCandidates` would already be false and
      // the loop below would never run a single extra iteration — exactly
      // reproduced live: iteration_limit raised to 120 in the DB, but the
      // experiment_iterations count stayed frozen at 100 and the run
      // immediately re-completed. Deleting the cache entry first makes
      // every run() invocation read the true, currently-persisted config.
      this.configCache.delete(experimentId);
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
      const warmupBars = this.minimumCandles(config.enabledDomains);
      const dataStartTime = this.candleDataStart(
        experimentConfig.timeframe,
        experimentConfig.start_time,
        warmupBars,
      );
      const candles = await this.experiments.candles(
        experimentConfig.timeframe,
        dataStartTime,
        experimentConfig.end_time,
      );
      const requiredCandles = warmupBars + 2;
      if (candles.length < requiredCandles) {
        throw new Error(
          `The experiment dataset no longer contains enough candles (have ${candles.length}, need ${requiredCandles}).`,
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

      // Every selectable parameter version for the built-ins this
      // experiment was configured with — the generator samples over these
      // rather than an in-code tuple list, so a candidate's version label
      // always matches the parameters it actually ran (decisions.md §11).
      const versionRows = await this.strategies.listSelectableVersions(
        keyedRows
          .filter(({ row }) => row.type !== 'AI_GENERATED')
          .map(({ row }) => row.name),
        experiment.user_id,
      );
      const hasSentiment = keyedRows.some(
        ({ row }) => row.name === 'NEWS_SENTIMENT',
      );
      const configuredLookbacks = versionRows
        .filter((row) => row.name === 'NEWS_SENTIMENT')
        .map((row) => Number((row.parameters as Record<string, unknown>).lookbackHours))
        .filter((hours) => Number.isFinite(hours) && hours > 0);
      // An unseeded database uses the in-code NEWS_SENTIMENT sampler, which
      // can emit any of these four values.
      const sentimentLookbacks = hasSentiment
        ? configuredLookbacks.length > 0
          ? configuredLookbacks
          : [6, 12, 24, 48]
        : [];
      const sentimentByLookback = await this.sentimentPrecompute.precomputeMany(
        candles,
        sentimentLookbacks,
      );
      const runCatalog = this.buildRunCatalog(
        keyedRows,
        aiSignalsByType,
        versionRows,
      );
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
        // Undefined means the iteration succeeded. Recorded here rather
        // than emitted inside the try/catch below so that the emit stays
        // OUTSIDE it — see the comment at the emit site.
        let iterationFailure: string | undefined;

        try {
          candidateEntity = await this.database.withTransaction((client) =>
            this.candidates.createForIteration(
              client,
              iteration.id,
              candidateDefinition.members.map((member) => {
                // Prefer the member's OWN version row: it is the row whose
                // parameters this member is actually running. Falling back
                // to the experiment's configured row (strategyIdByType) is
                // only for the un-seeded in-code-sampler path.
                const strategyId = member.strategyId ?? strategyIdByType.get(member.type);
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
            this.sentimentSeriesForCandidate(
              candidateDefinition,
              sentimentByLookback,
            ),
            config.costs,
            experimentConfig.start_time,
          );
          this.metrics.backtestsRunTotal.inc();
          await this.backtestRuns.complete(candidateEntity.id, result);
          await this.iterations.complete(iteration.id);

          if (result.evaluation.overallScore > bestScore) {
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
          iterationFailure = this.errorMessage(error);
        }

        // Announced outside the backtest/persist try block, exactly where
        // the direct leaderboard rebuild this replaced used to sit: a
        // listener failure (e.g. transient DB error during the rebuild)
        // must not retroactively flip an already-COMPLETED backtest run /
        // iteration to FAILED.
        //
        // Emitted on BOTH outcomes, and that is load-bearing rather than
        // tidy: the rebuild used to run after EVERY iteration, failures
        // included, so a success-only event would quietly cut the number
        // of rebuilds (and of `leaderboard:version` cache bumps) below
        // what this codebase has always done. `backtest.failed` therefore
        // means "iteration boundary reached", not "new data to rank".
        //
        // emitAsync, never emit: emit() does not await async listeners, so
        // the loop would race ahead and experiments.finish(COMPLETED)
        // could land before the final rebuild committed. The direct call
        // was awaited; this stays awaited.
        try {
          if (iterationFailure === undefined && candidateEntity) {
            const payload: BacktestCompletedPayload = {
              experimentId,
              candidateId: candidateEntity.id,
              iterationId: iteration.id,
              topK: config.topK,
              correlationId: getCorrelationId(),
            };
            await this.events.emitAsync(DomainEventNames.BacktestCompleted, payload);
          } else {
            const payload: BacktestFailedPayload = {
              experimentId,
              candidateId: candidateEntity?.id,
              iterationId: iteration.id,
              reason: iterationFailure ?? 'Unknown iteration failure',
              topK: config.topK,
              correlationId: getCorrelationId(),
            };
            await this.events.emitAsync(DomainEventNames.BacktestFailed, payload);
          }
        } catch (error) {
          this.logger.warn(
            `Leaderboard rebuild failed for experiment ${experimentId}: ${this.errorMessage(error)}`,
          );
        }

        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      this.logger.log(`Search ${experimentId} stopped: ${stopReason}`);

      if (!(await this.experiments.isCancelled(experimentId))) {
        // Persist WHY the loop ended so the UI can explain a run that
        // stopped short of maxCandidates instead of just showing "51/100".
        await this.experiments.finish(experimentId, 'COMPLETED', stopReason);
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
  private builtinTypeForDomain(domain: StrategyDomain): BuiltInStrategyType {
    const map: Record<StrategyDomain, BuiltInStrategyType> = {
      TREND: 'MA',
      MOMENTUM: 'RSI',
      VOLATILITY: 'BOLLINGER',
      STRUCTURE: 'SUPPORT_RESISTANCE',
      INFORMATION: 'NEWS_SENTIMENT',
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
  //
  /**
   * Builds this run's per-domain sampler catalog. ONE ENTRY PER SELECTABLE
   * VERSION — this is the fix for the "the label lies" bug
   * (artifacts/decisions.md §11).
   *
   * Previously a built-in contributed a single entry whose `sample()` drew
   * parameters at random from a table in code, while the candidate was
   * separately pinned to whatever `strategies` row `start()` had chosen.
   * The two were unrelated, so a candidate could read "MA v7" and run
   * parameters v7 never contained — reproduced on live data (v7 stores
   * {11,30}; a candidate pinned to it ran {50,200}).
   *
   * Now every parameter set the generator can pick IS a version's stored
   * parameters, and the member carries that version's row id. Randomness is
   * unchanged in kind — the generator still picks uniformly, just over
   * versions rather than over an in-code tuple list — so Random Search
   * still explores the parameter space the brief describes
   * (04-examples-in-the-brief.md #16/#87), and every point it explores is
   * now nameable and reproducible.
   *
   * `versionRows` covers the SYSTEM parameter variants plus the user's own
   * saved versions (StrategyRepository.listSelectableVersions). A built-in
   * with no selectable version at all falls back to the in-code sampler, so
   * a database that has not been seeded still searches rather than failing.
   */
  private buildRunCatalog(
    keyedRows: Array<{ row: WeightRow; key: SearchStrategyType }>,
    aiSignalsByType: Map<string, StrategySignal[]>,
    versionRows: StrategyEntity[] = [],
  ): RunCatalog {
    const catalog: RunCatalog = {
      TREND: [],
      MOMENTUM: [],
      VOLATILITY: [],
      STRUCTURE: [],
      INFORMATION: [],
    };
    const versionsByName = new Map<string, StrategyEntity[]>();
    for (const row of versionRows) {
      const list = versionsByName.get(row.name);
      if (list) list.push(row);
      else versionsByName.set(row.name, [row]);
    }

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
        continue;
      }

      const versions = versionsByName.get(row.name) ?? [];
      if (versions.length > 0) {
        for (const version of versions) {
          catalog[domain].push(
            versionCatalogEntry({
              id: version.id,
              type: row.name as SearchStrategyType,
              domain,
              version: version.version,
              parameters: version.parameters as Record<string, number>,
            }),
          );
        }
        continue;
      }

      // Un-seeded database: keep searching using the in-code variant list
      // rather than refusing to run. Logged, because in this state the
      // version label is the base row's and the parameters are sampled —
      // the exact inconsistency this design removes.
      const entry = STRATEGY_CATALOG[domain];
      if (entry.type === row.name) {
        this.logger.warn(
          `No selectable parameter version found for "${row.name}"; falling back to the in-code sampler. ` +
            'Run database/seeds/003_system_parameter_versions.sql to materialise the parameter variants.',
        );
        catalog[domain].push(entry);
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
    // Derived from BUILTIN_DOMAIN_BY_NAME rather than re-listed here: a
    // second hard-coded copy is exactly what made INFORMATION (News
    // Sentiment) get rejected as "unsupported" after it had already been
    // added everywhere else. Adding a domain must not require remembering
    // to update a literal in request validation.
    const allowedDomains = new Set<StrategyDomain>(
      Object.values(BUILTIN_DOMAIN_BY_NAME),
    );
    if (enabledDomains.some((domain) => !allowedDomains.has(domain))) {
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
      // Capped at MAX_TOP_K so the leaderboard a run produces stays a
      // readable shortlist rather than an unbounded dump the UI has to
      // render (the field is a free-text input in the Backtest tab).
      topK: this.integerInRange(request.topK, 1, MAX_TOP_K, 10, 'topK'),
      costs: this.validateCosts(request),
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

  /**
   * Validates the caller-supplied cost model. Every field is optional and
   * falls back to DEFAULT_BACKTEST_COSTS, so a client that does not know
   * about costs yet behaves exactly as before. Bounds are deliberately
   * generous but finite - the point is to reject nonsense (negative
   * capital, a 500% fee) rather than to prescribe a trading style.
   */
  private validateCosts(request: StartSearchRequest): BacktestCosts {
    return {
      initialCapital: this.numberInRange(
        request.initialCapital,
        1,
        1_000_000_000,
        DEFAULT_BACKTEST_COSTS.initialCapital,
        'initialCapital',
      ),
      transactionCostPct: this.numberInRange(
        request.transactionCostPct,
        0,
        10,
        DEFAULT_BACKTEST_COSTS.transactionCostPct,
        'transactionCostPct',
      ),
      slippageBps: this.numberInRange(
        request.slippageBps,
        0,
        1_000,
        DEFAULT_BACKTEST_COSTS.slippageBps,
        'slippageBps',
      ),
      stopLossPct: this.optionalNumberInRange(
        request.stopLossPct,
        0.01,
        100,
        'stopLossPct',
      ),
      takeProfitPct: this.optionalNumberInRange(
        request.takeProfitPct,
        0.01,
        1_000,
        'takeProfitPct',
      ),
    };
  }

  private numberInRange(
    value: number | undefined,
    minimum: number,
    maximum: number,
    fallback: number,
    field: string,
  ): number {
    const resolved = value ?? fallback;
    if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum) {
      throw new BadRequestException(
        `${field} must be a number from ${minimum} to ${maximum}.`,
      );
    }
    return resolved;
  }

  /** Same as numberInRange, but `undefined`/`null` means "disabled". */
  private optionalNumberInRange(
    value: number | null | undefined,
    minimum: number,
    maximum: number,
    field: string,
  ): number | null {
    if (value === undefined || value === null) return null;
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new BadRequestException(
        `${field} must be a number from ${minimum} to ${maximum}, or omitted to disable it.`,
      );
    }
    return value;
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
      // A sentiment member needs no candle history of its own — it reads a
      // precomputed per-candle series, so it imposes no extra minimum.
      INFORMATION: 2,
    };
    return Math.max(...domains.map((domain) => requirements[domain]));
  }

  /** Earliest timestamp to load so indicators have warmup history before the user's window. */
  private candleDataStart(
    timeframe: string,
    userStart: Date,
    warmupBars: number,
  ): Date {
    const step = intervalMs(timeframe) ?? 60_000;
    return new Date(userStart.getTime() - warmupBars * step);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
