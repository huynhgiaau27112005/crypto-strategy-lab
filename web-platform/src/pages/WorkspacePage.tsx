import { useAuth } from '../auth/AuthContext'

/**
 * Placeholder for the authenticated workspace behind <RequireAuth>. The
 * real TradingView-style workspace (chart, strategy panels, search,
 * leaderboard, news) is a later task — this only proves the auth-gated
 * route and the logout round-trip work end to end.
 */
export default function WorkspacePage() {
  const { user, logout } = useAuth()

  return (
    <div className="app-placeholder">
      <div>
        <h1>Workspace</h1>
        <p className="text-muted">
          Đã đăng nhập với {user?.email ?? 'người dùng'}. Workspace thật (chart, strategy,
          search, leaderboard, news) sẽ được xây ở bước tiếp theo.
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
          Đăng xuất
        </button>
      </div>
    </div>
  )
}
