import { Injectable } from '@nestjs/common';
import { StrategyPlugin, ParameterSpec } from '../strategy-plugin.types';
import { CandidateMember } from '../../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from '../../strategy-engine/strategy.types';

@Injectable()
export class MaPlugin implements StrategyPlugin {
  readonly type = 'MA' as const;
  readonly domain = 'TREND' as const;
  readonly displayName = 'Moving Average Crossover';
  readonly description =
    'Fast MA cắt lên Slow MA thì BUY, cắt xuống thì SELL.';
  readonly parameterSchema: ParameterSpec[] = [
    { key: 'fastPeriod', label: 'Fast period', type: 'int', min: 10, max: 50, step: 1, default: 10 },
    { key: 'slowPeriod', label: 'Slow period', type: 'int', min: 30, max: 200, step: 1, default: 30 },
  ];

  analyze(member: CandidateMember, context: SignalContext): StrategySignal {
    const fast = member.parameters.fastPeriod;
    const slow = member.parameters.slowPeriod;
    if (context.index < slow) return 'HOLD';

    const currentFast = this.averageClose(context, fast, context.index);
    const currentSlow = this.averageClose(context, slow, context.index);
    const previousFast = this.averageClose(context, fast, context.index - 1);
    const previousSlow = this.averageClose(context, slow, context.index - 1);
    if (previousFast <= previousSlow && currentFast > currentSlow) return 'BUY';
    if (previousFast >= previousSlow && currentFast < currentSlow)
      return 'SELL';
    return 'HOLD';
  }

  private averageClose(
    context: SignalContext,
    period: number,
    endIndex: number,
  ): number {
    const start = endIndex - period + 1;
    const values = context.candles.slice(start, endIndex + 1);
    return (
      values.reduce((sum, item) => sum + Number(item.close), 0) / values.length
    );
  }
}
