"""Multi-year history of insider open-market purchases, from the SEC's own
quarterly "Insider Transactions Data Sets" (Forms 3, 4 and 5 flattened to TSV).

``insiders_form4.py`` follows new filings day to day. This job is the history
behind it, so "three insiders bought within 90 days" can be measured over years
with each purchase dated by when it was FILED (when the market could know).

Kept: non-derivative transactions with code ``P`` (open-market or private
purchase), acquired, not under a 10b5-1 plan. Sales are ignored: most are
compensation and tax selling.

Output per ticker, sorted by filing date:

    [[filing_date, transaction_date, owner_cik, shares, price, relationship], ...]

Local file ``insider_buys.json`` in the cache directory, and with ``--write``
one document per ticker in ``tm_insider_buy_history/{SYMBOL}`` (new, additive).

Run: ``python3 -m backend.agentdata.insider_history [--from-year 2015] [--write]``
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .sec_fundamentals import sec_ticker, ticker_cik_map

COLLECTION = "tm_insider_buy_history"
_CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "insider_history"
_BASE = "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets"
_DEFAULT_USER_AGENT = "stocksbrew.online research (tomartarun2001@gmail.com)"
_MONTHS = {m: i for i, m in enumerate(("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"), start=1)}


def iso_day(value: str) -> str:
    """'31-JAN-2024' -> '2024-01-31'. Empty string when it does not parse."""
    parts = str(value or "").strip().split("-")
    if len(parts) != 3 or parts[1].upper() not in _MONTHS:
        return ""
    try:
        return f"{int(parts[2]):04d}-{_MONTHS[parts[1].upper()]:02d}-{int(parts[0]):02d}"
    except ValueError:
        return ""


def quarters(from_year: int, today: datetime | None = None) -> list[str]:
    now = today or datetime.now(timezone.utc)
    out = []
    for year in range(from_year, now.year + 1):
        for quarter in range(1, 5):
            if (year, quarter) <= (now.year, (now.month - 1) // 3 + 1):
                out.append(f"{year}q{quarter}")
    return out


def download_quarter(quarter: str, cache_dir: Path) -> Path | None:
    """The quarter's zip, from disk when present. None when the SEC has not published it."""
    path = cache_dir / f"{quarter}_form345.zip"
    if path.exists() and path.stat().st_size > 1000:
        return path
    request = urllib.request.Request(
        f"{_BASE}/{quarter}_form345.zip",
        headers={"User-Agent": os.getenv("SEC_USER_AGENT", "").strip() or _DEFAULT_USER_AGENT},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                data = response.read()
            cache_dir.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            time.sleep(0.5)
            return path
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            time.sleep(3.0 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(3.0 * (attempt + 1))
    return None


def _rows(archive: zipfile.ZipFile, name: str) -> Iterator[dict[str, str]]:
    with archive.open(name) as handle:
        reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8", errors="replace"), delimiter="\t", quoting=csv.QUOTE_NONE)
        yield from reader


def purchases_in_archive(archive: zipfile.ZipFile, symbol_by_cik: dict[int, str]) -> dict[str, list[list[Any]]]:
    """Qualifying purchases in one quarterly archive, keyed by ticker."""
    submissions: dict[str, tuple[str, str]] = {}
    for row in _rows(archive, "SUBMISSION.tsv"):
        try:
            cik = int(row.get("ISSUERCIK") or 0)
        except ValueError:
            continue
        symbol = symbol_by_cik.get(cik)
        if not symbol or str(row.get("AFF10B5ONE") or "").strip() in ("1", "true", "TRUE"):
            continue
        filed = iso_day(row.get("FILING_DATE", ""))
        if filed:
            submissions[row["ACCESSION_NUMBER"]] = (symbol, filed)
    owners: dict[str, tuple[str, str]] = {}
    for row in _rows(archive, "REPORTINGOWNER.tsv"):
        accession = row.get("ACCESSION_NUMBER", "")
        if accession in submissions and accession not in owners:
            owners[accession] = (str(row.get("RPTOWNERCIK") or "").lstrip("0"), str(row.get("RPTOWNER_RELATIONSHIP") or ""))
    out: dict[str, list[list[Any]]] = {}
    for row in _rows(archive, "NONDERIV_TRANS.tsv"):
        accession = row.get("ACCESSION_NUMBER", "")
        if accession not in submissions:
            continue
        if str(row.get("TRANS_CODE") or "").strip().upper() != "P" or str(row.get("TRANS_ACQUIRED_DISP_CD") or "").strip().upper() != "A":
            continue
        try:
            shares = float(row.get("TRANS_SHARES") or 0)
            price = float(row.get("TRANS_PRICEPERSHARE") or 0)
        except ValueError:
            continue
        if shares <= 0 or price <= 0:
            continue
        symbol, filed = submissions[accession]
        owner, relationship = owners.get(accession, ("", ""))
        out.setdefault(symbol, []).append([filed, iso_day(row.get("TRANS_DATE", "")), owner, shares, price, relationship])
    return out


def build(symbols: list[str], *, from_year: int = 2015, cache_dir: Path = _CACHE_DIR, log: Any = print) -> dict[str, list[list[Any]]]:
    ciks = ticker_cik_map(cache_dir)
    symbol_by_cik = {ciks[sec_ticker(symbol)]: symbol.upper() for symbol in symbols if sec_ticker(symbol) in ciks}
    merged: dict[str, list[list[Any]]] = {}
    for quarter in quarters(from_year):
        path = download_quarter(quarter, cache_dir)
        if not path:
            if log:
                log(f"{quarter}: not published")
            continue
        try:
            with zipfile.ZipFile(path) as archive:
                found = purchases_in_archive(archive, symbol_by_cik)
        except (zipfile.BadZipFile, KeyError) as error:
            if log:
                log(f"{quarter}: unreadable ({error})")
            continue
        for symbol, rows in found.items():
            merged.setdefault(symbol, []).extend(rows)
        if log:
            log(f"{quarter}: {sum(len(rows) for rows in found.values())} purchases in {len(found)} tickers")
    for rows in merged.values():
        rows.sort()
    return merged


def cluster_buyers(rows: list[list[Any]], as_of: str, window_days: int = 90) -> int:
    """Distinct insiders whose purchase was FILED in the window ending ``as_of``."""
    from datetime import date, timedelta

    start = (date.fromisoformat(as_of[:10]) - timedelta(days=window_days)).isoformat()
    return len({row[2] for row in rows if start <= row[0] <= as_of[:10] and row[2]})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--symbols-file", help="JSON list of tickers (default: every symbol in tm_price_history_daily)")
    parser.add_argument("--from-year", type=int, default=2015)
    parser.add_argument("--cache-dir", default=str(_CACHE_DIR))
    parser.add_argument("--write", action="store_true", help=f"also write one document per ticker to {COLLECTION}")
    args = parser.parse_args()

    store = None
    if args.symbols_file:
        symbols = sorted(str(item).upper() for item in json.loads(Path(args.symbols_file).read_text()))
    else:
        from .store import DocStore

        store = DocStore.from_env()
        symbols = sorted(path.split("/", 1)[1] for path, _ in store.list("tm_price_history_daily", limit=5000))
    cache_dir = Path(args.cache_dir)
    merged = build(symbols, from_year=args.from_year, cache_dir=cache_dir)
    (cache_dir / "insider_buys.json").write_text(json.dumps(merged, separators=(",", ":")))
    print(f"{sum(len(rows) for rows in merged.values())} purchases across {len(merged)} tickers")
    if args.write:
        from .store import DocStore

        store = store or DocStore.from_env()
        now = datetime.now(timezone.utc).isoformat()
        docs = [
            (f"{COLLECTION}/{symbol.replace('/', '-')}", {"symbol": symbol, "rows": rows, "count": len(rows), "source": "SEC insider transactions data sets", "updated_at": now})
            for symbol, rows in merged.items()
        ]
        print(f"wrote {store.set_many(docs)} documents to {COLLECTION}")


if __name__ == "__main__":
    main()
