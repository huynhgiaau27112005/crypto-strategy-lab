import { NewsRepository } from '../news/repositories/news.repository';
import { SentimentService } from './sentiment.service';

describe('SentimentService', () => {
  describe('summary', () => {
    it('returns all zeros (not NaN/Infinity) when there are no analyzed rows — the empty-database / first-demo case', async () => {
      const summarizeSentiment = jest.fn().mockResolvedValue([]);
      const newsRepository = { summarizeSentiment } as unknown as NewsRepository;
      const service = new SentimentService(newsRepository);

      const result = await service.summary(24);

      expect(result.positive).toBe(0);
      expect(result.neutral).toBe(0);
      expect(result.negative).toBe(0);
      expect(result.analyzed).toBe(0);
      expect(result.averageConfidence).toBe(0);
      expect(Number.isNaN(result.averageConfidence)).toBe(false);
      expect(Number.isFinite(result.averageConfidence)).toBe(true);
    });

    it('reports the configured model even with zero analyzed rows', async () => {
      const summarizeSentiment = jest.fn().mockResolvedValue([]);
      const newsRepository = { summarizeSentiment } as unknown as NewsRepository;
      const service = new SentimentService(newsRepository);

      const result = await service.summary(24);

      expect(result.model).toBe('FinBERT');
    });

    it('computes positive/neutral/negative as shares of analyzed, in the service (not SQL)', async () => {
      const summarizeSentiment = jest.fn().mockResolvedValue([
        { sentiment: 'POSITIVE', count: 6, avgScore: 0.9 },
        { sentiment: 'NEGATIVE', count: 2, avgScore: 0.7 },
      ]);
      const newsRepository = { summarizeSentiment } as unknown as NewsRepository;
      const service = new SentimentService(newsRepository);

      const result = await service.summary(24);

      expect(result.analyzed).toBe(8);
      expect(result.positive).toBeCloseTo(0.75);
      expect(result.negative).toBeCloseTo(0.25);
      expect(result.neutral).toBe(0);
    });

    it('computes averageConfidence as the count-weighted mean of per-group averages', async () => {
      const summarizeSentiment = jest.fn().mockResolvedValue([
        { sentiment: 'POSITIVE', count: 3, avgScore: 0.9 },
        { sentiment: 'NEUTRAL', count: 1, avgScore: 0.5 },
      ]);
      const newsRepository = { summarizeSentiment } as unknown as NewsRepository;
      const service = new SentimentService(newsRepository);

      const result = await service.summary(24);

      // (0.9*3 + 0.5*1) / 4 = 0.8
      expect(result.averageConfidence).toBeCloseTo(0.8);
    });

    it('passes the requested hours window through to the repository', async () => {
      const summarizeSentiment = jest.fn().mockResolvedValue([]);
      const newsRepository = { summarizeSentiment } as unknown as NewsRepository;
      const service = new SentimentService(newsRepository);

      await service.summary(72);

      expect(summarizeSentiment).toHaveBeenCalledWith(72);
    });
  });
});
