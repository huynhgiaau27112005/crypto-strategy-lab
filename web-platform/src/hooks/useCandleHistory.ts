import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { Candle } from './useMarketSocket'
import type { CandleDto, MarketInterval } from '../api/types'

const SYMBOL = 'BTCUSDT'
const HISTORY_LIMIT = 500

export interface UseCandleHistoryResult {
  candles: Candle[]
  loading: boolean
  error: string | null
}

/**
 * One-shot (non-live) fetch of `GET /market-data/candles` for the Backtest
 * tab's "02" chart — same endpoint `useMarketSocket` uses for its initial
 * history, minus the `/market` socket subscription: this chart is a
 * snapshot, not a live feed.
 *
 * `startTime`/`endTime` pin it to the window the run was configured over.
 * Without them the chart showed the latest 300 candles regardless of the
 * backtest's date range, so the trades listed underneath frequently sat
 * outside the visible price series entirely. Omit both to get the latest
 * closed candles instead.
 */
export function useCandleHistory(
  interval: MarketInterval,
  startTime?: string,
  endTime?: string,
): UseCandleHistoryResult {
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      symbol: SYMBOL,
      interval,
      limit: String(HISTORY_LIMIT),
    })
    if (startTime) params.set('startTime', startTime)
    if (endTime) params.set('endTime', endTime)

    apiFetch<CandleDto[]>(`/market-data/candles?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (cancelled) return
        setCandles(
          data.map((c) => ({
            timestamp: c.timestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
            closed: true,
          })),
        )
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không tải được dữ liệu nến.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [interval, startTime, endTime])

  return { candles, loading, error }
}
