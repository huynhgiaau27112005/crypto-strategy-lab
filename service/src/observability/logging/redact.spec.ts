import { redact } from './redact';

describe('redact', () => {
  it('redacts an Authorization header value regardless of key casing', () => {
    const input = { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature' };
    const output = redact(input) as Record<string, unknown>;
    expect(output.Authorization).toBe('[REDACTED]');
    expect(JSON.stringify(output)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts password fields', () => {
    const input = { email: 'a@b.com', password: 'hunter2', newPassword: 'hunter3' };
    const output = redact(input) as Record<string, unknown>;
    expect(output.password).toBe('[REDACTED]');
    expect(output.newPassword).toBe('[REDACTED]');
    expect(output.email).toBe('a@b.com');
  });

  it('redacts refresh tokens, JWTs and API key fields nested in an object', () => {
    const input = {
      user: { id: 1 },
      refreshToken: 'abc.def.ghi',
      llm: { apiKey: 'sk-real-secret-value' },
      binance: { BINANCE_API_KEY: 'real-key', BINANCE_API_SECRET: 'real-secret' },
    };
    const output = redact(input) as any;
    expect(output.refreshToken).toBe('[REDACTED]');
    expect(output.llm.apiKey).toBe('[REDACTED]');
    expect(output.binance.BINANCE_API_KEY).toBe('[REDACTED]');
    expect(output.binance.BINANCE_API_SECRET).toBe('[REDACTED]');
    expect(output.user).toEqual({ id: 1 });
    expect(JSON.stringify(output)).not.toContain('real-secret');
    expect(JSON.stringify(output)).not.toContain('sk-real-secret-value');
  });

  it('redacts a bearer token embedded in a plain message string', () => {
    const message = 'Rejected request with Authorization: Bearer abc123.def456.ghi789';
    expect(redact(message)).toBe('Rejected request with Authorization: Bearer [REDACTED]');
  });

  it('redacts a bare JWT-shaped string even without a Bearer prefix', () => {
    const message = 'token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.dGVzdHNpZ25hdHVyZQ';
    expect(redact(message)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('leaves non-sensitive structured data untouched', () => {
    const input = { method: 'GET', route: '/health/live', status: 200, durationMs: 12 };
    expect(redact(input)).toEqual(input);
  });

  it('does not throw on circular references', () => {
    const input: Record<string, unknown> = { a: 1 };
    input.self = input;
    expect(() => redact(input)).not.toThrow();
  });

  // The exact scenario task-18 calls out: an object carrying a real token
  // must never come out of redact() containing that token verbatim.
  it('fails the whole test if a token-bearing object is logged verbatim', () => {
    const secretToken = 'eyJhbGciOiJIUzI1NiJ9.super-secret-payload.signature-part';
    const logPayload = { authorization: `Bearer ${secretToken}`, note: 'login attempt' };
    const redacted = JSON.stringify(redact(logPayload));
    expect(redacted).not.toContain(secretToken);
  });
});
