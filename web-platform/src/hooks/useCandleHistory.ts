import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { Candle } from './useMarketSocket'
import type { CandleDto, MarketInterval } from '../api/types'

const SYMBOL = 'BTCUSDT'
const HISTORY_LIMIT = 300

export interface UseCandleHistoryResult {
  candles: Candle[]
  loading: boolean
  error: string | null
}

/**
 * One-shot (non-live) fetch of `GET /market-data/candles` for the Backtest
 * tab's "02" chart — same endpoint and shape `useMarketSocket` uses for its
 * initial history, minus the `/market` socket subscription: this chart is a
 * snapshot, not a live feed. `GET /market-data/candles` has no
 * startTime/endTime filter (artifacts/api-contract.md §3 — only
 * symbol/interval/limit, reads straight from Binance), so this returns the
 * latest closed candles for the experiment's own timeframe rather than the
 * exact historical window the search backtested over. That is real
 * BTCUSDT price data (never fabricated), just not date-pinned to the run —
 * the only alternative would be inventing OHLC bars client-side, which is
 * worse. Refetches when `interval` changes; aborts on unmount.
 */
export function useCandleHistory(interval: MarketInterval): UseCandleHistoryResult {
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    setLoading(true)
    setError(null)

    apiFetch<CandleDto[]>(
      `/market-data/candles?symbol=${SYMBOL}&interval=${interval}&limit=${HISTORY_LIMIT}`,
      { signal: controller.signal },
    )
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
  }, [interval])

  return { candles, loading, error }
}
