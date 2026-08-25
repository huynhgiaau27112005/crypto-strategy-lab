import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '../hooks/useMarketSocket'

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

export default function CandleChart({
  candles,
  maPeriod = 20,
  maColorVar = '--color-accent',
  secondaryMaPeriod,
  secondaryMaColorVar = '--color-accent-400',
  showLevels = false,
  height = 220,
}: {
  candles: Candle[]
  maPeriod?: number
  /** CSS custom property to resolve for the primary MA line — see resolveColor() below. */
  maColorVar?: string
  /** A second SMA overlay (e.g. MA(50) for the Backtest chart) — omitted entirely when unset. */
  secondaryMaPeriod?: number
  secondaryMaColorVar?: string
  /** Draws two horizontal reference lines at the visible window's high/low — the "Hỗ trợ"/"Kháng cự" legend entries. Simple chart annotations (min/max of what's already rendered), not a computed trading signal. */
  showLevels?: boolean
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const maSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const secondaryMaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const supportLineRef = useRef<IPriceLine | null>(null)
  const resistanceLineRef = useRef<IPriceLine | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const upColor = resolveColor('--color-up', '#3f8f5f')
    const downColor = resolveColor('--color-down', '#b3453a')
    const textColor = resolveColor('--color-text', '#1d1f20')
    const dividerColor = resolveColor('--color-divider', 'rgba(29,31,32,0.16)')
    const accentColor = resolveColor(maColorVar, '#5980a6')
    const secondaryAccentColor = resolveColor(secondaryMaColorVar, '#94bce3')

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
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderVisible: false,
      wickUpColor: upColor,
      wickDownColor: downColor,
    })
    const maSeries = chart.addSeries(LineSeries, {
      color: accentColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    const secondaryMaSeries = chart.addSeries(LineSeries, {
      color: secondaryAccentColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })

    candleSeriesRef.current = candleSeries
    maSeriesRef.current = maSeries
    secondaryMaSeriesRef.current = secondaryMaSeries

    return () => {
      chart.remove()
      candleSeriesRef.current = null
      maSeriesRef.current = null
      secondaryMaSeriesRef.current = null
      supportLineRef.current = null
      resistanceLineRef.current = null
    }
  }, [])

  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    const maSeries = maSeriesRef.current
    const secondaryMaSeries = secondaryMaSeriesRef.current
    if (!candleSeries || !maSeries || !secondaryMaSeries) return

    const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const ohlc = sorted.map((c) => ({
      time: toSeconds(c.timestamp),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }))
    candleSeries.setData(ohlc)

    const sma = computeSma(
      ohlc.map((c) => c.close),
      maPeriod,
    )
    maSeries.setData(
      ohlc
        .map((c, i) => (sma[i] == null ? null : { time: c.time, value: sma[i] as number }))
        .filter((point): point is { time: UTCTimestamp; value: number } => point != null),
    )

    if (secondaryMaPeriod != null) {
      const sma2 = computeSma(
        ohlc.map((c) => c.close),
        secondaryMaPeriod,
      )
      secondaryMaSeries.setData(
        ohlc
          .map((c, i) => (sma2[i] == null ? null : { time: c.time, value: sma2[i] as number }))
          .filter((point): point is { time: UTCTimestamp; value: number } => point != null),
      )
    } else {
      secondaryMaSeries.setData([])
    }

    // Support/resistance reference lines: the visible window's low/high,
    // the same simple min/max convention the approved prototype uses for
    // this legend entry — a chart annotation, not a recomputed strategy
    // signal (the real SUPPORT_RESISTANCE plugin signal never runs here).
    if (supportLineRef.current) {
      candleSeries.removePriceLine(supportLineRef.current)
      supportLineRef.current = null
    }
    if (resistanceLineRef.current) {
      candleSeries.removePriceLine(resistanceLineRef.current)
      resistanceLineRef.current = null
    }
    if (showLevels && ohlc.length > 0) {
      const upColor = resolveColor('--color-up', '#3f8f5f')
      const downColor = resolveColor('--color-down', '#b3453a')
      const high = Math.max(...ohlc.map((c) => c.high))
      const low = Math.min(...ohlc.map((c) => c.low))
      resistanceLineRef.current = candleSeries.createPriceLine({
        price: high,
        color: downColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Kháng cự',
      })
      supportLineRef.current = candleSeries.createPriceLine({
        price: low,
        color: upColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Hỗ trợ',
      })
    }
  }, [candles, maPeriod, secondaryMaPeriod, showLevels])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
