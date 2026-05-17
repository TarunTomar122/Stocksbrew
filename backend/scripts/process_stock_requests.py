"""Resolve stock_requests deterministically and fulfill automatically.

Flow:
1) Resolve request query -> symbol/instrument using tm_symbol_master scoring.
2) Fallback deterministic provider symbol search (Twelve Data) if needed.
3) Upsert tm_instruments entry if missing.
4) Fetch fresh price snapshot, merge into market snapshot.
5) Queue on-demand news job.
6) Rebuild home/search surface by materializing views.
7) Mark request fulfilled and send ready email.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

import requests

from backend.instrument_universe import list_instruments
from backend.lifecycle_emailing import email_stock_request_ready, send_email
from backend.market_strategy import normalize_ticker_entry
from backend.providers.yfinance_provider import YFinanceClient
from backend.scripts.materialize_views import materialize_views
from backend.storage import TraceMoneyStore


SUFFIX_RE = re.compile(
    r"\b(incorporated|inc|corp|corporation|ltd|limited|plc|class a|class b|co|company|holdings?)\b",
    flags=re.IGNORECASE,
)
PUNCT_RE = re.compile(r"[^a-z0-9\s]")
SPACE_RE = re.compile(r"\s+")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_name(value: str) -> str:
    text = str(value or "").strip().lower()
    text = SUFFIX_RE.sub(" ", text)
    text = PUNCT_RE.sub(" ", text)
    return SPACE_RE.sub(" ", text).strip()


def _tokens(value: str) -> set[str]:
    return {t for t in normalize_name(value).split(" ") if t}


def _trigram_set(value: str) -> set[str]:
    text = f"  {normalize_name(value)}  "
    if len(text) < 3:
        return {text}
    return {text[i : i + 3] for i in range(len(text) - 2)}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a.intersection(b)) / max(1, len(a.union(b)))


def _preferred_exchange_bonus(market: str, exchange: str) -> int:
    ex = str(exchange or "").upper()
    if market == "US" and ex in {"NASDAQ", "NYSE", "AMEX"}:
        return 15
    if market == "IN" and ex in {"NSE", "BSE"}:
        return 15
    return 0


def _score_candidate(query: str, candidate: dict[str, Any], market: str) -> int:
    q_sym = str(query or "").strip().upper()
    q_name = normalize_name(query)
    sym = str(candidate.get("symbol") or "").strip().upper()
    name = str(candidate.get("name") or "").strip()
    n_name = normalize_name(str(candidate.get("normalized_name") or name))
    aliases = [str(a or "") for a in (candidate.get("aliases") or [])]

    score = 0
    if sym and q_sym == sym:
        score += 100
    if q_name and q_name == n_name:
        score += 60
    if q_name and n_name.startswith(q_name):
        score += 30
    if q_name and q_name in n_name:
        score += 10
    for alias in aliases:
        alias_norm = normalize_name(alias)
        if q_sym and alias.strip().upper() == q_sym:
            score += 40
        if q_name and alias_norm == q_name:
            score += 20
        if q_name and alias_norm.startswith(q_name):
            score += 10

    # Deterministic fuzzy add-on.
    trigram_sim = _jaccard(_trigram_set(query), _trigram_set(name))
    token_sim = _jaccard(_tokens(query), _tokens(name))
    if trigram_sim >= 0.45 or token_sim >= 0.5:
        score += 20

    score += _preferred_exchange_bonus(market, str(candidate.get("exchange") or ""))
    if candidate.get("active") is False:
        score -= 50
    return score


def _load_symbol_master(store: TraceMoneyStore, market: str) -> list[dict[str, Any]]:
    docs = store.db.collection("tm_symbol_master").where("market", "==", market).stream()
    rows: list[dict[str, Any]] = []
    for doc in docs:
        data = doc.to_dict() or {}
        if not data:
            continue
        rows.append(data)
    return rows


def _resolve_from_master(rows: list[dict[str, Any]], market: str, query: str) -> dict[str, Any] | None:
    if not rows:
        return None

    ranked = sorted(
        (
            {
                **row,
                "_score": _score_candidate(query, row, market),
            }
            for row in rows
        ),
        key=lambda row: row["_score"],
        reverse=True,
    )
    top = ranked[0] if ranked else None
    second = ranked[1] if len(ranked) > 1 else None
    if not top:
        return None
    if int(top["_score"]) < 75:
        return None
    if second and int(top["_score"]) - int(second["_score"]) < 15:
        return None
    return top


def _search_provider_candidates(query: str, market: str) -> list[dict[str, Any]]:
    import os

    api_key = str(os.getenv("TWELVE_DATA_API_KEY") or "").strip()
    if not api_key:
        return []
    resp = requests.get(
        "https://api.twelvedata.com/symbol_search",
        params={"symbol": query, "apikey": api_key, "outputsize": 25},
        timeout=20,
    )
    resp.raise_for_status()
    payload = resp.json()
    data = payload.get("data")
    if not isinstance(data, list):
        return []
    out: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        exchange = str(item.get("exchange") or "").strip().upper()
        country = str(item.get("country") or "").strip().upper()
        if market == "US" and country and country != "UNITED STATES":
            continue
        if market == "IN" and country and country != "INDIA":
            continue
        out.append(
            {
                "market": market,
                "symbol": symbol,
                "instrument_id": f"{market}_{symbol}",
                "name": str(item.get("instrument_name") or item.get("symbol") or "").strip(),
                "exchange": exchange,
                "aliases": [symbol, str(item.get("instrument_name") or "").strip()],
                "normalized_name": normalize_name(str(item.get("instrument_name") or "")),
                "active": True,
            }
        )
    return out


def _resolve_request(master_rows: list[dict[str, Any]], market: str, query: str) -> dict[str, Any] | None:
    resolved = _resolve_from_master(master_rows, market, query)
    if resolved:
        return resolved
    provider_rows = _search_provider_candidates(query, market)
    if not provider_rows:
        return None
    ranked = sorted(
        ({**row, "_score": _score_candidate(query, row, market)} for row in provider_rows),
        key=lambda row: row["_score"],
        reverse=True,
    )
    top = ranked[0] if ranked else None
    second = ranked[1] if len(ranked) > 1 else None
    if not top:
        return None
    if int(top["_score"]) < 75:
        return None
    if second and int(top["_score"]) - int(second["_score"]) < 15:
        return None
    return top


def _catalog_instrument_map(market: str) -> dict[str, dict[str, Any]]:
    rows = list_instruments(market, None)
    return {str(item.get("ticker") or "").upper(): item for item in rows}


def _upsert_instrument(store: TraceMoneyStore, resolved: dict[str, Any]) -> dict[str, Any]:
    market = str(resolved.get("market") or "US").upper()
    symbol = str(resolved.get("symbol") or "").upper()
    instrument_id = str(resolved.get("instrument_id") or f"{market}_{symbol}").upper()
    existing = store.db.collection("tm_instruments").document(instrument_id).get()
    if existing.exists:
        return existing.to_dict() or {}

    catalog = _catalog_instrument_map(market)
    catalog_row = catalog.get(symbol)
    now = _now()
    if catalog_row:
        row = dict(catalog_row)
        row["saved_at"] = now
        store.db.collection("tm_instruments").document(instrument_id).set(row, merge=True)
        return row

    row = {
        "instrument_id": instrument_id,
        "market": market,
        "ticker": symbol,
        "name": str(resolved.get("name") or symbol),
        "exchange": str(resolved.get("exchange") or ""),
        "country": "US" if market == "US" else "IN",
        "currency": "USD" if market == "US" else "INR",
        "sector": "",
        "industry": "",
        "status": "active",
        "source": "stock_request_auto",
        "saved_at": now,
    }
    store.db.collection("tm_instruments").document(instrument_id).set(row, merge=True)
    return row


def _sync_price_for_one(store: TraceMoneyStore, instrument: dict[str, Any]) -> None:
    market = str(instrument.get("market") or "US").upper()
    instrument_id = str(instrument.get("instrument_id") or "")
    if not instrument_id:
        return
    quote = YFinanceClient(max_workers=1).fetch_quotes([instrument]).get(instrument_id)
    if not quote:
        raise ValueError(f"No quote fetched for {instrument_id}")
    snapshot = {
        "instrument_id": instrument_id,
        "market": market,
        "ticker": str(instrument.get("ticker") or ""),
        "captured_at": quote["captured_at"],
        "session_phase": "manual",
        "source": "yfinance",
        "currency": quote.get("currency") or instrument.get("currency", "USD"),
        "quote": quote["quote"],
        "fundamentals": quote.get("fundamentals", {}),
        "analyst_consensus": quote.get("analyst_consensus", {}),
        "provider_metadata": {
            "yahoo_symbol": quote.get("yahoo_symbol", ""),
            "exchange": quote.get("exchange", instrument.get("exchange", "")),
            "name": quote.get("name", instrument.get("name", "")),
        },
    }
    store.save_price_snapshots_bulk([snapshot])
    store.save_fundamental_snapshots_bulk(
        [
            (
                instrument_id,
                {
                    "instrument_id": instrument_id,
                    "market": market,
                    "ticker": str(instrument.get("ticker") or ""),
                    "captured_at": quote["captured_at"],
                    "source": "yfinance",
                    "currency": snapshot["currency"],
                    "fundamentals": snapshot["fundamentals"],
                    "analyst_consensus": snapshot["analyst_consensus"],
                },
            )
        ]
    )
    store.merge_market_price_snapshot(
        market,
        [
            {
                "instrumentId": instrument_id,
                "market": market,
                "symbol": str(instrument.get("ticker") or ""),
                "name": quote.get("name") or instrument.get("name") or str(instrument.get("ticker") or ""),
                "sectorId": None,
                "lastUpdated": quote.get("captured_at"),
                "price": {
                    "current": quote.get("quote", {}).get("current"),
                    "change": quote.get("quote", {}).get("day_change_abs"),
                    "changePct": quote.get("quote", {}).get("day_change_pct"),
                    "previousClose": quote.get("quote", {}).get("previous_close"),
                    "volume": quote.get("quote", {}).get("volume"),
                },
            }
        ],
    )


def _queue_news_job(store: TraceMoneyStore, instrument: dict[str, Any]) -> None:
    instrument_id = str(instrument.get("instrument_id") or "").upper()
    market = str(instrument.get("market") or "US").upper()
    universe_id = store.get_active_ai_universe(market) or store.get_active_price_universe(market) or ""
    ref = store.db.collection("tm_on_demand_news_jobs").document(instrument_id)
    ref.set(
        {
            "instrument_id": instrument_id,
            "market": market,
            "universe_id": universe_id,
            "status": "queued",
            "requested_at": _now(),
            "updated_at": _now(),
        },
        merge=True,
    )


def _promote_instrument(store: TraceMoneyStore, instrument: dict[str, Any]) -> None:
    market = str(instrument.get("market") or "US").upper()
    ticker = str(instrument.get("ticker") or "").upper()
    instrument_id = str(instrument.get("instrument_id") or "").upper()
    if not ticker or not instrument_id:
        return

    promoted = store.get_promoted_tickers(market)
    existing = {
        str(row.get("instrument_id") or row.get("ticker") or "").upper()
        for row in promoted
        if isinstance(row, dict)
    }
    if instrument_id not in existing and ticker not in existing:
        promoted.append(
            normalize_ticker_entry(
                {
                    "ticker": ticker,
                    "instrument_id": instrument_id,
                    "display_name": str(instrument.get("name") or ticker),
                },
                lane="promoted",
            )
        )
        store.save_promoted_tickers(market, promoted)

    ref = store.db.collection("tm_config").document("price_core_overrides")
    cap = 500 if market == "US" else 250
    doc = ref.get()
    payload = doc.to_dict() if doc.exists else {}
    current = payload.get(market) if isinstance(payload, dict) else []
    rows = current if isinstance(current, list) else []
    normalized = []
    seen = set()
    for raw in rows + [instrument_id]:
        iid = str(raw or "").strip().upper()
        if not iid or iid in seen:
            continue
        seen.add(iid)
        normalized.append(iid)
    if len(normalized) > cap:
        normalized = normalized[-cap:]
    ref.set({market: normalized, "updated_at": _now()}, merge=True)


def _backfill_single_instrument(store: TraceMoneyStore, instrument: dict[str, Any]) -> None:
    market = str(instrument.get("market") or "US").upper()
    universe_id = store.get_active_price_universe(market) or ""
    instrument_id = str(instrument.get("instrument_id") or "").upper()
    if not universe_id or not instrument_id:
        return

    common = ["--market", market, "--universe", universe_id, "--instrument-ids", instrument_id]
    cmds = [
        [sys.executable, "-m", "backend.scripts.sync_stock_metrics", *common, "--max-workers", "1", "--pause", "0.4"],
        [sys.executable, "-m", "backend.scripts.build_stock_intel_pro", *common],
        [sys.executable, "-m", "backend.scripts.build_stock_technicals", *common, "--finviz-workers", "1"],
    ]
    for cmd in cmds:
        subprocess.run(cmd, check=True, capture_output=True, text=True)


def _send_ready_email(emails: list[str], ticker: str, company_name: str) -> int:
    sent = 0
    subject, html = email_stock_request_ready(ticker=ticker, company_name=company_name)
    for raw in emails:
        to = str(raw or "").strip().lower()
        if not to:
            continue
        if send_email(to, subject, html):
            sent += 1
    return sent


def _materialize_home(store: TraceMoneyStore, market: str) -> None:
    universe_id = store.get_active_price_universe(market)
    if not universe_id:
        return
    materialize_views(
        market=market,
        universe_id=universe_id,
        allow_missing_context=True,
        skip_sector_scrape=True,
        store=store,
    )


def _pending_requests(store: TraceMoneyStore, limit: int) -> list[Any]:
    docs = list(store.db.collection("stock_requests").stream())
    out = []
    for doc in docs:
        data = doc.to_dict() or {}
        if bool(data.get("fulfilled")):
            continue
        status = str(data.get("status") or "queued")
        if status not in {"queued", "retry", "pending"}:
            continue
        out.append(doc)
    out.sort(key=lambda d: str((d.to_dict() or {}).get("last_requested_at") or ""))
    return out[:limit]


def main() -> None:
    parser = argparse.ArgumentParser(description="Process stock requests automatically")
    parser.add_argument("--market", default="US", choices=["US", "IN"])
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--to-email", default="", help="Override send target for testing")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    jobs = _pending_requests(store, args.limit)
    if not jobs:
        print("No pending stock requests.")
        return

    print(f"[stock-requests] processing={len(jobs)} market={args.market}")
    master_by_market: dict[str, list[dict[str, Any]]] = {}

    for job in jobs:
        ref = job.reference
        data = job.to_dict() or {}
        query = str(data.get("query") or ref.id).strip()
        market = str(data.get("market") or args.market).strip().upper()
        emails = [str(e).strip().lower() for e in (data.get("requester_emails") or []) if str(e).strip()]
        if args.to_email:
            emails = [args.to_email.strip().lower()]

        if not query:
            continue
        if args.dry_run:
            print(f"  [dry] {ref.id} query={query} market={market}")
            continue

        ref.set({"status": "running", "updated_at": _now()}, merge=True)
        try:
            if market not in master_by_market:
                master_by_market[market] = _load_symbol_master(store, market)
            resolved = _resolve_request(master_by_market[market], market, query)
            if not resolved:
                ref.set(
                    {
                        "status": "needs_confirmation",
                        "fulfilled": False,
                        "resolve_error": "no_deterministic_match",
                        "updated_at": _now(),
                    },
                    merge=True,
                )
                print(f"  [needs_confirmation] {query}")
                continue

            instrument = _upsert_instrument(store, resolved)
            _promote_instrument(store, instrument)
            _sync_price_for_one(store, instrument)
            _backfill_single_instrument(store, instrument)
            _queue_news_job(store, instrument)
            _materialize_home(store, market)
            sent = _send_ready_email(
                emails=emails,
                ticker=str(instrument.get("ticker") or query).upper(),
                company_name=str(instrument.get("name") or query),
            )

            ref.set(
                {
                    "status": "fulfilled",
                    "fulfilled": True,
                    "fulfilled_at": _now(),
                    "market": market,
                    "resolved_symbol": str(instrument.get("ticker") or "").upper(),
                    "resolved_instrument_id": str(instrument.get("instrument_id") or "").upper(),
                    "resolve_score": int(resolved.get("_score") or 0),
                    "email_sent_count": sent,
                    "updated_at": _now(),
                    "resolve_error": "",
                },
                merge=True,
            )
            print(f"  [ok] {query} -> {instrument.get('instrument_id')} email_sent={sent}")
        except Exception as exc:
            ref.set(
                {
                    "status": "retry",
                    "fulfilled": False,
                    "resolve_error": str(exc),
                    "updated_at": _now(),
                },
                merge=True,
            )
            print(f"  [fail] {query}: {exc}")


if __name__ == "__main__":
    main()
