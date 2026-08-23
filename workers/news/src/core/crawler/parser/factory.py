from core.crawler.base import BaseParser
from core.crawler.parser.rss_parser import RSSParser
from core.crawler.parser.html_parser import HTMLParser
from core.crawler.parser.api_parser import APIParser
from domain.source import SourceConfig

class ParserFactory:
    def create_parser(self, config: SourceConfig) -> BaseParser:
        if config.type == "rss":
            return RSSParser()

        elif config.type == "html":
            return HTMLParser()

        elif config.type == "api":
            return APIParser()