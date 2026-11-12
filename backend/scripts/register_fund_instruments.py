"""Register the funds we cover as instruments, so each one has a page, a search entry and prices.

Run it (on the VPS, where ``LOCALDB_PATH`` points at the document store)::

    python3 -m backend.scripts.register_fund_instruments --dry-run   # say what would be added
    python3 -m backend.scripts.register_fund_instruments             # add what is missing, then price it

Which funds: ``backend/config/popular_funds.json`` plus every fund in
``tm_fund_meta/latest`` (written by ``backend.agentdata.fund_facts``, which
confirms the funds users hold with Yahoo first).

Same path as a fulfilled stock request (process_stock_requests.py):

1. ``tm_instruments/US_{TICKER}``: created only when it does not exist. An
   existing instrument is never changed, whoever wrote it.
2. ``tm_search_index/US``: one map entry per fund that has none, written key by
   key (``save_search_index_entries``) so the rest of the catalog is untouched.
   The nightly ``materialize_search_index`` rebuilds it from tm_instruments, so
   the funds stay in search from then on.
3. A first price snapshot (``sync_price_snapshots``) for every fund without one.
   After that the post-close price batch keeps them fresh: prune_price_core_overrides
   protects the popular funds and every tracked one in the price cohort.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_POPULAR_PATH = Path(__file__).resolve().parents[1] / "config" / "popular_funds.json"
META_PATH = ("tm_fund_meta", "latest")


def log(message: str) -> None:
    print(f"[fund instruments] {message}", flush=True)


def instrument_id_for(ticker: str) -> str:
    return f"US_{ticker.strip().upper().replace('.', '_')}"


def popular_fund_rows() -> list[dict[str, str]]:
    payload = json.loads(_POPULAR_PATH.read_text())
    return [
        {"ticker": str(row["ticker"]).strip().upper(), "name": str(row.get("name") or row["ticker"]).strip(), "exchange": str(row.get("exchange") or "").strip()}
        for row in payload.get("funds") or []
        if str(row.get("ticker") or "").strip()
    ]


def fund_rows(meta: dict[str, Any] | None) -> list[dict[str, str]]:
    """The popular list first (its names are the ones we chose), then confirmed funds from the facts job."""
    rows = popular_fund_rows()
    seen = {row["ticker"] for row in rows}
    for ticker, info in sorted(((meta or {}).get("funds") or {}).items()):
        key = str(ticker).strip().upper()
        if not key or key in seen or not isinstance(info, dict):
            continue
        seen.add(key)
        rows.append({"ticker": key, "name": str(info.get("name") or key).strip(), "exchange": ""})
    return rows


def new_instrument(row: dict[str, str], now: str) -> dict[str, Any]:
    """The instrument record for a fund we have not registered, in the shape a fulfilled stock request writes."""
    return {
        "instrument_id": instrument_id_for(row["ticker"]),
        "market": "US",
        "ticker": row["ticker"],
        "name": row["name"] or row["ticker"],
        "exchange": row.get("exchange") or "",
        "country": "US",
        "currency": "USD",
        "sector": "",
        "industry": "",
        "asset_type": "fund",
        "status": "active",
        "source": "fund_register",
        "saved_at": now,
    }


def search_entry(instrument: dict[str, Any], latest: dict[str, Any] | None) -> dict[str, Any]:
    quote = (latest or {}).get("quote") or {}
    return {
        "instrument_id": str(instrument.get("instrument_id") or "").upper(),
        "ticker": str(instrument.get("ticker") or "").upper(),
        "name": str(instrument.get("name") or instrument.get("ticker") or "").strip(),
        "exchange": str(instrument.get("exchange") or "").strip(),
        "price": quote.get("current"),
        "day_change_pct": quote.get("day_change_pct"),
        "updated_at": (latest or {}).get("updated_at"),
    }


def plan(
    rows: list[dict[str, str]],
    existing: dict[str, dict[str, Any]],
    indexed: set[str],
    priced: set[str],
    now: str,
) -> dict[str, Any]:
    """What to add: instruments that do not exist, search entries that are missing, and funds with no price yet."""
    create: list[dict[str, Any]] = []
    instruments: dict[str, dict[str, Any]] = {}
    for row in rows:
        iid = instrument_id_for(row["ticker"])
        if iid in existing:
            instruments[iid] = existing[iid]
        else:
            record = new_instrument(row, now)
            create.append(record)
            instruments[iid] = record
    return {
        "create": create,
        "index": [instruments[iid] for iid in instruments if iid not in indexed],
        "price": [iid for iid in instruments if iid not in priced],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="say what would be added, write nothing")
    parser.add_argument("--no-prices", action="store_true", help="skip the first price snapshot")
    parser.add_argument(
        "--allow-firebase",
        action="store_true",
        help="run without LOCALDB_PATH (TraceMoneyStore would then write to Firebase); off by default",
    )
    args = parser.parse_args(argv)

    if not os.getenv("LOCALDB_PATH", "").strip() and not args.allow_firebase:
        log("LOCALDB_PATH is not set, so this would write to Firebase instead of the document store. Stopping.")
        return 2

    from backend.storage import TraceMoneyStore

    store = TraceMoneyStore()
    meta_doc = store.db.collection(META_PATH[0]).document(META_PATH[1]).get()
    rows = fund_rows(meta_doc.to_dict() if meta_doc.exists else None)
    ids = [instrument_id_for(row["ticker"]) for row in rows]

    refs = [store.db.collection("tm_instruments").document(iid) for iid in ids]
    existing = {doc.id: (doc.to_dict() or {}) for doc in store.db.get_all(refs) if doc.exists}
    index_doc = store.db.collection("tm_search_index").document("US").get()
    indexed = {str(key).upper() for key in ((index_doc.to_dict() or {}).get("entries") or {})} if index_doc.exists else set()
    priced = set(store.get_latest_prices(ids))

    now = datetime.now(timezone.utc).isoformat()
    todo = plan(rows, existing, indexed, priced, now)
    log(
        f"{len(rows)} funds: {len(existing)} already registered, {len(todo['create'])} to add, "
        f"{len(todo['index'])} missing from search, {len(todo['price'])} without a price"
    )
    if todo["create"]:
        log("new: " + ", ".join(record["ticker"] for record in todo["create"]))
    if args.dry_run:
        log("dry run: nothing written")
        return 0

    created = 0
    for record in todo["create"]:
        ref = store.db.collection("tm_instruments").document(record["instrument_id"])
        try:
            # create(), not set(): if anything registered this ticker since the read above, it stays as it is.
            ref.create(record)
            created += 1
        except Exception as error:
            log(f"{record['ticker']}: not created ({type(error).__name__}); an instrument may already exist")
    log(f"created {created} instruments")

    if todo["price"] and not args.no_prices:
        from backend.scripts.sync_price_snapshots import sync_price_snapshots

        universe = store.get_active_price_universe("US") or "us_core_155"
        result = sync_price_snapshots(
            market="US",
            universe_id=universe,
            session_phase="manual",
            instrument_ids=todo["price"],
            merge_market_snapshot=True,
            store=store,
        )
        log(f"priced {result['saved_count']} of {result['input_count']} funds")

    if todo["index"]:
        latest = store.get_latest_prices([str(row.get("instrument_id") or "") for row in todo["index"]])
        written = store.save_search_index_entries("US", [search_entry(row, latest.get(str(row.get("instrument_id") or ""))) for row in todo["index"]])
        log(f"added {written} search entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
