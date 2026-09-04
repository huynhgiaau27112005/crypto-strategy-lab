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
import { MarketDataService } from '../market-data/market-data.service';
import { MIN_CANDLES_PER_TIMEFRAME } from '../market-data/config';
import { BacktestRunRepository } from '../backtesting/repositories/backtest-run.repository';
import { StrategyWeightMap } from '../composite-strategy/composite-strategy.service';
import {
  aiStrategyIdFromType,
  SEARCH_ALGORITHM,
  isAiStrategyType,
  SearchConfig,
  SearchStrategyType,
  StartSearchRequest,
  strategyRowDomain,
  strategyTypeKey,
  StrategyWeight,
  defaultEqualWeights,
} from './domain/search.types';
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
import { ExperimentConfigRepository } from './repositories/experiment-config.repository';
import { ExperimentIterationRepository } from './repositories/experiment-iteration.repository';
import { ExperimentRepository } from './repositories/experiment.repository';
import { StrategyRepository } from './repositories/strategy.repository';
import { CandidateFingerprintService } from './services/candidate-fingerprint.service';
import { createSeededRandom } from './services/seeded-random';
import { SearchQueueService } from './services/search-queue.service';
import { SearchConfigService } from './services/search-config.service';
import { SearchRunCatalogService } from './services/search-run-catalog.service';
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
    private readonly searchConfig: SearchConfigService = new SearchConfigService(
      experiments,
      experimentConfigs,
    ),
    private readonly runCatalog: SearchRunCatalogService = new SearchRunCatalogService(),
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
    const { startTime, endTime, config } = this.searchConfig.validateRequest(request);
    const warmupBars = this.searchConfig.minimumCandles(config.enabledDomains);
    const dataStartTime = this.searchConfig.candleDataStart(
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
        config.enabledDomains.map((domain) => this.searchConfig.builtinTypeForDomain(domain)),
      );
    this.searchConfig.assertWeightsValid(weights);

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
    this.searchConfig.assertWeightsCoverEnabledDomains(resolved, config.enabledDomains);
    const strategyWeights = resolved.map((r) => ({ strategyId: r.strategyId, weight: r.weight }));

    const experiment = await this.database.withTransaction(async (client) => {
      const created = await this.experiments.create(
        userId,
        null,
        client,
        this.searchConfig.persistable(config),
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
    this.searchConfig.remember(experiment.id, config);
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
    const boundedIterations = this.searchConfig.integerInRange(
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
    this.searchConfig.invalidate(experimentId);

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

    const config = await this.searchConfig.load(experimentId);
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

    const warmupBars = this.searchConfig.minimumCandles(config.enabledDomains);
    const dataStartTime = this.searchConfig.candleDataStart(
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
          this.runCatalog.toAiCandleInput(candles),
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

      // Fingerprinted like the search loop (migration 005), which also
      // hardens this cascade's documented "idempotent per combination"
      // contract (artifacts/api-contract.md §3): the definition carries
      // each member's `pluginVersion`, so regenerating against a NEW
      // strategy version yields a new fingerprint and inserts normally,
      // while a repeat call for a combination already regenerated at the
      // same versions collides and is skipped instead of appending a
      // near-duplicate row.
      const iteration = await this.database.withTransaction((client) =>
        this.iterations.createNext(
          client,
          experimentId,
          this.fingerprintService.fingerprint(candidateDefinition),
        ),
      );
      if (!iteration) {
        skipped += 1;
        continue;
      }
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
          this.runCatalog.sentimentSeries(
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
    const config = await this.searchConfig.load(experimentId);
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
      this.searchConfig.invalidate(experimentId);
      const config = await this.searchConfig.load(experimentId);
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
      const warmupBars = this.searchConfig.minimumCandles(config.enabledDomains);
      const dataStartTime = this.searchConfig.candleDataStart(
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
            this.runCatalog.toAiCandleInput(candles),
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
        .map((row) => Number(row.parameters.lookbackHours))
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
      const runCatalog = this.runCatalog.build(
        keyedRows,
        aiSignalsByType,
        versionRows,
      );
      const usableDomains = config.enabledDomains.filter(
        (domain) => runCatalog[domain].length > 0,
      );
      this.runCatalog.assertUsableDomains(usableDomains, config.enabledDomains);
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
        // Reachable only because duplicates below `continue` without
        // advancing `generated`: in a narrow parameter space the generator
        // eventually only redraws combinations this experiment already
        // evaluated, and without this guard the loop would spin until
        // MAX_DURATION with nothing to show for it. Before migration 005
        // restored the de-duplication, `attempts` rose in lockstep with
        // `generated` and this branch was dead code.
        if (attempts >= maximumAttempts) {
          stopReason = 'SEARCH_SPACE_EXHAUSTED';
          break;
        }
        attempts += 1;

        const generatedCandidate = this.generator.generate(random, runConfig, runCatalog);
        const candidateDefinition =
          this.fingerprintService.canonicalize(generatedCandidate);

        // Duplicate guard (migration 005). Enforced by a unique index on
        // (experiment_id, candidate_fingerprint) rather than a read-then-write,
        // and placed HERE — before the iteration row is committed and long
        // before the backtest — so a redraw costs one INSERT that changed
        // nothing, leaves no orphan iteration behind, and neither inflates
        // `generated` (which the UI shows as candidate count) nor
        // `noImprovement` (which would otherwise end the search early
        // because re-testing the same combination can never beat its own
        // score). Weights are deliberately absent from the fingerprint —
        // they belong to the configuration, not the candidate (see
        // artifacts/architecture.md §167), so the same parameter set does
        // not fingerprint differently across experiments.
        const fingerprint = this.fingerprintService.fingerprint(candidateDefinition);
        const iteration = await this.database.withTransaction((client) =>
          this.iterations.createNext(client, experimentId, fingerprint),
        );
        if (!iteration) {
          this.metrics.candidatesDuplicateTotal.inc();
          // Yields exactly like the bottom of the loop body does. A `continue`
          // that skipped it would let a long duplicate streak (up to
          // `maximumAttempts` of them) hold the event loop on microtasks
          // alone, starving this worker's other jobs and its health endpoint.
          await new Promise<void>((resolve) => setImmediate(resolve));
          continue;
        }
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
            this.runCatalog.sentimentSeries(
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

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
