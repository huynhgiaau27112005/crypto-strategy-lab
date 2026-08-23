export type StrategyType =
  'MA' | 'RSI' | 'BOLLINGER' | 'SUPPORT_RESISTANCE' | 'COMPOSITE';

export type ExperimentStatus =
  'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type ExperimentStrategyStatus =
  'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type TradeSide = 'LONG' | 'SHORT';

export type TradeExitReason =
  'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_BACKTEST';

export interface SessionEntity {
  id: string;
  created_at: Date;
  last_seen_at: Date | null;
}

export interface CandleEntity {
  timeframe: string;
  timestamp: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface StrategyEntity {
  id: string;
  session_id: string;
  name: string;
  version: number;
  type: StrategyType;
  parameters: Record<string, any>;
  configuration_hash: string | null;
  created_at: Date;
}

export interface ExperimentEntity {
  id: string;
  session_id: string;
  timeframe: string;
  start_time: Date;
  end_time: Date;
  status: ExperimentStatus;
  search_algorithm: string | null;
  search_config: Record<string, any>;
  random_seed: string | null;
  stop_reason: string | null;
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface ExperimentStrategyEntity {
  id: string;
  experiment_id: string;
  strategy_id: string;
  status: ExperimentStrategyStatus;
  created_at: Date;
}

export interface TradeEntity {
  id: string;
  experiment_strategy_id: string;
  side: TradeSide;
  entry_time: Date;
  entry_price: string;
  stop_loss: string | null;
  take_profit: string | null;
  exit_time: Date | null;
  exit_price: string | null;
  quantity: string | null;
  profit_loss: string | null;
  return_percent: string | null;
  exit_reason: TradeExitReason | null;
  created_at: Date;
}

export interface EvaluationEntity {
  id: string;
  experiment_strategy_id: string;
  total_return: string | null;
  profit_loss: string | null;
  win_rate: string | null;
  max_drawdown: string | null;
  number_of_trades: number;
  profit_factor: string | null;
  sharpe_ratio: string | null;
  overall_score: string | null;
  created_at: Date;
}

export interface LeaderboardEntity {
  id: string;
  session_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface LeaderboardEntryEntity {
  id: string;
  leaderboard_id: string;
  experiment_strategy_id: string;
  rank: number;
  score: string;
  created_at: Date;
  updated_at: Date;
}
