import {
  BadRequestException,
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
  DEFAULT_SEARCH_CONFIG,
  SearchConfig,
  StartSearchRequest,
  StrategyDomain,
  StrategyWeight,
  defaultEqualWeights,
} from './domain/search.types';
import { DomainGuidedRandomGenerator } from './generators/domain-guided-random.generator';
import { CandidateRepository } from './repositories/candidate.repository';
import { ExperimentConfigRepository } from './repositories/experiment-config.repository';
import { ExperimentIterationRepository } from './repositories/experiment-iteration.repository';
import { ExperimentRepository } from './repositories/experiment.repository';
import { StrategyRepository } from './repositories/strategy.repository';
import { CandidateFingerprintService } from './services/candidate-fingerprint.service';
import { createSeededRandom } from './services/seeded-random';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class StrategySearchService implements OnApplicationBootstrap {
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
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const resumable = await this.experiments.findResumable();
      for (const experiment of resumable) this.schedule(experiment.id);
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
        config.enabledDomains.flatMap((domain) => this.typesForDomain(domain)),
      );
    this.assertWeightsSumToOne(weights);
    this.assertWeightsCoverEnabledDomains(weights, config.enabledDomains);
    const strategyWeights = weights.map((w) => {
      const strategy = byName.get(w.type);
      if (!strategy) {
        throw new BadRequestException(`Unknown strategy type "${w.type}".`);
      }
      return { strategyId: strategy.id, weight: w.weight };
    });

    const experiment = await this.database.withTransaction(async (client) => {
      const created = await this.experiments.create(userId, null, client);
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
    this.schedule(experiment.id);
    return experiment;
  }

  async getStatus(experimentId: string, userId: string) {
    const status = await this.experiments.status(experimentId, userId);
    if (!status) throw new NotFoundException('Experiment not found.');
    return status;
  }

  async getTop(experimentId: string, userId: string, limit: number) {
    const experiment = await this.experiments.findOwned(experimentId, userId);
    if (!experiment) throw new NotFoundException('Experiment not found.');
    const config = await this.loadConfig(experimentId);
    return this.experiments.top(
      experimentId,
      userId,
      Math.min(100, Math.max(1, limit)),
      config.minimumTrades,
    );
  }

  async cancel(experimentId: string, userId: string) {
    const experiment = await this.experiments.findOwned(experimentId, userId);
    if (!experiment) throw new NotFoundException('Experiment not found.');
    const cancelled = await this.experiments.cancel(experimentId, userId);
    return { id: experimentId, cancelled };
  }

  private async loadConfig(experimentId: string): Promise<SearchConfig> {
    const cached = this.configCache.get(experimentId);
    if (cached) return cached;
    // Reconstructed defaults if the process restarted; maxCandidates comes
    // from experiment_configs.iteration_limit, enabledDomains is derived from
    // the persisted experiment_config_strategies weight rows (see
    // domainsFromWeightRows), other bounds fall back to DEFAULT_SEARCH_CONFIG
    // since they are not separately persisted.
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
    };
    this.configCache.set(experimentId, resolved);
    return resolved;
  }

  // Inverts typesForDomain() to recover which StrategyDomains are
  // represented by the persisted experiment_config_strategies rows. This
  // keeps a resumed-after-restart config's enabledDomains in sync with the
  // weights that were actually persisted for the experiment, instead of
  // defaulting to all four domains regardless of what the experiment was
  // started with.
  private domainsFromWeightRows(
    rows: Array<{ name: string }>,
  ): StrategyDomain[] {
    const allDomains: StrategyDomain[] = [
      'TREND',
      'MOMENTUM',
      'VOLATILITY',
      'STRUCTURE',
    ];
    const typesPresent = new Set(rows.map((row) => row.name));
    const domains = allDomains.filter((domain) =>
      this.typesForDomain(domain).some((type) => typesPresent.has(type)),
    );
    return domains.length > 0 ? domains : DEFAULT_SEARCH_CONFIG.enabledDomains;
  }

  private schedule(experimentId: string): void {
    if (this.activeRuns.has(experimentId)) return;
    setImmediate(() => {
      void this.run(experimentId).catch((error) => {
        this.logger.error(
          `Search ${experimentId} failed: ${this.errorMessage(error)}`,
        );
      });
    });
  }

  private async run(experimentId: string): Promise<void> {
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
      const strategyIdByName = new Map(
        weightRows.map((row) => [row.name, row.strategy_id]),
      );
      // Weights belong to the experiment CONFIG and are fixed for every
      // candidate in this run, so they are passed into the backtest rather
      // than carried on CandidateMember. See artifacts/decisions.md §4b.
      const weightMap = Object.fromEntries(
        weightRows.map((row) => [row.name, Number(row.weight)]),
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

      let generated = await this.iterations.countByExperimentId(experimentId);
      let bestScore = Number.NEGATIVE_INFINITY;
      let noImprovement = 0;
      let attempts = 0;
      const maximumAttempts = Math.max(config.maxCandidates * 100, 1000);
      const deadline =
        new Date(experiment.created_at).getTime() +
        config.maxDurationSeconds * 1000;
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

        const generatedCandidate = this.generator.generate(random, config);
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
                const strategyId = strategyIdByName.get(member.type);
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

          const result = this.backtesting.run(
            candidateDefinition,
            candles,
            weightMap,
          );
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

  private typesForDomain(
    domain: StrategyDomain,
  ): Array<'MA' | 'RSI' | 'BOLLINGER' | 'SUPPORT_RESISTANCE'> {
    const map: Record<
      StrategyDomain,
      Array<'MA' | 'RSI' | 'BOLLINGER' | 'SUPPORT_RESISTANCE'>
    > = {
      TREND: ['MA'],
      MOMENTUM: ['RSI'],
      VOLATILITY: ['BOLLINGER'],
      STRUCTURE: ['SUPPORT_RESISTANCE'],
    };
    return map[domain];
  }

  private assertWeightsSumToOne(weights: StrategyWeight[]): void {
    const sum = weights.reduce((total, item) => total + item.weight, 0);
    if (Math.abs(sum - 1) > 1e-4) {
      throw new BadRequestException(
        `strategyWeights must sum to 1 (got ${sum.toFixed(6)}).`,
      );
    }
  }

  // Guards against a weight set that does not exactly cover the enabled
  // domains: a domain with no matching weight would leave a generated
  // candidate member with no strategyId, and a weight for a type whose
  // domain isn't enabled is silently useless. Either case previously
  // produced an experiment that runs to COMPLETED with zero candidates.
  private assertWeightsCoverEnabledDomains(
    weights: StrategyWeight[],
    enabledDomains: StrategyDomain[],
  ): void {
    const expectedTypes = new Set(
      enabledDomains.flatMap((domain) => this.typesForDomain(domain)),
    );
    const givenTypes = new Set(weights.map((w) => w.type));

    const missing = [...expectedTypes].filter((type) => !givenTypes.has(type));
    const unexpected = [...givenTypes].filter(
      (type) => !expectedTypes.has(type),
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
          `weights given for types whose domain is not enabled: ${unexpected.join(', ')}`,
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
