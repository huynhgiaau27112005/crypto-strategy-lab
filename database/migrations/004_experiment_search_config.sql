-- ============================================================
-- 004: Cross-process search config (final-review finding #1 / item 1)
-- ============================================================
-- maxDurationSeconds/maxNoImprovement/topK/minimumTrades used to live only
-- in StrategySearchService's in-process configCache, populated by start()
-- in the API process. run() (the actual search loop) executes in the
-- separate worker process, whose configCache is always empty, so every
-- search silently ran with DEFAULT_SEARCH_CONFIG for these four values —
-- not just after a restart. Persisting them on `experiments` lets
-- loadConfig() reconstruct the caller's real values from the DB in any
-- process, so the API (getTop()) and the worker (run()) can never diverge.
--
-- 002_domain_guided_search.sql added a same-named `search_config` column
-- to `experiments`, but 003_candidate_auth_schema.sql DROPs and recreates
-- `experiments` without it (see that file's DROP TABLE IF EXISTS
-- experiments CASCADE) — so on any database that has run 003, the column
-- from 002 no longer exists. This migration is additive only (ADD COLUMN
-- ... DEFAULT), safe to run again on a database that somehow still has it.
ALTER TABLE experiments
    ADD COLUMN IF NOT EXISTS search_config JSONB NOT NULL DEFAULT '{}'::jsonb;
