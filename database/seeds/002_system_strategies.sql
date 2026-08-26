-- 5 SYSTEM strategies (names MUST match SearchStrategyType in
-- service/src/modules/strategy-search/domain/search.types.ts)
INSERT INTO strategies (name, type, version, description, language, is_active)
VALUES
  ('MA', 'SYSTEM', 1, 'Moving average crossover strategy.', 'TYPESCRIPT', true),
  ('RSI', 'SYSTEM', 1, 'Relative Strength Index strategy.', 'TYPESCRIPT', true),
  ('BOLLINGER', 'SYSTEM', 1, 'Bollinger Bands strategy.', 'TYPESCRIPT', true),
  ('SUPPORT_RESISTANCE', 'SYSTEM', 1, 'Support/Resistance zone strategy.', 'TYPESCRIPT', true),
  -- Required-flow #17 (Sentiment-as-strategy). Domain INFORMATION, per the
  -- brief's strategy grouping (04-examples-in-the-brief.md #17).
  ('NEWS_SENTIMENT', 'SYSTEM', 1, 'News sentiment strategy (Information domain).', 'TYPESCRIPT', true)
ON CONFLICT (name, version) DO NOTHING;
