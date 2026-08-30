import { NewsRepository } from '../news/repositories/news.repository';
import { SentimentService } from './sentiment.service';

describe('SentimentService', () => {
  describe('summary', () => {
    it('returns all zeros (not NaN/Infinity) when there are no analyzed rows — the empty-database / first-demo case', async () => {
      const summarizeSentiment = jest.fn().mockResolvedValue([]);
      const countInWindow = jest.fn().mockResolvedValue(0);
      const newsRepository = { summarizeSentiment, countInWindow } as unknown as NewsRepository;
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
      const countInWindow = jest.fn().mockResolvedValue(0);
      const newsRepository = { summarizeSentiment, countInWindow } as unknown as NewsRepository;
      const service = new SentimentService(newsRepository);

      const result = await service.summary(24);

      expect(result.model).toBe('FinBERT');
    });

    it('computes positive/neutral/negative as shares of analyzed, in the service (not SQL)', async () => {
      const summarizeSentiment = jest.fn().mockResolvedValue([
        { sentiment: 'POSITIVE', count: 6, avgScore: 0.9 },
        { sentiment: 'NEGATIVE', count: 2, avgScore: 0.7 },
      ]);
      const countInWindow = jest.fn().mockResolvedValue(0);
      const newsRepository = { summarizeSentiment, countInWindow } as unknown as NewsRepository;
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
      const countInWindow = jest.fn().mockResolvedValue(0);
      const newsRepository = { summarizeSentiment, countInWindow } as unknown as NewsRepository;
      const service = new SentimentService(newsRepository);

      const result = await service.summary(24);

      // (0.9*3 + 0.5*1) / 4 = 0.8
      expect(result.averageConfidence).toBeCloseTo(0.8);
    });

    it('passes the requested hours window through to the repository', async () => {
      const summarizeSentiment = jest.fn().mockResolvedValue([]);
      const countInWindow = jest.fn().mockResolvedValue(0);
      const newsRepository = { summarizeSentiment, countInWindow } as unknown as NewsRepository;
      const service = new SentimentService(newsRepository);

      await service.summary(72);

      expect(summarizeSentiment).toHaveBeenCalledWith(72);
    });
  });

    // The panel says "30/39 tin đã phân tích". Without `total` it could
    // only show shares of an unstated base, so an empty panel next to a
    // full article list read as a broken panel rather than as "those
    // articles are outside the window, or not scored yet".
    it('reports how many articles are in the window at all, not just the analyzed ones', async () => {
      const summarizeSentiment = jest.fn().mockResolvedValue([
        { sentiment: 'POSITIVE', count: 8, avgScore: 0.4 },
        { sentiment: 'NEUTRAL', count: 16, avgScore: 0.05 },
        { sentiment: 'NEGATIVE', count: 6, avgScore: 0.4 },
      ]);
      const countInWindow = jest.fn().mockResolvedValue(39);
      const newsRepository = { summarizeSentiment, countInWindow } as unknown as NewsRepository;
      const service = new SentimentService(newsRepository);

      const result = await service.summary(168);

      expect(result.analyzed).toBe(30);
      expect(result.total).toBe(39);
      // Echoed back so the panel can label its own window instead of
      // hard-coding a number that has to be kept in step with the caller.
      expect(result.hours).toBe(168);
      expect(countInWindow).toHaveBeenCalledWith(168);
    });
});
