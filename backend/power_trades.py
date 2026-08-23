"""Power trades: STOCK Act disclosures for a curated politician watchlist.

Two free sources over the official House/Senate PTR filings:
- Bargo congress API: per-member queries, clean JSON, includes perf since trade
- CongressInvests recent feed as failover with a different shape

Both normalize into one canonical row schema so storage and the frontend never
see source quirks. Amounts stay ranges (filings never carry exact sizes).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

import requests

BARGO_TRADES_URL = "https://www.bargo.ai/free-apis/congress/v1/trades"
BARGO_MEMBERS_URL = "https://www.bargo.ai/free-apis/congress/v1/members"
CI_RECENT_URL = "https://congressinfor-production.up.railway.app/trades/recent"

DEFAULT_DAYS = 45
REQUEST_TIMEOUT = 25
MAX_PAGES_PER_MEMBER = 5
PAGE_SIZE = 100
CI_PAGE_SIZE = 50
CI_MAX_PAGES = 30
BARGO_QUERY_PAUSE_SECONDS = 2.0
BARGO_MAX_ATTEMPTS = 4
BARGO_MAX_PAGES_ANON = 25  # anonymous quota is 30 requests/day; keep headroom
BARGO_MAX_PAGES_KEYED = 200

_TX_MAP = {
    "purchase": "buy",
    "buy": "buy",
    "sale": "sell",
    "sell": "sell",
    "exchange": "exchange",
}

_SUFFIX_TOKENS = {"jr", "sr", "ii", "iii", "iv", "mr", "ms", "mrs"}


def load_watchlist() -> dict[str, Any]:
    from backend.env import resolve_backend_path

    path = resolve_backend_path("config/power_watchlist.json")
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _norm_name(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def match_member(raw_name: str, members: list[dict[str, Any]]) -> dict[str, Any] | None:
    norm_raw = _norm_name(raw_name)
    raw_tokens = {t for t in norm_raw.split() if t not in _SUFFIX_TOKENS}
    if not raw_tokens:
        return None
    for member in members:
        candidates = [member.get("name", "")] + list(member.get("aliases") or [])
        for candidate in candidates:
            norm_cand = _norm_name(candidate)
            cand_tokens = {t for t in norm_cand.split() if t not in _SUFFIX_TOKENS}
            if not cand_tokens:
                continue
            if norm_raw == norm_cand or raw_tokens == cand_tokens:
                return member
            # "michael rulli" vs "michael a rulli" style subset match
            if cand_tokens.issubset(raw_tokens) or raw_tokens.issubset(cand_tokens):
                return member
    return None


def parse_amount_range(text: str) -> tuple[float | None, float | None]:
    numbers = [float(n.replace(",", "")) for n in re.findall(r"\d[\d,]*", str(text or ""))]
    if len(numbers) >= 2:
        return numbers[0], numbers[1]
    if len(numbers) == 1:
        return numbers[0], None
    return None, None


def _iso_date(value: Any) -> str:
    return str(value or "").strip()[:10]


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", "").replace("$", ""))
    except ValueError:
        return None


def _lag_days(transaction_date: str, disclosure_date: str) -> int | None:
    try:
        tx = datetime.strptime(transaction_date, "%Y-%m-%d").date()
        disc = datetime.strptime(disclosure_date, "%Y-%m-%d").date()
    except ValueError:
        return None
    return (disc - tx).days


def trade_id(person_id: str, ticker: str, tx_type: str, transaction_date: str, amount_low: Any, amount_high: Any) -> str:
    key = "|".join(
        [
            person_id,
            ticker.strip().lower(),
            tx_type,
            transaction_date,
            str(amount_low),
            str(amount_high),
        ]
    )
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def _base_row(member: dict[str, Any]) -> dict[str, Any]:
    return {
        "person_id": member["id"],
        "person_name": member.get("name", ""),
        "chamber": member.get("chamber", ""),
        "party": member.get("party", ""),
        "state": member.get("state", ""),
    }


def normalize_bargo(trade: dict[str, Any], member: dict[str, Any], captured_at: str) -> dict[str, Any]:
    tx_type = _TX_MAP.get(str(trade.get("type", "")).strip().lower(), "")
    low = _as_float(trade.get("amount_low"))
    high = _as_float(trade.get("amount_high"))
    transaction_date = _iso_date(trade.get("transaction_date"))
    disclosure_date = _iso_date(trade.get("disclosure_date"))
    ticker = str(trade.get("ticker") or "").strip().upper()
    perf = _as_float(trade.get("perf_pct"))
    row = _base_row(member)
    row.update(
        {
            "trade_id": trade_id(row["person_id"], ticker, tx_type, transaction_date, low, high),
            "ticker": ticker,
            "company": str(trade.get("asset") or "").strip(),
            "tx_type": tx_type,
            "amount_low": _as_float(trade.get("amount_low")),
            "amount_high": _as_float(trade.get("amount_high")),
            "transaction_date": transaction_date,
            "disclosure_date": disclosure_date,
            "lag_days": _lag_days(transaction_date, disclosure_date),
            "perf_pct": perf,
            "source": "bargo",
            "source_url": str(trade.get("filing_portal") or "").strip(),
            "captured_at": captured_at,
        }
    )
    return row


def normalize_ci(trade: dict[str, Any], member: dict[str, Any], captured_at: str) -> dict[str, Any]:
    tx_type = _TX_MAP.get(str(trade.get("trade_type", "")).strip().lower(), "")
    low, high = parse_amount_range(str(trade.get("amount") or ""))
    transaction_date = _iso_date(trade.get("tx_date"))
    disclosure_date = _iso_date(trade.get("disclosed"))
    chamber = str(trade.get("chamber") or "").strip().lower()
    ticker = str(trade.get("ticker") or "").strip().upper()
    row = _base_row(member)
    if chamber and not row["chamber"]:
        row["chamber"] = chamber
    row.update(
        {
            "trade_id": trade_id(row["person_id"], ticker, tx_type, transaction_date, low, high),
            "ticker": ticker,
            "company": str(trade.get("asset") or "").strip(),
            "tx_type": tx_type,
            "amount_low": low,
            "amount_high": high,
            "transaction_date": transaction_date,
            "disclosure_date": disclosure_date,
            "lag_days": _lag_days(transaction_date, disclosure_date),
            "perf_pct": None,
            "source": "congressinvests",
            "source_url": str(trade.get("link") or "").strip(),
            "captured_at": captured_at,
        }
    )
    return row


def dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        tid = str(row.get("trade_id") or "")
        if not tid:
            continue
        if tid not in by_id:
            by_id[tid] = row
        elif row.get("source") == "bargo":
            by_id[tid] = row
    out = list(by_id.values())
    out.sort(key=lambda r: (str(r.get("transaction_date") or ""), str(r.get("disclosure_date") or "")), reverse=True)
    return out


def _cutoff_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=max(1, days))).strftime("%Y-%m-%d")


class SourceError(RuntimeError):
    pass


_BARGO_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


def _bargo_get(
    session: requests.Session,
    url: str,
    params: dict[str, Any],
    api_key: str | None = None,
) -> requests.Response:
    """GET with patience: wait out 429s, and carry a browser UA because
    datacenter IPs get a Cloudflare challenge under curl's default one."""
    headers = {"User-Agent": _BARGO_UA, "Accept": "application/json"}
    key = api_key or os.environ.get("BARGO_API_KEY", "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    last_resp: requests.Response | None = None
    for attempt in range(BARGO_MAX_ATTEMPTS):
        resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT, headers=headers)
        if resp.status_code != 429:
            return resp
        last_resp = resp
        try:
            wait = float(resp.headers.get("Retry-After") or "")
        except ValueError:
            wait = 0.0
        time.sleep(max(wait, 6.0 * (attempt + 1)))
    assert last_resp is not None
    raise SourceError(f"bargo 429 after {BARGO_MAX_ATTEMPTS} attempts for {params}")


def fetch_bargo_global(
    session: requests.Session,
    members: list[dict[str, Any]],
    *,
    days: int,
    max_pages: int | None = None,
) -> dict[str, Any]:
    """Page the global feed newest-first down to floor_date, keeping watchlist rows.

    Telemetry reports whether the sweep drained to the floor or hit the page
    cap; a free BARGO_API_KEY raises limits so full-depth runs fit easily.
    """
    floor_date = _cutoff_iso(days)
    if max_pages is None:
        max_pages = BARGO_MAX_PAGES_KEYED if os.environ.get("BARGO_API_KEY", "").strip() else BARGO_MAX_PAGES_ANON
    captured_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []
    pages = 0
    exhausted = False
    reached_floor = False
    oldest_seen: str | None = None
    for page in range(max_pages):
        resp = _bargo_get(
            session,
            BARGO_TRADES_URL,
            {"limit": PAGE_SIZE, "page": page},
        )
        if resp.status_code != 200:
            raise SourceError(f"bargo HTTP {resp.status_code}")
        payload = resp.json() or {}
        trades = payload.get("trades") or []
        pages += 1
        for trade in trades:
            tx_date = _iso_date(trade.get("transaction_date"))
            if tx_date:
                oldest_seen = tx_date if oldest_seen is None or tx_date < oldest_seen else oldest_seen
            if tx_date and tx_date < floor_date:
                continue
            member = match_member(str(trade.get("member") or ""), members)
            if member:
                rows.append(normalize_bargo(trade, member, captured_at))
        if len(trades) < PAGE_SIZE:
            exhausted = True
            break
        if oldest_seen is not None and oldest_seen < floor_date:
            reached_floor = True
            break
    return {
        "rows": dedupe(rows),
        "pages": pages,
        "exhausted": exhausted or reached_floor,
        "oldest_seen": oldest_seen,
    }


def fetch_congressinvests(session: requests.Session, members: list[dict[str, Any]], days: int) -> list[dict[str, Any]]:
    """Failover source; observed to lag the official filings by weeks/months."""
    cutoff = _cutoff_iso(days)
    captured_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []
    offset = 0
    for _ in range(CI_MAX_PAGES):
        resp = session.get(
            CI_RECENT_URL,
            params={"offset": offset, "limit": CI_PAGE_SIZE},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            raise SourceError(f"congressinvests HTTP {resp.status_code}")
        payload = resp.json() or {}
        trades = payload.get("trades") or []
        if not trades:
            break
        stale_page = True
        for trade in trades:
            tx_date = _iso_date(trade.get("tx_date"))
            if tx_date >= cutoff:
                stale_page = False
                member = match_member(str(trade.get("member") or ""), members)
                if member:
                    rows.append(normalize_ci(trade, member, captured_at))
        if stale_page or not payload.get("has_more"):
            break
        offset += CI_PAGE_SIZE
    return rows


def collect(
    days: int = DEFAULT_DAYS,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """Sweep the rolling window, preferring Bargo and failing over gracefully."""
    watchlist = load_watchlist()
    members = watchlist.get("members") or []
    sess = session or requests.Session()
    errors: list[str] = []
    try:
        result = fetch_bargo_global(sess, members, days=days)
        result.update({"source": "bargo", "errors": errors})
        return result
    except Exception as exc:
        errors.append(f"bargo: {exc}")
    try:
        rows = fetch_congressinvests(sess, members, days)
        return {
            "rows": dedupe(rows),
            "source": "congressinvests",
            "errors": errors,
            "pages": 0,
            "exhausted": True,
            "oldest_seen": None,
        }
    except Exception as exc:
        errors.append(f"congressinvests: {exc}")
        raise RuntimeError("; ".join(errors)) from exc


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    buys = sum(1 for r in rows if r.get("tx_type") == "buy")
    sells = sum(1 for r in rows if r.get("tx_type") == "sell")
    people = sorted({str(r.get("person_id")) for r in rows})
    return {"total": len(rows), "buys": buys, "sells": sells, "people": len(people)}
