from dataclasses import replace
import logging
from typing import Optional

from core.crawler.fetcher import HTTPFetcher
from core.crawler.parser.factory import ParserFactory
from core.crawler.normalizer import NewsNormalizer
from core.crawler.extractor import CoinEntityExtractor
from core.crawler.validator import NewsValidator
from domain.source import SourceConfig
from domain.news import NewsItems

logger = logging.getLogger(__name__)


class NewsCrawler:
    """
    Orchestration layer for crawling crypto news from RSS and HTML sources.
    Coordinates fetching, parsing, URL discovery, normalization, entity extraction,
    business validation, and deduplication.
    """

    def __init__(
        self,
        fetcher: Optional[HTTPFetcher] = None,
        parser_factory: Optional[ParserFactory] = None,
        normalizer: Optional[NewsNormalizer] = None,
        extractor: Optional[CoinEntityExtractor] = None,
        validator: Optional[NewsValidator] = None
    ):
        self.fetcher = fetcher or HTTPFetcher()
        self.parser_factory = parser_factory or ParserFactory()
        self.normalizer = normalizer or NewsNormalizer()
        self.extractor = extractor or CoinEntityExtractor()
        self.validator = validator or NewsValidator()

    def crawl(self, config: SourceConfig) -> list[NewsItems]:
        """
        Crawl news items based on the provided SourceConfig.
        Handles both RSS feeds and HTML listing/article pipelines.
        """
        if config.type != "html":
            return self._crawl_non_html(config)

        # 1. Fetch listing HTML
        try:
            listing_bytes = self.fetcher.fetch(config)
        except Exception as e:
            logger.error(f"Failed to fetch listing for source {config.id} at {config.url}: {e}")
            return []

        # 2. Extract article URLs in listing mode
        parser = self.parser_factory.create_parser(config)
        try:
            discovered_items = parser.parse(listing_bytes, config)
        except Exception as e:
            logger.error(f"Failed to parse listing for source {config.id}: {e}")
            return []

        # 3. Discovery Deduplication (Per-Crawl Execution)
        visited_urls = set()
        unique_article_urls = []
        for item in discovered_items:
            raw_url = item.get("url")
            if not raw_url:
                continue
            canonical_url = self.normalizer.canonicalize_url(raw_url, config.url)
            if canonical_url not in visited_urls:
                visited_urls.add(canonical_url)
                unique_article_urls.append(canonical_url)

        # If no listing items found, check if config itself is an article page
        if not unique_article_urls:
            unique_article_urls = [config.url]

        # 4. Fetch and parse each article with per-article error isolation
        crawled_items: list[NewsItems] = []
        for article_url in unique_article_urls:
            try:
                # Isolate article mapping so HTMLParser executes article mode
                article_mapping = config.mapping.get("article", config.mapping)
                article_cfg = replace(config, url=article_url, mapping=article_mapping)

                article_bytes = self.fetcher.fetch(article_cfg)
                parsed_records = parser.parse(article_bytes, article_cfg)
                if not parsed_records:
                    continue

                raw_record = parsed_records[0]
                raw_record.setdefault("url", article_url)

                # 5. Normalizer -> Extractor -> Validator
                normalized = self.normalizer.normalize(raw_record, config)
                normalized["relatedCoins"] = self.extractor.extract(
                    normalized.get("title", ""), normalized.get("content", "")
                )

                news_item = self.validator.validate(normalized)
                if news_item:
                    crawled_items.append(news_item)
            except Exception as e:
                logger.warning(f"Failed to crawl article {article_url} from source {config.id}: {e}")
                continue

        # 6. Final Item Deduplication (by item.id)
        return self.deduplicate(crawled_items)

    def _crawl_non_html(self, config: SourceConfig) -> list[NewsItems]:
        """Crawl and process non-HTML sources (e.g. RSS)."""
        try:
            raw_data = self.fetcher.fetch(config)
            parser = self.parser_factory.create_parser(config)
            parsed_records = parser.parse(raw_data, config)
        except Exception as e:
            logger.error(f"Failed to fetch/parse source {config.id}: {e}")
            return []

        crawled_items: list[NewsItems] = []
        for record in parsed_records:
            try:
                normalized = self.normalizer.normalize(record, config)
                normalized["relatedCoins"] = self.extractor.extract(
                    normalized.get("title", ""), normalized.get("content", "")
                )
                news_item = self.validator.validate(normalized)
                if news_item:
                    crawled_items.append(news_item)
            except Exception as e:
                logger.warning(f"Failed to process record in source {config.id}: {e}")
                continue

        return self.deduplicate(crawled_items)

    def deduplicate(self, items: list[NewsItems]) -> list[NewsItems]:
        """Deduplicate news items based on deterministic ID."""
        seen_ids = set()
        unique_items = []

        for item in items:
            if item.id not in seen_ids:
                seen_ids.add(item.id)
                unique_items.append(item)

        return unique_items

    def run(self, config: SourceConfig) -> list[NewsItems]:
        """Convenience execution method."""
        return self.crawl(config)