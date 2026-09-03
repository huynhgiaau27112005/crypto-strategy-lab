-- ============================================================
-- 005: Candidate de-duplication fingerprint
-- ============================================================
-- Restores the duplicate-candidate guard that the pre-Task-8 (flat-model)
-- code had and that the Candidate-schema rewire dropped. See
-- artifacts/architecture.md section 5b for the full history.
--
-- Without it, StrategySearchService.run() persisted and backtested every
-- generated candidate even when it was parameter-identical to one already
-- tried in the SAME experiment, counting each duplicate toward
-- `generated`. In a narrow parameter space (e.g. only two domains
-- enabled) that produced a Top-K full of identical rows, and left
-- `attempts`/`maximumAttempts`/`SEARCH_SPACE_EXHAUSTED` permanently
-- unreachable, because `attempts` rose in lockstep with `generated`.
--
-- The fingerprint lives on `experiment_iterations`, NOT on `candidates`,
-- for two reasons:
--   1. A UNIQUE index cannot span two tables, and this one has to be
--      scoped per experiment (the same combination run against a
--      different candle window or different costs is a legitimately
--      different result and must be allowed to run again).
--      `experiment_iterations` already carries `experiment_id`;
--      `candidates` would have to denormalise it.
--   2. run()'s loop creates the iteration row BEFORE the candidate row,
--      so this is the earliest point the duplicate can be rejected —
--      a conflict here leaves nothing behind to clean up.
-- `candidates.iteration_id` is UNIQUE, so iteration and candidate are 1:1
-- and the fingerprint identifies exactly one candidate either way.
--
-- Additive and re-runnable, same shape as 004. No backfill is needed:
-- Postgres treats NULLs as distinct in a unique index, so pre-existing
-- iteration rows keep a NULL fingerprint, never conflict with each other,
-- and are simply not de-duplicated retroactively.
ALTER TABLE experiment_iterations
    ADD COLUMN IF NOT EXISTS candidate_fingerprint char(64);

COMMENT ON COLUMN experiment_iterations.candidate_fingerprint IS
    'SHA-256 of the canonicalised candidate definition (CandidateFingerprintService.fingerprint). NULL for rows created before migration 005.';

-- Scoped to (experiment_id, fingerprint): duplicates are rejected within
-- one experiment only. Doubles as the lookup index for the ON CONFLICT
-- clause in ExperimentIterationRepository.createNext.
CREATE UNIQUE INDEX IF NOT EXISTS uk_iterations_experiment_fingerprint
    ON experiment_iterations (experiment_id, candidate_fingerprint);
