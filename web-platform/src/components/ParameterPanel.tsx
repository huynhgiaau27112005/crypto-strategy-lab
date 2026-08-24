import BlueprintCorners from './BlueprintCorners'
import Panel from './Panel'
import type { StrategyCatalogItem } from '../api/types'

/**
 * Renders one plugin's `parameterSchema` (from `GET
 * /strategy-plugin/strategies`) as read-only fields — the schema's own
 * min/max/step/default, nothing computed here.
 *
 * The prototype's version controls (`Lưu tham số → tạo version mới`,
 * `Đang xem version cũ (chỉ đọc)`, `Dùng lại tham số version này`) have no
 * backing endpoint in this plan's scope: there is no version-history API,
 * only a single current `version` number per plugin. Wiring an editable
 * form with a save button that silently does nothing would be worse than
 * showing the defaults as inert — so every field and the save button are
 * rendered disabled, with an inline note explaining why.
 */
export default function ParameterPanel({ strategy }: { strategy: StrategyCatalogItem | null }) {
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

  const versionLabel = strategy.version != null ? `Version ${strategy.version}` : 'Chưa có version lưu'

  return (
    <Panel className="parameter-panel">
      <div className="kicker">Tham số plugin</div>
      <h4 className="parameter-panel-title">{strategy.displayName}</h4>
      <div className="text-muted mono parameter-panel-meta">
        {strategy.type} · {strategy.domain} · {versionLabel}
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>Version tham số</label>
        <select className="input" value={versionLabel} disabled title="Version tham số chưa có lịch sử — chỉ có giá trị mặc định hiện tại.">
          <option>{versionLabel}</option>
        </select>
      </div>

      <div className="parameter-fields">
        {strategy.parameterSchema.map((p) => (
          <div className="field" key={p.key}>
            <label>{p.label}</label>
            <input
              className="input"
              type="number"
              value={p.default}
              min={p.min}
              max={p.max}
              step={p.step}
              disabled
              readOnly
            />
            <span className="text-muted parameter-range">
              {p.min}–{p.max}, bước {p.step} (mặc định plugin)
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block blueprint"
        style={{ height: 38, marginTop: 12 }}
        disabled
        title="Quản lý version tham số chưa được nối API — nút này chưa hoạt động."
      >
        <BlueprintCorners />
        Lưu tham số → tạo version mới
      </button>
      <p className="text-muted parameter-note">
        Phiên bản tham số (lưu / xem lại theo version) chưa có API trong phạm vi hiện tại — các giá
        trị trên đây luôn là mặc định của plugin, chưa thể chỉnh sửa.
      </p>
    </Panel>
  )
}
