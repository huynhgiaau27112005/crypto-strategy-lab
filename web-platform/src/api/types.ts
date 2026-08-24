/**
 * Types matching the real, running API — see artifacts/api-contract.md.
 * Field names here must match the backend's JSON exactly; do not rename
 * for frontend "convenience".
 */

/** Body of POST /auth/register. */
export interface RegisterRequest {
  email: string
  password: string
  displayName?: string
}

/** Body of POST /auth/login. */
export interface LoginRequest {
  email: string
  password: string
}

/** Body of POST /auth/refresh and POST /auth/logout. */
export interface RefreshRequest {
  refreshToken: string
}

/**
 * Response shape shared by POST /auth/register, POST /auth/login, and
 * POST /auth/refresh (refresh rotates both tokens and returns a new pair).
 */
export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

/**
 * The backend has no GET /auth/me (or any user-profile endpoint) yet — see
 * artifacts/api-contract.md §1. `id` and `email` are the only claims the
 * access token carries (`{ sub, email }`, from service/src/modules/auth/auth.service.ts),
 * so this is what auth/jwt.ts decodes it into. Not a documented response
 * body; a minimal client-side derivation of what the token already proves.
 */
export interface User {
  id: string
  email: string
}

/** Default NestJS error body shape — artifacts/api-contract.md §6. */
export interface ApiErrorBody {
  statusCode: number
  message: string | string[]
  error: string
}
