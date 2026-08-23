from unittest.mock import MagicMock
import pytest

from core.crawler.crawler import NewsCrawler
from domain.source import SourceConfig
from domain.news import NewsItems


def test_crawler_listing_discovery_end_to_end():
    """Test full listing discovery -> article fetch -> normalization -> validation pipeline with mocked fetcher."""
    listing_html = b"""
    <html>
    <body>
        <div class="news-list">
            <article class="card"><a href="/news/btc-ath">BTC ATH</a></article>
            <article class="card"><a href="/news/eth-staking">ETH Staking</a></article>
        </div>
    </body>
    </html>
    """

    article1_html = b"""
    <html>
    <head><link rel="canonical" href="https://example.com/news/btc-ath"></head>
    <body>
        <h1>Bitcoin Hits New All-Time High</h1>
        <time datetime="2026-08-18T10:00:00Z">Aug 18, 2026</time>
        <div class="content"><p>Bitcoin surged past all previous records today in global markets.</p></div>
    </body>
    </html>
    """

    article2_html = b"""
    <html>
    <head><link rel="canonical" href="https://example.com/news/eth-staking"></head>
    <body>
        <h1>Ethereum Staking Rates Climb</h1>
        <time datetime="2026-08-18T11:00:00Z">Aug 18, 2026</time>
        <div class="content"><p>Ethereum network staking yields increased following validator upgrades.</p></div>
    </body>
    </html>
    """

    config = SourceConfig(
        id="mock_news",
        type="html",
        url="https://example.com/latest",
        mapping={
            "listing": {
                "item_selector": "article.card",
                "link_selector": "a"
            },
            "article": {
                "title": "h1",
                "content": ".content",
                "publishedAt": "time@datetime",
                "url": "link[rel='canonical']@href"
            }
        }
    )

    mock_fetcher = MagicMock()
    # Return listing HTML first, then article 1 HTML, then article 2 HTML
    mock_fetcher.fetch.side_effect = [listing_html, article1_html, article2_html]

    crawler = NewsCrawler(fetcher=mock_fetcher)
    results = crawler.crawl(config)

    assert len(results) == 2
    assert all(isinstance(item, NewsItems) for item in results)

    assert results[0].title == "Bitcoin Hits New All-Time High"
    assert results[0].url == "https://example.com/news/btc-ath"
    assert "BTC" in results[0].relatedCoins
    assert results[0].sourceId == "mock_news"

    assert results[1].title == "Ethereum Staking Rates Climb"
    assert results[1].url == "https://example.com/news/eth-staking"
    assert "ETH" in results[1].relatedCoins


def test_crawler_discovery_deduplication():
    """Test duplicate URLs in listing page are fetched only once."""
    listing_html = b"""
    <html>
    <body>
        <article class="card"><a href="/news/btc-ath">BTC ATH</a></article>
        <article class="card"><a href="/news/btc-ath">BTC ATH Duplicate</a></article>
    </body>
    </html>
    """

    article_html = b"""
    <html>
    <head><link rel="canonical" href="https://example.com/news/btc-ath"></head>
    <body>
        <h1>Bitcoin Hits New All-Time High</h1>
        <time datetime="2026-08-18T10:00:00Z">Aug 18, 2026</time>
        <div class="content"><p>Bitcoin surged past all previous records today in global markets.</p></div>
    </body>
    </html>
    """

    config = SourceConfig(
        id="mock_news",
        type="html",
        url="https://example.com/latest",
        mapping={
            "listing": {"item_selector": "article.card", "link_selector": "a"},
            "article": {"title": "h1", "content": ".content", "publishedAt": "time@datetime"}
        }
    )

    mock_fetcher = MagicMock()
    mock_fetcher.fetch.side_effect = [listing_html, article_html]

    crawler = NewsCrawler(fetcher=mock_fetcher)
    results = crawler.crawl(config)

    assert len(results) == 1
    # fetch called exactly twice: once for listing, once for the unique article
    assert mock_fetcher.fetch.call_count == 2


def test_crawler_batch_error_resilience():
    """Test that failure on one article does not abort remaining articles in the batch."""
    listing_html = b"""
    <html>
    <body>
        <article class="card"><a href="/news/bad-article">Bad Article</a></article>
        <article class="card"><a href="/news/good-article">Good Article</a></article>
    </body>
    </html>
    """

    good_article_html = b"""
    <html>
    <head><link rel="canonical" href="https://example.com/news/good-article"></head>
    <body>
        <h1>Solana DeFi Ecosystem Expands</h1>
        <time datetime="2026-08-18T12:00:00Z">Aug 18, 2026</time>
        <div class="content"><p>Total value locked in Solana decentralized protocols hit new records.</p></div>
    </body>
    </html>
    """

    config = SourceConfig(
        id="mock_news",
        type="html",
        url="https://example.com/latest",
        mapping={
            "listing": {"item_selector": "article.card", "link_selector": "a"},
            "article": {"title": "h1", "content": ".content", "publishedAt": "time@datetime"}
        }
    )

    mock_fetcher = MagicMock()
    # First call: listing HTML; second call: RuntimeError on bad article; third call: good article HTML
    mock_fetcher.fetch.side_effect = [listing_html, RuntimeError("Network timeout"), good_article_html]

    crawler = NewsCrawler(fetcher=mock_fetcher)
    results = crawler.crawl(config)

    assert len(results) == 1
    assert results[0].title == "Solana DeFi Ecosystem Expands"
    assert "SOL" in results[0].relatedCoins


def test_crawler_rss_compatibility():
    """Test RSS source flow through normalizer, extractor, and validator."""
    rss_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
        <channel>
            <title>Crypto RSS Feed</title>
            <item>
                <title>Cardano Smart Contracts Deployed</title>
                <link>https://example.com/cardano-news</link>
                <description>Cardano developers deployed new Plutus smart contracts on mainnet.</description>
                <pubDate>Mon, 18 Aug 2026 14:00:00 GMT</pubDate>
            </item>
        </channel>
    </rss>
    """

    config = SourceConfig(
        id="rss_source",
        type="rss",
        url="https://example.com/rss",
        mapping={
            "title": "title",
            "content": "summary",
            "publishedAt": "published",
            "url": "link"
        }
    )

    mock_fetcher = MagicMock()
    mock_fetcher.fetch.return_value = rss_xml

    crawler = NewsCrawler(fetcher=mock_fetcher)
    results = crawler.crawl(config)

    assert len(results) == 1
    item = results[0]
    assert isinstance(item, NewsItems)
    assert item.title == "Cardano Smart Contracts Deployed"
    assert item.url == "https://example.com/cardano-news"
    assert item.sourceId == "rss_source"
    assert "ADA" in item.relatedCoins
