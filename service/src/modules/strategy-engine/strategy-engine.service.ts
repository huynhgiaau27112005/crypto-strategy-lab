import { Injectable } from '@nestjs/common';
import { StrategyRegistry } from '../strategy-plugin/strategy-registry';
import { CandidateMember } from '../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from './strategy.types';

@Injectable()
export class StrategyEngineService {
  constructor(private readonly registry: StrategyRegistry) {}

  analyze(member: CandidateMember, context: SignalContext): StrategySignal {
    return this.registry.get(member.type).analyze(member, context);
  }
}
