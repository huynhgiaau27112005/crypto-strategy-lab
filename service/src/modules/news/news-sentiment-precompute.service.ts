import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CandleEntity } from '../../database/types';

interface SentimentRow {
  published_at: Date;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null;
  sentiment_score: string | null;
}

/**
 * Turns the `news` table into a per-candle signed sentiment series that
 * NewsSentimentPlugin can read in O(1), computed ONCE per run.
 *
 * Why precompute (same reasoning as AiStrategySignalPrecomputeService): a
 * backtest walks thousands of candles and every candidate in a run shares
 * the same candle series. Querying `news` per candle — let alone per
 * candle per candidate — would be thousands of round-trips for data that
 * never changes during the run, and would also put a database call inside
 * a strategy, which the brief's anti-pattern list forbids.
 *
 * Signed score: FinBERT gives a label plus a 0..1 confidence, but the
 * brief's rule (#30) is a signed average crossing +/- a threshold. So
 * POSITIVE -> +confidence, NEGATIVE -> -confidence, NEUTRAL -> 0. A candle
 * whose lookback window contains no articles gets `null`, NOT 0 — "no
 * coverage" and "coverage that averages out to neutral" are different
 * facts, and only the plugin should decide what to do about the former.
 */
@Injectable()
export class NewsSentimentPrecomputeService {
  private readonly logger = new Logger(NewsSentimentPrecomputeService.name);

  constructor(private readonly database: DatabaseService) {}

  async precompute(
    candles: CandleEntity[],
    lookbackHours: number,
  ): Promise<Array<number | null>> {
    if (candles.length === 0) return [];

    const firstTs = new Date(candles[0].timestamp).getTime();
    const lastTs = new Date(candles[candles.length - 1].timestamp).getTime();
    const windowMs = Math.max(1, lookbackHours) * 3_600_000;

    let rows: SentimentRow[];
    try {
      const result = await this.database.query<SentimentRow>(
        `SELECT published_at, sentiment, sentiment_score
         FROM news
         WHERE published_at IS NOT NULL
           AND sentiment IS NOT NULL
           AND published_at >= $1 AND published_at <= $2
         ORDER BY published_at ASC`,
        [new Date(firstTs - windowMs), new Date(lastTs)],
      );
      rows = result.rows;
    } catch (error) {
      // Sentiment data is supplementary: a failure here must degrade the
      // sentiment member to "abstain everywhere", never fail the search.
      this.logger.warn(
        `Could not load news sentiment; sentiment members will abstain: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return candles.map(() => null);
    }

    const points = rows
      .map((row) => ({
        at: new Date(row.published_at).getTime(),
        score: this.signedScore(row),
      }))
      .filter((p) => p.score !== null) as Array<{ at: number; score: number }>;

    if (points.length === 0) return candles.map(() => null);

    // Two-pointer sweep over the time-ordered arrays — O(candles + news)
    // rather than a window scan per candle.
    const out: Array<number | null> = [];
    let start = 0;
    let end = 0;
    let sum = 0;
    let count = 0;
    for (const candle of candles) {
      const at = new Date(candle.timestamp).getTime();
      const from = at - windowMs;
      while (end < points.length && points[end].at <= at) {
        sum += points[end].score;
        count += 1;
        end += 1;
      }
      while (start < end && points[start].at < from) {
        sum -= points[start].score;
        count -= 1;
        start += 1;
      }
      out.push(count > 0 ? sum / count : null);
    }
    return out;
  }

  private signedScore(row: SentimentRow): number | null {
    const confidence = row.sentiment_score === null ? 1 : Number(row.sentiment_score);
    if (!Number.isFinite(confidence)) return null;
    if (row.sentiment === 'POSITIVE') return confidence;
    if (row.sentiment === 'NEGATIVE') return -confidence;
    if (row.sentiment === 'NEUTRAL') return 0;
    return null;
  }
}
