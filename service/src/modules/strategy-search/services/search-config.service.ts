import { BadRequestException, Injectable } from '@nestjs/common';
import { BacktestCosts, DEFAULT_BACKTEST_COSTS } from '../../backtesting/backtesting.types';
import { intervalMs } from '../../market-data/config';
import {
  BUILTIN_DOMAIN_BY_NAME,
  BuiltInStrategyType,
  DEFAULT_SEARCH_CONFIG,
  SearchConfig,
  StartSearchRequest,
  StrategyDomain,
  StrategyWeight,
  strategyRowDomain,
} from '../domain/search.types';
import { ExperimentConfigRepository } from '../repositories/experiment-config.repository';
import { ExperimentRepository } from '../repositories/experiment.repository';

const MAX_TOP_K = 20;

@Injectable()
export class SearchConfigService {
  private readonly cache = new Map<string, SearchConfig>();

  constructor(
    private readonly experiments: ExperimentRepository,
    private readonly experimentConfigs: ExperimentConfigRepository,
  ) {}

  async load(experimentId: string): Promise<SearchConfig> {
    const cached = this.cache.get(experimentId);
    if (cached) return cached;

    const [experiment, config, weightRows] = await Promise.all([
      this.experiments.findByIdOrThrow(experimentId),
      this.experimentConfigs.findByExperimentId(experimentId),
      this.experimentConfigs.weightsByExperimentId(experimentId),
    ]);
    const enabledDomains = this.domainsFromWeightRows(weightRows);
    const resolved: SearchConfig = {
      ...DEFAULT_SEARCH_CONFIG,
      enabledDomains,
      maxCandidates: config?.iteration_limit ?? DEFAULT_SEARCH_CONFIG.maxCandidates,
      ...this.sanitize(experiment.search_config),
    };
    this.cache.set(experimentId, resolved);
    return resolved;
  }

  remember(experimentId: string, config: SearchConfig): void {
    this.cache.set(experimentId, config);
  }

  invalidate(experimentId: string): void {
    this.cache.delete(experimentId);
  }

  validateRequest(request: StartSearchRequest): {
    startTime: Date;
    endTime: Date;
    config: SearchConfig;
  } {
    const startTime = new Date(request.startTime);
    const endTime = new Date(request.endTime);
    if (!request.timeframe || !['1m', '5m', '15m', '1h', '4h'].includes(request.timeframe)) {
      throw new BadRequestException('Unsupported timeframe.');
    }
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || startTime >= endTime) {
      throw new BadRequestException('startTime and endTime must define a valid range.');
    }

    const enabledDomains = request.enabledDomains ?? DEFAULT_SEARCH_CONFIG.enabledDomains;
    const allowedDomains = new Set<StrategyDomain>(Object.values(BUILTIN_DOMAIN_BY_NAME));
    if (enabledDomains.some((domain) => !allowedDomains.has(domain))) {
      throw new BadRequestException('enabledDomains contains an unsupported domain.');
    }

    const config: SearchConfig = {
      ...DEFAULT_SEARCH_CONFIG,
      enabledDomains: [...new Set(enabledDomains)],
      maxCandidates: this.integerInRange(request.maxCandidates, 1, 10_000, 100, 'maxCandidates'),
      maxDurationSeconds: this.integerInRange(request.maxDurationSeconds, 1, 86_400, 3600, 'maxDurationSeconds'),
      maxNoImprovement: this.integerInRange(request.maxNoImprovement, 1, 10_000, 50, 'maxNoImprovement'),
      topK: this.integerInRange(request.topK, 1, MAX_TOP_K, 10, 'topK'),
      costs: this.validateCosts(request),
    };
    const hasDirectional = config.enabledDomains.some((domain) => domain === 'TREND' || domain === 'STRUCTURE');
    const hasConfirmation = config.enabledDomains.some((domain) => domain === 'MOMENTUM' || domain === 'VOLATILITY');
    if (!hasDirectional || !hasConfirmation) {
      throw new BadRequestException('Enable at least one directional and one confirmation domain.');
    }
    config.maxMembers = Math.min(config.maxMembers, config.enabledDomains.length);
    return { startTime, endTime, config };
  }

  persistable(config: SearchConfig): Record<string, unknown> {
    return {
      maxDurationSeconds: config.maxDurationSeconds,
      maxNoImprovement: config.maxNoImprovement,
      topK: config.topK,
      costs: config.costs,
    };
  }

  assertWeightsValid(weights: StrategyWeight[]): void {
    const invalid = weights.filter((item) => !Number.isFinite(item.weight) || item.weight < 0);
    if (invalid.length) {
      throw new BadRequestException(
        `strategyWeights must be finite numbers >= 0 (invalid: ${invalid.map((item) => `${item.type}=${item.weight}`).join(', ')}).`,
      );
    }
    if (weights.reduce((total, item) => total + item.weight, 0) === 0) {
      throw new BadRequestException('strategyWeights must not all be zero (the composite score would have no denominator).');
    }
  }

  assertWeightsCoverEnabledDomains(
    resolved: Array<{ domain: StrategyDomain }>,
    enabledDomains: StrategyDomain[],
  ): void {
    const givenDomains = new Set(resolved.map(({ domain }) => domain));
    const missing = enabledDomains.filter((domain) => !givenDomains.has(domain));
    const unexpected = [...givenDomains].filter((domain) => !enabledDomains.includes(domain));
    if (!missing.length && !unexpected.length) return;

    const parts: string[] = [];
    if (missing.length) parts.push(`enabled domains have no matching weight: ${missing.join(', ')}`);
    if (unexpected.length) parts.push(`weights given for a domain that is not enabled: ${unexpected.join(', ')}`);
    throw new BadRequestException(`strategyWeights must exactly cover enabledDomains (${parts.join('; ')}).`);
  }

  integerInRange(value: number | undefined, minimum: number, maximum: number, fallback: number, field: string): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
      throw new BadRequestException(`${field} must be an integer from ${minimum} to ${maximum}.`);
    }
    return resolved;
  }

  minimumCandles(domains: StrategyDomain[]): number {
    const requirements: Record<StrategyDomain, number> = {
      TREND: 202,
      MOMENTUM: 23,
      VOLATILITY: 31,
      STRUCTURE: 102,
      INFORMATION: 2,
    };
    return Math.max(...domains.map((domain) => requirements[domain]));
  }

  candleDataStart(timeframe: string, userStart: Date, warmupBars: number): Date {
    return new Date(userStart.getTime() - warmupBars * (intervalMs(timeframe) ?? 60_000));
  }

  builtinTypeForDomain(domain: StrategyDomain): BuiltInStrategyType {
    const types: Record<StrategyDomain, BuiltInStrategyType> = {
      TREND: 'MA',
      MOMENTUM: 'RSI',
      VOLATILITY: 'BOLLINGER',
      STRUCTURE: 'SUPPORT_RESISTANCE',
      INFORMATION: 'NEWS_SENTIMENT',
    };
    return types[domain];
  }

  private sanitize(raw: unknown): Pick<SearchConfig, 'maxDurationSeconds' | 'maxNoImprovement' | 'topK' | 'costs'> {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const integer = (value: unknown, min: number, max: number, fallback: number) =>
      typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
    return {
      maxDurationSeconds: integer(obj.maxDurationSeconds, 1, 86_400, DEFAULT_SEARCH_CONFIG.maxDurationSeconds),
      maxNoImprovement: integer(obj.maxNoImprovement, 1, 10_000, DEFAULT_SEARCH_CONFIG.maxNoImprovement),
      topK: integer(obj.topK, 1, MAX_TOP_K, DEFAULT_SEARCH_CONFIG.topK),
      costs: this.sanitizeCosts(obj.costs),
    };
  }

  private sanitizeCosts(raw: unknown): BacktestCosts {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const nonNegative = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
    const optionalPositive = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
    return {
      initialCapital: typeof obj.initialCapital === 'number' && Number.isFinite(obj.initialCapital) && obj.initialCapital > 0
        ? obj.initialCapital
        : DEFAULT_BACKTEST_COSTS.initialCapital,
      transactionCostPct: nonNegative(obj.transactionCostPct, DEFAULT_BACKTEST_COSTS.transactionCostPct),
      slippageBps: nonNegative(obj.slippageBps, DEFAULT_BACKTEST_COSTS.slippageBps),
      stopLossPct: optionalPositive(obj.stopLossPct),
      takeProfitPct: optionalPositive(obj.takeProfitPct),
    };
  }

  private domainsFromWeightRows(rows: Array<{ name: string; type: string; parameters: Record<string, unknown> }>): StrategyDomain[] {
    const domains = new Set<StrategyDomain>();
    for (const row of rows) {
      try {
        domains.add(strategyRowDomain(row));
      } catch {
        // Legacy AI strategies without a domain are ignored during recovery.
      }
    }
    return domains.size ? [...domains] : DEFAULT_SEARCH_CONFIG.enabledDomains;
  }

  private validateCosts(request: StartSearchRequest): BacktestCosts {
    return {
      initialCapital: this.numberInRange(request.initialCapital, 1, 1_000_000_000, DEFAULT_BACKTEST_COSTS.initialCapital, 'initialCapital'),
      transactionCostPct: this.numberInRange(request.transactionCostPct, 0, 10, DEFAULT_BACKTEST_COSTS.transactionCostPct, 'transactionCostPct'),
      slippageBps: this.numberInRange(request.slippageBps, 0, 1_000, DEFAULT_BACKTEST_COSTS.slippageBps, 'slippageBps'),
      stopLossPct: this.optionalNumberInRange(request.stopLossPct, 0.01, 100, 'stopLossPct'),
      takeProfitPct: this.optionalNumberInRange(request.takeProfitPct, 0.01, 1_000, 'takeProfitPct'),
    };
  }

  private numberInRange(value: number | undefined, min: number, max: number, fallback: number, field: string): number {
    const resolved = value ?? fallback;
    if (!Number.isFinite(resolved) || resolved < min || resolved > max) {
      throw new BadRequestException(`${field} must be a number from ${min} to ${max}.`);
    }
    return resolved;
  }

  private optionalNumberInRange(value: number | null | undefined, min: number, max: number, field: string): number | null {
    if (value === undefined || value === null) return null;
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new BadRequestException(`${field} must be a number from ${min} to ${max}, or omitted to disable it.`);
    }
    return value;
  }
}
