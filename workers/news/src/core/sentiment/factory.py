"""
Selects a `SentimentProvider` implementation by configuration
(`SENTIMENT_PROVIDER` env var), so swapping models/APIs never touches
`main.py` or the crawler.

Also the single place that implements "sentiment must not lose a crawl":
if the configured provider fails to construct (model files missing,
dependency missing, etc.) this logs a warning and degrades instead of
raising and aborting the whole run.

Degradation order, and why it changed
-------------------------------------
FinBERT -> lexicon -> no-op. It used to be FinBERT -> no-op, and that made
a silent failure look like a working system: `workers/news/models/finbert/`
was never populated and torch/transformers live in the optional
`[sentiment]` extra, so the no-op branch was taken on EVERY run. All 39
stored articles had `sentiment = NULL`, which left the "Sentiment BTC"
panel permanently empty and made the NEWS_SENTIMENT strategy abstain on
every candidate of every backtest -- with nothing on screen saying why.

`LexiconSentimentProvider` needs no weights, no network and no third-party
packages, so the Analyze step of the required News Collect -> Store ->
Analyze pipeline now always produces something. `resolve_sentiment_provider()`
reports which one actually won, so the UI can name the model that really
scored the rows rather than claiming FinBERT unconditionally.

No-op remains reachable, but only when it is asked for explicitly
(`SENTIMENT_PROVIDER=none`) -- an intentional "don't score anything" is
fine; an accidental one is what caused this.
"""
import logging
import os
from pathlib import Path
from typing import NamedTuple, Optional

from core.sentiment.lexicon_provider import MODEL_NAME as LEXICON_MODEL_NAME
from core.sentiment.lexicon_provider import LexiconSentimentProvider
from core.sentiment.provider import NoopSentimentProvider, SentimentProvider

logger = logging.getLogger(__name__)

WORKER_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MODEL_PATH = WORKER_ROOT / "models" / "finbert"

FINBERT_MODEL_NAME = "FinBERT"
NOOP_MODEL_NAME = "none"


class ResolvedSentimentProvider(NamedTuple):
    provider: SentimentProvider
    """The model name to report to the UI -- the one that ACTUALLY scored,
    never the one that was merely configured."""
    model_name: str
    """Set when the configured provider could not be built and a weaker one
    took over, so the UI can explain the degradation instead of just
    showing a different model name."""
    degraded_from: Optional[str] = None


def resolve_sentiment_provider() -> ResolvedSentimentProvider:
    provider_name = os.environ.get("SENTIMENT_PROVIDER", "finbert").strip().lower()

    if provider_name in ("none", "noop", "disabled"):
        logger.info("Sentiment provider explicitly disabled (SENTIMENT_PROVIDER=%s).", provider_name)
        return ResolvedSentimentProvider(NoopSentimentProvider(), NOOP_MODEL_NAME)

    if provider_name == "lexicon":
        return ResolvedSentimentProvider(LexiconSentimentProvider(), LEXICON_MODEL_NAME)

    if provider_name == "finbert":
        model_path = os.environ.get("SENTIMENT_MODEL_PATH", str(DEFAULT_MODEL_PATH))
        try:
            from core.sentiment.finbert_provider import FinbertSentimentProvider

            return ResolvedSentimentProvider(
                FinbertSentimentProvider(model_path=model_path), FINBERT_MODEL_NAME
            )
        except Exception as error:
            # warning + reason, not logger.exception: a missing model
            # directory is an expected deployment state (the weights are a
            # ~440MB opt-in), and a full traceback on every single crawl
            # buries the one line that matters.
            logger.warning(
                "FinBERT unavailable (%s: %s) at %s; falling back to the %s provider. "
                "Install the [sentiment] extra and place the model files there for "
                "real classification.",
                type(error).__name__,
                error,
                model_path,
                LEXICON_MODEL_NAME,
            )
            return ResolvedSentimentProvider(
                LexiconSentimentProvider(), LEXICON_MODEL_NAME, degraded_from=FINBERT_MODEL_NAME
            )

    logger.warning(
        "Unknown SENTIMENT_PROVIDER=%s; falling back to the %s provider.",
        provider_name,
        LEXICON_MODEL_NAME,
    )
    return ResolvedSentimentProvider(LexiconSentimentProvider(), LEXICON_MODEL_NAME)


def get_sentiment_provider() -> SentimentProvider:
    """Back-compat wrapper for callers that only need the provider."""
    return resolve_sentiment_provider().provider
