import { useEffect, useMemo, useState } from 'react'
import BlueprintCorners from './BlueprintCorners'
import Panel from './Panel'
import { useStrategyVersions } from '../hooks/useStrategyVersions'
import type { ParameterSpec, StrategyCatalogItem, StrategyVersionSummary } from '../api/types'
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

  function reuseVersion(v: StrategyVersionSummary) {
    if (!strategy) return
    setFormValues({ ...defaultValues(strategy.parameterSchema), ...v.parameters })
    setSelectedVersionId(latest?.strategyId ?? null)
    setSavedNotice(null)
  }

  async function handleSave() {
    if (!strategy || hasErrors) return
    setSavedNotice(null)
    try {
      const created = await saveVersion(formValues)
      setSelectedVersionId(created.strategyId)
      setSavedNotice(`Đã lưu version ${created.version}.`)
    } catch {
      // saveError from the hook already carries the message; nothing more to do here.
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

      {isViewingOld && selectedVersion ? (
        <button
          type="button"
          className="btn btn-secondary btn-block"
          style={{ height: 38, marginTop: 12 }}
          onClick={() => reuseVersion(selectedVersion)}
        >
          Dùng lại tham số version này
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block blueprint"
          style={{ height: 38, marginTop: 12 }}
          disabled={hasErrors || saving}
          onClick={handleSave}
        >
          <BlueprintCorners />
          {saving ? 'Đang lưu…' : 'Lưu tham số → tạo version mới'}
        </button>
      )}

      {savedNotice && <p className="text-muted parameter-note">{savedNotice}</p>}
      {saveError && <p className="text-muted parameter-note">Lỗi: {saveError}</p>}
      <p className="text-muted parameter-note">
        Lưu tạo một version mới (không ghi đè version cũ) — chỉ áp dụng cho strategy đơn này; không
        tự sinh lại các tổ hợp trong Leaderboard đang tham chiếu strategy này.
      </p>
    </Panel>
  )
}
