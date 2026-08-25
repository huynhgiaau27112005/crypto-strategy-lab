"""
Selects a `SentimentProvider` implementation by configuration
(`SENTIMENT_PROVIDER` env var), so swapping models/APIs never touches
`main.py` or the crawler.

Also the single place that implements "sentiment must not lose a crawl":
if the configured provider fails to construct (model files missing,
dependency missing, etc.) this logs a warning and falls back to
`NoopSentimentProvider`, which scores everything as unknown (None) rather
than raising and aborting the whole run.
"""
import logging
import os
from pathlib import Path

from core.sentiment.provider import NoopSentimentProvider, SentimentProvider

logger = logging.getLogger(__name__)

WORKER_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MODEL_PATH = WORKER_ROOT / "models" / "finbert"


def get_sentiment_provider() -> SentimentProvider:
    provider_name = os.environ.get("SENTIMENT_PROVIDER", "finbert").strip().lower()

    if provider_name in ("none", "noop", "disabled"):
        logger.info("Sentiment provider explicitly disabled (SENTIMENT_PROVIDER=%s).", provider_name)
        return NoopSentimentProvider()

    if provider_name == "finbert":
        model_path = os.environ.get("SENTIMENT_MODEL_PATH", str(DEFAULT_MODEL_PATH))
        try:
            from core.sentiment.finbert_provider import FinbertSentimentProvider

            return FinbertSentimentProvider(model_path=model_path)
        except Exception:
            logger.exception(
                "Failed to load FinBERT provider from %s; falling back to no-op sentiment "
                "(articles will still be crawled and persisted with sentiment = NULL).",
                model_path,
            )
            return NoopSentimentProvider()

    logger.warning("Unknown SENTIMENT_PROVIDER=%s; falling back to no-op sentiment.", provider_name)
    return NoopSentimentProvider()
