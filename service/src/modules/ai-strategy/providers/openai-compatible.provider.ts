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
    let res: Response;
    try {
      res = await fetch(url, {
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
    } catch (error) {
      // Node's fetch collapses every transport-level failure into a bare
      // `TypeError: fetch failed` whose message names neither the host nor
      // the cause, so the UI used to show exactly "Strategy generation
      // failed: fetch failed" — true, and completely unactionable. The real
      // cause hides in `error.cause.code`. This actually happened here: the
      // configured host had been retired and no longer resolved at all
      // (ENOTFOUND), which is indistinguishable from "the network is down"
      // unless the code says so.
      throw new Error(this.describeTransportFailure(error));
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      this.logger.error(`LLM provider request failed: ${res.status} ${res.statusText} ${bodyText.slice(0, 500)}`);
      // Include the provider's own message: a 4xx here is nearly always
      // either a bad/expired key or a discontinued endpoint, and the body
      // is the only place that distinction is stated.
      const detail = bodyText.trim() ? ` Provider said: ${bodyText.slice(0, 300).trim()}` : '';
      const hint =
        res.status === 401 || res.status === 403
          ? ' Kiểm tra OPENAI_API_KEY trong service/.env.'
          : res.status === 404 || res.status === 410
            ? ' Endpoint này có thể đã bị ngừng — kiểm tra OPENAI_BASE_URL/OPENAI_MODEL trong service/.env.'
            : '';
      throw new Error(
        `LLM provider (${this.baseUrl}, model ${this.model}) returned ${res.status} ${res.statusText}.${hint}${detail}`,
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

  /**
   * Turns Node's opaque `TypeError: fetch failed` into something the user
   * can act on. The useful code is on `error.cause`, not on the error
   * itself, so it is never visible in the default message.
   */
  private describeTransportFailure(error: unknown): string {
    const cause = (error as { cause?: { code?: string } } | undefined)?.cause;
    const code = cause?.code;
    const where = `${this.baseUrl} (model ${this.model})`;
    switch (code) {
      case 'ENOTFOUND':
      case 'EAI_AGAIN':
        return (
          `Không phân giải được tên miền của LLM provider: ${where}. ` +
          'Endpoint có thể đã bị ngừng hoạt động, hoặc máy đang mất mạng/DNS. ' +
          'Sửa OPENAI_BASE_URL trong service/.env rồi khởi động lại API.'
        );
      case 'ECONNREFUSED':
        return (
          `LLM provider từ chối kết nối: ${where}. ` +
          'Nếu đang dùng model chạy local (vd Ollama) thì tiến trình đó chưa chạy.'
        );
      case 'CERT_HAS_EXPIRED':
      case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
        return `Lỗi chứng chỉ TLS khi gọi LLM provider: ${where} (${code}).`;
      default:
        break;
    }
    if ((error as { name?: string })?.name === 'AbortError') {
      return `Gọi LLM provider bị huỷ/timeout: ${where}.`;
    }
    const raw = error instanceof Error ? error.message : String(error);
    return `Không gọi được LLM provider: ${where}. Nguyên nhân: ${code ?? raw}.`;
  }
}
