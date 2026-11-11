"""Copy the smart money, tested: what copying each fund and member of Congress would have made.

For every 13F fund in ``funds_13f.FUNDS`` and every House member and senator with
reported trades (house_ptr.py and senate_ptr.py), this replays a copy portfolio over stored daily closes and
writes one document per source plus a ranked hub:

* ``tm_copy_trades/{slug}``       the record, curve, yearly returns, trades, best and worst positions
* ``tm_copy_trades_meta/hub``     one row per source for the ranked hub

The rules (stated on every page in one sentence):

* Funds: on the first trading day after each 13F became public, buy its 50
  largest stock positions at that day's close, sized like the fund's
  portfolio (scaled up over the ones we can price), and sell whatever it
  dropped or cut. From the first filing published in 2020.
* Members of Congress: on the first trading day after each report became public,
  buy every stock they reported buying, sized by the middle of the reported
  amount bracket, and sell when they report a sale (a partial sale sells that
  amount). From the first purchase reported since 2023.

No look-ahead: the only date used is the date the public could have known
(the 13F filing date or the House report date), never the trade date, and
the copy trades at the close of the session *after* that date, because
filings often land after the close. A 13F amendment counts on its own filing
date (``funds_13f.build_periods`` keeps what a follower knew on each day).

Prices are adjusted daily closes (splits and dividends), read from
``tm_price_history_daily`` and, for anything not stored there, from the same
cached Yahoo series the follow jobs use. A stock with no real close within a
few sessions of the entry day is skipped and counted. A series that stops
while held keeps its last price, as if it had gone to cash.

Run it::

    python3 -m backend.agentdata.copy_trades --dry-run
    python3 -m backend.agentdata.copy_trades --only berkshire-hathaway,nancy-pelosi --dry-run
    COPY_TRADES_ENABLED=1 python3 -m backend.agentdata.copy_trades   # what the weekly group runs

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from bisect import bisect_right
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

from . import prices
from .funds_13f import (
    DEFAULT_SINCE,
    ENTRY_TOLERANCE_SESSIONS,
    FUNDS,
    INACTIVE_AFTER_DAYS,
    PERF_TOP_N,
    CusipMap,
    _FILING_CACHE,
    build_periods,
    cik_since,
    display_name,
    event_weights,
    fund_ciks,
    shift_months,
)
from .store import DocStore

COLLECTION = "tm_copy_trades"
HUB_PATH = "tm_copy_trades_meta/hub"
FUND_START = "2020-01-01"
START_VALUE = 10_000.0
# Enough record to rank: a year of sessions, most of the book priced, and a few real trades.
MIN_SESSIONS = 504  # about two years: shorter records swing too much on one or two stocks to rank
STOPPED_AFTER_DAYS = 92  # a record that ended more than about three months ago is shown, not ranked
MIN_FUND_COVERAGE = 0.5
MIN_FUND_FILINGS = 4
MIN_CONGRESS_BUYS = 5
RESIZE_BAND = 0.005  # a weight change smaller than half a percent of the copy is not a trade
TOP_POSITIONS = 6
CURVE_STEP = 5
PRICE_YEARS = 12
ENABLE_FLAG = "COPY_TRADES_ENABLED"

FUND_RULE = (
    "Buy the 50 largest stock positions in each 13F at the close of the first trading day after it became public, "
    "sized like the fund's portfolio, and sell what it dropped or cut when the next filing shows it."
)
FUND_CAVEAT = (
    "13F filings arrive up to 45 days after each quarter ends, so the copy always trades late; the future can differ."
)
CONGRESS_RULE = (
    "Buy each stock they reported buying at the close of the first trading day after the report became public, "
    "sized by the amount they reported, and sell when they report a sale."
)
CONGRESS_CAVEAT = (
    "Members have up to 45 days to report a trade, and amounts are reported as ranges; the future can differ."
)
FUND_HOLD_LABEL = "Bought their first portfolio and never traded"
CONGRESS_HOLD_LABEL = "Kept every buy and ignored their sales"


def log(message: str) -> None:
    print(f"[copy] {message}", flush=True)


# ---------------------------------------------------------------------------
# Prices
# ---------------------------------------------------------------------------


class Closes:
    """Adjusted closes aligned to one trading calendar (SPY's), forward-filled."""

    def __init__(self, calendar: list[str], series: dict[str, dict[str, Any]]) -> None:
        self.calendar = calendar
        self._series = series
        self._aligned: dict[str, tuple[list[float | None], list[int]]] = {}

    def has(self, ticker: str) -> bool:
        return ticker in self._series

    def aligned(self, ticker: str) -> tuple[list[float | None], list[int]] | None:
        """(close on each calendar day, sessions since the last real print) or None."""
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
            if isinstance(price, (int, float)) and price > 0:
                last = float(price)
                stale = 0
            else:
                stale += 1
            closes.append(last)
            age.append(stale)
        self._aligned[ticker] = (closes, age)
        return self._aligned[ticker]

    def close(self, ticker: str, index: int) -> float | None:
        aligned = self.aligned(ticker)
        return None if aligned is None else aligned[0][index]

    def entry(self, ticker: str, index: int) -> float | None:
        """A price a follower could really have paid: a real close within a few sessions."""
        aligned = self.aligned(ticker)
        if aligned is None:
            return None
        closes, age = aligned
        if closes[index] is None or age[index] > ENTRY_TOLERANCE_SESSIONS:
            return None
        return closes[index]


def session_after(calendar: list[str], day: str) -> int | None:
    """Index of the first session strictly after ``day``: the first close a follower could trade at."""
    index = bisect_right(calendar, day)
    return index if index < len(calendar) else None


def session_on_or_before(calendar: list[str], day: str) -> int | None:
    index = bisect_right(calendar, day) - 1
    return index if index >= 0 else None


# ---------------------------------------------------------------------------
# The simulator
# ---------------------------------------------------------------------------


def _group_events(calendar: list[str], events: list[dict[str, Any]], end_index: int) -> list[tuple[int, list[dict[str, Any]]]]:
    """Each event at the first session after its public date, in order; several on one session stay in order."""
    grouped: list[tuple[int, list[dict[str, Any]]]] = []
    for event in sorted(events, key=lambda item: item["date"]):
        index = session_after(calendar, event["date"])
        if index is None or index > end_index:
            continue
        if grouped and grouped[-1][0] == index:
            grouped[-1][1].append(event)
        else:
            grouped.append((index, [event]))
    return grouped


def simulate(
    events: list[dict[str, Any]],
    closes: Closes,
    *,
    mode: str,
    hold: bool = False,
    end_index: int | None = None,
) -> dict[str, Any] | None:
    """Replay one copy portfolio. Returns None when nothing could ever be bought.

    ``mode="target"``: each event is ``{"date", "weights": {ticker: share of their book}}``.
    The copy is reset to those weights, scaled up over the names with a price.
    ``mode="trades"``: each event is ``{"date", "ticker", "side": "buy"|"sell",
    "amount", "partial"}``. A buy adds ``amount`` (their dollars) of the stock; a
    sale removes ``amount`` worth when partial, else the whole position.

    ``hold=True`` is the no-trading comparison: only the first target is
    bought (target mode), or buys are kept and sales ignored (trades mode).

    The value is time-weighted: new money for a buy and the proceeds of a sale
    are spread over what is held, so returns never depend on the size of the
    reported amounts, only on their proportions. With nothing held the copy
    sits in cash and earns nothing.
    """
    calendar = closes.calendar
    last = len(calendar) - 1 if end_index is None else min(end_index, len(calendar) - 1)
    grouped = _group_events(calendar, events, last)
    if not grouped:
        return None

    units: dict[str, float] = {}
    value = START_VALUE
    start = grouped[0][0]
    values: list[float] = []
    cash_days = 0
    pnl: dict[str, float] = {}
    stints: dict[str, dict[str, Any]] = {}
    opened: set[str] = set()
    skipped: set[str] = set()
    priced: set[str] = set()
    counts = {"buys": 0, "sells": 0, "resized": 0, "rebalances": 0, "skipped_trades": 0, "ignored_sales": 0}
    turnover = 0.0
    coverage: list[float] = []
    targets_applied = 0
    cursor = 0

    def book(index: int) -> float:
        return sum(amount * (closes.close(ticker, index) or 0.0) for ticker, amount in units.items())

    def open_stint(ticker: str, index: int, price: float) -> None:
        if ticker not in stints:
            stints[ticker] = {"first": calendar[index], "last": None, "factor": 1.0, "open_price": price, "open": True, "days": 0, "open_index": index}
        elif not stints[ticker]["open"]:
            stints[ticker].update({"open_price": price, "open": True, "open_index": index})
        opened.add(ticker)

    def close_stint(ticker: str, index: int) -> None:
        stint = stints.get(ticker)
        if not stint or not stint["open"]:
            return
        price = closes.close(ticker, index) or stint["open_price"]
        stint["factor"] *= price / stint["open_price"]
        stint["days"] += index - stint["open_index"]
        stint["last"] = calendar[index]
        stint["open"] = False

    for index in range(start, last + 1):
        if index > start:
            before = sum(amount * (closes.close(ticker, index - 1) or 0.0) for ticker, amount in units.items())
            if before > 0:
                after = book(index)
                for ticker, amount in units.items():
                    move = amount * ((closes.close(ticker, index) or 0.0) - (closes.close(ticker, index - 1) or 0.0))
                    pnl[ticker] = pnl.get(ticker, 0.0) + value * move / before
                value *= after / before
            else:
                cash_days += 1
        while cursor < len(grouped) and grouped[cursor][0] == index:
            for event in grouped[cursor][1]:
                if mode == "target":
                    if hold and targets_applied:
                        continue
                    now = book(index)
                    drifted = {ticker: amount * (closes.close(ticker, index) or 0.0) / now for ticker, amount in units.items()} if now > 0 else {}
                    wanted: dict[str, float] = {}
                    entry_prices: dict[str, float] = {}
                    for ticker, weight in event["weights"].items():
                        if weight <= 0:
                            continue
                        price = closes.entry(ticker, index)
                        if price is None:
                            skipped.add(ticker)
                            continue
                        wanted[ticker] = weight
                        entry_prices[ticker] = price
                        priced.add(ticker)
                    covered = sum(wanted.values())
                    coverage.append(covered)
                    if covered <= 0:
                        continue  # nothing in this filing has a price: keep what is held rather than sell it all to cash
                    target = {ticker: weight / covered for ticker, weight in wanted.items()}
                    for ticker in set(drifted) | set(target):
                        before_w, after_w = drifted.get(ticker, 0.0), target.get(ticker, 0.0)
                        if drifted:  # the first purchase is the starting portfolio, not turnover
                            turnover += abs(after_w - before_w) / 2
                        if before_w == 0 and after_w > 0:
                            counts["buys"] += 1
                        elif after_w == 0 and before_w > 0:
                            counts["sells"] += 1
                        elif abs(after_w - before_w) > RESIZE_BAND:
                            counts["resized"] += 1
                    for ticker in list(units):
                        if ticker not in target:
                            close_stint(ticker, index)
                    units = {ticker: weight * value / entry_prices[ticker] for ticker, weight in target.items()}
                    for ticker in units:
                        open_stint(ticker, index, entry_prices[ticker])
                    counts["rebalances"] += 1
                    targets_applied += 1
                else:
                    ticker = event["ticker"]
                    amount = float(event.get("amount") or 0.0)
                    if event["side"] == "buy":
                        price = closes.entry(ticker, index)
                        if price is None or amount <= 0:
                            skipped.add(ticker)
                            counts["skipped_trades"] += 1
                            continue
                        priced.add(ticker)
                        # Before the first buy the scale is free; keep their dollars as the unit.
                        units[ticker] = units.get(ticker, 0.0) + amount / price
                        open_stint(ticker, index, price)
                        counts["buys"] += 1
                    else:
                        if hold:
                            continue
                        if ticker not in units:
                            counts["ignored_sales"] += 1
                            continue
                        price = closes.close(ticker, index) or 0.0
                        held_value = units[ticker] * price
                        share = 1.0
                        if event.get("partial") and held_value > 0 and amount > 0:
                            share = min(1.0, amount / held_value)
                        counts["sells"] += 1
                        if share >= 0.999:
                            close_stint(ticker, index)
                            del units[ticker]
                        else:
                            units[ticker] *= 1 - share
            cursor += 1
        values.append(value)

    if not opened:
        return None
    for ticker, stint in stints.items():
        if stint["open"]:
            price = closes.close(ticker, last) or stint["open_price"]
            stint["current_factor"] = stint["factor"] * price / stint["open_price"]
            stint["held_days"] = stint["days"] + last - stint["open_index"]
        else:
            stint["current_factor"] = stint["factor"]
            stint["held_days"] = stint["days"]
    return {
        "start_index": start,
        "end_index": last,
        "dates": calendar[start : last + 1],
        "values": values,
        "pnl": pnl,
        "stints": stints,
        "held_now": sorted(units),
        "counts": counts,
        "turnover": turnover,
        "coverage": coverage,
        "cash_days": cash_days,
        "priced": sorted(priced),
        "skipped": sorted(skipped - priced),
    }


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


def drawdown(dates: list[str], values: list[float]) -> dict[str, Any] | None:
    """The worst fall from a high, with the day of the high and the day of the low."""
    if len(values) < 2:
        return None
    peak_index = 0
    worst = 0.0
    out: dict[str, Any] = {"value": 0.0, "peak": dates[0], "trough": dates[0]}
    for index, value in enumerate(values):
        if value > values[peak_index]:
            peak_index = index
        if values[peak_index] > 0:
            fall = value / values[peak_index] - 1
            if fall < worst:
                worst = fall
                out = {"value": fall, "peak": dates[peak_index], "trough": dates[index]}
    return out


def annualized(total: float, first: str, last: str) -> float | None:
    years = (date.fromisoformat(last) - date.fromisoformat(first)).days / 365.25
    if years < 1 or 1 + total <= 0:
        return None
    return (1 + total) ** (1 / years) - 1


def yearly(dates: list[str], *columns: list[float]) -> list[dict[str, Any]]:
    """Calendar-year returns for each column; the first and last years say where they start or stop."""
    rows: list[dict[str, Any]] = []
    if len(dates) < 2:
        return rows
    years = sorted({day[:4] for day in dates})
    for year in years:
        indexes = [index for index, day in enumerate(dates) if day[:4] == year]
        first, last = indexes[0], indexes[-1]
        base = first - 1 if first > 0 else first
        if last == base:
            continue
        rows.append(
            {
                "year": int(year),
                "from": dates[base] if first == 0 else None,
                "to": dates[last] if last == len(dates) - 1 and not dates[last].endswith("12-31") else None,
                "values": [round(column[last] / column[base] - 1, 6) if column[base] > 0 else None for column in columns],
            }
        )
    return rows


def downsample(dates: list[str], *columns: list[float], step: int = CURVE_STEP) -> list[list[Any]]:
    picked = list(range(0, len(dates), step))
    if picked and picked[-1] != len(dates) - 1:
        picked.append(len(dates) - 1)
    return [[dates[index]] + [round(column[index] / column[0], 5) for column in columns] for index in picked]


def _r(value: float | None, digits: int = 6) -> float | None:
    return None if value is None or not math.isfinite(value) else round(value, digits)


def positions_out(run: dict[str, Any], names: dict[str, str]) -> list[dict[str, Any]]:
    out = []
    for ticker, stint in run["stints"].items():
        out.append(
            {
                "ticker": ticker,
                "name": names.get(ticker) or "",
                "pnl": round(run["pnl"].get(ticker, 0.0), 2),
                "return": _r(stint["current_factor"] - 1),
                "first": stint["first"],
                "last": None if stint["open"] else stint["last"],
                "held": stint["open"],
                "days": stint["held_days"],
            }
        )
    out.sort(key=lambda item: -item["pnl"])
    return out


def build_record(
    *,
    source: dict[str, Any],
    run: dict[str, Any],
    hold_run: dict[str, Any] | None,
    closes: Closes,
    names: dict[str, str],
    ended: bool,
    today_iso: str,
) -> dict[str, Any]:
    """The stored document for one source, from its copy run and its no-trading run."""
    calendar = closes.calendar
    start, end = run["start_index"], run["end_index"]
    dates = run["dates"]
    copy_values = run["values"]
    spy_close = [closes.close("SPY", index) or 0.0 for index in range(start, end + 1)]
    spy_values = [START_VALUE * price / spy_close[0] for price in spy_close]
    hold_values: list[float] | None = None
    if hold_run and hold_run["start_index"] == start:
        hold_values = list(hold_run["values"])
        # The hold run may stop earlier (it never sees later events); carry its last value.
        while len(hold_values) < len(dates):
            hold_values.append(hold_values[-1])
        hold_values = hold_values[: len(dates)]

    def stats(values: list[float]) -> dict[str, Any]:
        total = values[-1] / values[0] - 1
        fall = drawdown(dates, values)
        return {
            "end_value": round(values[-1], 2),
            "total": _r(total),
            "annualized": _r(annualized(total, dates[0], dates[-1])),
            "max_drawdown": _r(fall["value"]) if fall else None,
            "drawdown_peak": fall["peak"] if fall else None,
            "drawdown_trough": fall["trough"] if fall else None,
        }

    columns = [copy_values, spy_values] + ([hold_values] if hold_values else [])
    positions = positions_out(run, names)
    winners = [item for item in positions if item["pnl"] > 0][:TOP_POSITIONS]
    losers = sorted([item for item in positions if item["pnl"] < 0], key=lambda item: item["pnl"])[:TOP_POSITIONS]
    years = (date.fromisoformat(dates[-1]) - date.fromisoformat(dates[0])).days / 365.25
    coverage = run["coverage"]
    sessions = len(dates)
    record = {
        **source,
        "start_date": dates[0],
        "end_date": dates[-1],
        "ended": ended,
        "sessions": sessions,
        "years": round(years, 2),
        "start_value": START_VALUE,
        "copy": stats(copy_values),
        "spy": stats(spy_values),
        "hold": stats(hold_values) if hold_values else None,
        "curve": downsample(dates, *columns),
        "curve_columns": ["date", "copy", "spy"] + (["hold"] if hold_values else []),
        "yearly": yearly(dates, *columns),
        "trades": {
            **run["counts"],
            "turnover_per_year": _r(run["turnover"] / years, 4) if years >= 0.5 else None,
        },
        "positions_count": len(positions),
        "best": winners,
        "worst": losers,
        "held_now": len(run["held_now"]),
        "coverage": {
            "priced": len(run["priced"]),
            "skipped": len(run["skipped"]),
            "skipped_examples": run["skipped"][:8],
            "weight_avg": _r(sum(coverage) / len(coverage), 4) if coverage else None,
            "weight_min": _r(min(coverage), 4) if coverage else None,
            "cash_share": _r(run["cash_days"] / max(1, sessions - 1), 4),
        },
        "price_source": "Adjusted daily closes (splits and dividends included)",
        "benchmark": "SPY, the S&P 500 ETF, dividends included",
        "updated_at": today_iso,
    }
    copy_ann = record["copy"]["annualized"]
    spy_ann = record["spy"]["annualized"]
    record["excess_per_year"] = _r(copy_ann - spy_ann) if copy_ann is not None and spy_ann is not None else None
    last_close = calendar[-1]
    record["price_as_of"] = last_close
    record["stopped"] = bool(ended) and (date.fromisoformat(last_close) - date.fromisoformat(dates[-1])).days > STOPPED_AFTER_DAYS
    record["eligible"], record["not_ranked_because"], record["not_ranked_group"] = eligibility(record)
    return record


MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def month_year(day: str) -> str:
    return f"{MONTH_NAMES[int(day[5:7]) - 1]} {day[:4]}"


def eligibility(record: dict[str, Any]) -> tuple[bool, str | None, str | None]:
    """Whether a record ranks, and when it does not, the plain reason and its group.

    Groups: ``ended`` (the record stopped more than about three months before
    the last close), ``short`` (under about two years) and ``untested`` (too
    little of it could be copied).
    """
    if record.get("stopped"):
        return False, f"the record ended in {month_year(record['end_date'])}", "ended"
    if record["sessions"] < MIN_SESSIONS or record["excess_per_year"] is None:
        return False, "less than two years of record", "short"
    if record["kind"] == "fund":
        if record["trades"]["rebalances"] < MIN_FUND_FILINGS:
            return False, "fewer than four filings to copy", "untested"
        weight = record["coverage"]["weight_avg"]
        if weight is None or weight < MIN_FUND_COVERAGE:
            return False, "we could price less than half of its portfolio", "untested"
    elif record["trades"]["buys"] < MIN_CONGRESS_BUYS:
        return False, "fewer than five buys we could copy", "untested"
    return True, None, None


def empty_record(source: dict[str, Any], reason: str, today_iso: str) -> dict[str, Any]:
    return {**source, "start_date": None, "end_date": None, "eligible": False, "not_ranked_because": reason, "not_ranked_group": "untested", "empty": True, "updated_at": today_iso}


def rank_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Eligible first, best excess per year first; then everything else by slug. Ranks are per kind."""
    # The same order as rankRows in lib/copy-trades-shared.ts: excess per year, then the slug.
    eligible = sorted((row for row in rows if row.get("eligible")), key=lambda row: (-(row["excess_per_year"] or 0.0), row["slug"]))
    rest = sorted((row for row in rows if not row.get("eligible")), key=lambda row: row["slug"])
    rank: dict[str, int] = {}
    for row in eligible:
        rank[row["kind"]] = rank.get(row["kind"], 0) + 1
        row["rank"] = rank[row["kind"]]
    for row in rest:
        row["rank"] = None
    return eligible + rest


def hub_row(record: dict[str, Any]) -> dict[str, Any]:
    row = {key: record.get(key) for key in ("slug", "kind", "chamber", "name", "person", "party", "state", "district", "active", "start_date", "end_date", "ended", "stopped", "sessions", "eligible", "not_ranked_because", "not_ranked_group", "excess_per_year", "years")}
    copy = record.get("copy") or {}
    spy = record.get("spy") or {}
    row.update(
        {
            "copy_total": copy.get("total"),
            "copy_annualized": copy.get("annualized"),
            "spy_total": spy.get("total"),
            "spy_annualized": spy.get("annualized"),
            "max_drawdown": copy.get("max_drawdown"),
            "trades": ((record.get("trades") or {}).get("buys") or 0) + ((record.get("trades") or {}).get("sells") or 0),
            "best": (record.get("best") or [None])[0],
            "worst": (record.get("worst") or [None])[0],
            "spark": [row_[1] for row_ in (record.get("curve") or [])][:: max(1, len(record.get("curve") or []) // 40)],
        }
    )
    return row


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


def fund_timeline(fund: dict[str, Any]) -> list[dict[str, Any]]:
    """What a follower knew on each filing date, rebuilt from the 13F job's disk cache of parsed filings."""
    loaded: list[dict[str, Any]] = []
    for cik in fund_ciks(fund):
        since = cik_since(fund, cik, DEFAULT_SINCE)
        folder = _FILING_CACHE / str(cik)
        if not folder.exists():
            continue
        for path in sorted(folder.glob("*.json")):
            try:
                document = json.loads(path.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            if document.get("form") not in ("13F-HR", "13F-HR/A") or (document.get("period") or "") < since:
                continue
            loaded.append(document)
    if not loaded:
        return []
    _, timeline = build_periods(loaded)
    return timeline


def has_filing_cache(fund: dict[str, Any]) -> bool:
    """Whether this machine holds the 13F job's parsed filings for the fund (only where funds_13f.py has run)."""
    return any((_FILING_CACHE / str(cik)).is_dir() for cik in fund_ciks(fund))


def fund_events(timeline: list[dict[str, Any]], cusips: CusipMap, start: str = FUND_START) -> tuple[list[dict[str, Any]], dict[str, str]]:
    events: list[dict[str, Any]] = []
    names: dict[str, str] = {}
    for event in timeline:
        if event["date"] < start:
            continue
        weights = event_weights(event, cusips)
        for item in event["stocks"][:PERF_TOP_N]:
            ticker = cusips.ticker(item["cusip"])
            if ticker and ticker not in names:
                names[ticker] = display_name(cusips.name(item["cusip"]) or item.get("issuer") or "")
        events.append({"date": event["date"], "period": event["period"], "weights": weights})
    return events, names


def fund_end_index(calendar: list[str], timeline: list[dict[str, Any]], today: str) -> tuple[int | None, bool]:
    """A filer that stopped filing: the record ends when its next filing would have been due."""
    last = timeline[-1]
    lapsed = (date.fromisoformat(today) - date.fromisoformat(last["date"])).days > INACTIVE_AFTER_DAYS
    if not lapsed:
        return None, False
    due = (date.fromisoformat(shift_months(last["period"], 3)) + timedelta(days=45)).isoformat()
    return session_on_or_before(calendar, due), True


def congress_events(trades: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    usable = [
        item
        for item in trades
        if item.get("ticker") and item.get("tx_type") in ("buy", "sell") and item.get("disclosure_date") and (item.get("est_amount") or 0) > 0
        # A Senate report restated by an amendment: its trades are counted once, from the amendment.
        and not item.get("superseded_by")
    ]
    # Within a report day: by trade date, buys before sales (the order house_ptr uses).
    usable.sort(key=lambda item: (item["disclosure_date"], item.get("transaction_date") or "", 0 if item["tx_type"] == "buy" else 1))
    names: dict[str, str] = {}
    events = []
    for item in usable:
        names.setdefault(item["ticker"], item.get("company") or "")
        events.append(
            {
                "date": item["disclosure_date"],
                "ticker": item["ticker"],
                "side": item["tx_type"],
                "amount": float(item["est_amount"]),
                "partial": bool(item.get("partial")),
            }
        )
    # The copy starts with their first buy; sales before it have nothing to sell.
    first_buy = next((index for index, event in enumerate(events) if event["side"] == "buy"), None)
    return ([] if first_buy is None else events[first_buy:]), names


def query_equal(store: DocStore, collection: str, field: str, value: Any, limit: int = 10_000) -> list[dict[str, Any]]:
    """Documents where ``field == value``, over HTTP or straight from SQLite."""
    if store._db is not None:  # noqa: SLF001 - the VPS path
        return [snap.to_dict() or {} for snap in store._db.collection(collection).where(field, "==", value).limit(limit).stream()]
    payload = store._request("POST", "/query", {"collection": collection, "filters": [{"field": field, "op": "==", "value": value}], "limit": limit}) or {}  # noqa: SLF001
    return [item.get("data") or {} for item in payload.get("documents", []) if isinstance(item, dict)]


def _cached_series(ticker: str, through: str) -> dict[str, Any] | None:
    """A series the follow jobs already cached on disk (12 or 14 years) that reaches ``through``, whatever its age."""
    for years in (PRICE_YEARS, 14):
        path = prices._cache_path(ticker, years)  # noqa: SLF001 - the shared cache, read only
        if not path.exists():
            continue
        try:
            document = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if (document.get("last_date") or "") >= through and document.get("dates"):
            return document
    return None


def _reaches(document: dict[str, Any] | None, through: str) -> bool:
    return bool(document and document.get("dates") and document.get("closes") and (document.get("last_date") or document["dates"][-1]) >= through)


def load_prices(
    store: DocStore | None,
    tickers: Iterable[str],
    *,
    through: str | None = None,
    fetch_missing: bool = True,
) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    """Stored closes first, then the follow jobs' disk cache, then Yahoo.

    A series that stops before ``through`` (the last SPY close) is not used
    as it is: forward-filled, a stale series would read as a flat stock. It is
    replaced by a fresher one when there is one; otherwise it is kept, since a
    delisted stock really did stop trading.
    """
    wanted = sorted({ticker.upper() for ticker in tickers if ticker})
    out: dict[str, dict[str, Any]] = {}
    if store is not None:
        paths = [f"{prices.COLLECTION}/{prices.doc_id(ticker)}" for ticker in wanted]
        for start in range(0, len(paths), 200):
            found = store.get_many(paths[start : start + 200])
            for path, data in found.items():
                ticker = path.split("/", 1)[1]
                if data.get("dates") and data.get("closes"):
                    out[ticker] = data
    if through is None:
        spy = out.get("SPY")
        through = (spy.get("last_date") or spy["dates"][-1]) if spy else ""
    counts = {"wanted": len(wanted), "from_store": sum(1 for doc in out.values() if _reaches(doc, through)), "from_cache": 0, "fetched": 0}
    for ticker in wanted:
        if _reaches(out.get(ticker), through):
            continue
        cached = _cached_series(ticker, through)
        if cached is not None:
            out[ticker] = cached
            counts["from_cache"] += 1
            continue
        if not fetch_missing:
            continue
        fetched = prices.fetch_daily(ticker, PRICE_YEARS)
        time.sleep(0.2)  # Yahoo rate-limits bursts; one request at a time, paused like each load_many worker
        if fetched is not None and (ticker not in out or (fetched.get("last_date") or "") > (out[ticker].get("last_date") or "")):
            out[ticker] = fetched
            counts["fetched"] += 1
    counts["stale"] = sum(1 for ticker in wanted if ticker in out and not _reaches(out[ticker], through))
    counts["missing"] = sum(1 for ticker in wanted if ticker not in out)
    return out, counts


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------


def run_fund(fund: dict[str, Any], timeline: list[dict[str, Any]], cusips: CusipMap, closes: Closes, today: str, now_iso: str) -> dict[str, Any]:
    source = {
        "slug": fund["slug"],
        "kind": "fund",
        "name": fund["fund"],
        "person": fund["manager"],
        "rule": FUND_RULE,
        "caveat": FUND_CAVEAT,
        "hold_label": FUND_HOLD_LABEL,
    }
    if not timeline:
        return empty_record(source, "no 13F filings to copy", now_iso)
    events, names = fund_events(timeline, cusips)
    source["active"] = (date.fromisoformat(today) - date.fromisoformat(timeline[-1]["date"])).days <= INACTIVE_AFTER_DAYS
    if not events:
        return empty_record(source, "no 13F filings since 2020", now_iso)
    end_index, ended = fund_end_index(closes.calendar, timeline, today)
    run = simulate(events, closes, mode="target", end_index=end_index)
    if run is None or len(run["dates"]) < 2:
        return empty_record(source, "none of its stocks had a price history", now_iso)
    hold_run = simulate(events, closes, mode="target", hold=True, end_index=end_index)
    record = build_record(source=source, run=run, hold_run=hold_run, closes=closes, names=names, ended=ended, today_iso=now_iso)
    record["filings"] = len(events)
    record["first_filing"] = events[0]["date"]
    record["last_filing"] = events[-1]["date"]
    return record


def run_member(member: dict[str, Any], trades: list[dict[str, Any]], closes: Closes, now_iso: str) -> dict[str, Any]:
    source = {
        "slug": member["slug"],
        "kind": "congress",
        "name": member.get("name") or member["slug"],
        "person": member.get("name") or member["slug"],
        "party": member.get("party") or "",
        "state": member.get("state") or "",
        "district": member.get("district") or "",
        "chamber": member.get("chamber") or "house",
        "active": bool(member.get("sitting", True)),
        "rule": CONGRESS_RULE,
        "caveat": CONGRESS_CAVEAT,
        "hold_label": CONGRESS_HOLD_LABEL,
        "reported_trades": len(trades),
    }
    events, names = congress_events(trades)
    if not events:
        return empty_record(source, "no stock purchases we could copy", now_iso)
    # Someone who has left Congress will never report a sale; the record stops at their last report.
    ended = not source["active"]
    end_index = None
    if ended:
        end_index = session_after(closes.calendar, events[-1]["date"])
    run = simulate(events, closes, mode="trades", end_index=end_index)
    if run is None or len(run["dates"]) < 2:
        return empty_record(source, "none of the stocks they bought had a price history", now_iso)
    # Everything disclosed has been sold: the record stops at the last sale instead of idling in cash.
    if not run["held_now"]:
        stop = session_after(closes.calendar, events[-1]["date"])
        if stop is not None and stop < run["end_index"]:
            ended = True
            run = simulate(events, closes, mode="trades", end_index=stop) or run
    hold_run = simulate(events, closes, mode="trades", hold=True, end_index=run["end_index"])
    record = build_record(source=source, run=run, hold_run=hold_run, closes=closes, names=names, ended=ended, today_iso=now_iso)
    record["first_report"] = events[0]["date"]
    record["last_report"] = max(event["date"] for event in events)
    return record


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backtest copying each followed fund and member of Congress.")
    parser.add_argument("--only", default="", help="comma separated slugs (funds or members)")
    parser.add_argument("--dry-run", action="store_true", help="compute everything, write nothing")
    parser.add_argument("--force", action="store_true", help=f"run even without {ENABLE_FLAG}=1")
    parser.add_argument("--out", default="", help="also write the documents to this JSON file")
    args = parser.parse_args(argv)
    if not (args.force or args.dry_run or os.getenv(ENABLE_FLAG, "").strip() == "1"):
        log(f"off: set {ENABLE_FLAG}=1 (or pass --force) to run")
        return 0

    wanted = {slug.strip() for slug in args.only.split(",") if slug.strip()}
    store = DocStore.from_env()
    now_iso = datetime.now(timezone.utc).isoformat()
    today = now_iso[:10]

    # Inputs: fund timelines from the 13F disk cache, House trades from the store.
    funds = [fund for fund in FUNDS if not wanted or fund["slug"] in wanted]
    cusips = CusipMap(store)
    timelines = {fund["slug"]: fund_timeline(fund) for fund in funds}
    # House members, senators and funds share the collection; leave room for all of them.
    people_rows = [data for _, data in store.list("tm_follow_sources", 5000) if data.get("kind") == "congress"]
    people_rows = [row for row in people_rows if not wanted or row.get("slug") in wanted]
    member_docs = store.get_many([f"tm_follow_people/{row['slug']}" for row in people_rows])
    members = []
    for row in people_rows:
        profile = member_docs.get(f"tm_follow_people/{row['slug']}") or {}
        members.append({"slug": row["slug"], "name": profile.get("name") or row.get("name"), "party": profile.get("party") or row.get("party"),
                        "state": profile.get("state") or row.get("state"), "district": profile.get("district") or row.get("district"),
                        "sitting": profile.get("sitting", row.get("active", True)),
                        "chamber": profile.get("chamber") or row.get("chamber") or "house"})
    trades_by_member = {member["slug"]: query_equal(store, "tm_follow_trades", "person_id", member["slug"]) for member in members}
    log(f"{len(funds)} funds ({sum(1 for t in timelines.values() if t)} with cached filings), {len(members)} members, "
        f"{sum(len(t) for t in trades_by_member.values())} House and Senate trades")

    tickers: set[str] = {"SPY"}
    for slug, timeline in timelines.items():
        for event in fund_events(timeline, cusips)[0]:
            tickers.update(event["weights"])
    for trades in trades_by_member.values():
        tickers.update(item["ticker"] for item in trades if item.get("ticker"))
    series, price_counts = load_prices(store, tickers)
    log(f"prices: {price_counts}")
    spy = series.get("SPY")
    if not spy:
        log("no SPY series; nothing to compare against")
        return 1
    start_day = min([FUND_START] + [item["disclosure_date"] for trades in trades_by_member.values() for item in trades if item.get("disclosure_date")])
    calendar = [day for day in spy["dates"] if day >= start_day]
    closes = Closes(calendar, series)

    records: list[dict[str, Any]] = []
    # A machine without the 13F job's disk cache must not replace good fund records with empty ones:
    # those funds keep their last stored record (and hub row) until the cache exists.
    uncached = [fund["slug"] for fund in funds if not has_filing_cache(fund)]
    kept = store.get_many([f"{COLLECTION}/{slug}" for slug in uncached]) if uncached else {}
    if uncached:
        log(f"no 13F cache for {len(uncached)} funds; keeping {len(kept)} stored records for them")
    for fund in funds:
        if fund["slug"] in uncached:
            previous = kept.get(f"{COLLECTION}/{fund['slug']}")
            if previous:
                records.append({**previous, "_kept": True})
            continue
        try:
            records.append(run_fund(fund, timelines[fund["slug"]], cusips, closes, today, now_iso))
        except Exception as error:  # one bad record must not sink the rest
            log(f"{fund['slug']}: FAILED {error}")
    for member in members:
        try:
            records.append(run_member(member, trades_by_member[member["slug"]], closes, now_iso))
        except Exception as error:
            log(f"{member['slug']}: FAILED {error}")

    for record in records:
        copy = record.get("copy") or {}
        spy_stats = record.get("spy") or {}
        if record.get("empty"):
            log(f"{record['slug']:34} -- {record['not_ranked_because']}")
            continue
        log(
            f"{record['slug']:34} {record['start_date']}..{record['end_date']} copy {copy.get('total', 0) * 100:7.1f}% "
            f"spy {spy_stats.get('total', 0) * 100:7.1f}% excess/yr {('%.1f' % (record['excess_per_year'] * 100)) if record.get('excess_per_year') is not None else 'n/a':>6} "
            f"{'ranked' if record['eligible'] else 'not ranked: ' + str(record['not_ranked_because'])}"
        )

    rows = rank_rows([hub_row(record) for record in records])
    by_slug = {row["slug"]: row["rank"] for row in rows}
    for record in records:
        record["rank"] = by_slug.get(record["slug"])
    hub = {
        "generated_at": now_iso,
        "fund_start": FUND_START,
        "price_as_of": calendar[-1],
        "rows": rows,
        "funds": sum(1 for row in rows if row["kind"] == "fund"),
        "members": sum(1 for row in rows if row["kind"] == "congress"),
        "senators": sum(1 for row in rows if row["kind"] == "congress" and row.get("chamber") == "senate"),
        "ranked_funds": sum(1 for row in rows if row["kind"] == "fund" and row["eligible"]),
        "ranked_members": sum(1 for row in rows if row["kind"] == "congress" and row["eligible"]),
        "fund_rule": FUND_RULE,
        "fund_caveat": FUND_CAVEAT,
        "congress_rule": CONGRESS_RULE,
        "congress_caveat": CONGRESS_CAVEAT,
        "prices": price_counts,
        "partial": bool(wanted),
    }
    for record in records:
        record.pop("_kept", None)  # kept records are written back only to carry their new rank
    docs = [(f"{COLLECTION}/{record['slug']}", record) for record in records]
    if args.out:
        with open(args.out, "w") as handle:
            json.dump({"hub": hub, "records": records}, handle)
    if args.dry_run:
        log(f"dry run: {len(docs)} documents and the hub not written")
        return 0
    written = store.set_many(docs)
    if not wanted:
        store.set(HUB_PATH, hub)
    log(f"wrote {written} documents{'' if wanted else ' and the hub'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
