import { Injectable } from '@nestjs/common';
import { StrategyPlugin, ParameterSpec } from '../strategy-plugin.types';
import { CandidateMember } from '../../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from '../../strategy-engine/strategy.types';

@Injectable()
export class RsiPlugin implements StrategyPlugin {
  readonly type = 'RSI' as const;
  readonly domain = 'MOMENTUM' as const;
  readonly displayName = 'Relative Strength Index';
  readonly description =
    'RSI xuống dưới buyThreshold thì BUY, lên trên sellThreshold thì SELL.';
  readonly parameterSchema: ParameterSpec[] = [
    { key: 'period', label: 'Period', type: 'int', min: 14, max: 21, step: 1, default: 14 },
    { key: 'buyThreshold', label: 'Buy threshold', type: 'int', min: 25, max: 35, step: 1, default: 30 },
    { key: 'sellThreshold', label: 'Sell threshold', type: 'int', min: 65, max: 75, step: 1, default: 70 },
  ];

  analyze(member: CandidateMember, context: SignalContext): StrategySignal {
    const period = member.parameters.period;
    if (context.index < period) return 'HOLD';
    let gains = 0;
    let losses = 0;
    for (
      let index = context.index - period + 1;
      index <= context.index;
      index += 1
    ) {
      const change =
        Number(context.candles[index].close) -
        Number(context.candles[index - 1].close);
      if (change > 0) gains += change;
      if (change < 0) losses += Math.abs(change);
    }
    const rsi =
      losses === 0 ? 100 : gains === 0 ? 0 : 100 - 100 / (1 + gains / losses);
    if (rsi < member.parameters.buyThreshold) return 'BUY';
    if (rsi > member.parameters.sellThreshold) return 'SELL';
    return 'HOLD';
  }
}
