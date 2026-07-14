from __future__ import annotations

import json

import pytest

from backend.scripts.sync_radar_source_registry import load_registry, normalize_registry_entry


def test_registry_accepts_https_and_removes_fragments() -> None:
    instrument_id, urls = normalize_registry_entry(
        "us_aapl",
        [
            "https://investor.apple.com/#reports",
            "https://investor.apple.com/#reports",
        ],
    )
    assert instrument_id == "US_AAPL"
    assert urls == ["https://investor.apple.com/"]


def test_registry_rejects_unsafe_urls() -> None:
    with pytest.raises(ValueError):
        normalize_registry_entry("US_AAPL", ["http://investor.apple.com/"])
    with pytest.raises(ValueError):
        normalize_registry_entry("IN_RELIANCE", ["https://example.com/"])


def test_registry_loads_json_and_cli_entries(tmp_path) -> None:
    path = tmp_path / "registry.json"
    path.write_text(
        json.dumps({"US_AAPL": ["https://investor.apple.com/"]}),
        encoding="utf-8",
    )
    registry = load_registry(
        str(path),
        ["US_MSFT=https://www.microsoft.com/en-us/Investor/"],
    )
    assert sorted(registry) == ["US_AAPL", "US_MSFT"]
