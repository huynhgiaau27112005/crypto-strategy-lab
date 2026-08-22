import pytest
from core.crawler.validator import NewsValidator
from domain.news import NewsItems


def test_validator_valid_record():
    """Test valid record successfully instantiates NewsItems."""
    validator = NewsValidator()
    data = {
        "id": "a" * 64,
        "sourceId": "coindesk",
        "title": "Crypto Markets Rebound Strongly",
        "content": "A detailed market report spanning across major crypto spot and futures assets.",
        "url": "https://www.coindesk.com/markets/rebound",
        "publishedAt": "2026-08-18T10:00:00Z",
        "crawledAt": "2026-08-18T10:05:00+00:00",
        "relatedCoins": ["BTC", "ETH"]
    }

    item = validator.validate(data)
    assert isinstance(item, NewsItems)
    assert item.id == "a" * 64
    assert item.title == "Crypto Markets Rebound Strongly"
    assert item.relatedCoins == ["BTC", "ETH"]


def test_validator_rejection_rules():
    """Test rejection on missing or low quality fields."""
    validator = NewsValidator()

    # Title too short (< 5 chars)
    assert validator.validate({
        "id": "123", "sourceId": "src", "title": "BTC",
        "content": "Content longer than thirty characters here for sure.",
        "url": "https://example.com/1", "publishedAt": "date"
    }) is None

    # Content too short (< 30 chars)
    assert validator.validate({
        "id": "123", "sourceId": "src", "title": "Valid Headline Title",
        "content": "Short text",
        "url": "https://example.com/1", "publishedAt": "date"
    }) is None

    # Invalid URL scheme
    assert validator.validate({
        "id": "123", "sourceId": "src", "title": "Valid Headline Title",
        "content": "Content longer than thirty characters here for sure.",
        "url": "invalid_url", "publishedAt": "date"
    }) is None

    # Missing publishedAt
    assert validator.validate({
        "id": "123", "sourceId": "src", "title": "Valid Headline Title",
        "content": "Content longer than thirty characters here for sure.",
        "url": "https://example.com/1", "publishedAt": None
    }) is None
