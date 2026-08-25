import { generateStrategySchema, runStrategySchema, saveStrategySchema } from './ai-strategy.dto';

describe('generateStrategySchema', () => {
  it('accepts a normal prompt', () => {
    const result = generateStrategySchema.safeParse({ prompt: 'MA cross strategy' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty prompt', () => {
    const result = generateStrategySchema.safeParse({ prompt: '' });
    expect(result.success).toBe(false);
  });

  // The UI caps the textarea at 1000 chars — this is the server-side
  // enforcement of the same limit, since the frontend cannot be trusted
  // to enforce it (business logic must not live only in the frontend).
  it('rejects a prompt over 1000 characters', () => {
    const result = generateStrategySchema.safeParse({ prompt: 'a'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('accepts a prompt at exactly 1000 characters', () => {
    const result = generateStrategySchema.safeParse({ prompt: 'a'.repeat(1000) });
    expect(result.success).toBe(true);
  });

  it('rejects a missing prompt field', () => {
    const result = generateStrategySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('saveStrategySchema', () => {
  it('accepts a valid name, code, and domain', () => {
    const result = saveStrategySchema.safeParse({
      name: 'MY_STRATEGY_1',
      code: 'def generate_signals(candles):\n    return []',
      domain: 'MOMENTUM',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a name with spaces or special characters', () => {
    const result = saveStrategySchema.safeParse({ name: 'my strategy!', code: 'x', domain: 'MOMENTUM' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty code field', () => {
    const result = saveStrategySchema.safeParse({ name: 'OK', code: '', domain: 'MOMENTUM' });
    expect(result.success).toBe(false);
  });

  // A domain is required, not defaulted — an AI strategy without one
  // cannot be combined into a search candidate (see search.types.ts's
  // strategyRowDomain). This is what actually forces the choice at save
  // time instead of a silent default.
  it('rejects a missing domain', () => {
    const result = saveStrategySchema.safeParse({ name: 'OK', code: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a domain outside the fixed 4-value set', () => {
    const result = saveStrategySchema.safeParse({ name: 'OK', code: 'x', domain: 'BOGUS' });
    expect(result.success).toBe(false);
  });
});

describe('runStrategySchema', () => {
  it('defaults timeframe and limit when omitted', () => {
    const result = runStrategySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeframe).toBe('1h');
      expect(result.data.limit).toBe(200);
    }
  });

  it('rejects a limit outside the bounded range', () => {
    const result = runStrategySchema.safeParse({ limit: 100000 });
    expect(result.success).toBe(false);
  });

  it('accepts an explicit candle series', () => {
    const result = runStrategySchema.safeParse({
      candles: [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
    });
    expect(result.success).toBe(true);
  });
});
