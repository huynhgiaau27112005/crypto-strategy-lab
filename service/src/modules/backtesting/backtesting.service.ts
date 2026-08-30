import { Injectable } from '@nestjs/common';
import { CandleEntity } from '../../database/types';
import {
  CompositeStrategyService,
  StrategyWeightMap,
} from '../composite-strategy/composite-strategy.service';
import { CandidateDefinition, SearchStrategyType } from '../strategy-search/domain/search.types';
import { StrategySignal } from '../strategy-engine/strategy.types';
import {
  BacktestCosts,
  BacktestEvaluation,
  BacktestResult,
  DEFAULT_BACKTEST_COSTS,
  ExitReason,
  SimulatedTrade,
} from './backtesting.types';

interface Position {
  entryTime: Date;
  entryPrice: number;
  quantity: number;
  /** Commission already paid to open - deducted when the trade closes. */
  entryFee: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

@Injectable()
export class BacktestingService {
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
    // Precomputed per-candle news sentiment (see
    // NewsSentimentPrecomputeService) — same once-per-run threading as
    // `aiSignals`, and likewise omittable for any candidate with no
    // sentiment member.
    sentimentScores?: Array<number | null>,
    // Frictions and protective exits for this run. Omitted, the simulation
    // behaves exactly as it did before this became configurable
    // (DEFAULT_BACKTEST_COSTS: 10 000 capital, no fee, no slippage, no
    // SL/TP), so every existing caller and test is unaffected.
    costs: BacktestCosts = DEFAULT_BACKTEST_COSTS,
    /** Indicators use the full candle series; trades only open/close at or after this instant (warmup bars before the user's configured window). */
    tradingStartTime?: Date,
  ): BacktestResult {
    if (candles.length < 2)
      throw new Error('At least two candles are required.');
    const trades: SimulatedTrade[] = [];
    let capital = costs.initialCapital;
    let position: Position | null = null;
    let peakEquity = capital;
    let maximumDrawdown = 0;

    for (let index = 0; index < candles.length; index += 1) {
      const candle = candles[index];
      const close = Number(candle.close);
      const tradingAllowed =
        !tradingStartTime || candle.timestamp >= tradingStartTime;

      // Protective exits are checked BEFORE this candle's signal, and
      // against the candle's own high/low rather than its close: a stop
      // touched intrabar would have filled then, so waiting for the close
      // would report an exit the strategy could not actually have got.
      // When both levels sit inside one candle we take the stop - assuming
      // the favourable one filled first is the classic way a backtest
      // flatters itself.
      if (tradingAllowed && position) {
        const protective = this.protectiveExit(position, candle);
        if (protective) {
          const trade = this.closePosition(
            position,
            candle.timestamp,
            protective.price,
            protective.reason,
            costs,
          );
          trades.push(trade);
          capital += trade.profitLoss;
          position = null;
        }
      }

      const result = this.compositeStrategy.analyze(
        candidate,
        {
          candles,
          index,
          aiSignals,
          sentimentScores,
        },
        weights,
      );
      if (!tradingAllowed) continue;
      if (!position && result.signal === 'BUY') {
        position = this.openPosition(candle.timestamp, close, capital, costs);
      } else if (position && result.signal === 'SELL') {
        const trade = this.closePosition(
          position,
          candle.timestamp,
          close,
          'SIGNAL',
          costs,
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
        costs,
      );
      trades.push(trade);
      capital += trade.profitLoss;
    }

    return {
      trades,
      evaluation: this.evaluate(trades, capital, maximumDrawdown, costs),
    };
  }

  /**
   * Opens a long at `close`, adjusted for slippage (a buy fills above the
   * reference price) and sized so the entry commission comes out of the
   * same capital that funds the position.
   */
  private openPosition(
    entryTime: Date,
    close: number,
    capital: number,
    costs: BacktestCosts,
  ): Position {
    const slippage = costs.slippageBps / 10_000;
    const fee = costs.transactionCostPct / 100;
    const entryPrice = close * (1 + slippage);
    // notional * (1 + fee) = capital  ->  notional = capital / (1 + fee)
    const notional = capital / (1 + fee);
    return {
      entryTime,
      entryPrice,
      quantity: notional / entryPrice,
      entryFee: notional * fee,
      stopLoss:
        costs.stopLossPct == null
          ? null
          : entryPrice * (1 - costs.stopLossPct / 100),
      takeProfit:
        costs.takeProfitPct == null
          ? null
          : entryPrice * (1 + costs.takeProfitPct / 100),
    };
  }

  /** Stop-loss / take-profit hit inside `candle`, or null when neither is. */
  private protectiveExit(
    position: Position,
    candle: CandleEntity,
  ): { price: number; reason: ExitReason } | null {
    if (position.stopLoss != null && Number(candle.low) <= position.stopLoss) {
      return { price: position.stopLoss, reason: 'STOP_LOSS' };
    }
    if (
      position.takeProfit != null &&
      Number(candle.high) >= position.takeProfit
    ) {
      return { price: position.takeProfit, reason: 'TAKE_PROFIT' };
    }
    return null;
  }

  private closePosition(
    position: Position,
    exitTime: Date,
    exitPrice: number,
    exitReason: ExitReason,
    costs: BacktestCosts,
  ): SimulatedTrade {
    const slippage = costs.slippageBps / 10_000;
    const fee = costs.transactionCostPct / 100;
    // A sell fills below the reference price - the mirror of the entry. A
    // protective exit is already an exact level, but it is subject to the
    // same execution slippage as any other fill.
    const fillPrice = exitPrice * (1 - slippage);
    const exitNotional = fillPrice * position.quantity;
    const profitLoss =
      (fillPrice - position.entryPrice) * position.quantity -
      position.entryFee -
      exitNotional * fee;
    const entryNotional = position.entryPrice * position.quantity;
    return {
      side: 'LONG',
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime,
      exitPrice: fillPrice,
      quantity: position.quantity,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      profitLoss,
      // Return on the capital this trade actually tied up, so it stays
      // comparable across trades once fees are in play.
      returnPercent:
        entryNotional === 0 ? 0 : (profitLoss / entryNotional) * 100,
      exitReason,
    };
  }

  private evaluate(
    trades: SimulatedTrade[],
    finalCapital: number,
    maximumDrawdown: number,
    costs: BacktestCosts,
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
      ((finalCapital - costs.initialCapital) / costs.initialCapital) * 100;
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
      profitLoss: finalCapital - costs.initialCapital,
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
