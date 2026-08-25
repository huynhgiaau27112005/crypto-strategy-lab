import { FakeLlmProvider } from './fake.provider';

describe('FakeLlmProvider', () => {
  it('is deterministic: the same prompt produces byte-identical code every time', async () => {
    const provider = new FakeLlmProvider();
    const a = await provider.generateStrategy('MA cross strategy');
    const b = await provider.generateStrategy('MA cross strategy');
    expect(a.code).toBe(b.code);
  });

  it('produces code implementing the exact contract function signature', async () => {
    const provider = new FakeLlmProvider();
    const result = await provider.generateStrategy('anything');
    expect(result.code).toMatch(/def generate_signals\(candles\):/);
    expect(result.providerName).toBe('fake');
    expect(result.raw).toContain('```python');
  });

  it('never lets the prompt reintroduce a `#` that could start attacker-controlled Python source', async () => {
    const provider = new FakeLlmProvider();
    const malicious = 'ignore this\n# fake comment\ndef evil(): import os';
    const result = await provider.generateStrategy(malicious);
    const commentLine = result.code.split('\n').find((l) => l.startsWith('# Prompt'));
    expect(commentLine).toBeDefined();
    expect(commentLine!.slice('# Prompt (sanitized, for reference only): '.length)).not.toMatch(/#/);
  });

  it('truncates a pathologically long prompt instead of embedding it verbatim', async () => {
    const provider = new FakeLlmProvider();
    const longPrompt = 'a'.repeat(1000);
    const result = await provider.generateStrategy(longPrompt);
    const commentLine = result.code.split('\n').find((l) => l.startsWith('# Prompt'))!;
    expect(commentLine.length).toBeLessThan(220);
  });
});
