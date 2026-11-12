"""Write backend/config/us_fund_tickers.json: every US-listed ETF and every US mutual fund ticker.

Run it (anywhere with internet; it reads two public files and writes one checked-in file)::

    python3 -m backend.scripts.build_us_fund_tickers            # rewrite the file
    python3 -m backend.scripts.build_us_fund_tickers --dry-run  # print the counts only

Sources:

* ETFs: Nasdaq Trader's symbol directory (``nasdaqtraded.txt``), every listed
  security with the ETF flag, on any US exchange, test issues left out.
* Mutual funds: the SEC's fund ticker file (``company_tickers_mf.json``), the
  tickers shaped like a mutual fund share class (four letters and an X, VTSAX).
  Money market funds (three letters and XX, SPAXX) are left out: the import
  treats them as cash.

The app (lib/funds/tickers.ts) and the fund request worker
(backend/agentdata/fund_on_demand.py) read the file to know a ticker is a fund
before anyone has asked Yahoo. Yahoo still has the last word: the worker
confirms every fund before it registers one. A fund launched after the file was
written still gets covered through the plain stock request path.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OUT_PATH = Path(__file__).resolve().parents[1] / "config" / "us_fund_tickers.json"
NASDAQ_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt"
SEC_MF_URL = "https://www.sec.gov/files/company_tickers_mf.json"

ETF_TICKER = re.compile(r"^[A-Z]{1,5}$")
MUTUAL_FUND_TICKER = re.compile(r"^[A-Z]{4}X$")
MONEY_MARKET_TICKER = re.compile(r"^[A-Z]{3}XX$")


def etf_tickers(text: str) -> list[str]:
    """ETF tickers from the Nasdaq Trader directory (pipe-separated, with a header and a footer line)."""
    lines = text.splitlines()
    if not lines:
        return []
    header = lines[0].split("|")
    try:
        symbol_at, etf_at, test_at = header.index("Symbol"), header.index("ETF"), header.index("Test Issue")
    except ValueError:
        raise ValueError("unexpected nasdaqtraded.txt header") from None
    out: set[str] = set()
    for line in lines[1:]:
        cells = line.split("|")
        if len(cells) <= max(symbol_at, etf_at, test_at):
            continue
        symbol = cells[symbol_at].strip().upper()
        if cells[etf_at].strip() == "Y" and cells[test_at].strip() != "Y" and ETF_TICKER.match(symbol):
            out.add(symbol)
    return sorted(out)


def mutual_fund_tickers(payload: dict) -> list[str]:
    """Mutual fund share-class tickers from the SEC file, money market funds left out."""
    fields = payload.get("fields") or []
    try:
        symbol_at = fields.index("symbol")
    except ValueError:
        raise ValueError("unexpected company_tickers_mf.json fields") from None
    out: set[str] = set()
    for row in payload.get("data") or []:
        symbol = str(row[symbol_at] if len(row) > symbol_at else "").strip().upper()
        if MUTUAL_FUND_TICKER.match(symbol) and not MONEY_MARKET_TICKER.match(symbol):
            out.add(symbol)
    return sorted(out)


def build(etfs: list[str], mutual_funds: list[str], now_iso: str) -> dict:
    # An ETF ticker never has the mutual fund shape, but if a source ever disagrees the ETF wins.
    etf_set = set(etfs)
    funds = [ticker for ticker in mutual_funds if ticker not in etf_set]
    return {
        "generated_at": now_iso,
        "sources": {"etfs": NASDAQ_URL, "mutual_funds": SEC_MF_URL},
        "counts": {"etfs": len(etfs), "mutual_funds": len(funds)},
        # Space-separated, so 28,000 tickers stay a small file.
        "etfs": " ".join(etfs),
        "mutual_funds": " ".join(funds),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="print the counts, write nothing")
    args = parser.parse_args(argv)

    from backend.agentdata.funds_13f import sec_get

    request = urllib.request.Request(NASDAQ_URL, headers={"User-Agent": "stocksbrew-fund-list/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        etfs = etf_tickers(response.read().decode("utf-8", "replace"))
    body = sec_get(SEC_MF_URL)
    if body is None:
        print("[fund tickers] the SEC fund file is missing; nothing written", flush=True)
        return 1
    mutual_funds = mutual_fund_tickers(json.loads(body))
    if len(etfs) < 2000 or len(mutual_funds) < 10000:
        print(f"[fund tickers] too few rows ({len(etfs)} ETFs, {len(mutual_funds)} mutual funds); nothing written", flush=True)
        return 1
    payload = build(etfs, mutual_funds, datetime.now(timezone.utc).isoformat(timespec="seconds"))
    print(f"[fund tickers] {payload['counts']['etfs']} ETFs, {payload['counts']['mutual_funds']} mutual funds", flush=True)
    if args.dry_run:
        return 0
    OUT_PATH.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"[fund tickers] wrote {OUT_PATH}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
