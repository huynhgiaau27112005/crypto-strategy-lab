import { useLocation } from 'react-router-dom'
import Panel from '../components/Panel'
import { PAGE_META, routeIdFromPath } from '../workspace/navConfig'

/**
 * Task scope for this pass covers only the Realtime tab's real content —
 * the other five nav items (Strategy Engine, AI Strategy, Backtest,
 * Leaderboard, News & Sentiment) render this instead of faked data, so the
 * gap is visible rather than hidden behind mock content.
 */
export default function PlaceholderPage() {
  const location = useLocation()
  const routeId = routeIdFromPath(location.pathname)
  const meta = PAGE_META[routeId]

  return (
    <Panel title={meta.title} className="tab-placeholder">
      <p className="text-muted">
        Tab này chưa được xây dựng trong workspace. Nội dung thật (dữ liệu, tương tác) sẽ được bổ
        sung ở một bước triển khai sau — đây hiện chỉ là placeholder giữ đúng cấu trúc điều hướng đã
        duyệt.
      </p>
    </Panel>
  )
}
