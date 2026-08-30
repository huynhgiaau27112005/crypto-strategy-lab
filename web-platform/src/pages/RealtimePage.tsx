import { useMemo, useState } from 'react'
import BlueprintCorners from '../components/BlueprintCorners'
import Chip from '../components/Chip'
import Panel from '../components/Panel'
import SignalBadge, { type SignalKind } from '../components/SignalBadge'
import DataTable, { type DataTableColumn } from '../components/DataTable'
import CandleChart, { type MaOverlay } from '../components/CandleChart'
import { useMarketSocket } from '../hooks/useMarketSocket'
import { useMarketTicks } from '../hooks/useMarketTicks'
import { useStrategySignal } from '../hooks/useStrategySignal'
import { fmtClockVN, fmtTimeVN } from '../lib/datetime'
import { MARKET_SYMBOL } from '../lib/marketScope'
import type { MarketInterval, MarketTradeEvent, StrategySignal } from '../api/types'

const TF_ALL: MarketInterval[] = ['1m', '5m', '15m', '1h', '4h']
const MAX_PANES = 4
const DEFAULT_TFS: MarketInterval[] = ['1m', '5m', '15m', '1h']
const HISTORY_LABEL = '300'
const TICK_LIMIT = 12

/**
 * Selectable moving averages. Binance's own defaults (7/25/99) are on by
 * default; MA(20)/MA(50) stay available because the Strategy Engine's MA
 * plugin samples periods in that range. Nothing is drawn that the user did
 * not switch on — previously an unexplained MA(20) simply appeared.
 */
const MA_CHOICES: MaOverlay[] = [
  { period: 7, colorVar: '--color-accent-400' },
  { period: 20, colorVar: '--color-accent-500' },
  { period: 25, colorVar: '--color-accent' },
  { period: 50, colorVar: '--color-accent-600' },
  { period: 99, colorVar: '--color-accent-700' },
]
const DEFAULT_MA_PERIODS = [7, 25, 99]

function fmtPrice(v: string | number): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtQty(v: string | number, digits = 3): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtTime(iso: string): string {
  return fmtTimeVN(iso)
}
function fmtClock(iso: string): string {
  return fmtClockVN(iso)
}

/** BUY/SELL/HOLD -> badge color. Neutral (no color claim) while the signal hasn't loaded yet. */
function signalKind(signal: StrategySignal | null): SignalKind {
  if (signal === 'BUY') return 'up'
  if (signal === 'SELL') return 'down'
  return 'neutral'
}

/**
 * One chart pane, two hook instances (candles + strategy signal), each
 * keyed only by this pane's own `interval` prop. This is the isolation
 * boundary required flow #3 depends on: swapping a *different* pane's
 * timeframe never touches either hook instance here — no remount, no
 * refetch, no shared array/state in the parent.
 */
function ChartPane({
  interval,
  paneCount,
  overlays,
  live,
}: {
  interval: MarketInterval
  paneCount: number
  overlays: MaOverlay[]
  live: boolean
}) {
  const { candles, loading, error } = useMarketSocket(interval, undefined, live)
  const { data: signal, loading: signalLoading, error: signalError } = useStrategySignal(interval)

  const last = candles[candles.length - 1]
  const price = last ? fmtPrice(last.close) : '—'
  // The endpoint's own changePct, computed server-side over the same
  // window it ran the plugins on — never re-derived here.
  const changePct = signal?.changePct ?? null
  const changeLabel = changePct == null ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
  const changeUp = changePct == null ? null : changePct >= 0
  const volume = last ? fmtQty(last.volume, 0) : '—'
  // The last bar is the one still being built while the feed is live.
  const forming = live && last?.closed === false

  // Never default to BUY (or any signal) while loading/unavailable — a
  // guessed fallback is the same bug in a quieter form.
  const badgeLabel = signal ? signal.signal : signalLoading ? '···' : signalError ? '—' : '—'

  return (
    <div className="pane blueprint" data-hov="card">
      <BlueprintCorners />
      <div className="pane-head">
        <div className="pane-title">{MARKET_SYMBOL} · {interval}</div>
        <div className="pane-flex" />
        <div className="pane-price mono">{price}</div>
        <span
          className={`pane-change mono ${changeUp == null ? '' : changeUp ? 'text-up' : 'text-down'}`}
        >
          {changeLabel}
        </span>
        <SignalBadge label={badgeLabel} kind={signalKind(signal?.signal ?? null)} />
      </div>
      <div className="pane-meta text-muted mono">
        {overlays.length === 0
          ? 'Không hiện đường MA'
          : overlays.map((o) => `MA(${o.period})`).join(' · ')}{' '}
        · Volume {volume} · {forming ? 'nến đang chạy' : live ? 'chờ tick' : 'đã tạm dừng'}
      </div>
      {loading ? (
        <div className="pane-status text-muted">Đang tải dữ liệu nến…</div>
      ) : error ? (
        <div className="pane-status text-muted">Lỗi: {error}</div>
      ) : (
        <CandleChart candles={candles} maOverlays={overlays} height={paneCount > 2 ? 176 : 260} />
      )}
    </div>
  )
}

export default function RealtimePage() {
  const [tfs, setTfs] = useState<MarketInterval[]>(DEFAULT_TFS)
  const [live, setLive] = useState(true)
  const [maPeriods, setMaPeriods] = useState<number[]>(DEFAULT_MA_PERIODS)

  const overlays = useMemo(
    () => MA_CHOICES.filter((c) => maPeriods.includes(c.period)),
    [maPeriods],
  )

  const toggleTf = (tf: MarketInterval) => {
    setTfs((prev) => {
      const has = prev.includes(tf)
      if (has) {
        if (prev.length <= 1) return prev // always keep at least one pane
        return prev.filter((x) => x !== tf)
      }
      if (prev.length >= MAX_PANES) return prev // refuse a 5th selection
      return TF_ALL.filter((x) => prev.includes(x) || x === tf)
    })
  }

  const toggleMa = (period: number) => {
    setMaPeriods((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period].sort((a, b) => a - b),
    )
  }

  // The connection panel is a cross-pane summary by design, not one of the
  // isolated chart panes — it tracks whichever selected timeframe updates
  // most often (the smallest one). Its own independent useMarketSocket
  // instance: it does not read from, or feed into, any <ChartPane>'s state.
  const primaryInterval = useMemo(() => TF_ALL.find((tf) => tfs.includes(tf)) ?? DEFAULT_TFS[0], [tfs])
  const { status: primaryStatus } = useMarketSocket(primaryInterval, undefined, live)

  // Real executed trades, not one row per candle — see useMarketTicks.
  const ticks = useMarketTicks(TICK_LIMIT, live)

  const tickColumns: DataTableColumn<MarketTradeEvent>[] = [
    { key: 'time', label: 'Thời gian', render: (t) => <span className="mono">{fmtClock(t.timestamp)}</span> },
    { key: 'price', label: 'Giá', render: (t) => <span className="mono">{fmtPrice(t.price)}</span> },
    { key: 'qty', label: 'KL (BTC)', render: (t) => <span className="mono">{fmtQty(t.quantity, 5)}</span> },
    {
      key: 'side',
      label: 'Bên chủ động',
      // Which side crossed the spread on this trade — a fact Binance
      // reports per trade (`m`), not a strategy signal.
      render: (t) => (
        <span className={`mono ${t.buyerIsMaker ? 'text-down' : 'text-up'}`}>
          {t.buyerIsMaker ? 'Bán' : 'Mua'}
        </span>
      ),
    },
  ]

  const connRows: { key: string; k: string; v: string }[] = [
    {
      key: 'status',
      k: 'Trạng thái',
      v: !live ? 'Đã tạm dừng' : primaryStatus?.connected ? 'Đã kết nối' : 'Đang kết nối…',
    },
    { key: 'source', k: 'Nguồn dữ liệu', v: 'Binance WS' },
    { key: 'interval', k: 'Khung tham chiếu', v: primaryInterval },
    {
      key: 'last',
      k: 'Dữ liệu cuối',
      v: primaryStatus?.lastMessageAt ? fmtTime(primaryStatus.lastMessageAt) : '—',
    },
    { key: 'history', k: 'Nến lịch sử / pane', v: HISTORY_LABEL },
  ]

  return (
    <div className="realtime">
      <div className="blueprint tf-bar">
        <BlueprintCorners />
        <div>
          <div className="section-label">Khung thời gian — chọn tối đa {MAX_PANES}</div>
          <div className="chip-row">
            {TF_ALL.map((tf) => (
              <Chip key={tf} label={tf} pressed={tfs.includes(tf)} onClick={() => toggleTf(tf)} />
            ))}
          </div>
        </div>
        <div>
          <div className="section-label">Đường MA hiển thị</div>
          <div className="chip-row">
            {MA_CHOICES.map((c) => (
              <Chip
                key={c.period}
                label={`MA${c.period}`}
                pressed={maPeriods.includes(c.period)}
                onClick={() => toggleMa(c.period)}
              />
            ))}
          </div>
        </div>
        <div className="tf-bar-flex" />
        <div>
          <div className="section-label">Luồng realtime</div>
          <div className="chip-row">
            <Chip
              label={live ? 'Realtime: BẬT' : 'Realtime: TẮT'}
              pressed={live}
              onClick={() => setLive((v) => !v)}
            />
          </div>
        </div>
      </div>

      <div className="realtime-body">
        <div className="pane-grid">
          {tfs.map((tf) => (
            <ChartPane key={tf} interval={tf} paneCount={tfs.length} overlays={overlays} live={live} />
          ))}
        </div>

        <div className="side-col">
          <Panel title="Trạng thái kết nối">
            <div className="conn-rows">
              {connRows.map((r) => (
                <div className="conn-row" key={r.key}>
                  <span className="text-muted">{r.k}</span>
                  <span className="mono">{r.v}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent ticks">
            <DataTable
              columns={tickColumns}
              rows={ticks}
              rowKey={(t) => String(t.tradeId)}
              emptyLabel={live ? 'Đang chờ lệnh khớp…' : 'Đã tạm dừng luồng realtime.'}
            />
          </Panel>

          <Panel title="Chú giải">
            <div className="legend">
              <div className="legend-row">
                <span className="legend-dot legend-up" />
                <span>Nến tăng (Close &gt; Open)</span>
              </div>
              <div className="legend-row">
                <span className="legend-dot legend-down" />
                <span>Nến giảm (Close &lt; Open)</span>
              </div>
              <div className="legend-row">
                <span className="legend-line" />
                <span>
                  {overlays.length === 0
                    ? 'Chưa bật đường MA nào'
                    : overlays.map((o) => `MA(${o.period})`).join(', ')}
                </span>
              </div>
              <div className="legend-row">
                <span className="legend-bar" />
                <span>Volume theo từng nến</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
