from core.crawler.parser.rss_parser import RSSParser
from domain.source import SourceConfig
from core.crawler.base import HTTPFetcher

def test_rss_parser():
    fetcher = HTTPFetcher()
    parser = RSSParser()
    config = SourceConfig(
        id="id",
        type="rss",
        url="https://www.coindesk.com/arc/outboundfeeds/rss",
        method="GET",
        mapping={
            "id": "id",
            "title": "title",
            "content": "summary",
            "publishedAt": "published"
        }
    )

    raw_data = fetcher.fetch(config)
    result = parser.parse(raw_data, config)
    assert result is not None
