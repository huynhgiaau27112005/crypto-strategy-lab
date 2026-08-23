import { Injectable } from '@nestjs/common';
import { CandidateMember } from '../strategy-search/domain/search.types';
import { SignalContext, StrategySignal } from './strategy.types';

@Injectable()
export class StrategyEngineService {
  analyze(member: CandidateMember, context: SignalContext): StrategySignal {
    switch (member.type) {
      case 'MA':
        return this.maSignal(member, context);
      case 'RSI':
        return this.rsiSignal(member, context);
      case 'BOLLINGER':
        return this.bollingerSignal(member, context);
      case 'SUPPORT_RESISTANCE':
        return this.supportResistanceSignal(member, context);
    }
  }

  private maSignal(
    member: CandidateMember,
    context: SignalContext,
  ): StrategySignal {
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

  private rsiSignal(
    member: CandidateMember,
    context: SignalContext,
  ): StrategySignal {
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

  private bollingerSignal(
    member: CandidateMember,
    context: SignalContext,
  ): StrategySignal {
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

  private supportResistanceSignal(
    member: CandidateMember,
    context: SignalContext,
  ): StrategySignal {
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
