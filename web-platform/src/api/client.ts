import type { AuthTokens } from './types'

/**
 * API client for the real backend (see artifacts/api-contract.md).
 *
 * Token storage — deliberate, not incidental:
 * - Access token: a module-scoped variable only. Never written to
 *   localStorage/sessionStorage. A token there is readable by any script
 *   injected into the page; keeping it out of Web Storage means an XSS
 *   payload cannot read it directly, only smuggle it out while it lives.
 * - Refresh token: KNOWN TECHNICAL DEBT. The backend has no cookie
 *   support (see the "Refresh token storage" note below the class) — it
 *   returns the refresh token in the JSON body of register/login/refresh
 *   and expects it back in the JSON body of refresh/logout. Something has
 *   to hold it between page loads, so it lives in sessionStorage (tab-
 *   scoped, cleared on tab close) under REFRESH_TOKEN_STORAGE_KEY. This is
 *   more exposed to XSS than an httpOnly cookie would be. The real fix is
 *   a backend change (cookie-parser + Set-Cookie on register/login/refresh);
 *   see artifacts/api-contract.md and the task-6 report for the tradeoff.
 */

const API_BASE = '/api'
const REFRESH_TOKEN_STORAGE_KEY = 'csl.refreshToken'

let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function readRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  } catch {
    // sessionStorage can throw in locked-down contexts (private browsing
    // quirks, embedded iframes with storage disabled); treat as "no session".
    return null
  }
}

export function storeRefreshToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token)
    } else {
      sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    }
  } catch {
    // Best-effort; if storage is unavailable there is nothing more we can do.
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Called when a session ends for good (refresh failed / no refresh token). */
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

function clearSession(): void {
  setAccessToken(null)
  storeRefreshToken(null)
}

function handleSessionEnded(): void {
  clearSession()
  if (unauthorizedHandler) {
    unauthorizedHandler()
  } else if (typeof window !== 'undefined') {
    window.location.assign('/auth')
  }
}

function buildHeaders(init: RequestInit | undefined): Headers {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return headers
}

async function readErrorMessage(res: Response): Promise<{ message: string; body: unknown }> {
  try {
    const body = (await res.clone().json()) as { message?: string | string[] } | undefined
    if (body && typeof body.message === 'string') return { message: body.message, body }
    if (body && Array.isArray(body.message)) return { message: body.message.join('; '), body }
    return { message: res.statusText || `Request failed with status ${res.status}`, body }
  } catch {
    return { message: res.statusText || `Request failed with status ${res.status}`, body: undefined }
  }
}

/**
 * Single-flight refresh. Every apiFetch that hits a 401 concurrently calls
 * this; they all get the *same* in-flight promise instead of each firing
 * their own POST /auth/refresh. That matters because refresh rotates the
 * refresh token: if two requests refreshed independently, the second
 * refresh call would revoke the token the first call just received,
 * and whichever request used the now-revoked token would fail — the user
 * gets logged out mid-session for no visible reason. One shared promise
 * means exactly one refresh happens per expiry, no matter how many
 * requests were waiting on it.
 */
let refreshInFlight: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function doRefresh(): Promise<string> {
  const refreshToken = readRefreshToken()
  if (!refreshToken) {
    handleSessionEnded()
    throw new ApiError(401, 'No active session.')
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch (err) {
    // Network failure during refresh: do not tear down the session for a
    // transient connectivity blip — surface the error, keep tokens as-is.
    throw new ApiError(0, err instanceof Error ? err.message : 'Network error during refresh.')
  }

  if (!res.ok) {
    handleSessionEnded()
    const { message } = await readErrorMessage(res)
    throw new ApiError(res.status, message)
  }

  const tokens = (await res.json()) as AuthTokens
  // The refresh token rotates on every call — the one we just sent is now
  // revoked server-side. Persisting the new one immediately, as part of
  // this same single-flight refresh, is what keeps the next refresh from
  // presenting an already-revoked token.
  setAccessToken(tokens.accessToken)
  storeRefreshToken(tokens.refreshToken)
  return tokens.accessToken
}

/**
 * Fetch wrapper for the backend API. Prefixes `/api`, attaches the
 * in-memory access token, and on a 401 attempts exactly one
 * POST /auth/refresh before retrying the original request exactly once.
 * If the refresh also fails, the session is cleared and the caller is
 * redirected to /auth — never retried in a loop.
 */
export async function apiFetch<T>(path: string, init?: RequestInit, _retried = false): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: buildHeaders(init) })

  if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
    try {
      await refreshAccessToken()
    } catch {
      throw new ApiError(401, 'Session expired. Please log in again.')
    }
    return apiFetch<T>(path, init, true)
  }

  if (!res.ok) {
    const { message, body } = await readErrorMessage(res)
    throw new ApiError(res.status, message, body)
  }

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  return (text.length > 0 ? JSON.parse(text) : undefined) as T
}

/**
 * Called once at app startup: if a refresh token survived from an earlier
 * load in this tab (sessionStorage), silently exchange it for a fresh
 * access token so the user doesn't have to log in again on every reload.
 * Returns null (without any network call) if there is nothing to restore.
 */
export async function attemptSessionRestore(): Promise<string | null> {
  if (!readRefreshToken()) return null
  try {
    return await refreshAccessToken()
  } catch {
    return null
  }
}
