import type { User } from '../api/types'

/**
 * The backend has no GET /auth/me — the access token is the only place
 * user identity is available client-side. `service/src/modules/auth/auth.service.ts`
 * signs it as `{ sub: userId, email }`; this reads those two claims back
 * out. This does NOT verify the token's signature — it only reads a
 * payload the browser already trusts because the server itself issued it
 * over the current session. Never use this to authorize anything; it is
 * display-only (the backend re-verifies the signature on every request).
 */
export function decodeUserFromAccessToken(token: string): User | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { sub?: unknown; email?: unknown }
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null
    return { id: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const percentEncoded = Array.from(binary, (char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  return decodeURIComponent(percentEncoded)
}
