"""Recent SEC filings for the covered US universe, into ``tm_agent_filings``.

Source: EDGAR's per-company submissions API (``data.sec.gov/submissions``), one
request per company, mapped from ticker to CIK with ``company_tickers.json``.

Kept forms: 8-K, 10-Q, 10-K, S-1 and Schedule 13D/13G, plus their amendments.
Each document carries the form, the acceptance time (UTC, as EDGAR reports it),
the filing and report dates, links to the primary document and the filing index,
and for an 8-K the item codes with the plain-language label of each item.
Labels are a fixed table of the SEC's own item titles. Nothing is model-written.

Ids are ``{TICKER}_{accession}``, so reruns update in place. Nothing is deleted.

Run: ``python3 -m backend.agentdata.sec_filings``
"""

from __future__ import annotations

import argparse
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any

from .feeds_common import (
    SEC_USER_AGENT,
    Fetcher,
    Instrument,
    WriteLedger,
    iso_now,
    load_universe,
    symbol_key,
    utc_now,
    write_changed,
)
from .store import DocStore

COLLECTION = "tm_agent_filings"
META_PATH = "tm_agent_filings_meta/US"
_TICKER_MAP = "https://www.sec.gov/files/company_tickers.json"
_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"

# SEC form -> the group the app filters on.
FORM_GROUPS: dict[str, str] = {
    "8-K": "8-K",
    "10-Q": "10-Q",
    "10-K": "10-K",
    "S-1": "S-1",
    "SC 13D": "13D/G",
    "SC 13G": "13D/G",
    "SCHEDULE 13D": "13D/G",
    "SCHEDULE 13G": "13D/G",
}

# Form 8-K item titles, shortened to what a reader needs.
ITEM_LABELS: dict[str, str] = {
    "1.01": "New material agreement",
    "1.02": "Material agreement ended",
    "1.03": "Bankruptcy or receivership",
    "1.04": "Mine safety violation",
    "1.05": "Material cybersecurity incident",
    "2.01": "Acquisition or sale of assets completed",
    "2.02": "Results of operations (earnings)",
    "2.03": "New debt or financial obligation",
    "2.04": "Debt accelerated or obligation triggered",
    "2.05": "Restructuring or exit costs",
    "2.06": "Material impairment",
    "3.01": "Delisting notice or listing rule failure",
    "3.02": "Unregistered sale of shares",
    "3.03": "Change to shareholder rights",
    "4.01": "Auditor change",
    "4.02": "Past financial statements can no longer be relied on",
    "5.01": "Change in control",
    "5.02": "Director or executive change",
    "5.03": "Bylaw or fiscal year change",
    "5.04": "Employee plan trading blackout",
    "5.05": "Code of ethics change or waiver",
    "5.06": "Shell company status change",
    "5.07": "Shareholder vote results",
    "5.08": "Shareholder director nominations",
    "6.01": "Asset-backed securities information",
    "6.02": "Servicer or trustee change",
    "6.03": "Credit enhancement change",
    "6.04": "Missed distribution",
    "6.05": "Securities Act update",
    "7.01": "Regulation FD disclosure",
    "8.01": "Other material event",
    "9.01": "Financial statements and exhibits",
}
# Items that carry the news. 9.01 (exhibits) and 7.01 ride along with almost everything.
_HEADLINE_ORDER = (
    "1.03", "4.02", "1.05", "5.01", "2.01", "3.01", "2.02", "2.05", "2.06", "1.01", "1.02", "5.02",
    "4.01", "2.03", "2.04", "3.02", "3.03", "5.07", "5.03", "8.01", "7.01", "9.01",
)

_GROUP_LABELS = {
    "10-K": "Annual report",
    "10-Q": "Quarterly report",
    "S-1": "Registration statement for a share offering",
    "13D/G": "Stake above 5% reported",
    "8-K": "Current report",
}


def classify_form(form: str) -> tuple[str, bool] | None:
    """``SC 13G/A`` -> (``13D/G``, True). None for forms we do not keep."""
    text = " ".join(str(form or "").upper().split())
    amendment = text.endswith("/A")
    base = text[:-2] if amendment else text
    group = FORM_GROUPS.get(base)
    return (group, amendment) if group else None


def parse_items(raw: Any) -> list[dict[str, str]]:
    """``"2.02,9.01"`` -> [{code, label}], unknown codes kept with a neutral label."""
    out: list[dict[str, str]] = []
    for code in re.findall(r"\d\.\d{2}", str(raw or "")):
        if any(item["code"] == code for item in out):
            continue
        out.append({"code": code, "label": ITEM_LABELS.get(code, f"Item {code}")})
    return out


def headline_for(group: str, form: str, amendment: bool, items: list[dict[str, str]]) -> str:
    """One plain line for the stream: the 8-K's lead item, or what the form is."""
    if group == "8-K" and items:
        codes = {item["code"] for item in items}
        lead = next((code for code in _HEADLINE_ORDER if code in codes), items[0]["code"])
        label = ITEM_LABELS.get(lead, f"Item {lead}")
    elif group == "13D/G":
        active = "13D" in form.upper()
        label = "Stake above 5% reported, active holder (13D)" if active else "Stake above 5% reported, passive holder (13G)"
    else:
        label = _GROUP_LABELS[group]
    return f"{label}, amended" if amendment else label


def parse_accepted(raw: Any, filing_date: str) -> str:
    """EDGAR's acceptance stamp as ISO UTC; falls back to the filing date at 00:00."""
    text = str(raw or "").strip()
    if text:
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
        except ValueError:
            pass
    return f"{filing_date}T00:00:00+00:00" if filing_date else ""


def stake_report_roles(recent: dict[str, Any], cik: int) -> dict[int, str]:
    """Which 13D/G rows are about this company, and which it filed about others.

    A company's submissions list both. Two facts separate them without another
    request: the accession number starts with the submitter's CIK, and a company
    cannot report a stake in itself, so its own prefix means it is the filer; and
    every report about one company carries that company's single ``005-`` file
    number, so among the rest the number that repeats is this company's own.
    """
    forms = recent.get("form") or []
    accessions = recent.get("accessionNumber") or []
    file_numbers = recent.get("fileNumber") or []
    own_prefix = f"{cik:010d}"
    roles: dict[int, str] = {}
    candidates: dict[int, str] = {}
    for index, form in enumerate(forms):
        classified = classify_form(form)
        if classified is None or classified[0] != "13D/G":
            continue
        accession = str(accessions[index] if index < len(accessions) else "")
        if accession.startswith(own_prefix):
            roles[index] = "filer"
            continue
        candidates[index] = str(file_numbers[index] if index < len(file_numbers) else "").strip()
    counts: dict[str, int] = {}
    for number in candidates.values():
        if number:
            counts[number] = counts.get(number, 0) + 1
    if len(counts) <= 1:
        for index in candidates:
            roles[index] = "subject"
        return roles
    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    clear_winner = ranked[0][1] > ranked[1][1]
    for index, number in candidates.items():
        if not clear_winner:
            roles[index] = "unknown"
        else:
            roles[index] = "subject" if number == ranked[0][0] else "filer"
    return roles


def build_filings(
    payload: dict[str, Any],
    *,
    instrument: Instrument,
    cik: int,
    since: str,
    now_iso: str,
) -> list[dict[str, Any]]:
    """Kept filings on or after ``since`` (YYYY-MM-DD) from one submissions payload."""
    recent = ((payload.get("filings") or {}).get("recent")) or {}
    forms = recent.get("form") or []
    out: list[dict[str, Any]] = []

    def col(name: str, index: int) -> Any:
        values = recent.get(name) or []
        return values[index] if index < len(values) else ""

    company = " ".join(str(payload.get("name") or "").split()) or instrument.name or instrument.ticker
    stake_roles = stake_report_roles(recent, cik)
    for index, form in enumerate(forms):
        classified = classify_form(form)
        if classified is None:
            continue
        group, amendment = classified
        filing_date = str(col("filingDate", index) or "")
        accession = str(col("accessionNumber", index) or "")
        if not accession or not filing_date or filing_date < since:
            continue
        compact = accession.replace("-", "")
        primary = str(col("primaryDocument", index) or "")
        base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{compact}"
        items = parse_items(col("items", index)) if group == "8-K" else []
        role = stake_roles.get(index, "subject") if group == "13D/G" else "subject"
        out.append(
            {
                "id": f"{instrument.ticker}_{compact}",
                "ticker": instrument.ticker,
                "company": instrument.name or company,
                "sec_name": company,
                "cik": cik,
                "market": "US",
                "form": str(form).strip(),
                "form_group": group,
                "is_amendment": amendment,
                # "subject": about this company. "filer": a stake this company reported in
                # someone else, which the app leaves out. "unknown": could not tell.
                "role": role,
                "headline": headline_for(group, str(form), amendment, items),
                "items": items,
                "item_codes": [item["code"] for item in items],
                "filed_at": parse_accepted(col("acceptanceDateTime", index), filing_date),
                "filing_date": filing_date,
                "report_date": str(col("reportDate", index) or ""),
                "accession": accession,
                "url": f"{base}/{primary}" if primary else f"{base}/{accession}-index.htm",
                "index_url": f"{base}/{accession}-index.htm",
                "source": "SEC EDGAR",
                "captured_at": now_iso,
            }
        )
    return out


def load_cik_map(fetcher: Fetcher) -> dict[str, int]:
    payload = fetcher.get_json(_TICKER_MAP, ttl=24 * 3600)
    out: dict[str, int] = {}
    if isinstance(payload, dict):
        for row in payload.values():
            if isinstance(row, dict) and row.get("ticker") and row.get("cik_str") is not None:
                out.setdefault(symbol_key(str(row["ticker"])), int(row["cik_str"]))
    return out


def run(
    *,
    days: int = 90,
    ticker_limit: int | None = None,
    dry_run: bool = False,
    cache_ttl: float = 1800,
) -> dict[str, Any]:
    store = DocStore.from_env()
    universe = load_universe(store)
    if ticker_limit:
        universe = universe[:ticker_limit]
    # 0.14s between requests is about 7 per second, under EDGAR's limit of 10.
    fetcher = Fetcher("sec_filings", user_agent=SEC_USER_AGENT, min_interval=0.14, ttl=cache_ttl)
    cik_map = load_cik_map(fetcher)
    if not cik_map:
        raise RuntimeError("could not load the SEC ticker to CIK map")
    now_iso = iso_now()
    since = (utc_now() - timedelta(days=days)).date().isoformat()

    targets = [(instrument, cik_map[symbol_key(instrument.ticker)]) for instrument in universe if symbol_key(instrument.ticker) in cik_map]
    unmapped = [instrument.ticker for instrument in universe if symbol_key(instrument.ticker) not in cik_map]

    def pull(target: tuple[Instrument, int]) -> list[dict[str, Any]] | None:
        instrument, cik = target
        payload = fetcher.get_json(_SUBMISSIONS.format(cik=cik))
        if not isinstance(payload, dict):
            return None
        return build_filings(payload, instrument=instrument, cik=cik, since=since, now_iso=now_iso)

    docs: list[dict[str, Any]] = []
    failed = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(pull, targets):
            if result is None:
                failed += 1
            else:
                docs.extend(result)

    by_group: dict[str, int] = {}
    shown = [doc for doc in docs if doc["role"] == "subject"]
    for doc in shown:
        by_group[doc["form_group"]] = by_group.get(doc["form_group"], 0) + 1
    newest = max((doc["filed_at"] for doc in docs), default=None)
    writes = [(f"{COLLECTION}/{doc['id']}", doc) for doc in docs]
    written = 0
    if not dry_run and writes:
        written = write_changed(store, WriteLedger("sec_filings"), writes, merge=True)
        store.set(
            META_PATH,
            {
                "market": "US",
                "updated_at": now_iso,
                "newest_filed_at": newest,
                "window_days": days,
                "filings_in_window": len(shown),
                "left_out_filer_side": len(docs) - len(shown),
                "by_form_group": dict(sorted(by_group.items())),
                "companies_checked": len(targets) - failed,
                "companies_with_filings": len({doc["ticker"] for doc in shown}),
                "source": "SEC EDGAR submissions API",
            },
            merge=True,
        )
    return {
        "filings": len(shown),
        "left_out_filer_side": len(docs) - len(shown),
        "by_form_group": by_group,
        "companies_checked": len(targets) - failed,
        "companies_failed": failed,
        "unmapped": len(unmapped),
        "unmapped_sample": unmapped[:15],
        "newest": newest,
        "since": since,
        "requests": fetcher.requests,
        "failures": fetcher.failures[:5],
        "written": written,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--days", type=int, default=90, help="keep filings from the last N days")
    parser.add_argument("--ticker-limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--cache-ttl", type=float, default=1800, help="seconds a cached EDGAR response is reused")
    args = parser.parse_args()
    stats = run(days=args.days, ticker_limit=args.ticker_limit, dry_run=args.dry_run, cache_ttl=args.cache_ttl)
    print(f"[sec_filings] {stats}", flush=True)


if __name__ == "__main__":
    main()
