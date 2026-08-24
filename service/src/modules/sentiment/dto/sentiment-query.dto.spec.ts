import { sentimentSummaryQuerySchema } from './sentiment-query.dto';

describe('sentimentSummaryQuerySchema', () => {
  it('defaults hours=24 when not supplied', () => {
    expect(sentimentSummaryQuerySchema.parse({}).hours).toBe(24);
  });

  it('accepts a valid explicit hours value', () => {
    expect(sentimentSummaryQuerySchema.parse({ hours: '72' }).hours).toBe(72);
  });

  it.each(['0', '-1', 'abc'])('rejects hours=%s', (hours) => {
    const result = sentimentSummaryQuerySchema.safeParse({ hours });
    expect(result.success).toBe(false);
  });

  it('clamps an excessively large hours value to the maximum instead of rejecting it', () => {
    const result = sentimentSummaryQuerySchema.parse({ hours: '999999' });
    expect(result.hours).toBe(24 * 365);
  });
});
