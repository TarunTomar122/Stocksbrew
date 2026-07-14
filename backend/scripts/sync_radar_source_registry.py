"""Validate and seed allowlisted investor-relations URLs for Radar."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from backend.storage import TraceMoneyStore


def normalize_registry_entry(instrument_id: str, urls: list[str]) -> tuple[str, list[str]]:
    instrument_id = str(instrument_id or "").strip().upper()
    if not instrument_id.startswith("US_"):
        raise ValueError("instrument_id must start with US_")
    normalized: list[str] = []
    for raw in urls:
        url = str(raw or "").strip()
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError(f"invalid investor-relations URL for {instrument_id}: {url}")
        clean = parsed._replace(fragment="").geturl()
        if clean not in normalized:
            normalized.append(clean)
    if not normalized:
        raise ValueError(f"at least one investor-relations URL is required for {instrument_id}")
    return instrument_id, normalized[:5]


def load_registry(path: str | None, entries: list[str]) -> dict[str, list[str]]:
    payload: dict[str, Any] = {}
    if path:
        loaded = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(loaded, dict):
            raise ValueError("registry JSON must be an object keyed by instrument_id")
        payload.update(loaded)
    for entry in entries:
        instrument_id, separator, url = entry.partition("=")
        if not separator:
            raise ValueError("--entry must use US_TICKER=https://... format")
        payload.setdefault(instrument_id, [])
        payload[instrument_id].append(url)
    return {
        instrument_id: urls
        for raw_id, raw_urls in payload.items()
        for instrument_id, urls in [
            normalize_registry_entry(
                str(raw_id),
                raw_urls if isinstance(raw_urls, list) else [str(raw_urls)],
            )
        ]
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Radar investor-relations source registry")
    parser.add_argument("--file", help="JSON object of instrument IDs to HTTPS URL arrays")
    parser.add_argument(
        "--entry",
        action="append",
        default=[],
        help="Single US_TICKER=https://investor.example.com entry; repeatable",
    )
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = load_registry(args.file, args.entry)
    store = TraceMoneyStore()
    if args.write:
        for instrument_id, urls in registry.items():
            store.save_radar_source_registry(instrument_id, urls)
    print(
        json.dumps(
            {
                "instrument_count": len(registry),
                "url_count": sum(len(urls) for urls in registry.values()),
                "status": "written" if args.write else "dry_run",
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
