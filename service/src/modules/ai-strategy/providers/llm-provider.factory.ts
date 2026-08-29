import { FakeLlmProvider } from './fake.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { LlmProvider } from '../ai-strategy.types';

export const LLM_PROVIDER = 'LLM_PROVIDER';

/** Default endpoint per key variable, so only the key is mandatory. */
const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export interface ResolvedLlmProvider {
  provider: LlmProvider;
  /** Which env var supplied the key, or null when none did. */
  keySource: 'OPENAI_API_KEY' | 'OPENROUTER_API_KEY' | null;
  baseUrl: string | null;
  model: string | null;
}

/**
 * Resolves the LLM provider from the environment.
 *
 * Both OPENAI_API_KEY and OPENROUTER_API_KEY are accepted: the
 * architecture notes name OpenRouter as the hosted LLM, but only
 * OPENAI_API_KEY used to be read, so a correctly-configured
 * OPENROUTER_API_KEY silently fell through to FakeLlmProvider and the tab
 * kept returning canned Python with no indication why. Either key selects
 * the OpenAI-compatible provider (OpenRouter speaks that protocol);
 * endpoint and model stay fully configurable, so switching model or vendor
 * is still a config change, never a code change.
 *
 * Exported separately from the Nest factory so the controller can report
 * which provider is live without duplicating this precedence logic.
 */
export function resolveLlmProvider(): ResolvedLlmProvider {
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();

  if (openAiKey) {
    const baseUrl = process.env.OPENAI_BASE_URL?.trim() || OPENAI_DEFAULT_BASE_URL;
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
    return {
      provider: new OpenAiCompatibleProvider(openAiKey, baseUrl, model),
      keySource: 'OPENAI_API_KEY',
      baseUrl,
      model,
    };
  }

  if (openRouterKey) {
    const baseUrl =
      process.env.OPENROUTER_BASE_URL?.trim() ||
      process.env.OPENAI_BASE_URL?.trim() ||
      OPENROUTER_DEFAULT_BASE_URL;
    const model =
      process.env.OPENROUTER_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      'openai/gpt-4o-mini';
    return {
      provider: new OpenAiCompatibleProvider(openRouterKey, baseUrl, model),
      keySource: 'OPENROUTER_API_KEY',
      baseUrl,
      model,
    };
  }

  // No key: the deterministic fake keeps the app bootable and every
  // generate/validate/save/run path exercisable with no network access.
  return {
    provider: new FakeLlmProvider(),
    keySource: null,
    baseUrl: null,
    model: null,
  };
}

export function llmProviderFactory(): LlmProvider {
  return resolveLlmProvider().provider;
}
