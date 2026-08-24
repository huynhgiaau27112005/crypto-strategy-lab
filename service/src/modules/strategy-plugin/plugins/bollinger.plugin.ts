import { Injectable } from '@nestjs/common';
import { StrategyPlugin, ParameterSpec } from '../strategy-plugin.types';
import { CandidateMember } from '../../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from '../../strategy-engine/strategy.types';

@Injectable()
export class BollingerPlugin implements StrategyPlugin {
  readonly type = 'BOLLINGER' as const;
  readonly domain = 'VOLATILITY' as const;
  readonly displayName = 'Bollinger Bands';
  readonly description =
    'Giá chạm dưới band dưới thì BUY, chạm trên band trên thì SELL.';
  readonly parameterSchema: ParameterSpec[] = [
    { key: 'period', label: 'Period', type: 'int', min: 20, max: 30, step: 1, default: 20 },
    { key: 'standardDeviation', label: 'Standard deviation', type: 'float', min: 1.5, max: 2.5, step: 0.5, default: 2 },
  ];

  analyze(member: CandidateMember, context: SignalContext): StrategySignal {
    const period = member.parameters.period;
    if (context.index < period - 1) return 'HOLD';
    const start = context.index - period + 1;
    const values = context.candles
      .slice(start, context.index + 1)
      .map((item) => Number(item.close));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
    const deviation = Math.sqrt(variance) * member.parameters.standardDeviation;
    const close = values[values.length - 1];
    if (close < mean - deviation) return 'BUY';
    if (close > mean + deviation) return 'SELL';
    return 'HOLD';
  }
}
