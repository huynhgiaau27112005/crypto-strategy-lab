import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { SentimentSummaryDto } from '../api/types'

export interface UseSentimentSummaryResult {
  data: SentimentSummaryDto | null
  loading: boolean
  error: string | null
}

/** `GET /sentiment/summary?hours=` — artifacts/api-contract.md §4. */
export function useSentimentSummary(hours: number): UseSentimentSummaryResult {
  const [data, setData] = useState<SentimentSummaryDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    apiFetch<SentimentSummaryDto>(`/sentiment/summary?hours=${hours}`, { signal: controller.signal })
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không tải được sentiment summary.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [hours])

  return { data, loading, error }
}
