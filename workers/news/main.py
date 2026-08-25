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
from core.sentiment.factory import get_sentiment_provider  # noqa: E402
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
        return 0

    # Sentiment sits behind a provider interface (core/sentiment/provider.py)
    # selected by SENTIMENT_PROVIDER. If the provider is unavailable
    # (missing model files, load failure), get_sentiment_provider() already
    # falls back to a no-op provider -- so this call never raises, and
    # articles that fail scoring simply keep sentiment = NULL rather than
    # being dropped from the crawl.
    provider = get_sentiment_provider()
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
    written = repository.upsert_articles(rows)
    scored = sum(1 for row in rows if row["sentiment"] is not None)
    logger.info("Upserted %d article(s) into news (%d with sentiment scored).", written, scored)
    return 0


if __name__ == "__main__":
    sys.exit(run())
