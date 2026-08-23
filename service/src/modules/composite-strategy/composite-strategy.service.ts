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
    const score = memberSignals.reduce((total, item) => {
      const encoded =
        item.signal === 'BUY' ? 1 : item.signal === 'SELL' ? -1 : 0;
      return total + encoded * (weights[item.member.type] ?? 0);
    }, 0);
    const signal =
      score > candidate.combination.buyThreshold
        ? 'BUY'
        : score < candidate.combination.sellThreshold
          ? 'SELL'
          : 'HOLD';
    return { signal, score, memberSignals, candidate };
  }
}
