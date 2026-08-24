import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  apiFetch,
  attemptSessionRestore,
  readRefreshToken,
  setAccessToken,
  setUnauthorizedHandler,
  storeRefreshToken,
} from '../api/client'
import type { AuthTokens, LoginRequest, RegisterRequest, User } from '../api/types'
import { decodeUserFromAccessToken } from './jwt'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login(email: string, password: string): Promise<void>
  register(email: string, password: string, displayName?: string): Promise<void>
  logout(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const applyTokens = useCallback((tokens: AuthTokens) => {
    setAccessToken(tokens.accessToken)
    storeRefreshToken(tokens.refreshToken)
    setUser(decodeUserFromAccessToken(tokens.accessToken))
  }, [])

  // Registered once so the api client (a plain module, outside React) can
  // route a hard session failure (refresh also failed) back through the
  // router instead of forcing a full page reload.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      navigate('/auth', { replace: true })
    })
    return () => setUnauthorizedHandler(null)
  }, [navigate])

  // On mount, silently exchange a surviving sessionStorage refresh token
  // for a fresh access token, so a page reload doesn't drop the user back
  // to /auth. See api/client.ts for why the refresh token lives there.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    attemptSessionRestore()
      .then((accessToken) => {
        if (cancelled || !accessToken) return
        setUser(decodeUserFromAccessToken(accessToken))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const body: LoginRequest = { email, password }
      const tokens = await apiFetch<AuthTokens>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      applyTokens(tokens)
    },
    [applyTokens],
  )

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const body: RegisterRequest = { email, password, displayName }
      const tokens = await apiFetch<AuthTokens>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      applyTokens(tokens)
    },
    [applyTokens],
  )

  const logout = useCallback(async () => {
    const refreshToken = readRefreshToken()
    // Clear local session first: logout must succeed from the user's point
    // of view even if the network call below fails.
    setAccessToken(null)
    storeRefreshToken(null)
    setUser(null)
    if (refreshToken) {
      try {
        await apiFetch('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        })
      } catch {
        // Best-effort revoke; local session is already cleared.
      }
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.')
  }
  return ctx
}

/** Route wrapper: renders children only when authenticated, else redirects to /auth. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="app-placeholder text-muted">Đang kiểm tra phiên đăng nhập…</div>
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />
  }

  return <>{children}</>
}
