import { DatabaseService } from '../../database/database.service';
import { NewsSentimentPrecomputeService } from './news-sentiment-precompute.service';
import { CandleEntity } from '../../database/types';

function candle(iso: string): CandleEntity {
  return {
    timeframe: '1h',
    timestamp: new Date(iso),
    open: '100',
    high: '101',
    low: '99',
    close: '100',
    volume: '10',
  } as CandleEntity;
}

describe('NewsSentimentPrecomputeService', () => {
  function build(rows: unknown[]) {
    const query = jest.fn().mockResolvedValue({ rows });
    const database = { query } as unknown as DatabaseService;
    return { service: new NewsSentimentPrecomputeService(database), query };
  }

  it('returns an empty series for no candles without querying at all', async () => {
    const { service, query } = build([]);
    await expect(service.precompute([], 24)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('maps POSITIVE to +confidence, NEGATIVE to -confidence and NEUTRAL to 0', async () => {
    const { service } = build([
      { published_at: new Date('2026-01-01T00:30:00Z'), sentiment: 'POSITIVE', sentiment_score: '0.8' },
    ]);
    const [score] = await service.precompute([candle('2026-01-01T01:00:00Z')], 24);
    expect(score).toBeCloseTo(0.8);

    const neg = build([
      { published_at: new Date('2026-01-01T00:30:00Z'), sentiment: 'NEGATIVE', sentiment_score: '0.6' },
    ]);
    const [negScore] = await neg.service.precompute([candle('2026-01-01T01:00:00Z')], 24);
    expect(negScore).toBeCloseTo(-0.6);

    const neu = build([
      { published_at: new Date('2026-01-01T00:30:00Z'), sentiment: 'NEUTRAL', sentiment_score: '0.9' },
    ]);
    const [neuScore] = await neu.service.precompute([candle('2026-01-01T01:00:00Z')], 24);
    expect(neuScore).toBe(0);
  });

  it('averages every article inside the window', async () => {
    const { service } = build([
      { published_at: new Date('2026-01-01T00:10:00Z'), sentiment: 'POSITIVE', sentiment_score: '1' },
      { published_at: new Date('2026-01-01T00:20:00Z'), sentiment: 'NEGATIVE', sentiment_score: '0.5' },
    ]);
    const [score] = await service.precompute([candle('2026-01-01T01:00:00Z')], 24);
    expect(score).toBeCloseTo((1 - 0.5) / 2);
  });

  it('builds exact series for multiple lookbacks with one database query', async () => {
    const { service, query } = build([
      { published_at: new Date('2026-01-01T00:00:00Z'), sentiment: 'POSITIVE', sentiment_score: '1' },
      { published_at: new Date('2026-01-02T00:00:00Z'), sentiment: 'NEGATIVE', sentiment_score: '0.5' },
    ]);

    const series = await service.precomputeMany(
      [candle('2026-01-02T01:00:00Z')],
      [6, 48],
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(series.get(6)?.[0]).toBeCloseTo(-0.5);
    expect(series.get(48)?.[0]).toBeCloseTo(0.25);
  });

  // The core correctness property: a candle must only see news published
  // at or BEFORE it, and only within its own lookback window. Leaking a
  // future article backwards would be lookahead bias — the backtest would
  // trade on information it could not have had.
  it('never lets a candle see an article published after it (no lookahead bias)', async () => {
    const { service } = build([
      { published_at: new Date('2026-01-01T05:00:00Z'), sentiment: 'POSITIVE', sentiment_score: '1' },
    ]);
    const scores = await service.precompute(
      [candle('2026-01-01T01:00:00Z'), candle('2026-01-01T06:00:00Z')],
      24,
    );
    expect(scores[0]).toBeNull(); // article is in the future for this candle
    expect(scores[1]).toBeCloseTo(1);
  });

  it('drops articles that have aged out of the lookback window', async () => {
    const { service } = build([
      { published_at: new Date('2026-01-01T00:00:00Z'), sentiment: 'POSITIVE', sentiment_score: '1' },
    ]);
    const scores = await service.precompute(
      [candle('2026-01-01T01:00:00Z'), candle('2026-01-02T12:00:00Z')],
      6,
    );
    expect(scores[0]).toBeCloseTo(1);
    expect(scores[1]).toBeNull(); // older than 6h before this candle
  });

  it('yields null (not 0) for a candle whose window holds no article', async () => {
    const { service } = build([]);
    const scores = await service.precompute([candle('2026-01-01T01:00:00Z')], 24);
    expect(scores).toEqual([null]);
  });

  it('degrades to an all-null series instead of throwing when the news table cannot be read', async () => {
    const query = jest.fn().mockRejectedValue(new Error('relation "news" does not exist'));
    const database = { query } as unknown as DatabaseService;
    const service = new NewsSentimentPrecomputeService(database);

    const scores = await service.precompute(
      [candle('2026-01-01T01:00:00Z'), candle('2026-01-01T02:00:00Z')],
      24,
    );
    expect(scores).toEqual([null, null]);
  });
});
