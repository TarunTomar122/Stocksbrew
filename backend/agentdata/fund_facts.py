"""Fund facts: what a fund costs, how big it is, what it pays and when it started.

Run it::

    python3 -m backend.agentdata.fund_facts                       # popular funds plus funds users hold
    python3 -m backend.agentdata.fund_facts --funds VOO,SCHD --dry-run
    python3 -m backend.agentdata.fund_facts --no-held             # the popular list only

Source: Yahoo Finance through yfinance (``Ticker.info`` and ``Ticker.funds_data``),
the same library the price jobs use. One fund is two or three requests.

Collections (all additive; nothing else is touched):

* ``tm_fund_facts/{TICKER}``  one fund: expense ratio, assets, dividend yield,
                              inception date, category, family, and Yahoo's
                              sector and asset mix, with the fetch time
* ``tm_fund_meta/latest``     every fund this job has confirmed, with its name:
                              what the app reads to know a ticker is a fund, and
                              what register_fund_instruments registers
* ``tm_price_history_daily``  only for a confirmed fund with no stored history
                              yet (the after-close price step keeps it fresh)

Which funds: ``backend/config/popular_funds.json``, plus any ticker users track
or hold (``tracked_stocks`` and ``watchlist_positions``) that the SEC lists as a
fund and Yahoo calls an ETF or a mutual fund. Only tickers are read from the
user documents; nothing about the users is kept or printed.

A value Yahoo does not give is left out, never guessed. A fund whose fetch fails
keeps the document from its last good run.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import prices
from .store import DocStore

COLLECTION = "tm_fund_facts"
META_PATH = "tm_fund_meta/latest"
SCHEMA_VERSION = 1
SOURCE = "Yahoo Finance"

_POPULAR_PATH = Path(__file__).resolve().parents[1] / "config" / "popular_funds.json"
# Yahoo's quote types for the things we treat as funds.
FUND_QUOTE_TYPES = {"ETF", "MUTUALFUND"}
# Held tickers checked against Yahoo per run, beyond the popular list. Each is two or three requests.
MAX_HELD_CHECKS = 200
# Pause between funds so a run stays polite to Yahoo.
PAUSE_SECONDS = 0.4

# Yahoo's sector keys, in the eleven sector names the app uses (lib/gics-sector.ts).
YAHOO_SECTORS = {
    "technology": "Technology",
    "healthcare": "Health Care",
    "financial_services": "Financials",
    "consumer_cyclical": "Consumer Discretionary",
    "consumer_defensive": "Consumer Staples",
    "communication_services": "Communication Services",
    "industrials": "Industrials",
    "energy": "Energy",
    "basic_materials": "Materials",
    "realestate": "Real Estate",
    "utilities": "Utilities",
}
YAHOO_ASSETS = {
    "stockPosition": "stocks",
    "bondPosition": "bonds",
    "cashPosition": "cash",
    "preferredPosition": "preferred",
    "convertiblePosition": "convertible",
    "otherPosition": "other",
}


def log(message: str) -> None:
    print(f"[fund facts] {message}", flush=True)


def popular_funds() -> list[dict[str, str]]:
    """The checked-in list of popular US funds: ticker, name and exchange."""
    payload = json.loads(_POPULAR_PATH.read_text())
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in payload.get("funds") or []:
        ticker = str(row.get("ticker") or "").strip().upper()
        if ticker and ticker not in seen:
            seen.add(ticker)
            out.append({"ticker": ticker, "name": str(row.get("name") or ticker).strip(), "exchange": str(row.get("exchange") or "").strip()})
    return out


# ---------------------------------------------------------------------------
# Pure helpers (covered by backend/tests/test_agentdata_fund_facts.py)
# ---------------------------------------------------------------------------


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _fraction(value: Any, *, low: float, high: float) -> float | None:
    number = _num(value)
    return number if number is not None and low <= number < high else None


def _iso_day(epoch: Any) -> str | None:
    number = _num(epoch)
    if number is None or number <= 0:
        return None
    try:
        return datetime.fromtimestamp(number, tz=timezone.utc).strftime("%Y-%m-%d")
    except (OverflowError, OSError, ValueError):
        return None


def expense_ratio_of(info: dict[str, Any], operations: dict[str, Any] | None) -> float | None:
    """The yearly cost as a fraction (0.0003 is 0.03%).

    ``funds_data.fund_operations`` gives the annual-report figure as a fraction;
    ``info["netExpenseRatio"]`` gives the net figure in percent. The net figure
    is what the holder pays, so it wins when both are there.
    """
    net = _num(info.get("netExpenseRatio"))
    if net is not None and 0 <= net < 10:
        return round(net / 100, 6)
    report = _num((operations or {}).get("Annual Report Expense Ratio"))
    if report is not None and 0 <= report < 0.1:
        return round(report, 6)
    return None


def dividend_yield_of(info: dict[str, Any]) -> float | None:
    """The trailing yield as a fraction: ``yield`` is one already, ``dividendYield`` is in percent."""
    value = _fraction(info.get("yield"), low=0, high=0.5)
    if value is not None:
        return round(value, 6)
    percent = _num(info.get("dividendYield"))
    if percent is not None and 0 <= percent < 50:
        return round(percent / 100, 6)
    return None


def sector_weights_of(raw: dict[str, Any] | None) -> dict[str, float] | None:
    """Yahoo's sector weights in our sector names; None when they cover too little to mean anything (a bond fund)."""
    out: dict[str, float] = {}
    for key, value in (raw or {}).items():
        name = YAHOO_SECTORS.get(str(key))
        weight = _fraction(value, low=0, high=1.0001)
        if name and weight is not None and weight > 0:
            out[name] = round(weight, 6)
    return out if sum(out.values()) >= 0.5 else None


def asset_mix_of(raw: dict[str, Any] | None) -> dict[str, float] | None:
    out: dict[str, float] = {}
    for key, value in (raw or {}).items():
        name = YAHOO_ASSETS.get(str(key))
        number = _num(value)
        if name and number is not None:
            out[name] = round(number, 6)
    return out or None


def build_fact_doc(
    ticker: str,
    info: dict[str, Any],
    *,
    operations: dict[str, Any] | None = None,
    sectors: dict[str, Any] | None = None,
    assets: dict[str, Any] | None = None,
    fallback_name: str | None = None,
    fetched_at: str,
) -> dict[str, Any] | None:
    """One fund's document, or None when Yahoo does not call it a fund or gave us nothing to keep."""
    quote_type = str(info.get("quoteType") or "").upper()
    if quote_type not in FUND_QUOTE_TYPES:
        return None
    doc: dict[str, Any] = {
        "ticker": ticker,
        "name": str(info.get("longName") or info.get("shortName") or fallback_name or ticker).strip(),
        "quote_type": quote_type,
        "source": SOURCE,
        "fetched_at": fetched_at,
        "schema_version": SCHEMA_VERSION,
    }
    figures = {
        "expense_ratio": expense_ratio_of(info, operations),
        "aum_usd": _fraction(info.get("totalAssets") or info.get("netAssets"), low=1, high=1e14),
        "dividend_yield": dividend_yield_of(info),
        "inception_date": _iso_day(info.get("fundInceptionDate")),
        "category": str(info.get("category") or "").strip() or None,
        "family": str(info.get("fundFamily") or "").strip() or None,
        "legal_type": str(info.get("legalType") or "").strip() or None,
        "sector_weights": sector_weights_of(sectors),
        "asset_mix": asset_mix_of(assets),
    }
    doc.update({key: value for key, value in figures.items() if value is not None})
    if not any(key in doc for key in ("expense_ratio", "aum_usd", "dividend_yield", "inception_date")):
        return None
    return doc


def held_tickers(users: list[tuple[str, dict[str, Any]]]) -> list[str]:
    """US tickers anyone tracks or holds, from ``tracked_stocks`` and ``watchlist_positions``. Tickers only."""
    tickers: set[str] = set()
    for _, user in users:
        raw_ids: list[Any] = list(user.get("tracked_stocks") or []) if isinstance(user.get("tracked_stocks"), list) else []
        positions = user.get("watchlist_positions")
        if isinstance(positions, dict):
            raw_ids.extend(positions.keys())
        for raw in raw_ids:
            iid = str(raw or "").strip().upper()
            if iid.startswith("US_") and len(iid) > 3:
                tickers.add(iid[3:].replace("_", "."))
    return sorted(tickers)


def build_meta(
    previous: dict[str, Any] | None,
    docs: list[tuple[str, dict[str, Any]]],
    *,
    held: set[str],
    now_iso: str,
) -> dict[str, Any]:
    """Every fund confirmed so far: earlier runs are kept, this run's names win."""
    funds = {str(k).upper(): dict(v) for k, v in ((previous or {}).get("funds") or {}).items() if isinstance(v, dict)}
    for _, doc in docs:
        ticker = doc["ticker"]
        funds[ticker] = {
            **funds.get(ticker, {}),
            "name": doc.get("name") or ticker,
            "quote_type": doc.get("quote_type"),
            "held": ticker in held,
            "checked_at": doc.get("fetched_at"),
        }
    return {"funds": dict(sorted(funds.items())), "updated_at": now_iso, "source": SOURCE}


# ---------------------------------------------------------------------------
# Yahoo
# ---------------------------------------------------------------------------


def fetch_fund(ticker: str, *, fallback_name: str | None, fetched_at: str) -> dict[str, Any] | None:
    import yfinance as yf  # the backend's own dependency; imported here so the pure helpers test without it

    handle = yf.Ticker(ticker.replace(".", "-"))
    info = handle.info or {}
    if str(info.get("quoteType") or "").upper() not in FUND_QUOTE_TYPES:
        return None
    operations: dict[str, Any] | None = None
    sectors: dict[str, Any] | None = None
    assets: dict[str, Any] | None = None
    try:
        data = handle.funds_data
        table = data.fund_operations
        if table is not None and not table.empty:
            column = ticker if ticker in table.columns else table.columns[0]
            operations = {str(k): v for k, v in table[column].to_dict().items()}
        sectors = dict(data.sector_weightings or {})
        assets = dict(data.asset_classes or {})
    except Exception as error:  # the fund's quote still says enough on its own
        log(f"{ticker}: no fund details ({type(error).__name__})")
    return build_fact_doc(
        ticker, info, operations=operations, sectors=sectors, assets=assets, fallback_name=fallback_name, fetched_at=fetched_at
    )


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


def candidate_held_funds(store: DocStore, popular: set[str], known: set[str]) -> tuple[list[str], set[str]]:
    """Held tickers worth asking Yahoo about: funds we confirmed before, or ones the SEC lists as funds."""
    try:
        users = store.list("users", limit=5000)
    except RuntimeError as error:
        log(f"could not list held stocks ({error}); popular funds only")
        return [], set()
    held = set(held_tickers(users))
    rest = sorted(held - popular)
    if not rest:
        return [], held
    try:
        from .etf_holdings import UIT_CIKS, fund_series_by_ticker

        sec_funds = set(fund_series_by_ticker()) | set(UIT_CIKS)
    except Exception as error:  # EDGAR down: only funds we already know stay in
        log(f"SEC fund list unavailable ({type(error).__name__}); checking known funds only")
        sec_funds = set()
    picked = [ticker for ticker in rest if ticker in known or ticker in sec_funds]
    if len(picked) > MAX_HELD_CHECKS:
        log(f"{len(picked)} held funds, checking the first {MAX_HELD_CHECKS}")
        picked = picked[:MAX_HELD_CHECKS]
    return picked, held


def collect(
    tickers: list[str],
    names: dict[str, str],
    *,
    fetch: Callable[..., dict[str, Any] | None] = fetch_fund,
    pause: float = PAUSE_SECONDS,
) -> tuple[list[tuple[str, dict[str, Any]]], list[dict[str, Any]]]:
    fetched_at = datetime.now(timezone.utc).isoformat()
    docs: list[tuple[str, dict[str, Any]]] = []
    report: list[dict[str, Any]] = []
    for index, ticker in enumerate(tickers):
        if index and pause:
            time.sleep(pause)
        try:
            doc = fetch(ticker, fallback_name=names.get(ticker), fetched_at=fetched_at)
        except Exception as error:  # one bad reply must not cost the other funds
            log(f"{ticker}: fetch failed ({type(error).__name__})")
            report.append({"ticker": ticker, "status": "failed"})
            continue
        if not doc:
            report.append({"ticker": ticker, "status": "not_a_fund"})
            continue
        docs.append((f"{COLLECTION}/{ticker}", doc))
        report.append(
            {
                "ticker": ticker,
                "status": "ok",
                "expense_ratio": doc.get("expense_ratio"),
                "aum_usd": doc.get("aum_usd"),
                "dividend_yield": doc.get("dividend_yield"),
                "inception_date": doc.get("inception_date"),
            }
        )
    return docs, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--funds", help="comma-separated tickers; default: the popular list plus funds users hold")
    parser.add_argument("--no-held", action="store_true", help="do not add funds found in users' holdings")
    parser.add_argument("--no-history", action="store_true", help="do not fetch daily price history for funds that have none")
    parser.add_argument("--dry-run", action="store_true", help="print the summary, write nothing")
    args = parser.parse_args(argv)

    store = DocStore.from_env()
    popular = popular_funds()
    names = {row["ticker"]: row["name"] for row in popular}
    previous = store.get(META_PATH) or {}
    known = {str(t).upper() for t in (previous.get("funds") or {})}
    held: set[str] = set()
    if args.funds:
        tickers = list(dict.fromkeys(t.strip().upper() for t in args.funds.split(",") if t.strip()))
    else:
        tickers = [row["ticker"] for row in popular]
        if not args.no_held:
            extra, held = candidate_held_funds(store, set(tickers), known)
            if extra:
                log(f"checking funds users hold: {', '.join(extra)}")
            tickers += extra

    docs, report = collect(tickers, names)
    for item in report:
        log(json.dumps(item))
    ok = len(docs)
    log(f"{ok} of {len(tickers)} funds confirmed")
    if args.dry_run:
        log("dry run: nothing written")
        return 0 if ok else 1
    if docs:
        store.set_many(docs)
        now_iso = datetime.now(timezone.utc).isoformat()
        store.set(META_PATH, build_meta(previous, docs, held=held, now_iso=now_iso))
        log(f"wrote {ok} fund documents and {META_PATH}")

    if docs and not args.no_history:
        confirmed = [doc["ticker"] for _, doc in docs]
        stored = store.get_many([f"{prices.COLLECTION}/{prices.doc_id(t)}" for t in confirmed])
        missing = [t for t in confirmed if f"{prices.COLLECTION}/{prices.doc_id(t)}" not in stored]
        if missing:
            log(f"daily price history for {len(missing)} funds without one: {', '.join(missing)}")
            prices.load_many(missing, store=store, log=False)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
