"""Follow the funds: 13F holdings from SEC EDGAR with a filing-date record.

Run it::

    python3 -m backend.agentdata.funds_13f                 # every fund, write to the store
    python3 -m backend.agentdata.funds_13f --funds berkshire-hathaway,scion --dry-run
    python3 -m backend.agentdata.funds_13f --verify        # print the EDGAR name for every CIK

What a 13F is, and is not: a quarter-end list of long US-listed positions that
a manager with more than $100M must file within 45 days. No shorts, no cash,
no foreign listings, no bonds. Everything below is built on that snapshot.

Collections (all additive):

* ``tm_fund_profiles/{slug}``           profile, filings, latest portfolio, changes, performance
* ``tm_fund_filings/{slug}__{period}``  top holdings and changes for one quarter
* ``tm_fund_cusip_map/{cusip}``         CUSIP to ticker, from OpenFIGI
* ``tm_follow_sources/{slug}``          the directory card
* ``tm_follow_activity/{slug}__{date}`` one "they filed" event per filing date
* ``tm_follow_meta/funds``              run counts and the time of the run

Performance is the "follow the filing" portfolio: on the first session on or
after each filing date, hold the disclosed stock positions at their filing
weights until the next filing. Nobody ran this portfolio. It ignores trading
costs and taxes, and positions without a price series are dropped and the rest
renormalised; the covered weight is stored next to every number.

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from . import prices
from .store import DocStore

SEC_USER_AGENT = "stocksbrew.online research (tomartarun2001@gmail.com)"
SEC_MIN_INTERVAL = 0.25  # 4 requests a second: other jobs share this address and the 8/s house rule
OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"

DEFAULT_SINCE = "2012-12-31"  # first quarter-end we read (filed February 2013)
VALUE_IN_DOLLARS_FROM = "2023-01-03"  # filings from this day report dollars, not thousands
PERF_TOP_N = 50  # positions per filing that get a ticker and a price
PRICE_YEARS = 14  # enough to price a filing from early 2013
RECENT_QUARTERS = 8  # quarters whose full top list and change lists get tickers
PORTFOLIO_TOP_N = 100
CHANGE_TOP_N = 25
OPTION_TOP_N = 20
ENTRY_TOLERANCE_SESSIONS = 3  # a price older than this at entry means the series is not that stock
INACTIVE_AFTER_DAYS = 150  # a filer this late has stopped filing

_CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "13f"
_FILING_CACHE = _CACHE_DIR / "filings"
_CUSIP_CACHE = _CACHE_DIR / "cusip_map.json"
_UNMAPPED_RETRY_SECONDS = 30 * 86400

# slug, cik (or several when the manager changed filing entity), manager, fund, style.
# Every CIK here was checked against the name EDGAR returns; `--verify` reprints them.
FUNDS: list[dict[str, Any]] = [
    {"slug": "berkshire-hathaway", "cik": 1067983, "manager": "Warren Buffett", "fund": "Berkshire Hathaway",
     "style": "Large stakes in a few big US companies, held for years. Greg Abel became CEO in 2026; Buffett is chairman."},
    {"slug": "pershing-square", "cik": [1336528, 2026053], "cik_since": {2026053: "2026-06-30"}, "manager": "Bill Ackman", "fund": "Pershing Square Capital",
     "style": "About ten large companies at a time, held for years. Files as Pershing Square Inc. since August 2026."},
    {"slug": "scion-asset-management", "cik": 1649339, "manager": "Michael Burry", "fund": "Scion Asset Management",
     "style": "A small book that changes fast, with contrarian bets often made through options."},
    {"slug": "bridgewater-associates", "cik": 1350694, "manager": "Founded by Ray Dalio", "fund": "Bridgewater Associates",
     "style": "Macro fund. Hundreds of stocks and index ETFs, spread wide."},
    {"slug": "renaissance-technologies", "cik": 1037389, "manager": "Founded by Jim Simons", "fund": "Renaissance Technologies",
     "style": "Quant fund with thousands of small positions that turn over every quarter."},
    {"slug": "appaloosa", "cik": 1656456, "manager": "David Tepper", "fund": "Appaloosa",
     "style": "Concentrated bets on big technology and out-of-favour names."},
    {"slug": "duquesne-family-office", "cik": 1536411, "manager": "Stanley Druckenmiller", "fund": "Duquesne Family Office",
     "style": "Family office that moves quickly from one theme to the next."},
    {"slug": "baupost-group", "cik": 1061768, "manager": "Seth Klarman", "fund": "Baupost Group",
     "style": "Deep value. A few dozen positions and a lot of patience."},
    {"slug": "icahn", "cik": 921669, "manager": "Carl Icahn", "fund": "Icahn Capital",
     "style": "Activist stakes in a handful of companies he pushes to change."},
    {"slug": "third-point", "cik": 1040273, "manager": "Dan Loeb", "fund": "Third Point",
     "style": "Event-driven and activist positions next to large growth names."},
    {"slug": "ark-invest", "cik": 1697748, "manager": "Cathie Wood", "fund": "ARK Invest",
     "style": "Growth and new-technology companies across the ARK funds."},
    {"slug": "citadel-advisors", "cik": 1423053, "manager": "Ken Griffin", "fund": "Citadel Advisors",
     "style": "Multi-strategy giant. Thousands of positions and heavy options use, so the filing shows only part of the book."},
    {"slug": "point72", "cik": 1603466, "manager": "Steve Cohen", "fund": "Point72",
     "style": "Many trading teams under one roof, more than a thousand positions."},
    {"slug": "daily-journal", "cik": 783412, "manager": "Charlie Munger's portfolio", "fund": "Daily Journal",
     "style": "The tiny portfolio Charlie Munger built. It has barely moved since he died in 2023."},
    {"slug": "tiger-global", "cik": 1167483, "manager": "Chase Coleman", "fund": "Tiger Global",
     "style": "Growth and internet companies, weighted to big technology."},
    {"slug": "coatue", "cik": 1135730, "manager": "Philippe Laffont", "fund": "Coatue Management",
     "style": "Technology specialist with a few dozen stock positions."},
    {"slug": "lone-pine", "cik": 1061165, "manager": "Founded by Stephen Mandel", "fund": "Lone Pine Capital",
     "style": "Growth stock picking, a few dozen positions."},
    {"slug": "viking-global", "cik": 1103804, "manager": "Andreas Halvorsen", "fund": "Viking Global",
     "style": "Stock picking across sectors, under a hundred positions."},
    {"slug": "greenlight-capital", "cik": [1079114, 1489933], "manager": "David Einhorn", "fund": "Greenlight Capital",
     "style": "Value investor with a concentrated long book. Files as DME Capital Management since 2024."},
    {"slug": "soros-fund-management", "cik": 1029160, "manager": "Soros family office", "fund": "Soros Fund Management",
     "style": "Family office with a broad book that changes often."},
    {"slug": "elliott", "cik": 1791786, "manager": "Paul Singer", "fund": "Elliott Investment Management",
     "style": "Activist. Large stakes sit next to hedges and options."},
    {"slug": "paulson", "cik": 1035674, "manager": "John Paulson", "fund": "Paulson & Co.",
     "style": "Family office concentrated in gold miners and a few special situations."},
    {"slug": "oaktree", "cik": 949509, "manager": "Howard Marks", "fund": "Oaktree Capital",
     "style": "Credit specialist. The stock book is mostly value and post-restructuring names."},
    {"slug": "tudor", "cik": 923093, "manager": "Paul Tudor Jones", "fund": "Tudor Investment",
     "style": "Macro trader with a broad, short-term stock and ETF book."},
    {"slug": "millennium", "cik": 1273087, "manager": "Israel Englander", "fund": "Millennium Management",
     "style": "Hundreds of trading teams. Thousands of positions, most of them small."},
    {"slug": "two-sigma", "cik": 1179392, "manager": "John Overdeck and David Siegel", "fund": "Two Sigma Investments",
     "style": "Quant fund. Thousands of holdings picked by models."},
    {"slug": "de-shaw", "cik": 1009207, "manager": "Founded by David Shaw", "fund": "D. E. Shaw",
     "style": "Quant and multi-strategy, thousands of positions."},
    {"slug": "aqr", "cik": 1167557, "manager": "Cliff Asness", "fund": "AQR Capital",
     "style": "Rules-based factor investing across thousands of stocks."},
    {"slug": "fairholme", "cik": 1056831, "manager": "Bruce Berkowitz", "fund": "Fairholme Capital",
     "style": "Extremely concentrated. Most of the book sits in one or two holdings."},
    {"slug": "gotham", "cik": 1510387, "manager": "Joel Greenblatt", "fund": "Gotham Asset Management",
     "style": "Rules-based value across hundreds of stocks."},
    {"slug": "himalaya-capital", "cik": 1709323, "manager": "Li Lu", "fund": "Himalaya Capital",
     "style": "A handful of positions held for a long time."},
    {"slug": "akre-capital", "cik": 1112520, "manager": "Founded by Chuck Akre", "fund": "Akre Capital",
     "style": "A short list of steady growers, rarely traded."},
    {"slug": "pabrai-dalal-street", "cik": 1549575, "manager": "Mohnish Pabrai", "fund": "Dalal Street",
     "style": "Very few positions, deep value. Much of his money is outside the US and not in this filing."},
    {"slug": "markel", "cik": 1096343, "manager": "Tom Gayner", "fund": "Markel Group",
     "style": "An insurer's stock portfolio. Long-term, wide and low turnover."},
    {"slug": "starboard-value", "cik": 1517137, "manager": "Jeff Smith", "fund": "Starboard Value",
     "style": "Activist stakes in mid-sized companies."},
    {"slug": "trian", "cik": 1345471, "manager": "Nelson Peltz", "fund": "Trian Fund Management",
     "style": "Activist with a few large positions."},
    {"slug": "valueact", "cik": 1418814, "manager": "Mason Morfit", "fund": "ValueAct Capital",
     "style": "A concentrated activist book, usually with a board seat."},
    {"slug": "tci", "cik": 1647251, "manager": "Chris Hohn", "fund": "TCI Fund Management",
     "style": "Long-term stakes in a few high-quality companies."},
    {"slug": "altimeter", "cik": 1541617, "manager": "Brad Gerstner", "fund": "Altimeter Capital",
     "style": "Concentrated technology book."},
    {"slug": "whale-rock", "cik": 1387322, "manager": "Alex Sacerdote", "fund": "Whale Rock Capital",
     "style": "Technology and growth stocks."},
    {"slug": "maverick-capital", "cik": 934639, "manager": "Lee Ainslie", "fund": "Maverick Capital",
     "style": "Stock picking across sectors with a wide book."},
    {"slug": "glenview", "cik": 1138995, "manager": "Larry Robbins", "fund": "Glenview Capital",
     "style": "Concentrated, with a long-standing lean to healthcare."},
    {"slug": "cooperman-omega", "cik": 898382, "manager": "Leon Cooperman", "fund": "Omega Family Office",
     "style": "Family office with a value lean and a few dozen positions."},
    {"slug": "fundsmith", "cik": 1569205, "manager": "Terry Smith", "fund": "Fundsmith",
     "style": "Buys good companies and tries not to sell them."},
    {"slug": "gates-foundation-trust", "cik": 1166559, "manager": "Gates Foundation endowment", "fund": "Gates Foundation Trust",
     "style": "An endowment with a few very large, long-held stakes."},
    {"slug": "pzena", "cik": 1027796, "manager": "Richard Pzena", "fund": "Pzena Investment Management",
     "style": "Deep value in large, out-of-favour companies."},
    {"slug": "tweedy-browne", "cik": 732905, "manager": "Tweedy, Browne partners", "fund": "Tweedy, Browne",
     "style": "Old-school value. The US filing shows only part of a global book."},
    {"slug": "first-eagle", "cik": 1325447, "manager": "First Eagle team", "fund": "First Eagle Investments",
     "style": "Value investing with a standing position in gold."},
    {"slug": "dodge-and-cox", "cik": 200217, "manager": "Dodge & Cox committee", "fund": "Dodge & Cox",
     "style": "A large value fund manager with low turnover."},
    {"slug": "ruane-cunniff", "cik": 1720792, "manager": "Sequoia Fund team", "fund": "Ruane, Cunniff & Goldfarb",
     "style": "Runs the Sequoia Fund. A concentrated book of long-term holdings."},
    {"slug": "miller-value", "cik": 1135778, "manager": "Bill Miller's firm", "fund": "Miller Value Partners",
     "style": "Contrarian value with a taste for unusual positions."},
    {"slug": "southeastern", "cik": 807985, "manager": "Mason Hawkins", "fund": "Southeastern Asset Management",
     "style": "Runs the Longleaf funds. Concentrated value."},
    {"slug": "fairfax", "cik": 915191, "manager": "Prem Watsa", "fund": "Fairfax Financial",
     "style": "An insurer's stock book with a deep-value lean."},
    {"slug": "d1-capital", "cik": 1747057, "manager": "Dan Sundheim", "fund": "D1 Capital Partners",
     "style": "Stock picking with a growth lean. Its private holdings are not in this filing."},
    {"slug": "h-and-h-international", "cik": 1759760, "manager": "Duan Yongping", "fund": "H&H International Investment",
     "style": "A few large positions, long-term."},
    {"slug": "gardner-russo-quinn", "cik": 860643, "manager": "Tom Russo", "fund": "Gardner Russo & Quinn",
     "style": "Global consumer brands held for decades."},
    {"slug": "dragoneer", "cik": 1602189, "manager": "Marc Stad", "fund": "Dragoneer Investment Group",
     "style": "Growth investor in a small number of technology companies."},
    {"slug": "atreides", "cik": 1777813, "manager": "Gavin Baker", "fund": "Atreides Management",
     "style": "Technology and consumer growth stocks."},
    {"slug": "sachem-head", "cik": 1582090, "manager": "Scott Ferguson", "fund": "Sachem Head Capital",
     "style": "Concentrated, sometimes activist."},
    {"slug": "durable-capital", "cik": 1798849, "manager": "Henry Ellenbogen", "fund": "Durable Capital Partners",
     "style": "Growth companies, small and mid-sized, held for years."},
    {"slug": "srs-investment", "cik": 1503174, "manager": "Karthik Sarma", "fund": "SRS Investment Management",
     "style": "A concentrated book with a few very large positions."},
    {"slug": "hhlr-hillhouse", "cik": 1762304, "manager": "Zhang Lei", "fund": "HHLR Advisors (Hillhouse)",
     "style": "Asia-focused investor. The filing shows its US-listed positions only."},
    {"slug": "semper-augustus", "cik": 1115373, "manager": "Chris Bloomstran", "fund": "Semper Augustus",
     "style": "Value investor with low turnover."},
    {"slug": "giverny-capital", "cik": 1641864, "manager": "François Rochon", "fund": "Giverny Capital",
     "style": "Owner-style investing in a few dozen steady businesses."},
    {"slug": "situational-awareness", "cik": 2045724, "manager": "Leopold Aschenbrenner", "fund": "Situational Awareness",
     "style": "A young fund built around the AI build-out. Much of its exposure is in options."},
]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def log(message: str) -> None:
    print(f"[13f] {message}", flush=True)


def cik_since(fund: dict[str, Any], cik: int, default: str) -> str:
    """First quarter-end to read for one filing entity.

    Pershing Square Inc. filed a one-stock 13F next to the main book for a
    year before it took over the whole filing; reading those would replace an
    eleven-stock quarter with one line.
    """
    return max(default, (fund.get("cik_since") or {}).get(cik, default))


def fund_ciks(fund: dict[str, Any]) -> list[int]:
    cik = fund["cik"]
    return [int(value) for value in cik] if isinstance(cik, (list, tuple)) else [int(cik)]


# ---------------------------------------------------------------------------
# Pure helpers (covered by backend/tests/test_agentdata_follow.py)
# ---------------------------------------------------------------------------


def normalize_cusip(value: str | None) -> str:
    """Nine upper-case characters. Some filers drop the leading zeros."""
    text = re.sub(r"[^0-9A-Za-z]", "", str(value or "")).upper()
    if not text:
        return ""
    return text.zfill(9)[-9:] if len(text) <= 9 else text[:9]


def _strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _to_number(text: str | None) -> float | None:
    if text is None:
        return None
    cleaned = text.strip().replace(",", "").replace("$", "")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_info_table(xml_bytes: bytes) -> list[dict[str, Any]]:
    """Rows of a 13F information table, whatever namespace prefix the filer used."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        # A few filings carry junk before the XML declaration.
        start = xml_bytes.find(b"<")
        root = ET.fromstring(xml_bytes[start:].strip())
    rows: list[dict[str, Any]] = []
    for element in root.iter():
        if _strip_ns(element.tag) != "infotable":
            continue
        fields: dict[str, str] = {}
        for child in element.iter():
            if child is element:
                continue
            text = (child.text or "").strip()
            if text:
                fields.setdefault(_strip_ns(child.tag), text)
        cusip = normalize_cusip(fields.get("cusip"))
        value = _to_number(fields.get("value"))
        if not cusip or value is None:
            continue
        put_call = (fields.get("putcall") or "").strip().lower()
        rows.append(
            {
                "issuer": " ".join((fields.get("nameofissuer") or "").split()),
                "title_class": " ".join((fields.get("titleofclass") or "").split()),
                "cusip": cusip,
                "value": value,
                "shares": _to_number(fields.get("sshprnamt")),
                "share_type": (fields.get("sshprnamttype") or "").strip().upper(),
                "put_call": put_call if put_call in ("put", "call") else "",
            }
        )
    return rows


def parse_primary_doc(xml_bytes: bytes) -> dict[str, Any]:
    """The cover page: period, amendment type, and the filer's own totals."""
    out: dict[str, Any] = {}
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return out
    wanted = {
        "reportcalendarorquarter": "period_raw",
        "isamendment": "is_amendment",
        "amendmenttype": "amendment_type",
        "reporttype": "report_type",
        "tableentrytotal": "table_entry_total",
        "tablevaluetotal": "table_value_total",
    }
    for element in root.iter():
        key = wanted.get(_strip_ns(element.tag))
        if key and key not in out and (element.text or "").strip():
            out[key] = element.text.strip()
    match = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", out.get("period_raw", ""))
    if match:
        out["period"] = f"{match.group(3)}-{match.group(1)}-{match.group(2)}"
    return out


def aggregate_rows(rows: Iterable[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """One line per security. Stocks, options and principal-amount lines stay apart.

    A filing lists the same CUSIP once per sub-manager; a follower only cares
    about the total. Options are reported at the value of the underlying
    shares, not what the option cost, so they never go into weights.
    """
    buckets: dict[str, dict[tuple[str, str], dict[str, Any]]] = {"stocks": {}, "options": {}, "other": {}}
    for row in rows:
        if row.get("put_call"):
            kind = "options"
        elif row.get("share_type") == "PRN":
            kind = "other"  # bonds and convertibles, reported by principal amount
        else:
            kind = "stocks"
        key = (row["cusip"], row.get("put_call") or "")
        entry = buckets[kind].get(key)
        if entry is None:
            entry = {
                "cusip": row["cusip"],
                "issuer": row.get("issuer") or "",
                "title_class": row.get("title_class") or "",
                "value": 0.0,
                "shares": 0.0,
            }
            if kind == "options":
                entry["put_call"] = row["put_call"]
            buckets[kind][key] = entry
        entry["value"] += float(row.get("value") or 0.0)
        entry["shares"] += float(row.get("shares") or 0.0)
    return {
        kind: sorted(entries.values(), key=lambda item: (-item["value"], item["cusip"]))
        for kind, entries in buckets.items()
    }


def median_implied_price(stocks: Iterable[dict[str, Any]], scale: float = 1.0) -> float | None:
    implied = [
        item["value"] * scale / item["shares"]
        for item in stocks
        if item.get("shares") and item["shares"] > 0 and item.get("value") and item["value"] > 0
    ]
    return statistics.median(implied) if implied else None


def detect_value_scale(filed_at: str, stocks: list[dict[str, Any]]) -> tuple[int, bool]:
    """1000 when the table is in thousands of dollars, 1 when it is in dollars.

    The SEC switched to whole dollars for filings from 2023-01-03. Some filers
    switched late or early, so the date decides and the implied share price
    (value / shares) checks it: a median under about a dollar means thousands
    were reported, a median in the tens of thousands means dollars were.
    """
    by_date = 1000 if filed_at < VALUE_IN_DOLLARS_FROM else 1
    median = median_implied_price(stocks, by_date)
    if median is None:
        return by_date, False
    if 1.0 <= median <= 5000.0:
        return by_date, False
    other = 1 if by_date == 1000 else 1000
    other_median = median_implied_price(stocks, other)
    if other_median is not None and 1.0 <= other_median <= 5000.0:
        return other, True
    return by_date, False


def merge_holdings(base: list[dict[str, Any]], extra: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add a "new holdings" amendment to the filing it amends."""
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for item in list(base) + list(extra):
        key = (item["cusip"], item.get("put_call") or "")
        if key in merged:
            merged[key]["value"] += item["value"]
            merged[key]["shares"] += item["shares"]
        else:
            merged[key] = dict(item)
    return sorted(merged.values(), key=lambda item: (-item["value"], item["cusip"]))


_SPLIT_RATIOS = (1.5, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 50)


def looks_like_split(prev_shares: float, cur_shares: float, prev_value: float, cur_value: float) -> bool:
    """True when a share count changed by a clean split ratio and the price moved the other way.

    A 10-for-1 split turns 1M shares into 10M without the manager doing
    anything. Calling that "added 900%" would be wrong, so those lines are
    treated as unchanged.
    """
    if prev_shares <= 0 or cur_shares <= 0 or prev_value <= 0 or cur_value <= 0:
        return False
    ratio = cur_shares / prev_shares
    forward = ratio >= 1
    factor = ratio if forward else 1 / ratio
    if factor < 1.45:
        return False
    if not any(abs(factor - candidate) / candidate < 0.01 for candidate in _SPLIT_RATIOS):
        return False
    prev_price = prev_value / prev_shares
    cur_price = cur_value / cur_shares
    price_factor = prev_price / cur_price if forward else cur_price / prev_price
    return 0.6 * factor <= price_factor <= 1.6 * factor


def diff_holdings(prev: list[dict[str, Any]], cur: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Quarter over quarter: new, added, reduced, sold out. Share counts decide, not value."""
    prev_by = {item["cusip"]: item for item in prev}
    cur_by = {item["cusip"]: item for item in cur}
    prev_total = sum(item["value"] for item in prev) or 0.0
    cur_total = sum(item["value"] for item in cur) or 0.0
    out: dict[str, list[dict[str, Any]]] = {"new": [], "added": [], "reduced": [], "sold": [], "held": []}

    for cusip, item in cur_by.items():
        weight = item["value"] / cur_total if cur_total else None
        before = prev_by.get(cusip)
        if before is None:
            out["new"].append({**_change_base(item), "value": item["value"], "weight": weight, "shares": item["shares"]})
            continue
        prev_weight = before["value"] / prev_total if prev_total else None
        delta = item["shares"] - before["shares"]
        record = {
            **_change_base(item),
            "value": item["value"],
            "weight": weight,
            "prev_weight": prev_weight,
            "shares": item["shares"],
            "prev_shares": before["shares"],
        }
        split = looks_like_split(before["shares"], item["shares"], before["value"], item["value"])
        if split:
            record["split_suspected"] = True
        if before["shares"] <= 0 or split or abs(delta) / before["shares"] < 0.001:
            out["held"].append(record)
            continue
        record["shares_delta"] = delta
        record["shares_delta_pct"] = delta / before["shares"] * 100
        implied = item["value"] / item["shares"] if item["shares"] > 0 else None
        record["delta_value"] = delta * implied if implied is not None else None
        out["added" if delta > 0 else "reduced"].append(record)

    for cusip, before in prev_by.items():
        if cusip in cur_by:
            continue
        out["sold"].append(
            {
                **_change_base(before),
                "prev_value": before["value"],
                "prev_weight": before["value"] / prev_total if prev_total else None,
                "prev_shares": before["shares"],
            }
        )

    out["new"].sort(key=lambda item: -item["value"])
    out["sold"].sort(key=lambda item: -item["prev_value"])
    out["added"].sort(key=lambda item: -(item.get("delta_value") or 0.0))
    out["reduced"].sort(key=lambda item: (item.get("delta_value") or 0.0))
    out["held"].sort(key=lambda item: -item["value"])
    return out


def _change_base(item: dict[str, Any]) -> dict[str, Any]:
    return {"cusip": item["cusip"], "issuer": item.get("issuer") or "", "title_class": item.get("title_class") or ""}


def shift_months(day: str, months: int) -> str:
    """Calendar months back (negative) or forward, clamped to the month's last day."""
    parsed = date.fromisoformat(day)
    index = parsed.year * 12 + (parsed.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    for last in (31, 30, 29, 28):
        try:
            return date(year, month, min(parsed.day, last)).isoformat()
        except ValueError:
            continue
    raise ValueError(day)


def _index_on_or_after(dates: list[str], day: str) -> int | None:
    low, high = 0, len(dates)
    while low < high:
        mid = (low + high) // 2
        if dates[mid] < day:
            low = mid + 1
        else:
            high = mid
    return low if low < len(dates) else None


def _index_on_or_before(dates: list[str], day: str) -> int | None:
    low, high = 0, len(dates)
    while low < high:
        mid = (low + high) // 2
        if dates[mid] <= day:
            low = mid + 1
        else:
            high = mid
    return low - 1 if low > 0 else None


class PriceBook:
    """Closes aligned to one trading calendar, forward-filled, built on demand."""

    def __init__(self, calendar: list[str], series: dict[str, dict[str, Any]]) -> None:
        self.calendar = calendar
        self._series = series
        self._aligned: dict[str, tuple[list[float | None], list[int]]] = {}

    def aligned(self, ticker: str) -> tuple[list[float | None], list[int]] | None:
        """(close per calendar day, sessions since the last real print) or None."""
        if ticker in self._aligned:
            return self._aligned[ticker]
        document = self._series.get(ticker)
        if not document:
            return None
        by_date = dict(zip(document.get("dates") or [], document.get("closes") or []))
        closes: list[float | None] = []
        age: list[int] = []
        last: float | None = None
        stale = 10**6
        for day in self.calendar:
            price = by_date.get(day)
            if price is not None and price > 0:
                last = float(price)
                stale = 0
            else:
                stale += 1
            closes.append(last)
            age.append(stale)
        self._aligned[ticker] = (closes, age)
        return self._aligned[ticker]

    def entry_price(self, ticker: str, index: int) -> float | None:
        """A price a follower could have paid: a real print within a few sessions."""
        aligned = self.aligned(ticker)
        if aligned is None:
            return None
        closes, age = aligned
        if closes[index] is None or age[index] > ENTRY_TOLERANCE_SESSIONS:
            return None
        return closes[index]


def simulate_follow(
    events: list[dict[str, Any]],
    book: PriceBook,
    *,
    end_index: int | None = None,
) -> dict[str, Any] | None:
    """Value of one unit following each filing from the day it was public.

    ``events``: ``[{"date": filed date, "weights": {ticker: weight of the whole
    stock book}}]`` in filing order. On the first session on or after each
    date the portfolio is reset to those weights (renormalised over the names
    that have a price) and left alone until the next event. A series that
    stops mid-hold keeps its last price, as if it had gone to cash.
    """
    calendar = book.calendar
    last_index = len(calendar) - 1 if end_index is None else min(end_index, len(calendar) - 1)
    entries: list[tuple[int, dict[str, Any]]] = []
    for event in events:
        index = _index_on_or_after(calendar, event["date"])
        if index is None or index > last_index:
            continue
        if entries and entries[-1][0] == index:
            entries[-1] = (index, event)  # two filings on one session: the later one stands
        else:
            entries.append((index, event))
    if not entries:
        return None

    start = entries[0][0]
    values: list[float] = []
    coverage: list[dict[str, Any]] = []
    level = 1.0
    for position, (index, event) in enumerate(entries):
        stop = entries[position + 1][0] if position + 1 < len(entries) else last_index
        priced: list[tuple[float, list[float | None], float]] = []
        for ticker, weight in event["weights"].items():
            if weight <= 0:
                continue
            entry = book.entry_price(ticker, index)
            if entry is None:
                continue
            priced.append((weight, book.aligned(ticker)[0], entry))  # type: ignore[index]
        covered = sum(weight for weight, _, _ in priced)
        coverage.append(
            {
                "date": event["date"],
                "entry_date": calendar[index],
                "covered_weight": covered,
                "priced": len(priced),
                "positions": len(event["weights"]),
            }
        )
        for day in range(index, stop + 1):
            if covered > 0:
                growth = sum(weight / covered * (closes[day] or entry) / entry for weight, closes, entry in priced)
            else:
                growth = 1.0  # nothing priced: sit in cash rather than invent a return
            if day == index and values:
                continue  # the reset day already has a value from the previous hold
            values.append(level * growth)
        level = values[-1]
    return {"dates": calendar[start : last_index + 1], "values": values, "coverage": coverage}


def max_drawdown(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    peak = values[0]
    worst = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            worst = min(worst, value / peak - 1)
    return worst


def window_return(dates: list[str], values: list[float], anchor: str) -> float | None:
    """Return from the last session on or before ``anchor`` to the end. None if the record is too short."""
    if not dates or anchor < dates[0]:
        return None
    index = _index_on_or_before(dates, anchor)
    if index is None or index >= len(dates) - 1 or values[index] <= 0:
        return None
    return values[-1] / values[index] - 1


def performance_stats(dates: list[str], values: list[float], *, ended: bool = False) -> dict[str, Any]:
    """1m, 3m, YTD, 1y, since start and worst drawdown for one curve. Fractions, not percent.

    ``ended`` marks a record that stops before today (the filer stopped filing,
    or everything disclosed was sold). "The past month" of such a record is a
    month long gone, so the trailing windows are left empty and only the whole
    record and its worst drop are reported.
    """
    end = dates[-1]
    years = (date.fromisoformat(end) - date.fromisoformat(dates[0])).days / 365.25
    since = values[-1] / values[0] - 1 if values[0] > 0 else None
    annualized = None
    if since is not None and years >= 1 and 1 + since > 0:
        annualized = (1 + since) ** (1 / years) - 1
    return {
        "r_1m": None if ended else window_return(dates, values, shift_months(end, -1)),
        "r_3m": None if ended else window_return(dates, values, shift_months(end, -3)),
        "r_ytd": None if ended else window_return(dates, values, f"{int(end[:4]) - 1}-12-31"),
        "r_1y": None if ended else window_return(dates, values, shift_months(end, -12)),
        "r_since": since,
        "annualized": annualized,
        "max_drawdown": max_drawdown(values),
    }


def downsample(dates: list[str], *columns: list[float], step: int = 5) -> list[list[Any]]:
    """Every ``step``-th session plus the last one: enough for a chart, small enough to store."""
    picked = list(range(0, len(dates), step))
    if picked and picked[-1] != len(dates) - 1:
        picked.append(len(dates) - 1)
    return [[dates[index]] + [round(column[index], 5) for column in columns] for index in picked]


_SMALL_WORDS = {"of", "and", "the", "for", "de", "in", "on", "at", "to", "a"}
_KEEP_UPPER = {
    "ETF", "ADR", "ADS", "USA", "US", "AI", "II", "III", "IV", "LLC", "LP", "PLC", "NV", "SA", "AG", "SE", "AB",
    "REIT", "IBM", "AT&T", "CVS", "HP", "KKR", "TJX", "UBS", "ASML", "BP", "HCA", "GE", "SPDR", "QQQ", "S&P",
    "NYSE", "TSMC", "XM", "HDFC", "ICICI", "AMD", "EQT", "CRH", "RH", "BHP", "ADT", "AES", "CME", "CSX", "DXC", "EOG",
    "FMC", "KLA", "MGM", "MSCI", "NRG", "PNC", "PPG", "RTX", "SLM", "UPS", "XPO", "CBRE", "GXO", "NCR", "JD", "KE",
}


def display_name(raw: str) -> str:
    """"BANK OF AMERICA CORP" reads better as "Bank of America Corp"."""
    text = " ".join(str(raw or "").split())
    # Data-vendor shorthand: "COCA-COLA CO/THE", "ALPHABET INC-CL A", "LENNAR CORP-A", "PACWEST BANCORP/DE".
    text = re.sub(r"/(THE|DE|NEW|MD|NY|CA|NV|OH|PA|TX|VA|MA|NJ|WI|MN|GA|UK|CAN)$", "", text, flags=re.I)
    text = re.sub(r"\s*-\s*CL(?:ASS)?\s+([A-Z])$", r" Class \1", text, flags=re.I)
    text = re.sub(r"(?<=[A-Za-z])-([A-C])$", r" Class \1", text, flags=re.I)
    words = []
    for index, word in enumerate(text.split(" ")):
        upper = word.upper()
        if index > 0 and len(upper) == 1 and words and words[-1] == "Class":
            words.append(upper)
        elif upper in _KEEP_UPPER:
            words.append(upper)
        elif index > 0 and word.lower() in _SMALL_WORDS:
            words.append(word.lower())
        elif "-" in word:
            words.append("-".join(part.capitalize() for part in word.split("-")))
        else:
            words.append(word.capitalize())
    return " ".join(words).strip()


def fmt_day(iso: str, *, with_year: bool = False) -> str:
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", iso or "")
    if not match:
        return ""
    text = f"{MONTHS[int(match.group(2)) - 1]} {int(match.group(3))}"
    return f"{text}, {match.group(1)}" if with_year else text


def quarter_label(period: str) -> str:
    """"2026-06-30" -> "Q2 2026"."""
    match = re.match(r"^(\d{4})-(\d{2})", period or "")
    if not match:
        return period or ""
    return f"Q{(int(match.group(2)) - 1) // 3 + 1} {match.group(1)}"


def _join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def build_headline(fund_name: str, filed_at: str, period: str, changes: dict[str, Any] | None) -> str:
    """One plain sentence about a filing, built from the numbers. No model writes this."""
    lead = f"{fund_name} filed on {fmt_day(filed_at)} for {quarter_label(period)}"
    if not changes:
        return f"{lead}. This is the first filing we have for them, so there is nothing to compare it with yet."
    parts: list[str] = []
    for key, verb in (("new", "bought"), ("added", "added to"), ("reduced", "trimmed"), ("sold", "sold out of")):
        labels = [item.get("ticker") or display_name(item.get("issuer") or "") for item in (changes.get(key) or [])[:3]]
        labels = [label for label in labels if label]
        if labels:
            parts.append(f"{verb} {_join_names(labels)}")
    if not parts:
        return f"{lead}. No position changed."
    return f"{lead}: {_join_names(parts) if len(parts) < 3 else ', '.join(parts[:-1]) + ', and ' + parts[-1]}."


# ---------------------------------------------------------------------------
# SEC EDGAR
# ---------------------------------------------------------------------------

_last_sec_request = 0.0


def sec_get(url: str, *, attempts: int = 5) -> bytes | None:
    """One polite GET. None on 404."""
    global _last_sec_request
    for attempt in range(attempts):
        wait = SEC_MIN_INTERVAL - (time.time() - _last_sec_request)
        if wait > 0:
            time.sleep(wait)
        _last_sec_request = time.time()
        request = urllib.request.Request(
            url, headers={"User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip", "Accept": "*/*"}
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    import gzip

                    body = gzip.decompress(body)
                return body
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code in (403, 429):
                # The rate limiter. EDGAR blocks an address for about ten minutes once it trips,
                # and hammering it extends the block, so wait it out rather than drop a fund.
                log(f"SEC asked us to slow down ({error.code}); waiting {120 * (attempt + 1)}s")
                time.sleep(120.0 * (attempt + 1))
                continue
            if error.code in (500, 502, 503, 504):
                time.sleep(3.0 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f"SEC request failed after retries: {url}")


def list_13f_filings(cik: int, since_period: str) -> tuple[str, list[dict[str, Any]]]:
    """(EDGAR's name for the filer, every 13F-HR and 13F-HR/A with a period on or after ``since_period``)."""
    body = sec_get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    if body is None:
        raise RuntimeError(f"no EDGAR submissions for CIK {cik}")
    payload = json.loads(body)
    pages = [payload["filings"]["recent"]]
    oldest_seen = min(pages[0].get("filingDate") or ["9999"])
    for extra in payload["filings"].get("files") or []:
        if oldest_seen <= since_period:
            break
        if (extra.get("filingTo") or "9999") < since_period:
            continue
        page = sec_get(f"https://data.sec.gov/submissions/{extra['name']}")
        if page:
            pages.append(json.loads(page))
            oldest_seen = min(oldest_seen, min(pages[-1].get("filingDate") or ["9999"]))
    filings: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in pages:
        for form, accession, filed, period in zip(
            page.get("form") or [],
            page.get("accessionNumber") or [],
            page.get("filingDate") or [],
            page.get("reportDate") or [],
        ):
            if form not in ("13F-HR", "13F-HR/A") or accession in seen:
                continue
            if not period or period < since_period:
                continue
            seen.add(accession)
            filings.append({"cik": cik, "form": form, "accession": accession, "filed_at": filed, "period": period})
    filings.sort(key=lambda item: (item["filed_at"], item["accession"]))
    return payload.get("name") or "", filings


def filing_urls(cik: int, accession: str) -> dict[str, str]:
    folder = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}"
    return {"folder": folder, "index": f"{folder}/{accession}-index.htm"}


def load_filing(meta: dict[str, Any]) -> dict[str, Any] | None:
    """Download and parse one filing, or read it from the disk cache. None for a notice with no table."""
    cache = _FILING_CACHE / str(meta["cik"]) / f"{meta['accession']}.json"
    if cache.exists():
        try:
            return json.loads(cache.read_text())
        except json.JSONDecodeError:
            pass
    urls = filing_urls(meta["cik"], meta["accession"])
    listing_raw = sec_get(f"{urls['folder']}/index.json")
    if listing_raw is None:
        return None
    items = (json.loads(listing_raw).get("directory") or {}).get("item") or []
    xml_names = [item for item in items if str(item.get("name", "")).lower().endswith(".xml")]
    primary = next((item["name"] for item in xml_names if item["name"].lower() == "primary_doc.xml"), None)
    tables = [item for item in xml_names if item["name"].lower() != "primary_doc.xml"]

    def size_of(item: dict[str, Any]) -> int:
        try:
            return int(item.get("size") or 0)
        except (TypeError, ValueError):
            return 0

    tables.sort(key=size_of, reverse=True)

    cover: dict[str, Any] = {}
    if primary:
        cover_raw = sec_get(f"{urls['folder']}/{primary}")
        if cover_raw:
            cover = parse_primary_doc(cover_raw)

    rows: list[dict[str, Any]] = []
    table_name = ""
    for candidate in tables:
        raw = sec_get(f"{urls['folder']}/{candidate['name']}")
        if not raw:
            continue
        try:
            rows = parse_info_table(raw)
        except ET.ParseError:
            rows = []
        if rows:
            table_name = candidate["name"]
            break

    grouped = aggregate_rows(rows)
    scale, corrected = detect_value_scale(meta["filed_at"], grouped["stocks"] or grouped["options"])
    for bucket in grouped.values():
        for item in bucket:
            item["value"] = item["value"] * scale
    document = {
        **meta,
        "period": cover.get("period") or meta["period"],
        "amendment_type": (cover.get("amendment_type") or "").upper(),
        "report_type": cover.get("report_type") or "",
        "table_entry_total": _to_number(cover.get("table_entry_total")),
        "table_value_total": (_to_number(cover.get("table_value_total")) or 0.0) * scale or None,
        "value_scale": scale,
        "value_scale_corrected": corrected,
        "row_count": len(rows),
        "table_file": table_name,
        "url": urls["index"],
        "table_url": f"{urls['folder']}/{table_name}" if table_name else "",
        "stocks": grouped["stocks"],
        "options": grouped["options"],
        "other": grouped["other"],
    }
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(document, separators=(",", ":")))
    return document


def build_periods(filings: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Fold amendments into their quarter.

    Returns ``(by_period, timeline)``. ``by_period[period]`` is what the
    manager finally reported for that quarter: a restatement replaces the
    original, a "new holdings" amendment adds to it. ``timeline`` is what a
    follower knew on each filing date, in order, skipping amendments to a
    quarter that had already been superseded by a newer one.
    """
    by_period: dict[str, dict[str, Any]] = {}
    timeline: list[dict[str, Any]] = []
    current_period = ""
    for filing in sorted(filings, key=lambda item: (item["filed_at"], item["accession"])):
        period = filing["period"]
        state = by_period.get(period)
        is_amendment = filing["form"].endswith("/A")
        adds = is_amendment and "NEW" in (filing.get("amendment_type") or "")
        if not (filing["stocks"] or filing["options"] or filing["other"]):
            continue
        if state is None or not adds:
            state = {
                "period": period,
                "first_filed_at": state["first_filed_at"] if state else filing["filed_at"],
                "stocks": list(filing["stocks"]),
                "options": list(filing["options"]),
                "other": list(filing["other"]),
                "filings": (state["filings"] if state else []) + [filing],
            }
        else:
            state = {
                **state,
                "stocks": merge_holdings(state["stocks"], filing["stocks"]),
                "options": merge_holdings(state["options"], filing["options"]),
                "other": merge_holdings(state["other"], filing["other"]),
                "filings": state["filings"] + [filing],
            }
        state["filed_at"] = filing["filed_at"]
        state["accession"] = filing["accession"]
        state["url"] = filing["url"]
        state["form"] = filing["form"]
        by_period[period] = state
        if period >= current_period:
            current_period = period
            timeline.append(
                {
                    "date": filing["filed_at"],
                    "period": period,
                    "stocks": list(state["stocks"][:PERF_TOP_N]),
                    "total": sum(item["value"] for item in state["stocks"]),
                }
            )
    return by_period, timeline


def compact_periods(by_period: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Everything the documents need from each quarter, without the long tail.

    The big multi-strategy filers report close to ten thousand lines a
    quarter. The diff is taken on the full lists, then only the top of each
    list is kept so a full run fits in memory on a small machine.
    """
    out: list[dict[str, Any]] = []
    first_seen: dict[str, str] = {}
    previous: dict[str, Any] | None = None
    for period in sorted(by_period):
        state = by_period[period]
        stocks = state["stocks"]
        total = sum(item["value"] for item in stocks)
        for item in stocks:
            first_seen.setdefault(item["cusip"], period)
        diff = diff_holdings(previous["stocks"], stocks) if previous else None
        top = stocks[:PORTFOLIO_TOP_N]
        status: dict[str, dict[str, Any]] = {}
        trimmed: dict[str, Any] | None = None
        if diff:
            top_cusips = {item["cusip"] for item in top}
            for key in ("new", "added", "reduced", "held"):
                for item in diff[key]:
                    if item["cusip"] in top_cusips:
                        status[item["cusip"]] = {
                            "change": key,
                            "shares_delta_pct": item.get("shares_delta_pct"),
                            "prev_weight": item.get("prev_weight"),
                        }
            trimmed = {"counts": {key: len(diff[key]) for key in ("new", "added", "reduced", "sold", "held")}}
            for key in ("new", "added", "reduced", "sold"):
                trimmed[key] = diff[key][:CHANGE_TOP_N]
        out.append(
            {
                "period": period,
                "first_filed_at": state["first_filed_at"],
                "filed_at": state["filed_at"],
                "accession": state["accession"],
                "url": state["url"],
                "form": state["form"],
                "documents": [
                    {"form": item["form"], "filed_at": item["filed_at"], "accession": item["accession"], "url": item["url"]}
                    for item in state["filings"]
                ],
                "value_scale_corrected": any(item.get("value_scale_corrected") for item in state["filings"]),
                "stocks": top,
                "stock_total": total,
                "stock_count": len(stocks),
                "top10_value": sum(item["value"] for item in stocks[:10]),
                "options": state["options"][:OPTION_TOP_N],
                "options_total": sum(item["value"] for item in state["options"]),
                "option_count": len(state["options"]),
                "other_count": len(state["other"]),
                "diff": trimmed,
                "status": status,
                "held_since": {item["cusip"]: first_seen[item["cusip"]] for item in top},
            }
        )
        previous = state
    return out


# ---------------------------------------------------------------------------
# CUSIP to ticker
# ---------------------------------------------------------------------------


def clean_ticker(raw: str | None) -> str:
    """OpenFIGI writes share classes as BRK/B; the app and the store use BRK.B."""
    ticker = str(raw or "").strip().upper().replace("/", ".")
    if not ticker or not re.match(r"^[A-Z][A-Z0-9.\-]{0,9}$", ticker):
        return ""
    return ticker


def figi_id_type(cusip: str) -> str:
    """Issuers domiciled outside the US and Canada (Chubb, Aon, ASML) carry a CINS: a CUSIP that starts with a letter."""
    return "ID_CINS" if cusip[:1].isalpha() else "ID_CUSIP"


def pick_figi(matches: list[dict[str, Any]]) -> dict[str, Any] | None:
    equities = [item for item in matches if item.get("marketSector") == "Equity" and clean_ticker(item.get("ticker"))]
    if not equities:
        return None
    preferred = ("Common Stock", "Depositary Receipt", "REIT", "MLP", "Mutual Fund", "Partnership Shares")
    for kind in preferred:
        for item in equities:
            if item.get("securityType2") == kind:
                return item
    return equities[0]


class CusipMap:
    """Disk-cached, store-backed CUSIP to ticker lookups."""

    def __init__(self, store: DocStore | None) -> None:
        self.store = store
        self.entries: dict[str, dict[str, Any]] = {}
        self._dirty: set[str] = set()
        if _CUSIP_CACHE.exists():
            try:
                self.entries = json.loads(_CUSIP_CACHE.read_text())
            except json.JSONDecodeError:
                self.entries = {}
        if not self.entries and store is not None:
            try:
                stored = store.list("tm_fund_cusip_map", limit=5000)  # the service caps a listing at 5,000
            except RuntimeError:
                stored = []
            for _, data in stored:
                if data.get("cusip"):
                    self.entries[data["cusip"]] = data
            if self.entries:
                log(f"cusip map: {len(self.entries)} entries loaded from the store")

    def ticker(self, cusip: str) -> str | None:
        entry = self.entries.get(cusip)
        return entry.get("ticker") if entry else None

    def name(self, cusip: str) -> str | None:
        entry = self.entries.get(cusip)
        return entry.get("name") if entry else None

    def _needs_lookup(self, cusip: str) -> bool:
        entry = self.entries.get(cusip)
        if entry is None:
            return True
        if entry.get("ticker"):
            return False
        if cusip[:1].isalpha() and entry.get("id_type") != "ID_CINS":
            return True  # looked up as a US CUSIP before we knew foreign issuers need the CINS lookup
        return time.time() - float(entry.get("checked_at_epoch") or 0) > _UNMAPPED_RETRY_SECONDS

    def resolve(self, cusips: Iterable[str]) -> None:
        todo = sorted({cusip for cusip in cusips if cusip and self._needs_lookup(cusip)})
        if not todo:
            return
        api_key = os.getenv("OPENFIGI_API_KEY", "").strip()
        batch_size = 100 if api_key else 10
        pause = 0.3 if api_key else 2.5  # 25 requests a minute without a key
        log(f"cusip map: looking up {len(todo)} CUSIPs on OpenFIGI ({'keyed' if api_key else 'no key, slow lane'})")
        for start in range(0, len(todo), batch_size):
            chunk = todo[start : start + batch_size]
            results = self._lookup(chunk, api_key)
            now = datetime.now(timezone.utc).isoformat()
            for cusip, result in zip(chunk, results):
                best = pick_figi(result.get("data") or []) if isinstance(result, dict) else None
                entry: dict[str, Any] = {
                    "cusip": cusip,
                    "ticker": clean_ticker(best.get("ticker")) if best else None,
                    "name": best.get("name") if best else None,
                    "figi": best.get("compositeFIGI") or best.get("figi") if best else None,
                    "security_type": best.get("securityType2") if best else None,
                    "id_type": figi_id_type(cusip),
                    "source": "openfigi",
                    "checked_at": now,
                    "checked_at_epoch": time.time(),
                }
                self.entries[cusip] = entry
                self._dirty.add(cusip)
            if (start // batch_size) % 20 == 19:
                self.save()
                log(f"cusip map: {min(start + batch_size, len(todo))}/{len(todo)}")
            time.sleep(pause)
        self.save()

    def _lookup(self, chunk: list[str], api_key: str) -> list[Any]:
        body = json.dumps(
            [{"idType": figi_id_type(cusip), "idValue": cusip, "exchCode": "US"} for cusip in chunk]
        ).encode()
        headers = {"Content-Type": "application/json", "User-Agent": "stocksbrew-agentdata/1.0"}
        if api_key:
            headers["X-OPENFIGI-APIKEY"] = api_key
        for attempt in range(6):
            request = urllib.request.Request(OPENFIGI_URL, data=body, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                return payload if isinstance(payload, list) else [{} for _ in chunk]
            except urllib.error.HTTPError as error:
                if error.code == 429:
                    reset = error.headers.get("ratelimit-reset") or error.headers.get("Retry-After") or "60"
                    try:
                        time.sleep(min(float(reset) + 1, 90))
                    except ValueError:
                        time.sleep(60)
                    continue
                if error.code >= 500:
                    time.sleep(5 * (attempt + 1))
                    continue
                raise
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                time.sleep(5 * (attempt + 1))
        raise RuntimeError("OpenFIGI lookup failed after retries")

    def save(self) -> None:
        _CUSIP_CACHE.parent.mkdir(parents=True, exist_ok=True)
        _CUSIP_CACHE.write_text(json.dumps(self.entries, separators=(",", ":")))
        if self.store is not None and self._dirty:
            docs = [(f"tm_fund_cusip_map/{cusip}", self.entries[cusip]) for cusip in sorted(self._dirty)]
            self.store.set_many(docs)
            self._dirty.clear()


# ---------------------------------------------------------------------------
# Building the documents
# ---------------------------------------------------------------------------


def _round(value: float | None, digits: int = 6) -> float | None:
    return None if value is None else round(value, digits)


def _position(item: dict[str, Any], total: float, cusips: CusipMap) -> dict[str, Any]:
    return {
        "cusip": item["cusip"],
        "ticker": cusips.ticker(item["cusip"]),
        "name": display_name(cusips.name(item["cusip"]) or item.get("issuer") or ""),
        "issuer": item.get("issuer") or "",
        "title_class": item.get("title_class") or "",
        "value": round(item["value"]),
        "weight": _round(item["value"] / total) if total else None,
        "shares": round(item["shares"]) if item.get("shares") else None,
    }


def _change_out(item: dict[str, Any], cusips: CusipMap) -> dict[str, Any]:
    out: dict[str, Any] = {
        "cusip": item["cusip"],
        "ticker": cusips.ticker(item["cusip"]),
        "name": display_name(cusips.name(item["cusip"]) or item.get("issuer") or ""),
        "issuer": item.get("issuer") or "",
    }
    for key in ("value", "prev_value", "shares", "prev_shares", "shares_delta", "delta_value"):
        if item.get(key) is not None:
            out[key] = round(item[key])
    for key in ("weight", "prev_weight"):
        if item.get(key) is not None:
            out[key] = _round(item[key])
    if item.get("shares_delta_pct") is not None:
        out["shares_delta_pct"] = round(item["shares_delta_pct"], 2)
    return out


def _changes_doc(diff: dict[str, Any], cusips: CusipMap) -> dict[str, Any]:
    return {
        "counts": diff["counts"],
        "new": [_change_out(item, cusips) for item in diff["new"][:CHANGE_TOP_N]],
        "added": [_change_out(item, cusips) for item in diff["added"][:CHANGE_TOP_N]],
        "reduced": [_change_out(item, cusips) for item in diff["reduced"][:CHANGE_TOP_N]],
        "sold": [_change_out(item, cusips) for item in diff["sold"][:CHANGE_TOP_N]],
    }


def cusips_needed(periods: list[dict[str, Any]], timeline: list[dict[str, Any]]) -> set[str]:
    """Only what gets shown or priced: the top of every quarter plus the lines in the change lists."""
    needed: set[str] = set()
    for event in timeline:
        needed.update(item["cusip"] for item in event["stocks"])
    recent = {state["period"] for state in periods[-RECENT_QUARTERS:]}
    for state in periods:
        if state["period"] not in recent:
            # Older quarters keep the issuer name from the filing; only the priced top gets a ticker.
            needed.update(item["cusip"] for item in state["stocks"][:PERF_TOP_N])
            continue
        needed.update(item["cusip"] for item in state["stocks"])
        needed.update(item["cusip"] for item in state["options"])
        for key in ("new", "added", "reduced", "sold"):
            needed.update(item["cusip"] for item in (state["diff"] or {}).get(key, []))
    return needed


def event_weights(event: dict[str, Any], cusips: CusipMap) -> dict[str, float]:
    """Ticker -> share of the whole stock book, for the top positions that mapped to a ticker."""
    total = event["total"]
    weights: dict[str, float] = {}
    if total <= 0:
        return weights
    for item in event["stocks"][:PERF_TOP_N]:
        ticker = cusips.ticker(item["cusip"])
        if ticker:
            weights[ticker] = weights.get(ticker, 0.0) + item["value"] / total
    return weights


def build_performance(
    timeline: list[dict[str, Any]],
    cusips: CusipMap,
    book: PriceBook,
    spy: dict[str, Any],
    *,
    today: str,
) -> dict[str, Any] | None:
    events = [{"date": event["date"], "weights": event_weights(event, cusips)} for event in timeline]
    events = [event for event in events if event["weights"]]
    if not events:
        return None

    calendar = book.calendar
    last_filed = timeline[-1]["date"]
    lapsed = (date.fromisoformat(today) - date.fromisoformat(last_filed)).days > INACTIVE_AFTER_DAYS
    end_index = None
    if lapsed:
        # They stopped filing. A follower had nothing new to act on, so the record
        # ends on the day the next filing would have been due.
        due = (date.fromisoformat(shift_months(timeline[-1]["period"], 3)) + timedelta(days=45)).isoformat()
        end_index = _index_on_or_before(calendar, due)
    run = simulate_follow(events, book, end_index=end_index)
    if run is None or len(run["dates"]) < 5:
        return None

    dates, values = run["dates"], run["values"]
    spy_closes = spy["closes"]
    offset = spy["dates"].index(dates[0])
    spy_values = [spy_closes[offset + step] / spy_closes[offset] for step in range(len(dates))]

    fund_stats = performance_stats(dates, values, ended=bool(lapsed))
    spy_stats = performance_stats(dates, spy_values, ended=bool(lapsed))
    coverage = run["coverage"]
    covered = [entry["covered_weight"] for entry in coverage]
    return {
        "label": "What following each filing from the day it was public would have returned",
        "method": (
            "On the first trading day on or after each filing date, hold the disclosed stock positions at their "
            "filing weights until the next filing. Hypothetical: nobody ran this portfolio. No trading costs or "
            "taxes. Adjusted closes, so dividends are included. Options, bonds and positions without a price "
            "series are left out and the rest is scaled up to 100%."
        ),
        "benchmark": "SPY (S&P 500 ETF, dividends included)",
        "start_date": dates[0],
        "end_date": dates[-1],
        "ended": bool(lapsed),
        "sessions": len(dates),
        "filings_followed": len(coverage),
        "fund": {key: _round(value) for key, value in fund_stats.items()},
        "spy": {key: _round(value) for key, value in spy_stats.items()},
        "covered_weight_latest": _round(covered[-1], 4),
        "covered_weight_avg": _round(sum(covered) / len(covered), 4),
        "covered_weight_min": _round(min(covered), 4),
        "priced_positions_latest": coverage[-1]["priced"],
        "curve": downsample(dates, values, spy_values),
        "curve_columns": ["date", "fund", "spy"],
        "price_source": "Yahoo Finance adjusted daily closes",
    }


def build_fund_docs(
    fund: dict[str, Any],
    edgar_names: list[str],
    periods: list[dict[str, Any]],
    cusips: CusipMap,
    performance: dict[str, Any] | None,
    *,
    today: str,
    now_iso: str,
) -> dict[str, Any]:
    """Every document for one fund, keyed by store path. ``periods`` comes from ``compact_periods``."""
    slug = fund["slug"]
    latest = periods[-1]
    latest_period = latest["period"]
    docs: dict[str, dict[str, Any]] = {}
    filings_list: list[dict[str, Any]] = []
    changes_by_period: dict[str, dict[str, Any] | None] = {}

    for state in periods:
        period = state["period"]
        total = state["stock_total"]
        changes = _changes_doc(state["diff"], cusips) if state["diff"] else None
        changes_by_period[period] = changes
        lag = (date.fromisoformat(state["first_filed_at"]) - date.fromisoformat(period)).days
        row = {
            "period": period,
            "quarter": quarter_label(period),
            "filed_at": state["first_filed_at"],
            "latest_filed_at": state["filed_at"],
            "lag_days": lag,
            "form": state["form"],
            "accession": state["accession"],
            "url": state["url"],
            "amended": len(state["documents"]) > 1,
            "documents": state["documents"],
            "stock_value": round(total),
            "stock_positions": state["stock_count"],
            "option_positions": state["option_count"],
            "value_scale_corrected": state["value_scale_corrected"],
        }
        filings_list.append(row)
        docs[f"tm_fund_filings/{slug}__{period}"] = {
            **row,
            "slug": slug,
            "fund": fund["fund"],
            "positions": [_position(item, total, cusips) for item in state["stocks"]],
            "changes": changes,
            "headline": build_headline(fund["fund"], state["first_filed_at"], period, changes),
            "source": "SEC EDGAR form 13F",
            "updated_at": now_iso,
        }

    total = latest["stock_total"]
    has_prior = len(periods) > 1
    portfolio: list[dict[str, Any]] = []
    for item in latest["stocks"]:
        position = _position(item, total, cusips)
        if has_prior:
            detail = latest["status"].get(item["cusip"]) or {}
            position["change"] = detail.get("change", "held")
            if detail.get("shares_delta_pct") is not None:
                position["shares_delta_pct"] = round(detail["shares_delta_pct"], 2)
            if detail.get("prev_weight") is not None:
                position["prev_weight"] = _round(detail["prev_weight"])
        seen = latest["held_since"].get(item["cusip"])
        if seen:
            position["held_since"] = seen
            position["held_since_is_floor"] = seen == periods[0]["period"]
        portfolio.append(position)

    options_total = latest["options_total"]
    options = [
        {
            "cusip": item["cusip"],
            "ticker": cusips.ticker(item["cusip"]),
            "name": display_name(cusips.name(item["cusip"]) or item.get("issuer") or ""),
            "put_call": item.get("put_call"),
            "underlying_value": round(item["value"]),
            "shares": round(item["shares"]) if item.get("shares") else None,
        }
        for item in latest["options"]
    ]

    top10 = latest["top10_value"]
    mapped_shown = sum(1 for item in latest["stocks"] if cusips.ticker(item["cusip"]))
    last_filed = latest["filed_at"]
    days_since = (date.fromisoformat(today) - date.fromisoformat(last_filed)).days
    lags = [row["lag_days"] for row in filings_list if row["lag_days"] >= 0]
    latest_changes = changes_by_period[latest_period]
    headline = build_headline(fund["fund"], latest["first_filed_at"], latest_period, latest_changes)

    profile = {
        "slug": slug,
        "kind": "fund",
        "ciks": fund_ciks(fund),
        "edgar_names": edgar_names,
        "manager": fund["manager"],
        "fund": fund["fund"],
        "style": fund["style"],
        "active": days_since <= INACTIVE_AFTER_DAYS,
        "latest": {
            **filings_list[-1],
            "top10_weight": _round(top10 / total, 4) if total else None,
            "options_underlying_value": round(options_total) if options_total else None,
            "other_positions": latest["other_count"],
        },
        "median_lag_days": int(statistics.median(lags)) if lags else None,
        "first_period": periods[0]["period"],
        "filings": list(reversed(filings_list)),
        "portfolio": portfolio,
        "portfolio_shown": len(portfolio),
        "portfolio_mapped": mapped_shown,
        "options": options,
        "changes": latest_changes,
        "compared_with": periods[-2]["period"] if has_prior else None,
        "headline": headline,
        "performance": performance,
        "source": "SEC EDGAR form 13F",
        "source_url": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={fund_ciks(fund)[-1]:010d}&type=13F-HR&dateb=&owner=include&count=40",
        "updated_at": now_iso,
    }
    docs[f"tm_fund_profiles/{slug}"] = profile

    def perf_card() -> dict[str, Any] | None:
        if not performance:
            return None
        spark = [round(row[1], 4) for row in performance["curve"]]
        spark_spy = [round(row[2], 4) for row in performance["curve"]]
        step = max(1, len(spark) // 60)
        return {
            "start_date": performance["start_date"],
            "end_date": performance["end_date"],
            "ended": performance["ended"],
            "fund": performance["fund"],
            "spy": performance["spy"],
            "covered_weight_latest": performance["covered_weight_latest"],
            "covered_weight_avg": performance["covered_weight_avg"],
            "spark": spark[::step] + ([spark[-1]] if (len(spark) - 1) % step else []),
            "spark_spy": spark_spy[::step] + ([spark_spy[-1]] if (len(spark_spy) - 1) % step else []),
        }

    def brief(items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        return [
            {"ticker": item.get("ticker"), "name": item.get("name"), "shares_delta_pct": item.get("shares_delta_pct"),
             "weight": item.get("weight"), "prev_weight": item.get("prev_weight")}
            for item in (items or [])[:4]
        ]

    docs[f"tm_follow_sources/{slug}"] = {
        "id": slug,
        "slug": slug,
        "kind": "fund",
        "name": fund["fund"],
        "person": fund["manager"],
        "style": fund["style"],
        "active": profile["active"],
        "latest_date": latest["first_filed_at"],
        "latest_period": latest_period,
        "lag_days": filings_list[-1]["lag_days"],
        "headline": headline,
        "stock_value": round(total),
        "stock_positions": latest["stock_count"],
        "top10_weight": profile["latest"]["top10_weight"],
        "top_holdings": [
            {"ticker": item.get("ticker"), "name": item.get("name"), "weight": item.get("weight")} for item in portfolio[:5]
        ],
        "changes": {
            "counts": latest_changes["counts"] if latest_changes else None,
            "new": brief(latest_changes["new"] if latest_changes else None),
            "added": brief(latest_changes["added"] if latest_changes else None),
            "reduced": brief(latest_changes["reduced"] if latest_changes else None),
            "sold": brief(latest_changes["sold"] if latest_changes else None),
        },
        "performance": perf_card(),
        "source": "SEC EDGAR form 13F",
        "source_url": latest["url"],
        "updated_at": now_iso,
    }

    # One event per filing date for the last few quarters: what alerts and the briefing read.
    for row in filings_list[-6:]:
        period = row["period"]
        changes = changes_by_period.get(period)
        docs[f"tm_follow_activity/{slug}__{row['filed_at']}"] = {
            "id": f"{slug}__{row['filed_at']}",
            "source_id": slug,
            "kind": "fund",
            "type": "13f_filing",
            "name": fund["fund"],
            "person": fund["manager"],
            "date": row["filed_at"],
            "period": period,
            "headline": build_headline(fund["fund"], row["filed_at"], period, changes),
            "counts": changes["counts"] if changes else None,
            "items": (
                [{"action": "new", **entry} for entry in brief(changes["new"])]
                + [{"action": "added", **entry} for entry in brief(changes["added"])]
                + [{"action": "reduced", **entry} for entry in brief(changes["reduced"])]
                + [{"action": "sold", **entry} for entry in brief(changes["sold"])]
                if changes
                else []
            ),
            "url": row["url"],
            "source": "SEC EDGAR form 13F",
            "updated_at": now_iso,
        }
    return docs


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------


def verify_ciks() -> int:
    bad = 0
    for fund in FUNDS:
        for cik in fund_ciks(fund):
            name, filings = list_13f_filings(cik, "2000-01-01")
            latest = filings[-1]["filed_at"] if filings else "none"
            flag = "" if filings else "  <-- no 13F filings"
            bad += 0 if filings else 1
            print(f"{fund['slug']:28} {cik:>8}  {name[:46]:46} 13F filings={len(filings):3} latest={latest}{flag}")
    return 1 if bad else 0


def collect_fund(fund: dict[str, Any], since: str) -> dict[str, Any]:
    names: list[str] = []
    metas: list[dict[str, Any]] = []
    for cik in fund_ciks(fund):
        name, found = list_13f_filings(cik, cik_since(fund, cik, since))
        names.append(name)
        metas.extend(found)
    loaded: list[dict[str, Any]] = []
    for meta in metas:
        filing = load_filing(meta)
        if filing is None:
            continue
        loaded.append(filing)
    by_period, timeline = build_periods(loaded)
    corrected = sum(1 for item in loaded if item.get("value_scale_corrected"))
    return {
        "fund": fund,
        "names": names,
        "filing_count": len(loaded),
        "value_scale_corrected": corrected,
        "periods": compact_periods(by_period),
        "timeline": timeline,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest 13F filings and build the follow-the-filing record.")
    parser.add_argument("--funds", default="", help="comma separated slugs; default is every fund")
    parser.add_argument("--since", default=DEFAULT_SINCE, help="first quarter-end to read (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true", help="do everything except write to the store")
    parser.add_argument("--skip-prices", action="store_true", help="no price fetch and no performance")
    parser.add_argument("--verify", action="store_true", help="print the EDGAR name behind every CIK and exit")
    args = parser.parse_args(argv)

    if args.verify:
        return verify_ciks()

    wanted = {slug.strip() for slug in args.funds.split(",") if slug.strip()}
    funds = [fund for fund in FUNDS if not wanted or fund["slug"] in wanted]
    if wanted - {fund["slug"] for fund in funds}:
        log(f"unknown slugs: {sorted(wanted - {fund['slug'] for fund in funds})}")
        return 2

    store = DocStore.from_env()
    writer = None if args.dry_run else store
    log(f"store: {store.mode}{' (dry run, no writes)' if args.dry_run else ''}; {len(funds)} funds since {args.since}")
    now_iso = datetime.now(timezone.utc).isoformat()
    today = now_iso[:10]

    collected: list[dict[str, Any]] = []
    failures: list[str] = []
    for index, fund in enumerate(funds, start=1):
        try:
            result = collect_fund(fund, args.since)
        except Exception as error:  # one bad filer should not sink the run
            failures.append(f"{fund['slug']}: {error}")
            log(f"{index}/{len(funds)} {fund['slug']}: FAILED {error}")
            continue
        if not result["periods"]:
            failures.append(f"{fund['slug']}: no readable 13F filings")
            log(f"{index}/{len(funds)} {fund['slug']}: no readable filings")
            continue
        latest = result["periods"][-1]
        log(
            f"{index}/{len(funds)} {fund['slug']}: {result['filing_count']} filings, {len(result['periods'])} quarters, "
            f"latest {latest['period']} with {latest['stock_count']} stocks"
        )
        collected.append(result)

    cusips = CusipMap(writer)
    needed: set[str] = set()
    for result in collected:
        needed |= cusips_needed(result["periods"], result["timeline"])
    cusips.resolve(needed)
    mapped = sum(1 for cusip in needed if cusips.ticker(cusip))
    log(f"cusip map: {mapped}/{len(needed)} needed CUSIPs have a ticker")

    book: PriceBook | None = None
    spy: dict[str, Any] | None = None
    if not args.skip_prices:
        tickers: set[str] = set()
        for result in collected:
            for event in result["timeline"]:
                tickers.update(event_weights(event, cusips))
        log(f"prices: {len(tickers)} tickers plus SPY")
        # Not written to tm_price_history_daily: that collection holds 12-year series other jobs rely on.
        series = prices.load_many(["SPY"] + sorted(tickers), years=PRICE_YEARS, store=None)
        spy = series.get("SPY")
        if spy is None:
            log("prices: SPY is missing, so no performance this run")
        else:
            first = min(event["date"] for result in collected for event in result["timeline"])
            start = _index_on_or_after(spy["dates"], first) or 0
            book = PriceBook(spy["dates"][max(0, start - 1) :], series)

    totals = {"funds": 0, "filings": 0, "quarters": 0, "docs": 0, "with_performance": 0,
              "positions_shown": 0, "positions_mapped": 0, "value_scale_corrected": 0}
    pending: list[tuple[str, dict[str, Any]]] = []
    for result in collected:
        fund = result["fund"]
        performance = None
        if book is not None and spy is not None:
            try:
                performance = build_performance(result["timeline"], cusips, book, spy, today=today)
            except Exception as error:
                failures.append(f"{fund['slug']} performance: {error}")
        docs = build_fund_docs(
            fund, result["names"], result["periods"], cusips, performance, today=today, now_iso=now_iso
        )
        profile = docs[f"tm_fund_profiles/{fund['slug']}"]
        totals["funds"] += 1
        totals["filings"] += result["filing_count"]
        totals["quarters"] += len(result["periods"])
        totals["with_performance"] += 1 if performance else 0
        totals["positions_shown"] += profile["portfolio_shown"]
        totals["positions_mapped"] += profile["portfolio_mapped"]
        totals["value_scale_corrected"] += result["value_scale_corrected"]
        totals["docs"] += len(docs)
        pending.extend(docs.items())
        perf = performance["fund"]["r_since"] if performance else None
        log(
            f"built {fund['slug']}: {profile['latest']['quarter']} filed {profile['latest']['filed_at']}, "
            f"{profile['portfolio_mapped']}/{profile['portfolio_shown']} shown positions mapped, "
            f"since-first {'n/a' if perf is None else f'{perf * 100:.1f}%'}"
        )

    totals["cusips_needed"] = len(needed)
    totals["cusips_mapped"] = mapped
    totals["cusips_unmapped"] = len(needed) - mapped
    meta = {
        **totals,
        "since_period": args.since,
        "failures": failures,
        "generated_at": now_iso,
        "source": "SEC EDGAR form 13F; tickers from OpenFIGI; prices from Yahoo Finance",
    }
    if writer is not None:
        written = writer.set_many(pending)
        if not wanted:
            writer.set("tm_follow_meta/funds", meta)
        log(f"wrote {written} documents")
    else:
        log(f"dry run: {len(pending)} documents not written")
    log(json.dumps(meta, indent=2))
    return 0 if collected else 1


if __name__ == "__main__":
    sys.exit(main())
