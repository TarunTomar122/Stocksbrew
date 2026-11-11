"""Senate periodic transaction reports (PTRs) from the Senate eFD site: the Senate side of Follow.

Run it::

    SENATE_PTR_ENABLED=1 python3 -m backend.agentdata.senate_ptr          # new reports since the last run
    python3 -m backend.agentdata.senate_ptr --backfill-days 365 --dry-run  # a year, read but not written
    python3 -m backend.agentdata.senate_ptr --rebuild-only                 # profiles from stored reports, no fetch

The Senate Office of Public Records publishes senators' reports on eFD
(efdsearch.senate.gov). The site asks every visitor to accept the Ethics in
Government Act's limits on using the reports before it shows any; this job
does that the way the site's own form does (it posts the checkbox and the
form's token), then pages through the PTR search and reads each new report:

* Electronic reports are HTML pages with one table of transactions, read here.
* Paper reports are scanned images. We record that the filing exists, when it
  was filed and where it is, and never guess what is in it.
* Amendments restate a whole report under a new id. The newest amendment of a
  report replaces the original it restates (matched by filer, report date and
  row count); the original's trades stay stored, marked ``superseded_by``.

Be polite: one request at a time, a pause between requests, backoff on 429
and 5xx, and no retry at all on 403. eFD sits behind a bot filter that has
been seen to refuse any client that is not a browser; when it refuses us the
job stops at once, writes nothing and exits 2. We do not work around it.

Collections (all additive, the same shapes as house_ptr.py, ``chamber: "senate"``):

* ``tm_follow_senate_reports/{report id}``  one report as read: filer, dates, rows, or "paper"
* ``tm_follow_trades/{report id}-{n}``      one disclosed trade
* ``tm_follow_people/{slug}``               a senator's profile: trades, record, reports
* ``tm_follow_sources/{slug}``              the directory card (kind "congress")
* ``tm_follow_activity/{slug}__{date}__{id}`` one "they filed" event per report
* ``tm_follow_meta/senate``                 run counts, the newest filing date seen, slugs

Senators keep the slug a House member would get ("tommy-tuberville"), so the
curated power-trades feed links to their page; a senator whose name already
has a House profile (someone who moved chambers) gets "-senate" on the end.
Once given, a slug is kept in the meta document and never changes.

Off until ``SENATE_PTR_ENABLED=1`` (or ``--force``/``--dry-run``), like the copy tests.

Standard library only.
"""

from __future__ import annotations

import argparse
import html
import http.client
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Any, Callable

from .house_ptr import (
    ACTIVITY_DAYS,
    LEGISLATORS_URL,
    PROFILE_TRADES,
    _PTR_CACHE,
    _get,
    _name_key,
    amount_mid,
    clean_ptr_ticker,
    congress_headline,
    congress_performance,
    member_slug,
    member_stats,
    parse_amount,
    perf_card,
    slugify,
)

BASE = "https://efdsearch.senate.gov"
HOME_URL = f"{BASE}/search/home/"
SEARCH_URL = f"{BASE}/search/"
DATA_URL = f"{BASE}/search/report/data/"
# Generic and descriptive; no personal contact in it.
USER_AGENT = "stocksbrew-disclosure-reader/1.0 (+https://www.stocksbrew.online; public STOCK Act reports)"
SOURCE = "Senate Office of Public Records, periodic transaction reports (eFD)"
SOURCE_HOME = "https://efdsearch.senate.gov/search/home/"
REPORTS = "tm_follow_senate_reports"
META_PATH = "tm_follow_meta/senate"
ENABLE_FLAG = "SENATE_PTR_ENABLED"
PTR_REPORT_TYPE = "[11]"
PAGE_LENGTH = 100
DEFAULT_BACKFILL_DAYS = 365
# Re-ask for the last month each run (a paper filing can be listed with an earlier received date);
# reports we already hold are skipped, so the overlap costs a search page, not report reads.
OVERLAP_DAYS = 30
PAUSE_SECONDS = 2.0
# Asset types whose ticker is a listed stock or fund we can price. eFD types most ETFs as
# "Stock"; options, bonds, notes and crypto keep their row but get no ticker.
_TICKER_ASSET_TYPES = {"stock", "exchange traded fund", "etf"}
_OWNERS = {"self": "self", "spouse": "spouse", "joint": "joint", "child": "dependent child", "dependent child": "dependent child"}
_PARTY = {"Democrat": "D", "Republican": "R", "Independent": "I"}
_DATE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
_LINK = re.compile(r'href="/search/view/(ptr|paper)/([0-9a-fA-F-]{36})/?"[^>]*>(.*?)</a>', re.S)
_TITLE = re.compile(r"for\s+(\d{1,2}/\d{1,2}/\d{4})(?:\s*\(Amendment\s+(\d+)\))?", re.I)
_FILED = re.compile(r"Filed\s+(\d{1,2})/(\d{1,2})/(\d{4})\s*@\s*(\d{1,2}):(\d{2})\s*([AP]M)", re.I)
_TOTAL = re.compile(r"\((\d+)\s+transactions?\s+total\)", re.I)


def log(message: str) -> None:
    print(f"[senate] {message}", flush=True)


class Blocked(RuntimeError):
    """eFD refused us (403, or no agreement form where one should be). The run stops; nothing is written."""


# ---------------------------------------------------------------------------
# Parsing: dates, the agreement form, search rows, one report page
# ---------------------------------------------------------------------------


def iso_date(us_date: str) -> str:
    """"6/2/2026" -> "2026-06-02"; "" when it is not a date."""
    match = _DATE.match((us_date or "").strip())
    if not match:
        return ""
    month, day, year = (int(part) for part in match.groups())
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return ""


def us_date(day: date) -> str:
    return f"{day.month:02d}/{day.day:02d}/{day.year}"


def agreement_token(page: str) -> str:
    """The hidden csrfmiddlewaretoken of the agreement form, or "" when the page has none."""
    form = re.search(r'<form[^>]*id="agreement_form".*?</form>', page, re.S | re.I)
    if not form:
        return ""
    token = re.search(r'name="csrfmiddlewaretoken"\s+value="([^"]+)"', form.group(0)) or re.search(
        r'value="([^"]+)"\s+name="csrfmiddlewaretoken"', form.group(0)
    )
    return token.group(1) if token else ""


def _tidy_name(text: str) -> str:
    """'Moran,  ' -> 'Moran'; 'McConnell, Jr.' -> 'McConnell'; 'RICHARD ' -> 'Richard'."""
    text = re.sub(r",.*$", "", (text or "").strip()).strip()
    text = " ".join(text.split())
    return text.title() if text.isupper() else text


def parse_search_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Rows of one search page as filing references. Candidates' reports are dropped."""
    out: list[dict[str, Any]] = []
    for row in payload.get("data") or []:
        if not isinstance(row, list) or len(row) < 5:
            continue
        first, last, office, link, submitted = (str(cell or "") for cell in row[:5])
        if "senator" not in office.lower():
            continue  # a candidate's report
        match = _LINK.search(link)
        if not match:
            continue
        kind, uuid, title_html = match.group(1), match.group(2).lower(), match.group(3)
        title = " ".join(html.unescape(re.sub(r"<[^>]+>", "", title_html)).split())
        title_match = _TITLE.search(title)
        out.append(
            {
                "uuid": uuid,
                "kind": kind,
                "first": _tidy_name(first),
                "last": _tidy_name(last),
                "office": " ".join(office.split()),
                "title": title,
                "title_date": iso_date(title_match.group(1)) if title_match else "",
                "amendment": int(title_match.group(2)) if title_match and title_match.group(2) else 0,
                "submitted": iso_date(submitted),
                "url": report_url(kind, uuid),
            }
        )
    return out


def report_url(kind: str, uuid: str) -> str:
    return f"{BASE}/search/view/{kind}/{uuid}/"


class _ReportPage(HTMLParser):
    """Collects the h1, the filer line, the Filed stamp, the transaction count and the table."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.h1: list[str] = []
        self.filer: list[str] = []
        self.texts: list[str] = []
        self.headers: list[str] = []
        self.rows: list[list[dict[str, str]]] = []
        self._in: dict[str, int] = {"h1": 0, "filer": 0, "th": 0, "td": 0, "muted": 0, "tbody": 0}
        self._cell: dict[str, list[str]] | None = None
        self._row: list[dict[str, str]] | None = None
        self._div_depth = 0
        self._muted_at: int | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = (dict(attrs).get("class") or "").split()
        if tag == "h1":
            self._in["h1"] += 1
        elif tag == "h2" and "filedReport" in classes:
            self._in["filer"] += 1
        elif tag == "tbody":
            self._in["tbody"] += 1
        elif tag == "th":
            self._in["th"] += 1
            self._cell = {"main": [], "detail": []}
        elif tag == "tr" and self._in["tbody"]:
            self._row = []
        elif tag == "td" and self._row is not None:
            self._in["td"] += 1
            self._cell = {"main": [], "detail": []}
        elif tag == "div":
            self._div_depth += 1
            if self._in["td"] and "text-muted" in classes and self._muted_at is None:
                self._muted_at = self._div_depth
        elif tag == "br" and self._cell is not None:
            (self._cell["detail"] if self._muted_at is not None else self._cell["main"]).append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag == "h1" and self._in["h1"]:
            self._in["h1"] -= 1
        elif tag == "h2" and self._in["filer"]:
            self._in["filer"] -= 1
        elif tag == "tbody" and self._in["tbody"]:
            self._in["tbody"] -= 1
        elif tag == "th" and self._in["th"] and self._cell is not None:
            self._in["th"] -= 1
            self.headers.append(" ".join("".join(self._cell["main"]).split()))
            self._cell = None
        elif tag == "td" and self._in["td"] and self._cell is not None and self._row is not None:
            self._in["td"] -= 1
            self._row.append(
                {
                    "text": " ".join("".join(self._cell["main"]).split()),
                    "detail": " ".join("".join(self._cell["detail"]).split()),
                }
            )
            self._cell = None
        elif tag == "tr" and self._row is not None and self._in["tbody"]:
            if self._row:
                self.rows.append(self._row)
            self._row = None
        elif tag == "div":
            if self._muted_at is not None and self._div_depth == self._muted_at:
                self._muted_at = None
            self._div_depth = max(0, self._div_depth - 1)

    def handle_data(self, data: str) -> None:
        if self._in["h1"]:
            self.h1.append(data)
        if self._in["filer"]:
            self.filer.append(data)
        if self._cell is not None:
            (self._cell["detail"] if self._muted_at is not None else self._cell["main"]).append(data)
        self.texts.append(data)


def _type(raw: str) -> tuple[str, bool]:
    """'Purchase' -> buy; 'Sale (Partial)' -> sell, partial; 'Exchange' -> exchange; anything else 'other'."""
    text = raw.strip().lower()
    if text.startswith("purchase"):
        return "buy", False
    if text.startswith("sale"):
        return "sell", "partial" in text
    if text.startswith("exchange"):
        return "exchange", False
    return "other", False


def _amount(raw: str) -> tuple[float | None, float | None]:
    """The disclosed bracket. 'None (or less than $1,001)' is the form's smallest box."""
    if raw.strip().lower().startswith("none"):
        return 0.0, 1000.0
    return parse_amount(raw)


def parse_report(page: str) -> dict[str, Any]:
    """One electronic PTR page -> its title, filer, filed time and transaction rows.

    ``ok`` is False when the page is not a PTR or its own transaction count does not
    match the rows we read; such a report is stored as unreadable and adds no trades.
    """
    parser = _ReportPage()
    parser.feed(page)
    parser.close()
    title = " ".join("".join(parser.h1).split())
    filer = " ".join("".join(parser.filer).split())
    body = " ".join(" ".join(parser.texts).split())
    title_match = _TITLE.search(title)
    filed = _FILED.search(body)
    filed_at = ""
    if filed:
        month, day, year, hour, minute, half = filed.groups()
        hour_24 = int(hour) % 12 + (12 if half.upper() == "PM" else 0)
        filed_at = f"{int(year):04d}-{int(month):02d}-{int(day):02d}T{hour_24:02d}:{minute}"
    total = _TOTAL.search(body)
    columns = [name.lower() for name in parser.headers]

    def cell(row: list[dict[str, str]], name: str, key: str = "text") -> str:
        try:
            index = columns.index(name)
        except ValueError:
            return ""
        return row[index][key] if index < len(row) else ""

    rows: list[dict[str, Any]] = []
    for raw in parser.rows:
        tx_type, partial = _type(cell(raw, "type"))
        low, high = _amount(cell(raw, "amount"))
        ticker = cell(raw, "ticker")
        comment = cell(raw, "comment")
        number = cell(raw, "#")
        rows.append(
            {
                "number": int(number) if number.isdigit() else len(rows) + 1,
                "transaction_date": iso_date(cell(raw, "transaction date")),
                "owner": _OWNERS.get(cell(raw, "owner").lower(), cell(raw, "owner").lower()),
                "ticker": "" if ticker in ("--", "") else ticker,
                "asset": cell(raw, "asset name"),
                "asset_detail": cell(raw, "asset name", "detail"),
                "asset_type": cell(raw, "asset type"),
                "tx_type": tx_type,
                "partial": partial,
                "amount_low": low,
                "amount_high": high,
                "comment": "" if comment == "--" else comment,
            }
        )
    expected = int(total.group(1)) if total else None
    ok = bool(title_match) and "periodic transaction report" in title.lower() and (expected is None or expected == len(rows))
    filer_name = re.sub(r"^The Honorable\s+", "", re.sub(r"\s*\(.*\)\s*$", "", filer)).strip()
    return {
        "ok": ok,
        "title": title,
        "title_date": iso_date(title_match.group(1)) if title_match else "",
        "amendment": int(title_match.group(2)) if title_match and title_match.group(2) else 0,
        "filer": filer_name,
        "filed_at": filed_at,
        "expected_rows": expected,
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# The eFD client: agreement, search pages, report pages
# ---------------------------------------------------------------------------


class EfdClient:
    """One polite session on eFD. ``opener`` and ``sleep`` are swappable for tests."""

    def __init__(self, *, pause: float = PAUSE_SECONDS, opener: Any = None, sleep: Callable[[float], None] = time.sleep) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = opener or urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.pause = pause
        self.sleep = sleep
        self.requests = 0
        self.agreed = False
        self._last = 0.0

    def _open(self, url: str, *, data: dict[str, str] | None = None, headers: dict[str, str] | None = None) -> tuple[str, str]:
        """(final url, body). Retries 429, 5xx and network errors with backoff; a 403 raises Blocked."""
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        for attempt in range(4):
            wait = self.pause - (time.monotonic() - self._last)
            if wait > 0:
                self.sleep(wait)
            request = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8", **(headers or {})})
            self.requests += 1
            try:
                with self.opener.open(request, timeout=60) as response:
                    text = response.read().decode("utf-8", "replace")
                    final = response.geturl()
                self._last = time.monotonic()
                return final, text
            except urllib.error.HTTPError as error:
                self._last = time.monotonic()
                if error.code == 403:
                    raise Blocked(f"eFD answered 403 for {urllib.parse.urlparse(url).path}") from None
                if error.code not in (429, 500, 502, 503, 504):
                    raise
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as error:
                self._last = time.monotonic()
                if attempt == 3:
                    raise RuntimeError(f"eFD unreachable: {error}") from None
            if attempt < 3:
                self.sleep(5.0 * (2**attempt))
        raise RuntimeError(f"eFD kept failing for {urllib.parse.urlparse(url).path}")

    def _csrf_cookie(self) -> str:
        return next((cookie.value for cookie in self.jar if cookie.name == "csrftoken"), "")

    def agree(self) -> None:
        """Accept the terms the way the site's form does: post its checkbox with the form's token."""
        _, page = self._open(HOME_URL)
        token = agreement_token(page)
        if not token:
            raise Blocked("the eFD home page had no agreement form")
        final, _ = self._open(HOME_URL, data={"prohibition_agreement": "1", "csrfmiddlewaretoken": token}, headers={"Referer": HOME_URL})
        if urllib.parse.urlparse(final).path.rstrip("/").endswith("/search/home"):
            raise Blocked("eFD did not accept the agreement")
        self.agreed = True

    def search_page(self, start: int, since: date, until: date | None = None) -> dict[str, Any]:
        if not self.agreed:
            self.agree()
        form = {
            "draw": str(start // PAGE_LENGTH + 1),
            "start": str(start),
            "length": str(PAGE_LENGTH),
            "report_types": PTR_REPORT_TYPE,
            "filer_types": "[]",
            "submitted_start_date": f"{us_date(since)} 00:00:00",
            "submitted_end_date": f"{us_date(until)} 23:59:59" if until else "",
            "candidate_state": "",
            "senator_state": "",
            "office_id": "",
            "first_name": "",
            "last_name": "",
            # Oldest first, so a report filed while we page lands on a later page, not a skipped one.
            "order[0][column]": "4",
            "order[0][dir]": "asc",
        }
        for column in range(5):
            form[f"columns[{column}][data]"] = str(column)
        headers = {"Referer": SEARCH_URL, "X-CSRFToken": self._csrf_cookie(), "X-Requested-With": "XMLHttpRequest"}
        final, text = self._open(DATA_URL, data=form, headers=headers)
        if urllib.parse.urlparse(final).path.rstrip("/").endswith("/search/home"):
            # The session lost its agreement; accept again once and retry.
            self.agreed = False
            self.agree()
            headers["X-CSRFToken"] = self._csrf_cookie()
            final, text = self._open(DATA_URL, data=form, headers=headers)
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            raise Blocked("eFD search did not answer with data") from None
        return payload if isinstance(payload, dict) else {}

    def search(self, since: date, until: date | None = None, max_pages: int = 200) -> list[dict[str, Any]]:
        """Every PTR filing reference submitted on or after ``since``, oldest first."""
        out: list[dict[str, Any]] = []
        start = 0
        for _ in range(max_pages):
            payload = self.search_page(start, since, until)
            rows = payload.get("data") or []
            out.extend(parse_search_rows(payload))
            start += PAGE_LENGTH
            total = int(payload.get("recordsFiltered") or payload.get("recordsTotal") or 0)
            if len(rows) < PAGE_LENGTH or (total and start >= total):
                break
        return out

    def report_page(self, uuid: str) -> str:
        url = report_url("ptr", uuid)
        final, text = self._open(url, headers={"Referer": SEARCH_URL})
        if urllib.parse.urlparse(final).path.rstrip("/").endswith("/search/home"):
            self.agreed = False
            self.agree()
            final, text = self._open(url, headers={"Referer": SEARCH_URL})
        if not re.search(r"Periodic\s+Transaction\s+Report", text):
            raise Blocked(f"eFD answered {urllib.parse.urlparse(final).path} with a page that is not a report")
        return text


# ---------------------------------------------------------------------------
# Senators: who filed, their seat, their slug
# ---------------------------------------------------------------------------


def load_senators() -> dict[str, list[dict[str, str]]]:
    """last name key -> sitting senators with that last name (party, state, display name)."""
    body = _get(LEGISLATORS_URL, _PTR_CACHE / "legislators-current.json", ttl=7 * 86400)
    out: dict[str, list[dict[str, str]]] = {}
    if not body:
        return out
    for person in json.loads(body):
        term = (person.get("terms") or [{}])[-1]
        if term.get("type") != "sen":
            continue
        name = person.get("name") or {}
        out.setdefault(_name_key(name.get("last", "")), []).append(
            {
                "party": _PARTY.get(term.get("party", ""), ""),
                "state": term.get("state", ""),
                "name": name.get("official_full") or f"{name.get('first', '')} {name.get('last', '')}".strip(),
                "first": name.get("first", ""),
                "nickname": name.get("nickname", ""),
                "last": name.get("last", ""),
            }
        )
    return out


def match_senator(senators: dict[str, list[dict[str, str]]], first: str, last: str) -> dict[str, str] | None:
    """The sitting senator behind a filing, by last name then first initial; None when unsure."""
    found = senators.get(_name_key(last)) or []
    if len(found) == 1:
        return found[0]
    initial = _name_key(first)[:1]
    picked = [person for person in found if initial and initial in (_name_key(person["first"])[:1], _name_key(person["nickname"])[:1])]
    return picked[0] if len(picked) == 1 else None


def display_slug(name: str) -> str:
    """"Gary C. Peters" -> "gary-peters"; "A. Mitchell McConnell, Jr." -> "mitchell-mcconnell"."""
    words = [word for word in re.sub(r",.*$", "", name).split() if not re.fullmatch(r"[A-Za-z]\.?", word)]
    if not words:
        return slugify(name)
    return member_slug(words[0], words[-1] if len(words) > 1 else "")


def filer_key(first: str, last: str) -> str:
    """Who filed, as eFD spells it: last name plus first initial ("banks:j"). Stable from run to run."""
    given = [word for word in (first or "").split() if not re.fullmatch(r"[A-Za-z]\.?", word)] or (first or "").split()
    return f"{_name_key(last)}:{_name_key(given[0] if given else '')[:1]}"


def filing_name(first: str, last: str) -> str:
    """"A. Mitchell" + "McConnell" -> "Mitchell McConnell": the name on the filing, initials left out."""
    given = [word for word in (first or "").split() if not re.fullmatch(r"[A-Za-z]\.?", word)]
    return " ".join(part for part in (given[0] if given else "", last or "") if part)


def assign_slug(key: str, name: str, known: dict[str, str], taken_by_house: set[str]) -> str:
    """The senator's slug: kept from earlier runs, else the plain one, else "-senate" when the House has it."""
    if key in known:
        return known[key]
    slug = display_slug(name)
    if slug in taken_by_house:
        slug = f"{slug}-senate"
    known[key] = slug
    return slug


# ---------------------------------------------------------------------------
# Reports -> trades -> profiles
# ---------------------------------------------------------------------------


def supersede(reports: list[dict[str, Any]]) -> dict[str, str]:
    """original report id -> the amendment that restates it.

    eFD gives no link between an amendment and its original. An amendment restates the
    whole report, so it replaces the senator's report with the same "for" date filed
    before it, preferring one with the same number of rows, then the latest filed.
    """
    replaced: dict[str, str] = {}
    electronic = [item for item in reports if item.get("kind") == "ptr" and item.get("readable")]
    amendments = sorted((item for item in electronic if item.get("amendment")), key=lambda item: (item.get("amendment") or 0, item.get("filed_at") or ""))
    for amendment in amendments:
        candidates = [
            item
            for item in electronic
            if item["uuid"] != amendment["uuid"]
            and item["uuid"] not in replaced
            and item.get("slug") == amendment.get("slug")
            and item.get("title_date") == amendment.get("title_date")
            and (item.get("amendment") or 0) < (amendment.get("amendment") or 0)
            and (item.get("filed_at") or "") <= (amendment.get("filed_at") or "~")
        ]
        if not candidates:
            continue
        same_size = [item for item in candidates if len(item.get("rows") or []) == len(amendment.get("rows") or [])]
        pick = max(same_size or candidates, key=lambda item: item.get("filed_at") or "")
        replaced[pick["uuid"]] = amendment["uuid"]
    return replaced


def _company(asset: str) -> str:
    company = re.sub(r"\s*\([A-Z][A-Z0-9.\-]{0,6}\)\s*$", "", asset or "").strip()
    company = re.sub(r"\s*-\s*(Common Stock|Class [A-C] Common Stock|Ordinary Shares|ETF Shares).*$", "", company).strip()
    company = re.sub(r"\s+(Common Stock|Class [A-C] Common Stock|Ordinary Shares)$", "", company).strip()
    return company[:120]


def build_trades(report: dict[str, Any], member: dict[str, Any], captured_at: str) -> list[dict[str, Any]]:
    """The buys and sales of one electronic report, in the House trade shape."""
    filed = report.get("filed_on") or ""
    out: list[dict[str, Any]] = []
    for row in report.get("rows") or []:
        if row.get("tx_type") not in ("buy", "sell") or not row.get("transaction_date") or not filed:
            continue
        lag = (date.fromisoformat(filed) - date.fromisoformat(row["transaction_date"])).days
        if lag < 0 or lag > 3650:
            continue  # a typo in the report's date
        asset_type = (row.get("asset_type") or "").strip().lower()
        ticker = clean_ptr_ticker(row.get("ticker") or "") if asset_type in _TICKER_ASSET_TYPES else ""
        high = row.get("amount_high")
        low = row.get("amount_low")
        out.append(
            {
                "trade_id": f"{report['uuid']}-{row['number']}",
                "doc_id": report["uuid"],
                "person_id": member["slug"],
                "person_name": member["name"],
                "chamber": "senate",
                "party": member["party"],
                "state": member["state"],
                "district": "",
                "ticker": ticker,
                "company": _company(row.get("asset") or ""),
                "asset_type": row.get("asset_type") or "",
                "tx_type": row["tx_type"],
                "partial": bool(row.get("partial")),
                "owner": row.get("owner") or "self",
                "amount_low": low,
                "amount_high": high if (high or 0) >= (low or 0) else None,
                "est_amount": amount_mid(low, high),
                "transaction_date": row["transaction_date"],
                "disclosure_date": filed,
                "lag_days": lag,
                "source": SOURCE,
                "source_url": report["url"],
                "captured_at": captured_at,
            }
        )
    return out


def report_doc(ref: dict[str, Any], parsed: dict[str, Any] | None, fetched_at: str) -> dict[str, Any]:
    """What we store for one filing: the search row, plus the parsed page for an electronic one."""
    doc = {**ref, "paper": ref["kind"] == "paper", "fetched_at": fetched_at}
    if parsed is None:
        # A paper filing: it exists, it was filed on this day, here is the link. Nothing else is claimed.
        doc.update({"readable": False, "rows": [], "filed_at": "", "filed_on": ref.get("submitted") or ""})
        return doc
    doc.update(
        {
            "readable": bool(parsed["ok"]),
            "rows": parsed["rows"] if parsed["ok"] else [],
            "expected_rows": parsed["expected_rows"],
            "filer": parsed["filer"],
            "filed_at": parsed["filed_at"],
            # The page's Filed stamp; the search date can be a day off from it.
            "filed_on": (parsed["filed_at"] or "")[:10] or ref.get("submitted") or "",
            "title": parsed["title"] or ref.get("title") or "",
            "title_date": parsed["title_date"] or ref.get("title_date") or "",
            "amendment": parsed["amendment"] if parsed["title"] else ref.get("amendment", 0),
        }
    )
    return doc


def build_documents(
    reports: list[dict[str, Any]],
    senators: dict[str, list[dict[str, str]]],
    slugs: dict[str, str],
    taken_by_house: set[str],
    *,
    now_iso: str,
    book: Any = None,
    spy: dict[str, Any] | None = None,
    first_year: int | None = None,
) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, Any]]:
    """Every document the stored reports produce, plus the counts for the meta document.

    ``slugs`` is updated in place with any new senator.
    """
    today = now_iso[:10]
    for report in reports:  # a stored report keeps the slug it was first filed under
        if report.get("slug"):
            slugs.setdefault(filer_key(report.get("first") or "", report.get("last") or ""), report["slug"])
    members: dict[str, dict[str, Any]] = {}
    for report in sorted(reports, key=lambda item: (item.get("filed_on") or "", item.get("uuid") or "")):
        first, last = report.get("first") or "", report.get("last") or ""
        live = match_senator(senators, first, last)
        if live:
            # Stored with the report, so a senator who later leaves keeps the name, party and state
            # they filed under.
            report["seat"] = {"name": live["name"], "party": live["party"], "state": live["state"]}
        seat = live or report.get("seat")
        name = seat["name"] if seat else filing_name(first, last)
        slug = report.get("slug") or assign_slug(filer_key(first, last), name, slugs, taken_by_house)
        report["slug"] = slug
        member = members.setdefault(slug, {"slug": slug, "reports": [], "matched": False})
        # Reports are read oldest first, so the newest one decides the name and seat shown.
        if seat:
            member.update({"name": name, "party": seat["party"], "state": seat["state"], "matched": True})
        elif not member["matched"]:
            member.update({"name": name, "party": "", "state": ""})
        member["sitting"] = bool(live)
        member["reports"].append(report)

    replaced = supersede(reports)
    docs: list[tuple[str, dict[str, Any]]] = []
    all_trades: list[dict[str, Any]] = []
    with_record = 0
    for slug, member in members.items():
        trades: list[dict[str, Any]] = []
        report_rows: list[dict[str, Any]] = []
        activity_reports: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
        replaced_reports: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
        for report in sorted(member["reports"], key=lambda item: (item.get("filed_on") or "", item.get("filed_at") or ""), reverse=True):
            built = build_trades(report, member, now_iso)
            superseded_by = replaced.get(report["uuid"])
            for item in built:
                if superseded_by:
                    item["superseded_by"] = superseded_by
            all_trades.extend(built)
            if superseded_by:
                if built:
                    replaced_reports.append((report, built))
                continue
            trades.extend(built)
            report_rows.append(
                {
                    "doc_id": report["uuid"],
                    "filed_at": report.get("filed_on") or "",
                    "trades": len(built),
                    "buys": sum(1 for row in built if row["tx_type"] == "buy"),
                    "sells": sum(1 for row in built if row["tx_type"] == "sell"),
                    "url": report["url"],
                    "format": "paper" if report.get("paper") else "html",
                    **({"amendment": report["amendment"]} if report.get("amendment") else {}),
                    **({"unreadable": True} if not report.get("paper") and not report.get("readable") else {}),
                }
            )
            if built:
                activity_reports.append((report, built))
        if not trades:
            continue  # only paper or unreadable filings: kept in the reports collection, no profile
        trades.sort(key=lambda item: (item["disclosure_date"], item["transaction_date"], item["trade_id"]), reverse=True)
        performance = None
        if book is not None and spy is not None:
            try:
                performance = congress_performance(
                    trades, book, spy, first_year or int(min(item["disclosure_date"] for item in trades)[:4]),
                    last_report=report_rows[0]["filed_at"], sitting=member["sitting"],
                )
                if performance:
                    performance["method"] = performance["method"].replace("the member has", "the senator has")
            except Exception as error:  # one odd senator should not sink the run
                log(f"{slug}: record failed ({error})")
        with_record += 1 if performance else 0
        stats = member_stats(trades)
        latest_report, latest_trades = activity_reports[0]
        latest = latest_report.get("filed_on") or ""
        party = {"D": "Democrat", "R": "Republican", "I": "Independent"}.get(member["party"], "")
        base = {
            "slug": slug,
            "kind": "congress",
            "name": member["name"],
            "person": "US Senate" + (f", {member['state']}" if member["state"] else ""),
            "chamber": "senate",
            "party": member["party"],
            "state": member["state"],
            "district": "",
            "sitting": member["sitting"],
            "style": " · ".join(part for part in (party, member["state"]) if part),
            "active": (date.fromisoformat(today) - date.fromisoformat(latest)).days <= 365,
            "latest_date": latest,
            "headline": congress_headline(member["name"], latest, latest_trades),
            "stats": stats,
            "first_report": min(row["filed_at"] for row in report_rows if row["filed_at"]),
            "reports_count": len(report_rows),
            "paper_reports": sum(1 for row in report_rows if row["format"] == "paper"),
            "source": SOURCE,
            "source_url": latest_report["url"],
            "updated_at": now_iso,
        }
        docs.append((f"tm_follow_people/{slug}", {**base, "trades": trades[:PROFILE_TRADES], "trades_total": len(trades),
                                                  "reports": report_rows[:80], "performance": performance}))
        docs.append((f"tm_follow_sources/{slug}", {**base, "id": slug, "top_holdings": stats["top_bought"], "performance": perf_card(performance)}))
        # A restated original's event is written again, marked, so one stored by an earlier run
        # (before its amendment arrived) drops out of the feed instead of showing twice.
        for report, built in activity_reports + replaced_reports:
            filed = report.get("filed_on") or ""
            if (date.fromisoformat(today) - date.fromisoformat(filed)).days > ACTIVITY_DAYS:
                continue
            ranked = sorted(built, key=lambda row: -(row.get("est_amount") or 0))
            traded = sorted(row["transaction_date"] for row in built)
            activity_id = f"{slug}__{filed}__{report['uuid']}"
            docs.append(
                (
                    f"tm_follow_activity/{activity_id}",
                    {
                        "id": activity_id,
                        "source_id": slug,
                        "kind": "congress",
                        "chamber": "senate",
                        "type": "ptr",
                        "name": member["name"],
                        "person": base["person"],
                        "party": member["party"],
                        "date": filed,
                        "traded_from": traded[0],
                        "traded_to": traded[-1],
                        "headline": congress_headline(member["name"], filed, built),
                        "counts": {"buys": sum(1 for row in built if row["tx_type"] == "buy"),
                                   "sells": sum(1 for row in built if row["tx_type"] == "sell")},
                        "items": [
                            {"action": row["tx_type"], "ticker": row["ticker"] or None, "name": row["company"],
                             "amount_low": row["amount_low"], "amount_high": row["amount_high"],
                             "transaction_date": row["transaction_date"]}
                            for row in ranked[:6]
                        ],
                        "url": report["url"],
                        "source": SOURCE,
                        "updated_at": now_iso,
                        **({"superseded_by": replaced[report["uuid"]]} if report["uuid"] in replaced else {}),
                    },
                )
            )
    docs.extend((f"tm_follow_trades/{item['trade_id']}", item) for item in all_trades)
    profiles = sum(1 for path, _ in docs if path.startswith("tm_follow_people/"))
    counts = {
        "reports": len(reports),
        "electronic_reports": sum(1 for item in reports if item.get("kind") == "ptr"),
        "paper_filings": sum(1 for item in reports if item.get("paper")),
        "unreadable_reports": sum(1 for item in reports if item.get("kind") == "ptr" and not item.get("readable")),
        "amended_originals": len(replaced),
        "filers": len(members),
        "senators": profiles,
        "senators_with_record": with_record,
        "trades": sum(1 for item in all_trades if not item.get("superseded_by")),
        "trades_with_ticker": sum(1 for item in all_trades if item["ticker"] and not item.get("superseded_by")),
    }
    return docs, counts


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------


def window_start(meta: dict[str, Any] | None, today: date, backfill_days: int | None, since: str | None) -> date:
    """Where this run's search starts: an explicit date, a backfill, or a month before the newest filing seen."""
    if since:
        return date.fromisoformat(since)
    if backfill_days:
        return today - timedelta(days=backfill_days)
    high_water = (meta or {}).get("high_water") or ""
    if high_water:
        return date.fromisoformat(high_water) - timedelta(days=OVERLAP_DAYS)
    return today - timedelta(days=DEFAULT_BACKFILL_DAYS)


def read_new(client: EfdClient, refs: list[dict[str, Any]], held: dict[str, dict[str, Any]], *, now_iso: str, limit: int = 0) -> tuple[list[dict[str, Any]], str]:
    """Read the filings we do not hold yet (and electronic ones we could not read last time).

    Returns the report documents and the newest submitted date it is safe to move the
    high-water mark to: just before the first filing that failed, so the next run asks again.
    A refusal (``Blocked``) is not caught here; the run stops on it.
    """
    def wanted(ref: dict[str, Any]) -> bool:
        stored = held.get(f"{REPORTS}/{ref['uuid']}")
        return stored is None or (ref["kind"] == "ptr" and not stored.get("readable"))

    fresh = [ref for ref in refs if wanted(ref)]
    if limit:
        fresh = fresh[:limit]
    log(f"{len(fresh)} to read ({len(held)} already stored)")
    docs: list[dict[str, Any]] = []
    failed: list[str] = []
    for index, ref in enumerate(fresh, start=1):
        if ref["kind"] == "paper":
            docs.append(report_doc(ref, None, now_iso))
            continue
        try:
            parsed = parse_report(client.report_page(ref["uuid"]))
        except (urllib.error.HTTPError, RuntimeError) as error:
            # One dead link must not sink the run; the filing is asked for again next time.
            log(f"{ref['uuid']}: skipped ({error})")
            failed.append(ref.get("submitted") or "")
            continue
        if not parsed["ok"]:
            log(f"{ref['uuid']}: could not read the table ({len(parsed['rows'])} rows, page says {parsed['expected_rows']})")
        docs.append(report_doc(ref, parsed, now_iso))
        if index % 25 == 0:
            log(f"{index}/{len(fresh)} reports read")
    newest = max((ref.get("submitted") or "" for ref in refs), default="")
    if failed:
        first_failed = min(day for day in failed if day) if any(failed) else ""
        newest = min(newest, (date.fromisoformat(first_failed) - timedelta(days=1)).isoformat()) if first_failed else ""
    return docs, newest


def main(argv: list[str] | None = None) -> int:
    from .store import DocStore

    parser = argparse.ArgumentParser(description="Ingest Senate periodic transaction reports from eFD.")
    parser.add_argument("--backfill-days", type=int, default=0, help=f"search this many days back (first run: {DEFAULT_BACKFILL_DAYS})")
    parser.add_argument("--since", default="", help="search from this date (YYYY-MM-DD)")
    parser.add_argument("--limit", type=int, default=0, help="read at most this many new reports (for a quick check)")
    parser.add_argument("--rebuild-only", action="store_true", help="no eFD requests; rebuild profiles from stored reports")
    parser.add_argument("--skip-prices", action="store_true", help="no price fetch and no record")
    parser.add_argument("--dry-run", action="store_true", help="read eFD but write nothing")
    parser.add_argument("--force", action="store_true", help=f"run even without {ENABLE_FLAG}=1")
    args = parser.parse_args(argv)
    if not (args.force or args.dry_run or args.rebuild_only or os.getenv(ENABLE_FLAG, "").strip() == "1"):
        log(f"off: set {ENABLE_FLAG}=1 (or pass --force) to run")
        return 0

    store = DocStore.from_env()
    writer = None if args.dry_run else store
    now_iso = datetime.now(timezone.utc).isoformat()
    today = date.fromisoformat(now_iso[:10])
    meta = store.get(META_PATH) or {}
    log(f"store: {store.mode}{' (dry run, no writes)' if args.dry_run else ''}")

    new_docs: list[dict[str, Any]] = []
    high_water = meta.get("high_water") or ""
    requests = 0
    if not args.rebuild_only:
        start = window_start(meta, today, args.backfill_days or None, args.since or None)
        client = EfdClient()
        try:
            refs = client.search(start)
            log(f"search from {start}: {len(refs)} senator PTR filings")
            held = store.get_many([f"{REPORTS}/{ref['uuid']}" for ref in refs]) if refs else {}
            new_docs, newest = read_new(client, refs, held, now_iso=now_iso, limit=args.limit)
        except Blocked as error:
            log(f"STOPPED: {error}. eFD refuses this client; nothing was written. Not retrying.")
            return 2
        finally:
            requests = client.requests
        # Never backwards (an explicit --since run of an old window keeps the newer mark).
        high_water = max(high_water, newest) if not args.limit else high_water

    stored = [data for _, data in store.list(REPORTS, 5000)]
    by_id = {doc["uuid"]: doc for doc in stored if doc.get("uuid")}
    for doc in new_docs:
        by_id[doc["uuid"]] = doc
    reports = list(by_id.values())
    if not reports:
        log("no reports stored or read; nothing to build")
        return 0

    senators = load_senators()
    if not senators:
        # Without the list of sitting senators every name, party and state would come out wrong
        # and slugs could move. Keep what was read; profiles wait for the next run.
        log("could not load the list of sitting senators; storing the reports only")
        if writer is not None and new_docs:
            written = writer.set_many((f"{REPORTS}/{doc['uuid']}", doc) for doc in new_docs)
            log(f"wrote {written} report documents")
        return 1
    slugs: dict[str, str] = dict(meta.get("slugs") or {})
    taken_by_house = {
        data.get("slug") for _, data in store.list("tm_follow_sources", 5000)
        if data.get("kind") == "congress" and data.get("chamber") != "senate" and data.get("slug")
    }

    book = spy = None
    if not args.skip_prices:
        from . import prices
        from .funds_13f import PriceBook, _index_on_or_after

        tickers = sorted({
            clean_ptr_ticker(row.get("ticker") or "") for doc in reports for row in doc.get("rows") or []
            if row.get("tx_type") == "buy" and (row.get("asset_type") or "").strip().lower() in _TICKER_ASSET_TYPES
        } - {""})
        if tickers:
            log(f"prices: {len(tickers)} tickers plus SPY")
            series = prices.load_many(["SPY"] + tickers, store=None)
            spy = series.get("SPY")
            filed = [doc.get("filed_on") for doc in reports if doc.get("filed_on")]
            if spy and filed:
                first = _index_on_or_after(spy["dates"], min(filed)) or 0
                book = PriceBook(spy["dates"][max(0, first - 1) :], series)

    docs, counts = build_documents(reports, senators, slugs, taken_by_house, now_iso=now_iso, book=book, spy=spy)
    # New report documents go out with the slug build_documents gave them, so later runs keep it.
    docs = [(f"{REPORTS}/{doc['uuid']}", doc) for doc in new_docs] + docs
    run_meta = {
        **counts,
        "generated_at": now_iso,
        "high_water": high_water,
        "new_reports": len(new_docs),
        "new_paper_filings": sum(1 for doc in new_docs if doc.get("paper")),
        "requests": requests,
        "slugs": slugs,
        "docs": len(docs),
        "source": f"{SOURCE}; party and state from the unitedstates/congress-legislators project; prices from Yahoo Finance",
        "source_url": SOURCE_HOME,
    }
    log(json.dumps({key: value for key, value in run_meta.items() if key != "slugs"}, indent=2))
    if writer is None:
        log(f"dry run: {len(docs)} documents not written")
        return 0
    written = writer.set_many(docs)
    if not args.limit:
        writer.set(META_PATH, run_meta)
    log(f"wrote {written} documents")
    return 0


if __name__ == "__main__":
    sys.exit(main())
