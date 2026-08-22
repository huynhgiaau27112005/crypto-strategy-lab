import pytest
from core.crawler.parser.html_parser import HTMLParser
from domain.source import SourceConfig


def test_html_parser_listing_mode():
    """Test extracting article URLs from listing containers and resolving relative URLs."""
    html = """
    <html>
    <body>
        <div class="news-list">
            <div class="news-card">
                <h2><a href="/markets/bitcoin-surges" class="headline-link">Bitcoin Surges</a></h2>
            </div>
            <div class="news-card">
                <h2><a href="https://example.com/markets/ethereum-merge" class="headline-link">Ethereum Merge</a></h2>
            </div>
            <div class="ad-card">
                <a href="/ads/crypto-casino">Ad link to ignore</a>
            </div>
        </div>
    </body>
    </html>
    """

    config = SourceConfig(
        id="coindesk",
        type="html",
        url="https://www.coindesk.com/latest-news",
        mapping={
            "listing": {
                "item_selector": "div.news-card",
                "link_selector": "a.headline-link"
            }
        }
    )

    parser = HTMLParser()
    results = parser.parse(html, config)

    assert len(results) == 2
    assert results[0]["url"] == "https://www.coindesk.com/markets/bitcoin-surges"
    assert results[1]["url"] == "https://example.com/markets/ethereum-merge"


def test_html_parser_article_mode_and_selector_attribute():
    """Test extracting article fields and selector@attribute syntax."""
    html = """
    <html>
    <head>
        <link rel="canonical" href="https://www.coindesk.com/article/123">
        <meta property="article:published_time" content="2026-08-18T10:00:00Z">
    </head>
    <body>
        <h1 class="article-title">SEC Approves Solana Staking ETF</h1>
        <time datetime="2026-08-18T10:00:00Z">Aug 18, 2026</time>
        <div class="article-body">
            <div class="ad">Advertisement banner</div>
            <p>The Securities and Exchange Commission has granted approval for the first Solana staking ETF.</p>
            <div class="social-share"><button>Share</button></div>
            <p>Market response has been overwhelmingly positive across major spot exchanges.</p>
        </div>
    </body>
    </html>
    """

    config = SourceConfig(
        id="coindesk",
        type="html",
        url="https://www.coindesk.com/article/123",
        mapping={
            "article": {
                "title": "h1.article-title",
                "content": "div.article-body",
                "publishedAt": "time@datetime",
                "url": "link[rel='canonical']@href"
            }
        }
    )

    parser = HTMLParser()
    results = parser.parse(html, config)

    assert len(results) == 1
    item = results[0]
    assert item["title"] == "SEC Approves Solana Staking ETF"
    assert "Advertisement banner" not in item["content"]
    assert "Share" not in item["content"]
    assert "The Securities and Exchange Commission has granted" in item["content"]
    assert "Market response has been overwhelmingly positive" in item["content"]
    assert "\n\n" in item["content"]
    assert item["publishedAt"] == "2026-08-18T10:00:00Z"
    assert item["url"] == "https://www.coindesk.com/article/123"
    # Pure extraction: no sourceId or id in parser output
    assert "sourceId" not in item
    assert "id" not in item


def test_html_parser_article_fallback_meta_tags():
    """Test fallback to meta tags when selectors are not provided."""
    html = """
    <html>
    <head>
        <meta property="og:title" content="Meta Title Fallback">
        <meta property="article:published_time" content="2026-08-18T12:00:00Z">
        <link rel="canonical" href="https://example.com/meta-fallback">
    </head>
    <body>
        <article>
            <p>Paragraph 1 of content.</p>
            <p>Paragraph 2 of content.</p>
        </article>
    </body>
    </html>
    """

    config = SourceConfig(
        id="test_meta",
        type="html",
        url="https://example.com/fallback",
        mapping={"article": {}}
    )

    parser = HTMLParser()
    results = parser.parse(html, config)

    assert len(results) == 1
    item = results[0]
    assert item["title"] == "Meta Title Fallback"
    assert item["publishedAt"] == "2026-08-18T12:00:00Z"
    assert item["url"] == "https://example.com/meta-fallback"
    assert item["content"] == "Paragraph 1 of content.\n\nParagraph 2 of content."


def test_html_parser_empty_and_bytes_input():
    """Test empty string and bytes input handling."""
    parser = HTMLParser()
    assert parser.parse("", None) == []
    assert parser.parse(None, None) == []
    assert parser.parse("   \n\t  ", None) == []

    bytes_html = b"<html><body><h1>Bytes Title</h1><p>Some content paragraph here.</p></body></html>"
    config = SourceConfig(id="bytes", type="html", url="https://example.com", mapping={"article": {"title": "h1", "content": "body"}})
    res = parser.parse(bytes_html, config)
    assert len(res) == 1
    assert res[0]["title"] == "Bytes Title"
