-- ============================================================
-- 003: Replace flat session-based schema with Candidate model
-- + real user authentication (per artifacts/decisions.md §1, 4, 4c)
-- ============================================================

-- Drop the tables being structurally replaced. `candles` is untouched
-- (schema-compatible). `sessions` is dropped — replaced by `users`.
DROP TABLE IF EXISTS leaderboard_entries CASCADE;
DROP TABLE IF EXISTS leaderboards CASCADE;
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS experiment_strategies CASCADE;
DROP TABLE IF EXISTS experiments CASCADE;
DROP TABLE IF EXISTS strategies CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE strategy_type AS ENUM ('SYSTEM', 'USER', 'AI_GENERATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE strategy_language AS ENUM ('TYPESCRIPT', 'PYTHON', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE experiment_status AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE iteration_status AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE backtest_status AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE trade_side AS ENUM ('LONG', 'SHORT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE exit_reason AS ENUM ('SIGNAL', 'STOP_LOSS', 'TAKE_PROFIT', 'END_OF_BACKTEST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app_timeframe AS ENUM ('1m', '5m', '15m', '1h', '4h');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE sentiment_label AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- USERS / AUTH
CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255) NOT NULL UNIQUE,
      password_hash text NOT NULL,
      display_name varchar(100),
      status user_status NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

    -- MARKET DATA (create only if the pre-existing candles table is absent)
    CREATE TABLE IF NOT EXISTS candles (
      timeframe app_timeframe NOT NULL,
      "timestamp" timestamptz NOT NULL,
      open numeric(30,12) NOT NULL,
      high numeric(30,12) NOT NULL,
      low numeric(30,12) NOT NULL,
      close numeric(30,12) NOT NULL,
      volume numeric(30,12) NOT NULL,
      PRIMARY KEY (timeframe, "timestamp")
    );

    -- STRATEGIES
    CREATE TABLE IF NOT EXISTS strategies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id uuid REFERENCES users(id),
      name varchar(255) NOT NULL,
      type strategy_type NOT NULL,
      version int NOT NULL DEFAULT 1,
      description text,
      language strategy_language,
      source_code text,
      parameters jsonb NOT NULL DEFAULT '{}',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_strategies_owner_user_id ON strategies(owner_user_id);
    CREATE UNIQUE INDEX uk_strategies_name_version ON strategies(name, version);
    CREATE INDEX idx_strategies_type ON strategies(type);

    -- EXPERIMENTS & SEARCH CONFIGURATION
    CREATE TABLE IF NOT EXISTS experiments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      name varchar(255),
      status experiment_status NOT NULL DEFAULT 'PENDING',
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_experiments_user_id ON experiments(user_id);
    CREATE INDEX idx_experiments_status ON experiments(status);

    CREATE TABLE IF NOT EXISTS experiment_configs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      experiment_id uuid NOT NULL UNIQUE REFERENCES experiments(id) ON DELETE CASCADE,
      timeframe app_timeframe NOT NULL,
      start_time timestamptz NOT NULL,
      end_time timestamptz NOT NULL,
      iteration_limit int NOT NULL DEFAULT 10,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS experiment_config_strategies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      experiment_config_id uuid NOT NULL REFERENCES experiment_configs(id) ON DELETE CASCADE,
      strategy_id uuid NOT NULL REFERENCES strategies(id),
      weight numeric(8,6) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (experiment_config_id, strategy_id)
    );
    CREATE INDEX idx_ecs_config_id ON experiment_config_strategies(experiment_config_id);
    CREATE INDEX idx_ecs_strategy_id ON experiment_config_strategies(strategy_id);

    -- SEARCH ITERATIONS
    CREATE TABLE IF NOT EXISTS experiment_iterations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      iteration_number int NOT NULL,
      status iteration_status NOT NULL DEFAULT 'PENDING',
      started_at timestamptz,
      completed_at timestamptz,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (experiment_id, iteration_number)
    );
    CREATE INDEX idx_iterations_experiment_id ON experiment_iterations(experiment_id);
    CREATE INDEX idx_iterations_status ON experiment_iterations(status);

    -- CANDIDATES
    CREATE TABLE IF NOT EXISTS candidates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      iteration_id uuid NOT NULL UNIQUE REFERENCES experiment_iterations(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS candidate_strategies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      strategy_id uuid NOT NULL REFERENCES strategies(id),
      parameters jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (candidate_id, strategy_id)
    );
    CREATE INDEX idx_cs_candidate_id ON candidate_strategies(candidate_id);
    CREATE INDEX idx_cs_strategy_id ON candidate_strategies(strategy_id);

    -- BACKTEST EXECUTION
    CREATE TABLE IF NOT EXISTS backtest_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id uuid NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
      status backtest_status NOT NULL DEFAULT 'PENDING',
      started_at timestamptz,
      completed_at timestamptz,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_backtest_runs_status ON backtest_runs(status);

    CREATE TABLE trades (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      backtest_run_id uuid NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
      side trade_side NOT NULL,
      entry_time timestamptz NOT NULL,
      entry_price numeric(30,12) NOT NULL,
      quantity numeric(30,12) NOT NULL,
      stop_loss numeric(30,12),
      take_profit numeric(30,12),
      exit_time timestamptz,
      exit_price numeric(30,12),
      profit_loss numeric(30,12),
      return_pct numeric(12,6),
      exit_reason exit_reason,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_trades_backtest_run_id ON trades(backtest_run_id);
    CREATE INDEX idx_trades_run_entry_time ON trades(backtest_run_id, entry_time);

    CREATE TABLE evaluations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      backtest_run_id uuid NOT NULL UNIQUE REFERENCES backtest_runs(id) ON DELETE CASCADE,
      total_return numeric(18,8),
      profit_loss numeric(30,12),
      win_rate numeric(10,6),
      max_drawdown numeric(18,8),
      number_of_trades int NOT NULL DEFAULT 0,
      profit_factor numeric(18,8),
      sharpe_ratio numeric(18,8),
      overall_score numeric(18,8),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- LEADERBOARD
    CREATE TABLE leaderboards (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      experiment_id uuid NOT NULL UNIQUE REFERENCES experiments(id) ON DELETE CASCADE,
      name varchar(255) NOT NULL DEFAULT 'Search Leaderboard',
      top_k int NOT NULL DEFAULT 10,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE leaderboard_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      leaderboard_id uuid NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
      candidate_id uuid NOT NULL REFERENCES candidates(id),
      rank int NOT NULL,
      score numeric(18,8) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (leaderboard_id, candidate_id),
      UNIQUE (leaderboard_id, rank)
    );
    CREATE INDEX idx_leaderboard_entries_leaderboard_id ON leaderboard_entries(leaderboard_id);

    -- NEWS (relational store; see docs/database/design.dbml note — kept in
    -- Postgres per artifacts/decisions.md rather than a separate NoSQL store)
    CREATE TABLE IF NOT EXISTS news (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      content text,
      source varchar(255),
      published_at timestamptz,
      crawled_at timestamptz NOT NULL DEFAULT now(),
      url text UNIQUE,
      sentiment sentiment_label,
      sentiment_score numeric(8,6)
    );
    CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at);
    CREATE INDEX IF NOT EXISTS idx_news_source ON news(source);
    CREATE INDEX IF NOT EXISTS idx_news_sentiment ON news(sentiment);

-- TimescaleDB hypertable for candles (safe to run twice; skip if already one)
SELECT create_hypertable('candles', by_range('timestamp'), if_not_exists => TRUE);
