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
import type { ExperimentStatusDto, ExtendSearchResponse, StrategySignal } from '../api/types'
import { isAiStrategyType, STOP_REASON_LABEL } from '../api/types'
import { fmtDateVN } from '../lib/datetime'
import { MARKET_SYMBOL } from '../lib/marketScope'

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
  return fmtDateVN(iso)
}

function memberDisplayName(
  type: string,
  catalog: Map<string, { displayName: string }>,
): string {
  if (isAiStrategyType(type)) {
    return catalog.get(type)?.displayName ?? `AI Strategy (${type.slice(3, 11)}…)`
  }
  return catalog.get(type)?.displayName ?? type
}

function memberSourceLabel(type: string): string {
  return isAiStrategyType(type) ? 'AI sinh' : 'Hệ thống'
}

function signalKind(signal: StrategySignal | null): SignalKind {
  if (signal === 'BUY') return 'up'
  if (signal === 'SELL') return 'down'
  return 'neutral'
}

/**
 * Why the Top-K table has no rows.
 *
 * An empty leaderboard used to be a dead end: the table said "no candidate
 * has finished a backtest" no matter whether the run had not started, was
 * still generating, or had produced 100 candidates that all threw. The
 * ranking query no longer filters anything out (see
 * LeaderboardService.rebuildForExperiment), so "empty" now has exactly one
 * meaning — zero COMPLETED backtest runs — and the counters the status
 * endpoint already returns can say which of the three it is.
 */
function emptyLeaderboardReason(status: ExperimentStatusDto | null): string {
  if (!status) return 'Chưa có candidate nào hoàn tất backtest.'
  if (status.status === 'PENDING') return 'Đang chờ worker nhận job…'
  if (status.generated === 0) return 'Đang sinh tổ hợp đầu tiên…'
  if (status.completed === 0 && status.failed > 0) {
    return `${status.failed}/${status.generated} iteration đều lỗi — không tổ hợp nào backtest xong. Kiểm tra log worker.`
  }
  if (status.completed === 0) return `Đang backtest ${status.generated} tổ hợp…`
  return 'Chưa có candidate nào hoàn tất backtest.'
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { strategies } = useStrategySelection()
  const {
    experimentId,
    setBacktestCandidateId,
    lastConfig,
    setLastConfig,
    leaderboardRev,
    myVersionCandidates,
  } = useExperimentContext()

  // Bumped after a successful POST .../extend to restart useExperiment's
  // polling in place (see the hook's `resumeToken` doc) — the experiment
  // flips COMPLETED -> PENDING without experimentId itself changing.
  const [extendResumeToken, setExtendResumeToken] = useState(0)
  const { data: expStatus } = useExperiment(experimentId, extendResumeToken)
  // No explicit row-count control in this UI — let the server decide by
  // omitting `limit` entirely, so it defaults to the experiment's own
  // persisted `topK` (matches leaderboards.top_k / leaderboard_entries)
  // instead of a client-side guess that goes stale across sessions/reloads
  // (lastConfig is in-memory React state, not persisted).
  // `leaderboardRev` folds in out-of-tab changes (ParameterPanel's
  // save-a-version cascade adds regenerated candidates from another tab),
  // so those appear here without a manual reload.
  const { rows, details, loading: topLoading, error: topError } = useTopCandidates(
    experimentId,
    undefined,
    (expStatus?.completed ?? 0) + leaderboardRev * 100000,
  )

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

  const strategyByType = useMemo(() => new Map(strategies.map((s) => [s.type, s])), [strategies])

  const comboName = (candidateId: string): string => {
    const detail = details[candidateId]
    return detail
      ? detail.members.map((m) => memberDisplayName(m.type, strategyByType)).join(' + ')
      : topLoading
        ? '…'
        : '…'
  }

  const selectedRow = rows.find((r) => r.candidate_id === selectedId) ?? null
  const selectedDetail = selectedId ? details[selectedId] : undefined

  /**
   * Combo Version — "instance thứ mấy của cùng một tổ hợp".
   *
   * Two candidates can carry the same name (e.g. MA + BOLLINGER +
   * SUPPORT_RESISTANCE) yet be genuinely different things, because each
   * member is pinned to a specific strategy VERSION. Version 1 might be
   * built from v1/v1/v1 and Version 2 from v10/v1/v1. That distinction is
   * exactly what this column exists to show, and it is derived — never
   * stored — from the member versions the API already returns, matching
   * the approved prototype's own rule:
   *
   *   comboVer = 1 + Σ (version of each member − 1)   [+ combo revision]
   *
   * We compute it as a dense ordinal instead of that raw sum so the
   * numbers stay small and gap-free: within one combo name, every distinct
   * member-version tuple gets the next Version number, ordered by the
   * tuple itself so the labelling is stable no matter what order the
   * leaderboard happens to return rows in.
   *
   * (Previously this column showed the search ITERATION number, which is
   * not a version at all — two identical-looking rows differed only by a
   * number that said nothing about what made them different.)
   */
  const comboVersionByCandidate = useMemo(() => {
    const tupleOf = (candidateId: string): string | null => {
      const detail = details[candidateId]
      if (!detail) return null
      return [...detail.members]
        .sort((a, b) => a.type.localeCompare(b.type))
        .map((m) => `${m.type}@${m.version}`)
        .join('|')
    }

    // comboName -> sorted list of distinct member-version tuples
    const tuplesByName = new Map<string, string[]>()
    for (const row of rows) {
      const detail = details[row.candidate_id]
      const tuple = tupleOf(row.candidate_id)
      if (!detail || !tuple) continue
      const name = [...detail.members].map((m) => m.type).sort().join(' + ')
      const list = tuplesByName.get(name) ?? []
      if (!list.includes(tuple)) list.push(tuple)
      tuplesByName.set(name, list)
    }
    for (const list of tuplesByName.values()) list.sort()

    const out: Record<string, number> = {}
    for (const row of rows) {
      const detail = details[row.candidate_id]
      const tuple = tupleOf(row.candidate_id)
      if (!detail || !tuple) continue
      const name = [...detail.members].map((m) => m.type).sort().join(' + ')
      const index = (tuplesByName.get(name) ?? []).indexOf(tuple)
      if (index >= 0) out[row.candidate_id] = index + 1
    }
    return out
  }, [rows, details])

  const versionLabel = (candidateId: string): string => {
    const version = comboVersionByCandidate[candidateId]
    return version ? `Version ${version}` : '…'
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

  // A run that ends below maxCandidates is almost always one of the
  // brief's own stop conditions firing, not a failure — say which one
  // instead of leaving the user staring at "51 / 100".
  const stopReason = expStatus?.search_config?.stopReason ?? null
  const stopReasonText =
    expStatus?.status === 'COMPLETED' && stopReason ? STOP_REASON_LABEL[stopReason] : null

  const iteration = expStatus?.generated ?? 0
  const maxCandidates = lastConfig?.maxCandidates ?? 100
  const progressPct = maxCandidates > 0 ? Math.min(100, (iteration / maxCandidates) * 100) : 0
  const evaluatedCount = expStatus?.completed ?? 0
  const scopeCount = lastConfig ? `${lastConfig.strategyCount} / ${lastConfig.totalStrategyCount} strategy đơn` : '—'

  const cfgRows: { key: string; k: string; v: string }[] = [
    { key: 'scope', k: 'Strategy được Search', v: scopeCount },
    { key: 'coin', k: 'Coin', v: MARKET_SYMBOL },
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
                ? `Run #${lastConfig.runSeq} · ${MARKET_SYMBOL} · ${lastConfig.timeframe} · ${rows.length} tổ hợp`
                : 'Chưa có Leaderboard nào trong phiên này'}
            </span>
          </div>
          {!experimentId ? (
            <p className="text-muted leaderboard-empty">
              Chưa có Leaderboard nào — chạy Search &amp; Backtest ở tab Backtest trước.
            </p>
          ) : topError ? (
            <p className="text-muted leaderboard-empty">Lỗi tải leaderboard: {topError}</p>
          ) : topLoading && rows.length === 0 ? (
            <p className="text-muted leaderboard-empty">Đang tải Top-K…</p>
          ) : (
            <>
              {expStatus?.failed ? (
                <p className="text-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                  {expStatus.failed} iteration lỗi trong lần chạy này — bảng chỉ hiện candidate backtest
                  thành công.
                </p>
              ) : null}
              <p className="text-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                Chọn một dòng để xem chi tiết từng strategy thành phần trong version của tổ hợp đó.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 52 }}>Rank</th>
                    <th>Tổ hợp</th>
                    <th style={{ width: 96 }}>Version</th>
                    <th style={{ textAlign: 'right' }}>Overall Score</th>
                    <th style={{ textAlign: 'right' }}>Profit (USD)</th>
                    <th style={{ textAlign: 'right' }}>Winrate</th>
                    <th style={{ textAlign: 'right' }}>Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-muted table-empty">
                        {emptyLeaderboardReason(expStatus)}
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
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                          {fmtNum(Number(r.overall_score))}
                        </td>
                        <td className="mono text-up" style={{ textAlign: 'right' }}>
                          {fmtUsd(Number(r.profit_loss))}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {fmtPct(Number(r.win_rate))}
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

        {experimentId && myVersionCandidates.length > 0 ? (
          <div className="leaderboard-panel blueprint">
            <BlueprintCorners />
            <div className="leaderboard-panel-head">
              <h4 style={{ fontSize: 16, margin: 0 }}>Version của tôi</h4>
              <div style={{ flex: 1 }} />
              <span className="text-muted mono" style={{ fontSize: 12 }}>
                Sinh lại từ tham số bạn vừa lưu
              </span>
            </div>
            <p className="text-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
              Các tổ hợp được sinh lại theo version tham số bạn tự chỉnh, kèm thứ hạng thật so với
              TOÀN BỘ candidate của lần chạy này — hiển thị kể cả khi chưa lọt Top-{lastConfig?.topK ?? 10}.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>Hạng</th>
                  <th>Tổ hợp</th>
                  <th style={{ textAlign: 'right' }}>Overall Score</th>
                  <th style={{ textAlign: 'right' }}>Profit (USD)</th>
                  <th style={{ textAlign: 'right' }}>Winrate</th>
                  <th style={{ textAlign: 'right' }}>Trades</th>
                  <th style={{ width: 150 }} />
                </tr>
              </thead>
              <tbody>
                {myVersionCandidates.map((row) => (
                  <tr key={row.candidateId}>
                    <td className="mono">
                      #{row.rank}
                      <span className="text-muted"> / {row.total}</span>
                    </td>
                    <td className="mono" style={{ fontSize: 13 }}>
                      {row.combo}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {row.overallScore == null ? '—' : fmtNum(row.overallScore)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {row.profitLoss == null ? '—' : fmtUsd(row.profitLoss)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {row.winRate == null ? '—' : fmtPct(row.winRate)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {row.numberOfTrades}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-go"
                        style={{ height: 28, fontSize: 12 }}
                        onClick={() => {
                          setBacktestCandidateId(row.candidateId)
                          navigate('/app/backtest')
                        }}
                      >
                        Xem kết quả →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {experimentId ? (
          <div className="leaderboard-panel blueprint">
            <BlueprintCorners />
            <div className="leaderboard-panel-head" style={{ marginBottom: 4 }}>
              <h4 style={{ fontSize: 16, margin: 0 }}>
                Thành phần của {selectedId ? comboName(selectedId) : '—'}
              </h4>
              {selectedId ? <span className="tag tag-accent mono">{versionLabel(selectedId)}</span> : null}
              <div style={{ flex: 1 }} />
              {/* The primary action of this panel — coloured, not another
                  grey secondary button lost among the rest. */}
              <button
                type="button"
                className="btn btn-go"
                style={{ height: 34 }}
                disabled={!selectedId}
                onClick={() => {
                  if (!selectedId) return
                  setBacktestCandidateId(selectedId)
                  navigate('/app/backtest')
                }}
              >
                Xem kết quả backtest →
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
            {selectedDetail ? (
              <p className="text-muted" style={{ fontSize: 11, margin: '0 0 8px' }}>
                Version = bản ghi plugin được gắn cho candidate này lúc search sinh ra nó. Tham số là
                giá trị search thật sự thử trên candidate này (Domain-guided Random Search tự chọn
                trong không gian tham số) — không nhất thiết trùng với tham số mặc định lưu sẵn trong
                version đó.
              </p>
            ) : null}
            <table className="table">
              <thead>
                <tr>
                  <th>Strategy đơn</th>
                  <th style={{ width: 120 }}>Nguồn</th>
                  <th style={{ width: 92 }}>Version</th>
                  <th>Tham số candidate này dùng</th>
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
                    const sig = perStrategySignalOf(m.type)
                    return (
                      <tr key={m.type}>
                        <td style={{ fontWeight: 500 }}>{memberDisplayName(m.type, strategyByType)}</td>
                        <td>
                          <span className={`tag${isAiStrategyType(m.type) ? ' tag-accent' : ' tag-neutral'}`}>
                            {memberSourceLabel(m.type)}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: 13 }}>
                          {/* The version pinned to THIS candidate at generation time —
                              never the live catalog's version, which can have moved on
                              since (a bug: this cell used to show catalog?.version,
                              silently relabeling every old candidate as "using" whatever
                              version is newest right now). */}
                          v{m.version}
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
          {stopReasonText && (
            <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0', lineHeight: 1.5 }}>
              {stopReasonText}
            </p>
          )}
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
