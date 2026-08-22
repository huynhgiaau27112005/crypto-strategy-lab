import pytest
from core.crawler.normalizer import NewsNormalizer
from domain.source import SourceConfig


def test_normalizer_url_canonicalization():
    """Test resolving relative URLs, lowercasing domain, and stripping tracking query parameters."""
    normalizer = NewsNormalizer()
    base_url = "https://www.CoinDesk.com/markets/latest"

    # Relative path + tracking parameters + fragment
    raw_url = "/markets/btc-etf-approval?utm_source=twitter&utm_medium=social&utm_campaign=launch&id=123#comments"
    canonical = normalizer.canonicalize_url(raw_url, base_url)

    assert canonical == "https://www.coindesk.com/markets/btc-etf-approval?id=123"
    assert "#comments" not in canonical
    assert "utm_source" not in canonical
    assert "utm_medium" not in canonical
    assert "id=123" in canonical


def test_normalizer_deterministic_id():
    """Test identical SHA256 ID generation across multiple runs for same source and URL."""
    normalizer = NewsNormalizer()
    config = SourceConfig(id="coindesk", type="html", url="https://www.coindesk.com")

    raw_record = {
        "title": "Bitcoin Hits $100K",
        "content": "A detailed crypto report about market movements.",
        "url": "https://www.coindesk.com/markets/btc-100k?utm_source=telegram",
        "publishedAt": "2026-08-18T10:00:00Z"
    }

    norm1 = normalizer.normalize(raw_record, config)
    norm2 = normalizer.normalize(raw_record, config)

    assert norm1["id"] == norm2["id"]
    assert len(norm1["id"]) == 64  # SHA256 hex string
    assert norm1["sourceId"] == "coindesk"
    assert norm1["url"] == "https://www.coindesk.com/markets/btc-100k"
    assert norm1["crawledAt"] is not None


def test_normalizer_different_source_different_id():
    """Test same URL from different sources produces different IDs."""
    normalizer = NewsNormalizer()
    cfg1 = SourceConfig(id="coindesk", type="html", url="https://example.com/item")
    cfg2 = SourceConfig(id="cointelegraph", type="html", url="https://example.com/item")

    raw = {"title": "Title", "content": "Content", "url": "https://example.com/item", "publishedAt": "date"}

    norm1 = normalizer.normalize(raw, cfg1)
    norm2 = normalizer.normalize(raw, cfg2)

    assert norm1["id"] != norm2["id"]
