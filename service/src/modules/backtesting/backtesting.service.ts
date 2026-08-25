import { Injectable } from '@nestjs/common';
import { CandleEntity } from '../../database/types';
import {
  CompositeStrategyService,
  StrategyWeightMap,
} from '../composite-strategy/composite-strategy.service';
import { CandidateDefinition, SearchStrategyType } from '../strategy-search/domain/search.types';
import { StrategySignal } from '../strategy-engine/strategy.types';
import {
  BacktestEvaluation,
  BacktestResult,
  SimulatedTrade,
} from './backtesting.types';

@Injectable()
export class BacktestingService {
  private readonly initialCapital = 10_000;

  constructor(private readonly compositeStrategy: CompositeStrategyService) {}

  run(
    candidate: CandidateDefinition,
    candles: CandleEntity[],
    weights: StrategyWeightMap,
    // Precomputed whole-series AI signals (see AiStrategySignalPrecomputeService),
    // computed once per experiment run and threaded through every candidate's
    // backtest here — never recomputed per candidate. Optional/omittable for
    // any candidate with no AI members, and for every existing caller/test
    // that predates AI strategies.
    aiSignals?: Map<SearchStrategyType, StrategySignal[]>,
  ): BacktestResult {
    if (candles.length < 2)
      throw new Error('At least two candles are required.');
    const trades: SimulatedTrade[] = [];
    let capital = this.initialCapital;
    let position: {
      entryTime: Date;
      entryPrice: number;
      quantity: number;
    } | null = null;
    let peakEquity = capital;
    let maximumDrawdown = 0;

    for (let index = 0; index < candles.length; index += 1) {
      const candle = candles[index];
      const close = Number(candle.close);
      const result = this.compositeStrategy.analyze(
        candidate,
        {
          candles,
          index,
          aiSignals,
        },
        weights,
      );
      if (!position && result.signal === 'BUY') {
        position = {
          entryTime: candle.timestamp,
          entryPrice: close,
          quantity: capital / close,
        };
      } else if (position && result.signal === 'SELL') {
        const trade = this.closePosition(
          position,
          candle.timestamp,
          close,
          'SIGNAL',
        );
        trades.push(trade);
        capital += trade.profitLoss;
        position = null;
      }

      const equity = position
        ? capital + (close - position.entryPrice) * position.quantity
        : capital;
      peakEquity = Math.max(peakEquity, equity);
      maximumDrawdown = Math.max(
        maximumDrawdown,
        ((peakEquity - equity) / peakEquity) * 100,
      );
    }

    if (position) {
      const last = candles[candles.length - 1];
      const trade = this.closePosition(
        position,
        last.timestamp,
        Number(last.close),
        'END_OF_BACKTEST',
      );
      trades.push(trade);
      capital += trade.profitLoss;
    }

    return {
      trades,
      evaluation: this.evaluate(trades, capital, maximumDrawdown),
    };
  }

  private closePosition(
    position: { entryTime: Date; entryPrice: number; quantity: number },
    exitTime: Date,
    exitPrice: number,
    exitReason: 'SIGNAL' | 'END_OF_BACKTEST',
  ): SimulatedTrade {
    const profitLoss = (exitPrice - position.entryPrice) * position.quantity;
    return {
      side: 'LONG',
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime,
      exitPrice,
      quantity: position.quantity,
      profitLoss,
      returnPercent:
        ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
      exitReason,
    };
  }

  private evaluate(
    trades: SimulatedTrade[],
    finalCapital: number,
    maximumDrawdown: number,
  ): BacktestEvaluation {
    const returns = trades.map((trade) => trade.returnPercent);
    const wins = trades.filter((trade) => trade.profitLoss > 0);
    const grossProfit = trades
      .filter((trade) => trade.profitLoss > 0)
      .reduce((sum, trade) => sum + trade.profitLoss, 0);
    const grossLoss = Math.abs(
      trades
        .filter((trade) => trade.profitLoss < 0)
        .reduce((sum, trade) => sum + trade.profitLoss, 0),
    );
    const totalReturn =
      ((finalCapital - this.initialCapital) / this.initialCapital) * 100;
    const winRate = trades.length === 0 ? 0 : wins.length / trades.length;
    const profitFactor =
      grossLoss === 0 ? (grossProfit > 0 ? 10 : null) : grossProfit / grossLoss;
    const sharpeRatio = this.sharpe(returns);
    const maxDrawdown = -maximumDrawdown;
    const overallScore = this.overallScore(
      totalReturn,
      winRate,
      maxDrawdown,
      sharpeRatio,
      profitFactor,
    );
    return {
      totalReturn,
      profitLoss: finalCapital - this.initialCapital,
      winRate,
      maxDrawdown,
      numberOfTrades: trades.length,
      profitFactor,
      sharpeRatio,
      overallScore,
    };
  }

  private sharpe(returns: number[]): number | null {
    if (returns.length < 2) return null;
    const mean =
      returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (returns.length - 1);
    const deviation = Math.sqrt(variance);
    return deviation === 0
      ? null
      : (mean / deviation) * Math.sqrt(returns.length);
  }

  private overallScore(
    totalReturn: number,
    winRate: number,
    maxDrawdown: number,
    sharpeRatio: number | null,
    profitFactor: number | null,
  ): number {
    const clamp = (value: number, minimum: number, maximum: number) =>
      Math.min(maximum, Math.max(minimum, value));
    const returnScore = clamp((totalReturn + 100) / 2, 0, 100);
    const winScore = clamp(winRate * 100, 0, 100);
    const riskScore = clamp(100 - Math.abs(maxDrawdown) * 3, 0, 100);
    const sharpeScore =
      sharpeRatio === null
        ? 50
        : clamp(((clamp(sharpeRatio, -3, 3) + 3) / 6) * 100, 0, 100);
    const profitFactorScore =
      profitFactor === null ? 0 : clamp((profitFactor / 3) * 100, 0, 100);
    return Number(
      (
        0.35 * returnScore +
        0.15 * winScore +
        0.15 * riskScore +
        0.25 * sharpeScore +
        0.1 * profitFactorScore
      ).toFixed(6),
    );
  }
}
