-- Persist enough information to reproduce and observe a strategy-search run.
ALTER TABLE experiments
    ADD COLUMN IF NOT EXISTS search_algorithm VARCHAR(50),
    ADD COLUMN IF NOT EXISTS search_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS random_seed BIGINT,
    ADD COLUMN IF NOT EXISTS stop_reason VARCHAR(50),
    ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Generated composite strategies are de-duplicated by their canonical JSON hash.
ALTER TABLE strategies
    ADD COLUMN IF NOT EXISTS configuration_hash CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_strategies_session_configuration
    ON strategies(session_id, configuration_hash)
    WHERE configuration_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_experiment_strategies_experiment_status
    ON experiment_strategies(experiment_id, status);
