"""Instrument universe helpers for Trace Money."""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from backend.env import backend_dir


UNIVERSE_PATH = backend_dir() / "config" / "instrument_universe.json"

# Universe IDs in the JSON are stable storage identifiers, not product tier
# names. See docs/stock-universes.md for the current search/coverage/runtime/
# tracked tier model before adding or repointing a universe.


@lru_cache(maxsize=1)
def load_instrument_catalog() -> dict[str, Any]:
    return json.loads(UNIVERSE_PATH.read_text(encoding="utf-8"))


def refresh_instrument_catalog() -> None:
    load_instrument_catalog.cache_clear()


def get_market_catalog(market: str) -> dict[str, Any]:
    payload = load_instrument_catalog()
    market_payload = payload.get("markets", {}).get(market)
    if market_payload is None:
        raise ValueError(f"Unknown market: {market}")
    return market_payload


def list_universes_for_market(market: str) -> dict[str, list[str]]:
    market_payload = get_market_catalog(market)
    universes = market_payload.get("universes", {})
    return {
        universe_id: list(instrument_ids)
        for universe_id, instrument_ids in universes.items()
    }


def get_default_universe_id(market: str) -> str | None:
    universes = list_universes_for_market(market)
    return next(iter(universes.keys()), None)


def list_instruments(market: str, universe_id: str | None = None) -> list[dict[str, Any]]:
    market_payload = get_market_catalog(market)
    instruments = list(market_payload.get("instruments", []))
    if universe_id is None:
        return instruments

    universe_members = set(list_universes_for_market(market).get(universe_id, []))
    if not universe_members:
        raise ValueError(f"Unknown universe {universe_id!r} for market {market}")

    order = {instrument_id: index for index, instrument_id in enumerate(list_universes_for_market(market)[universe_id])}
    filtered = [instrument for instrument in instruments if instrument["instrument_id"] in universe_members]
    filtered.sort(key=lambda instrument: order[instrument["instrument_id"]])
    return filtered


def get_instrument(instrument_id: str) -> dict[str, Any] | None:
    market = instrument_id.split("_", 1)[0] if "_" in instrument_id else ""
    if not market:
        return None
    for instrument in get_market_catalog(market).get("instruments", []):
        if instrument.get("instrument_id") == instrument_id:
            return instrument
    return None


def get_coverage_universe_id(market: str) -> str:
    defaults = {"US": "us_core_155", "IN": "in_core_150"}
    market_key = str(market or "").upper()
    return defaults.get(market_key, "")


def list_intel_universe_ids(market: str, store: Any | None = None) -> list[str]:
    """Runtime + coverage intel namespaces (deduped, stable order)."""
    from backend.storage import TraceMoneyStore

    store = store or TraceMoneyStore()
    market_key = str(market or "").upper()
    runtime = store.get_active_price_universe(market_key) or store.get_active_ai_universe(market_key) or ""
    coverage = get_coverage_universe_id(market_key)
    ordered = [runtime, coverage]
    if market_key == "US":
        ai = store.get_active_ai_universe(market_key) or runtime
        ordered = [runtime, ai, coverage]
    seen: set[str] = set()
    out: list[str] = []
    for universe_id in ordered:
        value = str(universe_id or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def list_tickers(market: str, universe_id: str | None = None) -> list[str]:
    return [instrument["ticker"] for instrument in list_instruments(market, universe_id)]


def list_coverage_delta_instrument_ids(
    market: str,
    runtime_universe_id: str | None = None,
) -> list[str]:
    """Instruments in coverage_catalog but outside runtime_core."""
    market_key = str(market or "").upper()
    universes = list_universes_for_market(market_key)
    runtime_id = str(runtime_universe_id or "").strip() or "us_core_100"
    coverage_id = get_coverage_universe_id(market_key)
    runtime_set = set(universes.get(runtime_id, []))
    coverage_set = set(universes.get(coverage_id, []))
    return sorted(coverage_set - runtime_set)
