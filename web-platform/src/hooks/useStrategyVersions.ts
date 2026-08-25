import { useCallback, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../api/client'
import type { SearchStrategyType, StrategyVersionSummary } from '../api/types'
import { isAiStrategyType } from '../api/types'

export interface UseStrategyVersions {
  versions: StrategyVersionSummary[]
  loading: boolean
  error: string | null
  saving: boolean
  saveError: string | null
  /** Re-fetches the version list (called after a successful save). */
  refresh: () => void
  /**
   * POSTs a new version for `type` with `parameters`. Resolves with the new
   * row and refreshes `versions` on success; throws on failure (caller
   * decides how to surface it, in addition to `saveError` being set).
   */
  saveVersion: (parameters: Record<string, number>) => Promise<StrategyVersionSummary>
}

/**
 * Owns one strategy type's persisted version history —
 * `GET`/`POST /strategy-plugin/strategies/:type/versions`. Re-fetches
 * whenever `type` changes (switching which strategy's parameter panel is
 * focused); `null` means "nothing selected", clears state without a request.
 */
export function useStrategyVersions(type: SearchStrategyType | null): UseStrategyVersions {
  const [versions, setVersions] = useState<StrategyVersionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    // An AI strategy has no numeric-parameter version history through this
    // endpoint (it isn't a registered built-in plugin — see
    // StrategyRegistry.has()/get() vs resolve()) — skip the request rather
    // than surfacing a 404 as a UI error.
    if (!type || isAiStrategyType(type)) {
      setVersions([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    setLoading(true)
    setError(null)

    apiFetch<StrategyVersionSummary[]>(`/strategy-plugin/strategies/${type}/versions`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (cancelled) return
        setVersions(res)
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không tải được lịch sử version.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [type, reloadToken])

  const refresh = useCallback(() => setReloadToken((n) => n + 1), [])

  const saveVersion = useCallback(
    async (parameters: Record<string, number>): Promise<StrategyVersionSummary> => {
      if (!type) throw new Error('No strategy selected.')
      setSaving(true)
      setSaveError(null)
      try {
        const result = await apiFetch<StrategyVersionSummary>(`/strategy-plugin/strategies/${type}/versions`, {
          method: 'POST',
          body: JSON.stringify({ parameters }),
        })
        refresh()
        return result
      } catch (err: unknown) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Không lưu được version tham số.'
        setSaveError(message)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [type, refresh],
  )

  return { versions, loading, error, saving, saveError, refresh, saveVersion }
}
