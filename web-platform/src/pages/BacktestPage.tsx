import { useEffect, useMemo, useState } from 'react'
import BlueprintCorners from '../components/BlueprintCorners'
import CandleChart, { type PriceMarker } from '../components/CandleChart'
import ConfirmRerunDialog from '../components/ConfirmRerunDialog'
import { apiFetch, ApiError } from '../api/client'
import { useCandidateDetail } from '../hooks/useCandidateDetail'
import { useCandleHistory } from '../hooks/useCandleHistory'
import { useExperiment } from '../hooks/useExperiment'
import { useTopCandidates } from '../hooks/useTopCandidates'
import { useExperimentContext } from '../state/ExperimentContext'
import { useStrategySelection } from '../state/StrategySelectionContext'
import type { MarketInterval, StartSearchRequest, StartSearchResponse, TradeDto } from '../api/types'
import { fmtDateTimeVN, vietnamDateRangeToIso } from '../lib/datetime'
import { MARKET_SYMBOL } from '../lib/marketScope'

const TF_OPTIONS: MarketInterval[] = ['1m', '5m', '15m', '1h', '4h']
const TRADE_PAGE_SIZE = 8
/** Mirrors the backend's own cap (MAX_TOP_K in strategy-search.service.ts). */
const MIN_TOP_K = 1
const MAX_TOP_K = 20

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
  return fmtDateTimeVN(iso)
}

/** Parses a numeric input; returns null when blank or not a finite number. */
function parseNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Vietnamese label for a trade's exit reason. */
const EXIT_REASON_LABEL: Record<string, string> = {
  SIGNAL: 'Tín hiệu',
  STOP_LOSS: 'Stop Loss',
  TAKE_PROFIT: 'Take Profit',
  END_OF_BACKTEST: 'Hết kỳ',
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
    backtestForm,
    setBacktestForm,
  } = useExperimentContext()

  // ---- Section 01: config form ----
  // Every field lives in ExperimentContext, not local state: leaving the
  // tab and coming back used to reset the whole form to its defaults.
  const form = backtestForm
  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setBacktestForm((prev) => ({ ...prev, [key]: value }))

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: expStatus, state: pollState, error: pollError } = useExperiment(experimentId)

  const enabledDomains = useMemo(
    () => [...new Set(strategies.filter((s) => selected[s.type]).map((s) => s.domain))],
    [strategies, selected],
  )

  const capital = parseNumber(form.capital)
  const cost = parseNumber(form.transactionCostPct)
  const slippage = parseNumber(form.slippageBps)
  const stopLoss = parseNumber(form.stopLossPct)
  const takeProfit = parseNumber(form.takeProfitPct)
  const topK = parseNumber(form.topK)

  // Client-side mirror of the backend's own bounds — the request is
  // validated there too, this just refuses to send an obviously bad one.
  const fieldIssues: string[] = []
  if (capital == null || capital <= 0) fieldIssues.push('Vốn phải là số dương.')
  if (cost == null || cost < 0 || cost > 10) fieldIssues.push('Transaction cost phải trong khoảng 0–10%.')
  if (slippage == null || slippage < 0 || slippage > 1000)
    fieldIssues.push('Slippage phải trong khoảng 0–1000 bps.')
  if (form.stopLossPct.trim() !== '' && (stopLoss == null || stopLoss <= 0 || stopLoss > 100))
    fieldIssues.push('Stop Loss phải trong khoảng 0–100% (để trống = tắt).')
  if (form.takeProfitPct.trim() !== '' && (takeProfit == null || takeProfit <= 0 || takeProfit > 1000))
    fieldIssues.push('Take Profit phải trong khoảng 0–1000% (để trống = tắt).')
  if (topK == null || !Number.isInteger(topK) || topK < MIN_TOP_K || topK > MAX_TOP_K)
    fieldIssues.push(`Top-K phải là số nguyên từ ${MIN_TOP_K} đến ${MAX_TOP_K}.`)

  const dateRangeValid = form.fromDate !== '' && form.toDate !== '' && form.fromDate < form.toDate
  const runDisabled =
    !validation.valid ||
    !dateRangeValid ||
    fieldIssues.length > 0 ||
    submitting ||
    pollState === 'polling'
  const runTitle = !validation.valid
    ? validation.reasons.join(' ')
    : !dateRangeValid
      ? 'From date phải nhỏ hơn To date.'
      : fieldIssues.length > 0
        ? fieldIssues.join(' ')
        : pollState === 'polling'
          ? 'Đang chạy một lần search khác — chờ hoàn tất trước khi chạy lại.'
          : 'Chạy Domain-guide Random Search với bộ strategy và config hiện tại'

  const runHintWarn = !validation.valid || fieldIssues.length > 0 || experimentId != null
  const runHint = !validation.valid
    ? validation.reasons.join(' ')
    : fieldIssues.length > 0
      ? fieldIssues.join(' ')
      : pollState === 'polling'
        ? 'Đang chạy Search & Backtest…'
        : experimentId
          ? `Chạy lại sẽ xoá toàn bộ Leaderboard hiện tại (Run #${lastConfig?.runSeq ?? 1}) và tạo lại từ đầu với config mới.`
          : 'Sẵn sàng chạy Search & Backtest với bộ strategy và config hiện tại.'

  const runMeta = lastConfig
    ? `Run #${lastConfig.runSeq} · ${MARKET_SYMBOL} · ${lastConfig.timeframe} · ${form.fromDate} → ${form.toDate}`
    : 'Chưa chạy lần nào trong phiên này'

  function askRun() {
    if (runDisabled) return
    setSubmitError(null)
    setConfirmOpen(true)
  }

  async function confirmRun() {
    setSubmitting(true)
    setSubmitError(null)
    const range = vietnamDateRangeToIso(form.fromDate, form.toDate)
    const body: StartSearchRequest = {
      timeframe: form.timeframe,
      startTime: range.startTime,
      endTime: range.endTime,
      topK: topK ?? undefined,
      initialCapital: capital ?? undefined,
      transactionCostPct: cost ?? undefined,
      slippageBps: slippage ?? undefined,
      stopLossPct: stopLoss,
      takeProfitPct: takeProfit,
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
        timeframe: form.timeframe,
        startTime: body.startTime,
        endTime: body.endTime,
        topK: topK ?? 10,
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

  const currentOption = candidateOptions.find((o) => o.id === backtestCandidateId)
  const candCurrentLabel = currentOption
    ? `#${currentOption.rank} · ${currentOption.combo}`
    : candidate
      ? candidate.members.map((m) => m.type).join(' + ')
      : '—'

  // The chart shows the window the run was actually configured over, not
  // "the latest 300 candles" — otherwise the trades listed below could
  // fall entirely outside the visible series.
  const candleHistory = useCandleHistory(
    lastConfig?.timeframe ?? form.timeframe,
    lastConfig?.startTime,
    lastConfig?.endTime,
  )

  const evaluation = candidate?.evaluation ?? null
  const trades: TradeDto[] = candidate?.trades ?? []

  // Entry / Stop Loss / Take Profit levels of the trade being inspected.
  // Taken from the persisted trade rows — nothing is recomputed here.
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  useEffect(() => {
    setSelectedTradeId(null)
  }, [backtestCandidateId, tradePage])
  const selectedTrade = trades.find((t) => t.id === selectedTradeId) ?? trades[0] ?? null

  const chartMarkers = useMemo<PriceMarker[]>(() => {
    if (!selectedTrade) return []
    const entryLabel = selectedTrade.side === 'LONG' ? 'LONG ENTRY' : 'SHORT ENTRY'
    const out: PriceMarker[] = [
      { price: selectedTrade.entryPrice, label: entryLabel, tone: 'neutral' },
    ]
    if (selectedTrade.stopLoss != null) {
      out.push({ price: selectedTrade.stopLoss, label: 'Stop Loss', tone: 'down' })
    }
    if (selectedTrade.takeProfit != null) {
      out.push({ price: selectedTrade.takeProfit, label: 'Take Profit', tone: 'up' })
    }
    return out
  }, [selectedTrade])

  const chartTimeMarkers = useMemo(
    () =>
      trades.map((t) => ({
        time: t.entryTime,
        label: t.side === 'LONG' ? 'LONG ENTRY' : 'SHORT ENTRY',
        side: t.side,
      })),
    [trades],
  )

  const resultStatusMessage = useMemo(() => {
    if (!experimentId || pollState === 'polling') return null
    if (topRows.length > 0) return null
    if (expStatus?.failed && expStatus.failed > 0) {
      return `Search đã chạy nhưng ${expStatus.failed} iteration lỗi — không có candidate hoàn tất đủ điều kiện để xem. Kiểm tra log worker hoặc thử khoảng ngày/timeframe khác.`
    }
    if (pollState === 'terminal' && expStatus?.completed === 0) {
      return 'Không có candidate backtest thành công. Thường do thiếu nến lịch sử (warmup) hoặc khoảng ngày quá ngắn — hãy mở rộng khoảng thời gian hoặc chọn timeframe nhỏ hơn.'
    }
    return null
  }, [experimentId, pollState, topRows.length, expStatus])

  const hasProtectiveLevels = trades.some((t) => t.stopLoss != null || t.takeProfit != null)

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
      note: 'Đã trừ phí & slippage theo config',
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
            <input className="input" type="text" value={MARKET_SYMBOL} readOnly disabled />
          </div>
          <div className="field">
            <label>Timeframe</label>
            <select
              className="input"
              value={form.timeframe}
              onChange={(e) => setField('timeframe', e.target.value as MarketInterval)}
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
            <input
              className="input"
              type="date"
              value={form.fromDate}
              onChange={(e) => setField('fromDate', e.target.value)}
            />
          </div>
          <div className="field">
            <label>To date</label>
            <input
              className="input"
              type="date"
              value={form.toDate}
              onChange={(e) => setField('toDate', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Vốn (USD)</label>
            <input
              className="input"
              type="number"
              min={1}
              step={100}
              value={form.capital}
              onChange={(e) => setField('capital', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Transaction cost (%)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={10}
              step={0.01}
              value={form.transactionCostPct}
              onChange={(e) => setField('transactionCostPct', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Slippage (bps)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={1000}
              step={1}
              value={form.slippageBps}
              onChange={(e) => setField('slippageBps', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Stop Loss (%)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="tắt"
              value={form.stopLossPct}
              onChange={(e) => setField('stopLossPct', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Take Profit (%)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={1000}
              step={0.1}
              placeholder="tắt"
              value={form.takeProfitPct}
              onChange={(e) => setField('takeProfitPct', e.target.value)}
            />
          </div>
          <div className="field">
            <label>
              Top-K ({MIN_TOP_K}–{MAX_TOP_K})
            </label>
            <input
              className="input"
              type="number"
              min={MIN_TOP_K}
              max={MAX_TOP_K}
              step={1}
              value={form.topK}
              onChange={(e) => setField('topK', e.target.value)}
            />
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
          Vốn, phí giao dịch và slippage được áp dụng thật trong mô phỏng (mỗi chiều mua/bán). Stop
          Loss / Take Profit để trống nghĩa là tắt — khi bật, lệnh sẽ thoát ngay trong nến chạm mức
          đó (ưu tiên Stop Loss nếu một nến chạm cả hai).
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
        </div>

        {/* The candidate being inspected is the heading of this section, not
            a small caption under a search box: it is the single most
            important piece of context for everything below it. */}
        <div className="candidate-heading">
          <span className="candidate-heading-label">Candidate đang xem</span>
          <button
            type="button"
            className="candidate-heading-btn"
            disabled={candidateOptions.length === 0}
            aria-expanded={candOpen}
            onClick={() => setCandOpen((v) => !v)}
          >
            <span className="candidate-heading-name mono">{candCurrentLabel}</span>
            <span className="candidate-heading-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {candOpen ? (
            <div className="candidate-dropdown">
              {candidateOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`candidate-dropdown-item${backtestCandidateId === o.id ? ' candidate-dropdown-item-active' : ''}`}
                  onClick={() => {
                    setBacktestCandidateId(o.id)
                    setCandOpen(false)
                  }}
                >
                  #{o.rank} · {o.combo} — Iter {o.iteration ?? '—'}
                </button>
              ))}
              {candidateOptions.length === 0 ? (
                <div className="text-muted candidate-dropdown-empty">Chưa có candidate nào.</div>
              ) : null}
            </div>
          ) : null}
        </div>

        {!experimentId ? (
          <p className="text-muted">Chưa có Leaderboard nào — chạy Search &amp; Backtest ở mục 01 phía trên trước.</p>
        ) : resultStatusMessage ? (
          <p className="text-muted backtest-run-hint-warn" style={{ fontSize: 13 }}>{resultStatusMessage}</p>
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
              <h5 style={{ fontSize: 15, margin: 0 }}>
                Biểu đồ backtest ({MARKET_SYMBOL} · {lastConfig?.timeframe ?? form.timeframe}
                {lastConfig ? ` · ${lastConfig.startTime.slice(0, 10)} → ${lastConfig.endTime.slice(0, 10)}` : ''})
              </h5>
              <div style={{ flex: 1 }} />
              <div className="chart-legend">
                <span style={{ color: 'var(--color-accent-700)' }}>— MA(20)</span>
                <span style={{ color: 'var(--color-accent-500)' }}>— MA(50)</span>
                <span style={{ color: 'var(--color-up-text)' }}>-- Hỗ trợ / Take Profit</span>
                <span style={{ color: 'var(--color-down-text)' }}>-- Kháng cự / Stop Loss</span>
              </div>
            </div>
            {candleHistory.loading ? (
              <p className="text-muted">Đang tải dữ liệu nến…</p>
            ) : candleHistory.error ? (
              <p className="text-muted">Lỗi: {candleHistory.error}</p>
            ) : (
              <>
                <CandleChart
                  candles={candleHistory.candles}
                  maOverlays={[
                    { period: 20, colorVar: '--color-accent-700' },
                    { period: 50, colorVar: '--color-accent-500' },
                  ]}
                  showLevels
                  markers={chartMarkers}
                  timeMarkers={chartTimeMarkers}
                  height={280}
                />
                <p className="text-muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
                  {selectedTrade
                    ? `Đang đánh dấu lệnh vào lúc ${fmtDateTime(selectedTrade.entryTime)} — Entry ${fmtNum(
                        selectedTrade.entryPrice,
                      )}${selectedTrade.stopLoss != null ? ` · SL ${fmtNum(selectedTrade.stopLoss)}` : ''}${
                        selectedTrade.takeProfit != null ? ` · TP ${fmtNum(selectedTrade.takeProfit)}` : ''
                      }. Bấm một dòng trong bảng bên dưới để đổi lệnh được đánh dấu.`
                    : 'Chưa có lệnh nào để đánh dấu trên biểu đồ.'}
                  {!hasProtectiveLevels && trades.length > 0
                    ? ' Run này chạy với Stop Loss / Take Profit tắt nên chỉ có điểm Entry.'
                    : ''}
                </p>
              </>
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
                    <th>Lý do thoát</th>
                    <th style={{ textAlign: 'right' }}>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-muted table-empty">
                        Không có lệnh nào.
                      </td>
                    </tr>
                  ) : (
                    trades.map((t) => (
                      <tr
                        key={t.id}
                        className={`trade-row${selectedTrade?.id === t.id ? ' trade-row-active' : ''}`}
                        onClick={() => setSelectedTradeId(t.id)}
                      >
                        <td className="mono">{MARKET_SYMBOL}</td>
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
                        <td className="text-muted">
                          {t.exitReason ? (EXIT_REASON_LABEL[t.exitReason] ?? t.exitReason) : '—'}
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
        meta={`${MARKET_SYMBOL} · ${form.timeframe} · ${form.fromDate} → ${form.toDate} · vốn ${form.capital} USD · phí ${form.transactionCostPct}% · slippage ${form.slippageBps} bps · ${strategyWeights.length} strategy đơn (${strategyWeights
          .map((w) => w.type)
          .join(', ')})`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmRun}
      />
    </div>
  )
}
