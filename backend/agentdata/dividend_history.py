"""Past dividend payments per stock, for the dividend planner (``tm_dividend_history``).

Source: the same Yahoo chart endpoint ``prices.py`` reads, asked for dividend
events. Each event is an ex-dividend date and the cash amount per share,
already adjusted for later splits (NVDA's 2023 $0.04 comes back as $0.004).
Yahoo gives no payment dates, so the typical gap between ex-date and payment is
taken from the Nasdaq dividend calendar rows already stored in
``tm_agent_calendar`` (``calendar_events.py``) when there are any.

One document per symbol in ``tm_dividend_history/{SYMBOL}``::

    {symbol, payments: [{ex_date, amount, special}], count, first_ex_date,
     last_ex_date, frequency, per_year, ttm_amount, ttm_count, latest_amount,
     year_ago_amount, pay_lag_days, pay_lag_samples, years, source,
     source_name, fetched_at}

A stock that paid nothing in the window still gets a document with an empty
``payments`` list and ``frequency: "none"``, so a reader can tell "pays no
dividend" from "not fetched". Writes are additive: one document per symbol,
replaced on each run, never deleted.

Run: ``python3 -m backend.agentdata.dividend_history [--symbols KO,PEP] [--years 3]``
"""

from __future__ import annotations

import argparse
import statistics
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

from .feeds_common import load_universe, query
from .prices import _fetch_chart, doc_id
from .store import DocStore

COLLECTION = "tm_dividend_history"
META_PATH = "tm_dividend_history_meta/US"
CALENDAR = "tm_agent_calendar"
DEFAULT_YEARS = 3

# Median gap between ex-dates -> payments per year. A cadence outside every
# band (a one-off, or gaps all over the place) is "irregular".
_CADENCES: tuple[tuple[int, int, str, int], ...] = (
    (20, 45, "monthly", 12),
    (70, 110, "quarterly", 4),
    (150, 210, "semiannual", 2),
    (320, 410, "annual", 1),
)
# A payment this many times the stock's usual amount is a special dividend.
_SPECIAL_MULTIPLE = 2.5


def parse_events(result: dict[str, Any] | None) -> list[dict[str, Any]]:
    """``[{ex_date, amount}]`` oldest first from a Yahoo chart result. Bad rows are dropped."""
    if not isinstance(result, dict):
        return []
    events = result.get("events") or {}
    raw = events.get("dividends") if isinstance(events, dict) else None
    if not isinstance(raw, dict):
        return []
    by_day: dict[str, float] = {}
    for item in raw.values():
        if not isinstance(item, dict):
            continue
        amount = item.get("amount")
        stamp = item.get("date")
        if not isinstance(amount, (int, float)) or amount <= 0 or not isinstance(stamp, (int, float)):
            continue
        # Yahoo stamps an event at the session open (13:30 or 14:30 UTC), so the UTC date is the ex-date.
        day = datetime.fromtimestamp(int(stamp), tz=timezone.utc).date().isoformat()
        by_day[day] = round(by_day.get(day, 0.0) + float(amount), 6)
    return [{"ex_date": day, "amount": amount} for day, amount in sorted(by_day.items())]


def mark_specials(payments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag one-off special dividends so they are not projected forward.

    A special is a spike: far above the payment before it and far above the
    one after it (the oldest payment in the window: above the two after it).
    A jump that holds (NVDA going from $0.01 to $0.25) is a raise, not a
    special. The newest payment has nothing after it, so a jump there only
    counts as a raise when it lands on the usual cadence (within 20% of the
    usual gap); off the cadence (Costco's $15 nine weeks after a regular
    payment) it is a special. Reading a fresh raise as a special understates
    one quarter; the other mistake would repeat a one-off every quarter.
    """
    out = [{**payment, "special": False} for payment in payments]
    gaps = [
        (date.fromisoformat(b["ex_date"]) - date.fromisoformat(a["ex_date"])).days for a, b in zip(payments, payments[1:])
    ]
    usual_gap = statistics.median(gaps) if gaps else None
    if len(payments) >= 3:
        # The oldest payment in the window has nothing before it: a spike over the next two is a special.
        first = payments[0]["amount"]
        out[0]["special"] = first > payments[1]["amount"] * _SPECIAL_MULTIPLE and first > payments[2]["amount"] * _SPECIAL_MULTIPLE
    for index in range(1, len(payments)):
        amount = payments[index]["amount"]
        before = payments[index - 1]["amount"]
        if amount <= before * _SPECIAL_MULTIPLE:
            continue
        if index + 1 < len(payments):
            out[index]["special"] = payments[index + 1]["amount"] * _SPECIAL_MULTIPLE < amount
        elif usual_gap:
            out[index]["special"] = abs(gaps[index - 1] - usual_gap) > usual_gap * 0.2
    return out


def infer_frequency(payments: list[dict[str, Any]], today: date) -> tuple[str, int | None]:
    """``(label, per_year)`` from the gaps between the last two years of regular payments."""
    regular = [payment for payment in payments if not payment.get("special")]
    if not regular:
        return "none", None
    cutoff = (today - timedelta(days=2 * 366)).isoformat()
    recent = [payment for payment in regular if payment["ex_date"] >= cutoff] or regular[-2:]
    if len(recent) < 2:
        # One payment: a new payer, or a once-a-year one. Look further back before calling it.
        recent = regular[-3:]
    if len(recent) < 2:
        return "irregular", None
    days = [date.fromisoformat(payment["ex_date"]) for payment in recent]
    gaps = [(b - a).days for a, b in zip(days, days[1:]) if (b - a).days > 0]
    if not gaps:
        return "irregular", None
    gap = statistics.median(gaps)
    for low, high, label, per_year in _CADENCES:
        if low <= gap <= high:
            return label, per_year
    return "irregular", None


def pay_lags(rows: Iterable[dict[str, Any]]) -> dict[str, list[int]]:
    """Days from ex-date to payment per ticker, from stored Nasdaq calendar rows."""
    out: dict[str, list[int]] = {}
    for row in rows:
        if row.get("kind") != "dividend" or row.get("superseded"):
            continue
        ticker = str(row.get("ticker") or "").strip().upper()
        ex_raw, pay_raw = row.get("date"), row.get("payment_date")
        if not ticker or not isinstance(ex_raw, str) or not isinstance(pay_raw, str):
            continue
        try:
            lag = (date.fromisoformat(pay_raw[:10]) - date.fromisoformat(ex_raw[:10])).days
        except ValueError:
            continue
        if 0 <= lag <= 120:
            out.setdefault(ticker, []).append(lag)
    return out


def build_doc(
    symbol: str,
    payments: list[dict[str, Any]],
    *,
    today: date,
    years: int,
    lags: list[int] | None,
    now_iso: str,
) -> dict[str, Any]:
    marked = mark_specials(payments)
    frequency, per_year = infer_frequency(marked, today)
    year_ago = (today - timedelta(days=365)).isoformat()
    ttm = [payment for payment in marked if payment["ex_date"] > year_ago]
    regular = [payment for payment in marked if not payment["special"]]
    latest = regular[-1]["amount"] if regular else None
    # The regular payment about a year before the latest one: the base for "raised it X%".
    # Only when both sit on the same cadence: a switch from quarterly to monthly is not a cut.
    year_ago_amount = None
    if len(regular) >= 3 and per_year:
        days = [date.fromisoformat(payment["ex_date"]) for payment in regular]
        target = days[-1] - timedelta(days=365)
        candidates = [i for i in range(1, len(regular) - 1) if abs((days[i] - target).days) <= 60]
        if candidates:
            i = min(candidates, key=lambda k: abs((days[k] - target).days))
            gap_then = (days[i] - days[i - 1]).days
            gap_now = (days[-1] - days[-2]).days
            if gap_then > 0 and 0.6 <= gap_now / gap_then <= 1.6:
                year_ago_amount = regular[i]["amount"]
    return {
        "symbol": symbol,
        "payments": marked,
        "count": len(marked),
        "first_ex_date": marked[0]["ex_date"] if marked else None,
        "last_ex_date": marked[-1]["ex_date"] if marked else None,
        "frequency": frequency,
        "per_year": per_year,
        "ttm_amount": round(sum(payment["amount"] for payment in ttm), 6) if ttm else 0.0,
        "ttm_count": len(ttm),
        "latest_amount": latest,
        "year_ago_amount": year_ago_amount,
        "pay_lag_days": int(statistics.median(lags)) if lags else None,
        "pay_lag_samples": len(lags or []),
        "years": years,
        "source": "yahoo_chart",
        "source_name": "Yahoo Finance dividend history",
        "fetched_at": now_iso,
    }


def recently_paid(existing: dict[str, Any] | None, today: date) -> bool:
    """True when a stored document shows a payment in the last 400 days."""
    last = (existing or {}).get("last_ex_date")
    return isinstance(last, str) and last >= (today - timedelta(days=400)).isoformat()


def run(
    *,
    symbols: list[str] | None = None,
    years: int = DEFAULT_YEARS,
    pause: float = 0.25,
    dry_run: bool = False,
    store: DocStore | None = None,
) -> dict[str, Any]:
    store = store or DocStore.from_env()
    # The covered stocks plus the ETFs the x-ray opens up (VOO, QQQ...), which pay dividends too.
    from .etf_holdings import DEFAULT_ETFS

    wanted = symbols or [instrument.ticker for instrument in load_universe(store)] + list(DEFAULT_ETFS)
    wanted = list(dict.fromkeys(symbol.strip().upper() for symbol in wanted if symbol and symbol.strip()))
    today = datetime.now(timezone.utc).date()
    # Calendar rows are never retired; a recent window keeps the read under the service's 10,000 cap.
    since = (today - timedelta(days=400)).isoformat()
    lags = pay_lags(
        data for _path, data in query(store, CALENDAR, filters=[("kind", "==", "dividend"), ("date", ">=", since)], limit=10000)
    )
    now_iso = datetime.now(timezone.utc).isoformat()

    written = payers = 0
    missing: list[str] = []
    kept: list[str] = []
    pending: list[tuple[str, dict[str, Any]]] = []
    for index, symbol in enumerate(wanted, start=1):
        result = _fetch_chart(symbol, years)
        if not result or not result.get("timestamp"):
            # No chart, or a degraded one with no prices: leave any earlier document alone rather than claim "no dividend".
            missing.append(symbol)
        else:
            path = f"{COLLECTION}/{doc_id(symbol)}"
            doc = build_doc(symbol, parse_events(result), today=today, years=years, lags=lags.get(symbol), now_iso=now_iso)
            if not doc["count"] and recently_paid(store.get(path), today):
                # Payments on record a moment ago and none now is a bad response, not a stopped dividend.
                kept.append(symbol)
            else:
                payers += 1 if doc["count"] else 0
                pending.append((path, doc))
        if not dry_run and len(pending) >= 25:
            written += store.set_many(pending)
            pending = []
        if index % 50 == 0:
            print(f"[dividends] {index}/{len(wanted)} read, {payers} pay, {len(missing)} missing", flush=True)
        time.sleep(pause)

    summary = {
        "symbols": len(wanted),
        "payers": payers,
        "missing": missing,
        "kept": kept,
        "with_pay_lag": sum(1 for symbol in wanted if symbol in lags),
        "generated_at": now_iso,
        "years": years,
        "source": "yahoo_chart",
    }
    if not dry_run:
        if pending:
            written += store.set_many(pending)
        # The meta document is only refreshed by a full run, so a spot fix never claims to be the whole set.
        if not symbols:
            store.set_many([(META_PATH, summary)])
    summary["written"] = written
    print(f"[dividends] done: {summary['symbols']} symbols, {payers} pay, {written} written, missing {missing[:12]}", flush=True)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--symbols", default="", help="Comma-separated list; default is the covered US universe plus the x-ray ETFs.")
    parser.add_argument("--years", type=int, default=DEFAULT_YEARS)
    parser.add_argument("--pause", type=float, default=0.25)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    symbols = [part for part in args.symbols.split(",") if part.strip()] or None
    run(symbols=symbols, years=args.years, pause=args.pause, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
