INSERT INTO market.assets (
    symbol,
    name
)
VALUES
    ('BTC', 'Bitcoin'),
    ('ETH', 'Ethereum'),
    ('USDT', 'Tether')
ON CONFLICT (symbol) DO NOTHING;


INSERT INTO market.trading_pairs (
    symbol,
    base_asset_id,
    quote_asset_id
)
SELECT
    'BTCUSDT',
    base.id,
    quote.id
FROM market.assets base
CROSS JOIN market.assets quote
WHERE base.symbol = 'BTC'
  AND quote.symbol = 'USDT'
ON CONFLICT (symbol) DO NOTHING;


INSERT INTO market.trading_pairs (
    symbol,
    base_asset_id,
    quote_asset_id
)
SELECT
    'ETHUSDT',
    base.id,
    quote.id
FROM market.assets base
CROSS JOIN market.assets quote
WHERE base.symbol = 'ETH'
  AND quote.symbol = 'USDT'
ON CONFLICT (symbol) DO NOTHING;


INSERT INTO market.timeframes (
    code,
    duration_seconds
)
VALUES
    ('1m', 60),
    ('5m', 300),
    ('15m', 900),
    ('1h', 3600),
    ('4h', 14400)
ON CONFLICT (code) DO NOTHING;