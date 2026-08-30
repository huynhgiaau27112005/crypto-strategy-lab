"""
Entry point for the news crawler + sentiment worker.

Flow: load source configs (config/*_sources.yml) -> crawl each source
(NewsCrawler already dedupes per-source and isolates per-article errors) ->
dedupe again across sources by canonical `id` -> score sentiment through the
configured SentimentProvider -> upsert into Postgres `news`, keyed by `url`.

Run standalone:
    workers/news/.venv/bin/python workers/news/main.py

This is invoked by the Nest API (`POST /news/crawl`) as a separate OS
process (see artifacts/decisions.md ADR-005) -- it must never be imported
and called in-process from Node. Exit code 0 means the crawl ran to
completion (individual source/article failures are logged and skipped, not
fatal); any other exit code means the run itself failed and stderr carries
the reason, which is what the API surfaces back to the caller.
"""
import json
import logging
import sys
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Optional

WORKER_ROOT = Path(__file__).resolve().parent
SRC_ROOT = WORKER_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from core.config.loader import load_all_sources  # noqa: E402
from core.crawler.crawler import NewsCrawler  # noqa: E402
from core.db.news_repository import NewsRepository  # noqa: E402
from core.sentiment.factory import resolve_sentiment_provider  # noqa: E402
from domain.news import NewsItems  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("news_worker")


def parse_published_at(value: Optional[str]) -> Optional[datetime]:
    """Best-effort parse of whatever format a source hands back
    (RSS/Atom feeds commonly use RFC 822, HTML `<time datetime>` attributes
    are usually ISO 8601). Returns None rather than raising on anything
    unrecognized -- `published_at` is nullable, an unparsed date should not
    abort the whole article."""
    if not value:
        return None
    text = value.strip()
    try:
        return parsedate_to_datetime(text)
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        logger.warning("Could not parse publishedAt=%r; storing as NULL.", value)
        return None


def dedupe_across_sources(items: list[NewsItems]) -> list[NewsItems]:
    seen: set[str] = set()
    unique: list[NewsItems] = []
    for item in items:
        if item.id in seen:
            continue
        seen.add(item.id)
        unique.append(item)
    return unique


SUMMARY_PREFIX = "NEWS_CRAWL_SUMMARY "


def emit_summary(*, new: int, updated: int, scored: int, model: str) -> None:
    """Report the run's outcome on STDOUT as one machine-readable line.

    The Nest side (`NewsCrawlService`) parses this and carries it onto the
    BullMQ job result, so the UI can say "+3 tin mới / 39 tin đã có" instead
    of leaving the user to guess whether a crawl that changed nothing on
    screen actually worked. Logging goes to stderr (see basicConfig), so
    stdout carries only this line and can never be polluted by log output.

    `model` is the provider that ACTUALLY scored this batch, not the one
    that was configured -- FinBERT silently degrading to the lexicon
    provider is precisely the case the UI has to be able to show.
    """
    payload = {"new": new, "updated": updated, "scored": scored, "model": model}
    print(SUMMARY_PREFIX + json.dumps(payload), flush=True)


def run() -> int:
    config_dir = WORKER_ROOT / "config"
    sources = load_all_sources(config_dir)
    if not sources:
        logger.error("No source configs found under %s; nothing to crawl.", config_dir)
        return 1

    crawler = NewsCrawler()
    all_items: list[NewsItems] = []
    for source in sources:
        logger.info("Crawling source id=%s type=%s url=%s", source.id, source.type, source.url)
        try:
            items = crawler.run(source)
        except Exception:
            # Per-source isolation: NewsCrawler already catches most fetch/
            # parse errors internally and returns [], but this is a last
            # line of defense so one misconfigured source can't take down
            # the whole run.
            logger.exception("Source %s raised unexpectedly; skipping it.", source.id)
            continue
        logger.info("Source %s yielded %d article(s).", source.id, len(items))
        all_items.extend(items)

    unique_items = dedupe_across_sources(all_items)
    logger.info("Total unique articles across all sources: %d", len(unique_items))

    if not unique_items:
        logger.warning("No articles crawled this run; nothing to persist.")
        emit_summary(new=0, updated=0, scored=0, model=resolve_sentiment_provider().model_name)
        return 0

    # Sentiment sits behind a provider interface (core/sentiment/provider.py)
    # selected by SENTIMENT_PROVIDER. If the configured provider is
    # unavailable (missing model files, missing torch),
    # resolve_sentiment_provider() degrades to the dependency-free lexicon
    # provider -- so this call never raises, and a crawl always produces
    # real labels instead of a table full of NULLs nobody can explain.
    resolved = resolve_sentiment_provider()
    provider = resolved.provider
    if resolved.degraded_from:
        logger.warning(
            "Scoring with %s because %s could not be loaded -- labels are weaker than "
            "the configured model would produce.",
            resolved.model_name,
            resolved.degraded_from,
        )
    texts = [f"{item.title}. {item.content}" for item in unique_items]
    try:
        results = provider.analyze(texts)
    except Exception:
        logger.exception("Sentiment provider failed for the whole batch; persisting with sentiment = NULL.")
        results = [None for _ in unique_items]

    rows = []
    for item, result in zip(unique_items, results):
        rows.append(
            {
                "title": item.title,
                "content": item.content,
                "source": item.sourceId,
                "published_at": parse_published_at(item.publishedAt),
                "url": item.url,
                "sentiment": result.label if result else None,
                "sentiment_score": result.score if result else None,
            }
        )

    repository = NewsRepository()
    counts = repository.upsert_articles(rows)
    scored = sum(1 for row in rows if row["sentiment"] is not None)
    logger.info(
        "Upserted %d article(s) into news: %d new, %d already stored (%d with sentiment scored).",
        counts.total,
        counts.inserted,
        counts.updated,
        scored,
    )
    emit_summary(
        new=counts.inserted,
        updated=counts.updated,
        scored=scored,
        model=resolved.model_name,
    )
    return 0


if __name__ == "__main__":
    sys.exit(run())
