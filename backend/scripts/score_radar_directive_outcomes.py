"""Measure historical directive outcomes from retained daily price windows."""
from __future__ import annotations

import argparse
import json
from typing import Any

from backend.radar_outcomes import horizon_key, measure_directive_outcome
from backend.storage import TraceMoneyStore

DEFAULT_HORIZONS = (1, 7, 30)
DEFAULT_BENCHMARK = "US_IDX_SPX"


def build_outcomes(
    store: TraceMoneyStore,
    *,
    limit: int,
    horizons: tuple[int, ...] = DEFAULT_HORIZONS,
    benchmark_id: str = DEFAULT_BENCHMARK,
    write: bool = False,
) -> dict[str, Any]:
    parent_refs = list(store.db.collection("tm_directive_history").list_documents())
    parent_refs.sort(key=lambda ref: ref.id)
    if limit > 0:
        parent_refs = parent_refs[:limit]
    instrument_ids = [ref.id for ref in parent_refs]
    prices = store.get_latest_prices([*instrument_ids, benchmark_id])
    benchmark_history = (prices.get(benchmark_id) or {}).get("history_window") or []
    measured = 0
    saved = 0
    skipped_existing = 0

    for parent in parent_refs:
        history = (prices.get(parent.id) or {}).get("history_window") or []
        for snap in parent.collection("calls").stream():
            call = snap.to_dict() or {}
            existing = call.get("outcomes") if isinstance(call.get("outcomes"), dict) else {}
            for days in horizons:
                key = horizon_key(days)
                if key in existing:
                    skipped_existing += 1
                    continue
                outcome = measure_directive_outcome(
                    call,
                    history,
                    horizon_days=days,
                    benchmark_history=benchmark_history,
                )
                if outcome is None:
                    continue
                measured += 1
                if write:
                    store.save_directive_outcome(parent.id, snap.id, key, outcome)
                    saved += 1

    return {
        "instrument_count": len(instrument_ids),
        "measured": measured,
        "saved": saved,
        "skipped_existing": skipped_existing,
        "benchmark_id": benchmark_id,
        "horizons": list(horizons),
        "status": "written" if write else "dry_run",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Score Radar directive outcomes")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--benchmark-id", default=DEFAULT_BENCHMARK)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    result = build_outcomes(
        TraceMoneyStore(),
        limit=max(0, args.limit),
        benchmark_id=str(args.benchmark_id).strip().upper(),
        write=args.write,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
