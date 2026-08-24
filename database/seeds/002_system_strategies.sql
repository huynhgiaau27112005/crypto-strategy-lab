-- 4 SYSTEM strategies (names MUST match SearchStrategyType in
-- service/src/modules/strategy-search/domain/search.types.ts)
INSERT INTO strategies (name, type, version, description, language, is_active)
VALUES
  ('MA', 'SYSTEM', 1, 'Moving average crossover strategy.', 'TYPESCRIPT', true),
  ('RSI', 'SYSTEM', 1, 'Relative Strength Index strategy.', 'TYPESCRIPT', true),
  ('BOLLINGER', 'SYSTEM', 1, 'Bollinger Bands strategy.', 'TYPESCRIPT', true),
  ('SUPPORT_RESISTANCE', 'SYSTEM', 1, 'Support/Resistance zone strategy.', 'TYPESCRIPT', true)
ON CONFLICT (name, version) DO NOTHING;
