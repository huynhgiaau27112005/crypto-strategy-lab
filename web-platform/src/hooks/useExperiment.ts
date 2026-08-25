import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { ExperimentStatusDto } from '../api/types'

/** Fixed poll cadence — never tightens/backs off, so the request rate is predictable. */
const POLL_INTERVAL_MS = 2000
/** Hard ceiling on attempts: 150 * 2s = 5 minutes. Past this the poll stops
 * on its own and surfaces a timeout state — this is the bound that keeps
 * the loop from being the "uncontrolled infinite loop" anti-pattern
 * (docs/about-projects/03-anti-patterns-to-avoid.md) even if an experiment
 * never reaches a terminal status. */
const MAX_POLL_ATTEMPTS = 150

export type ExperimentPollState = 'idle' | 'polling' | 'terminal' | 'timeout' | 'error'

export interface UseExperimentResult {
  data: ExperimentStatusDto | null
  state: ExperimentPollState
  error: string | null
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

/**
 * Polls `GET /strategy-search/experiments/:id` (artifacts/api-contract.md
 * §2) at a fixed interval while status is PENDING/RUNNING, and stops as
 * soon as it sees COMPLETED/FAILED/CANCELLED. Bounded by both the fixed
 * interval and `MAX_POLL_ATTEMPTS` — past that ceiling the hook reports
 * `state: 'timeout'` instead of polling forever, leaving the caller a
 * concrete stopped state to render instead of an endless spinner.
 *
 * Unmounting (or `experimentId` changing/going null) cancels the in-flight
 * request and the pending timer — no poll survives its component.
 */
export function useExperiment(experimentId: string | null): UseExperimentResult {
  const [data, setData] = useState<ExperimentStatusDto | null>(null)
  const [state, setState] = useState<ExperimentPollState>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!experimentId) {
      setData(null)
      setState('idle')
      setError(null)
      return
    }

    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const controller = new AbortController()

    setData(null)
    setState('polling')
    setError(null)

    const poll = () => {
      if (cancelled) return
      attempts += 1
      apiFetch<ExperimentStatusDto>(`/strategy-search/experiments/${experimentId}`, {
        signal: controller.signal,
      })
        .then((status) => {
          if (cancelled) return
          setData(status)

          if (TERMINAL_STATUSES.has(status.status)) {
            setState('terminal')
            return
          }
          if (attempts >= MAX_POLL_ATTEMPTS) {
            setState('timeout')
            return
          }
          timer = setTimeout(poll, POLL_INTERVAL_MS)
        })
        .catch((err: unknown) => {
          if (cancelled || controller.signal.aborted) return
          setError(err instanceof Error ? err.message : 'Không lấy được trạng thái experiment.')
          setState('error')
        })
    }

    poll()

    return () => {
      cancelled = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [experimentId])

  return { data, state, error }
}
