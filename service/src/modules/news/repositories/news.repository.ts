import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { NewsEntity, SentimentLabel } from '../../../database/types';

export interface NewsPage {
  rows: NewsEntity[];
  total: number;
}

export interface SentimentCountRow {
  sentiment: SentimentLabel;
  count: number;
  avgScore: number | null;
}

const SELECT_COLUMNS = `id, title, content, source, published_at, url, sentiment, sentiment_score`;

@Injectable()
export class NewsRepository {
  constructor(private readonly database: DatabaseService) {}

  // Lists news rows, newest first, optionally filtered by sentiment. The
  // WHERE clause is only added when a sentiment filter is supplied — an
  // absent filter must not become `WHERE sentiment = NULL`, which would
  // silently match zero rows instead of "no filter".
  async findMany(
    sentiment: SentimentLabel | undefined,
    page: number,
    pageSize: number,
  ): Promise<NewsPage> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (sentiment) {
      params.push(sentiment);
      conditions.push(`sentiment = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const pageParams = [...params, pageSize, offset];
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;

    const rowsResult = await this.database.query<NewsEntity>(
      `SELECT ${SELECT_COLUMNS}
       FROM news
       ${whereClause}
       ORDER BY published_at DESC NULLS LAST, crawled_at DESC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      pageParams,
    );

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM news ${whereClause}`,
      params,
    );

    return {
      rows: rowsResult.rows,
      total: Number(countResult.rows[0]?.count ?? 0),
    };
  }

  // Aggregates analyzed (sentiment IS NOT NULL) news published within the
  // last `hours` hours, grouped by sentiment label. Rows not yet analyzed
  // by the sentiment worker (sentiment IS NULL) are excluded — they are
  // not "unanalyzed = NEGATIVE" or any other label, they simply have not
  // been counted yet.
  async summarizeSentiment(hours: number): Promise<SentimentCountRow[]> {
    const result = await this.database.query<{
      sentiment: SentimentLabel;
      count: string;
      avg_score: string | null;
    }>(
      `SELECT sentiment, COUNT(*)::int AS count, AVG(sentiment_score) AS avg_score
       FROM news
       WHERE published_at >= now() - make_interval(hours => $1::int)
         AND sentiment IS NOT NULL
       GROUP BY sentiment`,
      [hours],
    );

    return result.rows.map((row) => ({
      sentiment: row.sentiment,
      count: Number(row.count),
      avgScore: row.avg_score === null ? null : Number(row.avg_score),
    }));
  }
}
