from dataclasses import dataclass, field
from typing import Any

@dataclass
class SourceConfig:
    id: str
    type: str
    url: str
    mapping: dict[str, Any] = field(default_factory=dict)

    method: str = "GET"
    params: dict[str, Any] = field(default_factory=dict)
    headers: dict[str, Any] = field(default_factory=dict)

class SourceRegistry:
    def __init__(self):
        self.sources: dict[str, SourceConfig] = {}

    def registerSource(self, config: SourceConfig) -> None:
        self.sources[config.id] = config

    def getSourceConfig(self, source_id: str) -> SourceConfig:
        return self.sources[source_id]