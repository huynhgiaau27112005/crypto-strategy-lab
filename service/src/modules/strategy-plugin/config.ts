import { MAStrategy } from './implementations/ma.strategy';
import { BollingerStrategy } from './implementations/bollinger.strategy';
import { BaseStrategy } from './core/base-strategy';

const STRATEGIES = Symbol('STRATEGIES');

export const registryProvider = {
  provide: STRATEGIES,
  useFactory: (
    ma: MAStrategy,
    bollinger: BollingerStrategy,
  ): BaseStrategy[] => {
    return [ma, bollinger];
  },
  inject: [MAStrategy, BollingerStrategy],
};
