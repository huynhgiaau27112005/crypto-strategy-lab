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
import { apiFetch } from '../api/client'
import type { NewsCrawlJobDto } from '../api/types'

/** Same fixed cadence as useExperiment's poll — predictable request rate. */
const POLL_INTERVAL_MS = 2000

/**
 * How many CONSECUTIVE failed status requests are tolerated before the poll
 * gives up and reports 'error'.
 *
 * This replaced a flat 150-attempt (5 minute) cap. That cap was itself a
 * bug: a crawl is bounded server-side at 10 minutes (news-crawl.config.ts
 * `getTimeoutMs`), so any run past the 5th minute made the client declare
 * 'timeout' and flip the button back to "Crawl tin tức" while the worker
 * was still crawling — the UI contradicting the system.
 *
 * Removing the attempt cap does NOT create an "uncontrolled infinite loop"
 * (the anti-pattern this project forbids): the loop's exit condition is the
 * server's own job status, which is bounded by the worker's hard timeout,
 * and it is additionally bounded here by consecutive transport failures.
 * The loop cannot outlive the job it is watching.
 */
const MAX_CONSECUTIVE_FAILURES = 5

export type NewsCrawlPollState = 'idle' | 'polling' | 'terminal' | 'timeout' | 'error'

export interface NewsCrawlContextValue {
  job: NewsCrawlJobDto | null
  state: NewsCrawlPollState
  error: string | null
  /** Crawl restarts automatically after each successful batch until the user stops it. */
  autoCrawlEnabled: boolean
  /** POST /news/crawl, then starts the poll of /news/crawl/status. */
  triggerCrawl: () => Promise<void>
  /** POST /news/crawl/cancel — see NewsCrawlQueueService.cancel(). */
  stopCrawl: () => Promise<void>
  stopping: boolean
}

const NewsCrawlContext = createContext<NewsCrawlContextValue | undefined>(undefined)

function isRunning(status: NewsCrawlJobDto['status']): boolean {
  return status !== 'COMPLETED' && status !== 'FAILED'
}

/**
 * Owns the news-crawl job state for the whole `/app` workspace.
 *
 * This used to be a plain hook called inside NewsPage, so switching tabs
 * unmounted it and threw the poll away: coming back showed "Crawl tin tức"
 * as if nothing were running, even though the worker was still crawling.
 * Hoisting it to a provider mounted at the `/app` route (alongside
 * ExperimentProvider) keeps one poll alive across every tab switch.
 *
 * A full page reload still unmounts everything, so on mount this reads
 * `GET /news/crawl/status` once and resumes polling if a job is still in
 * flight. That endpoint reads real BullMQ/Redis state, not client memory,
 * so the button reflects what the worker is actually doing rather than
 * what this tab happens to remember.
 */
/** Pause between automatic crawl batches so the worker can finish scoring. */
const AUTO_CRAWL_GAP_MS = 3000

export function NewsCrawlProvider({ children }: { children: ReactNode }) {
  const [stopping, setStopping] = useState(false)
  const [autoCrawlEnabled, setAutoCrawlEnabled] = useState(true)
  const [job, setJob] = useState<NewsCrawlJobDto | null>(null)
  const [state, setState] = useState<NewsCrawlPollState>('idle')
  const [error, setError] = useState<string | null>(null)

  const unmountedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const pollingRef = useRef(false)
  const autoCrawlRef = useRef(true)
  const triggerCrawlRef = useRef<() => Promise<void>>(async () => {})

  const poll = useCallback((failures: number) => {
    if (unmountedRef.current) return
    pollingRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller

    apiFetch<NewsCrawlJobDto>('/news/crawl/status', { signal: controller.signal })
      .then((status) => {
        if (unmountedRef.current) return
        setJob(status)
        setError(null)

        if (!isRunning(status.status)) {
          pollingRef.current = false
          setState('terminal')
          if (
            autoCrawlRef.current &&
            status.status === 'COMPLETED' &&
            !unmountedRef.current
          ) {
            timerRef.current = setTimeout(() => {
              if (autoCrawlRef.current && !unmountedRef.current) {
                void triggerCrawlRef.current()
              }
            }, AUTO_CRAWL_GAP_MS)
          }
          return
        }
        timerRef.current = setTimeout(() => poll(0), POLL_INTERVAL_MS)
      })
      .catch((err: unknown) => {
        if (unmountedRef.current || controller.signal.aborted) return
        const nextFailures = failures + 1
        if (nextFailures >= MAX_CONSECUTIVE_FAILURES) {
          pollingRef.current = false
          setError(err instanceof Error ? err.message : 'Không lấy được trạng thái crawl.')
          setState('error')
          return
        }
        // A single failed status request is not proof the crawl stopped —
        // retry before telling the user anything.
        timerRef.current = setTimeout(() => poll(nextFailures), POLL_INTERVAL_MS)
      })
  }, [])

  // Resume after a full page reload: adopt whatever the server says is
  // currently in flight instead of starting from 'idle'.
  useEffect(() => {
    unmountedRef.current = false
    const controller = new AbortController()

    apiFetch<NewsCrawlJobDto | null>('/news/crawl/status', { signal: controller.signal })
      .then((status) => {
        if (unmountedRef.current || !status) {
          if (!unmountedRef.current && autoCrawlRef.current) {
            void triggerCrawlRef.current()
          }
          return
        }
        setJob(status)
        if (isRunning(status.status)) {
          setState('polling')
          if (!pollingRef.current) poll(0)
        } else if (autoCrawlRef.current) {
          void triggerCrawlRef.current()
        }
      })
      .catch(() => {
        // No crawl has ever run, or the API is not reachable yet — either
        // way 'idle' is the right starting state; the user's next click
        // reports any real problem.
      })

    return () => {
      unmountedRef.current = true
      controller.abort()
      controllerRef.current?.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [poll])

  const triggerCrawl = useCallback(async (): Promise<void> => {
    if (timerRef.current) clearTimeout(timerRef.current)
    autoCrawlRef.current = true
    setAutoCrawlEnabled(true)
    setError(null)
    setState('polling')

    try {
      const started = await apiFetch<NewsCrawlJobDto>('/news/crawl', { method: 'POST' })
      if (unmountedRef.current) return
      setJob(started)

      if (!isRunning(started.status)) {
        setState('terminal')
        if (autoCrawlRef.current && started.status === 'COMPLETED') {
          timerRef.current = setTimeout(() => {
            if (autoCrawlRef.current && !unmountedRef.current) {
              void triggerCrawlRef.current()
            }
          }, AUTO_CRAWL_GAP_MS)
        }
        return
      }
      poll(0)
    } catch (err) {
      if (unmountedRef.current) return
      setError(err instanceof Error ? err.message : 'Không kích hoạt được crawl.')
      setState('error')
    }
  }, [poll])

  triggerCrawlRef.current = triggerCrawl

  const stopCrawl = useCallback(async (): Promise<void> => {
    setStopping(true)
    autoCrawlRef.current = false
    setAutoCrawlEnabled(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await apiFetch('/news/crawl/cancel', { method: 'POST' })
      // Deliberately does NOT flip `state` to terminal here: an already-
      // running worker finishes its current batch first, so the poller
      // stays the single source of truth for when the crawl has actually
      // stopped. Claiming it stopped instantly would be a lie the UI
      // would then have to walk back.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không dừng được crawl.')
    } finally {
      setStopping(false)
    }
  }, [])

  const value = useMemo<NewsCrawlContextValue>(
    () => ({ job, state, error, autoCrawlEnabled, triggerCrawl, stopCrawl, stopping }),
    [job, state, error, autoCrawlEnabled, triggerCrawl, stopCrawl, stopping],
  )

  return <NewsCrawlContext.Provider value={value}>{children}</NewsCrawlContext.Provider>
}

export function useNewsCrawl(): NewsCrawlContextValue {
  const ctx = useContext(NewsCrawlContext)
  if (!ctx) {
    throw new Error('useNewsCrawl must be used within a <NewsCrawlProvider>.')
  }
  return ctx
}
