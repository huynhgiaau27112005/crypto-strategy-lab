import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { AiProviderInfo } from '../api/types'

/**
 * Which LLM the backend is actually wired to (`GET /ai-strategy/provider`).
 *
 * Without this the tab could not tell a working key from a missing one:
 * with no API key configured the backend falls back to a deterministic
 * fake provider whose canned Python is perfectly valid, so "I set my key
 * but the code is still fake" had no visible explanation. `live: false`
 * means no key is configured (or the key is under a variable name the
 * backend does not read).
 */
export function useAiProvider(): AiProviderInfo | null {
  const [info, setInfo] = useState<AiProviderInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    apiFetch<AiProviderInfo>('/ai-strategy/provider', { signal: controller.signal })
      .then((res) => {
        if (!cancelled) setInfo(res)
      })
      .catch(() => {
        // Non-fatal: the tab works without knowing the provider.
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  return info
}
