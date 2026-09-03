import { resolveLlmProvider } from './llm-provider.factory';

describe('resolveLlmProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reports unavailable and rejects generation instead of returning canned code', async () => {
    const resolved = resolveLlmProvider();

    expect(resolved.keySource).toBeNull();
    expect(resolved.provider.name).toBe('unavailable');
    await expect(
      resolved.provider.generateStrategy('Generate an RSI strategy'),
    ).rejects.toThrow('Chưa cấu hình LLM provider');
  });

  it('uses the OpenAI-compatible provider when an OpenRouter key exists', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    const resolved = resolveLlmProvider();

    expect(resolved.keySource).toBe('OPENROUTER_API_KEY');
    expect(resolved.provider.name).toBe('openai-compatible');
    expect(resolved.baseUrl).toBe('https://openrouter.ai/api/v1');
  });
});
