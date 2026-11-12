"""What is inside the funds people hold: ETF holdings from SEC Form N-PORT.

Run it::

    python3 -m backend.agentdata.etf_holdings                     # the default list plus funds users track
    python3 -m backend.agentdata.etf_holdings --etfs QQQ,VOO --dry-run
    python3 -m backend.agentdata.etf_holdings --no-figi           # skip OpenFIGI, map from caches and names only
    python3 -m backend.agentdata.etf_holdings --force             # re-read filings already stored

What N-PORT is: every registered fund, ETFs organised as unit investment
trusts included (SPY, DIA), reports its full portfolio to the SEC each month.
The last month of each fiscal quarter becomes public about 60 days later as an
NPORT-P filing. So a stored portfolio is a quarter-end snapshot, one to five
months old, and the as-of date travels with it everywhere.

Collections (all additive, nothing else is touched):

* ``tm_etf_holdings/{TICKER}``   one fund: its equity holdings with weights, the
                                 filing's as-of date, accession and source URL
* ``tm_etf_cusip_map/{CUSIP}``   CUSIP to ticker lookups made by this job (seeded
                                 read-only from the 13F job's ``tm_fund_cusip_map``)
* ``tm_etf_meta/latest``         which funds were read, as of when, and the run time

Leveraged and inverse funds (SOXL, TQQQ) hold swaps rather than the stocks, so
they are stored with ``status: "derivatives"`` and no holdings: splitting them
into companies would be wrong.

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from . import funds_13f
from .funds_13f import clean_ticker, normalize_cusip, sec_get
from .store import DocStore

# SEC fair access: funds_13f.sec_get sends the house User-Agent and spaces
# requests at funds_13f.SEC_MIN_INTERVAL (4 a second), well under 10.

COLLECTION = "tm_etf_holdings"
CUSIP_COLLECTION = "tm_etf_cusip_map"
META_PATH = "tm_etf_meta/latest"
SCHEMA_VERSION = 1

# The biggest US equity ETFs by assets plus the sector funds people ask about, then
# every fund in backend/config/popular_funds.json (the list the fund pages cover).
_POPULAR_FUNDS_PATH = Path(__file__).resolve().parents[1] / "config" / "popular_funds.json"


def _popular_fund_tickers() -> list[str]:
    try:
        payload = json.loads(_POPULAR_FUNDS_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return []
    return [str(row.get("ticker") or "").strip().upper() for row in payload.get("funds") or [] if str(row.get("ticker") or "").strip()]


DEFAULT_ETFS = list(
    dict.fromkeys(
        [
            "SPY", "VOO", "IVV", "VTI", "QQQ", "DIA", "IWM", "XLK",
            "SMH", "SOXX", "VUG", "VGT", "SCHD", "VYM", "ARKK",
            *_popular_fund_tickers(),
        ]
    )
)
# Funds the fund facts job confirmed (backend/agentdata/fund_facts.py), held ones included.
FUND_META_PATH = "tm_fund_meta/latest"

# ETFs organised as unit investment trusts have no series id in the SEC's fund
# ticker file; their N-PORT filings sit under the trust's own CIK.
UIT_CIKS = {"SPY": 884394, "DIA": 1041130}

# Below this share of net assets in long stock positions a fund is mostly
# derivatives, cash or bonds and is not broken down into companies.
MIN_EQUITY_WEIGHT = 0.6
# Derivative notional above this share of net assets means leverage or a hedge
# book (index futures for cash equitisation sit well under it).
MAX_NOTIONAL_SHARE = 0.25
# N-PORT asset categories for derivatives: commodity, credit, equity, FX, rates, other.
DERIVATIVE_CATEGORIES = {"DCO", "DCR", "DE", "DFE", "DIR", "DO"}

_CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "etf"
_CUSIP_CACHE = _CACHE_DIR / "cusip_map.json"
_MF_TICKERS_URL = "https://www.sec.gov/files/company_tickers_mf.json"
_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
_DAY = 86400


def log(message: str) -> None:
    print(f"[etf] {message}", flush=True)


# ---------------------------------------------------------------------------
# Pure helpers (covered by backend/tests/test_agentdata_etf_holdings.py)
# ---------------------------------------------------------------------------


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _num(text: str | None) -> float | None:
    if text is None:
        return None
    try:
        value = float(text.strip())
    except ValueError:
        return None
    return value if value == value and abs(value) != float("inf") else None


def cusip_from_isin(isin: str | None) -> str:
    """A US or Canadian ISIN wraps the CUSIP: US0378331005 holds 037833100."""
    text = str(isin or "").strip().upper()
    if len(text) == 12 and text[:2] in ("US", "CA"):
        return text[2:11]
    return ""


def usable_cusip(raw: str | None, isin: str | None) -> str:
    """The holding's CUSIP, or the one inside its ISIN when the filer wrote N/A or zeros."""
    text = re.sub(r"[^0-9A-Za-z]", "", str(raw or "")).upper()
    # "N/A" would pad out to 0000000NA, so only a real-looking value is padded.
    if len(text) >= 8 and re.search(r"[1-9]", text):
        return normalize_cusip(text)
    return cusip_from_isin(isin)


def parse_nport(xml_bytes: bytes) -> dict[str, Any]:
    """The fund header and every position of one NPORT-P primary document."""
    root = ET.fromstring(xml_bytes)
    info: dict[str, Any] = {"positions": []}
    for element in root.iter():
        name = _local(element.tag)
        if name == "seriesName" and "series_name" not in info:
            info["series_name"] = (element.text or "").strip()
        elif name == "seriesId" and "series_id" not in info:
            info["series_id"] = (element.text or "").strip()
        elif name == "regName":
            info["registrant"] = (element.text or "").strip()
        elif name == "repPdDate":
            info["as_of"] = (element.text or "").strip()
        elif name == "netAssets":
            info["net_assets_usd"] = _num(element.text)
        elif name == "invstOrSec":
            row: dict[str, Any] = {}
            for child in element:
                key = _local(child.tag)
                if key == "identifiers":
                    for ident in child:
                        if _local(ident.tag) == "isin":
                            row["isin"] = ident.get("value") or ""
                        elif _local(ident.tag) == "ticker":
                            row["ticker"] = ident.get("value") or ""
                elif key == "assetConditional":
                    row["assetCat"] = child.get("assetCat") or ""
                elif key == "issuerConditional":
                    row["issuerCat"] = child.get("issuerCat") or ""
                elif key == "derivativeInfo":
                    row["notional_usd"] = sum(
                        abs(_num(node.text) or 0.0) for node in child.iter() if _local(node.tag) == "notionalAmt"
                    )
                    row["written_option"] = any(
                        _local(node.tag) == "writtenOrPur" and (node.text or "").strip().lower() == "written" for node in child.iter()
                    )
                elif len(child) == 0:
                    row[key] = (child.text or "").strip()
            info["positions"].append(row)
    return info


def summarise_positions(positions: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Long stock positions folded by CUSIP, plus what the rest of the fund is.

    Weights are fractions of net assets, straight from the filing's pctVal.
    """
    stocks: dict[str, dict[str, Any]] = {}
    equity_long = 0.0
    derivatives_gross = 0.0
    notional_usd = 0.0
    funds_weight = 0.0
    short_equity = 0.0
    other_weight = 0.0
    for row in positions:
        pct = _num(row.get("pctVal"))
        if pct is None:
            continue
        weight = pct / 100.0
        category = (row.get("assetCat") or "").upper()
        long = (row.get("payoffProfile") or "Long").lower() != "short"
        if category in DERIVATIVE_CATEGORIES or row.get("notional_usd"):
            derivatives_gross += abs(weight)
            # Calls written against shares the fund owns (covered-call funds) cap the upside
            # but do not add exposure, so they do not make a fund "mostly derivatives".
            if not row.get("written_option"):
                notional_usd += row.get("notional_usd") or 0.0
            continue
        if (row.get("issuerCat") or "").upper() == "RF":
            funds_weight += weight  # another fund inside this one (N-PORT marks it in issuerCat); not looked through
            continue
        if category == "EC" and long and weight > 0:
            cusip = usable_cusip(row.get("cusip"), row.get("isin"))
            key = cusip or f"name:{(row.get('name') or '').strip().upper()}"
            item = stocks.setdefault(
                key,
                {
                    "cusip": cusip or None,
                    "name": (row.get("name") or row.get("title") or "").strip(),
                    "title": (row.get("title") or "").strip(),
                    "filed_ticker": clean_ticker(row.get("ticker")) or None,
                    "country": (row.get("invCountry") or "").strip() or None,
                    "weight": 0.0,
                    "value_usd": 0.0,
                    "shares": 0.0,
                },
            )
            item["weight"] += weight
            item["value_usd"] += _num(row.get("valUSD")) or 0.0
            if (row.get("units") or "NS").upper() == "NS":
                item["shares"] += _num(row.get("balance")) or 0.0
            equity_long += weight
        elif category == "EC":
            short_equity += abs(weight)
        else:
            other_weight += weight
    ordered = sorted(stocks.values(), key=lambda item: -item["weight"])
    return {
        "stocks": ordered,
        "equity_weight": equity_long,
        "derivatives_gross_weight": derivatives_gross,
        "derivatives_notional_usd": notional_usd,
        "fund_weight": funds_weight,
        "short_equity_weight": short_equity,
        "other_weight": other_weight,
    }


def fund_status(summary: dict[str, Any], net_assets_usd: float | None = None) -> tuple[str, str | None]:
    """Whether the fund can be read as a list of companies, and why not when it cannot.

    A leveraged fund can hold most of its money in the stocks and still get a
    second and third helping through swaps, so derivative notional counts too.
    """
    notional_share = (summary.get("derivatives_notional_usd") or 0.0) / net_assets_usd if net_assets_usd else 0.0
    if notional_share > MAX_NOTIONAL_SHARE or summary["short_equity_weight"] > 0.05:
        return "derivatives", "This fund gets much of its exposure through swaps and other derivatives, so its filing does not say which companies it really holds."
    if summary["equity_weight"] >= MIN_EQUITY_WEIGHT:
        return "ok", None
    if summary["derivatives_gross_weight"] > 0.25:
        return "derivatives", "This fund gets much of its exposure through swaps and other derivatives, so its filing does not say which companies it really holds."
    return "not_stocks", "Most of this fund is not shares of companies."


_SUFFIXES = re.compile(
    r"\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|LLC|LP|NV|SA|AG|SE|HOLDINGS?|GROUP|THE|CLASS [A-Z]|CL [A-Z]|COM|NEW|DEL)\b"
)


def name_key(name: str | None) -> str:
    """A loose company-name key: 'Exxon Mobil Corp' and 'EXXONMOBIL HOLDINGS CORP' meet at 'EXXONMOBIL'."""
    text = str(name or "").upper().replace("&", " AND ")
    text = re.sub(r"/[A-Z ]*/?", " ", text)  # EDGAR's state tags: ONEOK INC /NEW/, COCA COLA CO/THE
    text = re.sub(r"[^A-Z0-9 ]", " ", text)
    text = _SUFFIXES.sub(" ", text)
    return re.sub(r"\s+", "", text)


def build_name_index(company_tickers: dict[str, Any]) -> dict[str, str]:
    """SEC's company_tickers.json as name key -> ticker. The file lists a company's main class first.

    A key two different companies share (First Bancorp is three banks) is
    dropped: a wrong match is worse than none.
    """
    index: dict[str, str] = {}
    cik_of: dict[str, Any] = {}
    ambiguous: set[str] = set()
    for entry in company_tickers.values() if isinstance(company_tickers, dict) else []:
        key = name_key(entry.get("title"))
        ticker = clean_ticker(str(entry.get("ticker") or "").replace("-", "."))
        if not key or not ticker:
            continue
        if key not in index:
            index[key] = ticker
            cik_of[key] = entry.get("cik_str")
        elif cik_of[key] != entry.get("cik_str"):
            ambiguous.add(key)
    for key in ambiguous:
        index.pop(key, None)
    return index


def tidy_name(raw: str | None) -> str:
    """Fund and company names as a person writes them: 'VANGUARD 500 INDEX FUND' becomes 'Vanguard 500 Index Fund'."""
    text = re.sub(r"\((R|TM)\)", "", str(raw or ""), flags=re.I)
    text = " ".join(text.split())
    if not text or text.upper() == "N/A":
        return ""
    return funds_13f.display_name(text) if text == text.upper() else text


def holding_rows(stocks: list[dict[str, Any]], ticker_of: Any) -> list[dict[str, Any]]:
    """Stored rows: one per security, heaviest first, with the ticker when we know it."""
    rows: list[dict[str, Any]] = []
    for item in stocks:
        ticker, mapped_by = ticker_of(item)
        rows.append(
            {
                "ticker": ticker,
                "name": tidy_name(item["name"]) or item["name"],
                "cusip": item["cusip"],
                "weight": round(item["weight"], 8),
                "value_usd": round(item["value_usd"], 2),
                "shares": round(item["shares"], 4) if item["shares"] else None,
                "country": item["country"],
                "mapped_by": mapped_by,
            }
        )
    return rows


def build_fund_doc(
    *,
    ticker: str,
    filing: dict[str, Any],
    parsed: dict[str, Any],
    summary: dict[str, Any],
    rows: list[dict[str, Any]],
    fetched_at: str,
) -> dict[str, Any]:
    status, note = fund_status(summary, parsed.get("net_assets_usd"))
    mapped = sum(row["weight"] for row in rows if row["ticker"])
    return {
        "ticker": ticker,
        "fund_name": tidy_name(parsed.get("series_name")) or tidy_name(parsed.get("registrant")) or ticker,
        "registrant": parsed.get("registrant"),
        "series_id": parsed.get("series_id") or filing.get("series_id"),
        "cik": filing["cik"],
        "accession": filing["accession"],
        "form": filing["form"],
        "filed_at": filing["filed_at"],
        "as_of": parsed.get("as_of") or filing.get("period"),
        "source_url": filing["index_url"],
        "xml_url": filing["xml_url"],
        "source": "SEC EDGAR Form N-PORT",
        "net_assets_usd": parsed.get("net_assets_usd"),
        "status": status,
        "note": note,
        "equity_weight": round(summary["equity_weight"], 6),
        "mapped_weight": round(mapped, 6),
        "fund_weight": round(summary["fund_weight"], 6),
        "derivatives_gross_weight": round(summary["derivatives_gross_weight"], 6),
        "holdings_count": len(rows),
        "holdings": rows if status == "ok" else [],
        "fetched_at": fetched_at,
        "schema_version": SCHEMA_VERSION,
    }


def parse_atom_filings(atom: bytes) -> list[dict[str, Any]]:
    """Filings in an EDGAR browse-edgar Atom feed, newest first as EDGAR lists them."""
    root = ET.fromstring(atom)
    out: list[dict[str, Any]] = []
    for entry in root.iter():
        if _local(entry.tag) != "entry":
            continue
        fields: dict[str, str] = {}
        for element in entry.iter():
            fields[_local(element.tag)] = (element.text or "").strip()
        accession = fields.get("accession-number") or ""
        href = fields.get("filing-href") or ""
        match = re.search(r"/edgar/data/(\d+)/", href)
        if not accession or not match:
            continue
        out.append(
            {
                "form": fields.get("filing-type") or "",
                "accession": accession,
                "filed_at": fields.get("filing-date") or "",
                "cik": int(match.group(1)),
            }
        )
    return out


def pick_filing(filings: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The newest public N-PORT; an amendment filed later stands in for it."""
    candidates = [item for item in filings if item.get("form") in ("NPORT-P", "NPORT-P/A")]
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item.get("period") or "", item.get("filed_at") or "", item.get("accession") or ""))


def looks_like_fund_name(name: str | None, ticker: str) -> bool:
    """Our instrument record for a tracked ticker: a fund name, or just the ticker when nothing better was saved."""
    text = str(name or "").strip()
    if not text or text.upper() == ticker.upper():
        return True
    return bool(re.search(r"\b(ETF|FUND|TRUST|SHARES|INDEX|PORTFOLIO|SPDR|ISHARES|PROSHARES|DIREXION)\b", text, re.I))


# ---------------------------------------------------------------------------
# EDGAR
# ---------------------------------------------------------------------------


def _cached_json(url: str, path: Path, max_age: float) -> Any:
    if path.exists() and time.time() - path.stat().st_mtime < max_age:
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            pass
    body = sec_get(url)
    if body is None:
        raise RuntimeError(f"EDGAR returned nothing for {url}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return json.loads(body)


def fund_series_by_ticker() -> dict[str, dict[str, Any]]:
    payload = _cached_json(_MF_TICKERS_URL, _CACHE_DIR / "company_tickers_mf.json", _DAY)
    fields = payload.get("fields") or []
    out: dict[str, dict[str, Any]] = {}
    for row in payload.get("data") or []:
        item = dict(zip(fields, row))
        symbol = str(item.get("symbol") or "").upper()
        if symbol and symbol not in out:
            out[symbol] = {"cik": int(item["cik"]), "series_id": item.get("seriesId")}
    return out


def latest_filing(ticker: str, series: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    """Where the fund's newest NPORT-P lives, with its report period when EDGAR gives it up front."""
    if ticker in UIT_CIKS:
        cik = UIT_CIKS[ticker]
        body = sec_get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
        if body is None:
            return None
        recent = json.loads(body)["filings"]["recent"]
        filings = [
            {"form": form, "accession": accession, "filed_at": filed, "period": period, "cik": cik}
            for form, accession, filed, period in zip(
                recent.get("form") or [], recent.get("accessionNumber") or [], recent.get("filingDate") or [], recent.get("reportDate") or []
            )
        ]
        chosen = pick_filing(filings)
    else:
        info = series.get(ticker)
        if not info or not info.get("series_id"):
            return None
        atom = sec_get(
            "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany"
            f"&CIK={info['series_id']}&type=NPORT-P&dateb=&owner=include&count=10&output=atom"
        )
        if atom is None:
            return None
        filings = parse_atom_filings(atom)
        # The feed has no report period. EDGAR lists newest first, and a fund
        # files its quarters in order, so the newest original filing is the
        # latest quarter; a later amendment replaces it only for that quarter,
        # which the period check after parsing confirms.
        originals = [item for item in filings if item["form"] == "NPORT-P"]
        chosen = originals[0] if originals else (filings[0] if filings else None)
        if chosen:
            chosen = {**chosen, "series_id": info["series_id"], "amendments": [item for item in filings if item["form"] == "NPORT-P/A" and item["filed_at"] > chosen["filed_at"]]}
    return _with_urls(chosen) if chosen else None


def _with_urls(filing: dict[str, Any]) -> dict[str, Any]:
    folder = f"https://www.sec.gov/Archives/edgar/data/{filing['cik']}/{filing['accession'].replace('-', '')}"
    return {**filing, "index_url": f"{folder}/{filing['accession']}-index.htm", "xml_url": f"{folder}/primary_doc.xml"}


def read_filing(filing: dict[str, Any]) -> dict[str, Any] | None:
    """Parse the chosen filing; swap in a later amendment of the same quarter when there is one."""
    body = sec_get(filing["xml_url"])
    if body is None:
        return None
    parsed = parse_nport(body)
    # Oldest first, so the latest amendment of the quarter is the one that stands.
    for amendment in sorted(filing.get("amendments") or [], key=lambda item: (item.get("filed_at") or "", item.get("accession") or "")):
        amended_filing = _with_urls({**amendment, "series_id": filing.get("series_id")})
        amended_body = sec_get(amended_filing["xml_url"])
        if not amended_body:
            continue
        amended = parse_nport(amended_body)
        if amended.get("as_of") == parsed.get("as_of") and amended.get("positions"):
            log(f"  using amendment {amendment['accession']} for {parsed.get('as_of')}")
            filing.update({k: amended_filing[k] for k in ("form", "accession", "filed_at", "index_url", "xml_url")})
            parsed = amended
    return parsed


# ---------------------------------------------------------------------------
# CUSIP to ticker
# ---------------------------------------------------------------------------


class EtfCusipMap(funds_13f.CusipMap):
    """The 13F job's OpenFIGI lookups, read-only, plus this job's own map.

    Seeds from the 13F disk cache and ``tm_fund_cusip_map`` without writing to
    either; new lookups land in ``tm_etf_cusip_map`` and a local cache.
    """

    def __init__(self, store: DocStore | None, cusips: Iterable[str], *, persist: bool = True) -> None:
        # No super().__init__(): it would list the whole 13F map and save into it.
        self.store = store
        self.persist = persist
        self.entries = {}
        self._dirty = set()
        wanted_set = {cusip for cusip in cusips if cusip}
        wanted = sorted(wanted_set)
        for cache in (funds_13f._CUSIP_CACHE, _CUSIP_CACHE):  # ours last, so it wins
            if cache.exists():
                try:
                    data = json.loads(cache.read_text())
                    self.entries.update({key: value for key, value in data.items() if key in wanted_set})
                except json.JSONDecodeError:
                    pass
        missing = [cusip for cusip in wanted if not (self.entries.get(cusip) or {}).get("ticker")]
        if store is not None and missing:
            for collection in ("tm_fund_cusip_map", CUSIP_COLLECTION):
                found = store.get_many([f"{collection}/{cusip}" for cusip in missing])
                for path, data in found.items():
                    cusip = path.split("/", 1)[1]
                    if data.get("ticker") or cusip not in self.entries:
                        self.entries[cusip] = data
        log(f"cusip map: {sum(1 for c in wanted if (self.entries.get(c) or {}).get('ticker'))}/{len(wanted)} known before lookups")

    def save(self) -> None:
        _CUSIP_CACHE.parent.mkdir(parents=True, exist_ok=True)
        existing: dict[str, Any] = {}
        if _CUSIP_CACHE.exists():
            try:
                existing = json.loads(_CUSIP_CACHE.read_text())
            except json.JSONDecodeError:
                existing = {}
        existing.update({cusip: self.entries[cusip] for cusip in self._dirty})
        _CUSIP_CACHE.write_text(json.dumps(existing, separators=(",", ":")))
        if self.store is not None and self.persist and self._dirty:
            self.store.set_many([(f"{CUSIP_COLLECTION}/{cusip}", self.entries[cusip]) for cusip in sorted(self._dirty)])
        self._dirty.clear()


def make_ticker_of(cusips: EtfCusipMap, names: dict[str, str]) -> Any:
    def ticker_of(item: dict[str, Any]) -> tuple[str | None, str | None]:
        cusip = item.get("cusip")
        if cusip:
            ticker = cusips.ticker(cusip)
            if ticker:
                return ticker, "cusip"
        if item.get("filed_ticker"):
            return item["filed_ticker"], "filing"
        ticker = names.get(name_key(item.get("name"))) or names.get(name_key(item.get("title")))
        if ticker:
            return ticker, "name"
        return None, None

    return ticker_of


# ---------------------------------------------------------------------------
# Which funds
# ---------------------------------------------------------------------------


def tracked_fund_tickers(store: DocStore, series: dict[str, dict[str, Any]]) -> list[str]:
    """Funds that users track, found by matching tracked tickers to the SEC fund list.

    Only tickers are read from the user documents; nothing about the users is
    kept or printed. A ticker the SEC lists as a fund but our instrument record
    names as a company (SPCX is SpaceX here) is skipped.
    """
    try:
        users = store.list("users", limit=5000)
    except RuntimeError as error:
        log(f"could not list tracked stocks ({error}); using the default list only")
        return []
    tickers: set[str] = set()
    for _, user in users:
        for raw in user.get("tracked_stocks") or []:
            iid = str(raw or "").strip().upper()
            if iid.startswith("US_"):
                tickers.add(iid[3:].replace("_", "."))
    candidates = sorted(ticker for ticker in tickers if ticker in series or ticker in UIT_CIKS)
    if not candidates:
        return []
    records = store.get_many([f"tm_instruments/US_{ticker.replace('.', '_')}" for ticker in candidates])
    kept = []
    for ticker in candidates:
        record = records.get(f"tm_instruments/US_{ticker.replace('.', '_')}") or {}
        if looks_like_fund_name(record.get("name"), ticker):
            kept.append(ticker)
        else:
            log(f"skipping {ticker}: the SEC lists it as a fund, our record says {record.get('name')!r}")
    return kept


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


def collect(
    tickers: list[str], *, store: DocStore | None, force: bool, use_figi: bool, persist: bool = True
) -> tuple[list[tuple[str, dict[str, Any]]], list[dict[str, Any]]]:
    series = fund_series_by_ticker()
    existing = store.get_many([f"{COLLECTION}/{ticker}" for ticker in tickers]) if store is not None else {}
    names = build_name_index(_cached_json(_COMPANY_TICKERS_URL, _CACHE_DIR / "company_tickers.json", _DAY))
    fetched_at = datetime.now(timezone.utc).isoformat()
    loaded: list[tuple[str, dict[str, Any], dict[str, Any], dict[str, Any]]] = []
    report: list[dict[str, Any]] = []
    for ticker in tickers:
        filing = latest_filing(ticker, series)
        if not filing:
            log(f"{ticker}: no N-PORT filing found")
            report.append({"ticker": ticker, "status": "missing"})
            continue
        stored = existing.get(f"{COLLECTION}/{ticker}")
        if stored and not force and stored.get("accession") == filing["accession"] and not filing.get("amendments"):
            log(f"{ticker}: already have {filing['accession']} (as of {stored.get('as_of')})")
            report.append({"ticker": ticker, "status": "unchanged", "as_of": stored.get("as_of"), "fund_name": stored.get("fund_name")})
            continue
        parsed = read_filing(filing)
        if not parsed or not parsed.get("positions"):
            log(f"{ticker}: filing {filing['accession']} had no positions")
            report.append({"ticker": ticker, "status": "empty"})
            continue
        if filing.get("series_id") and parsed.get("series_id") and parsed["series_id"] != filing["series_id"]:
            log(f"{ticker}: filing is for series {parsed['series_id']}, expected {filing['series_id']}; skipped")
            report.append({"ticker": ticker, "status": "wrong_series"})
            continue
        summary = summarise_positions(parsed["positions"])
        log(
            f"{ticker}: {parsed.get('series_name')} as of {parsed.get('as_of')}, "
            f"{len(summary['stocks'])} stocks, {summary['equity_weight'] * 100:.1f}% in stocks"
        )
        loaded.append((ticker, filing, parsed, summary))

    cusips = EtfCusipMap(
        store, (item["cusip"] for _, _, _, summary in loaded for item in summary["stocks"] if item["cusip"]), persist=persist
    )
    if use_figi:
        cusips.resolve(
            item["cusip"]
            for _, _, parsed, summary in loaded
            if fund_status(summary, parsed.get("net_assets_usd"))[0] == "ok"
            for item in summary["stocks"]
            if item["cusip"]
        )
    ticker_of = make_ticker_of(cusips, names)

    docs: list[tuple[str, dict[str, Any]]] = []
    for ticker, filing, parsed, summary in loaded:
        rows = holding_rows(summary["stocks"], ticker_of)
        doc = build_fund_doc(ticker=ticker, filing=filing, parsed=parsed, summary=summary, rows=rows, fetched_at=fetched_at)
        docs.append((f"{COLLECTION}/{ticker}", doc))
        report.append(
            {
                "ticker": ticker,
                "status": doc["status"],
                "as_of": doc["as_of"],
                "fund_name": doc["fund_name"],
                "holdings": doc["holdings_count"],
                "mapped_pct": round(doc["mapped_weight"] / doc["equity_weight"] * 100, 1) if doc["equity_weight"] else None,
            }
        )
    return docs, report


def build_meta(report: list[dict[str, Any]], previous: dict[str, Any] | None, now_iso: str) -> dict[str, Any]:
    funds = dict((previous or {}).get("funds") or {})
    for item in report:
        if item.get("status") in ("ok", "derivatives", "not_stocks", "unchanged"):
            prior = funds.get(item["ticker"]) or {}
            status = prior.get("status", "ok") if item["status"] == "unchanged" else item["status"]
            funds[item["ticker"]] = {
                "status": status,
                "as_of": item.get("as_of") or prior.get("as_of"),
                "fund_name": item.get("fund_name") or prior.get("fund_name"),
            }
    return {"funds": dict(sorted(funds.items())), "updated_at": now_iso, "source": "SEC EDGAR Form N-PORT"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--etfs", help="comma-separated tickers; default: the big ETFs plus funds users track")
    parser.add_argument("--no-tracked", action="store_true", help="do not add funds found in users' tracked stocks")
    parser.add_argument("--no-figi", action="store_true", help="skip OpenFIGI lookups")
    parser.add_argument("--force", action="store_true", help="re-read filings that are already stored")
    parser.add_argument("--dry-run", action="store_true", help="print the summary, write nothing")
    args = parser.parse_args(argv)

    store = DocStore.from_env()
    tickers = [ticker.strip().upper() for ticker in args.etfs.split(",")] if args.etfs else list(DEFAULT_ETFS)
    if not args.etfs and not args.no_tracked:
        extra = [ticker for ticker in tracked_fund_tickers(store, fund_series_by_ticker()) if ticker not in tickers]
        confirmed = sorted(str(ticker).upper() for ticker in ((store.get(FUND_META_PATH) or {}).get("funds") or {}))
        extra += [ticker for ticker in confirmed if ticker not in tickers and ticker not in extra]
        if extra:
            log(f"adding funds users track: {', '.join(extra)}")
        tickers += extra

    # A dry run reads the same stored maps as a real run but writes nothing to the store
    # (new OpenFIGI answers still go to the local cache under backend/.cache/etf).
    docs, report = collect(tickers, store=store, force=args.force, use_figi=not args.no_figi, persist=not args.dry_run)
    for item in report:
        log(json.dumps(item))
    if args.dry_run:
        log(f"dry run: {len(docs)} fund documents built, nothing written")
        return 0
    written = store.set_many(docs)
    now_iso = datetime.now(timezone.utc).isoformat()
    store.set(META_PATH, build_meta(report, store.get(META_PATH), now_iso))
    log(f"wrote {written} fund documents and {META_PATH}")
    return 0 if any(item["status"] in ("ok", "unchanged") for item in report) else 1


if __name__ == "__main__":
    sys.exit(main())
