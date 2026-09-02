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
  /**
   * Whether the crawl LOOP is active — which is what the Stop button has
   * to key off, not `state === 'polling'`.
   *
   * Between two automatic batches the poll state is 'terminal' for
   * AUTO_CRAWL_GAP_MS while a restart timer is pending. Keying the button
   * on 'polling' made it flip back to "Bật crawl tự động" during that
   * window, so a user trying to stop the crawler either found no Stop
   * button or, worse, clicked what had silently become the Start button.
   */
  crawlActive: boolean
  /** POST /news/crawl, then starts the poll of /news/crawl/status. */
  triggerCrawl: () => Promise<void>
  /** POST /news/crawl/cancel — see NewsCrawlQueueService.cancel(). */
  stopCrawl: () => Promise<void>
  stopping: boolean
}

const NewsCrawlContext = createContext<NewsCrawlContextValue | undefined>(undefined)

function isRunning(status: NewsCrawlJobDto['status']): boolean {
  return status === 'RUNNING'
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
  /**
   * True from the moment the user presses Dừng until the job actually
   * reaches a terminal state — NOT just until the cancel request returns.
   *
   * The POST resolves in milliseconds while the worker takes a second or
   * two to exit, so clearing this on the response put an enabled "Dừng
   * Crawl" back under the user's cursor mid-stop; a reflex second click
   * then hit a server with no in-flight job left and did nothing, which
   * reads exactly like a broken button.
   */
  const [stopRequested, setStopRequested] = useState(false)
  const [autoCrawlEnabled, setAutoCrawlEnabled] = useState(true)
  const [job, setJob] = useState<NewsCrawlJobDto | null>(null)
  const [state, setState] = useState<NewsCrawlPollState>('idle')
  const [error, setError] = useState<string | null>(null)

  const unmountedRef = useRef(false)
  /**
   * Two timers, deliberately kept apart.
   *
   * They used to share ONE ref, and that was the bug behind "the first
   * stop works, later ones do nothing": `stopCrawl` clears the pending
   * restart so a stop pressed between batches cannot be undone a second
   * later — but with a shared ref that same `clearTimeout` also killed the
   * POLL, which is in its 2-second wait almost all of the time. The poll
   * loop died, `state` stayed 'polling' forever, so the button kept
   * reading "Dừng Crawl" even though the job had already ended — and every
   * later click found no in-flight job on the server and silently did
   * nothing. Confirmed against Redis: each cancel really did terminate its
   * worker in a few seconds while the UI still claimed a crawl was running.
   */
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
          // The job has ended, whatever the reason — any stop in progress
          // is now finished.
          setStopRequested(false)
          if (
            autoCrawlRef.current &&
            status.status === 'COMPLETED' &&
            !unmountedRef.current
          ) {
            restartTimerRef.current = setTimeout(() => {
              if (autoCrawlRef.current && !unmountedRef.current) {
                void triggerCrawlRef.current()
              }
            }, AUTO_CRAWL_GAP_MS)
          }
          return
        }
        pollTimerRef.current = setTimeout(() => poll(0), POLL_INTERVAL_MS)
      })
      .catch((err: unknown) => {
        if (unmountedRef.current || controller.signal.aborted) return
        const nextFailures = failures + 1
        if (nextFailures >= MAX_CONSECUTIVE_FAILURES) {
          pollingRef.current = false
          // Turn the loop off as well as reporting the error. `crawlActive`
          // drives the Stop/Start button, so leaving auto-crawl on here
          // would show "Dừng Crawl" over a loop that has already given up
          // — and give the user no way to retry.
          autoCrawlRef.current = false
          setAutoCrawlEnabled(false)
          // The poll is what clears a pending stop, so it has to clear it
          // on the way out too — otherwise a stop pressed just before the
          // API became unreachable leaves the button disabled on "Đang
          // dừng…" with nothing left to ever release it.
          setStopRequested(false)
          setError(err instanceof Error ? err.message : 'Không lấy được trạng thái crawl.')
          setState('error')
          return
        }
        // A single failed status request is not proof the crawl stopped —
        // retry before telling the user anything.
        pollTimerRef.current = setTimeout(() => poll(nextFailures), POLL_INTERVAL_MS)
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
          return
        }
        setState('terminal')
        // A CANCELLED last run means a human pressed Dừng. Auto-starting
        // over that is how a deliberate stop kept undoing itself: this
        // provider mounts with the `/app` route, so every reload (and every
        // StrictMode double-mount in dev) started a brand-new crawl
        // seconds after the user had stopped one. The server's own job
        // history is the right place to read that intent from — it also
        // holds across tabs and browsers, which client state would not.
        if (status.status === 'CANCELLED') {
          autoCrawlRef.current = false
          setAutoCrawlEnabled(false)
          return
        }
        if (autoCrawlRef.current) void triggerCrawlRef.current()
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
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    }
  }, [poll])

  const triggerCrawl = useCallback(async (): Promise<void> => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    autoCrawlRef.current = true
    setAutoCrawlEnabled(true)
    setStopRequested(false)
    setError(null)
    setState('polling')

    try {
      const started = await apiFetch<NewsCrawlJobDto>('/news/crawl', { method: 'POST' })
      if (unmountedRef.current) return
      setJob(started)

      if (!isRunning(started.status)) {
        setState('terminal')
        if (autoCrawlRef.current && started.status === 'COMPLETED') {
          restartTimerRef.current = setTimeout(() => {
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
      // Same reason as the poll's failure path: a loop that could not even
      // start must not keep presenting itself as running.
      autoCrawlRef.current = false
      setAutoCrawlEnabled(false)
      setError(err instanceof Error ? err.message : 'Không kích hoạt được crawl.')
      setState('error')
    }
  }, [poll])

  triggerCrawlRef.current = triggerCrawl

  const stopCrawl = useCallback(async (): Promise<void> => {
    setStopRequested(true)
    autoCrawlRef.current = false
    setAutoCrawlEnabled(false)
    // Cancels a PENDING auto-restart only. Without this, a stop pressed
    // during the gap between batches raced the restart timer and the crawl
    // came back to life a second later.
    //
    // The POLL is deliberately left running: it is what observes the job
    // reaching CANCELLED and flips the button back to "Bật crawl tự
    // động". Clearing it here (which the shared-ref version did) stranded
    // the UI in 'polling' forever — see pollTimerRef's comment.
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    // If the stop lands in the gap BETWEEN batches, no poll is in flight
    // (the previous batch already reached a terminal state). Kick one so
    // there is still something watching for the cancel to take effect.
    if (!pollingRef.current) poll(0)
    try {
      await apiFetch('/news/crawl/cancel', { method: 'POST' })
      // Deliberately does NOT flip `state` to terminal here: the worker
      // process is SIGTERMed but takes a moment to exit, so the poller
      // stays the single source of truth for when the crawl has actually
      // stopped (GET /news/crawl/status reports `stopping: true` in the
      // meantime). Claiming it stopped instantly would be a lie the UI
      // would then have to walk back.
      // The poll clears `stopRequested` once the job reports a terminal
      // status; it is not cleared here, because the crawl is not stopped
      // when the request returns — only when the worker exits.
    } catch (err) {
      // The cancel never landed, so nothing is stopping. Release the
      // button rather than leaving it disabled on a stop that failed.
      setStopRequested(false)
      setError(err instanceof Error ? err.message : 'Không dừng được crawl.')
    }
  }, [poll])

  const value = useMemo<NewsCrawlContextValue>(
    () => ({
      job,
      state,
      error,
      autoCrawlEnabled,
      crawlActive: autoCrawlEnabled || state === 'polling' || stopRequested,
      triggerCrawl,
      stopCrawl,
      stopping: stopRequested || Boolean(job?.stopping),
    }),
    [job, state, error, autoCrawlEnabled, triggerCrawl, stopCrawl, stopRequested],
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
