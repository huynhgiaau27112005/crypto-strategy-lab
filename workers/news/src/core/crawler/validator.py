from typing import Any, Optional
import logging

from domain.news import NewsItems

logger = logging.getLogger(__name__)


class NewsValidator:
    """
    Lightweight quality and business validator for crawled news records.
    Constructs validated NewsItems domain instances.
    """

    MIN_TITLE_LENGTH = 5
    MIN_CONTENT_LENGTH = 30

    def validate(self, data: dict[str, Any]) -> Optional[NewsItems]:
        """
        Validate dictionary fields and return NewsItems or None if invalid.
        """
        title = data.get("title")
        if not title or len(str(title).strip()) < self.MIN_TITLE_LENGTH:
            logger.warning("Rejected article: title missing or too short.")
            return None

        content = data.get("content")
        if not content or len(str(content).strip()) < self.MIN_CONTENT_LENGTH:
            logger.warning("Rejected article: content missing or too short.")
            return None

        url = data.get("url")
        if not url or not str(url).startswith(("http://", "https://")):
            logger.warning("Rejected article: invalid or missing URL scheme.")
            return None

        published_at = data.get("publishedAt")
        if not published_at or not str(published_at).strip():
            logger.warning("Rejected article: missing publishedAt.")
            return None

        source_id = data.get("sourceId")
        if not source_id or not str(source_id).strip():
            logger.warning("Rejected article: missing sourceId.")
            return None

        article_id = data.get("id")
        if not article_id or not str(article_id).strip():
            logger.warning("Rejected article: missing id.")
            return None

        try:
            return NewsItems(
                id=str(article_id).strip(),
                sourceId=str(source_id).strip(),
                title=str(title).strip(),
                content=str(content).strip(),
                url=str(url).strip(),
                publishedAt=str(published_at).strip(),
                crawledAt=str(data.get("crawledAt", "")).strip(),
                relatedCoins=data.get("relatedCoins", [])
            )
        except Exception as e:
            logger.warning(f"Failed to instantiate NewsItems: {e}")
            return None
