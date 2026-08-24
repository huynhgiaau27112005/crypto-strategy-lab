import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import BlueprintCorners from '../components/BlueprintCorners'
import HeroPanel from '../components/HeroPanel'

type AuthMode = 'login' | 'register'

/**
 * Ported from the prototype's split login screen
 * (docs/ui-prototype/.../Crypto Strategy Lab.dc.html, lines 70-122): hero
 * on the left, tabbed auth card on the right. Every label and string below
 * is copied verbatim from the prototype, with one deliberate omission —
 * the "Tài khoản demo: student@example.com / demo1234" hint line is not
 * ported, because no such account exists in this database.
 */
export default function AuthPage() {
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<AuthMode>(searchParams.get('mode') === 'register' ? 'register' : 'login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { login, register } = useAuth()
  const navigate = useNavigate()

  const isRegister = mode === 'register'
  const authTitle = isRegister ? 'Tạo tài khoản' : 'Đăng nhập'
  const authSub = isRegister
    ? 'Tài khoản riêng để lưu strategy Python do AI sinh ra.'
    : 'Dùng tài khoản của bạn để mở workspace strategy.'
  const authCta = isRegister ? 'Tạo tài khoản' : 'Đăng nhập'

  function switchMode(next: AuthMode) {
    setMode(next)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (isRegister && password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.')
      return
    }

    setSubmitting(true)
    try {
      if (isRegister) {
        await register(email, password, displayName.trim() || undefined)
      } else {
        await login(email, password)
      }
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <HeroPanel />

      <div className="auth-card-wrap">
        <form className="card blueprint auth-card" onSubmit={handleSubmit} noValidate>
          <BlueprintCorners />

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab${isRegister ? '' : ' active'}`}
              onClick={() => switchMode('login')}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              className={`auth-tab${isRegister ? ' active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Đăng ký
            </button>
          </div>

          <h2 className="auth-title">{authTitle}</h2>
          <p className="text-muted auth-sub">{authSub}</p>

          <div className="auth-fields">
            {isRegister && (
              <div className="field">
                <label htmlFor="auth-display-name">Họ và tên</label>
                <input
                  id="auth-display-name"
                  className="input"
                  type="text"
                  placeholder="Nguyễn Minh"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                className="input"
                type="email"
                placeholder="student@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label htmlFor="auth-password">Mật khẩu</label>
              <input
                id="auth-password"
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </div>

            {isRegister && (
              <div className="field">
                <label htmlFor="auth-confirm-password">Nhập lại mật khẩu</label>
                <input
                  id="auth-confirm-password"
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            <div className="auth-row">
              <label className="radio">
                <input type="checkbox" defaultChecked />
                <span className="dot" style={{ borderRadius: 0 }} />
                Ghi nhớ đăng nhập
              </label>
              <a href="#">Quên mật khẩu?</a>
            </div>

            {error && (
              <div className="banner banner-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block blueprint auth-submit"
              disabled={submitting}
            >
              <BlueprintCorners />
              {submitting ? 'Đang xử lý…' : authCta}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
