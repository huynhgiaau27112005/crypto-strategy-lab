import { useEffect, useState } from 'react'
import BlueprintCorners from '../components/BlueprintCorners'
import Chip from '../components/Chip'
import SignalBadge, { type SignalKind } from '../components/SignalBadge'
import { useNews } from '../hooks/useNews'
import { useNewsCrawl } from '../state/NewsCrawlContext'
import { useSentimentSummary } from '../hooks/useSentimentSummary'
import type { SentimentLabel } from '../api/types'

const NEWS_PAGE_SIZE = 8
const SUMMARY_HOURS = 24

const SENTIMENT_FILTERS: { value: SentimentLabel | null; label: string }[] = [
  { value: null, label: 'Tất cả' },
  { value: 'POSITIVE', label: 'Positive' },
  { value: 'NEUTRAL', label: 'Neutral' },
  { value: 'NEGATIVE', label: 'Negative' },
]

function sentimentKind(sentiment: SentimentLabel | null): SignalKind {
  if (sentiment === 'POSITIVE') return 'up'
  if (sentiment === 'NEGATIVE') return 'down'
  return 'neutral'
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function fmtConfidence(score: number | null): string {
  return score != null ? score.toFixed(2) : '—'
}

function fmtPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

export default function NewsPage() {
  const [sentiment, setSentiment] = useState<SentimentLabel | null>(null)
  const [page, setPage] = useState(1)
  const [refreshToken, setRefreshToken] = useState(0)

  const { items, total, loading, error } = useNews(sentiment, page, NEWS_PAGE_SIZE, refreshToken)
  const {
    data: summary,
    loading: summaryLoading,
    error: summaryError,
  } = useSentimentSummary(SUMMARY_HOURS, refreshToken)
  const {
    job: crawlJob,
    state: crawlState,
    error: crawlError,
    triggerCrawl,
    stopCrawl,
    stopping: crawlStopping,
  } = useNewsCrawl()

  const handleCrawlStop = () => {
    void stopCrawl()
  }

  const pages = Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE))
  const crawlRunning = crawlState === 'polling'

  const selectSentiment = (value: SentimentLabel | null) => {
    setSentiment(value)
    setPage(1)
  }

  // Once the worker process reaches a terminal state, refetch the article
  // list and summary panel so newly-crawled/scored articles show up
  // without a manual page reload.
  useEffect(() => {
    if (crawlState === 'terminal' && crawlJob?.status === 'COMPLETED') {
      setRefreshToken((t) => t + 1)
    }
  }, [crawlState, crawlJob])

  const handleCrawlClick = () => {
    if (crawlRunning) return
    void triggerCrawl()
  }

  const crawlStatusText = (): string => {
    if (crawlState === 'polling') return 'Đang crawl…'
    if (crawlState === 'timeout') return 'Hết thời gian chờ trạng thái crawl.'
    if (crawlState === 'error') return crawlError ?? 'Lỗi khi crawl.'
    if (crawlState === 'terminal' && crawlJob) {
      if (crawlJob.status === 'COMPLETED') return 'Crawl xong — danh sách đã được cập nhật.'
      return `Crawl thất bại: ${crawlJob.error ?? 'không rõ lỗi'}`
    }
    return 'Kích hoạt crawler để lấy tin tức mới nhất từ RSS.'
  }

  return (
    <div className="news-page">
      <div className="news-main">
        <div className="news-toolbar blueprint">
          <BlueprintCorners />
          <div>
            <div className="news-toolbar-group-label">Sentiment</div>
            <div className="news-toolbar-buttons">
              {SENTIMENT_FILTERS.map((f) => (
                <Chip
                  key={f.label}
                  label={f.label}
                  pressed={sentiment === f.value}
                  onClick={() => selectSentiment(f.value)}
                />
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div>
            <div className="news-toolbar-group-label">Crawl tin tức</div>
            {crawlRunning ? (
              <button
                type="button"
                className="btn btn-danger btn-block blueprint"
                style={{ height: 36 }}
                disabled={crawlStopping}
                title="Dừng crawl — worker sẽ kết thúc lô hiện tại rồi dừng cập nhật."
                onClick={handleCrawlStop}
              >
                <BlueprintCorners />
                {crawlStopping ? 'Đang dừng…' : 'Dừng Crawl'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-block blueprint"
                style={{ height: 36 }}
                title="Kích hoạt worker crawl tin tức + phân tích sentiment (chạy tiến trình riêng)."
                onClick={handleCrawlClick}
              >
                <BlueprintCorners />
                Crawl tin tức
              </button>
            )}
            {crawlRunning && (
              <div className="news-crawl-progress" aria-live="polite">
                <span className="news-crawl-spinner" aria-hidden="true" />
                <span>Đang crawl &amp; phân tích sentiment…</span>
              </div>
            )}
            <p className="news-crawl-note">{crawlStatusText()}</p>
          </div>
        </div>

        <div className="news-list-panel blueprint">
          <BlueprintCorners />
          <div className="news-list-head">
            <h4 style={{ fontSize: 16, margin: 0 }}>Tin tức đã thu thập</h4>
            <div style={{ flex: 1 }} />
            <span className="text-muted mono" style={{ fontSize: 12 }}>
              {loading ? 'Đang tải…' : `${total} tin${summary?.model ? ` · model ${summary.model}` : ''}`}
            </span>
          </div>

          {error ? (
            <p className="text-muted">Lỗi: {error}</p>
          ) : !loading && items.length === 0 ? (
            <div className="news-empty">
              <p className="news-empty-title">Chưa có tin tức nào được thu thập</p>
              <p className="text-muted news-empty-sub">
                Crawler tin tức chưa được kích hoạt cho lần chạy này — danh sách sẽ hiện ở đây ngay khi có bài được
                thu thập và phân tích.
              </p>
            </div>
          ) : (
            <>
              <div className="news-list">
                {items.map((n) => (
                  <article key={n.id} className="news-item">
                    <div>
                      <div className="news-item-title">
                        {n.title}
                        {n.url && (
                          <a
                            className="news-item-link"
                            href={n.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Mở bài báo gốc trong tab mới"
                          >
                            Đọc bài gốc ↗
                          </a>
                        )}
                      </div>
                      <p className="text-muted news-item-summary">{n.summary}</p>
                      <div className="news-item-meta">
                        <span className="news-item-tag">Coin: {n.coin}</span>
                        <span className="news-item-tag news-item-tag-accent">
                          Model: {summary?.model ?? '—'}
                        </span>
                        <span className="text-muted mono" style={{ fontSize: 11 }}>
                          {n.source} · {fmtTime(n.publishedAt)} · confidence {fmtConfidence(n.sentimentScore)}
                        </span>
                      </div>
                    </div>
                    <div className="news-item-badge">
                      <SignalBadge label={n.sentiment ?? '—'} kind={sentimentKind(n.sentiment)} />
                    </div>
                  </article>
                ))}
              </div>

              <div className="news-pagination">
                <div className="text-muted" style={{ fontSize: 12 }}>
                  Hiển thị {total === 0 ? 0 : (page - 1) * NEWS_PAGE_SIZE + 1}–
                  {Math.min(page * NEWS_PAGE_SIZE, total)} của {total} tin
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`chip${p === page ? ' chip-on' : ''}`}
                      aria-pressed={p === page}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="news-side">
        <div className="news-summary-panel blueprint">
          <BlueprintCorners />
          <h4 style={{ fontSize: 16, margin: '0 0 10px' }}>Sentiment BTC ({SUMMARY_HOURS}h)</h4>

          {summaryError ? (
            <p className="text-muted">Lỗi: {summaryError}</p>
          ) : !summaryLoading && (!summary || summary.analyzed === 0) ? (
            <div className="news-empty">
              <p className="news-empty-title">Chưa có tin tức nào được phân tích</p>
              <p className="text-muted news-empty-sub">
                Sentiment tổng hợp sẽ hiện ở đây sau khi crawler thu thập và model NLP phân loại được ít nhất một
                bài trong {SUMMARY_HOURS}h gần nhất.
              </p>
            </div>
          ) : summary ? (
            <>
              <div className="news-summary-bar">
                <div
                  className="news-summary-seg news-summary-seg-positive"
                  style={{ width: fmtPct(summary.positive) }}
                >
                  {fmtPct(summary.positive)}
                </div>
                <div
                  className="news-summary-seg news-summary-seg-neutral"
                  style={{ width: fmtPct(summary.neutral) }}
                >
                  {fmtPct(summary.neutral)}
                </div>
                <div
                  className="news-summary-seg news-summary-seg-negative"
                  style={{ width: fmtPct(summary.negative) }}
                >
                  {fmtPct(summary.negative)}
                </div>
              </div>
              <div className="news-summary-legend">
                <span className="news-summary-legend-item">
                  <span className="news-summary-legend-dot news-summary-seg-positive" />
                  Positive
                </span>
                <span className="news-summary-legend-item">
                  <span className="news-summary-legend-dot news-summary-seg-neutral" />
                  Neutral
                </span>
                <span className="news-summary-legend-item">
                  <span className="news-summary-legend-dot news-summary-seg-negative" />
                  Negative
                </span>
              </div>
              <div className="news-summary-stats">
                <div className="news-summary-stat-row">
                  <span className="text-muted">Số tin đã phân tích</span>
                  <span className="mono">{summary.analyzed}</span>
                </div>
                <div className="news-summary-stat-row">
                  <span className="text-muted">Model đánh giá</span>
                  <span className="mono">{summary.model}</span>
                </div>
                <div className="news-summary-stat-row">
                  <span className="text-muted">Confidence trung bình</span>
                  <span className="mono">{summary.averageConfidence.toFixed(2)}</span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
