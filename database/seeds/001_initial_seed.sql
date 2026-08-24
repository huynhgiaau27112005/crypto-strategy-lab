-- Sample market candles for BTCUSDT (5m timeframe)
INSERT INTO candles (timeframe, timestamp, open, high, low, close, volume)
VALUES
    ('5m', '2026-08-17 00:00:00+00', 65000.00, 65200.00, 64900.00, 65150.00, 12.50),
    ('5m', '2026-08-17 00:05:00+00', 65150.00, 65300.00, 65100.00, 65250.00, 18.20),
    ('5m', '2026-08-17 00:10:00+00', 65250.00, 65400.00, 65200.00, 65380.00, 25.10)
ON CONFLICT (timeframe, timestamp) DO NOTHING;
