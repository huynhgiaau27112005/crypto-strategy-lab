import { Injectable } from '@nestjs/common';
import { StrategyEngineService } from '../strategy-engine/strategy-engine.service';
import {
  CompositeSignalResult,
  SignalContext,
} from '../strategy-engine/strategy.types';
import { CandidateDefinition } from '../strategy-search/domain/search.types';

@Injectable()
export class CompositeStrategyService {
  constructor(private readonly strategyEngine: StrategyEngineService) {}

  analyze(
    candidate: CandidateDefinition,
    context: SignalContext,
  ): CompositeSignalResult {
    const memberSignals = candidate.members.map((member) => ({
      member,
      signal: this.strategyEngine.analyze(member, context),
    }));
    const score = memberSignals.reduce((total, item) => {
      const encoded =
        item.signal === 'BUY' ? 1 : item.signal === 'SELL' ? -1 : 0;
      return total + encoded * item.member.weight;
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
