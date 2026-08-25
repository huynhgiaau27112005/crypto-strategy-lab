import { Injectable } from '@nestjs/common';
import { GeneratedStrategy, LlmProvider } from '../ai-strategy.types';

/**
 * Deterministic provider used whenever OPENAI_API_KEY is not configured —
 * selected automatically by ai-strategy.module.ts's provider factory, and
 * always used in tests so `npm test` never makes a network call or spends
 * money (task-14 requirement). Same prompt in -> byte-identical code out,
 * every time.
 *
 * The generated function is a real, valid strategy (a simple SMA(5) vs
 * SMA(20) crossover) that passes the full validation gate — it exists to
 * exercise the whole generate -> validate -> save -> run pipeline
 * end-to-end without a real model, not to be a good trading idea.
 */
@Injectable()
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';

  async generateStrategy(prompt: string): Promise<GeneratedStrategy> {
    const code = this.buildCode(prompt);
    return {
      code,
      raw: '```python\n' + code + '\n```',
      providerName: this.name,
    };
  }

  private buildCode(prompt: string): string {
    const comment = sanitizeComment(prompt);
    return [
      `# Deterministic fake-provider output — generated without calling a real LLM.`,
      `# Prompt (sanitized, for reference only): ${comment}`,
      `def generate_signals(candles):`,
      `    closes = [c["close"] for c in candles]`,
      `    fast_window = 5`,
      `    slow_window = 20`,
      `    signals = []`,
      `    for i in range(len(closes)):`,
      `        if i + 1 < slow_window:`,
      `            signals.append("HOLD")`,
      `            continue`,
      `        fast_avg = sum(closes[i + 1 - fast_window:i + 1]) / fast_window`,
      `        slow_avg = sum(closes[i + 1 - slow_window:i + 1]) / slow_window`,
      `        if fast_avg > slow_avg:`,
      `            signals.append("BUY")`,
      `        elif fast_avg < slow_avg:`,
      `            signals.append("SELL")`,
      `        else:`,
      `            signals.append("HOLD")`,
      `    return signals`,
      '',
    ].join('\n');
  }
}

/** Keeps the prompt on one line and strips characters that would break a Python comment. */
function sanitizeComment(prompt: string): string {
  const oneLine = prompt.replace(/[\r\n]+/g, ' ').trim();
  const truncated = oneLine.length > 160 ? oneLine.slice(0, 160) + '…' : oneLine;
  return truncated.replace(/#/g, '');
}
