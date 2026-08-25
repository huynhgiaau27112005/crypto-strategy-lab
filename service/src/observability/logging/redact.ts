/**
 * Central redaction — the ONLY place in the codebase that decides what a
 * log field is allowed to contain (task-18 hard requirement: an individual
 * call site must not be able to leak a secret by accident). StructuredLogger
 * runs every structured "meta" payload through this before it is ever
 * serialized, so a caller doing `logger.log('...', 'Ctx', { headers })`
 * cannot forget to scrub it.
 *
 * Two independent strategies, because secrets show up in logs two ways:
 *  1. Under a recognizable KEY (`authorization`, `password`, `apiKey`, a
 *     JWT_* / *_API_KEY / *_SECRET env var name, ...) — matched
 *     case/underscore-insensitively so `Authorization`, `authorization`,
 *     `AUTHORIZATION_HEADER`, and `openai_api_key` all match.
 *  2. Embedded in an otherwise-plain string, e.g. someone interpolates
 *     `Bearer eyJhbGciOi...` straight into a message string instead of a
 *     structured field — caught by pattern-matching bearer tokens and
 *     JWT-shaped strings regardless of which key (if any) they sit under.
 */

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_FRAGMENTS = [
  'authorization',
  'password',
  'token',
  'jwt',
  'apikey',
  'api_key',
  'secret',
  'cookie',
  'refreshtoken',
  'accesstoken',
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(normalizeKey(fragment)));
}

// `Bearer <token>` anywhere in a string (headers logged raw, error messages
// that echo a request, etc.).
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi;

// A bare JWT (three base64url segments separated by dots) even without a
// "Bearer " prefix — e.g. a refresh token logged as a plain string.
const JWT_PATTERN = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;

export function redactString(value: string): string {
  return value.replace(BEARER_PATTERN, `Bearer ${REDACTED}`).replace(JWT_PATTERN, REDACTED);
}

/**
 * Deep-redacts an arbitrary value. Objects/arrays are walked recursively;
 * a key matching {@link isSensitiveKey} has its entire value replaced
 * regardless of type (so a nested object under "password" is dropped, not
 * recursed into and partially leaked). Cycles are broken defensively —
 * this only ever runs on log payloads, never on data the app depends on.
 */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redact(entry, seen);
    }
    return out;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  return value;
}
