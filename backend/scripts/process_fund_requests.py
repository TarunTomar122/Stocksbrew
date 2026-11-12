"""Cover any US fund on demand: ETFs and mutual funds people open, import, type in or follow.

The app files a request in ``stock_requests/{TICKER}`` (the same queue as a
stock request) when someone opens /stock/<FUND> for a fund we do not have,
imports or types one, or follows one. This worker picks the fund requests up
and covers each fund the way register_fund_instruments does, plus what a fund
page needs on its first view:

1. Yahoo confirms it is a fund (quote type ETF or MUTUALFUND) and gives its
   facts. Anything else goes back to the stock path untouched.
2. ``tm_instruments/US_{TICKER}``: created only when missing (``create()``),
   never changed when it exists.
3. ``tm_fund_facts/{TICKER}`` and one key in ``tm_fund_meta/latest``.
4. A first price snapshot and the search index entry, and the fund joins the
   after-close price batch (``tm_config/price_core_overrides``). A mutual fund
   is priced once a day from its NAV; there is no intraday price.
5. Daily price history when none is stored.
6. The request is marked fulfilled, then the holdings are read from SEC N-PORT
   when the fund files one (slow for a big fund, so the page is already up).

Run it (on the VPS, where ``LOCALDB_PATH`` points at the document store)::

    python3 -m backend.scripts.process_fund_requests            # fund requests waiting now
    python3 -m backend.scripts.process_fund_requests --dry-run  # say which ones, write nothing
    python3 -m backend.scripts.process_fund_requests --query VTWO

The 30-minute stock request lane (process_stock_requests.py) sends fund
tickers through ``fulfill_fund`` too, so funds are covered even where the
two-minute fund timer (backend/vps/units/tikrr-fund-requests.timer) is not installed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

FUND_LIST_PATH = Path(__file__).resolve().parents[1] / "config" / "us_fund_tickers.json"
RUNNABLE_STATUSES = ("queued", "retry", "pending")
FUND_TICKER = re.compile(r"^[A-Z]{1,5}$")
# A fund request asked by a page view or an import should not wait behind a long backlog.
DEFAULT_LIMIT = 6
# A request that failed (Yahoo down, a store error) waits this long before the fund lane tries it again.
RETRY_AFTER_MINUTES = 10


def log(message: str) -> None:
    print(f"[fund requests] {message}", flush=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def instrument_id_for(ticker: str) -> str:
    return f"US_{ticker.strip().upper().replace('.', '_')}"


# ---------------------------------------------------------------------------
# Which tickers are funds (pure; covered by backend/tests/test_fund_requests.py)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def listed_funds() -> tuple[frozenset[str], frozenset[str]]:
    """ETF and mutual fund tickers from backend/config/us_fund_tickers.json (build_us_fund_tickers.py)."""
    try:
        payload = json.loads(FUND_LIST_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return frozenset(), frozenset()
    return frozenset(str(payload.get("etfs") or "").split()), frozenset(str(payload.get("mutual_funds") or "").split())


def fund_kind(ticker: str) -> str | None:
    """"etf" or "mutual_fund" when the checked-in list names the ticker, else None."""
    key = str(ticker or "").strip().upper()
    if not FUND_TICKER.match(key):
        return None
    etfs, mutual_funds = listed_funds()
    if key in etfs:
        return "etf"
    if key in mutual_funds:
        return "mutual_fund"
    return None


def is_fund_candidate(ticker: str, sec_funds: set[str] | frozenset[str] | None = None) -> bool:
    """Worth asking Yahoo whether this is a fund: the checked-in list, or the SEC's live fund file."""
    key = str(ticker or "").strip().upper()
    if not FUND_TICKER.match(key):
        return False
    return fund_kind(key) is not None or bool(sec_funds and key in sec_funds)


def kind_of_quote_type(quote_type: str | None) -> str:
    return "mutual_fund" if str(quote_type or "").upper() == "MUTUALFUND" else "etf"


def new_fund_instrument(ticker: str, name: str, quote_type: str | None, now: str) -> dict[str, Any]:
    """The instrument record for a fund covered on demand: register_fund_instruments' shape, plus its kind."""
    from backend.scripts.register_fund_instruments import new_instrument

    record = new_instrument({"ticker": ticker, "name": name or ticker, "exchange": ""}, now)
    record["source"] = "fund_request"
    record["fund_kind"] = kind_of_quote_type(quote_type)
    return record


def meta_entry(doc: dict[str, Any]) -> dict[str, Any]:
    """The fund's line in tm_fund_meta/latest, as fund_facts.build_meta writes it."""
    return {"name": doc.get("name") or doc["ticker"], "quote_type": doc.get("quote_type"), "held": False, "checked_at": doc.get("fetched_at")}


def keep_existing_facts(existing: dict[str, Any] | None, new: dict[str, Any]) -> bool:
    """A name-only document never replaces one with figures."""
    figures = ("expense_ratio", "aum_usd", "dividend_yield", "inception_date")
    return bool(existing) and any(key in existing for key in figures) and not any(key in new for key in figures)


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


def _merge_map_key(ref: Any, field: str, key: str, value: dict[str, Any]) -> None:
    """Add one key to a map field without rewriting the rest of the document (another job may write it too)."""
    try:
        ref.update({f"{field}.{key}": value, "updated_at": _now()})
    except Exception:  # Firestore refuses update() on a missing document; merge creates it
        ref.set({field: {key: value}, "updated_at": _now()}, merge=True)


def _register_instrument(store: Any, ticker: str, doc: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """The fund's instrument: the existing record as it is, or a new one created only if still missing."""
    iid = instrument_id_for(ticker)
    ref = store.db.collection("tm_instruments").document(iid)
    snap = ref.get()
    if snap.exists:
        return snap.to_dict() or {}, False
    record = new_fund_instrument(ticker, str(doc.get("name") or ticker), doc.get("quote_type"), _now())
    try:
        ref.create(record)
        return record, True
    except Exception as error:  # someone registered it since the read: theirs stays
        log(f"{ticker}: not created ({type(error).__name__}); keeping the record already there")
        again = ref.get()
        return (again.to_dict() or record) if again.exists else record, False


def _add_to_price_batch(store: Any, instrument_id: str) -> None:
    """The after-close price batch quotes everything in price_core_overrides; funds stay out of the promoted (call) lane."""
    ref = store.db.collection("tm_config").document("price_core_overrides")
    snap = ref.get()
    payload = snap.to_dict() if snap.exists else {}
    current = payload.get("US") if isinstance(payload, dict) else []
    rows = [str(raw or "").strip().upper() for raw in (current if isinstance(current, list) else [])]
    if instrument_id in rows:
        return
    rows = [row for row in rows if row] + [instrument_id]
    ref.set({"US": rows[-500:], "updated_at": _now()}, merge=True)


def _price(store: Any, instrument: dict[str, Any]) -> bool:
    from backend.scripts.process_stock_requests import _sync_price_for_one, _upsert_search_index_entry

    priced = True
    try:
        _sync_price_for_one(store, instrument)
    except Exception as error:  # the after-close batch prices it later; the page says it has no price yet
        log(f"{instrument.get('ticker')}: no first price ({error})")
        priced = False
    _upsert_search_index_entry(store, instrument)
    return priced


def _history(docs: Any, ticker: str) -> None:
    from backend.agentdata import prices

    path = f"{prices.COLLECTION}/{prices.doc_id(ticker)}"
    if docs.get(path):
        return
    prices.load_many([ticker], store=docs, log=False)


def _holdings(docs: Any, ticker: str) -> str:
    """Read the fund's latest N-PORT; return what happened. Never raises."""
    try:
        from backend.agentdata import etf_holdings

        built, report = etf_holdings.collect([ticker], store=docs, force=False, use_figi=True)
        if built:
            docs.set_many(built)
        item = report[0] if report else {"status": "missing"}
        if item.get("status") in ("ok", "derivatives", "not_stocks", "unchanged"):
            entry = {"status": item["status"], "as_of": item.get("as_of"), "fund_name": item.get("fund_name")}
            if item["status"] == "unchanged":
                return "unchanged"
            ref = _meta_ref(docs, etf_holdings.META_PATH)
            if ref is not None:
                _merge_map_key(ref, "funds", ticker, entry)
        return str(item.get("status") or "missing")
    except Exception as error:
        log(f"{ticker}: holdings not read ({type(error).__name__}: {error})")
        return "failed"


def _meta_ref(docs: Any, path: str) -> Any:
    """A document reference for a field-level update; only the SQLite store (the VPS) has one."""
    db = getattr(docs, "_db", None)
    if db is None:
        return None
    return db.document(path)


def fulfill_fund(
    *,
    store: Any,
    docs: Any,
    ref: Any,
    ticker: str,
    fetch: Callable[..., dict[str, Any] | None] | None = None,
    price: Callable[[Any, dict[str, Any]], bool] = _price,
    history: Callable[[Any, str], None] = _history,
    holdings: Callable[[Any, str], str] = _holdings,
) -> str:
    """Cover one fund. Returns "ok", "not_a_fund" (the request is left as it was) or "fail" (marked for retry)."""
    from backend.agentdata import fund_facts

    key = str(ticker or "").strip().upper()
    fetch = fetch or fund_facts.fetch_fund
    try:
        doc = fetch(key, fallback_name=None, fetched_at=_now(), minimal=True)
    except Exception as error:
        ref.set({"status": "retry", "fulfilled": False, "resolve_error": f"fund_check: {error}", "updated_at": _now()}, merge=True)
        log(f"{key}: Yahoo check failed ({type(error).__name__})")
        return "fail"
    if not doc:
        return "not_a_fund"

    try:
        instrument, created = _register_instrument(store, key, doc)
        existing = docs.get(f"{fund_facts.COLLECTION}/{key}")
        if not keep_existing_facts(existing, doc):
            docs.set(f"{fund_facts.COLLECTION}/{key}", doc)
        meta = _meta_ref(docs, fund_facts.META_PATH)
        if meta is not None:
            _merge_map_key(meta, "funds", key, meta_entry(doc))
        _add_to_price_batch(store, str(instrument.get("instrument_id") or instrument_id_for(key)))
        priced = price(store, {**instrument, "instrument_id": instrument.get("instrument_id") or instrument_id_for(key), "ticker": key, "market": "US"})
        try:
            history(docs, key)
        except Exception as error:  # the chart fills in with the after-close history step
            log(f"{key}: no daily history yet ({type(error).__name__})")
    except Exception as error:
        ref.set({"status": "retry", "fulfilled": False, "resolve_error": f"fund: {error}", "updated_at": _now()}, merge=True)
        log(f"{key}: failed ({type(error).__name__}: {error})")
        return "fail"

    kind = kind_of_quote_type(doc.get("quote_type"))
    ref.set(
        {
            "status": "fulfilled",
            "fulfilled": True,
            "fulfilled_at": _now(),
            "market": "US",
            "kind": "fund",
            "fund_kind": kind,
            "resolved_symbol": key,
            "resolved_instrument_id": instrument_id_for(key),
            "resolve_error": "",
            "updated_at": _now(),
        },
        merge=True,
    )
    log(f"{key}: covered as {'a mutual fund' if kind == 'mutual_fund' else 'an ETF'}{' (new instrument)' if created else ''}{'' if priced else ', no price yet'}")
    status = holdings(docs, key)
    log(f"{key}: holdings {status}")
    return "ok"


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


def _recent(iso: Any, now: datetime, minutes: int) -> bool:
    try:
        stamp = datetime.fromisoformat(str(iso or "").replace("Z", "+00:00"))
    except ValueError:
        return False
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return (now - stamp).total_seconds() < minutes * 60


def pending_fund_requests(
    rows: list[tuple[Any, dict[str, Any]]], *, query: str = "", limit: int = DEFAULT_LIMIT, now: datetime | None = None
) -> list[tuple[Any, dict[str, Any]]]:
    """Runnable requests for listed funds, oldest ask first.

    Skipped: requests the fund check sent back to the stock lane, and a failed
    one ("retry") for RETRY_AFTER_MINUTES, so a Yahoo outage is not hit every two minutes.
    """
    now = now or datetime.now(timezone.utc)
    out = []
    for doc, data in rows:
        ticker = str(data.get("query") or doc.id or "").strip().upper()
        if query and ticker != query:
            continue
        status = str(data.get("status") or "queued")
        if bool(data.get("fulfilled")) or status not in RUNNABLE_STATUSES:
            continue
        if data.get("fund_check") == "not_a_fund" or not is_fund_candidate(ticker):
            continue
        if status == "retry" and not query and _recent(data.get("updated_at"), now, RETRY_AFTER_MINUTES):
            continue
        out.append((doc, data))
    out.sort(key=lambda item: str(item[1].get("last_requested_at") or item[1].get("requested_at") or ""))
    return out[: max(1, limit)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--query", default="", help="only this ticker")
    parser.add_argument("--dry-run", action="store_true", help="say which requests would run, write nothing")
    parser.add_argument("--allow-firebase", action="store_true", help="run without LOCALDB_PATH; off by default")
    args = parser.parse_args(argv)

    if not os.getenv("LOCALDB_PATH", "").strip() and not args.allow_firebase:
        log("LOCALDB_PATH is not set, so this would write to Firebase instead of the document store. Stopping.")
        return 2

    from backend.agentdata.store import DocStore
    from backend.scripts.process_stock_requests import _claim_request
    from backend.storage import TraceMoneyStore

    store = TraceMoneyStore()
    rows: list[tuple[Any, dict[str, Any]]] = []
    seen: set[str] = set()
    for status in RUNNABLE_STATUSES:
        for doc in store.db.collection("stock_requests").where("status", "==", status).stream():
            if doc.id not in seen:
                seen.add(doc.id)
                rows.append((doc, doc.to_dict() or {}))
    jobs = pending_fund_requests(rows, query=str(args.query or "").strip().upper(), limit=args.limit)
    if not jobs:
        return 0
    log(f"{len(jobs)} fund requests: {', '.join(doc.id for doc, _ in jobs)}")
    if args.dry_run:
        return 0

    docs = DocStore.from_env()
    counts: dict[str, int] = {}
    for doc, _ in jobs:
        ref = doc.reference
        if not _claim_request(store, ref, uuid4().hex):
            counts["skip"] = counts.get("skip", 0) + 1
            continue
        outcome = fulfill_fund(store=store, docs=docs, ref=ref, ticker=doc.id)
        if outcome == "not_a_fund":
            # Back to the stock lane, which resolves it as a stock (or says it cannot).
            ref.set({"status": "queued", "fund_check": "not_a_fund", "updated_at": _now()}, merge=True)
            log(f"{doc.id}: Yahoo does not call it a fund; left for the stock lane")
        counts[outcome] = counts.get(outcome, 0) + 1
    log(f"done {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
