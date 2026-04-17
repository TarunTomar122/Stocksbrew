"""Sync source registry and preference schema to Firestore."""
from __future__ import annotations

from backend.market_strategy import load_market_strategy
from backend.preferences import load_preferences_schema
from backend.source_registry import load_source_registry
from backend.storage import TraceMoneyStore


def main() -> None:
    store = TraceMoneyStore()
    source_registry = load_source_registry()
    market_strategy = load_market_strategy()
    preferences_schema = load_preferences_schema()
    store.save_source_registry(source_registry)
    store.save_market_strategy(market_strategy)
    store.save_preferences_schema(preferences_schema)
    print(f"Synced {len(source_registry.get('sources', []))} sources, market strategy, and preferences schema to Firestore.")


if __name__ == "__main__":
    main()
