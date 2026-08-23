import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { BacktestingService } from '../backtesting/backtesting.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import {
  DEFAULT_SEARCH_CONFIG,
  SearchConfig,
  StartSearchRequest,
  StrategyDomain,
} from './domain/search.types';
import { DomainGuidedRandomGenerator } from './generators/domain-guided-random.generator';
import { ExperimentStrategyRepository } from './repositories/experiment-strategy.repository';
import { ExperimentRepository } from './repositories/experiment.repository';
import { StrategyRepository } from './repositories/strategy.repository';
import { CandidateFingerprintService } from './services/candidate-fingerprint.service';
import { createSeededRandom } from './services/seeded-random';

@Injectable()
export class StrategySearchService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StrategySearchService.name);
  private readonly activeRuns = new Set<string>();

  constructor(
    private readonly experiments: ExperimentRepository,
    private readonly strategies: StrategyRepository,
    private readonly experimentStrategies: ExperimentStrategyRepository,
    private readonly generator: DomainGuidedRandomGenerator,
    private readonly fingerprintService: CandidateFingerprintService,
    private readonly backtesting: BacktestingService,
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

  async start(sessionId: string, request: StartSearchRequest) {
    const { startTime, endTime, seed, config } = this.validateRequest(request);
    await this.experiments.ensureSession(sessionId);
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
    const experiment = await this.experiments.create(
      sessionId,
      request.timeframe,
      startTime,
      endTime,
      config,
      seed,
    );
    this.schedule(experiment.id);
    return experiment;
  }

  async getStatus(experimentId: string, sessionId: string) {
    const status = await this.experiments.status(experimentId, sessionId);
    if (!status) throw new NotFoundException('Experiment not found.');
    return status;
  }

  async getTop(experimentId: string, sessionId: string, limit: number) {
    const experiment = await this.experiments.findOwned(
      experimentId,
      sessionId,
    );
    if (!experiment) throw new NotFoundException('Experiment not found.');
    return this.experiments.top(
      experimentId,
      sessionId,
      Math.min(100, Math.max(1, limit)),
    );
  }

  async cancel(experimentId: string, sessionId: string) {
    const experiment = await this.experiments.findOwned(
      experimentId,
      sessionId,
    );
    if (!experiment) throw new NotFoundException('Experiment not found.');
    const cancelled = await this.experiments.cancel(experimentId, sessionId);
    return { id: experimentId, cancelled };
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
      const experiment = await this.experiments.findById(experimentId);
      if (!experiment || experiment.status === 'CANCELLED') return;
      if (!(await this.experiments.setRunning(experimentId))) return;

      const config = experiment.search_config as unknown as SearchConfig;
      const seed = Number(experiment.random_seed);
      const random = createSeededRandom(seed);
      const candles = await this.experiments.candles(
        experiment.timeframe,
        experiment.start_time,
        experiment.end_time,
      );
      if (candles.length < this.minimumCandles(config.enabledDomains)) {
        throw new Error(
          'The experiment dataset no longer contains enough candles.',
        );
      }

      const initialStatus = await this.experiments.status(
        experimentId,
        experiment.session_id,
      );
      let generated = Number(initialStatus?.generated ?? 0);
      let bestScore =
        initialStatus?.best_score === null ||
        initialStatus?.best_score === undefined
          ? Number.NEGATIVE_INFINITY
          : Number(initialStatus.best_score);
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
        const candidate =
          this.fingerprintService.canonicalize(generatedCandidate);
        const fingerprint = this.fingerprintService.fingerprint(candidate);
        const name = this.fingerprintService.displayName(candidate);
        const strategy = await this.strategies.findOrCreate(
          experiment.session_id,
          name,
          candidate,
          fingerprint,
        );
        const mapping = await this.experimentStrategies.create(
          experimentId,
          strategy.id,
        );
        if (!mapping) continue;
        if (mapping.isNew) generated += 1;
        await this.experimentStrategies.setRunning(mapping.entity.id);

        try {
          const result = this.backtesting.run(candidate, candles);
          await this.experimentStrategies.complete(mapping.entity.id, result);
          if (
            result.evaluation.numberOfTrades >= config.minimumTrades &&
            result.evaluation.overallScore > bestScore
          ) {
            bestScore = result.evaluation.overallScore;
            noImprovement = 0;
          } else {
            noImprovement += 1;
          }
          await this.leaderboard.rebuildSession(
            experiment.session_id,
            config.topK,
          );
        } catch (error) {
          noImprovement += 1;
          await this.experimentStrategies.fail(mapping.entity.id);
          this.logger.warn(
            `Candidate ${mapping.entity.id} failed: ${this.errorMessage(error)}`,
          );
        }

        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      if (!(await this.experiments.isCancelled(experimentId))) {
        await this.experiments.finish(experimentId, 'COMPLETED', stopReason);
      }
    } catch (error) {
      await this.experiments.fail(experimentId, this.errorMessage(error));
      throw error;
    } finally {
      this.activeRuns.delete(experimentId);
    }
  }

  private validateRequest(request: StartSearchRequest) {
    const startTime = new Date(request.startTime);
    const endTime = new Date(request.endTime);
    if (
      !request.timeframe ||
      !['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'].includes(
        request.timeframe,
      )
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
    const seed = this.integerInRange(
      request.randomSeed,
      0,
      0xffffffff,
      Date.now() >>> 0,
      'randomSeed',
    );
    return { startTime, endTime, seed, config };
  }

  private integerInRange(
    value: number | undefined,
    minimum: number,
    maximum: number,
    fallback: number,
    field: string,
  ): number {
    const resolved = value ?? fallback;
    if (
      !Number.isInteger(resolved) ||
      resolved < minimum ||
      resolved > maximum
    ) {
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
