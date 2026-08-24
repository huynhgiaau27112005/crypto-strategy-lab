// The `news` table has no `model` column — which model produced a row's
// sentiment is not stored per-row, it is a fact about the pipeline's
// current configuration. Per artifacts/decisions.md the sentiment model is
// FinBERT; this is reported as a configuration fact in the summary
// response, not derived from any row.
const DEFAULT_SENTIMENT_MODEL = 'FinBERT';

export function getConfiguredSentimentModel(): string {
  const configured = process.env.SENTIMENT_MODEL_NAME?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_SENTIMENT_MODEL;
}
