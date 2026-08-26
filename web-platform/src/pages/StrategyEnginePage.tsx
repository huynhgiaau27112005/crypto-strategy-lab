import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ParameterPanel from '../components/ParameterPanel'
import Panel from '../components/Panel'
import SignalBadge, { type SignalKind } from '../components/SignalBadge'
import WeightedVotingTable from '../components/WeightedVotingTable'
import { useStrategySignal } from '../hooks/useStrategySignal'
import { useStrategySelection } from '../state/StrategySelectionContext'
import type { SearchStrategyType, StrategyCatalogItem, StrategySignal } from '../api/types'
import { isAiStrategyType } from '../api/types'

/** Reference interval for this tab's live signal read — matches the
 * approved prototype's "Tín hiệu trên chart (BTCUSDT · 15m)" heading for
 * the Strategy Engine tab. */
const SIGNAL_INTERVAL = '15m'

function signalKind(signal: StrategySignal | null): SignalKind {
  if (signal === 'BUY') return 'up'
  if (signal === 'SELL') return 'down'
  return 'neutral'
}

function StrategyRow({
  strategy,
  checked,
  focused,
  onToggle,
  onSelect,
  signal,
  signalLoading,
  signalError,
}: {
  strategy: StrategyCatalogItem
  checked: boolean
  focused: boolean
  onToggle: () => void
  onSelect: () => void
  signal: StrategySignal | null
  signalLoading: boolean
  signalError: string | null
}) {
  const label = signal ? signal : signalLoading ? '···' : signalError ? '—' : '—'
  const versionText =
    strategy.version != null ? `${strategy.type} · v${strategy.version}` : `${strategy.type} · chưa có bản ghi trong DB`

  return (
    <div
      className={`strategy-row${checked ? ' strategy-row-on' : ''}${focused ? ' strategy-row-focus' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      <label
        className="radio radio-square"
        style={{ alignItems: 'flex-start', gap: 0, marginTop: 2 }}
        title="Đưa vào Search"
        onClick={(e) => e.stopPropagation()}
      >
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="dot" />
      </label>
      <div className="strategy-row-btn">
        <span className="strategy-row-head">
          <strong className="strategy-name">{strategy.displayName}</strong>
          <SignalBadge label={label} kind={signalKind(signal)} />
        </span>
        <span className="text-muted strategy-desc">{strategy.description}</span>
        <span className="text-muted mono strategy-version">{versionText}</span>
      </div>
      <button
        type="button"
        className="strategy-row-detail-btn"
        title="Xem tham số"
        aria-label="Xem tham số"
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        ⚙
      </button>
    </div>
  )
}

export default function StrategyEnginePage() {
  const navigate = useNavigate()
  const {
    strategies,
    loading,
    error,
    selected,
    weights,
    toggleSelected,
    setWeight,
    validation,
    confirmed,
    confirmSelection,
  } = useStrategySelection()
  const { data: signal, loading: signalLoading, error: signalError } = useStrategySignal(SIGNAL_INTERVAL)
  const [detailType, setDetailType] = useState<SearchStrategyType | null>(null)

  const detailStrategy = strategies.find((s) => s.type === detailType) ?? strategies[0] ?? null
  const selectedStrategies = strategies.filter((s) => selected[s.type])
  const systemStrategies = strategies.filter((s) => !isAiStrategyType(s.type))
  const aiStrategies = strategies.filter((s) => isAiStrategyType(s.type))

  const perStrategySignalOf = (type: SearchStrategyType) =>
    signal?.perStrategy.find((p) => p.type === type)?.signal ?? null

  return (
    <div className="strategy-page">
      <div className="strategy-groups">
        <Panel>
          <div className="kicker">Strategy đơn · nhóm 1</div>
          <h4 style={{ fontSize: 17, margin: '4px 0 2px' }}>Strategy hệ thống</h4>
          <p className="text-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
            Bấm vào thẻ để check/uncheck đưa strategy vào Search; bấm ⚙ để xem tham số.
          </p>
          {loading ? (
            <p className="text-muted">Đang tải danh sách strategy…</p>
          ) : error ? (
            <p className="text-muted">Lỗi: {error}</p>
          ) : systemStrategies.length === 0 ? (
            <p className="text-muted">Chưa có strategy hệ thống nào.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {systemStrategies.map((s) => (
                <StrategyRow
                  key={s.type}
                  strategy={s}
                  checked={!!selected[s.type]}
                  focused={detailStrategy?.type === s.type}
                  onToggle={() => toggleSelected(s.type)}
                  onSelect={() => setDetailType(s.type)}
                  signal={perStrategySignalOf(s.type)}
                  signalLoading={signalLoading}
                  signalError={signalError}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <div className="kicker">Strategy đơn · nhóm 2</div>
          <h4 style={{ fontSize: 17, margin: '4px 0 2px' }}>Strategy do AI generate</h4>
          <p className="text-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
            Sinh từ prompt của tài khoản này ở tab AI Strategy.
          </p>
          {loading ? (
            <p className="text-muted">Đang tải danh sách strategy…</p>
          ) : error ? (
            <p className="text-muted">Lỗi: {error}</p>
          ) : aiStrategies.length === 0 ? (
            <p className="text-muted">Chưa có strategy nào do AI sinh ra cho tài khoản này.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aiStrategies.map((s) => (
                <StrategyRow
                  key={s.type}
                  strategy={s}
                  checked={!!selected[s.type]}
                  focused={detailStrategy?.type === s.type}
                  onToggle={() => toggleSelected(s.type)}
                  onSelect={() => setDetailType(s.type)}
                  signal={perStrategySignalOf(s.type)}
                  signalLoading={signalLoading}
                  signalError={signalError}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ height: 34, marginTop: 10 }}
            onClick={() => navigate('/app/ai')}
          >
            Tạo strategy mới bằng AI
          </button>
        </Panel>
      </div>

      <div className="strategy-main">
        <WeightedVotingTable
          selectedStrategies={selectedStrategies}
          weights={weights}
          onWeightChange={(type, weight) => setWeight(type as SearchStrategyType, weight)}
          perStrategySignal={signal?.perStrategy ?? []}
          signalLoading={signalLoading}
          signalError={signalError}
          valid={validation.valid}
          reasons={validation.reasons}
          confirmed={confirmed}
          onConfirm={confirmSelection}
        />
      </div>

      <div className="strategy-detail">
        <ParameterPanel strategy={detailStrategy} />
        <button type="button" className="btn btn-secondary" style={{ height: 38 }} onClick={() => navigate('/app/backtest')}>
          Sang tab Backtest →
        </button>
      </div>
    </div>
  )
}
