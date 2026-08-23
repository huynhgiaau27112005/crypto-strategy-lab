from core.crawler.base import BaseParser
from domain.source import SourceConfig
import feedparser

class RSSParser(BaseParser):
    def parse(self, data: str, config: SourceConfig) -> dict:
        parsed_data = feedparser.parse(data)
        return [
            {
                target: entry.get(source)
                for target, source in config.mapping.items()
            }
            for entry in parsed_data.entries
        ]