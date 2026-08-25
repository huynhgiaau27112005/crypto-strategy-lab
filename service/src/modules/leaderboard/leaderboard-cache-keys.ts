// Key-building for the leaderboard "top N" cache, shared between
// LeaderboardService (bumps the version on every rebuild) and
// StrategySearchService.getTop() (reads/writes the cached list) so both
// agree on the exact same key shape without either hand-rolling it
// (task-17 requirement: one place owns key building per cached thing).
//
// Versioned instead of a plain TTL-only key: a request's `limit` query
// param does not need to be part of the key because the cached value is
// always the top LEADERBOARD_TOP_CACHE_MAX_ENTRIES rows (already ordered by
// score), and the caller slices to the requested limit after reading —
// slicing a superset that is already sorted descending gives the same
// result as querying for that smaller limit directly.
export const LEADERBOARD_TOP_CACHE_TTL_SECONDS = 60;
export const LEADERBOARD_TOP_CACHE_MAX_ENTRIES = 100;

export function leaderboardVersionKey(experimentId: string): string {
  return `leaderboard:version:${experimentId}`;
}

// userId is part of the key even though ownership is already checked
// before this is ever read (defense-in-depth against a future call site
// that forgets the ownership check — task-17 "Never let one user's cached
// response be served to another").
export function leaderboardTopDataKey(
  experimentId: string,
  userId: string,
  version: number,
): string {
  return `strategy-search:top:${experimentId}:${userId}:v${version}`;
}
