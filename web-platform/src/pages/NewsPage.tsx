import { useState } from 'react'
import BlueprintCorners from '../components/BlueprintCorners'
import Chip from '../components/Chip'
import SignalBadge, { type SignalKind } from '../components/SignalBadge'
import { useNews } from '../hooks/useNews'
import { useSentimentSummary } from '../hooks/useSentimentSummary'
import type { SentimentLabel } from '../api/types'

const NEWS_PAGE_SIZE = 8
const SUMMARY_HOURS = 24

const SENTIMENT_FILTERS: { value: SentimentLabel | null; label: string }[] = [
  { value: null, label: 'Tất cả' },
  { value: 'POSITIVE', label: 'Pos' },
  { value: 'NEUTRAL', label: 'Neu' },
  { value: 'NEGATIVE', label: 'Neg' },
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

  const { items, total, loading, error } = useNews(sentiment, page, NEWS_PAGE_SIZE)
  const { data: summary, loading: summaryLoading, error: summaryError } = useSentimentSummary(SUMMARY_HOURS)

  const pages = Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE))

  const selectSentiment = (value: SentimentLabel | null) => {
    setSentiment(value)
    setPage(1)
  }

  // Crawl-trigger endpoint does not exist yet (see task-10 report). This
  // handler is the single, obvious place a follow-up task wires the real
  // POST call into — the button stays disabled until then so it never
  // silently does nothing when clicked.
  const handleCrawlClick = () => {
    // TODO(follow-up task): call the crawl-trigger endpoint once it exists.
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
            <button
              type="button"
              className="chip"
              disabled
              title="Endpoint kích hoạt crawl chưa tồn tại — sẽ được nối ở task sau."
              onClick={handleCrawlClick}
            >
              Crawl tin tức
            </button>
            <p className="news-crawl-note">Chưa có endpoint kích hoạt crawl — nút sẽ được kích hoạt ở bước sau.</p>
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
                      <div className="news-item-title">{n.title}</div>
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
