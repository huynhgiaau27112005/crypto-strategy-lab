import { useEffect, useMemo, useState } from 'react'
import BlueprintCorners from './BlueprintCorners'
import Panel from './Panel'
import { useStrategyVersions } from '../hooks/useStrategyVersions'
import { apiFetch, ApiError } from '../api/client'
import { useExperimentContext } from '../state/ExperimentContext'
import type {
  ParameterSpec,
  RegenerateForStrategyResponse,
  StrategyCatalogItem,
  StrategyVersionSummary,
} from '../api/types'
import { isAiStrategyType } from '../api/types'

function defaultValues(schema: ParameterSpec[]): Record<string, number> {
  const values: Record<string, number> = {}
  for (const p of schema) values[p.key] = p.default
  return values
}

/** Client-side mirror of the backend's authoritative check (StrategyPluginService.validateParameters) — UX only, never trusted on its own. */
function validate(schema: ParameterSpec[], values: Record<string, number>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const spec of schema) {
    const value = values[spec.key]
    if (value === undefined || Number.isNaN(value)) {
      errors[spec.key] = 'Bắt buộc.'
      continue
    }
    if (spec.type === 'int' && !Number.isInteger(value)) {
      errors[spec.key] = 'Phải là số nguyên.'
      continue
    }
    if (value < spec.min || value > spec.max) {
      errors[spec.key] = `Phải trong khoảng ${spec.min}–${spec.max}.`
      continue
    }
    if (spec.step > 0) {
      const steps = (value - spec.min) / spec.step
      if (Math.abs(steps - Math.round(steps)) > 1e-9) {
        errors[spec.key] = `Phải là bội số của bước ${spec.step} tính từ ${spec.min}.`
      }
    }
  }
  return errors
}

export default function ParameterPanel({ strategy }: { strategy: StrategyCatalogItem | null }) {
  const { versions, loading, error, saving, saveError, saveVersion } = useStrategyVersions(strategy?.type ?? null)
  const { experimentId, bumpLeaderboard, setMyVersionCandidates } = useExperimentContext()
  const [cascading, setCascading] = useState(false)

  // The version currently shown in the picker — defaults to the latest
  // (highest-version) row once versions load. `null` = nothing loaded yet /
  // no persisted version, in which case the form falls back to plugin defaults.
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, number>>({})
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

  const latest = versions.length > 0 ? versions[versions.length - 1] : null
  const selectedVersion = versions.find((v) => v.strategyId === selectedVersionId) ?? latest

  // When the focused strategy changes (or its versions finish loading),
  // reset to viewing+editing the latest version.
  useEffect(() => {
    setSavedNotice(null)
    if (!strategy) {
      setSelectedVersionId(null)
      setFormValues({})
      return
    }
    if (latest) {
      setSelectedVersionId(latest.strategyId)
      setFormValues(
        Object.keys(latest.parameters).length > 0
          ? { ...defaultValues(strategy.parameterSchema), ...latest.parameters }
          : defaultValues(strategy.parameterSchema),
      )
    } else if (!loading) {
      setSelectedVersionId(null)
      setFormValues(defaultValues(strategy.parameterSchema))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy?.type, latest?.strategyId, loading])

  const isViewingOld = !!selectedVersion && selectedVersion.strategyId !== latest?.strategyId
  const fieldErrors = useMemo(
    () => (strategy ? validate(strategy.parameterSchema, formValues) : {}),
    [strategy, formValues],
  )
  const hasErrors = Object.keys(fieldErrors).length > 0

  function selectVersion(id: string) {
    const v = versions.find((x) => x.strategyId === id)
    if (!v || !strategy) return
    setSelectedVersionId(id)
    setSavedNotice(null)
    if (v.strategyId === latest?.strategyId) {
      // Selecting the latest version re-enters edit mode without discarding
      // in-progress edits already sitting in the form.
      return
    }
  }


  async function handleSave() {
    if (!strategy || hasErrors) return
    setSavedNotice(null)
    let created: StrategyVersionSummary
    try {
      created = await saveVersion(formValues)
    } catch {
      // saveError from the hook already carries the message; nothing more to do here.
      return
    }
    setSelectedVersionId(created.strategyId)

    // Second half of the approved prototype's `saveParams`: regenerate every
    // combination on the current experiment's Leaderboard that contains this
    // strategy, onto the version just saved. Skipped (with an explicit note)
    // when no experiment is open — there is no Leaderboard to cascade into
    // yet, and the saved version still applies to the next Search.
    if (!experimentId) {
      setSavedNotice(
        `Đã lưu version ${created.version}. Chưa có experiment nào đang mở nên chưa sinh lại tổ hợp — ` +
          'version này sẽ được dùng khi bạn chạy Search & Backtest ở tab Backtest.',
      )
      return
    }

    setCascading(true)
    try {
      const res = await apiFetch<RegenerateForStrategyResponse>(
        `/strategy-search/experiments/${experimentId}/regenerate`,
        { method: 'POST', body: JSON.stringify({ strategyName: strategy.type }) },
      )
      bumpLeaderboard()
      // Hand the placements to the Leaderboard tab so the regenerated
      // combinations stay visible even when they score outside Top-K.
      setMyVersionCandidates(res.summaries ?? [])
      const placements = (res.summaries ?? [])
        .map((sum) => `#${sum.rank}/${sum.total}`)
        .join(', ')
      setSavedNotice(
        res.regenerated > 0
          ? `Đã lưu version ${created.version}. Hệ thống sinh lại ${res.regenerated} tổ hợp có chứa ` +
            `${strategy.displayName}${placements ? ` (hạng ${placements})` : ''}. ` +
            'Xem mục "Version của tôi" ở tab Leaderboard — kể cả khi chưa lọt Top-K.'
          : `Đã lưu version ${created.version}. Không có tổ hợp nào trên Leaderboard chứa ` +
            `${strategy.displayName} để sinh lại.`,
      )
    } catch (err) {
      setSavedNotice(
        `Đã lưu version ${created.version}, nhưng sinh lại tổ hợp thất bại: ` +
          (err instanceof ApiError || err instanceof Error ? err.message : 'lỗi không xác định') +
          '.',
      )
    } finally {
      setCascading(false)
    }
  }

  if (!strategy) {
    return (
      <Panel className="parameter-panel">
        <div className="kicker">Tham số plugin</div>
        <p className="text-muted parameter-panel-empty">
          Chọn một strategy ở danh sách bên trái để xem tham số.
        </p>
      </Panel>
    )
  }

  // An AI-generated strategy has no numeric parameter space or version
  // history through this panel — it is Python source code, versioned via
  // the AI Strategy tab's own save flow, not through
  // StrategyPluginService.saveVersion(). Show a simplified, read-only
  // summary instead of the built-in version picker/save form.
  if (isAiStrategyType(strategy.type)) {
    return (
      <Panel className="parameter-panel">
        <div className="kicker">Tham số plugin</div>
        <h4 className="parameter-panel-title">{strategy.displayName}</h4>
        <div className="text-muted mono parameter-panel-meta">
          {strategy.type} · {strategy.domain}
          {strategy.version != null ? ` · v${strategy.version}` : ''}
        </div>
        <p className="text-muted parameter-note" style={{ marginTop: 12 }}>
          Strategy do AI sinh — không có tham số số học để chỉnh ở đây. Chỉnh sửa code và lưu version mới
          ở tab AI Strategy.
        </p>
      </Panel>
    )
  }

  const displayValues = isViewingOld && selectedVersion ? selectedVersion.parameters : formValues

  return (
    <Panel className="parameter-panel">
      <div className="kicker">Tham số plugin</div>
      <h4 className="parameter-panel-title">{strategy.displayName}</h4>
      <div className="text-muted mono parameter-panel-meta">
        {strategy.type} · {strategy.domain}
        {selectedVersion ? ` · v${selectedVersion.version}${selectedVersion.isMine ? '' : ' (hệ thống)'}` : ' · chưa có version'}
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>Version tham số</label>
        <select
          className="input"
          value={selectedVersionId ?? ''}
          disabled={loading || versions.length === 0}
          onChange={(e) => selectVersion(e.target.value)}
        >
          {versions.length === 0 && <option value="">Chưa có version</option>}
          {versions.map((v) => (
            <option key={v.strategyId} value={v.strategyId}>
              v{v.version}
              {v.strategyId === latest?.strategyId ? ' (mới nhất)' : ''}
              {v.type === 'SYSTEM' ? ' · hệ thống' : ''}
            </option>
          ))}
        </select>
        {error && <span className="text-muted parameter-range">Lỗi tải version: {error}</span>}
      </div>

      {isViewingOld && (
        <p className="text-muted parameter-note" style={{ marginBottom: 8 }}>
          Đang xem version cũ (chỉ đọc).
        </p>
      )}

      <div className="parameter-fields">
        {strategy.parameterSchema.map((p) => (
          <div className="field" key={p.key}>
            <label>{p.label}</label>
            <input
              className="input"
              type="number"
              value={displayValues[p.key] ?? p.default}
              min={p.min}
              max={p.max}
              step={p.step}
              disabled={isViewingOld}
              readOnly={isViewingOld}
              onChange={(e) =>
                setFormValues((prev) => ({ ...prev, [p.key]: e.target.value === '' ? NaN : Number(e.target.value) }))
              }
            />
            <span className="text-muted parameter-range">
              {p.min}–{p.max}, bước {p.step}
              {!isViewingOld && fieldErrors[p.key] ? ` — ${fieldErrors[p.key]}` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* No "Dùng lại tham số version này" button: every saved version is
          already an input to Search on its own (see
          StrategyRepository.listSelectableVersions), so copying an old
          version's numbers forward would only mint a duplicate version of
          something Search can already reach. Old versions stay viewable,
          read-only, for traceability. */}
      {isViewingOld && selectedVersion ? (
        <p className="text-muted parameter-note" style={{ marginTop: 12 }}>
          Version này đã nằm sẵn trong không gian tìm kiếm — Search tự thử nó cùng mọi version khác.
        </p>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block blueprint"
          style={{ height: 38, marginTop: 12 }}
          disabled={hasErrors || saving || cascading}
          onClick={handleSave}
        >
          <BlueprintCorners />
          {saving
            ? 'Đang lưu…'
            : cascading
              ? 'Đang sinh lại tổ hợp…'
              : 'Lưu tham số → tạo version mới'}
        </button>
      )}

      {savedNotice && <p className="text-muted parameter-note">{savedNotice}</p>}
      {saveError && <p className="text-muted parameter-note">Lỗi: {saveError}</p>}
      <p className="text-muted parameter-note">
        Lưu tạo một version mới (không ghi đè version cũ) — các tổ hợp đã có trên Leaderboard vẫn giữ
        nguyên version cũ chúng đã chạy. Version mới này chỉ được đưa vào Search ở lần chạy tiếp theo
        (tab Backtest), lúc đó nó mới được thử, backtest và so sánh lại để có thể lên Leaderboard.
      </p>
    </Panel>
  )
}
