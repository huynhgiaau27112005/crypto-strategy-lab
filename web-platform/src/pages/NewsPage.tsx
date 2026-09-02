import { useEffect, useState } from 'react'
import BlueprintCorners from '../components/BlueprintCorners'
import Chip from '../components/Chip'
import SignalBadge, { type SignalKind } from '../components/SignalBadge'
import { useNews } from '../hooks/useNews'
import { useNewsCrawl } from '../state/NewsCrawlContext'
import { useSentimentSummary } from '../hooks/useSentimentSummary'
import type { SentimentLabel, SentimentSummaryDto } from '../api/types'
import { MARKET_BASE_ASSET } from '../lib/marketScope'

const NEWS_PAGE_SIZE = 8
/**
 * Window for the sentiment summary panel.
 *
 * Was 24h, which made the panel look permanently broken: RSS feeds only
 * carry the newest ~20-30 articles and most of them are older than a day,
 * so the panel covered 5 of the 39 stored articles while the list beside
 * it showed all 39. Seven days keeps the panel in step with what the user
 * can actually see.
 */
const SUMMARY_HOURS = 24 * 7
const SUMMARY_WINDOW_LABEL = '7 ngày'

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

import { fmtDateTimeVN } from '../lib/datetime'

function fmtConfidence(score: number | null): string {
  return score != null ? score.toFixed(2) : '—'
}

function fmtPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/**
 * "Chưa có tin tức nào được phân tích" was shown for three completely
 * different situations, and for months it was really the third one: the
 * sentiment provider had never run at all (FinBERT's weights were never
 * installed, so the worker degraded to a no-op and every row was stored
 * with sentiment = NULL). A single message meant nothing on screen ever
 * pointed at that. These split the cases apart.
 */
function emptySummaryTitle(summary: SentimentSummaryDto | null): string {
  if (!summary || summary.total === 0) return `Chưa có tin nào trong ${SUMMARY_WINDOW_LABEL} gần nhất`
  return 'Có tin nhưng chưa bài nào được chấm sentiment'
}

function emptySummarySub(summary: SentimentSummaryDto | null): string {
  if (!summary || summary.total === 0) {
    return `Crawler chưa thu thập được bài nào có ngày đăng trong ${SUMMARY_WINDOW_LABEL} gần nhất. Bật crawl ở trên để thu thập thêm.`
  }
  return `${summary.total} tin trong ${SUMMARY_WINDOW_LABEL} gần nhất nhưng 0 tin có nhãn sentiment — provider sentiment (${summary.model}) không chạy được. Kiểm tra log worker; chạy lại crawl sẽ chấm lại toàn bộ lô.`
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
    autoCrawlEnabled,
    crawlActive,
    triggerCrawl,
    stopCrawl,
    stopping: crawlStopping,
  } = useNewsCrawl()

  const handleCrawlStop = () => {
    void stopCrawl()
  }

  const pages = Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE))
  // The crawl LOOP, not one batch: between batches the poll state is
  // 'terminal' for a few seconds, and keying the Stop button off
  // `crawlState === 'polling'` made it vanish exactly then. See
  // NewsCrawlContext's `crawlActive`.
  const crawlRunning = crawlActive
  /** True only while a batch is genuinely executing (drives the spinner). */
  const batchRunning = crawlState === 'polling'

  const selectSentiment = (value: SentimentLabel | null) => {
    setSentiment(value)
    setPage(1)
  }

  // Once the worker process reaches a terminal state, refetch the article
  // list and summary panel so newly-crawled/scored articles show up
  // without a manual page reload.
  useEffect(() => {
    if (
      crawlState === 'terminal' &&
      (crawlJob?.status === 'COMPLETED' || crawlJob?.status === 'CANCELLED')
    ) {
      setRefreshToken((t) => t + 1)
    }
  }, [crawlState, crawlJob])

  const handleCrawlClick = () => {
    if (crawlRunning) return
    void triggerCrawl()
  }

  /**
   * What the last finished batch actually wrote.
   *
   * RSS feeds only carry the newest ~20-30 articles, so a crawl run a
   * minute after the previous one legitimately stores zero new rows and
   * merely refreshes what is already there. Without this line the UI was
   * indistinguishable from a broken crawler — the list simply never
   * changed. `summary === null` means the worker reported nothing, which
   * is NOT the same as "0 new" and is worded differently.
   */
  /**
   * The model that ACTUALLY scored the most recent batch, falling back to
   * the configured name. These differ whenever FinBERT's weights are
   * missing and the worker degrades to the lexicon provider — and showing
   * the configured name there would be a straight misreport of how the
   * labels on screen were produced.
   */
  const scoringModel = crawlJob?.summary?.model ?? summary?.model ?? null

  const crawlSummaryText = (): string | null => {
    if (!crawlJob || crawlJob.status === 'RUNNING') return null
    const summary = crawlJob.summary
    if (!summary) return 'Lô vừa rồi: worker không báo số liệu.'
    if (summary.new === 0) {
      return `Lô vừa rồi: 0 tin mới (đã làm mới ${summary.updated} tin cũ — nguồn RSS chưa đăng bài nào mới).`
    }
    return `Lô vừa rồi: +${summary.new} tin mới, ${summary.updated} tin đã có (${summary.scored} tin được chấm sentiment).`
  }

  const crawlStatusText = (): string => {
    if (crawlStopping) return 'Đang dừng worker…'
    if (crawlState === 'polling') return 'Đang crawl tự động — bấm Dừng để tắt.'
    if (crawlState === 'timeout') return 'Hết thời gian chờ trạng thái crawl.'
    if (crawlState === 'error') return crawlError ?? 'Lỗi khi crawl.'
    if (crawlState === 'terminal' && crawlJob) {
      if (crawlJob.status === 'CANCELLED') return 'Bạn đã dừng crawl.'
      if (crawlJob.status === 'COMPLETED') {
        return autoCrawlEnabled
          ? 'Crawl xong — sẽ tự chạy lại sau vài giây.'
          : 'Crawl xong — tự động đã tắt.'
      }
      return `Crawl thất bại: ${crawlJob.error ?? 'không rõ lỗi'}`
    }
    if (!autoCrawlEnabled) return 'Crawl tự động đã tắt — bấm nút bên cạnh để bật lại.'
    return 'Crawler tự chạy khi mở workspace — chỉ dừng khi bạn bấm Dừng.'
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
                title="Dừng crawl — tiến trình worker được kết thúc ngay, không chạy lại nữa."
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
                title="Bật crawl tự động — crawler sẽ chạy liên tục cho đến khi bạn dừng."
                onClick={handleCrawlClick}
              >
                <BlueprintCorners />
                Bật crawl tự động
              </button>
            )}
            {batchRunning && !crawlStopping && (
              <div className="news-crawl-progress" aria-live="polite">
                <span className="news-crawl-spinner" aria-hidden="true" />
                <span>Đang crawl &amp; phân tích sentiment…</span>
              </div>
            )}
            <p className="news-crawl-note">{crawlStatusText()}</p>
            {crawlSummaryText() && (
              <p className="news-crawl-note" aria-live="polite">
                {crawlSummaryText()}
              </p>
            )}
          </div>
        </div>

        <div className="news-list-panel blueprint">
          <BlueprintCorners />
          <div className="news-list-head">
            <h4 style={{ fontSize: 16, margin: 0 }}>Tin tức đã thu thập</h4>
            <div style={{ flex: 1 }} />
            <span className="text-muted mono" style={{ fontSize: 12 }}>
              {loading ? 'Đang tải…' : `${total} tin${scoringModel ? ` · model ${scoringModel}` : ''}`}
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
                          Model: {scoringModel ?? '—'}
                        </span>
                        <span className="text-muted mono" style={{ fontSize: 11 }}>
                          {n.source} · {fmtDateTimeVN(n.publishedAt)} · confidence {fmtConfidence(n.sentimentScore)}
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
          <h4 style={{ fontSize: 16, margin: '0 0 10px' }}>
            Sentiment {MARKET_BASE_ASSET} ({SUMMARY_WINDOW_LABEL})
          </h4>

          {summaryError ? (
            <p className="text-muted">Lỗi: {summaryError}</p>
          ) : !summaryLoading && (!summary || summary.analyzed === 0) ? (
            <div className="news-empty">
              <p className="news-empty-title">{emptySummaryTitle(summary)}</p>
              <p className="text-muted news-empty-sub">{emptySummarySub(summary)}</p>
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
                  {/* Shown as a fraction so a partially-scored window reads
                      as "the worker has not caught up" rather than as a
                      smaller corpus than the list beside it. */}
                  <span className="mono">
                    {summary.analyzed}/{summary.total}
                  </span>
                </div>
                <div className="news-summary-stat-row">
                  <span className="text-muted">Model đánh giá</span>
                  <span className="mono">{scoringModel ?? summary.model}</span>
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
