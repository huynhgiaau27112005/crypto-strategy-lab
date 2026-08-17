-- System session for global leaderboards and default system resources
INSERT INTO sessions (id, created_at, last_seen_at)
VALUES ('00000000-0000-0000-0000-000000000000', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Global system leaderboard
INSERT INTO leaderboards (id, session_id, name, type, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'Global Leaderboard',
    'GLOBAL',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Sample market candles for BTCUSDT (5m timeframe)
INSERT INTO candles (timeframe, timestamp, open, high, low, close, volume)
VALUES
    ('5m', '2026-08-17 00:00:00+00', 65000.00, 65200.00, 64900.00, 65150.00, 12.50),
    ('5m', '2026-08-17 00:05:00+00', 65150.00, 65300.00, 65100.00, 65250.00, 18.20),
    ('5m', '2026-08-17 00:10:00+00', 65250.00, 65400.00, 65200.00, 65380.00, 25.10)
ON CONFLICT (timeframe, timestamp) DO NOTHING;
