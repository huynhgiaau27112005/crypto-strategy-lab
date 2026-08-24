import { Injectable } from '@nestjs/common';
import { StrategyEngineService } from '../strategy-engine/strategy-engine.service';
import {
  CompositeSignalResult,
  SignalContext,
} from '../strategy-engine/strategy.types';
import {
  CandidateDefinition,
  SearchStrategyType,
} from '../strategy-search/domain/search.types';

export type StrategyWeightMap = Partial<Record<SearchStrategyType, number>>;

@Injectable()
export class CompositeStrategyService {
  constructor(private readonly strategyEngine: StrategyEngineService) {}

  analyze(
    candidate: CandidateDefinition,
    context: SignalContext,
    weights: StrategyWeightMap,
  ): CompositeSignalResult {
    const memberSignals = candidate.members.map((member) => ({
      member,
      signal: this.strategyEngine.analyze(member, context),
    }));

    // Điểm tổng hợp = Σ (trọng số × tín hiệu) / Σ trọng số — the displayed
    // formula is a weighted AVERAGE, not a weighted sum. The denominator is
    // the sum over every member that has a weight (not just the ones that
    // voted BUY/SELL), so a HOLD member still counts toward the total and
    // drags the score toward zero like a genuine abstention, rather than
    // being silently dropped from the average. This also keeps the result
    // in [-1, 1] for any positive weight set, so buyThreshold/sellThreshold
    // keep meaning what they mean regardless of how the weights are scaled.
    const weightSum = memberSignals.reduce(
      (total, item) => total + (weights[item.member.type] ?? 0),
      0,
    );

    if (weightSum === 0) {
      // No weights, or all weights zero — the average is undefined. Return
      // a neutral HOLD/0 instead of NaN, which would otherwise propagate
      // silently into backtest evaluation and leaderboard ranking.
      return { signal: 'HOLD', score: 0, memberSignals, candidate };
    }

    const weightedSum = memberSignals.reduce((total, item) => {
      const encoded =
        item.signal === 'BUY' ? 1 : item.signal === 'SELL' ? -1 : 0;
      return total + encoded * (weights[item.member.type] ?? 0);
    }, 0);
    const score = weightedSum / weightSum;
    const signal =
      score > candidate.combination.buyThreshold
        ? 'BUY'
        : score < candidate.combination.sellThreshold
          ? 'SELL'
          : 'HOLD';
    return { signal, score, memberSignals, candidate };
  }
}
