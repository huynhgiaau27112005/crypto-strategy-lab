-- Materialises the brief's own parameter variants as real SYSTEM version
-- rows, so that EVERY parameter set a Candidate can use belongs to an
-- actual `strategies` version.
--
-- Why this exists (artifacts/decisions.md §11): the search used to pin a
-- strategy VERSION but then sample its parameters randomly from a table in
-- code, so a candidate could be labelled "MA v7" while running parameters
-- that v7 never contained. Reproduced on real data: MA v7 stores
-- {11,30} while a candidate pinned to it ran {50,200}. Once the variants
-- are versions, "which version" and "which parameters" are the same fact
-- and the label cannot disagree with the numbers.
--
-- The variants are taken verbatim from
-- docs/about-projects/04-examples-in-the-brief.md #87 ("Parameter variants
-- such as MA 10/20, 20/50, 50/200 and RSI 14/30/70, 14/20/80, 21/30/70
-- expand the space further") plus the existing in-code catalog.
--
-- Idempotent and collision-safe: version numbers are computed as
-- MAX(version) + row_number() per name, so re-running is a no-op and
-- pre-existing USER versions are never overwritten (uk_strategies_name_version
-- would reject that anyway).

INSERT INTO strategies (name, type, version, description, language, parameters, is_active)
SELECT
  v.name,
  'SYSTEM',
  COALESCE(existing.max_version, 0) + ROW_NUMBER() OVER (PARTITION BY v.name ORDER BY v.ord),
  v.description,
  'TYPESCRIPT',
  v.parameters,
  true
FROM (
  VALUES
    -- MA (TREND)
    ('MA', 1, 'MA crossover 10/30.',  '{"fastPeriod":10,"slowPeriod":30}'::jsonb),
    ('MA', 2, 'MA crossover 10/50.',  '{"fastPeriod":10,"slowPeriod":50}'::jsonb),
    ('MA', 3, 'MA crossover 20/50.',  '{"fastPeriod":20,"slowPeriod":50}'::jsonb),
    ('MA', 4, 'MA crossover 20/100.', '{"fastPeriod":20,"slowPeriod":100}'::jsonb),
    ('MA', 5, 'MA crossover 50/100.', '{"fastPeriod":50,"slowPeriod":100}'::jsonb),
    ('MA', 6, 'MA crossover 50/200.', '{"fastPeriod":50,"slowPeriod":200}'::jsonb),
    -- RSI (MOMENTUM)
    ('RSI', 1, 'RSI 14 / 30 / 70.', '{"period":14,"buyThreshold":30,"sellThreshold":70}'::jsonb),
    ('RSI', 2, 'RSI 14 / 25 / 75.', '{"period":14,"buyThreshold":25,"sellThreshold":75}'::jsonb),
    ('RSI', 3, 'RSI 21 / 30 / 70.', '{"period":21,"buyThreshold":30,"sellThreshold":70}'::jsonb),
    ('RSI', 4, 'RSI 14 / 35 / 65.', '{"period":14,"buyThreshold":35,"sellThreshold":65}'::jsonb),
    ('RSI', 5, 'RSI 21 / 25 / 75.', '{"period":21,"buyThreshold":25,"sellThreshold":75}'::jsonb),
    -- BOLLINGER (VOLATILITY)
    ('BOLLINGER', 1, 'Bollinger 20 / 2.0.', '{"period":20,"standardDeviation":2}'::jsonb),
    ('BOLLINGER', 2, 'Bollinger 20 / 1.5.', '{"period":20,"standardDeviation":1.5}'::jsonb),
    ('BOLLINGER', 3, 'Bollinger 20 / 2.5.', '{"period":20,"standardDeviation":2.5}'::jsonb),
    ('BOLLINGER', 4, 'Bollinger 30 / 2.0.', '{"period":30,"standardDeviation":2}'::jsonb),
    -- SUPPORT_RESISTANCE (STRUCTURE)
    ('SUPPORT_RESISTANCE', 1, 'S/R lookback 20, 0.5%.',  '{"lookback":20,"proximityPercent":0.5}'::jsonb),
    ('SUPPORT_RESISTANCE', 2, 'S/R lookback 50, 1.0%.',  '{"lookback":50,"proximityPercent":1}'::jsonb),
    ('SUPPORT_RESISTANCE', 3, 'S/R lookback 100, 1.5%.', '{"lookback":100,"proximityPercent":1.5}'::jsonb),
    ('SUPPORT_RESISTANCE', 4, 'S/R lookback 50, 0.5%.',  '{"lookback":50,"proximityPercent":0.5}'::jsonb),
    -- NEWS_SENTIMENT (INFORMATION) — required-flow #17
    ('NEWS_SENTIMENT', 1, 'Sentiment 24h, +/-0.3.', '{"lookbackHours":24,"buyThreshold":0.3,"sellThreshold":-0.3}'::jsonb),
    ('NEWS_SENTIMENT', 2, 'Sentiment 12h, +/-0.3.', '{"lookbackHours":12,"buyThreshold":0.3,"sellThreshold":-0.3}'::jsonb),
    ('NEWS_SENTIMENT', 3, 'Sentiment 48h, +/-0.2.', '{"lookbackHours":48,"buyThreshold":0.2,"sellThreshold":-0.2}'::jsonb),
    ('NEWS_SENTIMENT', 4, 'Sentiment 6h, +/-0.5.',  '{"lookbackHours":6,"buyThreshold":0.5,"sellThreshold":-0.5}'::jsonb)
) AS v(name, ord, description, parameters)
LEFT JOIN (
  SELECT name, MAX(version) AS max_version FROM strategies GROUP BY name
) AS existing ON existing.name = v.name
-- Skip any variant already materialised (re-run safety), matching on the
-- exact parameter set rather than on version number.
WHERE NOT EXISTS (
  SELECT 1 FROM strategies s
  WHERE s.name = v.name AND s.type = 'SYSTEM' AND s.parameters = v.parameters
);
