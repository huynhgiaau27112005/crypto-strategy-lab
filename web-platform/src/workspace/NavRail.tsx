import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { NAV_ITEMS } from './navConfig'

/**
 * The backend has no GET /auth/me and the access token carries only
 * `{ sub, email }` (see api/types.ts `User`) — there is no `displayName`
 * to read. Deriving a readable name from the email's local part (and
 * initials from that) is a display-only fallback, not a stored value.
 */
function displayNameOf(email: string): string {
  const local = email.split('@')[0] ?? email
  const words = local.split(/[._-]+/).filter(Boolean)
  if (words.length === 0) return email
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function LogoutIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}

export default function NavRail() {
  const { user, logout } = useAuth()
  const email = user?.email ?? ''
  const name = email ? displayNameOf(email) : 'Người dùng'

  return (
    <aside className="nav-rail">
      <div className="nav-rail-brand">
        <div className="nav-rail-logo">CSL</div>
        <div className="nav-rail-wordmark">
          CRYPTO
          <br />
          STRATEGY LAB
        </div>
      </div>

      <div className="nav-rail-section-label">Workspace</div>
      <nav className="nav-rail-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`}
          >
            <span className="nav-item-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="nav-rail-spacer" />

      <div className="nav-rail-user">
        <div className="nav-avatar mono">{initialsOf(name)}</div>
        <div className="nav-user-info">
          <div className="nav-user-name">{name}</div>
          <div className="nav-user-email text-muted">{email}</div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          title="Đăng xuất"
          onClick={() => void logout()}
        >
          <LogoutIcon />
        </button>
      </div>
    </aside>
  )
}
