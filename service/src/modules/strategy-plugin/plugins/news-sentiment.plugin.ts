import { Injectable } from '@nestjs/common';
import { StrategyPlugin, ParameterSpec } from '../strategy-plugin.types';
import { CandidateMember } from '../../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from '../../strategy-engine/strategy.types';

/**
 * Required-flow #17 ("Sentiment-as-strategy"):
 *   `Aggregated sentiment -> NewsSentimentStrategy -> normalized trading
 *    signal -> normal combination/search path`
 *
 * Rule from docs/about-projects/04-examples-in-the-brief.md #30: "Average
 * one-hour sentiment above 0.7 produces BUY and below -0.7 produces SELL"
 * — the window and both thresholds are exposed as tunable parameters
 * rather than hard-coded, so Search can explore them like any other
 * strategy's parameter space.
 *
 * This plugin does NOT read the database. It consumes
 * `SignalContext.sentimentScores`, precomputed once per run by
 * NewsSentimentPrecomputeService — the same boundary the brief's
 * anti-pattern list demands ("Do not let a strategy connect directly to
 * the database. A strategy should receive the market and contextual data
 * it needs through an appropriate abstraction").
 */
@Injectable()
export class NewsSentimentPlugin implements StrategyPlugin {
  readonly type = 'NEWS_SENTIMENT' as const;
  readonly domain = 'INFORMATION' as const;
  readonly displayName = 'News Sentiment';
  readonly description =
    'Sentiment tin tức trung bình trong cửa sổ N giờ vượt ngưỡng thì BUY, dưới ngưỡng âm thì SELL.';
  readonly parameterSchema: ParameterSpec[] = [
    { key: 'lookbackHours', label: 'Cửa sổ tin (giờ)', type: 'int', min: 1, max: 72, step: 1, default: 24 },
    { key: 'buyThreshold', label: 'Ngưỡng BUY', type: 'float', min: 0.1, max: 0.9, step: 0.1, default: 0.3 },
    { key: 'sellThreshold', label: 'Ngưỡng SELL', type: 'float', min: -0.9, max: -0.1, step: 0.1, default: -0.3 },
  ];

  analyze(member: CandidateMember, context: SignalContext): StrategySignal {
    const score = context.sentimentScores?.[context.index];
    // No sentiment series at all, or no news inside this candle's window:
    // abstain. HOLD is a real blank vote in the weighted formula — far
    // safer than treating "no data" as neutral-but-confident.
    if (score === undefined || score === null) return 'HOLD';

    if (score >= member.parameters.buyThreshold) return 'BUY';
    if (score <= member.parameters.sellThreshold) return 'SELL';
    return 'HOLD';
  }
}
