import { BaseStrategy } from './core/base-strategy';
import { SMAStrategy } from './implementations/sma.strategy';
import { BollingerStrategy } from './implementations/bollinger.strategy';
import { RSIStrategy } from './implementations/rsi.strategy';

const STRATEGIES = Symbol('STRATEGIES');

export const registryProvider = {
  provide: STRATEGIES,
  useFactory: (
    sma: SMAStrategy,
    bollinger: BollingerStrategy,
    rsi: RSIStrategy,
  ): BaseStrategy[] => {
    return [sma, bollinger, rsi];
  },
  inject: [
    SMAStrategy,
    BollingerStrategy,
    RSIStrategy
  ],
};
