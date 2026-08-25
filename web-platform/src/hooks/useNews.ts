import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { NewsListResponse, SentimentLabel } from '../api/types'

export interface UseNewsResult {
  items: NewsListResponse['items']
  total: number
  loading: boolean
  error: string | null
}

/**
 * `GET /news?sentiment=&page=&pageSize=` — artifacts/api-contract.md §4.
 * `sentiment` of `null`/`undefined` omits the query param entirely (server
 * default: no WHERE clause, matching every row), never sends the literal
 * string "null".
 *
 * `refreshToken` is an opaque value the caller bumps to force a refetch
 * without changing any other argument — used after a crawl completes
 * (`useNewsCrawl`) to pull in newly-crawled articles.
 */
export function useNews(
  sentiment: SentimentLabel | null,
  page: number,
  pageSize: number,
  refreshToken: number | string = 0,
): UseNewsResult {
  const [items, setItems] = useState<NewsListResponse['items']>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (sentiment) params.set('sentiment', sentiment)
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))

    apiFetch<NewsListResponse>(`/news?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không tải được danh sách tin tức.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [sentiment, page, pageSize, refreshToken])

  return { items, total, loading, error }
}
