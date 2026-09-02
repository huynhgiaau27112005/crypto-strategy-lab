import { Injectable } from '@nestjs/common';
import { SentimentLabel } from '../../database/types';
import { NewsRepository } from '../news/repositories/news.repository';
import { getConfiguredSentimentModel } from './config';

export interface SentimentSummary {
  positive: number;
  neutral: number;
  negative: number;
  analyzed: number;
  /**
   * Articles published in the window, scored or not. `analyzed < total`
   * means the sentiment worker has not caught up (or could not score
   * them); `total === 0` means the window itself is empty. Those are very
   * different situations and the panel words them differently.
   */
  total: number;
  averageConfidence: number;
  model: string;
  /** The window this summary covers, echoed back so the UI can label it. */
  hours: number;
}

@Injectable()
export class SentimentService {
  constructor(private readonly newsRepository: NewsRepository) {}

  async summary(hours: number): Promise<SentimentSummary> {
    const [groups, total] = await Promise.all([
      this.newsRepository.summarizeSentiment(hours),
      this.newsRepository.countInWindow(hours),
    ]);

    const counts: Record<SentimentLabel, number> = {
      POSITIVE: 0,
      NEUTRAL: 0,
      NEGATIVE: 0,
    };
    let analyzed = 0;
    let weightedScoreSum = 0;
    let scoredCount = 0;

    for (const group of groups) {
      counts[group.sentiment] = group.count;
      analyzed += group.count;
      if (group.avgScore !== null) {
        weightedScoreSum += group.avgScore * group.count;
        scoredCount += group.count;
      }
    }

    // Percentages are computed here, in the service — never in SQL, never
    // in the frontend. A fresh/empty database (analyzed === 0) is the
    // normal first-demo state: return zeros rather than dividing by zero,
    // which would surface as NaN on screen.
    const shareOf = (count: number): number => (analyzed === 0 ? 0 : count / analyzed);

    return {
      positive: shareOf(counts.POSITIVE),
      neutral: shareOf(counts.NEUTRAL),
      negative: shareOf(counts.NEGATIVE),
      analyzed,
      total,
      averageConfidence: scoredCount === 0 ? 0 : weightedScoreSum / scoredCount,
      model: getConfiguredSentimentModel(),
      hours,
    };
  }
}
