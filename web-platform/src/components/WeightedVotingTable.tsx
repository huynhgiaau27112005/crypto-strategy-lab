import BlueprintCorners from './BlueprintCorners'
import DataTable, { type DataTableColumn } from './DataTable'
import Panel from './Panel'
import SignalBadge, { type SignalKind } from './SignalBadge'
import type { PerStrategySignal, StrategyCatalogItem, StrategySignal } from '../api/types'

/**
 * Weighted-vote entry threshold used by the Strategy Engine's own
 * composite signal (`RealtimeSignalService`, `buyThreshold = 0.3`,
 * `sellThreshold = -0.3`) — see artifacts/api-contract.md §3b. Displayed
 * here as the documented constant behind the formula caption; never
 * recomputed client-side.
 */
const SIGNAL_THRESHOLD = 0.3

function signalKind(signal: StrategySignal | null): SignalKind {
  if (signal === 'BUY') return 'up'
  if (signal === 'SELL') return 'down'
  return 'neutral'
}

interface VotingRow {
  strategy: StrategyCatalogItem
}

export interface WeightedVotingTableProps {
  /** Only the strategies currently checked into Search (the table only lists what's in scope). */
  selectedStrategies: StrategyCatalogItem[]
  weights: Record<string, number>
  onWeightChange: (type: string, weight: number) => void
  perStrategySignal: PerStrategySignal[]
  signalLoading: boolean
  signalError: string | null
  valid: boolean
  reasons: string[]
  confirmed: boolean
  onConfirm: () => void
}

/**
 * Ports the prototype's "Weighted voting — tín hiệu tổng hợp" table
 * verbatim (Strategy / Trọng số / Giá trị / Tín hiệu + formula caption).
 * Every signal cell renders the Strategy Engine's own per-strategy signal
 * (`GET /strategy-engine/signal`'s `perStrategy`) — nothing is derived
 * here from price or from the edited weights; the weighted composite score
 * itself is Strategy Engine business logic this component never computes.
 */
export default function WeightedVotingTable({
  selectedStrategies,
  weights,
  onWeightChange,
  perStrategySignal,
  signalLoading,
  signalError,
  valid,
  reasons,
  confirmed,
  onConfirm,
}: WeightedVotingTableProps) {
  const columns: DataTableColumn<VotingRow>[] = [
    {
      key: 'name',
      label: 'Strategy',
      render: (row) => <strong>{row.strategy.displayName}</strong>,
    },
    {
      key: 'weight',
      label: 'Trọng số',
      render: (row) => (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={weights[row.strategy.type] ?? 0}
          onChange={(e) => onWeightChange(row.strategy.type, Number(e.target.value))}
          className="range"
          aria-label={`Trọng số ${row.strategy.displayName}`}
        />
      ),
    },
    {
      key: 'value',
      label: 'Giá trị',
      align: 'right',
      render: (row) => <span className="mono">{(weights[row.strategy.type] ?? 0).toFixed(2)}</span>,
    },
    {
      key: 'signal',
      label: 'Tín hiệu',
      align: 'right',
      render: (row) => {
        const perSig = perStrategySignal.find((p) => p.type === row.strategy.type)?.signal ?? null
        // Never default to BUY/SELL while unavailable — a guessed fallback
        // is the same anti-pattern in a quieter form.
        const label = perSig ? perSig : signalLoading ? '···' : signalError ? '—' : '—'
        return <SignalBadge label={label} kind={signalKind(perSig)} />
      },
    },
  ]

  const rows: VotingRow[] = selectedStrategies.map((strategy) => ({ strategy }))

  return (
    <Panel className="voting-panel">
      <h4 style={{ fontSize: 16, margin: '0 0 2px' }}>Weighted voting — tín hiệu tổng hợp</h4>
      <p className="text-muted strategy-formula">
        Điểm tổng hợp = Σ (trọng số × tín hiệu) / Σ trọng số. Ngưỡng vào lệnh: |score| ≥{' '}
        {SIGNAL_THRESHOLD.toFixed(2)}.
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.strategy.type}
        emptyLabel="Chưa chọn strategy nào — tick vào nhóm bên trái để thêm vào bảng này."
      />

      <div className="strategy-save-row">
        <div className="strategy-save-status">
          {!valid ? (
            <ul className="strategy-reasons">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : confirmed ? (
            <div className="text-muted" style={{ fontSize: 12 }}>
              Đã lưu — tab Backtest sẽ dùng bộ strategy và trọng số này.
            </div>
          ) : (
            <div className="text-muted" style={{ fontSize: 12 }}>
              Bộ strategy hợp lệ. Bấm lưu để tab Backtest dùng bộ này.
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary blueprint"
          style={{ height: 38 }}
          disabled={!valid}
          title={!valid ? reasons.join(' ') : undefined}
          onClick={onConfirm}
        >
          <BlueprintCorners />
          Lưu bộ strategy &amp; trọng số
        </button>
      </div>
    </Panel>
  )
}
