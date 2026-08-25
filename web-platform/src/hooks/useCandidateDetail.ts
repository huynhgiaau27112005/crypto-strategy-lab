import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { CandidateDetailDto } from '../api/types'

export interface UseCandidateDetailResult {
  data: CandidateDetailDto | null
  loading: boolean
  error: string | null
}

/**
 * Owns one candidate's full detail — `GET
 * /strategy-search/candidates/:id?tradePage=&tradePageSize=`
 * (artifacts/api-contract.md §2) — for the Backtest tab's "02" section:
 * members, evaluation metrics, and one page of trades. Refetches whenever
 * the candidate or the requested trade page/page size changes; the
 * in-flight request is aborted on any of those changing, or on unmount.
 */
export function useCandidateDetail(
  candidateId: string | null,
  tradePage: number,
  tradePageSize: number,
): UseCandidateDetailResult {
  const [data, setData] = useState<CandidateDetailDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!candidateId) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    apiFetch<CandidateDetailDto>(
      `/strategy-search/candidates/${candidateId}?tradePage=${tradePage}&tradePageSize=${tradePageSize}`,
      { signal: controller.signal },
    )
      .then((detail) => {
        if (cancelled) return
        setData(detail)
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không tải được chi tiết candidate.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [candidateId, tradePage, tradePageSize])

  return { data, loading, error }
}
