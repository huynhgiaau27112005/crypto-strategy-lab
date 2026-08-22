from typing import Any, Optional
import re
import urllib.parse
from bs4 import BeautifulSoup

from core.crawler.base import BaseParser
from domain.source import SourceConfig


class HTMLParser(BaseParser):
    """
    Generic, configuration-driven HTML parser for crypto news websites using BeautifulSoup.
    Responsible solely for raw HTML extraction (Listing URL discovery & Article field extraction).
    Does NOT make HTTP requests, generate IDs, generate timestamps, or perform business validation.
    """

    UNWANTED_TAGS = [
        "script", "style", "noscript", "svg", "iframe", "button",
        "nav", "footer", "header", "aside", "form"
    ]

    UNWANTED_SELECTORS = [
        ".ad", ".ads", ".advertisement", ".social-share", ".social-buttons",
        ".cookie-banner", ".newsletter", ".newsletter-form", ".comments",
        ".related-posts", ".related-articles", ".tracking", ".banner",
        "#comments", "#footer", "#nav", "#header"
    ]

    def parse(self, data: str | bytes, config: Optional[SourceConfig] = None) -> list[dict[str, Any]]:
        """
        Parse raw HTML data into structured records based on SourceConfig rules.

        Args:
            data: Raw HTML content as string or bytes.
            config: SourceConfig containing mapping and base URL metadata.

        Returns:
            list[dict[str, Any]]: List of discovered article URLs (listing mode)
                                  or at most one extracted article dictionary (article mode).
        """
        if data is None:
            return []

        if isinstance(data, bytes):
            try:
                data = data.decode("utf-8")
            except UnicodeDecodeError:
                data = data.decode("latin-1", errors="replace")

        if not isinstance(data, str) or not data.strip():
            return []

        soup = BeautifulSoup(data, "html.parser")
        mapping = config.mapping if config else {}
        base_url = config.url if config else ""

        # Listing mode: if "listing" mapping is explicitly provided
        if "listing" in mapping:
            return self._parse_listing(soup, mapping["listing"], base_url)

        # Article mode: if "article" mapping is provided or flat mapping
        article_mapping = mapping.get("article", mapping)
        return self._parse_article(soup, article_mapping, base_url)

    def _parse_listing(self, soup: BeautifulSoup, listing_mapping: dict[str, Any], base_url: str) -> list[dict[str, Any]]:
        """Discover article URLs from a listing page."""
        item_selector = listing_mapping.get("item_selector")
        link_selector = listing_mapping.get("link_selector", "a")

        if not item_selector:
            return []

        results: list[dict[str, Any]] = []
        for container in soup.select(item_selector):
            link_el = container.select_one(link_selector) if link_selector else container
            if link_el and link_el.name != "a":
                link_el = link_el.find("a") or link_el

            if link_el and link_el.get("href"):
                raw_href = link_el["href"].strip()
                absolute_url = urllib.parse.urljoin(base_url, raw_href)
                results.append({"url": absolute_url})

        return results

    def _parse_article(self, soup: BeautifulSoup, article_mapping: dict[str, Any], base_url: str) -> list[dict[str, Any]]:
        """Extract raw fields for a single article page."""
        # 1. Title
        title = self._select_field(soup, article_mapping.get("title"))
        if not title:
            title = self._select_field(soup, "meta[property='og:title']@content")
        if not title:
            title = self._select_field(soup, "title")

        # 2. Content
        content = self._extract_content(soup, article_mapping.get("content"))

        # 3. PublishedAt
        published_at = self._select_field(soup, article_mapping.get("publishedAt"))
        if not published_at:
            published_at = self._select_field(soup, "time@datetime")
        if not published_at:
            published_at = self._select_field(soup, "meta[property='article:published_time']@content")
        if not published_at:
            published_at = self._select_field(soup, "meta[property='og:published_time']@content")

        # 4. URL (Canonical)
        canonical_url = self._select_field(soup, article_mapping.get("url"))
        if not canonical_url:
            canonical_url = self._select_field(soup, "link[rel='canonical']@href")
        if not canonical_url:
            canonical_url = self._select_field(soup, "meta[property='og:url']@content")
        if not canonical_url:
            canonical_url = base_url

        if canonical_url:
            canonical_url = urllib.parse.urljoin(base_url, canonical_url)

        # At most one article record returned
        if title or content:
            return [{
                "title": title,
                "content": content,
                "publishedAt": published_at,
                "url": canonical_url
            }]

        return []

    def _select_field(self, soup: BeautifulSoup, rule: Optional[str]) -> Optional[str]:
        """
        Extract text or attribute from soup using simple selector or 'selector@attribute' syntax.
        """
        if not rule or not isinstance(rule, str):
            return None

        rule = rule.strip()
        if "@" in rule and not rule.startswith("@"):
            selector, attr = rule.split("@", 1)
            elem = soup.select_one(selector.strip())
            if elem and elem.get(attr.strip()):
                val = elem[attr.strip()]
                return val.strip() if isinstance(val, str) else str(val).strip()
            return None
        else:
            elem = soup.select_one(rule)
            if elem:
                text = elem.get_text(strip=False)
                return self._normalize_whitespace(text)
            return None

    def _extract_content(self, soup: BeautifulSoup, content_selector: Optional[str]) -> Optional[str]:
        """Extract clean text content, joining paragraphs with double newlines."""
        if not content_selector:
            container = soup.select_one("article, main, [role='main'], body")
        else:
            container = soup.select_one(content_selector)

        if not container:
            return None

        # Work on a copy to avoid mutating the original soup
        content_soup = BeautifulSoup(str(container), "html.parser")

        # Decompose unwanted elements
        for tag in self.UNWANTED_TAGS:
            for el in content_soup.find_all(tag):
                el.decompose()

        for sel in self.UNWANTED_SELECTORS:
            try:
                for el in content_soup.select(sel):
                    el.decompose()
            except Exception:
                continue

        # Extract paragraphs
        paragraphs = []
        for p in content_soup.select("p"):
            p_text = self._normalize_whitespace(p.get_text(strip=False))
            if p_text:
                paragraphs.append(p_text)

        if paragraphs:
            return "\n\n".join(paragraphs)

        fallback_text = self._normalize_whitespace(content_soup.get_text(strip=False))
        return fallback_text if fallback_text else None

    def _normalize_whitespace(self, text: Optional[str]) -> Optional[str]:
        """Collapse multiple spaces and newlines into single spaces."""
        if not text:
            return None
        cleaned = re.sub(r"\s+", " ", text).strip()
        return cleaned if cleaned else None
