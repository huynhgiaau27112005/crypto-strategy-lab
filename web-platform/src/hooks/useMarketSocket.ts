import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { getMarketSocket } from '../lib/marketSocket'
import type {
  CandleDto,
  MarketCandleEvent,
  MarketInterval,
  MarketStatusEvent,
} from '../api/types'

const SYMBOL = 'BTCUSDT'
const HISTORY_LIMIT = 300
// Cap the in-memory series so a long-lived tab doesn't grow this array
// without bound as live candles keep arriving.
const MAX_CANDLES = 500

export interface Candle {
  timestamp: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

export interface MarketSocketState {
  candles: Candle[]
  status: MarketStatusEvent | null
  loading: boolean
  error: string | null
}

function toCandle(c: CandleDto | MarketCandleEvent): Candle {
  return {
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }
}

function upsertCandle(prev: Candle[], next: Candle): Candle[] {
  let out: Candle[]
  const last = prev[prev.length - 1]
  if (last && last.timestamp === next.timestamp) {
    // Same closed candle re-broadcast (should not normally happen once
    // closed, but keep the merge idempotent instead of duplicating).
    out = [...prev.slice(0, -1), next]
  } else {
    out = [...prev, next]
  }
  return out.length > MAX_CANDLES ? out.slice(out.length - MAX_CANDLES) : out
}

/**
 * Owns one interval's candle history end-to-end: the initial REST fetch
 * plus the live `/market` socket subscription that keeps it current.
 *
 * This is the isolation boundary the project's required flow #3 depends
 * on — each call site (each <ChartPane>, the header's last-price reader)
 * gets its own state and its own effect keyed on `interval`. Changing one
 * pane's timeframe only re-runs *that* hook instance: it fetches once for
 * the new interval and subscribes to just that interval's socket room. No
 * shared array in a parent component, so no other pane's request or
 * render is triggered.
 *
 * `onCandle` (optional) is fired for every live closed candle this hook
 * receives — read-only fan-out for panels like "Recent ticks" that want to
 * observe candle events without owning this hook's state.
 */
export function useMarketSocket(
  interval: MarketInterval,
  onCandle?: (candle: Candle) => void,
): MarketSocketState {
  const [candles, setCandles] = useState<Candle[]>([])
  const [status, setStatus] = useState<MarketStatusEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Read via ref inside the effect so a new `onCandle` identity on every
  // parent render doesn't tear down and re-open the socket subscription.
  const onCandleRef = useRef(onCandle)
  onCandleRef.current = onCandle

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    setLoading(true)
    setError(null)
    setCandles([])
    setStatus(null)

    apiFetch<CandleDto[]>(
      `/market-data/candles?symbol=${SYMBOL}&interval=${interval}&limit=${HISTORY_LIMIT}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (cancelled) return
        setCandles(data.map(toCandle))
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không tải được dữ liệu nến.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    const socket = getMarketSocket()

    const handleCandle = (msg: MarketCandleEvent) => {
      if (msg.interval !== interval) return
      const candle = toCandle(msg)
      setCandles((prev) => upsertCandle(prev, candle))
      onCandleRef.current?.(candle)
    }
    const handleStatus = (msg: MarketStatusEvent) => {
      if (msg.interval !== interval) return
      setStatus(msg)
    }
    const handleError = (msg: { message: string }) => {
      setError(msg.message)
    }

    socket.on('candle', handleCandle)
    socket.on('status', handleStatus)
    socket.on('error', handleError)
    socket.emit('subscribe', { interval })

    return () => {
      cancelled = true
      controller.abort()
      // Leave the room and drop only this hook instance's listeners — the
      // shared socket (see lib/marketSocket.ts) stays open for any other
      // pane still subscribed to a different interval.
      socket.emit('unsubscribe', { interval })
      socket.off('candle', handleCandle)
      socket.off('status', handleStatus)
      socket.off('error', handleError)
    }
  }, [interval])

  return { candles, status, loading, error }
}
