// The `news` table has no `model` column — which model produced a row's
// sentiment is not stored per-row, it is a fact about the pipeline's
// current configuration.
//
// This used to return the literal 'FinBERT' unconditionally, which was
// simply false: FinBERT's weights are a ~440MB opt-in that was never
// installed, so the worker degraded to another provider and the UI
// reported a model that had never run. The name is now derived from the
// same `SENTIMENT_PROVIDER` value the worker resolves against.
//
// This is still the CONFIGURED provider, not proof of what scored a given
// row — the worker reports the one that actually ran on each batch through
// the crawl summary (`GET /news/crawl/status` -> `summary.model`), and the
// UI prefers that when it has it.
const PROVIDER_MODEL_NAMES: Record<string, string> = {
  finbert: 'FinBERT',
  lexicon: 'lexicon-v1',
  none: 'none',
  noop: 'none',
  disabled: 'none',
};

const DEFAULT_PROVIDER = 'finbert';

export function getConfiguredSentimentModel(): string {
  const explicitName = process.env.SENTIMENT_MODEL_NAME?.trim();
  if (explicitName) return explicitName;
  const provider = process.env.SENTIMENT_PROVIDER?.trim().toLowerCase() || DEFAULT_PROVIDER;
  return PROVIDER_MODEL_NAMES[provider] ?? provider;
}
