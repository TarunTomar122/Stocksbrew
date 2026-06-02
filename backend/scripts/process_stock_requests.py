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

import os

# Parallel workers call subprocess (fork) while Firestore uses gRPC in other threads.
os.environ.setdefault("GRPC_ENABLE_FORK_SUPPORT", "true")

import argparse
import json
import re
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import requests
from google.cloud import firestore

from backend.instrument_universe import list_instruments
from backend.lifecycle_emailing import email_stock_request_ready, send_email
from backend.llm_client import (
    json_response_format,
    llm_api_key,
    llm_api_url,
    llm_headers,
    llm_model,
    parse_json_content,
    schema_system_prompt,
)
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
OPENAI_DEFAULT_MODEL = "gpt-4.1-mini"
STALE_RUNNING_TTL_MINUTES = 20
RUNNABLE_REQUEST_STATUSES = {"queued", "retry", "pending", "needs_confirmation"}
INVALID_REQUEST_TOKENS = {
    "TO", "IT", "IN", "ON", "AT", "IS", "ARE",
    "HTTPS", "HTTP", "WWW", "COM", "DIV", "HREF",
}

SYMBOL_HINT_PROMPT = """You map user stock requests to likely US stock tickers.

Return JSON with:
- "symbol_hints": array of 1-5 uppercase ticker candidates (letters only where possible)
- "name_hints": array of 1-3 likely company names

Rules:
- Do not include ETFs unless the request clearly is an ETF (e.g. SPY, XBI, QQQ).
- If unsure, return an empty array.
- No prose, JSON only.
"""


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
        # Keep deterministic matching focused on standard equity-like symbols.
        # This avoids pseudo rows (e.g. long synthetic IDs) tying score with real tickers.
        if market == "US":
            if len(symbol) > 5:
                continue
            if not symbol.isalpha():
                continue
        exchange = str(item.get("exchange") or "").strip().upper()
        country = str(item.get("country") or "").strip().upper()
        if market == "US" and country and country not in {"UNITED STATES", "USA", "US"}:
            continue
        if market == "IN" and country and country not in {"INDIA", "IN"}:
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


def _llm_symbol_hints(query: str, market: str) -> tuple[list[str], list[str]]:
    if market != "US":
        return [], []
    api_key = llm_api_key()
    if not api_key:
        return [], []
    model = llm_model(OPENAI_DEFAULT_MODEL)
    endpoint = llm_api_url()
    payload = {"query": str(query or "").strip(), "market": market}
    resp = requests.post(
        endpoint,
        headers=llm_headers(api_key),
        json={
            "model": model,
            "temperature": 0.0,
            "messages": [
                {"role": "system", "content": schema_system_prompt(SYMBOL_HINT_PROMPT, {"type": "object"})},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            "response_format": json_response_format(),
        },
        timeout=30,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    parsed = parse_json_content(content)
    symbols = []
    for raw in parsed.get("symbol_hints") or []:
        sym = str(raw or "").strip().upper()
        if not sym:
            continue
        if len(sym) > 8:
            continue
        symbols.append(sym)
    names = []
    for raw in parsed.get("name_hints") or []:
        name = str(raw or "").strip()
        if name:
            names.append(name)
    # de-dup, preserve order
    def _dedupe(items: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for item in items:
            key = item.upper()
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
        return out
    return _dedupe(symbols)[:5], _dedupe(names)[:3]


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


def _resolve_request_with_llm_fallback(
    master_rows: list[dict[str, Any]],
    market: str,
    query: str,
) -> dict[str, Any] | None:
    resolved = _resolve_request(master_rows, market, query)
    if resolved:
        return resolved

    symbol_hints, name_hints = _llm_symbol_hints(query, market)
    probe_queries = [*symbol_hints, *name_hints]
    for probe in probe_queries:
        candidate = _resolve_request(master_rows, market, probe)
        if not candidate:
            continue
        # Guardrail: only accept LLM-assisted resolve when deterministic score
        # is still strong on the original user query.
        rescored = {
            **candidate,
            "_score": _score_candidate(query, candidate, market),
        }
        if int(rescored["_score"]) >= 70:
            return rescored

    # Name-first salvage path: if query is a company name, allow a slightly
    # lower score only when the top candidate is clearly ahead and exchange-safe.
    if len(normalize_name(query)) >= 5:
        provider_rows = _search_provider_candidates(query, market)
        if provider_rows:
            ranked = sorted(
                ({**row, "_score": _score_candidate(query, row, market)} for row in provider_rows),
                key=lambda row: row["_score"],
                reverse=True,
            )
            top = ranked[0] if ranked else None
            second = ranked[1] if len(ranked) > 1 else None
            if top and int(top.get("_score") or 0) >= 65 and (not second or int(top.get("_score") or 0) - int(second.get("_score") or 0) >= 20):
                return top
    return None


def _looks_like_junk_request(query: str) -> bool:
    q = str(query or "").strip().upper()
    if not q:
        return True
    if q in INVALID_REQUEST_TOKENS:
        return True
    if "/" in q or ":" in q:
        return True
    if q.endswith(".COM") or q.endswith(".NET") or q.endswith(".ORG"):
        return True
    return False


def _reset_stale_running_requests(store: TraceMoneyStore, *, ttl_minutes: int) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max(1, ttl_minutes))
    docs = store.db.collection("stock_requests").where("status", "==", "running").stream()
    reset = 0
    for doc in docs:
        data = doc.to_dict() or {}
        updated_raw = str(data.get("updated_at") or data.get("last_requested_at") or "").strip()
        stale = True
        if updated_raw:
            try:
                dt = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
                stale = dt < cutoff
            except Exception:
                stale = True
        if not stale:
            continue
        doc.reference.set(
            {
                "status": "retry",
                "resolve_error": "stale_running_recovered",
                "updated_at": _now(),
            },
            merge=True,
        )
        reset += 1
    return reset


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


def _upsert_search_index_entry(store: TraceMoneyStore, instrument: dict[str, Any]) -> None:
    market = str(instrument.get("market") or "US").upper()
    instrument_id = str(instrument.get("instrument_id") or "").upper()
    ticker = str(instrument.get("ticker") or "").upper()
    if not instrument_id or not ticker:
        return
    latest = store.get_latest_prices([instrument_id]).get(instrument_id) or {}
    quote = latest.get("quote") or {}
    store.save_search_index_entries(
        market,
        [
            {
                "instrument_id": instrument_id,
                "ticker": ticker,
                "name": str(instrument.get("name") or ticker).strip(),
                "exchange": str(instrument.get("exchange") or "").strip(),
                "price": quote.get("current"),
                "day_change_pct": quote.get("day_change_pct"),
                "updated_at": latest.get("updated_at"),
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


def _materialize_search_index(store: TraceMoneyStore, market: str) -> None:
    universe_id = store.get_active_price_universe(market)
    if not universe_id:
        return
    subprocess.run(
        [
            sys.executable,
            "-m",
            "backend.scripts.materialize_search_index",
            "--market",
            market,
            "--active-only",
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def _subscribed_requester_emails(store: TraceMoneyStore) -> set[str]:
    emails: set[str] = set()
    for user in store.list_subscribed_users():
        if not bool(user.get("is_subscribed")):
            continue
        for field in ("email", "email_lower"):
            raw = str(user.get(field) or "").strip().lower()
            if raw:
                emails.add(raw)
    return emails


def _requester_emails(data: dict[str, Any]) -> set[str]:
    emails = {
        str(e).strip().lower()
        for e in (data.get("requester_emails") or [])
        if str(e).strip()
    }
    legacy = str(data.get("requester_email") or "").strip().lower()
    if legacy:
        emails.add(legacy)
    return emails


def _pending_requests(
    store: TraceMoneyStore,
    limit: int,
    *,
    query: str | None = None,
    prioritize_query: str | None = None,
    requester_email: str | None = None,
    pro_emails: set[str] | None = None,
) -> list[Any]:
    if query:
        doc = store.db.collection("stock_requests").document(query.strip().upper()).get()
        docs = [doc] if doc.exists else []
    else:
        docs = list(store.db.collection("stock_requests").stream())
    requester = (requester_email or "").strip().lower()
    out = []
    for doc in docs:
        data = doc.to_dict() or {}
        if bool(data.get("fulfilled")):
            continue
        status = str(data.get("status") or "queued")
        if status not in RUNNABLE_REQUEST_STATUSES:
            continue
        if requester and requester not in _requester_emails(data):
            continue
        out.append(doc)

    prioritize = (prioritize_query or "").strip().upper()
    subscribed = pro_emails or set()

    def _sort_key(doc: Any) -> tuple[int, int, str]:
        data = doc.to_dict() or {}
        doc_id = str(doc.id or "").upper()
        is_priority = 0 if prioritize and doc_id == prioritize else 1
        is_pro = 0 if _requester_emails(data) & subscribed else 1
        ts = str(data.get("last_requested_at") or data.get("requested_at") or "")
        return (is_priority, is_pro, ts)

    out.sort(key=_sort_key)
    return out[: max(1, limit)]


def _claim_request(store: TraceMoneyStore, ref: Any, claim_id: str) -> dict[str, Any] | None:
    """Atomically claim a request so concurrent Cloud Run triggers do not
    process or email the same query twice."""

    @firestore.transactional
    def _txn(tx: Any) -> dict[str, Any] | None:
        snap = ref.get(transaction=tx)
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        if bool(data.get("fulfilled")):
            return None
        status = str(data.get("status") or "queued")
        if status not in RUNNABLE_REQUEST_STATUSES:
            return None
        tx.set(
            ref,
            {
                "status": "running",
                "processing_claim_id": claim_id,
                "processing_started_at": _now(),
                "updated_at": _now(),
            },
            merge=True,
        )
        return data

    return _txn(store.db.transaction())


def _process_one_request(
    *,
    store: TraceMoneyStore,
    ref: Any,
    data: dict[str, Any],
    default_market: str,
    master_by_market: dict[str, list[dict[str, Any]]],
    master_lock: threading.Lock,
    promote_lock: threading.Lock,
    markets_to_materialize: set[str],
    markets_lock: threading.Lock,
    dry_run: bool,
    to_email: str,
    skip_ready_email: bool,
) -> str:
    query = str(data.get("query") or ref.id).strip()
    market = str(data.get("market") or default_market).strip().upper()
    emails = [str(e).strip().lower() for e in (data.get("requester_emails") or []) if str(e).strip()]
    if to_email:
        emails = [to_email.strip().lower()]

    if not query:
        return "skip"
    if dry_run:
        print(f"  [dry] {ref.id} query={query} market={market}")
        return "dry"

    if _looks_like_junk_request(query):
        ref.set(
            {
                "status": "ignored",
                "fulfilled": False,
                "resolve_error": "junk_query_filtered",
                "updated_at": _now(),
            },
            merge=True,
        )
        print(f"  [ignored] {query}: junk_query_filtered")
        return "ignored"

    try:
        with master_lock:
            if market not in master_by_market:
                master_by_market[market] = _load_symbol_master(store, market)
            master = master_by_market[market]
        resolved = _resolve_request_with_llm_fallback(master, market, query)
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
            return "needs_confirmation"

        instrument = _upsert_instrument(store, resolved)
        with promote_lock:
            _promote_instrument(store, instrument)
        _sync_price_for_one(store, instrument)
        _upsert_search_index_entry(store, instrument)
        _backfill_single_instrument(store, instrument)
        _queue_news_job(store, instrument)
        with markets_lock:
            markets_to_materialize.add(market)

        sent = 0
        if not skip_ready_email:
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
        return "ok"
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
        return "fail"


def main() -> None:
    parser = argparse.ArgumentParser(description="Process stock requests automatically")
    parser.add_argument("--market", default="US", choices=["US", "IN"])
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--query", default="", help="Process only this request query (doc id)")
    parser.add_argument(
        "--prioritize-query",
        default="",
        help="Process up to --limit pending requests; run this query first",
    )
    parser.add_argument("--to-email", default="", help="Override send target for testing")
    parser.add_argument(
        "--requester-email",
        default="",
        help="Only process requests from this email (for backlog clears)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Parallel workers (each request still claims atomically)",
    )
    parser.add_argument(
        "--skip-ready-email",
        action="store_true",
        help="Do not send per-ticker ready emails (use for batch backlog)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    recovered = _reset_stale_running_requests(store, ttl_minutes=STALE_RUNNING_TTL_MINUTES)
    if recovered:
        print(f"[stock-requests] recovered_stale_running={recovered}")
    query = str(args.query or "").strip().upper()
    prioritize = str(args.prioritize_query or "").strip().upper()
    requester_email = str(args.requester_email or "").strip().lower()
    pro_emails = _subscribed_requester_emails(store)
    jobs = _pending_requests(
        store,
        args.limit,
        query=query or None,
        prioritize_query=prioritize or None,
        requester_email=requester_email or None,
        pro_emails=pro_emails,
    )
    if not jobs:
        print("No pending stock requests.")
        return

    workers = max(1, min(args.workers, len(jobs), 8))
    print(
        f"[stock-requests] processing={len(jobs)} market={args.market} workers={workers}"
        f" prioritize={prioritize or '-'} requester={requester_email or '-'}"
        f" pro_requesters={len(pro_emails)}"
    )
    master_by_market: dict[str, list[dict[str, Any]]] = {}
    master_lock = threading.Lock()
    promote_lock = threading.Lock()
    markets_to_materialize: set[str] = set()
    markets_lock = threading.Lock()

    def _run_claimed(job: Any) -> str:
        ref = job.reference
        claim_id = uuid4().hex
        data = _claim_request(store, ref, claim_id)
        if not data:
            print(f"  [skip] {ref.id}: already_claimed")
            return "skip"
        return _process_one_request(
            store=store,
            ref=ref,
            data=data,
            default_market=args.market,
            master_by_market=master_by_market,
            master_lock=master_lock,
            promote_lock=promote_lock,
            markets_to_materialize=markets_to_materialize,
            markets_lock=markets_lock,
            dry_run=args.dry_run,
            to_email=str(args.to_email or ""),
            skip_ready_email=bool(args.skip_ready_email),
        )

    counts: dict[str, int] = {}
    if workers == 1:
        for job in jobs:
            outcome = _run_claimed(job)
            counts[outcome] = counts.get(outcome, 0) + 1
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_run_claimed, job) for job in jobs]
            for fut in as_completed(futures):
                try:
                    outcome = fut.result()
                except Exception as exc:
                    outcome = "fail"
                    print(f"  [fail] worker: {exc}")
                counts[outcome] = counts.get(outcome, 0) + 1

    if not args.dry_run:
        for market in sorted(markets_to_materialize):
            try:
                _materialize_search_index(store, market)
                print(f"[stock-requests] materialized_search_index market={market}")
            except Exception as exc:
                print(f"[stock-requests] materialize_search_index_failed market={market}: {exc}")
            try:
                _materialize_home(store, market)
                print(f"[stock-requests] materialized_home market={market}")
            except Exception as exc:
                print(f"[stock-requests] materialize_home_failed market={market}: {exc}")

    print(f"[stock-requests] done {counts}")


if __name__ == "__main__":
    main()
