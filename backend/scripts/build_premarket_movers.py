"""Build the pre-market movers snapshot for a market.

Scans a focused candidate set (today's earnings names, recent anomaly and Reddit
names, and every tracked stock) for pre-market quotes via Yahoo, computes the
gap vs prior close, and writes the biggest gappers to tm_premarket_movers.

Run during the pre-market window (US: 4:00-9:30 ET / 08:00-13:30 UTC); rows are
gated on a live pre-market print so running outside the window writes nothing.

Usage:
    python -m backend.scripts.build_premarket_movers --market US --dry-run
    python -m backend.scripts.build_premarket_movers --market US
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.providers.yfinance_provider import fetch_premarket_quotes
from backend.storage import TraceMoneyStore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _gather_candidate_tickers(store: TraceMoneyStore, market: str) -> tuple[set[str], set[str]]:
    """Return (tickers, tracked_instrument_ids) for the candidate set."""
    market = market.upper()
    tickers: set[str] = set()
    tracked_ids: set[str] = set()

    # Today's earnings names (catalysts most likely to gap).
    try:
        snap = (
            store.db.collection("tm_earnings_events")
            .where("market", "==", market)
            .where("event_date", "==", _today_iso())
            .get()
        )
        for doc in snap:
            t = str((doc.to_dict() or {}).get("ticker") or "").strip().upper()
            if t:
                tickers.add(t)
    except Exception as exc:
        print(f"[warn] earnings candidates failed: {exc}")

    # Yesterday's anomalies.
    try:
        doc = store.db.collection("tm_daily_anomalies").document(f"{market}__latest").get()
        for row in (doc.to_dict() or {}).get("anomalies", []) if doc.exists else []:
            t = str((row or {}).get("ticker") or "").strip().upper()
            if t:
                tickers.add(t)
    except Exception as exc:
        print(f"[warn] anomaly candidates failed: {exc}")

    # Reddit buzz names.
    try:
        doc = store.db.collection("reddit_snapshots").document(f"{market}__latest").get()
        for row in (doc.to_dict() or {}).get("tickers", []) if doc.exists else []:
            t = str((row or {}).get("ticker") or "").strip().upper()
            if t:
                tickers.add(t)
    except Exception as exc:
        print(f"[warn] reddit candidates failed: {exc}")

    # Every tracked stock across all users.
    try:
        prefix = f"{market}_"
        for user in store.db.collection("users").select(["tracked_stocks"]).stream():
            for raw in (user.to_dict() or {}).get("tracked_stocks") or []:
                iid = str(raw or "").strip().upper()
                if iid.startswith(prefix):
                    tracked_ids.add(iid)
    except Exception as exc:
        print(f"[warn] tracked candidates failed: {exc}")

    return tickers, tracked_ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Build pre-market movers snapshot")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--max-candidates", type=int, default=200)
    parser.add_argument("--max-workers", type=int, default=6)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    market = args.market.upper()
    store = TraceMoneyStore()

    tickers, tracked_ids = _gather_candidate_tickers(store, market)
    instruments = list_instruments(market)
    by_ticker = {str(i.get("ticker", "")).strip().upper(): i for i in instruments}
    by_id = {str(i.get("instrument_id", "")).strip().upper(): i for i in instruments}

    candidates: dict[str, dict[str, Any]] = {}
    for t in tickers:
        inst = by_ticker.get(t)
        if inst:
            candidates[inst["instrument_id"]] = inst
    for iid in tracked_ids:
        inst = by_id.get(iid)
        if inst:
            candidates[inst["instrument_id"]] = inst

    candidate_list = list(candidates.values())[: max(1, args.max_candidates)]
    print(f"candidates: {len(candidate_list)} (tickers={len(tickers)}, tracked={len(tracked_ids)})")

    if args.dry_run:
        print(json.dumps({"market": market, "candidates": len(candidate_list), "dry_run": True}))
        return

    quotes = fetch_premarket_quotes(candidate_list, max_workers=args.max_workers)
    print(f"pre-market prints: {len(quotes)}")

    rows: list[dict[str, Any]] = []
    market_state = ""
    for iid, q in quotes.items():
        inst = candidates.get(iid) or {}
        market_state = market_state or str(q.get("market_state") or "")
        rows.append({
            "instrument_id": iid,
            "ticker": q["ticker"],
            "name": inst.get("name") or q["ticker"],
            "logo_url": inst.get("logo_url"),
            "sector": inst.get("sector"),
            "pre_market_price": q["pre_market_price"],
            "previous_close": q["previous_close"],
            "pre_market_change_pct": q["pre_market_change_pct"],
        })

    rows.sort(key=lambda r: abs(r["pre_market_change_pct"]), reverse=True)
    gappers_up = [r for r in rows if r["pre_market_change_pct"] >= 0][:15]
    gappers_down = [r for r in rows if r["pre_market_change_pct"] < 0][:15]
    by_ticker_map = {r["ticker"]: {"pre_market_change_pct": r["pre_market_change_pct"], "pre_market_price": r["pre_market_price"]} for r in rows}

    payload = {
        "market": market,
        "generated_at": _now_iso(),
        "date": _today_iso(),
        "market_state": market_state,
        "candidate_count": len(candidate_list),
        "quoted_count": len(rows),
        "gappers_up": gappers_up,
        "gappers_down": gappers_down,
        "by_ticker": by_ticker_map,
    }
    store.save_premarket_movers(market, payload)
    print(json.dumps({
        "market": market,
        "quoted": len(rows),
        "up": len(gappers_up),
        "down": len(gappers_down),
        "market_state": market_state,
    }))


if __name__ == "__main__":
    main()
