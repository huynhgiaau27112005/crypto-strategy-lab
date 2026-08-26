import { Injectable } from '@nestjs/common';
import { NewsEntity, SentimentLabel } from '../../database/types';
import { NewsRepository } from './repositories/news.repository';
import { NEWS_MARKET_SCOPE_COIN, NEWS_SUMMARY_MAX_LENGTH } from './news.constants';

export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
  sentiment: SentimentLabel | null;
  sentimentScore: number | null;
  // Derived, not stored: the whole system's market scope is fixed to BTC
  // (see NEWS_MARKET_SCOPE_COIN), so every article carries the same label.
  coin: string;
}

export interface NewsListQuery {
  sentiment?: SentimentLabel;
  page: number;
  pageSize: number;
}

export interface NewsListResult {
  items: NewsItem[];
  total: number;
}

@Injectable()
export class NewsService {
  constructor(private readonly newsRepository: NewsRepository) {}

  async list(query: NewsListQuery): Promise<NewsListResult> {
    const { rows, total } = await this.newsRepository.findMany(
      query.sentiment,
      query.page,
      query.pageSize,
    );

    return {
      items: rows.map((row) => this.toNewsItem(row)),
      total,
    };
  }

  private toNewsItem(row: NewsEntity): NewsItem {
    return {
      id: row.id,
      title: row.title,
      summary: this.toSummary(row.content),
      source: row.source,
      url: row.url,
      publishedAt: row.published_at ? row.published_at.toISOString() : null,
      sentiment: row.sentiment,
      sentimentScore: row.sentiment_score === null ? null : Number(row.sentiment_score),
      coin: NEWS_MARKET_SCOPE_COIN,
    };
  }

  private toSummary(content: string | null): string | null {
    if (!content) return null;
    const text = this.stripHtml(content);
    if (!text) return null;
    if (text.length <= NEWS_SUMMARY_MAX_LENGTH) return text;
    return `${text.slice(0, NEWS_SUMMARY_MAX_LENGTH).trimEnd()}...`;
  }

  /**
   * Defence in depth for rows crawled BEFORE the normalizer learned to
   * strip HTML (workers/news/src/core/crawler/normalizer.py `_strip_html`).
   *
   * The crawler is the real fix — this is what stops rows already in the
   * table from rendering as `<p style="float: right..."><img ...>` in the
   * UI, without a data migration that would rewrite crawled history. It
   * also means the API can never hand markup to a client that renders it
   * as text, regardless of what any future provider puts in `content`.
   */
  private stripHtml(value: string): string {
    // No early return on "there are no tags": a feed can carry entities
    // (&amp;, &quot;) with no markup at all, and skipping the decode there
    // leaks them into the UI as literal text.
    return value
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
