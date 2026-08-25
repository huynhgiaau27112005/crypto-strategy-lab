"""
Persistence for crawled news into the existing `news` table.

Deliberately does NOT run a migration: the table
(`id, title, content, source, published_at, crawled_at, url, sentiment,
sentiment_score`) already exists (see `database/migrations/`), and this
worker is expected to write into it as-is -- changing shared schema from
here would break every other branch/service reading the same table.

Idempotency: `url` has a UNIQUE constraint (per the task brief), so every
insert is an `INSERT ... ON CONFLICT (url) DO UPDATE`, keyed on `url`. A
re-crawl of the same article never creates a duplicate row. On conflict,
`sentiment`/`sentiment_score` are only overwritten when the new value is
non-NULL (`COALESCE(EXCLUDED.x, news.x)`) so a re-crawl that ran with
sentiment disabled/unavailable can't blank out a score obtained earlier.
"""
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

VALID_SENTIMENT_LABELS = {"POSITIVE", "NEUTRAL", "NEGATIVE"}

# FinBERT (and, by convention, any other provider plugged in behind
# SentimentProvider) returns lowercase labels; the DB enum `sentiment_label`
# is uppercase. This mapping is intentionally explicit rather than
# `label.upper()` so an unrecognized label fails loud (via the KeyError
# caught in `_map_label`) instead of silently inserting an invalid enum
# value the DB would reject anyway.
_LABEL_TO_DB = {
    "positive": "POSITIVE",
    "negative": "NEGATIVE",
    "neutral": "NEUTRAL",
}


def _map_label(label: Optional[str]) -> Optional[str]:
    if label is None:
        return None
    mapped = _LABEL_TO_DB.get(label.strip().lower())
    if mapped is None:
        logger.warning("Unrecognized sentiment label %r; storing as NULL.", label)
        return None
    return mapped


@dataclass(frozen=True)
class DbConfig:
    host: str
    port: int
    name: str
    user: str
    password: str

    @staticmethod
    def from_env() -> "DbConfig":
        # Same defaults as database/.env.example / service/.env.example --
        # never hard-coded as the *only* value, always overridable so this
        # worker can point at a different DB without a code change.
        return DbConfig(
            host=os.environ.get("NEWS_DB_HOST", os.environ.get("DATABASE_HOST", "localhost")),
            port=int(os.environ.get("NEWS_DB_PORT", os.environ.get("DATABASE_PORT", "6543"))),
            name=os.environ.get("NEWS_DB_NAME", os.environ.get("DATABASE_NAME", "crypto_strategy_lab")),
            user=os.environ.get("NEWS_DB_USER", os.environ.get("DATABASE_USER", "postgres")),
            password=os.environ.get("NEWS_DB_PASSWORD", os.environ.get("DATABASE_PASSWORD", "password")),
        )


class NewsRepository:
    def __init__(self, config: Optional[DbConfig] = None):
        self.config = config or DbConfig.from_env()

    def connect(self):
        return psycopg2.connect(
            host=self.config.host,
            port=self.config.port,
            dbname=self.config.name,
            user=self.config.user,
            password=self.config.password,
        )

    def upsert_articles(self, rows: list[dict]) -> int:
        """
        `rows` items: {title, content, source, published_at (ISO str or None),
        url, sentiment (raw provider label or None), sentiment_score (float or None)}.

        Returns the number of rows sent (attempted), not a "new vs updated"
        split -- ON CONFLICT DO UPDATE always reports as an affected row
        either way in executemany, and the task only requires no duplicates,
        not a precise insert/update count.
        """
        if not rows:
            return 0

        crawled_at = datetime.now(timezone.utc)
        records = []
        for row in rows:
            sentiment = _map_label(row.get("sentiment"))
            if sentiment is not None and sentiment not in VALID_SENTIMENT_LABELS:
                sentiment = None
            records.append(
                (
                    row.get("title"),
                    row.get("content"),
                    row.get("source"),
                    row.get("published_at"),
                    crawled_at,
                    row.get("url"),
                    sentiment,
                    row.get("sentiment_score"),
                )
            )

        sql = """
            INSERT INTO news (title, content, source, published_at, crawled_at, url, sentiment, sentiment_score)
            VALUES %s
            ON CONFLICT (url) DO UPDATE SET
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                source = EXCLUDED.source,
                published_at = COALESCE(EXCLUDED.published_at, news.published_at),
                sentiment = COALESCE(EXCLUDED.sentiment, news.sentiment),
                sentiment_score = COALESCE(EXCLUDED.sentiment_score, news.sentiment_score)
        """

        conn = self.connect()
        try:
            with conn:
                with conn.cursor() as cur:
                    psycopg2.extras.execute_values(cur, sql, records)
            return len(records)
        finally:
            conn.close()

    def count(self) -> int:
        conn = self.connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM news")
                return cur.fetchone()[0]
        finally:
            conn.close()
