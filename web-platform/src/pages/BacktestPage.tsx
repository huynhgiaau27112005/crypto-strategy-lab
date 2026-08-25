import { useEffect, useMemo, useState } from 'react'
import BlueprintCorners from '../components/BlueprintCorners'
import CandleChart from '../components/CandleChart'
import ConfirmRerunDialog from '../components/ConfirmRerunDialog'
import { apiFetch, ApiError } from '../api/client'
import { useCandidateDetail } from '../hooks/useCandidateDetail'
import { useCandleHistory } from '../hooks/useCandleHistory'
import { useExperiment } from '../hooks/useExperiment'
import { useTopCandidates } from '../hooks/useTopCandidates'
import { useExperimentContext } from '../state/ExperimentContext'
import { useStrategySelection } from '../state/StrategySelectionContext'
import type { MarketInterval, StartSearchRequest, StartSearchResponse } from '../api/types'

const TF_OPTIONS: MarketInterval[] = ['1m', '5m', '15m', '1h', '4h']
const TRADE_PAGE_SIZE = 8

function fmtUsd(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
}
function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtPct(n: number): string {
  return `${fmtNum(n * 100)}%`
}
/**
 * `evaluation.maxDrawdown` (and `total_return`/`max_drawdown` on
 * GET /strategy-search/experiments/:id/top rows) already arrive as percent
 * magnitudes (e.g. `-2.33` means -2.33%), unlike `winRate`/`win_rate` which
 * are 0-1 fractions — confirmed against the live API (candidate
 * 9f23edab...: maxDrawdown -2.33392217, matching the task brief's
 * "max drawdown -2.33"). Multiplying by 100 here (like fmtPct does) would
 * misrender -2.33 as -233%.
 */
function fmtPctRaw(n: number): string {
  return `${fmtNum(n)}%`
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { hour12: false })
}

export default function BacktestPage() {
  const { strategies, selected, strategyWeights, validation } = useStrategySelection()
  const {
    experimentId,
    setExperimentId,
    backtestCandidateId,
    setBacktestCandidateId,
    lastConfig,
    setLastConfig,
  } = useExperimentContext()

  // ---- Section 01: config form ----
  const [cfgTf, setCfgTf] = useState<MarketInterval>('5m')
  const [cfgFrom, setCfgFrom] = useState('2026-08-07')
  const [cfgTo, setCfgTo] = useState('2026-08-24')
  // Disabled — see decision 6b in artifacts/decisions.md: no fee/slippage
  // model exists in BacktestingService, so these three fields (like Coin
  // above) are read-only placeholders rather than state that would imply
  // they do something.
  const cfgCapital = '1000'
  const cfgCost = '0.08'
  const cfgSlippage = '5'
  const [cfgTopK, setCfgTopK] = useState('8')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: expStatus, state: pollState, error: pollError } = useExperiment(experimentId)

  const enabledDomains = useMemo(
    () => [...new Set(strategies.filter((s) => selected[s.type]).map((s) => s.domain))],
    [strategies, selected],
  )

  const dateRangeValid = cfgFrom !== '' && cfgTo !== '' && cfgFrom < cfgTo
  const runDisabled = !validation.valid || !dateRangeValid || submitting || pollState === 'polling'
  const runTitle = !validation.valid
    ? validation.reasons.join(' ')
    : !dateRangeValid
      ? 'From date phải nhỏ hơn To date.'
      : pollState === 'polling'
        ? 'Đang chạy một lần search khác — chờ hoàn tất trước khi chạy lại.'
        : 'Chạy Domain-guide Random Search với bộ strategy và config hiện tại'

  const runHintWarn = !validation.valid || experimentId != null
  const runHint = !validation.valid
    ? validation.reasons.join(' ')
    : pollState === 'polling'
      ? 'Đang chạy Search & Backtest…'
      : experimentId
        ? `Chạy lại sẽ xoá toàn bộ Leaderboard hiện tại (Run #${lastConfig?.runSeq ?? 1}) và tạo lại từ đầu với config mới.`
        : 'Sẵn sàng chạy Search & Backtest với bộ strategy và config hiện tại.'

  const runMeta = lastConfig
    ? `Run #${lastConfig.runSeq} · BTCUSDT · ${lastConfig.timeframe} · ${cfgFrom} → ${cfgTo}`
    : 'Chưa chạy lần nào trong phiên này'

  function askRun() {
    if (runDisabled) return
    setSubmitError(null)
    setConfirmOpen(true)
  }

  async function confirmRun() {
    setSubmitting(true)
    setSubmitError(null)
    const body: StartSearchRequest = {
      timeframe: cfgTf,
      startTime: `${cfgFrom}T00:00:00.000Z`,
      endTime: `${cfgTo}T23:59:59.000Z`,
      topK: Number(cfgTopK) || undefined,
      enabledDomains,
      strategyWeights,
    }
    try {
      const res = await apiFetch<StartSearchResponse>('/strategy-search/experiments', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setExperimentId(res.experimentId)
      setBacktestCandidateId(null)
      setLastConfig({
        timeframe: cfgTf,
        startTime: body.startTime,
        endTime: body.endTime,
        topK: Number(cfgTopK) || 10,
        maxCandidates: 100,
        strategyCount: strategyWeights.length,
        totalStrategyCount: strategies.length,
        runSeq: (lastConfig?.runSeq ?? 0) + 1,
      })
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Không chạy được Search & Backtest.')
    } finally {
      setSubmitting(false)
      setConfirmOpen(false)
    }
  }

  // ---- Section 02: candidate detail ----
  const topLimit = lastConfig?.topK ?? 10
  const { rows: topRows, details: topDetails } = useTopCandidates(
    experimentId,
    topLimit,
    expStatus?.completed ?? 0,
  )

  useEffect(() => {
    if (!backtestCandidateId && topRows.length > 0) {
      setBacktestCandidateId(topRows[0].candidate_id)
    }
  }, [topRows, backtestCandidateId, setBacktestCandidateId])

  const [tradePage, setTradePage] = useState(1)
  useEffect(() => {
    setTradePage(1)
  }, [backtestCandidateId])

  const { data: candidate, loading: candidateLoading } = useCandidateDetail(
    backtestCandidateId,
    tradePage,
    TRADE_PAGE_SIZE,
  )

  const [candQuery, setCandQuery] = useState('')
  const [candOpen, setCandOpen] = useState(false)

  const candidateOptions = useMemo(
    () =>
      topRows.map((row) => {
        const detail = topDetails[row.candidate_id]
        return {
          id: row.candidate_id,
          rank: row.rank,
          combo: detail ? detail.members.map((m) => m.type).join(' + ') : '…',
          iteration: detail?.iterationNumber,
        }
      }),
    [topRows, topDetails],
  )
  const candQueryNorm = candQuery.trim().toLowerCase()
  const candResults = candQueryNorm
    ? candidateOptions.filter((o) =>
        `#${o.rank} ${o.combo} iter ${o.iteration ?? ''}`.toLowerCase().includes(candQueryNorm),
      )
    : candidateOptions

  const currentOption = candidateOptions.find((o) => o.id === backtestCandidateId)
  const candCurrentLabel = currentOption
    ? `#${currentOption.rank} · ${currentOption.combo} · Iter ${currentOption.iteration ?? '—'}`
    : candidate
      ? candidate.members.map((m) => m.type).join(' + ')
      : '—'

  const candleHistory = useCandleHistory(lastConfig?.timeframe ?? cfgTf)

  const evaluation = candidate?.evaluation ?? null
  const metrics: { key: string; k: string; v: string; note: string; tone?: 'up' | 'down' }[] = [
    {
      key: 'winrate',
      k: 'Winrate',
      v: evaluation ? fmtPct(evaluation.winRate) : '—',
      note: evaluation ? `${evaluation.numberOfTrades} lệnh` : 'Chưa có kết quả',
      tone: 'up',
    },
    {
      key: 'netprofit',
      k: 'Net Profit',
      v: evaluation ? fmtUsd(evaluation.profitLoss) : '—',
      // Fees/slippage are not modelled anywhere in BacktestingService (see
      // artifacts/decisions.md) — the label used to claim otherwise
      // ("Sau phí và slippage"). This is the raw, frictionless P&L.
      note: 'Chưa tính phí & slippage',
      tone: evaluation ? (evaluation.profitLoss >= 0 ? 'up' : 'down') : undefined,
    },
    {
      key: 'mdd',
      k: 'Max Drawdown',
      v: evaluation ? fmtPctRaw(evaluation.maxDrawdown) : '—',
      note: 'Sụt giảm sâu nhất',
      tone: 'down',
    },
    {
      key: 'trades',
      k: 'Total Trades',
      v: evaluation ? String(evaluation.numberOfTrades) : '—',
      note: 'Trong khoảng đã chọn',
    },
    {
      key: 'pf',
      k: 'Profit Factor',
      v: evaluation ? fmtNum(evaluation.profitFactor) : '—',
      note: 'Gross profit / gross loss',
    },
    {
      key: 'sharpe',
      k: 'Sharpe Ratio',
      v: evaluation ? fmtNum(evaluation.sharpeRatio) : '—',
      note: 'Lợi nhuận điều chỉnh rủi ro',
    },
  ]

  const tradeTotal = candidate?.tradeTotal ?? 0
  const pages = Math.max(1, Math.ceil(tradeTotal / TRADE_PAGE_SIZE))
  const trades = candidate?.trades ?? []

  return (
    <div className="backtest-page">
      <div className="backtest-panel blueprint">
        <BlueprintCorners />
        <div className="backtest-panel-head">
          <div className="backtest-step-label">01</div>
          <h4 style={{ fontSize: 16, margin: 0 }}>Cấu hình backtest &amp; search</h4>
          <div style={{ flex: 1 }} />
          <span className="tag tag-accent">Domain-guide Random Search</span>
        </div>

        <div className="backtest-config-grid">
          <div className="field">
            <label>Coin</label>
            <input className="input" type="text" value="BTCUSDT" readOnly disabled />
          </div>
          <div className="field">
            <label>Timeframe</label>
            <select
              className="input"
              value={cfgTf}
              onChange={(e) => setCfgTf(e.target.value as MarketInterval)}
            >
              {TF_OPTIONS.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>From date</label>
            <input className="input" type="date" value={cfgFrom} onChange={(e) => setCfgFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>To date</label>
            <input className="input" type="date" value={cfgTo} onChange={(e) => setCfgTo(e.target.value)} />
          </div>
          <div className="field">
            <label>Vốn (USD)</label>
            <input className="input" type="text" value={cfgCapital} readOnly disabled />
          </div>
          <div className="field">
            <label>Transaction cost (%)</label>
            <input className="input" type="text" value={cfgCost} readOnly disabled />
          </div>
          <div className="field">
            <label>Slippage (bps)</label>
            <input className="input" type="text" value={cfgSlippage} readOnly disabled />
          </div>
          <div className="field">
            <label>Top-K</label>
            <input className="input" type="text" value={cfgTopK} onChange={(e) => setCfgTopK(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-primary blueprint"
            onClick={askRun}
            disabled={runDisabled}
            title={runTitle}
          >
            <BlueprintCorners />
            Chạy Search &amp; Backtest
          </button>
        </div>
        <p className="text-muted backtest-inert-note">
          Vốn, Transaction cost và Slippage bị vô hiệu hoá: <code>BacktestingService</code> hiện chưa mô hình hoá
          phí/slippage, nên các trường này không thể ảnh hưởng tới kết quả search (xem
          artifacts/decisions.md mục 6b).
        </p>

        <div className="backtest-run-row">
          <span className={`backtest-run-hint${runHintWarn ? ' backtest-run-hint-warn' : ''}`}>{runHint}</span>
          <div style={{ flex: 1 }} />
          <span className="text-muted mono">{runMeta}</span>
        </div>
        {submitError ? (
          <p className="text-muted" style={{ color: 'var(--color-down-text)', fontSize: 12, marginTop: 8 }}>
            Lỗi: {submitError}
          </p>
        ) : null}
        {experimentId ? (
          <p className="text-muted mono" style={{ fontSize: 12, marginTop: 8 }}>
            {pollState === 'polling' &&
              `Đang chạy — status ${expStatus?.status ?? 'PENDING'} · ${expStatus?.completed ?? 0}/${expStatus?.generated ?? 0} candidate hoàn tất${expStatus?.failed ? ` · ${expStatus.failed} lỗi` : ''}`}
            {pollState === 'terminal' &&
              expStatus &&
              `Kết thúc — status ${expStatus.status} · ${expStatus.completed}/${expStatus.generated} candidate hoàn tất${expStatus.failed ? ` · ${expStatus.failed} lỗi` : ''}`}
            {pollState === 'timeout' &&
              'Quá thời gian chờ kết quả (5 phút) — tải lại trang để kiểm tra trạng thái mới nhất.'}
            {pollState === 'error' && `Lỗi khi theo dõi trạng thái: ${pollError}`}
          </p>
        ) : null}
      </div>

      <div className="backtest-panel blueprint">
        <BlueprintCorners />
        <div className="backtest-detail-head">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div className="backtest-step-label">02</div>
            <h4 style={{ fontSize: 16, margin: 0 }}>Chi tiết kết quả backtest của một candidate</h4>
          </div>
          <div style={{ flex: 1 }} />
          <div className="field candidate-picker">
            <label>Candidate — tìm theo tổ hợp hoặc iteration</label>
            <input
              className="input"
              type="text"
              value={candQuery}
              placeholder="Tìm: MA, RSI, iteration…"
              onChange={(e) => {
                setCandQuery(e.target.value)
                setCandOpen(true)
              }}
              onFocus={() => setCandOpen(true)}
              onBlur={() => setTimeout(() => setCandOpen(false), 140)}
            />
            {candOpen ? (
              <div className="candidate-dropdown">
                {candResults.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`candidate-dropdown-item${backtestCandidateId === o.id ? ' candidate-dropdown-item-active' : ''}`}
                    onMouseDown={() => {
                      setBacktestCandidateId(o.id)
                      setCandQuery('')
                      setCandOpen(false)
                    }}
                  >
                    #{o.rank} · {o.combo} — Iter {o.iteration ?? '—'}
                  </button>
                ))}
                {candResults.length === 0 ? (
                  <div className="text-muted candidate-dropdown-empty">Không có tổ hợp nào khớp.</div>
                ) : null}
              </div>
            ) : null}
            <div className="text-muted mono candidate-current">Đang xem: {candCurrentLabel}</div>
          </div>
        </div>

        {!experimentId ? (
          <p className="text-muted">Chưa có Leaderboard nào — chạy Search &amp; Backtest ở mục 01 phía trên trước.</p>
        ) : candidateLoading && !candidate ? (
          <p className="text-muted">Đang tải chi tiết candidate…</p>
        ) : !candidate ? (
          <p className="text-muted">Không có candidate nào để hiển thị.</p>
        ) : (
          <>
            <div className="metric-grid">
              {metrics.map((m) => (
                <div className="metric-cell" key={m.key}>
                  <div className="metric-label">{m.k}</div>
                  <div
                    className="metric-value mono"
                    style={m.tone ? { color: `var(--color-${m.tone}-text)` } : undefined}
                  >
                    {m.v}
                  </div>
                  <div className="text-muted metric-note">{m.note}</div>
                </div>
              ))}
            </div>

            <div className="chart-head">
              <h5 style={{ fontSize: 15, margin: 0 }}>Biểu đồ backtest (BTCUSDT · {lastConfig?.timeframe ?? cfgTf})</h5>
              <div style={{ flex: 1 }} />
              <div className="chart-legend">
                <span style={{ color: 'var(--color-accent-700)' }}>— MA(20)</span>
                <span style={{ color: 'var(--color-accent-500)' }}>— MA(50)</span>
                <span style={{ color: 'var(--color-up-text)' }}>-- Hỗ trợ</span>
                <span style={{ color: 'var(--color-down-text)' }}>-- Kháng cự</span>
              </div>
            </div>
            {candleHistory.loading ? (
              <p className="text-muted">Đang tải dữ liệu nến…</p>
            ) : candleHistory.error ? (
              <p className="text-muted">Lỗi: {candleHistory.error}</p>
            ) : (
              <CandleChart
                candles={candleHistory.candles}
                maPeriod={20}
                maColorVar="--color-accent-700"
                secondaryMaPeriod={50}
                secondaryMaColorVar="--color-accent-500"
                showLevels
                height={280}
              />
            )}

            <div className="trades-head">
              <h5 style={{ fontSize: 15, margin: 0 }}>Danh sách lệnh</h5>
            </div>
            <div className="trades-table-wrap">
              <table className="table trades-table">
                <thead>
                  <tr>
                    <th>Coin</th>
                    <th>Thời gian vào lệnh</th>
                    <th>Hướng</th>
                    <th style={{ textAlign: 'right' }}>Khối lượng (USD)</th>
                    <th style={{ textAlign: 'right' }}>Giá vào lệnh</th>
                    <th style={{ textAlign: 'right' }}>Stoploss</th>
                    <th style={{ textAlign: 'right' }}>TakeProfit</th>
                    <th style={{ textAlign: 'right' }}>Giá kết thúc</th>
                    <th style={{ textAlign: 'right' }}>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-muted table-empty">
                        Không có lệnh nào.
                      </td>
                    </tr>
                  ) : (
                    trades.map((t) => (
                      <tr key={t.id}>
                        <td className="mono">BTCUSDT</td>
                        <td className="mono">{fmtDateTime(t.entryTime)}</td>
                        <td>
                          <span className={t.side === 'LONG' ? 'text-up' : 'text-down'}>{t.side}</span>
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {fmtNum(t.quantity * t.entryPrice)}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtNum(t.entryPrice)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {t.stopLoss != null ? fmtNum(t.stopLoss) : '—'}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {t.takeProfit != null ? fmtNum(t.takeProfit) : '—'}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {t.exitPrice != null ? fmtNum(t.exitPrice) : '—'}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {t.profitLoss != null ? (
                            <span className={t.profitLoss >= 0 ? 'text-up' : 'text-down'}>{fmtUsd(t.profitLoss)}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="trades-pagination">
              <div className="text-muted" style={{ fontSize: 12 }}>
                Hiển thị {tradeTotal === 0 ? 0 : (tradePage - 1) * TRADE_PAGE_SIZE + 1}–
                {Math.min(tradePage * TRADE_PAGE_SIZE, tradeTotal)} của {tradeTotal} lệnh
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip${p === tradePage ? ' chip-on' : ''}`}
                    aria-pressed={p === tradePage}
                    onClick={() => setTradePage(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmRerunDialog
        open={confirmOpen}
        meta={`BTCUSDT · ${cfgTf} · ${cfgFrom} → ${cfgTo} · ${strategyWeights.length} strategy đơn (${strategyWeights
          .map((w) => w.type)
          .join(', ')})`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmRun}
      />
    </div>
  )
}
