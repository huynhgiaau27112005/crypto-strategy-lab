import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

type SearchStatus = {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  search_algorithm: string
  generated: number
  completed: number
  failed: number
  running: number
  best_score: string | null
  current_candidate: string | null
  stop_reason: string | null
  error_message: string | null
}

type TopCandidate = {
  rank: number
  experiment_strategy_id: string
  name: string
  version: number
  total_return: string
  win_rate: string
  max_drawdown: string
  number_of_trades: number
  overall_score: string
}

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function SearchPage() {
  const now = new Date()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const [timeframe, setTimeframe] = useState('5m')
  const [startTime, setStartTime] = useState(localDateTime(monthAgo))
  const [endTime, setEndTime] = useState(localDateTime(now))
  const [maxCandidates, setMaxCandidates] = useState(100)
  const [minimumTrades, setMinimumTrades] = useState(20)
  const [experimentId, setExperimentId] = useState<string | null>(localStorage.getItem('searchExperimentId'))
  const [status, setStatus] = useState<SearchStatus | null>(null)
  const [top, setTop] = useState<TopCandidate[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message ?? response.statusText)
    }
    return response.json() as Promise<T>
  }, [])

  const refresh = useCallback(async (id: string) => {
    const [nextStatus, nextTop] = await Promise.all([
      request<SearchStatus>(`/strategy-search/experiments/${id}`),
      request<TopCandidate[]>(`/strategy-search/experiments/${id}/top?limit=10`),
    ])
    setStatus(nextStatus)
    setTop(nextTop)
    return nextStatus
  }, [request])

  useEffect(() => {
    if (!experimentId) return
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const next = await refresh(experimentId)
        setError('')
        if (!stopped && (next.status === 'PENDING' || next.status === 'RUNNING')) {
          timer = window.setTimeout(poll, 1500)
        }
      } catch (caught) {
        if (!stopped) setError(caught instanceof Error ? caught.message : String(caught))
      }
    }
    void poll()
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
    }
  }, [experimentId, refresh])

  async function start(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await request<{ experimentId: string; status: string }>('/strategy-search/experiments', {
        method: 'POST',
        body: JSON.stringify({
          timeframe,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          maxCandidates,
          minimumTrades,
          maxDurationSeconds: 3600,
          maxNoImprovement: 50,
          topK: 10,
        }),
      })
      localStorage.setItem('searchExperimentId', result.experimentId)
      setStatus(null)
      setTop([])
      setExperimentId(result.experimentId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function cancel() {
    if (!experimentId) return
    try {
      await request(`/strategy-search/experiments/${experimentId}/cancel`, { method: 'POST' })
      await refresh(experimentId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const active = status?.status === 'PENDING' || status?.status === 'RUNNING'

  return (
    <main className="search-page">
      <div className="page-heading">
        <div>
          <h1>Domain-Guided Random Search</h1>
          <p>Mỗi candidate kết hợp các domain khác nhau rồi được backtest, đánh giá và xếp hạng.</p>
        </div>
        {status && <span className={`status-badge status-${status.status.toLowerCase()}`}>{status.status}</span>}
      </div>

      <form className="search-form panel" onSubmit={start}>
        <label>Timeframe
          <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
            {['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>Bắt đầu
          <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
        </label>
        <label>Kết thúc
          <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
        </label>
        <label>Số candidate
          <input type="number" min="1" max="10000" value={maxCandidates} onChange={(event) => setMaxCandidates(Number(event.target.value))} />
        </label>
        <label>Giao dịch tối thiểu
          <input type="number" min="0" max="10000" value={minimumTrades} onChange={(event) => setMinimumTrades(Number(event.target.value))} />
        </label>
        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={submitting || active}>{submitting ? 'Đang tạo…' : 'Start search'}</button>
          <button className="secondary-button" type="button" onClick={cancel} disabled={!active}>Stop</button>
        </div>
      </form>

      {error && <div className="error-banner">{error}</div>}
      <section className="search-stats">
        <article className="panel"><span>Đã sinh</span><strong>{status?.generated ?? 0}</strong></article>
        <article className="panel"><span>Hoàn thành</span><strong>{status?.completed ?? 0}</strong></article>
        <article className="panel"><span>Thất bại</span><strong>{status?.failed ?? 0}</strong></article>
        <article className="panel"><span>Best score</span><strong>{status?.best_score ? Number(status.best_score).toFixed(2) : '—'}</strong></article>
      </section>

      {status && (
        <section className="panel current-candidate">
          <span>Candidate hiện tại</span>
          <strong>{status.current_candidate ?? (active ? 'Đang tạo candidate…' : 'Không có')}</strong>
          <small>Algorithm: {status.search_algorithm} · Stop reason: {status.stop_reason ?? '—'}</small>
          {status.error_message && <small className="danger-text">{status.error_message}</small>}
        </section>
      )}

      <section className="panel results-panel">
        <div className="results-heading"><h2>Top-K của experiment</h2><span>{top.length} kết quả hợp lệ</span></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>#</th><th>Strategy</th><th>Score</th><th>Return</th><th>Win rate</th><th>MDD</th><th>Trades</th></tr></thead>
            <tbody>
              {top.map((item) => (
                <tr key={item.experiment_strategy_id}>
                  <td>{item.rank}</td><td>{item.name} <small>v{item.version}</small></td>
                  <td>{Number(item.overall_score).toFixed(2)}</td><td>{Number(item.total_return).toFixed(2)}%</td>
                  <td>{(Number(item.win_rate) * 100).toFixed(1)}%</td><td>{Number(item.max_drawdown).toFixed(2)}%</td><td>{item.number_of_trades}</td>
                </tr>
              ))}
              {top.length === 0 && <tr><td colSpan={7} className="empty-row">Chưa có candidate đạt số giao dịch tối thiểu.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
