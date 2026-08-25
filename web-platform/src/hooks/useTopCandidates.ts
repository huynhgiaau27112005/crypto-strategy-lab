import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { CandidateDetailDto, TopCandidateRow } from '../api/types'

export interface UseTopCandidatesResult {
  rows: TopCandidateRow[]
  /** Full detail per candidate_id, keyed for O(1) lookup by the leaderboard table and the "Thành phần của …" panel. */
  details: Record<string, CandidateDetailDto>
  loading: boolean
  error: string | null
}

/**
 * `GET /strategy-search/experiments/:id/top` (artifacts/api-contract.md §2)
 * returns only `candidate_id` + metrics — no combo name, no version, no
 * member list. The Leaderboard tab's "Tổ hợp" / "Version" columns and its
 * "Thành phần của …" panel need that, so this hook follows up with one
 * `GET /strategy-search/candidates/:id` per ranked row to build them from
 * real data (member types, weights, parameters) instead of inventing any.
 * Bounded by construction: `limit` is already clamped to at most 100 by
 * the backend (artifacts/api-contract.md §2), so this fans out at most 100
 * requests, never more.
 *
 * `limit` is optional — omit it to let the server decide (it defaults to
 * the experiment's own persisted `topK`, the same value the leaderboard
 * was rebuilt with, so what renders always matches `leaderboard_entries`
 * for that experiment). Pass a number only when the caller has a genuine
 * explicit choice of its own to make (real pagination), not as a guessed
 * fallback.
 *
 * `refreshToken` is an opaque value the caller bumps (e.g. the experiment's
 * `completed` iteration count) to intentionally refetch as a running search
 * produces more candidates — it is not otherwise used.
 */
export function useTopCandidates(
  experimentId: string | null,
  limit?: number,
  refreshToken: number | string = 0,
): UseTopCandidatesResult {
  const [rows, setRows] = useState<TopCandidateRow[]>([])
  const [details, setDetails] = useState<Record<string, CandidateDetailDto>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!experimentId) {
      setRows([])
      setDetails({})
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const query = limit === undefined ? '' : `?limit=${limit}`
    apiFetch<TopCandidateRow[]>(
      `/strategy-search/experiments/${experimentId}/top${query}`,
      { signal: controller.signal },
    )
      .then(async (topRows) => {
        if (cancelled) return
        setRows(topRows)

        const entries = await Promise.all(
          topRows.map((row) =>
            apiFetch<CandidateDetailDto>(`/strategy-search/candidates/${row.candidate_id}`, {
              signal: controller.signal,
            })
              .then((detail): readonly [string, CandidateDetailDto] => [row.candidate_id, detail] as const)
              .catch(() => null),
          ),
        )
        if (cancelled) return
        const map: Record<string, CandidateDetailDto> = {}
        for (const entry of entries) {
          if (entry) map[entry[0]] = entry[1]
        }
        setDetails(map)
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không tải được leaderboard.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [experimentId, limit, refreshToken])

  return { rows, details, loading, error }
}
