import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { MarketInterval, RealtimeSignalDto } from '../api/types'

export interface StrategySignalState {
  data: RealtimeSignalDto | null
  loading: boolean
  error: string | null
}

/**
 * Owns one interval's Strategy Engine signal end-to-end: fetches
 * GET /strategy-engine/signal for that interval only.
 *
 * Same isolation boundary as useMarketSocket (see hooks/useMarketSocket.ts):
 * each <ChartPane> gets its own instance, effect keyed only on its own
 * `interval` prop. Changing one pane's timeframe re-runs only that
 * instance's effect — no other pane's request, state, or render is
 * touched. The in-flight request is aborted on interval change / unmount.
 */
export function useStrategySignal(interval: MarketInterval): StrategySignalState {
  const [data, setData] = useState<RealtimeSignalDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    setLoading(true)
    setError(null)
    setData(null)

    apiFetch<RealtimeSignalDto>(`/strategy-engine/signal?interval=${interval}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không tải được tín hiệu chiến lược.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [interval])

  return { data, loading, error }
}
