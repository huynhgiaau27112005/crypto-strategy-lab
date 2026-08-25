import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, ApiError } from '../api/client'
import BlueprintCorners from '../components/BlueprintCorners'
import SignalBadge, { type SignalKind } from '../components/SignalBadge'
import { useExperiment } from '../hooks/useExperiment'
import { useStrategySignal } from '../hooks/useStrategySignal'
import { useTopCandidates } from '../hooks/useTopCandidates'
import { useExperimentContext } from '../state/ExperimentContext'
import { useStrategySelection } from '../state/StrategySelectionContext'
import type { ExtendSearchResponse, StrategySignal } from '../api/types'

/** Fixed count the "Chạy thêm 10 iteration" button always requests — matches the approved UI's fixed label. */
const EXTEND_ITERATIONS = 10

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
/** `win_rate` is a 0-1 fraction (multiply by 100); `max_drawdown` already
 * arrives as a percent magnitude — see the matching note in BacktestPage.tsx. */
function fmtPctRaw(n: number): string {
  return `${fmtNum(n)}%`
}
function fmtDate(iso: string): string {
  return iso.slice(0, 10)
}

function signalKind(signal: StrategySignal | null): SignalKind {
  if (signal === 'BUY') return 'up'
  if (signal === 'SELL') return 'down'
  return 'neutral'
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { strategies } = useStrategySelection()
  const { experimentId, setBacktestCandidateId, lastConfig, setLastConfig } = useExperimentContext()

  // Bumped after a successful POST .../extend to restart useExperiment's
  // polling in place (see the hook's `resumeToken` doc) — the experiment
  // flips COMPLETED -> PENDING without experimentId itself changing.
  const [extendResumeToken, setExtendResumeToken] = useState(0)
  const { data: expStatus } = useExperiment(experimentId, extendResumeToken)
  const topLimit = lastConfig?.topK ?? 10
  const { rows, details } = useTopCandidates(experimentId, topLimit, expStatus?.completed ?? 0)

  const [extending, setExtending] = useState(false)
  const [extendError, setExtendError] = useState<string | null>(null)
  // True from the click through to the extended run reaching a terminal
  // status again — covers both the in-flight POST and the background
  // search loop it kicks off, so a second click can't fire a second
  // request while the first extension is still running.
  const isRunning = expStatus?.status === 'PENDING' || expStatus?.status === 'RUNNING'
  const extendDisabled = !experimentId || extending || isRunning

  async function handleExtend() {
    if (!experimentId || extending || isRunning) return
    setExtending(true)
    setExtendError(null)
    try {
      await apiFetch<ExtendSearchResponse>(
        `/strategy-search/experiments/${experimentId}/extend`,
        { method: 'POST', body: JSON.stringify({ iterations: EXTEND_ITERATIONS }) },
      )
      setExtendResumeToken((n) => n + 1)
      // Keep the "/ N iteration" progress display's denominator in sync
      // with the backend's raised experiment_configs.iteration_limit —
      // otherwise the progress bar clips at 100% and the counter reads
      // e.g. "105 / 100" once the extension starts producing candidates.
      if (lastConfig) {
        setLastConfig({ ...lastConfig, maxCandidates: lastConfig.maxCandidates + EXTEND_ITERATIONS })
      }
    } catch (err) {
      setExtendError(err instanceof ApiError ? err.message : 'Không chạy thêm được iteration.')
    } finally {
      setExtending(false)
    }
  }

  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedId && rows.length > 0) {
      setSelectedId(rows[0].candidate_id)
    }
  }, [rows, selectedId])

  const comboName = (candidateId: string): string => {
    const detail = details[candidateId]
    return detail ? detail.members.map((m) => m.type).join(' + ') : '…'
  }

  const selectedRow = rows.find((r) => r.candidate_id === selectedId) ?? null
  const selectedDetail = selectedId ? details[selectedId] : undefined

  // No per-candidate "combo version" concept exists in the real API (a
  // candidate has no version field of its own — only its member strategies'
  // global plugin version does, via GET /strategy-plugin/strategies). The
  // real, stable per-candidate identifier the backend does expose is its
  // search iteration number (candidates/:id -> iterationNumber), already
  // used the same way by the Backtest tab's candidate picker — reused here
  // instead of inventing a "vN.0" combo-version label.
  const versionLabel = (candidateId: string): string => {
    const detail = details[candidateId]
    return detail ? `Iter ${detail.iterationNumber}` : '…'
  }

  // The candidate's specific parameter version has no per-member signal
  // endpoint. The closest real data is the live composite signal per
  // strategy type (GET /strategy-engine/signal), the same source the
  // Strategy Engine tab renders — computed at the plugin's current default
  // parameters, not necessarily the exact parameters this candidate ran
  // with. Real backend-computed signal, just not candidate-pinned.
  const { data: liveSignal } = useStrategySignal(lastConfig?.timeframe ?? '5m')
  const perStrategySignalOf = (type: string): StrategySignal | null =>
    liveSignal?.perStrategy.find((p) => p.type === type)?.signal ?? null

  const strategyByType = useMemo(() => new Map(strategies.map((s) => [s.type, s])), [strategies])

  const iteration = expStatus?.generated ?? 0
  const maxCandidates = lastConfig?.maxCandidates ?? 100
  const progressPct = maxCandidates > 0 ? Math.min(100, (iteration / maxCandidates) * 100) : 0
  const evaluatedCount = expStatus?.completed ?? 0
  const scopeCount = lastConfig ? `${lastConfig.strategyCount} / ${lastConfig.totalStrategyCount} strategy đơn` : '—'

  const cfgRows: { key: string; k: string; v: string }[] = [
    { key: 'scope', k: 'Strategy được Search', v: scopeCount },
    { key: 'coin', k: 'Coin', v: 'BTCUSDT' },
    { key: 'tf', k: 'Timeframe', v: lastConfig?.timeframe ?? '—' },
    {
      key: 'range',
      k: 'Khoảng ngày',
      v: lastConfig ? `${fmtDate(lastConfig.startTime)} → ${fmtDate(lastConfig.endTime)}` : '—',
    },
    { key: 'topk', k: 'Top-K', v: lastConfig ? String(lastConfig.topK) : '—' },
    { key: 'run', k: 'Run', v: lastConfig ? `#${lastConfig.runSeq}` : '—' },
  ]

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-main">
        <div className="leaderboard-panel blueprint">
          <BlueprintCorners />
          <div className="leaderboard-panel-head">
            <h4 style={{ fontSize: 16, margin: 0 }}>Top-K tổ hợp strategy</h4>
            <div style={{ flex: 1 }} />
            <span className="text-muted mono" style={{ fontSize: 12 }}>
              {lastConfig
                ? `Run #${lastConfig.runSeq} · BTCUSDT · ${lastConfig.timeframe} · ${rows.length} tổ hợp`
                : 'Chưa có Leaderboard nào trong phiên này'}
            </span>
          </div>
          {!experimentId ? (
            <p className="text-muted leaderboard-empty">
              Chưa có Leaderboard nào — chạy Search &amp; Backtest ở tab Backtest trước.
            </p>
          ) : (
            <>
              <p className="text-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                Chọn một dòng để xem chi tiết từng strategy thành phần trong version của tổ hợp đó.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 52 }}>Rank</th>
                    <th>Tổ hợp</th>
                    <th style={{ width: 96 }}>Version</th>
                    <th style={{ textAlign: 'right' }}>Profit (USD)</th>
                    <th style={{ textAlign: 'right' }}>Winrate</th>
                    <th style={{ textAlign: 'right' }}>Max DD</th>
                    <th style={{ textAlign: 'right' }}>Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-muted table-empty">
                        Chưa có candidate nào hoàn tất backtest.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr
                        key={r.candidate_id}
                        className={`leaderboard-row${selectedId === r.candidate_id ? ' leaderboard-row-active' : ''}`}
                        onClick={() => setSelectedId(r.candidate_id)}
                      >
                        <td className="mono">{r.rank}</td>
                        <td className="mono" style={{ fontSize: 13 }}>
                          {comboName(r.candidate_id)}
                        </td>
                        <td>
                          <span className="tag tag-outline mono">{versionLabel(r.candidate_id)}</span>
                        </td>
                        <td className="mono text-up" style={{ textAlign: 'right' }}>
                          {fmtUsd(Number(r.profit_loss))}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {fmtPct(Number(r.win_rate))}
                        </td>
                        <td className="mono text-down" style={{ textAlign: 'right' }}>
                          {fmtPctRaw(Number(r.max_drawdown))}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {r.number_of_trades}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>

        {experimentId ? (
          <div className="leaderboard-panel blueprint">
            <BlueprintCorners />
            <div className="leaderboard-panel-head" style={{ marginBottom: 4 }}>
              <h4 style={{ fontSize: 16, margin: 0 }}>
                Thành phần của {selectedId ? comboName(selectedId) : '—'}
              </h4>
              {selectedId ? <span className="tag tag-accent mono">{versionLabel(selectedId)}</span> : null}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: 34 }}
                disabled={!selectedId}
                onClick={() => {
                  if (!selectedId) return
                  setBacktestCandidateId(selectedId)
                  navigate('/app/backtest')
                }}
              >
                Xem kết quả backtest
              </button>
            </div>
            <p className="text-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
              {selectedRow && selectedDetail
                ? `Rank #${selectedRow.rank} · ${selectedRow.number_of_trades} lệnh · winrate ${fmtPct(
                    Number(selectedRow.win_rate),
                  )} · MDD ${fmtPctRaw(Number(selectedRow.max_drawdown))} · profit ${fmtUsd(
                    Number(selectedRow.profit_loss),
                  )}`
                : 'Chọn một tổ hợp ở bảng phía trên.'}
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Strategy đơn</th>
                  <th style={{ width: 120 }}>Nguồn</th>
                  <th style={{ width: 92 }}>Version</th>
                  <th>Tham số của version này</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Trọng số</th>
                  <th style={{ width: 86, textAlign: 'right' }}>Tín hiệu</th>
                </tr>
              </thead>
              <tbody>
                {!selectedDetail ? (
                  <tr>
                    <td colSpan={6} className="text-muted table-empty">
                      Đang tải chi tiết tổ hợp…
                    </td>
                  </tr>
                ) : (
                  selectedDetail.members.map((m) => {
                    const catalog = strategyByType.get(m.type)
                    const sig = perStrategySignalOf(m.type)
                    return (
                      <tr key={m.type}>
                        <td style={{ fontWeight: 500 }}>{catalog?.displayName ?? m.type}</td>
                        <td>
                          <span className="tag tag-neutral">Hệ thống</span>
                        </td>
                        <td className="mono" style={{ fontSize: 13 }}>
                          {catalog?.version != null ? `v${catalog.version}` : '—'}
                        </td>
                        <td className="text-muted mono" style={{ fontSize: 12 }}>
                          {Object.entries(m.parameters)
                            .map(([k, v]) => `${k} ${v}`)
                            .join(' · ')}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {fmtNum(m.weight, 2)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <SignalBadge label={sig ?? '—'} kind={signalKind(sig)} />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="leaderboard-side">
        <div className="algo-panel blueprint">
          <BlueprintCorners />
          <div className="algo-kicker">Thuật toán</div>
          <h4 className="algo-title">Domain-guide Random Search</h4>
          <p className="text-muted algo-desc">
            Sinh tổ hợp ngẫu nhiên trong không gian bị ràng buộc bởi kiến thức miền, sau đó backtest
            và xếp hạng. Đây là thuật toán search duy nhất của hệ thống.
          </p>
          <div className="algo-iteration">
            <span className="algo-iteration-value">{iteration}</span>
            <span className="text-muted" style={{ fontSize: 13 }}>
              / {maxCandidates} iteration
            </span>
          </div>
          <div className="algo-progress-track">
            <div className="algo-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="algo-stats">
            <div className="algo-stat-row">
              <span className="text-muted">Strategy đầu vào</span>
              <span className="mono">{scopeCount}</span>
            </div>
            <div className="algo-stat-row">
              <span className="text-muted">Tổ hợp đã đánh giá</span>
              <span className="mono">{evaluatedCount}</span>
            </div>
            <div className="algo-stat-row">
              <span className="text-muted">Vòng lặp</span>
              <span className="mono">generate → backtest → rank</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block blueprint"
            style={{ height: 36, marginTop: 12 }}
            disabled={extendDisabled}
            onClick={handleExtend}
            title={
              !experimentId
                ? 'Chưa có experiment nào để chạy thêm iteration.'
                : isRunning
                  ? 'Đang chạy iteration, vui lòng đợi.'
                  : `Chạy thêm ${EXTEND_ITERATIONS} iteration cho experiment hiện tại, dùng lại config đã lưu.`
            }
          >
            <BlueprintCorners />
            {extending || isRunning ? 'Đang chạy thêm iteration…' : `Chạy thêm ${EXTEND_ITERATIONS} iteration`}
          </button>
          {extendError ? (
            <p className="text-down" style={{ fontSize: 11, margin: '8px 0 0', lineHeight: 1.5 }}>
              {extendError}
            </p>
          ) : (
            <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0', lineHeight: 1.5 }}>
              Tiếp tục search trên experiment hiện tại, dùng lại đúng config đã lưu (timeframe, khoảng
              ngày, trọng số) — candidate mới được cộng vào leaderboard hiện có, không tạo experiment
              mới.
            </p>
          )}
        </div>

        <div className="config-panel blueprint">
          <BlueprintCorners />
          <h4 style={{ fontSize: 16, margin: '0 0 8px' }}>Config đang áp dụng</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            {cfgRows.map((r) => (
              <div className="config-row" key={r.key}>
                <span className="text-muted">{r.k}</span>
                <span className="mono">{r.v}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ height: 34, marginTop: 12 }}
            onClick={() => navigate('/app/backtest')}
          >
            Đổi config &amp; tạo lại
          </button>
        </div>
      </div>
    </div>
  )
}
