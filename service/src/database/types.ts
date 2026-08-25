export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type StrategyType = 'SYSTEM' | 'USER' | 'AI_GENERATED';
export type StrategyLanguage = 'TYPESCRIPT' | 'PYTHON' | 'OTHER';
export type ExperimentStatus =
  'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type IterationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type BacktestStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type TradeSide = 'LONG' | 'SHORT';
export type TradeExitReason =
  'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_BACKTEST';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h';
export type SentimentLabel = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export interface UserEntity {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshTokenEntity {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
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
  owner_user_id: string | null;
  name: string;
  type: StrategyType;
  version: number;
  description: string | null;
  language: StrategyLanguage | null;
  source_code: string | null;
  parameters: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ExperimentEntity {
  id: string;
  user_id: string;
  name: string | null;
  status: ExperimentStatus;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  // Added by migration 004_experiment_search_config.sql (`experiments.
  // search_config JSONB NOT NULL DEFAULT '{}'::jsonb`, additive-only —
  // see that file's comment for why 002's same-named column doesn't count:
  // 003 drops and recreates `experiments` without it). Persists the
  // caller's maxDurationSeconds/maxNoImprovement/topK/minimumTrades so the
  // worker process (which never runs start()) and any post-restart caller
  // of getTop() read the same values the user actually submitted, instead
  // of silently falling back to DEFAULT_SEARCH_CONFIG — see
  // StrategySearchService.loadConfig.
  search_config: Record<string, unknown>;
}

export interface ExperimentConfigEntity {
  id: string;
  experiment_id: string;
  timeframe: Timeframe;
  start_time: Date;
  end_time: Date;
  iteration_limit: number;
  created_at: Date;
}

export interface ExperimentConfigStrategyEntity {
  id: string;
  experiment_config_id: string;
  strategy_id: string;
  weight: string;
  created_at: Date;
}

export interface ExperimentIterationEntity {
  id: string;
  experiment_id: string;
  iteration_number: number;
  status: IterationStatus;
  started_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

export interface CandidateEntity {
  id: string;
  iteration_id: string;
  created_at: Date;
}

export interface CandidateStrategyEntity {
  id: string;
  candidate_id: string;
  strategy_id: string;
  parameters: Record<string, unknown>;
  created_at: Date;
}

export interface BacktestRunEntity {
  id: string;
  candidate_id: string;
  status: BacktestStatus;
  started_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

export interface TradeEntity {
  id: string;
  backtest_run_id: string;
  side: TradeSide;
  entry_time: Date;
  entry_price: string;
  quantity: string;
  stop_loss: string | null;
  take_profit: string | null;
  exit_time: Date | null;
  exit_price: string | null;
  profit_loss: string | null;
  return_pct: string | null;
  exit_reason: TradeExitReason | null;
  created_at: Date;
}

export interface EvaluationEntity {
  id: string;
  backtest_run_id: string;
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
  experiment_id: string;
  name: string;
  top_k: number;
  created_at: Date;
  updated_at: Date;
}

export interface LeaderboardEntryEntity {
  id: string;
  leaderboard_id: string;
  candidate_id: string;
  rank: number;
  score: string;
  created_at: Date;
}

export interface NewsEntity {
  id: string;
  title: string;
  content: string | null;
  source: string | null;
  published_at: Date | null;
  crawled_at: Date;
  url: string | null;
  sentiment: SentimentLabel | null;
  sentiment_score: string | null;
}
