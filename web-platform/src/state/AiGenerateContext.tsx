import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiFetch } from '../api/client'
import type { AiGenerateJobDto } from '../api/types'

/** Same fixed cadence as NewsCrawlContext / useExperiment — predictable request rate. */
const POLL_INTERVAL_MS = 2000

/**
 * How many CONSECUTIVE failed status requests are tolerated before the poll
 * gives up and reports 'error'. No attempt-count time cap: the worker's own
 * generate timeout is the bound, same rationale as NewsCrawlContext.
 */
const MAX_CONSECUTIVE_FAILURES = 5

export type AiGeneratePollState = 'idle' | 'polling' | 'terminal' | 'error'

export interface AiGenerateContextValue {
  job: AiGenerateJobDto | null
  state: AiGeneratePollState
  error: string | null
  /** POST /ai-strategy/generate, then poll /ai-strategy/generate/status while RUNNING. */
  enqueueGenerate: (prompt: string) => Promise<void>
}

const AiGenerateContext = createContext<AiGenerateContextValue | undefined>(undefined)

function isRunning(status: AiGenerateJobDto['status']): boolean {
  return status === 'RUNNING'
}

/**
 * Owns the AI-generate job state for the whole `/app` workspace.
 *
 * useAiStrategy used to await POST /ai-strategy/generate inside AiStrategyPage,
 * so switching tabs unmounted the hook and threw the in-flight request away.
 * Hoisting the poll to a provider mounted at `/app` (alongside NewsCrawlProvider)
 * keeps one poll alive across every tab switch.
 *
 * A full page reload still unmounts everything, so on mount this reads
 * GET /ai-strategy/generate/status once and resumes polling if a job is
 * still RUNNING. That endpoint reads BullMQ/Redis, not client memory.
 *
 * Unlike news crawl, generate is one-shot: no auto-retrigger after COMPLETED.
 */
export function AiGenerateProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<AiGenerateJobDto | null>(null)
  const [state, setState] = useState<AiGeneratePollState>('idle')
  const [error, setError] = useState<string | null>(null)

  const unmountedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const pollingRef = useRef(false)

  const poll = useCallback((failures: number) => {
    if (unmountedRef.current) return
    pollingRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller

    apiFetch<AiGenerateJobDto | null>('/ai-strategy/generate/status', { signal: controller.signal })
      .then((status) => {
        if (unmountedRef.current) return
        setJob(status)
        setError(null)

        if (!status || !isRunning(status.status)) {
          pollingRef.current = false
          setState(status ? 'terminal' : 'idle')
          return
        }
        timerRef.current = setTimeout(() => poll(0), POLL_INTERVAL_MS)
      })
      .catch((err: unknown) => {
        if (unmountedRef.current || controller.signal.aborted) return
        const nextFailures = failures + 1
        if (nextFailures >= MAX_CONSECUTIVE_FAILURES) {
          pollingRef.current = false
          setError(err instanceof Error ? err.message : 'Không lấy được trạng thái sinh strategy.')
          setState('error')
          return
        }
        timerRef.current = setTimeout(() => poll(nextFailures), POLL_INTERVAL_MS)
      })
  }, [])

  useEffect(() => {
    unmountedRef.current = false
    const controller = new AbortController()

    apiFetch<AiGenerateJobDto | null>('/ai-strategy/generate/status', { signal: controller.signal })
      .then((status) => {
        if (unmountedRef.current) return
        if (!status) return
        setJob(status)
        if (isRunning(status.status)) {
          setState('polling')
          if (!pollingRef.current) poll(0)
        } else {
          setState('terminal')
        }
      })
      .catch(() => {
        // No generate has ever run, or the API is not reachable yet —
        // 'idle' is the right starting state; the user's next click
        // reports any real problem.
      })

    return () => {
      unmountedRef.current = true
      controller.abort()
      controllerRef.current?.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [poll])

  const enqueueGenerate = useCallback(
    async (prompt: string): Promise<void> => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setError(null)
      setState('polling')

      try {
        const started = await apiFetch<AiGenerateJobDto>('/ai-strategy/generate', {
          method: 'POST',
          body: JSON.stringify({ prompt }),
        })
        if (unmountedRef.current) return
        setJob(started)

        if (!isRunning(started.status)) {
          setState('terminal')
          return
        }
        poll(0)
      } catch (err) {
        if (unmountedRef.current) return
        if (err instanceof ApiError && err.status === 409) {
          try {
            const existing = await apiFetch<AiGenerateJobDto | null>('/ai-strategy/generate/status')
            if (unmountedRef.current) return
            setJob(existing)
            if (existing && isRunning(existing.status)) {
              poll(0)
              return
            }
            setState(existing ? 'terminal' : 'idle')
            return
          } catch (statusErr) {
            if (unmountedRef.current) return
            setError(
              statusErr instanceof Error
                ? statusErr.message
                : 'Không lấy được trạng thái sinh strategy.',
            )
            setState('error')
            return
          }
        }
        setError(err instanceof Error ? err.message : 'Không kích hoạt được sinh strategy.')
        setState('error')
      }
    },
    [poll],
  )

  const value = useMemo<AiGenerateContextValue>(
    () => ({ job, state, error, enqueueGenerate }),
    [job, state, error, enqueueGenerate],
  )

  return <AiGenerateContext.Provider value={value}>{children}</AiGenerateContext.Provider>
}

export function useAiGenerate(): AiGenerateContextValue {
  const ctx = useContext(AiGenerateContext)
  if (!ctx) {
    throw new Error('useAiGenerate must be used within a <AiGenerateProvider>.')
  }
  return ctx
}
