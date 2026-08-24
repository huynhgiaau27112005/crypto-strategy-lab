import { Injectable } from '@nestjs/common';
import { StrategyPlugin, ParameterSpec } from '../strategy-plugin.types';
import { CandidateMember } from '../../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from '../../strategy-engine/strategy.types';

@Injectable()
export class SupportResistancePlugin implements StrategyPlugin {
  readonly type = 'SUPPORT_RESISTANCE' as const;
  readonly domain = 'STRUCTURE' as const;
  readonly displayName = 'Support / Resistance';
  readonly description =
    'Giá gần support thì BUY, gần resistance thì SELL, theo % proximity.';
  readonly parameterSchema: ParameterSpec[] = [
    { key: 'lookback', label: 'Lookback', type: 'int', min: 20, max: 100, step: 1, default: 20 },
    { key: 'proximityPercent', label: 'Proximity percent', type: 'float', min: 0.5, max: 1.5, step: 0.5, default: 1 },
  ];

  analyze(member: CandidateMember, context: SignalContext): StrategySignal {
    const lookback = member.parameters.lookback;
    if (context.index < lookback) return 'HOLD';
    const history = context.candles.slice(
      context.index - lookback,
      context.index,
    );
    const support = Math.min(...history.map((item) => Number(item.low)));
    const resistance = Math.max(...history.map((item) => Number(item.high)));
    const close = Number(context.candles[context.index].close);
    const tolerance = member.parameters.proximityPercent / 100;
    if (Math.abs(close - support) / support <= tolerance) return 'BUY';
    if (Math.abs(close - resistance) / resistance <= tolerance) return 'SELL';
    return 'HOLD';
  }
}
