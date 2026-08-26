from typing import Any, Optional
import urllib.parse
import hashlib
from datetime import datetime, timezone
import re

from domain.source import SourceConfig


class NewsNormalizer:
    """
    Normalizes raw extracted news records:
    - URL canonicalization (resolves relative URLs, removes tracking query params).
    - Deterministic SHA256 ID generation based on sourceId and canonical URL.
    - Timezone-aware UTC ISO 8601 crawledAt timestamp generation.
    - String and field normalization.
    """

    TRACKING_PARAMS = {
        "utm_source", "utm_medium", "utm_campaign", "utm_term",
        "utm_content", "fbclid", "gclid", "ref", "source"
    }

    def normalize(self, raw_record: dict[str, Any], config: SourceConfig) -> dict[str, Any]:
        """Normalize a raw article dictionary."""
        source_id = config.id if config else raw_record.get("sourceId", "")
        base_url = config.url if config else ""

        raw_url = raw_record.get("url") or raw_record.get("link") or base_url
        canonical_url = self.canonicalize_url(raw_url, base_url)

        title = self._clean_string(raw_record.get("title"))
        content = self._clean_string(
            self._strip_html(raw_record.get("content") or raw_record.get("summary"))
        )
        published_at = self._clean_string(raw_record.get("publishedAt") or raw_record.get("published"))

        article_id = self._generate_id(source_id, canonical_url)
        crawled_at = self._generate_crawled_at()

        return {
            "id": article_id,
            "sourceId": source_id,
            "title": title,
            "content": content,
            "url": canonical_url,
            "publishedAt": published_at,
            "crawledAt": crawled_at,
            "relatedCoins": raw_record.get("relatedCoins", [])
        }

    def canonicalize_url(self, url: Optional[str], base_url: str = "") -> str:
        """Canonicalize URL by resolving relative paths, lowercasing domain, and removing tracking params."""
        if not url:
            return base_url

        # 1. Resolve relative URLs
        full_url = urllib.parse.urljoin(base_url, url.strip())

        # 2. Parse URL components
        parsed = urllib.parse.urlsplit(full_url)

        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        path = parsed.path

        # 3. Strip tracking query parameters
        query_params = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        filtered_params = [
            (k, v) for k, v in query_params if k.lower() not in self.TRACKING_PARAMS
        ]
        new_query = urllib.parse.urlencode(filtered_params)

        # 4. Reconstruct without fragment
        canonical = urllib.parse.urlunsplit((scheme, netloc, path, new_query, ""))
        return canonical

    def _generate_id(self, source_id: str, canonical_url: str) -> str:
        """Generate deterministic SHA256 ID from sourceId and canonical URL."""
        return hashlib.sha256(f"{source_id}:{canonical_url}".encode("utf-8")).hexdigest()

    def _generate_crawled_at(self) -> str:
        """Generate timezone-aware UTC ISO 8601 timestamp."""
        return datetime.now(timezone.utc).isoformat()

    def _strip_html(self, text: Optional[str]) -> Optional[str]:
        """Reduce an RSS ``description``/``content`` payload to plain text.

        Most feeds (cointelegraph included) put a full HTML fragment in
        ``description`` — a floated ``<img>`` wrapper followed by the real
        prose. Storing that verbatim is why article subtitles rendered as
        a wall of ``<p style="float: right..."><img ...>`` markup in the UI.
        Stripping here, at the point the record is normalised, keeps the
        rest of the pipeline (sentiment input, database, API, UI) working
        on the same clean text instead of each layer re-deriving it.
        """
        if not text or not isinstance(text, str):
            return text
        if "<" not in text:
            return text
        try:
            from bs4 import BeautifulSoup

            return BeautifulSoup(text, "html.parser").get_text(" ", strip=True)
        except Exception:
            # Never let presentation cleanup break ingestion — fall back to
            # a conservative tag strip.
            return re.sub(r"<[^>]+>", " ", text)

    def _clean_string(self, text: Optional[str]) -> Optional[str]:
        """Strip and normalize whitespace in a string."""
        if not text or not isinstance(text, str):
            return None
        cleaned = re.sub(r"[ \t\r\f\v]+", " ", text).strip()
        return cleaned if cleaned else None
