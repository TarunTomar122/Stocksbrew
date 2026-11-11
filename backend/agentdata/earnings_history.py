"""Past earnings report days per stock from SEC EDGAR, for ``tm_earnings_history``.

The earnings calendar (``tm_earnings_events``) only reaches back to May 2026, so
the earnings season planner had one to three past reports per stock. Every US
company files its results release as an 8-K carrying item 2.02 ("results of
operations and financial condition"), and EDGAR stamps each filing with the
second it was accepted. That gives years of report days, and the acceptance
time says whether the results came out before the open or after the close.

Source: EDGAR's per-company submissions API (``data.sec.gov/submissions``),
one request per company plus one per older page when the recent block does not
reach back far enough. Same User-Agent and pace as ``sec_filings.py``: about 7
requests per second, under the SEC's limit of 10.

One document per stock, ``tm_earnings_history/{TICKER}``::

    {ticker, cik, sec_name, market: "US",
     reports: [{date, session, accepted_at, filing_date, form, accession, items, url, index_url,
                release, period_end, periodic_form}],  # newest first
     report_count, release_count, oldest, newest, source, source_url, captured_at}

``date`` is New York's day of the acceptance time. ``session`` is "bmo" when
the filing was accepted before 9:30 ET, "amc" at 4:00 PM ET or later, and
"during" in between (the release may have come out before the open or during
the session, so the window that covers it is two sessions). Amendments (8-K/A)
restate an old release and are left out.

Not every item 2.02 8-K is an earnings release: companies also file one for a
delivery update, a conference slide deck or preliminary numbers. Each report
carries ``release``: True for the last results 8-K between a fiscal period's
end and the 10-Q or 10-K that covers it (``period_end``, ``periodic_form``),
False for the others in that window or outside every window. A report after the
newest 10-Q/10-K is the coming quarter's release when it lands at least ten days
after the next period has ended (only the latest such one counts). With no
10-Q/10-K on file, ``release`` is None (not checked). The planner reads every
report whose ``release`` is not False.

Writes are additive: reports are merged with the stored ones by accession
number, so a short or failed reply from EDGAR can never shrink a history.
Nothing is deleted.

Run: ``python3 -m backend.agentdata.earnings_history [--years 3] [--symbols AAPL,MSFT] [--dry-run]``
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .feeds_common import SEC_USER_AGENT, Fetcher, Instrument, WriteLedger, iso_now, load_universe, symbol_key, utc_now, write_changed
from .sec_filings import load_cik_map, parse_accepted, parse_items
from .store import DocStore

COLLECTION = "tm_earnings_history"
_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
_OLDER_PAGE = "https://data.sec.gov/submissions/{name}"
SOURCE = "SEC EDGAR submissions API, 8-K item 2.02 (results of operations)"
_NEW_YORK = ZoneInfo("America/New_York")
_OPEN_MINUTES = 9 * 60 + 30
_CLOSE_MINUTES = 16 * 60


def acceptance_session(accepted_at: str) -> tuple[str, str] | None:
    """(New York day, session) of an acceptance time in ISO UTC. Same rule as the planner's ``filingSession``."""
    try:
        parsed = datetime.fromisoformat(str(accepted_at or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    local = parsed.astimezone(_NEW_YORK)
    minutes = local.hour * 60 + local.minute
    session = "bmo" if minutes < _OPEN_MINUTES else "amc" if minutes >= _CLOSE_MINUTES else "during"
    return local.date().isoformat(), session


def is_results_8k(form: Any, items: Any) -> bool:
    """An original 8-K (not an amendment) that carries item 2.02."""
    text = " ".join(str(form or "").upper().split())
    # EDGAR lists items comma-separated ("2.02,9.01"); match the code exactly.
    return text == "8-K" and "2.02" in {code.strip() for code in str(items or "").split(",")}


def reports_from_block(block: dict[str, Any], *, cik: int, since: str) -> list[dict[str, Any]]:
    """Results 8-Ks filed on or after ``since`` (YYYY-MM-DD) in one submissions block (``recent`` or an older page)."""
    forms = block.get("form") or []

    def col(name: str, index: int) -> Any:
        values = block.get(name) or []
        return values[index] if index < len(values) else ""

    out: list[dict[str, Any]] = []
    for index, form in enumerate(forms):
        if not is_results_8k(form, col("items", index)):
            continue
        filing_date = str(col("filingDate", index) or "")[:10]
        accession = str(col("accessionNumber", index) or "")
        if not accession or not filing_date or filing_date < since:
            continue
        raw_accepted = str(col("acceptanceDateTime", index) or "").strip()
        # Without a readable time there is no session, and the filing date alone can be a day late
        # (parse_accepted would fall back to midnight UTC, the evening before in New York).
        if acceptance_session(raw_accepted) is None:
            continue
        accepted_at = parse_accepted(raw_accepted, filing_date)
        when = acceptance_session(accepted_at)
        if when is None:
            continue
        day, session = when
        compact = accession.replace("-", "")
        primary = str(col("primaryDocument", index) or "")
        base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{compact}"
        out.append(
            {
                "date": day,
                "session": session,
                "accepted_at": accepted_at,
                "filing_date": filing_date,
                "form": "8-K",
                "accession": accession,
                "items": [item["code"] for item in parse_items(col("items", index))],
                "url": f"{base}/{primary}" if primary else f"{base}/{accession}-index.htm",
                "index_url": f"{base}/{accession}-index.htm",
            }
        )
    return out


PERIODIC_FORMS = {"10-Q", "10-K", "10-KT"}
# How long after a periodic report a release may still be filed (some file the 10-Q the evening before).
_RELEASE_AFTER_PERIODIC_DAYS = 1
# A release after the newest 10-Q/10-K must come this long after the next period has ended.
_PENDING_MIN_DAYS_AFTER_PERIOD = 10
_QUARTER_DAYS = 91


def periodic_from_block(block: dict[str, Any], *, since: str) -> list[dict[str, str]]:
    """Original 10-Q/10-K filings: [{period_end, filed, form}] filed on or after ``since``."""
    out: list[dict[str, str]] = []
    forms = block.get("form") or []
    report_dates = block.get("reportDate") or []
    filing_dates = block.get("filingDate") or []
    for index, form in enumerate(forms):
        text = " ".join(str(form or "").upper().split())
        if text not in PERIODIC_FORMS:
            continue
        period_end = str(report_dates[index] if index < len(report_dates) else "")[:10]
        filed = str(filing_dates[index] if index < len(filing_dates) else "")[:10]
        if len(period_end) == 10 and len(filed) == 10 and filed >= since and period_end <= filed:
            out.append({"period_end": period_end, "filed": filed, "form": text})
    return out


def _plus_days(day: str, days: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=days)).isoformat()


def mark_releases(reports: list[dict[str, Any]], periodic: list[dict[str, str]], *, checked_from: str) -> list[dict[str, Any]]:
    """Set ``release``, ``period_end`` and ``periodic_form`` on each report dated on or after ``checked_from``.

    Reports before ``checked_from`` keep whatever an earlier run decided, because
    the 10-Q/10-K filings that would settle them are no longer fetched.
    """
    out = [dict(report) for report in reports]
    checked = [report for report in out if str(report.get("date") or "") >= checked_from or "release" not in report]
    if not periodic:
        for report in checked:
            report.update({"release": None, "period_end": None, "periodic_form": None})
        return out
    for report in checked:
        report.update({"release": False, "period_end": None, "periodic_form": None})
    by_time = sorted(checked, key=lambda report: str(report.get("accepted_at") or ""))
    # One release per fiscal period: the last results 8-K between the period's end and its 10-Q/10-K.
    seen_periods: set[str] = set()
    for filing in sorted(periodic, key=lambda row: row["filed"]):
        if filing["period_end"] in seen_periods:
            continue  # a second 10-K/10-Q for the same period (a transition filing) is not a new quarter
        seen_periods.add(filing["period_end"])
        last_day = _plus_days(filing["filed"], _RELEASE_AFTER_PERIODIC_DAYS)
        inside = [report for report in by_time if filing["period_end"] < str(report["date"]) <= last_day]
        if inside:
            inside[-1].update({"release": True, "period_end": filing["period_end"], "periodic_form": filing["form"]})
    # The coming quarter: after the newest periodic filing, once the next period is over.
    newest = max(periodic, key=lambda row: (row["filed"], row["period_end"]))
    earliest = _plus_days(newest["period_end"], _QUARTER_DAYS + _PENDING_MIN_DAYS_AFTER_PERIOD)
    after = [report for report in by_time if str(report["date"]) > _plus_days(newest["filed"], _RELEASE_AFTER_PERIODIC_DAYS) and str(report["date"]) >= earliest]
    if after:
        after[-1]["release"] = True
    return out


def older_pages_needed(payload: dict[str, Any], since: str) -> list[str]:
    """Names of the older submissions pages that hold filings on or after ``since``."""
    filings = payload.get("filings") or {}
    recent = filings.get("recent") or {}
    dates = [str(day) for day in (recent.get("filingDate") or []) if day]
    if dates and min(dates) <= since:
        return []  # the recent block already reaches back far enough
    names: list[str] = []
    for page in filings.get("files") or []:
        if not isinstance(page, dict) or not page.get("name"):
            continue
        if str(page.get("filingTo") or "9999") >= since:
            names.append(str(page["name"]))
    return names


def merge_reports(stored: list[dict[str, Any]], fresh: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Union by accession, the fresh copy winning, newest acceptance first."""
    by_accession: dict[str, dict[str, Any]] = {}
    for report in stored:
        if isinstance(report, dict) and report.get("accession") and report.get("date"):
            by_accession[str(report["accession"])] = report
    for report in fresh:
        by_accession[str(report["accession"])] = report
    return sorted(by_accession.values(), key=lambda report: (str(report.get("accepted_at") or ""), str(report["accession"])), reverse=True)


def build_doc(
    *,
    instrument: Instrument,
    cik: int,
    sec_name: str,
    reports: list[dict[str, Any]],
    now_iso: str,
) -> dict[str, Any]:
    days = [report["date"] for report in reports]
    releases = {report["date"] for report in reports if report.get("release") is not False}
    return {
        "ticker": instrument.ticker,
        "cik": cik,
        "sec_name": sec_name,
        "market": "US",
        "reports": reports,
        "report_count": len(reports),
        "release_count": len(releases),
        "oldest": min(days) if days else None,
        "newest": max(days) if days else None,
        "source": SOURCE,
        "source_url": _SUBMISSIONS.format(cik=cik),
        "captured_at": now_iso,
    }


def run(
    *,
    years: float = 3.0,
    symbols: list[str] | None = None,
    ticker_limit: int | None = None,
    dry_run: bool = False,
    cache_ttl: float = 6 * 3600,
) -> dict[str, Any]:
    store = DocStore.from_env()
    universe = load_universe(store)
    if symbols:
        wanted = {symbol_key(symbol) for symbol in symbols}
        universe = [instrument for instrument in universe if symbol_key(instrument.ticker) in wanted]
    if ticker_limit:
        universe = universe[:ticker_limit]
    # 0.14s between requests is about 7 per second, under EDGAR's limit of 10.
    fetcher = Fetcher("earnings_history", user_agent=SEC_USER_AGENT, min_interval=0.14, ttl=cache_ttl)
    cik_map = load_cik_map(fetcher)
    if not cik_map:
        raise RuntimeError("could not load the SEC ticker to CIK map")
    now_iso = iso_now()
    since = (utc_now() - timedelta(days=round(365.25 * years))).date().isoformat()
    # A release is matched to the 10-Q/10-K filed after it, so those are kept from a little earlier too.
    periodic_since = (date.fromisoformat(since) - timedelta(days=150)).isoformat()

    targets = [(instrument, cik_map[symbol_key(instrument.ticker)]) for instrument in universe if symbol_key(instrument.ticker) in cik_map]
    unmapped = [instrument.ticker for instrument in universe if symbol_key(instrument.ticker) not in cik_map]

    Pulled = tuple[Instrument, int, str, list[dict[str, Any]], list[dict[str, str]]]

    def pull(target: tuple[Instrument, int]) -> Pulled | None:
        instrument, cik = target
        payload = fetcher.get_json(_SUBMISSIONS.format(cik=cik))
        if not isinstance(payload, dict):
            return None
        recent = (payload.get("filings") or {}).get("recent") or {}
        reports = reports_from_block(recent, cik=cik, since=since)
        periodic = periodic_from_block(recent, since=periodic_since)
        for name in older_pages_needed(payload, periodic_since):
            # Older pages change only when EDGAR re-cuts them; a week is plenty.
            page = fetcher.get_json(_OLDER_PAGE.format(name=name), ttl=7 * 24 * 3600)
            if not isinstance(page, dict):
                return None  # a partial history is not written as if it were whole
            reports.extend(reports_from_block(page, cik=cik, since=since))
            periodic.extend(periodic_from_block(page, since=periodic_since))
        sec_name = " ".join(str(payload.get("name") or "").split()) or instrument.name or instrument.ticker
        return instrument, cik, sec_name, reports, periodic

    pulled: list[Pulled] = []
    failed: list[str] = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for target, result in zip(targets, pool.map(pull, targets)):
            if result is None:
                failed.append(target[0].ticker)
            else:
                pulled.append(result)

    paths = [f"{COLLECTION}/{instrument.ticker}" for instrument, _cik, _name, _reports, _periodic in pulled]
    stored: dict[str, dict[str, Any]] = store.get_many(paths) if paths else {}

    writes: list[tuple[str, dict[str, Any]]] = []
    counts: list[int] = []
    no_reports: list[str] = []
    not_releases = 0
    for instrument, cik, sec_name, fresh, periodic in pulled:
        path = f"{COLLECTION}/{instrument.ticker}"
        previous = stored.get(path) or {}
        reports = mark_releases(merge_reports(previous.get("reports") or [], fresh), periodic, checked_from=since)
        if not reports:
            no_reports.append(instrument.ticker)
            continue
        not_releases += sum(1 for report in reports if report.get("release") is False)
        counts.append(len({report["date"] for report in reports if report.get("release") is not False}))
        writes.append((path, build_doc(instrument=instrument, cik=cik, sec_name=sec_name, reports=reports, now_iso=now_iso)))

    written = 0
    if not dry_run and writes:
        written = write_changed(store, WriteLedger("earnings_history"), writes, merge=False)
    counts.sort()
    return {
        "since": since,
        "universe": len(universe),
        "companies_checked": len(pulled),
        "companies_failed": len(failed),
        "failed_sample": failed[:10],
        "unmapped": len(unmapped),
        "unmapped_sample": unmapped[:15],
        "with_reports": len(writes),
        "no_reports": len(no_reports),
        "no_reports_sample": no_reports[:15],
        "not_releases": not_releases,
        "release_days_median": counts[len(counts) // 2] if counts else 0,
        "release_days_min": counts[0] if counts else 0,
        "under_8_report_days": sum(1 for count in counts if count < 8),
        "requests": fetcher.requests,
        "cache_hits": fetcher.cache_hits,
        "failures": fetcher.failures[:5],
        "written": written,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--years", type=float, default=3.0, help="keep results 8-Ks from the last N years")
    parser.add_argument("--symbols", default="", help="comma-separated tickers (default: the whole covered universe)")
    parser.add_argument("--ticker-limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--cache-ttl", type=float, default=6 * 3600, help="seconds a cached EDGAR response is reused")
    args = parser.parse_args()
    symbols = [symbol.strip() for symbol in args.symbols.split(",") if symbol.strip()] or None
    stats = run(years=args.years, symbols=symbols, ticker_limit=args.ticker_limit, dry_run=args.dry_run, cache_ttl=args.cache_ttl)
    print(f"[earnings_history] {stats}", flush=True)


if __name__ == "__main__":
    main()
