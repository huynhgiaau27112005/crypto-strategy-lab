"""
`_map_label` unit tests (no DB needed) and `upsert_articles` idempotency
integration tests (need a live Postgres reachable via the same
NEWS_DB_*/DATABASE_* env vars the worker itself uses -- skipped, not
failed, if the DB is unreachable, so `pytest` still runs green in an
environment with no DB configured).
"""
from datetime import datetime, timezone

import psycopg2
import pytest

from core.db.news_repository import DbConfig, NewsRepository, _map_label


class TestMapLabel:
    """Pins FinBERT's lowercase labels -> the DB's uppercase
    `sentiment_label` enum. Deliberately explicit (not `.upper()`) so an
    unrecognized label is treated as unknown rather than blindly upper-cased
    into a value the DB enum would reject."""

    def test_positive_maps_to_positive(self):
        assert _map_label("positive") == "POSITIVE"

    def test_negative_maps_to_negative(self):
        """The mapping this whole task calls out: FinBERT's id2label has
        index 1 = negative, not neutral -- this pins the *label string*
        mapping is correct regardless of how the label was produced."""
        assert _map_label("negative") == "NEGATIVE"

    def test_neutral_maps_to_neutral(self):
        assert _map_label("neutral") == "NEUTRAL"

    def test_is_case_insensitive(self):
        assert _map_label("Positive") == "POSITIVE"
        assert _map_label("NEGATIVE") == "NEGATIVE"

    def test_none_stays_none(self):
        assert _map_label(None) is None

    def test_unrecognized_label_becomes_none_not_a_crash(self):
        assert _map_label("somethingelse") is None


def _db_available(repo: NewsRepository) -> bool:
    try:
        conn = repo.connect()
        conn.close()
        return True
    except psycopg2.OperationalError:
        return False


@pytest.fixture
def repo():
    return NewsRepository(DbConfig.from_env())


@pytest.fixture
def skip_if_no_db(repo):
    if not _db_available(repo):
        pytest.skip("No reachable Postgres for NEWS_DB_*/DATABASE_* env vars; skipping DB integration test.")


@pytest.fixture
def cleanup_test_url(repo, skip_if_no_db):
    test_url = "https://example.test/news-repository-idempotency-test-article"
    yield test_url
    conn = repo.connect()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM news WHERE url = %s", (test_url,))
    finally:
        conn.close()


def _count_for_url(repo: NewsRepository, url: str) -> int:
    conn = repo.connect()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM news WHERE url = %s", (url,))
            return cur.fetchone()[0]
    finally:
        conn.close()


def test_upsert_same_url_twice_does_not_duplicate(repo, cleanup_test_url):
    test_url = cleanup_test_url
    row = {
        "title": "Idempotency test article",
        "content": "Content long enough to pass validation rules easily.",
        "source": "test-source",
        "published_at": datetime.now(timezone.utc),
        "url": test_url,
        "sentiment": "positive",
        "sentiment_score": 0.9,
    }

    repo.upsert_articles([row])
    repo.upsert_articles([row])

    assert _count_for_url(repo, test_url) == 1


def test_upsert_does_not_null_out_existing_sentiment_when_rescored_as_unavailable(repo, cleanup_test_url):
    """A re-crawl that ran with sentiment unavailable (provider down) must
    not blank out a score obtained on an earlier, successful run."""
    test_url = cleanup_test_url
    scored_row = {
        "title": "Idempotency test article",
        "content": "Content long enough to pass validation rules easily.",
        "source": "test-source",
        "published_at": datetime.now(timezone.utc),
        "url": test_url,
        "sentiment": "positive",
        "sentiment_score": 0.9,
    }
    unscored_row = {**scored_row, "sentiment": None, "sentiment_score": None}

    repo.upsert_articles([scored_row])
    repo.upsert_articles([unscored_row])

    conn = repo.connect()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT sentiment, sentiment_score FROM news WHERE url = %s", (test_url,))
            sentiment, score = cur.fetchone()
    finally:
        conn.close()

    assert sentiment == "POSITIVE"
    assert float(score) == pytest.approx(0.9)
