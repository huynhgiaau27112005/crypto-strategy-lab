import { Injectable } from '@nestjs/common';
import { SentimentLabel } from '../../database/types';
import { NewsRepository } from '../news/repositories/news.repository';
import { getConfiguredSentimentModel } from './config';

export interface SentimentSummary {
  positive: number;
  neutral: number;
  negative: number;
  analyzed: number;
  averageConfidence: number;
  model: string;
}

@Injectable()
export class SentimentService {
  constructor(private readonly newsRepository: NewsRepository) {}

  async summary(hours: number): Promise<SentimentSummary> {
    const groups = await this.newsRepository.summarizeSentiment(hours);

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
      averageConfidence: scoredCount === 0 ? 0 : weightedScoreSum / scoredCount,
      model: getConfiguredSentimentModel(),
    };
  }
}
