import BlueprintCorners from './BlueprintCorners'

/**
 * Ports the approved prototype's rerun-confirmation dialog verbatim
 * (docs/ui-prototype/.../Crypto Strategy Lab.dc.html, `confirmOpen` block)
 * — same warning copy, same two actions. Shown when the Backtest tab's
 * "Chạy Search & Backtest" button is pressed, before the actual
 * `POST /strategy-search/experiments` call fires.
 */
export default function ConfirmRerunDialog({
  open,
  meta,
  onCancel,
  onConfirm,
}: {
  open: boolean
  /** One-line summary of what will run (coin · timeframe · date range · strategy set) — shown under the warning. */
  meta: string
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null

  return (
    <div className="dialog-backdrop">
      <div className="dialog blueprint">
        <BlueprintCorners />
        <h4 className="dialog-title">Chạy lại Backtest &amp; Search?</h4>
        <p className="dialog-body">
          Hệ thống sẽ <strong>xoá toàn bộ Leaderboard hiện tại</strong> và sinh lại tổ hợp từ đầu với
          config mới bằng Domain-guide Random Search.
        </p>
        <div className="text-muted mono dialog-meta">{meta}</div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ height: 38 }}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary blueprint" onClick={onConfirm} style={{ height: 38 }}>
            <BlueprintCorners />
            Xoá &amp; chạy lại
          </button>
        </div>
      </div>
    </div>
  )
}
