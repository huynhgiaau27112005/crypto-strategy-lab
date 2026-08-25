"""
Loads `SourceConfig` objects from the YAML files in `config/` (one file per
source family: `rss_sources.yml`, `html_sources.yml`, `api_sources.yml`).

Kept deliberately dumb: this module only turns YAML dicts into
`SourceConfig` dataclasses. It has no opinion about which sources get
crawled or in what order — that decision lives in `main.py`. This keeps the
crawler itself (`core/crawler/crawler.py`) source-format agnostic: adding a
new source (or a whole new source type) only ever means adding an entry to
a YAML file plus (if genuinely a new fetch/parse strategy) a new
`BaseParser` implementation, never editing `NewsCrawler`.
"""
from pathlib import Path
from typing import Any

import yaml

from domain.source import SourceConfig

# Source entries in the RSS/API files use "name" as their identifier, while
# HTML entries use "id" -- both configs come from the same teammate but were
# written independently. Accept either so the loader does not force a
# rename of files that are already in production use.
def _source_id(raw: dict[str, Any]) -> str:
    identifier = raw.get("id") or raw.get("name")
    if not identifier:
        raise ValueError(f"Source entry missing both 'id' and 'name': {raw}")
    return str(identifier)


def load_source_file(path: Path) -> list[SourceConfig]:
    """Parse one YAML file into a list of SourceConfig. Returns [] for an
    empty/missing-`sources` file (e.g. the currently-unpopulated
    api_sources.yml) instead of raising."""
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}

    entries = raw.get("sources") or []
    configs: list[SourceConfig] = []
    for entry in entries:
        configs.append(
            SourceConfig(
                id=_source_id(entry),
                type=entry["type"],
                url=entry["url"],
                mapping=entry.get("mapping", {}) or {},
                method=entry.get("method", "GET"),
                params=entry.get("params", {}) or {},
                headers=entry.get("headers", {}) or {},
            )
        )
    return configs


def load_all_sources(config_dir: Path) -> list[SourceConfig]:
    """Load every `*_sources.yml` file under `config_dir` into one flat list."""
    configs: list[SourceConfig] = []
    for path in sorted(config_dir.glob("*_sources.yml")):
        configs.extend(load_source_file(path))
    return configs
