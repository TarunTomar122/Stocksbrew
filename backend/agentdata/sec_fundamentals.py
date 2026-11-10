"""Point-in-time fundamentals and earnings dates from SEC EDGAR.

Every XBRL fact in EDGAR's ``companyfacts`` API carries the date it was filed,
so a value can be used exactly from the day the market could have read it. That
is what makes the call engine's fundamental factors backtestable.

Per ticker this job keeps a compact document:

    {symbol, cik, sic, sic_description,
     facts: {concept: [[start|None, end, value, filed], ...]},   # first filing of each period only
     earnings_dates: ["YYYY-MM-DD", ...],                         # 8-K item 2.02 filing dates
     fetched_at}

``facts`` rows keep the FIRST value filed for a period, so later restatements
never leak into an earlier date. Flows (revenue, income, cash flow) have a
start date; balance-sheet items have ``None``.

Storage: ``tm_fundamentals_pit/{SYMBOL}`` (new, additive) when run with
``--write``; always a JSON file per ticker in the cache directory.

SEC fair access: a declared User-Agent, well under 10 requests per second,
and a disk cache so reruns do not refetch within the TTL.

Run: ``python3 -m backend.agentdata.sec_fundamentals [--symbols AAPL,MSFT] [--write]``
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

COLLECTION = "tm_fundamentals_pit"
_CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "sec_fundamentals"
_CACHE_TTL_SECONDS = 20 * 3600
# SEC asks automated clients to identify themselves. Set SEC_USER_AGENT in the
# job environment to the operator's real contact before running this on a timer.
_DEFAULT_USER_AGENT = "stocksbrew.online research (tomartarun2001@gmail.com)"
_MIN_INTERVAL = 0.15  # seconds between requests: under 7 per second

# concept -> (taxonomy, [tags in priority order], unit)
CONCEPTS: dict[str, tuple[str, list[str], str]] = {
    "revenue": (
        "us-gaap",
        [
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenues",
            "SalesRevenueNet",
            "RevenueFromContractWithCustomerIncludingAssessedTax",
            "SalesRevenueGoodsNet",
        ],
        "USD",
    ),
    "cost_of_revenue": ("us-gaap", ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"], "USD"),
    "gross_profit": ("us-gaap", ["GrossProfit"], "USD"),
    "operating_income": ("us-gaap", ["OperatingIncomeLoss"], "USD"),
    "net_income": ("us-gaap", ["NetIncomeLoss", "ProfitLoss"], "USD"),
    "assets": ("us-gaap", ["Assets"], "USD"),
    "equity": (
        "us-gaap",
        ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
        "USD",
    ),
    "operating_cash_flow": (
        "us-gaap",
        ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
        "USD",
    ),
    "capex": ("us-gaap", ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], "USD"),
    "shares_cover": ("dei", ["EntityCommonStockSharesOutstanding"], "shares"),
    "shares_diluted": ("us-gaap", ["WeightedAverageNumberOfDilutedSharesOutstanding"], "shares"),
}

# Companies that moved their listing to a new registrant (a holding-company
# reorganisation keeps the ticker but starts a fresh CIK with no history).
# The predecessor's facts are merged in, first filing still winning, so the
# trailing-year figures and year-ago balances exist from the first day.
#   XOM: Exxon Mobil Corp (CIK 34088) -> ExxonMobil Holdings Corp in 2026.
PREDECESSOR_CIKS: dict[str, tuple[int, ...]] = {"XOM": (34088,)}

_last_request = 0.0


def _user_agent() -> str:
    return os.getenv("SEC_USER_AGENT", "").strip() or _DEFAULT_USER_AGENT


def _get_json(url: str) -> Any | None:
    """GET with the declared User-Agent, a polite gap, and retry on 429/5xx."""
    global _last_request
    for attempt in range(4):
        wait = _MIN_INTERVAL - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()
        request = urllib.request.Request(url, headers={"User-Agent": _user_agent(), "Accept-Encoding": "gzip", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return json.loads(body.decode("utf-8"))
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code in (403, 429, 500, 502, 503):
                time.sleep(3.0 * (attempt + 1))
                continue
            return None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            time.sleep(2.0 * (attempt + 1))
    return None


def ticker_cik_map(cache_dir: Path = _CACHE_DIR) -> dict[str, int]:
    """Upper-cased ticker -> CIK from the SEC's own list."""
    path = cache_dir / "_company_tickers.json"
    if not (path.exists() and time.time() - path.stat().st_mtime < 7 * 86400):
        payload = _get_json("https://www.sec.gov/files/company_tickers.json")
        if payload:
            cache_dir.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload))
    if not path.exists():
        return {}
    out: dict[str, int] = {}
    for row in json.loads(path.read_text()).values():
        ticker = str(row.get("ticker") or "").upper()
        if ticker and ticker not in out:
            out[ticker] = int(row["cik_str"])
    return out


def sec_ticker(symbol: str) -> str:
    """BRK.B is BRK-B in the SEC list."""
    return symbol.strip().upper().replace(".", "-").replace("/", "-")


def extract_facts(companyfacts: dict[str, Any]) -> dict[str, list[list[Any]]]:
    """Compact, first-filed rows per concept: [start|None, end, value, filed].

    For each period (start, end) only the earliest filing is kept. When several
    tags map to one concept, a period is taken from the highest-priority tag
    that reported it, which is how a company's switch from ``Revenues`` to the
    ASC 606 tag stays one continuous series.
    """
    taxonomies = companyfacts.get("facts") or {}
    out: dict[str, list[list[Any]]] = {}
    for concept, (taxonomy, tags, unit) in CONCEPTS.items():
        chosen: dict[tuple[str | None, str], tuple[int, str, float]] = {}
        for priority, tag in enumerate(tags):
            rows = (((taxonomies.get(taxonomy) or {}).get(tag) or {}).get("units") or {}).get(unit) or []
            for row in rows:
                end, filed, value = row.get("end"), row.get("filed"), row.get("val")
                if not end or not filed or not isinstance(value, (int, float)):
                    continue
                key = (row.get("start"), end)
                current = chosen.get(key)
                # earliest filing wins; on the same filing date the higher-priority tag wins
                if current is None or (filed, priority) < (current[1], current[0]):
                    chosen[key] = (priority, filed, float(value))
        if chosen:
            out[concept] = sorted(([start, end, value, filed] for (start, end), (_, filed, value) in chosen.items()), key=lambda r: (r[3], r[1]))
    return out


def merge_facts(*fact_sets: dict[str, list[list[Any]]]) -> dict[str, list[list[Any]]]:
    """Combine compact fact sets (successor first, then predecessors).

    For each concept and period the earliest filing wins, exactly as inside
    one company, so a successor's re-filed comparatives never replace what the
    market could read at the time. On the same filing date the earlier set wins.
    """
    out: dict[str, list[list[Any]]] = {}
    for concept in {name for facts in fact_sets for name in facts}:
        chosen: dict[tuple[Any, Any], tuple[str, int, list[Any]]] = {}
        for order, facts in enumerate(fact_sets):
            for row in facts.get(concept) or []:
                key = (row[0], row[1])
                current = chosen.get(key)
                if current is None or (row[3], order) < (current[0], current[1]):
                    chosen[key] = (row[3], order, list(row))
        out[concept] = sorted((row for _, _, row in chosen.values()), key=lambda r: (r[3], r[1]))
    return out


def earnings_dates_from_submissions(submissions: dict[str, Any], older: list[dict[str, Any]] | None = None) -> list[str]:
    """Filing dates of 8-Ks carrying item 2.02 (results of operations)."""
    dates: set[str] = set()
    blocks = [((submissions.get("filings") or {}).get("recent") or {})] + list(older or [])
    for block in blocks:
        forms = block.get("form") or []
        items = block.get("items") or []
        filed = block.get("filingDate") or []
        for form, item, day in zip(forms, items, filed):
            if str(form).startswith("8-K") and "2.02" in str(item or "") and day:
                dates.add(str(day)[:10])
    return sorted(dates)


def fetch_symbol(symbol: str, cik: int, *, min_year: int = 2013) -> dict[str, Any] | None:
    """Download and compact one company. Three or more requests."""
    padded = f"{cik:010d}"
    facts_raw = _get_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded}.json")
    if not facts_raw:
        return None
    submissions = _get_json(f"https://data.sec.gov/submissions/CIK{padded}.json") or {}
    older: list[dict[str, Any]] = []
    for extra in (submissions.get("filings") or {}).get("files") or []:
        if str(extra.get("filingTo") or "9999") < f"{min_year}-01-01":
            continue
        block = _get_json(f"https://data.sec.gov/submissions/{extra.get('name')}")
        if isinstance(block, dict):
            older.append(block)
    facts = extract_facts(facts_raw)
    earnings_dates = earnings_dates_from_submissions(submissions, older)
    merged_from: list[int] = []
    for predecessor in PREDECESSOR_CIKS.get(symbol.upper(), ()):
        before = fetch_symbol(f"{symbol}#predecessor", predecessor, min_year=min_year)
        if before:
            facts = merge_facts(facts, before["facts"])
            earnings_dates = sorted(set(earnings_dates) | set(before["earnings_dates"]))
            merged_from.append(predecessor)
    doc: dict[str, Any] = {
        "symbol": symbol.upper(),
        "cik": cik,
        "sic": str(submissions.get("sic") or ""),
        "sic_description": str(submissions.get("sicDescription") or ""),
        "facts": facts,
        "earnings_dates": earnings_dates,
        "source": "SEC EDGAR companyfacts and submissions",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    if merged_from:
        doc["predecessor_ciks"] = merged_from
    return doc


def cache_path(symbol: str, cache_dir: Path = _CACHE_DIR) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in symbol.upper())
    return cache_dir / f"{safe}.json"


def load_cached(symbol: str, cache_dir: Path = _CACHE_DIR) -> dict[str, Any] | None:
    path = cache_path(symbol, cache_dir)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def refresh(symbols: list[str], *, cache_dir: Path = _CACHE_DIR, ttl: int = _CACHE_TTL_SECONDS, log: Any = print) -> dict[str, int]:
    """Fetch every symbol whose cache file is older than ``ttl``."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    ciks = ticker_cik_map(cache_dir)
    stats = {"fetched": 0, "cached": 0, "no_cik": 0, "failed": 0}
    for index, symbol in enumerate(symbols):
        path = cache_path(symbol, cache_dir)
        if path.exists() and time.time() - path.stat().st_mtime < ttl:
            stats["cached"] += 1
            continue
        cik = ciks.get(sec_ticker(symbol))
        if not cik:
            stats["no_cik"] += 1
            continue
        doc = fetch_symbol(symbol, cik)
        if not doc:
            stats["failed"] += 1
            continue
        path.write_text(json.dumps(doc, separators=(",", ":")))
        stats["fetched"] += 1
        if log and (index + 1) % 25 == 0:
            log(f"{index + 1}/{len(symbols)} {stats}")
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--symbols", help="comma-separated tickers (default: every symbol in tm_price_history_daily)")
    parser.add_argument("--symbols-file", help="JSON list of tickers, or a JSON object keyed by ticker")
    parser.add_argument("--cache-dir", default=str(_CACHE_DIR))
    parser.add_argument("--ttl-hours", type=float, default=_CACHE_TTL_SECONDS / 3600)
    parser.add_argument("--write", action="store_true", help=f"also write each document to {COLLECTION}")
    args = parser.parse_args()

    store = None
    if args.symbols:
        symbols = [item.strip().upper() for item in args.symbols.split(",") if item.strip()]
    elif args.symbols_file:
        loaded = json.loads(Path(args.symbols_file).read_text())
        symbols = sorted(str(item).upper() for item in loaded)
    else:
        from .store import DocStore

        store = DocStore.from_env()
        symbols = sorted(path.split("/", 1)[1] for path, _ in store.list("tm_price_history_daily", limit=5000))
    cache_dir = Path(args.cache_dir)
    stats = refresh(symbols, cache_dir=cache_dir, ttl=int(args.ttl_hours * 3600))
    print(f"done: {stats}")
    if args.write:
        from .store import DocStore

        store = store or DocStore.from_env()
        docs = []
        for symbol in symbols:
            doc = load_cached(symbol, cache_dir)
            if doc:
                docs.append((f"{COLLECTION}/{symbol.upper().replace('/', '-')}", doc))
        print(f"wrote {store.set_many(docs)} documents to {COLLECTION}")


if __name__ == "__main__":
    main()
