export type ExitReason =
  | 'SIGNAL'
  | 'STOP_LOSS'
  | 'TAKE_PROFIT'
  | 'END_OF_BACKTEST';

/**
 * Trading frictions and risk exits the simulation applies.
 *
 * These used to be hard-coded (capital fixed at 10 000, no fee, no
 * slippage, no protective exits), which is why the Backtest tab rendered
 * "Vốn", "Transaction cost" and "Slippage" as disabled placeholders and
 * why every trade's Stoploss/TakeProfit column was "—". They are config
 * now, carried on the experiment's own `search_config` so a run stays
 * reproducible from the database alone.
 */
export interface BacktestCosts {
  /** Starting equity in quote currency (USD here). */
  initialCapital: number;
  /** Commission per side, in percent of notional (0.08 = 0.08%). */
  transactionCostPct: number;
  /** Execution slippage per side, in basis points (5 = 0.05%). */
  slippageBps: number;
  /** Protective exit below entry, in percent. `null` disables it. */
  stopLossPct: number | null;
  /** Profit-taking exit above entry, in percent. `null` disables it. */
  takeProfitPct: number | null;
}

export const DEFAULT_BACKTEST_COSTS: BacktestCosts = {
  initialCapital: 10_000,
  transactionCostPct: 0,
  slippageBps: 0,
  stopLossPct: null,
  takeProfitPct: null,
};

export interface SimulatedTrade {
  side: 'LONG';
  entryTime: Date;
  entryPrice: number;
  exitTime: Date;
  exitPrice: number;
  quantity: number;
  /** Price level that would close this trade at a loss — null when no stop-loss is configured. */
  stopLoss: number | null;
  /** Price level that would close this trade in profit — null when no take-profit is configured. */
  takeProfit: number | null;
  profitLoss: number;
  returnPercent: number;
  exitReason: ExitReason;
}

export interface BacktestEvaluation {
  totalReturn: number;
  profitLoss: number;
  winRate: number;
  maxDrawdown: number;
  numberOfTrades: number;
  profitFactor: number | null;
  sharpeRatio: number | null;
  overallScore: number;
}

export interface BacktestResult {
  trades: SimulatedTrade[];
  evaluation: BacktestEvaluation;
}
