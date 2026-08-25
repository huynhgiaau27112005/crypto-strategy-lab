import { FakeLlmProvider } from './fake.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { LlmProvider } from '../ai-strategy.types';

export const LLM_PROVIDER = 'LLM_PROVIDER';

/**
 * Config-driven provider selection (task-14 requirement): OPENAI_API_KEY
 * present -> real OpenAI-compatible provider (endpoint/model still fully
 * configurable via OPENAI_BASE_URL / OPENAI_MODEL); absent -> the
 * deterministic fake provider, so the app boots and every generate/save/run
 * path stays exercisable with no key and no network access. Nothing else
 * in this module imports either provider class directly — everyone depends
 * on the LlmProvider interface via this token.
 */
export function llmProviderFactory(): LlmProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new FakeLlmProvider();
  }
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  return new OpenAiCompatibleProvider(apiKey, baseUrl, model);
}
