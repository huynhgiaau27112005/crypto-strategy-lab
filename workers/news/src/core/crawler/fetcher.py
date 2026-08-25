from domain.source import SourceConfig
import requests


class HTTPFetcher:
    def fetch(self, config: SourceConfig) -> bytes:
        try:
            response = requests.request(
                method=config.method,
                url=config.url,
                headers=config.headers,
                params=config.params,
                timeout=15,
            )

            response.raise_for_status()

            return response.content

        except requests.exceptions.RequestException as e:
            raise RuntimeError(
                f"Failed to fetch {config.url}: {e}"
            ) from e
