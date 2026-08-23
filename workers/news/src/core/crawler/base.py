from abc import ABC, abstractmethod
from domain.source import SourceConfig
from requests import request

class HTTPFetcher():
    def fetch(self, config: SourceConfig) -> bytes:
        response = request(
            method="GET",
            url=config.url
        )

        return response.content

class BaseParser(ABC):
    @abstractmethod
    def parse(self, data: str) -> dict[str, str]:
        pass