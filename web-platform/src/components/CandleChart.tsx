import { useEffect, useMemo, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '../hooks/useMarketSocket'
import { chartTimeFormatter } from '../lib/datetime'

/** One moving-average overlay: period + the design token to colour it with. */
export interface MaOverlay {
  period: number
  colorVar: string
}

/** A price level to mark on the chart (entry / stop-loss / take-profit). */
export interface PriceMarker {
  price: number
  label: string
  /** `up` = green (take profit), `down` = red (stop loss), `neutral` = accent (entry). */
  tone: 'up' | 'down' | 'neutral'
}

/** Time-based marker (LONG/SHORT entry arrows on the candle series). */
export interface TimeMarker {
  time: string
  label: string
  side: 'LONG' | 'SHORT'
}

function toSeconds(iso: string): UTCTimestamp {
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp
}

function computeSma(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < closes.length; i += 1) {
    sum += closes[i]
    if (i >= period) sum -= closes[i - period]
    out.push(i >= period - 1 ? sum / period : null)
  }
  return out
}

/**
 * Reads a design token's resolved value as a color lightweight-charts can
 * actually parse. Two problems stack here:
 *  1. lightweight-charts draws on <canvas>, which needs a literal color
 *     string, not `var(--x)`.
 *  2. This design system's tokens are defined in `oklch()` (see
 *     styles/global.css), and `getComputedStyle(...).color` on a probe
 *     element echoes that syntax back verbatim in this Chromium build
 *     instead of resolving it — but lightweight-charts' own color parser
 *     does not understand `oklch()` and throws ("Failed to parse color").
 * Painting the color onto a 1×1 canvas and reading the pixel back forces
 * an actual resolution to concrete sRGB, which every consumer (including
 * lightweight-charts' parser) understands. Resolved once per chart
 * instance, at creation, so this component still only ever references
 * tokens defined in styles/*.css, never a hardcoded color literal.
 */
function resolveColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw) return fallback
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return fallback
    ctx.fillStyle = raw
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
  } catch {
    return fallback
  }
}

/** Semi-transparent variant of a resolved `rgb(...)`/`rgba(...)` string. */
function withAlpha(color: string, alpha: number): string {
  const match = /^rgba?\(([^)]+)\)$/.exec(color)
  if (!match) return color
  const [r, g, b] = match[1].split(',').map((part) => part.trim())
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function CandleChart({
  candles,
  maOverlays,
  showLevels = false,
  showVolume = true,
  markers,
  timeMarkers,
  height = 220,
}: {
  candles: Candle[]
  /**
   * Moving averages to draw. Empty array = none. Defaults to Binance's own
   * MA(7)/MA(25)/MA(99) set rather than a single unexplained MA(20).
   */
  maOverlays?: MaOverlay[]
  /** Draws two horizontal reference lines at the visible window's high/low — the "Hỗ trợ"/"Kháng cự" legend entries. Simple chart annotations (min/max of what's already rendered), not a computed trading signal. */
  showLevels?: boolean
  /**
   * Volume histogram under the price series, in its own scale pinned to
   * the bottom 22% of the pane — the brief lists Volume among the required
   * chart overlays and it was missing entirely.
   */
  showVolume?: boolean
  /** Extra horizontal price lines (entry / stop-loss / take-profit of a backtested trade). */
  markers?: PriceMarker[]
  /** Entry arrows at trade open times (LONG below bar, SHORT above). */
  timeMarkers?: TimeMarker[]
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  // Keyed by MA period so a changed overlay set adds/removes only the
  // series that actually changed.
  const maSeriesRef = useRef<Map<number, ISeriesApi<'Line'>>>(new Map())
  const priceLinesRef = useRef<IPriceLine[]>([])
  const seriesMarkersRef = useRef<{ setMarkers: (markers: SeriesMarker<UTCTimestamp>[]) => void } | null>(
    null,
  )

  const overlays = useMemo<MaOverlay[]>(
    () =>
      maOverlays ?? [
        { period: 7, colorVar: '--color-accent-400' },
        { period: 25, colorVar: '--color-accent' },
        { period: 99, colorVar: '--color-accent-700' },
      ],
    [maOverlays],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Captured for the cleanup below: reading `maSeriesRef.current` there
    // directly would read whatever the ref points at by teardown time.
    const maSeries = maSeriesRef.current

    const upColor = resolveColor('--color-up', '#3f8f5f')
    const downColor = resolveColor('--color-down', '#b3453a')
    const textColor = resolveColor('--color-text', '#1d1f20')
    const dividerColor = resolveColor('--color-divider', 'rgba(29,31,32,0.16)')

    const chart: IChartApi = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: dividerColor },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      localization: {
        timeFormatter: chartTimeFormatter,
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderVisible: false,
      wickUpColor: upColor,
      wickDownColor: downColor,
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    seriesMarkersRef.current = createSeriesMarkers(candleSeries) as {
      setMarkers: (markers: SeriesMarker<UTCTimestamp>[]) => void
    }

    return () => {
      seriesMarkersRef.current = null
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      maSeries.clear()
      priceLinesRef.current = []
    }
  }, [])

  // Volume histogram lives on its own overlay price scale so its magnitudes
  // (hundreds of BTC) never squash the price scale.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (!showVolume) {
      if (volumeSeriesRef.current) {
        chart.removeSeries(volumeSeriesRef.current)
        volumeSeriesRef.current = null
      }
      return
    }
    if (volumeSeriesRef.current) return

    const series = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      borderVisible: false,
    })
    volumeSeriesRef.current = series
  }, [showVolume])

  // Add/remove MA line series to match `overlays`.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const wanted = new Map(overlays.map((o) => [o.period, o]))

    for (const [period, series] of [...maSeriesRef.current]) {
      if (!wanted.has(period)) {
        chart.removeSeries(series)
        maSeriesRef.current.delete(period)
      }
    }
    for (const overlay of overlays) {
      if (maSeriesRef.current.has(overlay.period)) continue
      const series = chart.addSeries(LineSeries, {
        color: resolveColor(overlay.colorVar, '#5980a6'),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      maSeriesRef.current.set(overlay.period, series)
    }
  }, [overlays])

  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    if (!candleSeries) return

    const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const ohlc = sorted.map((c) => ({
      time: toSeconds(c.timestamp),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
    }))
    candleSeries.setData(ohlc)

    const volumeSeries = volumeSeriesRef.current
    if (volumeSeries) {
      const upColor = withAlpha(resolveColor('--color-up', '#3f8f5f'), 0.45)
      const downColor = withAlpha(resolveColor('--color-down', '#b3453a'), 0.45)
      volumeSeries.setData(
        ohlc.map((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? upColor : downColor,
        })),
      )
    }

    const closes = ohlc.map((c) => c.close)
    for (const [period, series] of maSeriesRef.current) {
      const sma = computeSma(closes, period)
      series.setData(
        ohlc
          .map((c, i) => (sma[i] == null ? null : { time: c.time, value: sma[i] as number }))
          .filter((point): point is { time: UTCTimestamp; value: number } => point != null),
      )
    }

    for (const line of priceLinesRef.current) candleSeries.removePriceLine(line)
    priceLinesRef.current = []

    const upColor = resolveColor('--color-up', '#3f8f5f')
    const downColor = resolveColor('--color-down', '#b3453a')
    const accentColor = resolveColor('--color-accent', '#5980a6')

    // Support/resistance reference lines: the visible window's low/high,
    // the same simple min/max convention the approved prototype uses for
    // this legend entry — a chart annotation, not a recomputed strategy
    // signal (the real SUPPORT_RESISTANCE plugin signal never runs here).
    if (showLevels && ohlc.length > 0) {
      const high = Math.max(...ohlc.map((c) => c.high))
      const low = Math.min(...ohlc.map((c) => c.low))
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: high,
          color: downColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Kháng cự',
        }),
        candleSeries.createPriceLine({
          price: low,
          color: upColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Hỗ trợ',
        }),
      )
    }

    // Entry / Stop Loss / Take Profit of the trade being inspected. These
    // are real values persisted with the backtested trade, not derived
    // here — the chart just draws where they sit.
    for (const marker of markers ?? []) {
      if (!Number.isFinite(marker.price)) continue
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: marker.price,
          color: marker.tone === 'up' ? upColor : marker.tone === 'down' ? downColor : accentColor,
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: marker.label,
        }),
      )
    }

    const markerPlugin = seriesMarkersRef.current
    if (markerPlugin) {
      const seriesMarkers: SeriesMarker<UTCTimestamp>[] = (timeMarkers ?? []).map((m) => ({
        time: toSeconds(m.time),
        position: m.side === 'LONG' ? 'belowBar' : 'aboveBar',
        color: m.side === 'LONG' ? upColor : downColor,
        shape: m.side === 'LONG' ? 'arrowUp' : 'arrowDown',
        text: m.side === 'LONG' ? 'LONG ENTRY' : 'SHORT ENTRY',
      }))
      markerPlugin.setMarkers(seriesMarkers)
    }
  }, [candles, overlays, showLevels, showVolume, markers, timeMarkers])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
