"""Insider buying and selling from SEC Form 4, for the US stocks we cover.

Run it::

    python3 -m backend.agentdata.insiders_form4                 # last 60 days, write to the store
    python3 -m backend.agentdata.insiders_form4 --days 30 --symbols AAPL,NVDA --dry-run

A Form 4 is what an officer, director or 10% owner files within two business
days of trading their own company's stock. This job keeps only open-market
trades: code P (bought) and code S (sold). Grants, option exercises, tax
withholding and gifts are left out because nobody chose a price for them, and
so are code P purchases an issuer plan made on the insider's behalf (an
employee stock purchase plan, a dividend reinvestment plan): TSMC files every
monthly ESPP purchase for ~30 officers as code P.

Prices are per share of the security the filing reports. Foreign issuers
(TSMC since the 2026 rule change) report their home-market shares, which are
not the US-listed ADR: one TSM ADR is five Taiwan shares. Such a line keeps its
dollar value but is marked ``price_comparable: False`` so nobody reads its
price against the ADR's. A line whose price is wildly off the stock's own
52-week range and is not a foreign line is dropped as a mapping error.

A rerun overwrites what it produces and deletes the documents of filings it
re-read that no longer qualify, so a rule change repairs the window it covers.

Collections (all additive):

* ``tm_insider_trades/{accession}__{owner cik}__{P|S}``  one insider's buys or sells in one filing
* ``tm_insider_meta/clusters``   cluster buys: three or more insiders buying one stock within 30 days
* ``tm_insider_meta/by_symbol``  per-stock totals for the window
* ``tm_insider_meta/run``        counts and the time of the run

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from .feeds_common import SEC_USER_AGENT, Fetcher, load_universe, symbol_key
from .store import DocStore

DEFAULT_DAYS = 60
CLUSTER_WINDOW_DAYS = 30
CLUSTER_MIN_INSIDERS = 3
OPEN_MARKET_CODES = {"P": "buy", "S": "sell"}
# Purchases an issuer plan made for the insider at terms the issuer set. Matched
# against the ownership nature and the footnotes the transaction points at.
_ISSUER_PLAN = re.compile(
    r"employee stock purchase|\bESPP\b|dividend reinvestment|\bDRIP\b|employee stock ownership|\bESOP\b|"
    r"\b401\s*\(?k\)?|terms predetermined by the issuer",
    re.I,
)
_DEPOSITARY = re.compile(r"american depositary|depositary (share|receipt)|\bADSs?\b|\bADRs?\b", re.I)
_ORDINARY = re.compile(r"\bordinary shares?\b", re.I)
# A price this far outside the stock's own 52-week range is not a price of the listed share.
PRICE_RANGE_SLACK = 2.0
SOURCE = "SEC EDGAR form 4"
_EASTERN = ZoneInfo("America/New_York")


def log(message: str) -> None:
    print(f"[form4] {message}", flush=True)


# ---------------------------------------------------------------------------
# Pure helpers (covered by backend/tests/test_agentdata_follow.py)
# ---------------------------------------------------------------------------


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child(element: ET.Element | None, name: str) -> ET.Element | None:
    if element is None:
        return None
    for child in element:
        if _local(child.tag) == name:
            return child
    return None


def _text(element: ET.Element | None, *path: str) -> str:
    """Text at a child path. Form 4 wraps most values in a <value> element."""
    current = element
    for name in path:
        current = _child(current, name)
        if current is None:
            return ""
    value = _child(current, "value")
    target = value if value is not None else current
    return (target.text or "").strip() if target is not None else ""


def _number(text: str) -> float | None:
    cleaned = (text or "").replace(",", "").replace("$", "").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _flag(text: str) -> bool:
    return (text or "").strip().lower() in ("1", "true", "y", "yes")


def _footnote_refs(element: ET.Element, skip: tuple[str, ...] = ("postTransactionAmounts", "securityTitle")) -> list[str]:
    """Footnote ids a transaction points at, except on the holdings after it and its title.

    A footnote on the shares held afterwards ("includes 120 shares bought in the
    ESPP") says nothing about how this trade was made.
    """
    out: list[str] = []
    for child in element:
        name = _local(child.tag)
        if name in skip:
            continue
        if name == "footnoteId":
            ident = child.get("id")
            if ident:
                out.append(ident)
            continue
        out.extend(_footnote_refs(child, skip))
    return out


def is_issuer_plan(nature: str, notes: Iterable[str]) -> bool:
    """Whether an issuer plan (ESPP, dividend reinvestment, 401(k), ESOP) made this purchase."""
    return any(_ISSUER_PLAN.search(text or "") for text in (nature, *notes))


def is_foreign_line(security: str, foreign_symbol: str) -> bool:
    """A foreign issuer's home-market share rather than its US depositary share."""
    if not foreign_symbol:
        return False
    title = security or ""
    if _DEPOSITARY.search(title):
        return False
    return True


def insider_role(relationship: dict[str, Any]) -> str:
    """A short, readable role: the officer title when there is one."""
    title = tidy_title(relationship.get("officer_title") or "")
    parts: list[str] = []
    if relationship.get("is_officer"):
        parts.append(title or "Officer")
    if relationship.get("is_director"):
        parts.append("Director")
    if relationship.get("is_ten_percent_owner"):
        parts.append("10% owner")
    if not parts:
        other = tidy_title(relationship.get("other_text") or "")
        parts.append(other or title or "Insider")
    return ", ".join(parts)


_TITLE_ACRONYMS = {
    "CEO", "CFO", "COO", "CTO", "CIO", "CMO", "CAO", "CLO", "CHRO", "CRO", "CSO",
    "EVP", "SVP", "VP", "GC", "US", "USA", "IT", "HR", "II", "III",
}
_TITLE_SMALL = {"and", "of", "the", "for", "in", "to", "at"}


def tidy_title(raw: str) -> str:
    """"CHIEF GROWTH OFFICER" -> "Chief Growth Officer"; mixed-case titles stay as filed."""
    title = " ".join(str(raw or "").split())
    if not title or title != title.upper() or len(title) <= 4:
        return title
    words = []
    for index, word in enumerate(title.split(" ")):
        bare = word.strip(",.;()")
        if bare in _TITLE_ACRONYMS or "&" in bare:
            words.append(word)
        elif index > 0 and bare.lower() in _TITLE_SMALL:
            words.append(word.lower())
        else:
            words.append("-".join(part.capitalize() for part in word.split("-")))
    return " ".join(words)


_FIRM_WORDS = re.compile(
    r"\b(LLC|L\.L\.C\.|LP|L\.P\.|LLP|INC|CORP|CORPORATION|COMPANY|LTD|LIMITED|TRUST|FUND|FUNDS|PARTNERS|CAPITAL|"
    r"HOLDINGS|GROUP|CO|N\.A\.|PLC|FOUNDATION|MANAGEMENT|ADVISORS|ADVISERS|ASSOCIATES|BANK|INSURANCE|VENTURES|"
    r"INVESTMENTS|INVESTORS|EQUITY|ASSET|ASSETS|S\.A\.|AG|SE|NV|GMBH|HATHAWAY|ENTERPRISES|INTERNATIONAL|FINANCIAL|"
    r"SECURITIES|ESTATE|FAMILY)\b\.?",
    re.I,
)


def tidy_name(raw: str) -> str:
    """EDGAR files people last name first: "COOK TIMOTHY D" or "Gusek Ron". Show "Timothy D. Cook"; leave firms alone."""
    name = " ".join(str(raw or "").split())
    if not name:
        return ""
    shouting = name == name.upper()
    if _FIRM_WORDS.search(name):
        return name.title().replace("Llc", "LLC").replace("Lp", "LP").replace("Llp", "LLP") if shouting else name
    words = name.split(" ")
    if len(words) < 2:
        return name.title() if shouting else name
    suffixes = {"JR", "JR.", "SR", "SR.", "II", "III", "IV"}
    suffix = ""
    if words[-1].upper() in suffixes and len(words) > 2:
        suffix = words.pop().upper()
    last, rest = words[0], words[1:]

    def cap(word: str) -> str:
        if len(word.rstrip(".")) == 1:
            return f"{word.rstrip('.').upper()}."
        if not shouting:
            return word
        if word.startswith("MC") and len(word) > 2:
            return "Mc" + word[2:].capitalize()
        return "-".join(part.capitalize() for part in word.split("-"))

    out = " ".join(cap(word) for word in rest) + " " + cap(last).rstrip(".")
    if suffix:
        out += " " + (suffix if suffix in {"II", "III", "IV"} else suffix.rstrip(".").capitalize() + ".")
    return out


def parse_form4(xml_text: str) -> dict[str, Any] | None:
    """Issuer, owners and every non-derivative transaction of one Form 4. None if it is not one."""
    try:
        root = ET.fromstring(xml_text.encode("utf-8") if isinstance(xml_text, str) else xml_text)
    except ET.ParseError:
        start = xml_text.find("<ownershipDocument")
        end = xml_text.find("</ownershipDocument>")
        if start < 0 or end < 0:
            return None
        try:
            root = ET.fromstring(xml_text[start : end + len("</ownershipDocument>")])
        except ET.ParseError:
            return None
    if _local(root.tag) != "ownershipDocument":
        return None

    issuer = _child(root, "issuer")
    owners: list[dict[str, Any]] = []
    for element in root:
        if _local(element.tag) != "reportingOwner":
            continue
        relationship = _child(element, "reportingOwnerRelationship")
        details = {
            "is_director": _flag(_text(relationship, "isDirector")),
            "is_officer": _flag(_text(relationship, "isOfficer")),
            "is_ten_percent_owner": _flag(_text(relationship, "isTenPercentOwner")),
            "is_other": _flag(_text(relationship, "isOther")),
            "officer_title": _text(relationship, "officerTitle"),
            "other_text": _text(relationship, "otherText"),
        }
        owners.append(
            {
                "cik": _text(element, "reportingOwnerId", "rptOwnerCik").lstrip("0"),
                "name": tidy_name(_text(element, "reportingOwnerId", "rptOwnerName")),
                "role": insider_role(details),
                **details,
            }
        )

    footnotes: dict[str, str] = {}
    for element in _child(root, "footnotes") if _child(root, "footnotes") is not None else []:
        if _local(element.tag) == "footnote" and element.get("id"):
            footnotes[element.get("id")] = " ".join("".join(element.itertext()).split())

    transactions: list[dict[str, Any]] = []
    table = _child(root, "nonDerivativeTable")
    for element in table if table is not None else []:
        if _local(element.tag) != "nonDerivativeTransaction":
            continue
        code = _text(element, "transactionCoding", "transactionCode").upper()
        shares = _number(_text(element, "transactionAmounts", "transactionShares"))
        if not code or shares is None or shares <= 0:
            continue
        price = _number(_text(element, "transactionAmounts", "transactionPricePerShare"))
        nature = _text(element, "ownershipNature", "natureOfOwnership")
        notes = [footnotes[ident] for ident in _footnote_refs(element) if ident in footnotes]
        transactions.append(
            {
                "code": code,
                "date": _text(element, "transactionDate")[:10],
                "security": _text(element, "securityTitle"),
                "shares": shares,
                "price": price if price and price > 0 else None,
                "acquired": _text(element, "transactionAmounts", "transactionAcquiredDisposedCode").upper() == "A",
                "shares_after": _number(_text(element, "postTransactionAmounts", "sharesOwnedFollowingTransaction")),
                "ownership": "indirect"
                if _text(element, "ownershipNature", "directOrIndirectOwnership").upper() == "I"
                else "direct",
                "issuer_plan": is_issuer_plan(nature, notes),
            }
        )

    return {
        "document_type": _text(root, "documentType"),
        "period": _text(root, "periodOfReport")[:10],
        "plan_10b5_1": _flag(_text(root, "aff10b5One")),
        "issuer_cik": _text(issuer, "issuerCik").lstrip("0"),
        "issuer_name": _text(issuer, "issuerName"),
        "issuer_symbol": _text(issuer, "issuerTradingSymbol").upper(),
        "issuer_foreign_symbol": _text(issuer, "issuerForeignTradingSymbol").upper(),
        "owners": owners,
        "transactions": transactions,
    }


def summarize_open_market(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    """One line per side (bought, sold) for a filing: shares, average price, dollar value.

    A filing often lists the same sale as a dozen fills. Those are added up and
    the price is the share-weighted average of the fills that state a price.
    Fills an issuer plan made (an ESPP purchase) are not open-market trades.
    Fills of a foreign issuer's home-market shares and of its ADRs are priced
    in different units, so each gets its own line (foreign shares first; the
    ADR line keeps the code-only id).
    """
    out: list[dict[str, Any]] = []
    foreign_symbol = parsed.get("issuer_foreign_symbol") or ""
    for code, side in OPEN_MARKET_CODES.items():
        fills = [item for item in parsed["transactions"] if item["code"] == code]
        # A "purchase" that disposes of shares (or the reverse) is a filer error; skip it.
        fills = [item for item in fills if item["acquired"] == (code == "P")]
        # An issuer plan buying for the insider is not their choice; selling plan shares is.
        if code == "P":
            fills = [item for item in fills if not item.get("issuer_plan")]
        if not fills:
            continue
        foreign = [item for item in fills if is_foreign_line(item.get("security") or "", foreign_symbol)]
        listed = [item for item in fills if not is_foreign_line(item.get("security") or "", foreign_symbol)]
        for group, is_foreign in ((listed, False), (foreign, True)):
            if group:
                out.append(_line(code, side, group, foreign=is_foreign, split=bool(foreign and listed)))
    return out


def _line(code: str, side: str, fills: list[dict[str, Any]], *, foreign: bool, split: bool) -> dict[str, Any]:
    """The summed line for one side's fills in one security."""
    shares = sum(item["shares"] for item in fills)
    priced = [item for item in fills if item["price"] is not None]
    priced_shares = sum(item["shares"] for item in priced)
    value = sum(item["shares"] * item["price"] for item in priced) if priced else None
    price = value / priced_shares if value is not None and priced_shares > 0 else None
    if value is not None and priced_shares < shares and price is not None:
        value = price * shares  # a fill without a price is valued at the average of the rest
    dates = sorted(item["date"] for item in fills if item["date"])
    last = max(fills, key=lambda item: (item["date"], -(item["shares_after"] or 0) if code == "S" else (item["shares_after"] or 0)))
    return {
        "code": code,
        # When one filing has both an ADR line and a home-market line, the home-market one gets an "F" id suffix.
        "id_suffix": f"{code}F" if foreign and split else code,
        "security": fills[0].get("security") or "",
        "foreign_line": foreign,
        "tx_type": side,
        "shares": round(shares, 4),
        "price": round(price, 4) if price is not None else None,
        "value": round(value, 2) if value is not None else None,
        "fills": len(fills),
        "transaction_date": dates[-1] if dates else "",
        "first_transaction_date": dates[0] if dates else "",
        "shares_after": last["shares_after"],
        "ownership": "indirect" if all(item["ownership"] == "indirect" for item in fills) else "direct",
    }


def detect_clusters(
    trades: Iterable[dict[str, Any]],
    *,
    window_days: int = CLUSTER_WINDOW_DAYS,
    min_insiders: int = CLUSTER_MIN_INSIDERS,
) -> list[dict[str, Any]]:
    """Stocks where ``min_insiders`` or more different insiders bought within ``window_days``.

    For each stock the window that holds the most distinct buyers wins (ties go
    to the most recent). One cluster per stock, newest first.
    """
    by_symbol: dict[str, list[dict[str, Any]]] = {}
    for trade in trades:
        if trade.get("tx_type") != "buy" or not trade.get("symbol") or not trade.get("transaction_date"):
            continue
        by_symbol.setdefault(trade["symbol"], []).append(trade)

    clusters: list[dict[str, Any]] = []
    for symbol, buys in by_symbol.items():
        buys.sort(key=lambda item: item["transaction_date"])
        best: list[dict[str, Any]] = []
        best_people = 0
        for start, first in enumerate(buys):
            limit = (date.fromisoformat(first["transaction_date"]) + timedelta(days=window_days)).isoformat()
            window = [item for item in buys[start:] if item["transaction_date"] <= limit]
            people = len({item.get("insider_id") or item.get("insider") for item in window})
            if people >= best_people:
                best, best_people = window, people
        if best_people < min_insiders:
            continue
        people: dict[str, dict[str, Any]] = {}
        for item in best:
            key = str(item.get("insider_id") or item.get("insider"))
            entry = people.setdefault(key, {"insider": item.get("insider"), "role": item.get("role"), "value": 0.0, "shares": 0.0, "priced": False})
            entry["shares"] += float(item.get("shares") or 0)
            if item.get("value") is not None:
                entry["value"] += float(item["value"])
                entry["priced"] = True
        members = sorted(people.values(), key=lambda entry: -entry["value"])
        for entry in members:
            entry["value"] = round(entry["value"], 2) if entry.pop("priced") else None
            entry["shares"] = round(entry["shares"], 4)
        values = [entry["value"] for entry in members if entry["value"] is not None]
        clusters.append(
            {
                "symbol": symbol,
                "company": best[-1].get("company") or "",
                "insiders": best_people,
                "filings": len(best),
                "first_date": best[0]["transaction_date"],
                "last_date": best[-1]["transaction_date"],
                "last_filed_at": max(str(item.get("filed_at") or "") for item in best),
                "total_value": round(sum(values), 2) if values else None,
                "total_shares": round(sum(float(item.get("shares") or 0) for item in best), 4),
                "members": members[:8],
                "trade_ids": [item["id"] for item in best if item.get("id")][:40],
                "window_days": window_days,
            }
        )
    clusters.sort(key=lambda item: (item["last_date"], item["insiders"]), reverse=True)
    return clusters


def symbol_totals(trades: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Per stock: how many insiders bought and sold in the window, and how much."""
    out: dict[str, dict[str, Any]] = {}
    people: dict[tuple[str, str], set[str]] = {}
    for trade in trades:
        symbol, side = trade.get("symbol"), trade.get("tx_type")
        if not symbol or side not in ("buy", "sell"):
            continue
        entry = out.setdefault(symbol, {"symbol": symbol, "buy_value": 0.0, "sell_value": 0.0, "buys": 0, "sells": 0, "last_filed_at": ""})
        entry[f"{side}s"] += 1
        entry[f"{side}_value"] += float(trade.get("value") or 0)
        entry["last_filed_at"] = max(entry["last_filed_at"], str(trade.get("filed_at") or ""))
        people.setdefault((symbol, side), set()).add(str(trade.get("insider_id") or trade.get("insider")))
    for symbol, entry in out.items():
        entry["buyers"] = len(people.get((symbol, "buy"), ()))
        entry["sellers"] = len(people.get((symbol, "sell"), ()))
        entry["buy_value"] = round(entry["buy_value"], 2)
        entry["sell_value"] = round(entry["sell_value"], 2)
    return out


def acceptance_iso(raw: str) -> str:
    """EDGAR's acceptance time (UTC in the submissions feed) as US Eastern wall time.

    Stored as a plain local timestamp with the zone named next to it, because
    Eastern is how filing times are read: "after the close" means after 4 PM there.
    """
    match = re.match(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})", raw or "")
    if not match:
        return ""
    stamp = datetime.fromisoformat(f"{match.group(1)}T{match.group(2)}").replace(tzinfo=timezone.utc)
    return stamp.astimezone(_EASTERN).strftime("%Y-%m-%dT%H:%M:%S")


def trade_doc_id(accession: str, owner_cik: str, suffix: str) -> str:
    return f"{accession}__{owner_cik or 'x'}__{suffix}"


def possible_doc_ids(parsed: dict[str, Any], accession: str) -> set[str]:
    """Every trade document id a filing could produce, whatever the rules decide today."""
    if not parsed.get("owners"):
        return set()
    owner_cik = parsed["owners"][0]["cik"]
    return {trade_doc_id(accession, owner_cik, suffix) for suffix in ("P", "S", "PF", "SF")}


def price_is_off(price: float | None, week_low: float | None, week_high: float | None, *, slack: float = PRICE_RANGE_SLACK) -> bool:
    """Whether a per-share price cannot be a price of the listed share: far outside its 52-week range."""
    if price is None or price <= 0 or not week_low or not week_high or week_low <= 0 or week_high < week_low:
        return False
    return price < week_low / slack or price > week_high * slack


def check_prices(
    docs: list[tuple[str, dict[str, Any]]],
    ranges: dict[str, tuple[float, float]],
) -> tuple[list[tuple[str, dict[str, Any]]], list[tuple[str, dict[str, Any]]]]:
    """(kept, dropped). A foreign line stays with ``price_comparable`` False; any other line far off the range is dropped."""
    kept: list[tuple[str, dict[str, Any]]] = []
    dropped: list[tuple[str, dict[str, Any]]] = []
    for path, data in docs:
        span = ranges.get(str(data.get("symbol") or ""))
        off = bool(span) and price_is_off(data.get("price"), span[0], span[1])
        if off and _ORDINARY.search(str(data.get("security") or "")):
            # A US-listed ADR whose filing reports the ordinary shares behind it (VNET: six to an ADS) and names no home ticker.
            data = {**data, "foreign_line": True}
        if data.get("foreign_line"):
            # Home-market shares are priced per local share; with no range to check, assume they do not compare.
            data = {**data, "price_comparable": bool(span) and not off}
        elif off:
            dropped.append((path, data))
            continue
        else:
            data = {**data, "price_comparable": True}
        kept.append((path, data))
    return kept, dropped


def build_trade_docs(
    parsed: dict[str, Any],
    *,
    symbol: str,
    company: str,
    accession: str,
    filing_date: str,
    accepted_at: str,
    url: str,
    captured_at: str,
) -> list[tuple[str, dict[str, Any]]]:
    lines = summarize_open_market(parsed)
    if not lines or not parsed["owners"]:
        return []
    owner = parsed["owners"][0]
    others = [item["name"] for item in parsed["owners"][1:] if item["name"]]
    docs: list[tuple[str, dict[str, Any]]] = []
    for line in lines:
        line = dict(line)
        doc_id = trade_doc_id(accession, owner["cik"], line.pop("id_suffix", line["code"]))
        lag = None
        if line["transaction_date"] and filing_date:
            lag = (date.fromisoformat(filing_date) - date.fromisoformat(line["transaction_date"])).days
        docs.append(
            (
                f"tm_insider_trades/{doc_id}",
                {
                    "id": doc_id,
                    "symbol": symbol,
                    "company": company or parsed["issuer_name"],
                    "issuer_cik": parsed["issuer_cik"],
                    "insider": owner["name"],
                    "insider_id": owner["cik"],
                    "role": owner["role"],
                    "is_officer": owner["is_officer"],
                    "is_director": owner["is_director"],
                    "is_ten_percent_owner": owner["is_ten_percent_owner"],
                    "joint_filers": others,
                    **line,
                    "plan_10b5_1": parsed["plan_10b5_1"],
                    "amended": parsed["document_type"].endswith("/A"),
                    "filing_date": filing_date,
                    "filed_at": accepted_at or filing_date,
                    "filed_at_zone": "America/New_York" if accepted_at else "",
                    "lag_days": lag,
                    "accession": accession,
                    "url": url,
                    "source": SOURCE,
                    "captured_at": captured_at,
                },
            )
        )
    return docs


# ---------------------------------------------------------------------------
# SEC EDGAR
# ---------------------------------------------------------------------------


def patient_get(fetcher: Fetcher, url: str, *, tries: int = 4, wait: float = 150.0) -> str | None:
    """``fetcher.get`` that waits out EDGAR's rate limiter instead of skipping the filing.

    The shared fetcher gives up after about a minute. A tripped limiter blocks
    an address for roughly ten minutes, so a skipped request here would quietly
    drop real trades.
    """
    for attempt in range(tries):
        before = len(fetcher.failures)
        body = fetcher.get(url)
        if body is not None:
            return body
        blocked = len(fetcher.failures) > before and any(code in fetcher.failures[-1] for code in ("http 429", "http 403"))
        if not blocked:
            return None  # a real 404
        fetcher.failures.pop()
        log(f"SEC asked us to slow down; waiting {int(wait * (attempt + 1))}s")
        time.sleep(wait * (attempt + 1))
    fetcher.failures.append(f"{url} (rate limited)")
    return None


def load_cik_map(fetcher: Fetcher) -> dict[str, int]:
    """Ticker (letters and digits only) -> CIK, from the SEC's own ticker file."""
    payload = fetcher.get_json("https://www.sec.gov/files/company_tickers.json", ttl=7 * 86400) or {}
    out: dict[str, int] = {}
    for row in payload.values():
        ticker = symbol_key(str(row.get("ticker") or ""))
        if ticker and ticker not in out:
            out[ticker] = int(row["cik_str"])
    return out


def recent_form4(submissions: dict[str, Any], since: str) -> list[dict[str, str]]:
    """Form 4 and 4/A filings on or after ``since`` from a submissions document."""
    recent = (submissions.get("filings") or {}).get("recent") or {}
    out: list[dict[str, str]] = []
    for form, accession, filed, accepted, primary in zip(
        recent.get("form") or [],
        recent.get("accessionNumber") or [],
        recent.get("filingDate") or [],
        recent.get("acceptanceDateTime") or [],
        recent.get("primaryDocument") or [],
    ):
        if form not in ("4", "4/A") or not filed or filed < since:
            continue
        out.append(
            {
                "form": form,
                "accession": accession,
                "filing_date": filed,
                "accepted_at": acceptance_iso(accepted),
                # The listed document is the styled view (xslF345X05/name.xml); the raw XML sits beside it.
                "xml_name": str(primary or "").rsplit("/", 1)[-1],
            }
        )
    return out


def _batch_get(store: DocStore, paths: list[str], select: list[str] | None = None) -> dict[str, dict[str, Any]]:
    """Batch read by path; over HTTP only the selected fields come back (a latest-price document is ~140 KB)."""
    if store.mode != "http" or not select:
        return store.get_many(paths)
    out: dict[str, dict[str, Any]] = {}
    for start in range(0, len(paths), 200):
        payload = store._request("POST", "/documents:batchGet", {"paths": paths[start : start + 200], "select": select}) or {}
        for document in payload.get("documents", []):
            if isinstance(document, dict) and isinstance(document.get("data"), dict):
                out[document["path"]] = document["data"]
    return out


def instrument_id(symbol: str) -> str:
    """BRK.B -> US_BRK_B, the id ``tm_latest_prices`` uses."""
    return "US_" + re.sub(r"[^A-Z0-9]", "_", symbol.upper())


def load_week_ranges(store: DocStore, symbols: Iterable[str]) -> dict[str, tuple[float, float]]:
    """symbol -> (52-week low, 52-week high) from ``tm_latest_prices``, where we hold one."""
    wanted = sorted({symbol for symbol in symbols if symbol})
    paths = {f"tm_latest_prices/{instrument_id(symbol)}": symbol for symbol in wanted}
    out: dict[str, tuple[float, float]] = {}
    for path, data in _batch_get(store, list(paths), select=["fundamentals"]).items():
        fundamentals = data.get("fundamentals") or {}
        low, high = fundamentals.get("week_52_low"), fundamentals.get("week_52_high")
        if isinstance(low, (int, float)) and isinstance(high, (int, float)) and 0 < low <= high:
            out[paths[path]] = (float(low), float(high))
    return out


def stale_paths(reread: set[str], produced: set[str], dropped: list[tuple[str, dict[str, Any]]]) -> list[str]:
    """Stored trade documents of re-read filings that the rules no longer produce, to remove.

    A line dropped only for its price is kept as stored: after a stock split an earlier,
    correctly stored trade looks far off the split-adjusted range, and deleting it would
    lose a real trade. The app hides an unchecked row priced off the range on its own.
    """
    return sorted(reread - produced - {path for path, _ in dropped})


def delete_docs(store: DocStore, paths: list[str]) -> int:
    """Delete documents by path. Only ever called with trade ids of filings this run re-read."""
    if not paths:
        return 0
    for path in paths:
        _check_trade_path(path)
    if store.mode != "http":
        writes = store._db.batch()
        for path in paths:
            writes.delete(store._db.document(path))
        writes.commit()
        return len(paths)
    for start in range(0, len(paths), 200):
        store._request("POST", "/documents:batchWrite", {"operations": [{"op": "delete", "path": path} for path in paths[start : start + 200]]})
    return len(paths)


def _check_trade_path(path: str) -> None:
    if not re.fullmatch(r"tm_insider_trades/[0-9-]+__[0-9x]+__[PS]F?", path):
        raise ValueError(f"refusing to delete {path}: not a Form 4 trade document")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest open-market insider trades from SEC Form 4.")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS, help="how far back to read filings")
    parser.add_argument("--symbols", default="", help="comma separated tickers; default is every US stock we cover")
    parser.add_argument("--dry-run", action="store_true", help="do everything except write to the store")
    parser.add_argument("--interval", type=float, default=0.3, help="seconds between SEC requests")
    args = parser.parse_args(argv)

    store = DocStore.from_env()
    now = datetime.now(timezone.utc)
    captured_at = now.isoformat()
    since = (now.date() - timedelta(days=args.days)).isoformat()
    listing = Fetcher("form4_index", user_agent=SEC_USER_AGENT, min_interval=args.interval, ttl=6 * 3600, timeout=60)
    filings = Fetcher("form4", user_agent=SEC_USER_AGENT, min_interval=args.interval, ttl=None, timeout=60)

    wanted = {symbol_key(item) for item in args.symbols.split(",") if item.strip()}
    universe = [item for item in load_universe(store) if not wanted or symbol_key(item.ticker) in wanted]
    ciks = load_cik_map(listing)
    log(f"store: {store.mode}{' (dry run)' if args.dry_run else ''}; {len(universe)} stocks, filings since {since}")

    docs: list[tuple[str, dict[str, Any]]] = []
    # Ids of filings this run read in full: any of them it no longer produces is stale.
    reread: set[str] = set()
    no_cik: list[str] = []
    seen_filings = 0
    seen_accessions: set[str] = set()
    for index, instrument in enumerate(universe, start=1):
        cik = ciks.get(symbol_key(instrument.ticker))
        if cik is None:
            no_cik.append(instrument.ticker)
            continue
        raw = patient_get(listing, f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
        try:
            submissions = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            submissions = None
        if not submissions:
            continue
        for filing in recent_form4(submissions, since):
            if filing["accession"] in seen_accessions or not filing["xml_name"].lower().endswith(".xml"):
                continue
            seen_accessions.add(filing["accession"])
            folder = f"https://www.sec.gov/Archives/edgar/data/{cik}/{filing['accession'].replace('-', '')}"
            body = patient_get(filings, f"{folder}/{filing['xml_name']}")
            if not body:
                continue
            seen_filings += 1
            parsed = parse_form4(body)
            if not parsed or parsed["issuer_cik"] != str(cik):
                continue  # the company filed this as an owner of another issuer
            reread |= {f"tm_insider_trades/{doc_id}" for doc_id in possible_doc_ids(parsed, filing["accession"])}
            docs.extend(
                build_trade_docs(
                    parsed,
                    symbol=instrument.ticker,
                    company=instrument.name,
                    accession=filing["accession"],
                    filing_date=filing["filing_date"],
                    accepted_at=filing["accepted_at"],
                    url=f"{folder}/{filing['accession']}-index.htm",
                    captured_at=captured_at,
                )
            )
        if index % 50 == 0:
            log(f"{index}/{len(universe)} stocks, {seen_filings} filings read, {len(docs)} open-market lines")

    docs, dropped = check_prices(docs, load_week_ranges(store, {data["symbol"] for _, data in docs}))
    for _, data in dropped:
        log(f"dropped {data['symbol']} {data['id']}: ${data['price']} a share is far outside the stock's 52-week range")
    produced = {path for path, _ in docs}
    stale_candidates = stale_paths(reread, produced, dropped)
    stale = sorted(_batch_get(store, stale_candidates, select=["id"])) if stale_candidates else []

    trades = [data for _, data in docs]
    clusters = detect_clusters(trades)
    totals = symbol_totals(trades)
    buys = [item for item in trades if item["tx_type"] == "buy"]
    sells = [item for item in trades if item["tx_type"] == "sell"]
    meta = {
        "generated_at": captured_at,
        "since": since,
        "days": args.days,
        "stocks": len(universe),
        "stocks_without_cik": no_cik[:60],
        "filings_read": seen_filings,
        "trades": len(trades),
        "buys": len(buys),
        "sells": len(sells),
        "buy_value": round(sum(item["value"] or 0 for item in buys), 2),
        "sell_value": round(sum(item["value"] or 0 for item in sells), 2),
        "stocks_with_trades": len(totals),
        "clusters": len(clusters),
        "cluster_rule": f"{CLUSTER_MIN_INSIDERS} or more insiders buying within {CLUSTER_WINDOW_DAYS} days",
        "dropped_off_price": len(dropped),
        "stale_removed": len(stale),
        "failures": (listing.failures + filings.failures)[:40],
        "source": SOURCE,
        "source_url": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4",
    }
    if not args.dry_run:
        written = store.set_many(docs)
        removed = delete_docs(store, stale)
        if removed:
            log(f"removed {removed} trade documents that no longer qualify: {', '.join(path.split('/', 1)[1] for path in stale[:10])}")
        if not wanted:
            store.set("tm_insider_meta/clusters", {"clusters": clusters, "generated_at": captured_at, "since": since, "source": SOURCE})
            store.set("tm_insider_meta/by_symbol", {"symbols": totals, "generated_at": captured_at, "since": since, "source": SOURCE})
            store.set("tm_insider_meta/run", meta)
        log(f"wrote {written} trade documents and {len(clusters)} clusters")
    else:
        log(f"dry run: {len(docs)} trade documents not written, {len(stale)} stale ones not removed")
        for path in stale[:40]:
            log(f"would remove {path}")
        for cluster in clusters[:5]:
            log(f"cluster {cluster['symbol']}: {cluster['insiders']} insiders, {cluster['first_date']} to {cluster['last_date']}")
    log(json.dumps(meta, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
