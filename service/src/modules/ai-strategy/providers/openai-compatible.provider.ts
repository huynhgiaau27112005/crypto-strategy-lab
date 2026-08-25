import { Injectable, Logger } from '@nestjs/common';
import { CONTRACT_SYSTEM_PROMPT, extractPythonCode } from '../contract-prompt';
import { GeneratedStrategy, LlmProvider } from '../ai-strategy.types';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * Talks to any OpenAI-compatible /chat/completions endpoint. Driven
 * entirely by env vars (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL) —
 * swapping model or endpoint is a config change, never a code change. This
 * is the concrete answer to the project's "no hard-coded model" rule
 * (docs/about-projects/03-anti-patterns-to-avoid.md).
 *
 * Selected by ai-strategy.module.ts's provider factory only when
 * OPENAI_API_KEY is set; otherwise FakeLlmProvider is used instead, so this
 * class is never touched by the test suite (no network, no cost).
 */
@Injectable()
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async generateStrategy(prompt: string): Promise<GeneratedStrategy> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: CONTRACT_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      this.logger.error(`LLM provider request failed: ${res.status} ${res.statusText} ${bodyText.slice(0, 500)}`);
      throw new Error(
        `LLM provider (${this.baseUrl}, model ${this.model}) returned ${res.status} ${res.statusText}.`,
      );
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM provider returned an empty response (no choices[0].message.content).');
    }

    return {
      code: extractPythonCode(content),
      raw: content,
      providerName: this.name,
    };
  }
}
