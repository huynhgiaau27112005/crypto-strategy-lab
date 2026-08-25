import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import type { NewsCrawlJobDto } from '../api/types'

/** Same fixed cadence as useExperiment's bounded poll — predictable request rate. */
const POLL_INTERVAL_MS = 2000
/** Hard ceiling: 150 * 2s = 5 minutes of polling before the hook gives up and
 * reports 'timeout' on its own, independent of the worker's own server-side
 * timeout (NEWS_WORKER_TIMEOUT_MS) — this is the bound that keeps the poll
 * itself from being the "uncontrolled infinite loop" anti-pattern
 * (docs/about-projects/03-anti-patterns-to-avoid.md) even if a status
 * response is somehow never terminal. */
const MAX_POLL_ATTEMPTS = 150

export type NewsCrawlPollState = 'idle' | 'polling' | 'terminal' | 'timeout' | 'error'

export interface UseNewsCrawlResult {
  job: NewsCrawlJobDto | null
  state: NewsCrawlPollState
  error: string | null
  /** POST /news/crawl, then starts the bounded poll of /news/crawl/status. */
  triggerCrawl: () => Promise<void>
}

/**
 * Drives the "Crawl tin tức" button: `POST /news/crawl` (artifacts/api-contract.md §4)
 * kicks off the out-of-process worker and returns a job immediately; this
 * hook then polls `GET /news/crawl/status` at a fixed interval, bounded by
 * `MAX_POLL_ATTEMPTS`, until the job reaches COMPLETED/FAILED.
 *
 * Unmounting cancels the in-flight request and the pending timer, same as
 * useExperiment.
 */
export function useNewsCrawl(): UseNewsCrawlResult {
  const [job, setJob] = useState<NewsCrawlJobDto | null>(null)
  const [state, setState] = useState<NewsCrawlPollState>('idle')
  const [error, setError] = useState<string | null>(null)

  const cancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      cancelledRef.current = true
      controllerRef.current?.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const poll = (attempts: number) => {
    if (cancelledRef.current) return
    const controller = new AbortController()
    controllerRef.current = controller

    apiFetch<NewsCrawlJobDto>('/news/crawl/status', { signal: controller.signal })
      .then((status) => {
        if (cancelledRef.current) return
        setJob(status)

        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          setState('terminal')
          return
        }
        const nextAttempts = attempts + 1
        if (nextAttempts >= MAX_POLL_ATTEMPTS) {
          setState('timeout')
          return
        }
        timerRef.current = setTimeout(() => poll(nextAttempts), POLL_INTERVAL_MS)
      })
      .catch((err: unknown) => {
        if (cancelledRef.current || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không lấy được trạng thái crawl.')
        setState('error')
      })
  }

  const triggerCrawl = async (): Promise<void> => {
    cancelledRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    setError(null)
    setState('polling')

    try {
      const started = await apiFetch<NewsCrawlJobDto>('/news/crawl', { method: 'POST' })
      if (cancelledRef.current) return
      setJob(started)

      if (started.status === 'COMPLETED' || started.status === 'FAILED') {
        setState('terminal')
        return
      }
      poll(0)
    } catch (err) {
      if (cancelledRef.current) return
      setError(err instanceof Error ? err.message : 'Không kích hoạt được crawl.')
      setState('error')
    }
  }

  return { job, state, error, triggerCrawl }
}
