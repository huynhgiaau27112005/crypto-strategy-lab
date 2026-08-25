import { StructuredLogger } from './structured-logger.service';
import { runWithCorrelationId } from '../correlation/correlation-context';

describe('StructuredLogger', () => {
  const secretToken = 'eyJhbGciOiJIUzI1NiJ9.super-secret-payload.signature-part';
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    process.env.LOG_FORMAT = 'json';
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    delete process.env.LOG_FORMAT;
  });

  it('never writes a raw Authorization token to the log output, even if a call site passes it in meta', () => {
    const logger = new StructuredLogger();
    logger.logWithMeta('Incoming request', 'HTTP', {
      headers: { authorization: `Bearer ${secretToken}` },
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const line = consoleSpy.mock.calls[0][0] as string;
    expect(line).not.toContain(secretToken);
    expect(line).toContain('[REDACTED]');
  });

  it('never writes a token-bearing object logged as the message itself', () => {
    const logger = new StructuredLogger();
    logger.log({ event: 'login', password: 'hunter2', apiKey: secretToken });

    const line = consoleSpy.mock.calls[0][0] as string;
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain(secretToken);
  });

  // Regression: stringifyMessage() used to return a string message
  // verbatim, skipping redactString()/BEARER_PATTERN/JWT_PATTERN entirely
  // — exactly the template-literal call shape used throughout the
  // codebase (e.g. openai-compatible.provider.ts logging a raw upstream
  // error body via `this.logger.error(\`... ${bodyText}\`)`).
  it('never writes a bearer token embedded in a plain string message', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const logger = new StructuredLogger();
    logger.error(`LLM provider request failed: 401 Unauthorized Authorization: Bearer ${secretToken}`);

    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).not.toContain(secretToken);
    expect(line).toContain('[REDACTED]');
    errorSpy.mockRestore();
  });

  it('never writes a bare JWT embedded in a plain string message with no Bearer prefix', () => {
    const logger = new StructuredLogger();
    logger.log(`refresh token issued: ${secretToken}`);

    const line = consoleSpy.mock.calls[0][0] as string;
    expect(line).not.toContain(secretToken);
    expect(line).toContain('[REDACTED]');
  });

  it('attaches the active correlation id to every log line', () => {
    const logger = new StructuredLogger();
    runWithCorrelationId('test-correlation-id', () => {
      logger.log('hello', 'Ctx');
    });

    const line = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.correlationId).toBe('test-correlation-id');
  });

  it('emits valid JSON lines when LOG_FORMAT=json', () => {
    const logger = new StructuredLogger();
    logger.log('hello world', 'Ctx');
    const line = consoleSpy.mock.calls[0][0] as string;
    expect(() => JSON.parse(line)).not.toThrow();
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ level: 'info', context: 'Ctx', message: 'hello world' });
  });

  it('emits human-readable pretty output when LOG_FORMAT=pretty', () => {
    process.env.LOG_FORMAT = 'pretty';
    const logger = new StructuredLogger();
    logger.log('hello world', 'Ctx');
    const line = consoleSpy.mock.calls[0][0] as string;
    expect(line).toContain('[Ctx]');
    expect(line).toContain('hello world');
    expect(() => JSON.parse(line)).toThrow();
  });
});
