import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { StrategyEntity } from '../../../database/types';

// Postgres error code for a unique-constraint violation, raised by the
// `uk_strategies_name_version` index when two concurrent saves race for the
// same next version number.
const UNIQUE_VIOLATION = '23505';
const MAX_VERSION_INSERT_ATTEMPTS = 5;

@Injectable()
export class StrategyRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByName(name: string): Promise<StrategyEntity> {
    const result = await this.database.query<StrategyEntity>(
      `SELECT * FROM strategies WHERE name = $1 AND type = 'SYSTEM' AND is_active = true`,
      [name],
    );
    if (!result.rows[0]) {
      throw new NotFoundException(`No active SYSTEM strategy named "${name}".`);
    }
    return result.rows[0];
  }

  async listSystemStrategies(): Promise<StrategyEntity[]> {
    const result = await this.database.query<StrategyEntity>(
      `SELECT * FROM strategies WHERE type = 'SYSTEM' AND is_active = true ORDER BY name`,
    );
    return result.rows;
  }

  /**
   * One row per built-in strategy name, preferring `userId`'s own latest
   * saved version (`type = 'USER'`, `owner_user_id = userId` — see
   * `createVersion`'s doc comment: saving a version is always USER-owned
   * and private, never mutates the shared SYSTEM row) and falling back to
   * the shared SYSTEM row when this user has never saved a custom version
   * for that name.
   *
   * This is the built-in counterpart of `AiStrategyRepository
   * .listLatestPerName` — without it, a user's saved parameter version was
   * pure metadata that nothing (the catalog display, or a new Search's
   * pinned strategyId) ever actually picked up: `listSystemStrategies()`
   * only ever sees `type = 'SYSTEM'` rows, so it always returns the
   * original seed row (version 1) regardless of what the user saved.
   */
  async listLatestForUser(userId: string): Promise<StrategyEntity[]> {
    const result = await this.database.query<StrategyEntity>(
      // COALESCE(..., false), not a bare `owner_user_id = $1`: a SYSTEM row
      // has owner_user_id NULL, so that comparison yields NULL rather than
      // false, and Postgres sorts NULLs FIRST under `DESC` — which put the
      // shared SYSTEM row ahead of the caller's own newer version and made
      // DISTINCT ON pick exactly the wrong row. Verified live: after saving
      // MA v8, the catalog still reported v1 until this was coalesced.
      `SELECT DISTINCT ON (name) *
       FROM strategies
       WHERE is_active = true AND (type = 'SYSTEM' OR owner_user_id = $1)
       ORDER BY name, COALESCE(owner_user_id = $1, false) DESC, version DESC`,
      [userId],
    );
    return result.rows;
  }

  /**
   * Every version row for a given strategy name that `userId` is entitled to
   * see: the shared SYSTEM lineage plus any USER-owned versions this user
   * personally saved. Another user's USER-owned versions of the same name
   * are never returned — ownership scoping lives in the WHERE clause, not in
   * a post-filter, so a caller cannot accidentally see it by trimming later.
   */
  async listVersions(name: string, userId: string): Promise<StrategyEntity[]> {
    const result = await this.database.query<StrategyEntity>(
      `SELECT * FROM strategies
       WHERE name = $1 AND (type = 'SYSTEM' OR owner_user_id = $2)
       ORDER BY version ASC`,
      [name, userId],
    );
    return result.rows;
  }

  /**
   * Inserts a NEW row as the next version for `name`, owned by `userId`.
   * Never updates an existing row — an experiment that already referenced
   * an older version keeps referencing exactly that row, unchanged.
   *
   * Saving a version always produces a USER-owned strategy, even when the
   * base strategy being edited is SYSTEM: the shared SYSTEM catalog that
   * every other user sees is never mutated by one user's edit.
   *
   * Concurrency: the next version number is computed as
   * MAX(version)+1 at insert time. Two concurrent saves for the same name
   * can race and both attempt the same version number; the unique index on
   * (name, version) rejects the loser with 23505, which we catch and retry
   * with a freshly recomputed version, up to a bounded number of attempts.
   */
  async createVersion(
    name: string,
    userId: string,
    parameters: Record<string, number>,
  ): Promise<StrategyEntity> {
    for (let attempt = 0; attempt < MAX_VERSION_INSERT_ATTEMPTS; attempt++) {
      try {
        return await this.database.withTransaction(async (client) => {
          const maxVersionResult = await client.query<{ next_version: number }>(
            `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM strategies WHERE name = $1`,
            [name],
          );
          const nextVersion = maxVersionResult.rows[0].next_version;

          const latest = await client.query<StrategyEntity>(
            `SELECT * FROM strategies WHERE name = $1 ORDER BY version DESC LIMIT 1`,
            [name],
          );
          if (!latest.rows[0]) {
            throw new NotFoundException(`No strategy named "${name}" exists.`);
          }

          const insertResult = await client.query<StrategyEntity>(
            `INSERT INTO strategies
               (owner_user_id, name, type, version, description, language, source_code, parameters, is_active)
             VALUES ($1, $2, 'USER', $3, $4, $5, $6, $7, true)
             RETURNING *`,
            [
              userId,
              name,
              nextVersion,
              latest.rows[0].description,
              latest.rows[0].language,
              latest.rows[0].source_code,
              JSON.stringify(parameters),
            ],
          );
          return insertResult.rows[0];
        });
      } catch (error: unknown) {
        const isUniqueViolation =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: string }).code === UNIQUE_VIOLATION;
        if (!isUniqueViolation || attempt === MAX_VERSION_INSERT_ATTEMPTS - 1) {
          throw error;
        }
        // Another concurrent save took this version number — loop and retry
        // with a freshly recomputed next version.
      }
    }
    throw new Error(`Failed to create a new version of "${name}" after ${MAX_VERSION_INSERT_ATTEMPTS} attempts.`);
  }
}
