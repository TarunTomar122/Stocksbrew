"""Build the weekly movers snapshot for a market.

Scans tracked names, recent anomaly/reddit names, and benchmark indices for
trailing 5-session price change via Yahoo, then writes tm_weekly_movers.

Usage:
    python -m backend.scripts.build_weekly_movers --market US --dry-run
    python -m backend.scripts.build_weekly_movers --market US
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from backend.instrument_universe import list_instruments
from backend.providers.yfinance_provider import fetch_weekly_quotes
from backend.storage import TraceMoneyStore
from backend.weekly_intel import INDEX_INSTRUMENT_IDS, iso_week_dedupe_key, sector_summary_from_rows, week_label_ending

_MARKET_TZ = {"US": "America/New_York", "IN": "Asia/Kolkata"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _trading_date_iso(market: str) -> str:
    tz_name = _MARKET_TZ.get(market.upper(), "America/New_York")
    return datetime.now(ZoneInfo(tz_name)).date().isoformat()


def _gather_candidate_tickers(store: TraceMoneyStore, market: str) -> tuple[set[str], set[str]]:
    market = market.upper()
    tickers: set[str] = set()
    tracked_ids: set[str] = set()

    try:
        doc = store.db.collection("tm_daily_anomalies").document(f"{market}__latest").get()
        for row in (doc.to_dict() or {}).get("anomalies", []) if doc.exists else []:
            t = str((row or {}).get("ticker") or "").strip().upper()
            if t:
                tickers.add(t)
    except Exception as exc:
        print(f"[warn] anomaly candidates failed: {exc}")

    try:
        doc = store.db.collection("reddit_snapshots").document(f"{market}__latest").get()
        for row in (doc.to_dict() or {}).get("tickers", []) if doc.exists else []:
            t = str((row or {}).get("ticker") or "").strip().upper()
            if t:
                tickers.add(t)
    except Exception as exc:
        print(f"[warn] reddit candidates failed: {exc}")

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
    parser = argparse.ArgumentParser(description="Build weekly movers snapshot")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--max-candidates", type=int, default=220)
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
    for index_id in INDEX_INSTRUMENT_IDS if market == "US" else ():
        inst = by_id.get(index_id)
        if inst:
            candidates[inst["instrument_id"]] = inst
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

    quotes = fetch_weekly_quotes(candidate_list, max_workers=args.max_workers)
    print(f"weekly prints: {len(quotes)}")

    rows: list[dict[str, Any]] = []
    indices: dict[str, dict[str, Any]] = {}
    for iid, quote in quotes.items():
        inst = by_id.get(iid) or {}
        ticker = str(quote.get("ticker") or inst.get("ticker") or "").strip().upper()
        row = {
            "instrument_id": iid,
            "ticker": ticker,
            "name": inst.get("name") or ticker,
            "sector": inst.get("sector"),
            "price": quote["price"],
            "week_start_price": quote["week_start_price"],
            "week_change_pct": quote["week_change_pct"],
        }
        if iid in INDEX_INSTRUMENT_IDS:
            label = "S&P 500" if iid == "US_IDX_SPX" else "Nasdaq"
            indices[label] = {
                "ticker": ticker,
                "price": quote["price"],
                "week_change_pct": quote["week_change_pct"],
            }
            continue
        rows.append(row)

    rows.sort(key=lambda r: abs(r["week_change_pct"]), reverse=True)
    movers_up = [r for r in rows if r["week_change_pct"] >= 0][:15]
    movers_down = [r for r in rows if r["week_change_pct"] < 0][:15]
    by_ticker_map = {
        r["ticker"]: {
            "week_change_pct": r["week_change_pct"],
            "price": r["price"],
            "week_start_price": r.get("week_start_price"),
        }
        for r in rows
    }

    payload = {
        "market": market,
        "generated_at": _now_iso(),
        "date": _trading_date_iso(market),
        "week_key": iso_week_dedupe_key(),
        "week_label": week_label_ending(),
        "candidate_count": len(candidate_list),
        "quoted_count": len(rows),
        "indices": indices,
        "movers_up": movers_up,
        "movers_down": movers_down,
        "by_ticker": by_ticker_map,
        "sector_summary": sector_summary_from_rows(rows),
    }
    store.save_weekly_movers(market, payload)

    from backend.scripts.trigger_web_revalidate import trigger_web_revalidate

    trigger_web_revalidate(["/pulse"])

    print(json.dumps({
        "market": market,
        "quoted": len(rows),
        "up": len(movers_up),
        "down": len(movers_down),
        "indices": list(indices.keys()),
        "week_label": payload["week_label"],
    }))


if __name__ == "__main__":
    main()
