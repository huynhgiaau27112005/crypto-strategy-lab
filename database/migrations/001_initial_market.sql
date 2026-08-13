CREATE SCHEMA IF NOT EXISTS market;

CREATE TABLE IF NOT EXISTS market.assets (
    id BIGSERIAL PRIMARY KEY,

    symbol VARCHAR(20) NOT NULL UNIQUE,

    name VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market.trading_pairs (
    id BIGSERIAL PRIMARY KEY,

    symbol VARCHAR(30) NOT NULL UNIQUE,

    base_asset_id BIGINT NOT NULL
        REFERENCES market.assets(id),

    quote_asset_id BIGINT NOT NULL
        REFERENCES market.assets(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market.timeframes (
    id SMALLSERIAL PRIMARY KEY,

    code VARCHAR(10) NOT NULL UNIQUE,

    duration_seconds INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market.candles (
    time TIMESTAMPTZ NOT NULL,

    trading_pair_id BIGINT NOT NULL
        REFERENCES market.trading_pairs(id),

    timeframe_id SMALLINT NOT NULL
        REFERENCES market.timeframes(id),

    open NUMERIC(30, 10) NOT NULL,

    high NUMERIC(30, 10) NOT NULL,

    low NUMERIC(30, 10) NOT NULL,

    close NUMERIC(30, 10) NOT NULL,

    volume NUMERIC(30, 10) NOT NULL,

    PRIMARY KEY (
        trading_pair_id,
        timeframe_id,
        time
    )
);

SELECT create_hypertable(
    'market.candles',
    'time',
    if_not_exists => TRUE
);