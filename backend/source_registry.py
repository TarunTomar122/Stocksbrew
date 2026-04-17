"""Load and query the canonical source registry."""
from __future__ import annotations

import json
from pathlib import Path

from backend.models import SourceDefinition


CONFIG_DIR = Path(__file__).resolve().parent / "config"
SOURCES_FILE = CONFIG_DIR / "sources.json"


def load_source_registry() -> dict:
    with SOURCES_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def list_sources() -> list[SourceDefinition]:
    payload = load_source_registry()
    return [SourceDefinition(**item) for item in payload.get("sources", [])]


def list_sources_for_market(market: str, include_review_sources: bool = False) -> list[SourceDefinition]:
    results: list[SourceDefinition] = []
    for source in list_sources():
        if market not in source.market_codes:
            continue
        if not source.enabled_by_default and not include_review_sources:
            continue
        if source.usage_status == "enabled":
            results.append(source)
            continue
        if include_review_sources and source.usage_status == "review_required":
            results.append(source)
    return results


def list_tracked_sources_for_market(market: str) -> list[SourceDefinition]:
    return [source for source in list_sources() if market in source.market_codes]
