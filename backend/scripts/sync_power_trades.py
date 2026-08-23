"""Sync curated power trades (STOCK Act disclosures) into Firestore.

Each run sweeps Bargo's global feed newest-first down to the rolling window
floor (--days, default 45), keeps watchlist matches, writes one doc per trade
to tm_power_trades plus a latest-run telemetry doc, and prunes past retention.
Set BARGO_API_KEY for the keyed quota so full-depth sweeps fit in one run.

Usage:
    python -m backend.scripts.sync_power_trades [--days 45] [--dry-run]
"""
from __future__ import annotations

import argparse
import time
from datetime import datetime, timedelta, timezone

from backend import power_trades
from backend.env import load_backend_env

RETENTION_DAYS = 120


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=power_trades.DEFAULT_DAYS)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_backend_env()
    t0 = time.time()
    print(f"\n{'='*55}")
    print(f"  sync_power_trades (window {args.days}d)")
    print(f"{'='*55}")

    result = power_trades.collect(days=args.days)
    rows = result["rows"]
    summary = power_trades.summarize(rows)
    print(f"Source: {result['source']} | pages: {result.get('pages')} | drained to floor: {result.get('exhausted')}")
    for err in result["errors"]:
        print(f"Failover note: {err}")
    print(
        f"Rows: {summary['total']} ({summary['buys']} buys / {summary['sells']} sells) "
        f"across {summary['people']} people"
    )
    if not result.get("exhausted"):
        print("NOTE: page cap hit before reaching the window floor; coverage is shallower than requested.")
        print("      Set BARGO_API_KEY (free) for the keyed quota.")

    if not rows:
        print("No watchlist rows this run")
        return

    if args.dry_run:
        for row in rows[:12]:
            print(
                f"  {row['transaction_date']} {row['person_name']:<26} "
                f"{(row['tx_type'] or '?'):<4} {row['ticker']:<6} {row['amount_low']}-{row['amount_high']}"
            )
        print("Dry run only, not writing")
        return

    from backend.storage import TraceMoneyStore

    store = TraceMoneyStore()
    collection = store.db.collection("tm_power_trades")
    saved = 0
    for row in rows:
        collection.document(row["trade_id"]).set(row, merge=True)
        saved += 1

    by_person: dict[str, dict] = {}
    for row in rows:
        entry = by_person.setdefault(
            row["person_id"],
            {"name": row["person_name"], "count": 0, "last_tx_date": ""},
        )
        entry["count"] += 1
        entry["last_tx_date"] = max(entry["last_tx_date"], str(row["transaction_date"]))

    now_iso = datetime.now(timezone.utc).isoformat()
    store.db.collection("tm_power_trades_meta").document("latest").set(
        {
            "captured_at": now_iso,
            "source": result["source"],
            "fetch_window_days": args.days,
            "retention_days": RETENTION_DAYS,
            "pages_used": result.get("pages", 0),
            "drained_to_floor": bool(result.get("exhausted")),
            "run_summary": summary,
            "people": by_person,
            "failover_notes": result["errors"],
            "duration_seconds": round(time.time() - t0, 1),
        },
        merge=True,
    )

    cutoff = _cutoff_iso(RETENTION_DAYS)
    pruned = 0
    for doc in collection.where("transaction_date", "<", cutoff).stream():
        doc.reference.delete()
        pruned += 1

    print(f"Saved {saved} docs to tm_power_trades")
    print(f"Pruned {pruned} docs older than {cutoff}")
    print(f"Done in {round(time.time() - t0, 1)}s\n")


def _cutoff_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=max(1, days))).strftime("%Y-%m-%d")


if __name__ == "__main__":
    main()
