import { newsQuerySchema } from './news-query.dto';

describe('newsQuerySchema', () => {
  it('defaults page=1, pageSize=20, sentiment=undefined when nothing is supplied', () => {
    const result = newsQuerySchema.parse({});
    expect(result).toEqual({ page: 1, pageSize: 20, sentiment: undefined });
  });

  it('accepts each of the three sentiment enum values', () => {
    for (const sentiment of ['POSITIVE', 'NEUTRAL', 'NEGATIVE']) {
      expect(newsQuerySchema.parse({ sentiment }).sentiment).toBe(sentiment);
    }
  });

  it('rejects a sentiment value outside the enum instead of passing it through', () => {
    const result = newsQuerySchema.safeParse({ sentiment: 'BULLISH' });
    expect(result.success).toBe(false);
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects page=%s', (page) => {
    const result = newsQuerySchema.safeParse({ page });
    expect(result.success).toBe(false);
  });

  it.each(['0', '-5', 'xyz'])('rejects pageSize=%s', (pageSize) => {
    const result = newsQuerySchema.safeParse({ pageSize });
    expect(result.success).toBe(false);
  });

  it('clamps pageSize to the maximum instead of rejecting an over-large request', () => {
    const result = newsQuerySchema.parse({ pageSize: '100000' });
    expect(result.pageSize).toBe(100);
  });

  it('accepts a valid explicit page and pageSize', () => {
    const result = newsQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(result).toEqual({ page: 3, pageSize: 50, sentiment: undefined });
  });
});
