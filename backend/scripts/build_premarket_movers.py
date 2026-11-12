"""Build the pre-market movers snapshot for a market.

Scans a focused candidate set for pre-market quotes via Yahoo, computes the gap
vs prior close, and writes the biggest gappers to tm_premarket_movers. The set,
in priority order and capped at --max-candidates (600):

1. SPY and QQQ, and every stock and fund in the example portfolio (US only),
2. what signed-in users hold, most-held first,
3. today's catalysts: earnings names, yesterday's anomalies, Reddit names,
4. what users only watch, most-watched first.

Stocks in the instrument catalog can be gappers; names outside it (index ETFs,
funds, user stocks we do not cover) are quote-only: they go into ``by_ticker``,
so the web app's holdings, stock pages and weekly memo chart can show their
pre-market move, but never into the gapper lists.

Run during the pre-market window (US: 4:00-9:30 ET / 08:00-13:30 UTC); rows are
gated on a live pre-market print so running outside the window writes nothing.

Usage:
    python -m backend.scripts.build_premarket_movers --market US --dry-run
    python -m backend.scripts.build_premarket_movers --market US
"""
from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from collections.abc import Callable, Iterable
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from backend.instrument_universe import list_instruments
from backend.providers.yfinance_provider import fetch_premarket_quotes
from backend.storage import TraceMoneyStore


#: Always quoted (US): the S&P 500 and Nasdaq 100, so anything compared with the market has a pre-market number.
REFERENCE_TICKERS: tuple[str, ...] = ("SPY", "QQQ")

#: The example portfolio's stocks and funds, holdings and watchlist. Keep in step with EXAMPLE in
#: lib/portfolio-data.ts; backend/tests/test_build_premarket_movers.py checks that the two lists match.
EXAMPLE_PORTFOLIO_TICKERS: tuple[str, ...] = (
    "MSFT", "AAPL", "NVDA", "JPM", "COST", "XOM", "UNH", "VOO", "QQQ", "AMD", "LLY", "CAT",
)

DEFAULT_MAX_CANDIDATES = 600
#: Symbols per Yahoo batch download, and the pause between batches, to stay well under Yahoo's rate limits.
QUOTE_BATCH_SIZE = 150
QUOTE_BATCH_PAUSE_S = 2.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_MARKET_TZ = {"US": "America/New_York", "IN": "Asia/Kolkata"}


def _trading_date_iso(market: str) -> str:
    tz_name = _MARKET_TZ.get(market.upper(), "America/New_York")
    return datetime.now(ZoneInfo(tz_name)).date().isoformat()


def _catalyst_tickers(store: TraceMoneyStore, market: str) -> list[str]:
    """Today's earnings names, yesterday's anomalies and Reddit names, in that order, deduped."""
    market = market.upper()
    out: list[str] = []

    def add(raw: Any) -> None:
        ticker = str(raw or "").strip().upper()
        if ticker and ticker not in out:
            out.append(ticker)

    # Today's earnings names (catalysts most likely to gap).
    try:
        snap = (
            store.db.collection("tm_earnings_events")
            .where("market", "==", market)
            .where("event_date", "==", _trading_date_iso(market))
            .get()
        )
        for doc in snap:
            add((doc.to_dict() or {}).get("ticker"))
    except Exception as exc:
        print(f"[warn] earnings candidates failed: {exc}")

    # Yesterday's anomalies.
    try:
        doc = store.db.collection("tm_daily_anomalies").document(f"{market}__latest").get()
        for row in (doc.to_dict() or {}).get("anomalies", []) if doc.exists else []:
            add((row or {}).get("ticker"))
    except Exception as exc:
        print(f"[warn] anomaly candidates failed: {exc}")

    # Reddit buzz names.
    try:
        doc = store.db.collection("reddit_snapshots").document(f"{market}__latest").get()
        for row in (doc.to_dict() or {}).get("tickers", []) if doc.exists else []:
            add((row or {}).get("ticker"))
    except Exception as exc:
        print(f"[warn] reddit candidates failed: {exc}")

    return out


def _ticker_for_id(instrument_id: str, by_id: dict[str, dict[str, Any]]) -> str:
    """The ticker for an instrument id: the catalog's, else from the id ("US_BRK_B" is BRK.B, as the web app reads it)."""
    inst = by_id.get(instrument_id)
    if inst and str(inst.get("ticker") or "").strip():
        return str(inst["ticker"]).strip().upper()
    _, _, rest = instrument_id.partition("_")
    return rest.replace("_", ".").strip().upper()


def user_book_tickers(
    users: Iterable[dict[str, Any]],
    market: str,
    by_id: dict[str, dict[str, Any]],
) -> tuple[list[str], list[str]]:
    """(held, watched) tickers across users, each most-common first, then A-Z. A ticker anyone holds is only in held.

    Reads ``watchlist_positions`` (an instrument id marked "holding") and ``tracked_stocks``; never writes.
    """
    prefix = f"{market.upper()}_"
    held: Counter[str] = Counter()
    watched: Counter[str] = Counter()
    for user in users:
        positions = user.get("watchlist_positions") or {}
        positions = positions if isinstance(positions, dict) else {}
        user_held: set[str] = set()
        for raw_id, kind in positions.items():
            iid = str(raw_id or "").strip().upper()
            if iid.startswith(prefix) and str(kind or "").strip().lower() == "holding":
                ticker = _ticker_for_id(iid, by_id)
                if ticker:
                    user_held.add(ticker)
        user_watched: set[str] = set()
        for raw_id in user.get("tracked_stocks") or []:
            iid = str(raw_id or "").strip().upper()
            if iid.startswith(prefix):
                ticker = _ticker_for_id(iid, by_id)
                if ticker and ticker not in user_held:
                    user_watched.add(ticker)
        held.update(user_held)
        watched.update(user_watched)

    def ranked(counts: Counter[str], skip: set[str]) -> list[str]:
        return [ticker for ticker, _ in sorted(counts.items(), key=lambda item: (-item[1], item[0])) if ticker not in skip]

    held_list = ranked(held, set())
    return held_list, ranked(watched, set(held_list))


def _list_users(store: TraceMoneyStore) -> list[dict[str, Any]]:
    """Every user's holdings and tracked stocks (read-only)."""
    try:
        return [
            user.to_dict() or {}
            for user in store.db.collection("users").select(["tracked_stocks", "watchlist_positions"]).stream()
        ]
    except Exception as exc:
        print(f"[warn] user candidates failed: {exc}")
        return []


def candidate_tickers(
    *,
    market: str,
    held: list[str],
    catalysts: list[str],
    watched: list[str],
    cap: int = DEFAULT_MAX_CANDIDATES,
) -> list[str]:
    """The quote list in priority order, deduped and capped (see the module docstring)."""
    fixed = [*REFERENCE_TICKERS, *EXAMPLE_PORTFOLIO_TICKERS] if market.upper() == "US" else []
    out: list[str] = []
    seen: set[str] = set()
    for ticker in [*fixed, *held, *catalysts, *watched]:
        ticker = str(ticker or "").strip().upper()
        if ticker and ticker not in seen:
            seen.add(ticker)
            out.append(ticker)
    return out[: max(1, cap)]


def candidate_instruments(
    tickers: list[str],
    *,
    market: str,
    by_ticker: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], set[str]]:
    """Instruments to quote, and the ids of the quote-only ones (not in the catalog; US only)."""
    market = market.upper()
    out: list[dict[str, Any]] = []
    quote_only: set[str] = set()
    seen: set[str] = set()
    for ticker in tickers:
        inst = by_ticker.get(ticker)
        if inst is None:
            # Outside the US the Yahoo symbol needs the catalog's exchange suffix, so only catalog names are quoted.
            if market != "US":
                continue
            inst = {"instrument_id": f"{market}_{ticker.replace('.', '_')}", "ticker": ticker, "market": market, "name": ticker}
            quote_only.add(inst["instrument_id"])
        iid = str(inst.get("instrument_id") or "").strip().upper()
        if not iid or iid in seen:
            continue
        seen.add(iid)
        out.append(inst)
    return out, quote_only


def fetch_quotes_in_batches(
    instruments: list[dict[str, Any]],
    *,
    max_workers: int,
    batch_size: int = QUOTE_BATCH_SIZE,
    pause_s: float = QUOTE_BATCH_PAUSE_S,
    fetch: Callable[..., dict[str, dict[str, Any]]] = fetch_premarket_quotes,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, dict[str, Any]]:
    """The same Yahoo quotes as before, a batch at a time with a pause between, so 600 names do not trip rate limits."""
    quotes: dict[str, dict[str, Any]] = {}
    size = max(1, batch_size)
    for start in range(0, len(instruments), size):
        if start:
            sleep(pause_s)
        try:
            quotes.update(fetch(instruments[start : start + size], max_workers=max_workers))
        except Exception as exc:
            # One failed batch costs only its names; the rest of the snapshot still goes out.
            print(f"[warn] pre-market batch {start // size + 1} failed: {exc}")
    return quotes


def _canonicalize_row(
    *,
    instrument_id: str,
    quote: dict[str, Any],
    candidates: dict[str, dict[str, Any]],
    by_ticker: dict[str, dict[str, Any]],
    by_id: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    ticker = str(quote.get("ticker") or "").strip().upper()
    if not ticker:
        return None

    # Always prefer the current universe mapping by ticker. This protects the
    # snapshot from stale tracked IDs or mismatched candidate metadata.
    inst = by_ticker.get(ticker)
    if inst is None:
        candidate = candidates.get(instrument_id) or {}
        candidate_id = str(candidate.get("instrument_id") or "").strip().upper()
        candidate_ticker = str(candidate.get("ticker") or "").strip().upper()
        if candidate_id and candidate_id in by_id and candidate_ticker == ticker:
            inst = by_id[candidate_id]
    if inst is None:
        return None

    return {
        "instrument_id": str(inst.get("instrument_id") or instrument_id).strip().upper(),
        "ticker": ticker,
        "name": inst.get("name") or ticker,
        "logo_url": inst.get("logo_url"),
        "sector": inst.get("sector"),
        "pre_market_price": quote["pre_market_price"],
        "previous_close": quote["previous_close"],
        "pre_market_change_pct": quote["pre_market_change_pct"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build pre-market movers snapshot")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--max-candidates", type=int, default=DEFAULT_MAX_CANDIDATES)
    parser.add_argument("--max-workers", type=int, default=6)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    market = args.market.upper()
    store = TraceMoneyStore()

    instruments = list_instruments(market)
    by_ticker = {str(i.get("ticker", "")).strip().upper(): i for i in instruments}
    by_id = {str(i.get("instrument_id", "")).strip().upper(): i for i in instruments}

    held, watched = user_book_tickers(_list_users(store), market, by_id)
    # Catalysts stay catalog-only, as before: Reddit and earnings lists can carry names Yahoo cannot quote.
    catalysts = [ticker for ticker in _catalyst_tickers(store, market) if ticker in by_ticker]
    tickers = candidate_tickers(market=market, held=held, catalysts=catalysts, watched=watched, cap=args.max_candidates)
    candidate_list, quote_only_ids = candidate_instruments(tickers, market=market, by_ticker=by_ticker)
    candidates = {str(inst["instrument_id"]).strip().upper(): inst for inst in candidate_list}
    print(
        f"candidates: {len(candidate_list)} (held={len(held)}, catalysts={len(catalysts)}, "
        f"watched={len(watched)}, quote_only={len(quote_only_ids)})"
    )

    if args.dry_run:
        print(json.dumps({"market": market, "candidates": len(candidate_list), "quote_only": len(quote_only_ids), "dry_run": True}))
        return

    quotes = fetch_quotes_in_batches(candidate_list, max_workers=args.max_workers)
    print(f"pre-market prints: {len(quotes)}")

    rows: list[dict[str, Any]] = []
    quote_only_rows: list[dict[str, Any]] = []
    market_state = ""
    dropped = 0
    for iid, q in quotes.items():
        market_state = market_state or str(q.get("market_state") or "")
        if iid in quote_only_ids:
            ticker = str(q.get("ticker") or "").strip().upper()
            if ticker:
                quote_only_rows.append({"ticker": ticker, **{key: q.get(key) for key in ("pre_market_price", "previous_close", "pre_market_change_pct")}})
            continue
        row = _canonicalize_row(
            instrument_id=iid,
            quote=q,
            candidates=candidates,
            by_ticker=by_ticker,
            by_id=by_id,
        )
        if row is None:
            dropped += 1
            continue
        rows.append(row)

    rows.sort(key=lambda r: abs(r["pre_market_change_pct"]), reverse=True)
    gappers_up = [r for r in rows if r["pre_market_change_pct"] >= 0][:15]
    gappers_down = [r for r in rows if r["pre_market_change_pct"] < 0][:15]
    # Every quote, gapper-eligible or quote-only, in the same shape the web app already reads.
    by_ticker_map = {
        r["ticker"]: {
            "pre_market_change_pct": r["pre_market_change_pct"],
            "pre_market_price": r["pre_market_price"],
            "previous_close": r.get("previous_close"),
        }
        for r in [*quote_only_rows, *rows]
    }

    from backend.premarket_intel import sector_summary_from_rows

    payload = {
        "market": market,
        "generated_at": _now_iso(),
        "date": _trading_date_iso(market),
        "market_state": market_state,
        "candidate_count": len(candidate_list),
        "quoted_count": len(rows),
        # Quotes kept only in by_ticker (index ETFs, funds, user stocks outside the catalog); not in the gapper lists.
        "quote_only_count": len(quote_only_rows),
        "gappers_up": gappers_up,
        "gappers_down": gappers_down,
        "by_ticker": by_ticker_map,
        "sector_summary": sector_summary_from_rows(rows),
    }
    store.save_premarket_movers(market, payload)

    from backend.scripts.trigger_web_revalidate import trigger_web_revalidate

    trigger_web_revalidate(["/pulse", "/premarket"])

    print(json.dumps({
        "market": market,
        "quoted": len(rows),
        "quote_only": len(quote_only_rows),
        "up": len(gappers_up),
        "down": len(gappers_down),
        "dropped": dropped,
        "market_state": market_state,
    }))


if __name__ == "__main__":
    main()
