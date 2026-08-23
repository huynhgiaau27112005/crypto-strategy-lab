export interface SimulatedTrade {
  side: 'LONG';
  entryTime: Date;
  entryPrice: number;
  exitTime: Date;
  exitPrice: number;
  quantity: number;
  profitLoss: number;
  returnPercent: number;
  exitReason: 'SIGNAL' | 'END_OF_BACKTEST';
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
