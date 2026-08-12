import { BaseStrategy } from './base-strategy';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class StrategyRegistry {
  constructor(@Inject('Strategies') private strategies: BaseStrategy[]) {}
}
