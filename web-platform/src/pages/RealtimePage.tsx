import { useMemo, useState } from 'react'
import BlueprintCorners from '../components/BlueprintCorners'
import Chip from '../components/Chip'
import Panel from '../components/Panel'
import SignalBadge, { type SignalKind } from '../components/SignalBadge'
import DataTable, { type DataTableColumn } from '../components/DataTable'
import CandleChart from '../components/CandleChart'
import { useMarketSocket, type Candle } from '../hooks/useMarketSocket'
import { useStrategySignal } from '../hooks/useStrategySignal'
import type { MarketInterval, StrategySignal } from '../api/types'

const TF_ALL: MarketInterval[] = ['1m', '5m', '15m', '1h', '4h']
const MAX_PANES = 4
const DEFAULT_TFS: MarketInterval[] = ['1m', '5m', '15m', '1h']
const HISTORY_LABEL = '300'

function fmtPrice(v: string | number): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtQty(v: string | number, digits = 3): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false })
}

/** BUY/SELL/HOLD -> badge color. Neutral (no color claim) while the signal hasn't loaded yet. */
function signalKind(signal: StrategySignal | null): SignalKind {
  if (signal === 'BUY') return 'up'
  if (signal === 'SELL') return 'down'
  return 'neutral'
}

interface Tick {
  key: string
  time: string
  price: string
  qty: string
  side: 'Buy' | 'Sell'
}

/**
 * One chart pane, two hook instances (candles + strategy signal), each
 * keyed only by this pane's own `interval` prop. This is the isolation
 * boundary required flow #3 depends on: swapping a *different* pane's
 * timeframe never touches either hook instance here — no remount, no
 * refetch, no shared array/state in the parent.
 */
function ChartPane({ interval, paneCount }: { interval: MarketInterval; paneCount: number }) {
  const { candles, loading, error } = useMarketSocket(interval)
  const { data: signal, loading: signalLoading, error: signalError } = useStrategySignal(interval)

  const last = candles[candles.length - 1]
  const price = last ? fmtPrice(last.close) : '—'
  // The endpoint's own changePct, computed server-side over the same
  // window it ran the plugins on — never re-derived here.
  const changePct = signal?.changePct ?? null
  const changeLabel = changePct == null ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
  const changeUp = changePct == null ? null : changePct >= 0
  const ma20 = signal?.ma20 ?? null
  const volume = last ? fmtQty(last.volume, 0) : '—'

  // Never default to BUY (or any signal) while loading/unavailable — a
  // guessed fallback is the same bug in a quieter form.
  const badgeLabel = signal ? signal.signal : signalLoading ? '···' : signalError ? '—' : '—'

  return (
    <div className="pane blueprint" data-hov="card">
      <BlueprintCorners />
      <div className="pane-head">
        <div className="pane-title">BTCUSDT · {interval}</div>
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
        MA(20) {ma20 == null ? '—' : fmtPrice(ma20)} · Volume {volume}
      </div>
      {loading ? (
        <div className="pane-status text-muted">Đang tải dữ liệu nến…</div>
      ) : error ? (
        <div className="pane-status text-muted">Lỗi: {error}</div>
      ) : (
        <CandleChart candles={candles} height={paneCount > 2 ? 176 : 260} />
      )}
    </div>
  )
}

export default function RealtimePage() {
  const [tfs, setTfs] = useState<MarketInterval[]>(DEFAULT_TFS)
  const [ticks, setTicks] = useState<Tick[]>([])

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

  // The connection panel and recent-ticks feed are cross-pane summaries by
  // design, not one of the isolated chart panes — they track whichever
  // selected timeframe updates most often (the smallest one). This is its
  // own independent useMarketSocket instance: it does not read from, or
  // feed into, any <ChartPane>'s state.
  const primaryInterval = useMemo(() => TF_ALL.find((tf) => tfs.includes(tf)) ?? DEFAULT_TFS[0], [tfs])

  const handlePrimaryCandle = (candle: Candle) => {
    const buy = Number(candle.close) >= Number(candle.open)
    setTicks((prev) => {
      const next: Tick = {
        key: candle.timestamp,
        time: fmtTime(candle.timestamp),
        price: fmtPrice(candle.close),
        qty: fmtQty(candle.volume),
        side: buy ? 'Buy' : 'Sell',
      }
      return [next, ...prev.filter((t) => t.key !== next.key)].slice(0, 6)
    })
  }

  const { status: primaryStatus } = useMarketSocket(primaryInterval, handlePrimaryCandle)

  const tickColumns: DataTableColumn<Tick>[] = [
    { key: 'time', label: 'Thời gian', render: (t) => <span className="mono">{t.time}</span> },
    { key: 'price', label: 'Giá', render: (t) => <span className="mono">{t.price}</span> },
    { key: 'qty', label: 'KL', render: (t) => <span className="mono">{t.qty}</span> },
    {
      key: 'side',
      label: 'Loại',
      render: (t) => <span className={`mono ${t.side === 'Buy' ? 'text-up' : 'text-down'}`}>{t.side}</span>,
    },
  ]

  const connRows: { key: string; k: string; v: string }[] = [
    { key: 'status', k: 'Trạng thái', v: primaryStatus?.connected ? 'Đã kết nối' : 'Đang kết nối…' },
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
      </div>

      <div className="realtime-body">
        <div className="pane-grid">
          {tfs.map((tf) => (
            <ChartPane key={tf} interval={tf} paneCount={tfs.length} />
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
            <DataTable columns={tickColumns} rows={ticks} rowKey={(t) => t.key} emptyLabel="Chưa có tick nào." />
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
                <span>MA(20) — trung bình động 20 nến</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
