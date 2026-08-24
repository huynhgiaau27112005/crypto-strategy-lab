import { Injectable } from '@nestjs/common';
import { MarketDataService } from '../market-data/market-data.service';
import { assertAllowedInterval } from '../market-data/config';
import { StrategyRegistry } from '../strategy-plugin/strategy-registry';
import {
  CompositeStrategyService,
  StrategyWeightMap,
} from '../composite-strategy/composite-strategy.service';
import {
  CandidateDefinition,
  CandidateMember,
  defaultEqualWeights,
} from '../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from './strategy.types';

// Backend is currently Binance/BTCUSDT-only everywhere (market-data,
// realtime gateway) — same scope, not a per-request choice yet.
const SYMBOL = 'BTCUSDT';
// Comfortably above every plugin's default lookback (MA slowPeriod=30 is
// the largest) while matching the history window the realtime UI already
// requests via useMarketSocket, so ma20/changePct read on a familiar window.
const HISTORY_LIMIT = 300;
const MA_PERIOD = 20;
// Same WEIGHTED_VOTE thresholds DomainGuidedRandomGenerator uses as its
// candidate default (strategy-search/generators/domain-guided-random.generator.ts)
// — one definition of "what a default combination looks like", not a second one.
const BUY_THRESHOLD = 0.3;
const SELL_THRESHOLD = -0.3;

export interface RealtimeSignalResult {
  interval: string;
  signal: StrategySignal;
  perStrategy: Array<{ type: CandidateMember['type']; signal: StrategySignal }>;
  ma20: number | null;
  lastClose: number;
  changePct: number | null;
}

/**
 * Realtime read-model for the "what does the Strategy Engine currently say"
 * badge on the frontend. Runs every registered plugin at its default
 * parameters over the latest candle and combines them through the existing
 * CompositeStrategyService — the same WEIGHTED_VOTE path strategy-search and
 * backtesting already use — instead of a bespoke if-chain here.
 */
@Injectable()
export class RealtimeSignalService {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly registry: StrategyRegistry,
    private readonly compositeStrategy: CompositeStrategyService,
  ) {}

  async getSignal(interval: string): Promise<RealtimeSignalResult> {
    assertAllowedInterval(interval);

    const candles = await this.marketData.getCandles(SYMBOL, interval, HISTORY_LIMIT);
    if (candles.length === 0) {
      return {
        interval,
        signal: 'HOLD',
        perStrategy: [],
        ma20: null,
        lastClose: 0,
        changePct: null,
      };
    }

    const candidate = this.buildDefaultCandidate();
    const weights = this.buildEqualWeights(candidate.members);
    const context: SignalContext = { candles, index: candles.length - 1 };

    const result = this.compositeStrategy.analyze(candidate, context, weights);

    const lastClose = Number(candles[candles.length - 1].close);
    const firstOpen = Number(candles[0].open);
    const changePct = firstOpen !== 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : null;

    return {
      interval,
      signal: result.signal,
      perStrategy: result.memberSignals.map((item) => ({
        type: item.member.type,
        signal: item.signal,
      })),
      ma20: this.simpleMovingAverage(context.candles, MA_PERIOD),
      lastClose,
      changePct,
    };
  }

  /** One member per registered plugin, each at its schema-declared default parameters. */
  private buildDefaultCandidate(): CandidateDefinition {
    const members: CandidateMember[] = this.registry.list().map((plugin) => ({
      type: plugin.type,
      domain: plugin.domain,
      pluginVersion: 1,
      parameters: Object.fromEntries(
        plugin.parameterSchema.map((spec) => [spec.key, spec.default]),
      ),
    }));

    return {
      schemaVersion: 1,
      combination: {
        method: 'WEIGHTED_VOTE',
        buyThreshold: BUY_THRESHOLD,
        sellThreshold: SELL_THRESHOLD,
      },
      members,
    };
  }

  private buildEqualWeights(members: CandidateMember[]): StrategyWeightMap {
    const weights = defaultEqualWeights(members.map((member) => member.type));
    return Object.fromEntries(weights.map((weight) => [weight.type, weight.weight]));
  }

  private simpleMovingAverage(
    candles: SignalContext['candles'],
    period: number,
  ): number | null {
    if (candles.length < period) return null;
    const window = candles.slice(candles.length - period);
    const sum = window.reduce((total, candle) => total + Number(candle.close), 0);
    return sum / period;
  }
}
