"""Keeps a stock's call from flip-flopping.

Whatever produces the day's call (``directive_v2.build_directive_v2`` today, the
call engine if it is ever switched on) is treated as a *vote*. The call we show
only moves when the votes and the facts say it should:

* One step at a time. Buy more goes to Keep, Sell some goes to Keep, Keep goes
  to either. A straight jump between Buy more and Sell some needs a hard reason.
* A change needs the new stance on ``confirm_sessions`` days in a row, and the
  call must have stood ``min_hold_sessions`` trading days first.
* A hard reason skips both waits and may jump straight to the vote: a results
  report, a large move of the stock's own (beyond its normal swings against the
  market), or a broad market drop. Each hard event can move the call once, and
  only an event after the call was set counts, so one report cannot flip it
  back and forth.
* Levels (buy-more and sell-some prices) stay where they are unless the call
  changes or the new level is far enough away to matter for this stock.
* Every change records its reason in plain words, and "what would change it"
  is written from the same rule.

The decision is a pure function of the stored state, the day's vote and the
price and earnings facts, so the backtest and the pipeline run the same code.
Re-running on the same day starts again from the state at the end of the
previous session, so the five-minute on-demand reruns cannot count as extra
days, and a change made earlier in the day stands for the rest of that day.

``CALL_STABILITY_MODE`` = off (default) | shadow | on. Off changes nothing and
reads nothing. Shadow stores the steady call next to the live one
(``tm_call_stability``, ``tm_call_stability_history`` and a ``call_stability``
field on the brief) and never changes the brief. On publishes it.

The state is saved, with a version check, before the brief is published, so the
call people see is always one the stored state backs.
"""

from __future__ import annotations

import logging
import math
import os
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

VERSION = "stability-1"
MODE_ENV = "CALL_STABILITY_MODE"
MODES = ("off", "shadow", "on")

ADD, HOLD, TRIM = "Add", "Hold", "Trim"
RANK = {TRIM: 0, HOLD: 1, ADD: 2}
BY_RANK = {value: key for key, value in RANK.items()}
PLAIN = {ADD: "Buy more", HOLD: "Keep", TRIM: "Sell some"}
STANCE_FOR = {ADD: "accumulate", HOLD: "hold", TRIM: "trim"}
_WORD = {
    "accumulate": ADD, "buy": ADD, "add": ADD,
    "hold": HOLD, "watch": HOLD,
    "trim": TRIM, "avoid": TRIM, "sell": TRIM, "reduce": TRIM,
}
MAX_VOTES = 12
MAX_CHANGES = 12
MAX_USED_EVENTS = 24


@dataclass(frozen=True)
class Rules:
    confirm_sessions: int = 4          # days in a row the vote must point the new way
    min_hold_sessions: int = 12        # trading days a call stands before a vote-led change
    hard_confirm_sessions: int = 2     # days in a row the vote must agree before a hard reason moves the call
    reverse_kinds: tuple[str, ...] = ("earnings",)  # hard reasons that may undo a change inside the hold
    reverse_confirm_sessions: int = 3  # ... and the days in a row the vote must agree before they do
    move_follows_direction: bool = True   # a big rise may only move the call up, a big fall only down
    event_window_sessions: int = 5     # a hard event can move the call for this many sessions after it
    move_sigma: float = 4.0            # a move of its own this many of its usual daily swings (x sqrt(days))
    move_days: tuple[int, ...] = (1, 5)
    vol_sessions: int = 60             # how far back "its usual swings" are measured
    market_drop_pct: float = -4.0      # S&P 500 over market_drop_sessions
    market_drop_sessions: int = 5
    level_min_move_pct: float = 3.0    # a level moves only by at least this much ...
    level_move_sigma: float = 1.0      # ... or this many weekly swings, whichever is larger
    level_sessions: int = 5


DEFAULT_RULES = Rules()


def stability_mode() -> str:
    value = os.getenv(MODE_ENV, "").strip().lower()
    return value if value in MODES else "off"


def call_word(stance: Any) -> str | None:
    return _WORD.get(str(stance or "").strip().lower())


def vote_from_directive(directive: dict[str, Any] | None) -> str | None:
    """The day's vote, or None when the call was written without a price
    (``build_directive_v2`` then says "Watch setup" with no levels): that day abstains."""
    if not isinstance(directive, dict):
        return None
    stance = str(directive.get("stance") or "").strip().lower()
    label = str((directive.get("action") or {}).get("label") if isinstance(directive.get("action"), dict) else directive.get("text") or "").strip().lower()
    if stance == "watch" and (directive.get("execution") == "after_event" or label == "watch setup"):
        return None
    return stance or None


# ── facts ──────────────────────────────────────────────────────────────────


@dataclass
class Facts:
    """What the rule may look at on ``today``. Series run oldest to newest."""

    dates: list[str] = field(default_factory=list)          # the stock's trading days
    closes: list[float] = field(default_factory=list)
    market_dates: list[str] = field(default_factory=list)   # S&P 500 (SPY)
    market_closes: list[float] = field(default_factory=list)
    earnings_dates: list[str] = field(default_factory=list)  # results known on these days (tests, simple callers)
    next_earnings: str | None = None
    # Company reports from ``report_rows``: {date, known_on, kind: earnings|guidance, direction, change}.
    reports: list[dict[str, Any]] = field(default_factory=list)


def next_weekday(day: str) -> str:
    current = date.fromisoformat(day[:10]) + timedelta(days=1)
    while current.weekday() >= 5:
        current += timedelta(days=1)
    return current.isoformat()


def _days_apart(a: str, b: str) -> int:
    return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)


def report_rows(
    history_doc: dict[str, Any] | None,
    day_docs: Iterable[dict[str, Any]] = (),
) -> list[dict[str, Any]]:
    """Every company report the rule can use, oldest first, from ``tm_earnings_history``
    (the 8-Ks with item 2.02, stamped with EDGAR's acceptance time) and, when it has
    run, ``tm_earnings_day`` (what the release said about guidance).

    ``known_on`` is the first session the market could react: the report's own day
    when it came out before or during the session, the next weekday after the close.
    A results release is an ``earnings`` report. Any other item 2.02 8-K
    (preliminary numbers, an outlook update) is ``guidance``. When two fall within a
    week of each other they are one report, and the results release wins."""
    history: list[dict[str, Any]] = []
    for report in (history_doc or {}).get("reports") or []:
        if not isinstance(report, dict):
            continue
        day = str(report.get("date") or "")[:10]
        if len(day) != 10 or "2.02" not in (report.get("items") or ["2.02"]):
            continue
        session = str(report.get("session") or "").lower()
        history.append({
            "date": day,
            "known_on": next_weekday(day) if session == "amc" else day,
            "kind": "guidance" if report.get("release") is False else "earnings",
            "direction": None,
            "change": None,
        })
    history.sort(key=lambda row: (row["date"], row["kind"] != "earnings"))
    rows: list[dict[str, Any]] = []
    for row in history:
        near = [r for r in rows if _days_apart(r["date"], row["date"]) <= 7]
        if not near:
            rows.append(row)
        elif row["kind"] == "earnings" and all(r["kind"] != "earnings" for r in near):
            # An update and then the results release a few days later: keep the release.
            for r in near:
                rows.remove(r)
            rows.append(row)

    for doc in day_docs or []:
        if not isinstance(doc, dict):
            continue
        # The day the release came out (the filing can land days after the calendar date).
        day = str(doc.get("report_day") or doc.get("event_date") or "")[:10]
        if len(day) != 10:
            continue
        guidance = doc.get("guidance") if isinstance(doc.get("guidance"), dict) else {}
        change = str(guidance.get("change") or "").lower()
        near = [r for r in rows if _days_apart(r["date"], day) <= 7]
        if near:
            # The filing history knows this report already; it only learns what happened to guidance.
            if change in ("raised", "lowered"):
                near[0]["change"] = change
            continue
        filed = bool((doc.get("filing") or {}).get("accession")) if isinstance(doc.get("filing"), dict) else False
        if filed:
            # The release is on EDGAR but the nightly history has not caught up yet.
            session = str(doc.get("session") or "").lower()
            rows.append({"date": day, "known_on": next_weekday(day) if session == "amc" else day,
                         "kind": "earnings", "direction": None,
                         "change": change if change in ("raised", "lowered") else None})
    for row in rows:
        # A cut outlook is a reason to be more careful, never to buy more.
        row["direction"] = -1 if row["change"] == "lowered" else None
    return sorted(rows, key=lambda row: row["date"])


def load_report_rows(store: Any, ticker: str) -> tuple[list[dict[str, Any]], list[str]]:
    """(reports, upcoming report days) for one US ticker: the same reads for the live
    pipeline and the replay. Raises when the store fails, so a caller can tell an
    empty history from a broken read."""
    ticker = str(ticker or "").strip().upper()
    if not ticker or store is None or getattr(store, "db", None) is None:
        return [], []
    db = store.db
    snap = db.collection("tm_earnings_history").document(ticker).get()
    history = snap.to_dict() if snap.exists else None
    day_docs = [doc.to_dict() or {} for doc in db.collection("tm_earnings_day").where("market", "==", "US").where("ticker", "==", ticker).stream()]
    upcoming = sorted({
        str((doc.to_dict() or {}).get("event_date") or "")[:10]
        for doc in db.collection("tm_earnings_events").where("market", "==", "US").where("ticker", "==", ticker).stream()
    } - {""})
    return report_rows(history, day_docs), upcoming


def build_facts(
    dates: list[str],
    closes: list[float],
    market_dates: list[str],
    market_closes: list[float],
    reports: list[dict[str, Any]],
    upcoming: list[str],
    today: str,
    *,
    keep: int = 70,
) -> Facts:
    """Everything known on ``today`` and nothing after it."""
    import bisect

    i = bisect.bisect_right(dates, today)
    j = bisect.bisect_right(market_dates, today)
    known = [row for row in reports if row["known_on"] <= today]
    later = [day for day in upcoming if day > today] + [row["date"] for row in reports if row["date"] > today]
    return Facts(
        dates[max(0, i - keep):i], closes[max(0, i - keep):i],
        market_dates[max(0, j - keep):j], market_closes[max(0, j - keep):j],
        next_earnings=min(later) if later else None,
        reports=known[-4:],
    )


def _finite(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) and out > 0 else None


def _excess_returns(facts: Facts) -> list[tuple[str, float]]:
    """(day, stock daily return minus the market's) for days both traded."""
    market = {d: c for d, c in zip(facts.market_dates, facts.market_closes) if _finite(c)}
    out: list[tuple[str, float]] = []
    prev_day = prev_close = None
    for day, close in zip(facts.dates, facts.closes):
        close = _finite(close)
        if close is None:
            continue
        if prev_close is not None and day in market and prev_day in market:
            stock_ret = close / prev_close - 1
            market_ret = market[day] / market[prev_day] - 1
            out.append((day, stock_ret - market_ret))
        prev_day, prev_close = day, close
    return out


def _stdev(values: list[float]) -> float | None:
    if len(values) < 20:
        return None
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    return math.sqrt(var) if var > 0 else None


def daily_swing(facts: Facts, rules: Rules = DEFAULT_RULES, *, before: str | None = None) -> float | None:
    """The stock's usual daily move against the market (a standard deviation), from
    the ``vol_sessions`` days before ``before`` (or up to the last day)."""
    rows = _excess_returns(facts)
    if before is not None:
        rows = [row for row in rows if row[0] < before]
    return _stdev([value for _, value in rows[-rules.vol_sessions:]])


def _sessions_after(dates: list[str], start: str, end: str) -> int:
    return sum(1 for d in dates if start < d <= end)


def held_sessions(facts: Facts, since: str, today: str) -> int:
    """Trading days the call has stood: price days after ``since``, or weekdays when
    there are no prices. The rule and "what would change it" both count with this."""
    if facts.dates and facts.dates[0] <= since:
        return _sessions_after(facts.dates, since, today)
    if facts.dates:
        return 10 ** 6  # set before the price window starts: far longer than any hold
    return _weekdays_after(since, today)


def _weekdays_after(start: str, end: str) -> int:
    try:
        current, last = date.fromisoformat(start[:10]), date.fromisoformat(end[:10])
    except ValueError:
        return 0
    count = 0
    while current < last:
        current += timedelta(days=1)
        if current.weekday() < 5:
            count += 1
    return count


def hard_events(facts: Facts, today: str, rules: Rules = DEFAULT_RULES) -> list[dict[str, Any]]:
    """Hard reasons dated within the last ``event_window_sessions`` sessions up to today.

    Each has an ``id`` (so it can move the call only once), a ``date``, a ``kind``
    (earnings | move | market) and a plain sentence."""
    window = [d for d in (facts.dates or facts.market_dates) if d <= today][-rules.event_window_sessions:]
    if not window:
        return []
    first = window[0]
    events: list[dict[str, Any]] = []
    rows = list(facts.reports) + [
        {"date": day, "known_on": day, "kind": "earnings", "direction": None, "change": None}
        for day in facts.earnings_dates
    ]
    seen: list[str] = []
    for row in sorted(rows, key=lambda r: r["date"]):
        day, known_on = str(row["date"]), str(row.get("known_on") or row["date"])
        if seen and (date.fromisoformat(day) - date.fromisoformat(seen[-1])).days <= 7:
            continue  # one report dated twice
        seen.append(day)
        if not (first <= known_on <= today):
            continue
        change = row.get("change")
        events.append({
            "id": f"{row.get('kind') or 'earnings'}:{day}",
            "kind": row.get("kind") or "earnings",
            "date": known_on,
            "report_date": day,
            "change": change,
            "direction": row.get("direction"),
        })

    # A move or a sell-off that lasts several days is one event: only the first day
    # of a run of days over the line counts, so it cannot re-arm while it goes on.
    rows = _excess_returns(facts)
    values = [v for _, v in rows]
    previous = False
    for index, (day, _) in enumerate(rows):
        if day > today:
            break
        sigma = _stdev(values[max(0, index - rules.vol_sessions):index])
        hit: dict[str, Any] | None = None
        if sigma is not None:
            for span in rules.move_days:
                if index + 1 < span:
                    continue
                move = sum(values[index + 1 - span:index + 1])
                if abs(move) >= rules.move_sigma * sigma * math.sqrt(span):
                    hit = {"id": f"move:{day}", "kind": "move", "date": day, "move_pct": round(move * 100, 1), "days": span,
                           "direction": 1 if move > 0 else -1}
                    break
        if hit and not previous and day >= first:
            events.append(hit)
        previous = hit is not None

    mdates, mcloses = facts.market_dates, facts.market_closes
    n = rules.market_drop_sessions
    previous = False
    for index, day in enumerate(mdates):
        if day > today:
            break
        hit = None
        if index >= n:
            start, end = _finite(mcloses[index - n]), _finite(mcloses[index])
            if start and end and (end / start - 1) * 100 <= rules.market_drop_pct:
                hit = {"id": f"market:{day}", "kind": "market", "date": day, "move_pct": round((end / start - 1) * 100, 1), "direction": -1}
        if hit and not previous and day >= first:
            events.append(hit)
        previous = hit is not None
    return sorted(events, key=lambda e: (e["date"], e["kind"]))


# ── words ──────────────────────────────────────────────────────────────────

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def short_day(iso: str | None) -> str:
    try:
        d = date.fromisoformat(str(iso)[:10])
    except ValueError:
        return ""
    return f"{_MONTHS[d.month - 1]} {d.day}"


def add_sessions(day: str, sessions: int) -> str:
    """The weekday ``sessions`` trading days after ``day`` (holidays ignored)."""
    current = date.fromisoformat(day[:10])
    left = max(0, sessions)
    while left:
        current += timedelta(days=1)
        if current.weekday() < 5:
            left -= 1
    return current.isoformat()


def _event_reason(event: dict[str, Any], name: str, before: str, after: str) -> str:
    kind = event.get("kind")
    moved = f"from {PLAIN[before]} to {PLAIN[after]}"
    if kind == "earnings":
        day = short_day(event.get("report_date") or event["date"])
        outlook = {"raised": " and raised its outlook", "lowered": " and cut its outlook"}.get(str(event.get("change")), "")
        return f"{name} reported results on {day}{outlook}, so we moved our call {moved}."
    if kind == "guidance":
        day = short_day(event.get("report_date") or event["date"])
        what = {"raised": "raised its outlook", "lowered": "cut its outlook"}.get(str(event.get("change")), "put out new figures between its regular reports")
        return f"{name} {what} on {day}, so we moved our call {moved}."
    if kind == "move":
        pct = float(event.get("move_pct") or 0)
        span = "in a day" if int(event.get("days") or 1) == 1 else f"in {int(event['days'])} days"
        verb = "rose" if pct > 0 else "fell"
        return (
            f"{name} {verb} {abs(pct):.0f}% more than the market {span}, far beyond its usual swings, "
            f"so we moved our call {moved}."
        )
    pct = abs(float(event.get("move_pct") or 0))
    return f"The S&P 500 fell {pct:.1f}% in a week, so we moved our call {moved}."


def _vote_reason(name: str, before: str, after: str, sessions: int) -> str:
    leaning = "buying" if RANK[after] > RANK[before] else "selling"
    return (
        f"Our daily review of {name} has leaned toward {leaning} for {sessions} trading days in a row, "
        f"so we moved our call from {PLAIN[before]} to {PLAIN[after]}."
    )


def _last_direction(state: dict[str, Any]) -> int:
    """+1 when the current call came from a move up, -1 from a move down, 0 otherwise."""
    changes = state.get("changes") or []
    last = changes[-1] if changes and isinstance(changes[-1], dict) and changes[-1].get("date") == state.get("since") else None
    if not last or last.get("to") not in RANK or last.get("from") not in RANK:
        return 0
    return 1 if RANK[last["to"]] > RANK[last["from"]] else -1


def _join(items: list[str]) -> str:
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + f" or {items[-1]}"


def what_would_change(state: dict[str, Any], today: str, facts: Facts, name: str, rules: Rules = DEFAULT_RULES) -> str:
    """A few short sentences that say what the rule would do next, and nothing it would not."""
    call = state["call"]
    sigma = daily_swing(facts, rules)
    nxt = facts.next_earnings if facts.next_earnings and facts.next_earnings > today else None
    held = held_sessions(facts, str(state["since"]), today)
    in_hold = held < rules.min_hold_sessions
    earliest = add_sessions(today, rules.min_hold_sessions - held) if in_hold else today
    direction = _last_direction(state) if in_hold else 0

    # Plain words only (owner: no mechanics copy): what could move the call, not how the rule counts.
    results = f"its {short_day(nxt)} results" if nxt else "its next results"
    ways = {d for d in (-1, 1) if (d < 0 and call != TRIM) or (d > 0 and call != ADD)}
    if in_hold and direction:
        ways &= {direction}
    sharp = "a sharp drop" if ways == {-1} else "a sharp rise" if ways == {1} else "a sharp move"
    market = " or a market sell-off" if -1 in ways else ""
    lean = "buying" if call == ADD else "selling"
    after = (
        f"we'd move to {PLAIN[ADD]} or {PLAIN[TRIM]} once the case holds for a few days"
        if call == HOLD
        else f"we'd move to {PLAIN[HOLD]} if the case for {lean} fades for a few days"
    )
    if in_hold:
        return (
            f"We plan to keep this call until at least {short_day(earliest)}. "
            f"Only {results}, a new outlook, {sharp}{market} could change it sooner. After that, {after}."
        )
    if call == HOLD:
        return f"{after[0].upper()}{after[1:]}, or sooner after {results}."
    return f"{after[0].upper()}{after[1:]}, or sooner after {results} or {sharp}{market}."


# ── the rule ───────────────────────────────────────────────────────────────


def _base(state: dict[str, Any] | None, today: str) -> tuple[dict[str, Any] | None, bool]:
    """The state to decide from, and whether the call already changed today."""
    if not state:
        return None, False
    if state.get("session") == today and not isinstance(state.get("prior"), dict) and state.get("call") in RANK:
        # The first day we follow a stock: its first call stands for the rest of that day.
        first = dict(state)
        first["session"] = None
        return first, True
    if state.get("session") == today:
        prior = state.get("prior")
        return (dict(prior) if isinstance(prior, dict) else None), state.get("changed_on") == today
    return state, False


def _snapshot(state: dict[str, Any]) -> dict[str, Any]:
    keep = ("call", "since", "since_reason", "since_trigger", "levels", "changes", "used_events", "session")
    return {key: state.get(key) for key in keep if key in state}


def _smooth_level(old: float | None, new: float | None, reset: bool, threshold: float) -> tuple[float | None, bool]:
    if reset or old is None or new is None:
        # A level the day's call no longer sets is dropped rather than kept stale.
        return new, new != old
    if abs(new / old - 1) >= threshold:
        return new, True
    return old, False


def stabilise(
    state: dict[str, Any] | None,
    raw_stance: Any,
    today: str,
    facts: Facts,
    *,
    raw_levels: dict[str, Any] | None = None,
    name: str = "The stock",
    rules: Rules = DEFAULT_RULES,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Decide the steady call for ``today`` (YYYY-MM-DD).

    Returns (new_state, view). ``view`` is what to store or show: call, since,
    reason, what would change it, levels. Both are None when there is no
    usable vote and no earlier state."""
    today = str(today)[:10]
    raw = call_word(raw_stance)
    base, changed_today = _base(state, today)
    # Stored as {"day", "call"} maps (Firestore has no arrays of arrays); worked on as pairs.
    votes = [
        [str(v.get("day")), v.get("call")]
        for v in ((state or {}).get("votes") or [])
        if isinstance(v, dict) and v.get("call") in RANK and v.get("day")
    ]
    votes = [v for v in votes if v[0] != today]
    if raw:
        votes.append([today, raw])
    votes = sorted(votes)[-MAX_VOTES:]

    if base is None or base.get("call") not in RANK:
        if not raw:
            return state, None
        new = {
            "version": VERSION, "call": raw, "since": today, "since_reason": None, "since_trigger": "start",
            "levels": {}, "changes": [], "used_events": [],
        }
        base = dict(new)
        base["session"] = None

    current = dict(base)
    current.setdefault("changes", [])
    current.setdefault("used_events", [])
    before = current["call"]
    since = str(current.get("since") or today)
    held = held_sessions(facts, since, today)
    trigger: str | None = None
    reason: str | None = None
    target = before
    event_used: str | None = None

    if raw and raw != before:
        direction = 1 if RANK[raw] > RANK[before] else -1
        used = set(current.get("used_events") or [])
        changes = current.get("changes") or []
        last = changes[-1] if changes and changes[-1].get("date") == since else None
        last_direction = (1 if RANK[last["to"]] > RANK[last["from"]] else -1) if last else 0
        in_hold = held < rules.min_hold_sessions
        # Taking back the last change inside the hold needs the vote to agree for longer.
        reversing = in_hold and last_direction != 0 and direction != last_direction
        needed = max(rules.hard_confirm_sessions, rules.reverse_confirm_sessions) if reversing else rules.hard_confirm_sessions
        hard_votes = votes[-needed:]
        hard_agree = len(hard_votes) == needed and all(
            (RANK[v[1]] - RANK[before]) * direction > 0 for v in hard_votes
        )

        def eligible(event: dict[str, Any]) -> bool:
            if event["date"] <= since or event["id"] in used:
                return False
            # A reason with a direction only moves the call its way: a sell-off or a cut outlook
            # never fast-tracks Buy more, a big rise never fast-tracks Sell some.
            event_direction = event.get("direction")
            if event_direction and event_direction != direction and (event["kind"] != "move" or rules.move_follows_direction):
                return False
            # Inside the minimum hold, only these reasons may take back the last change.
            if reversing and event["kind"] not in rules.reverse_kinds:
                return False
            return True

        fresh = [e for e in hard_events(facts, today, rules) if eligible(e)] if hard_agree else []
        # earnings first, then the stock's own move, then the market
        fresh.sort(key=lambda e: {"earnings": 0, "guidance": 1, "move": 2, "market": 3}.get(e["kind"], 4))
        if fresh:
            event = fresh[0]
            # Only as far as every agreeing day supports: Hold then Trim from Add moves to Hold.
            target = min((v[1] for v in hard_votes), key=lambda call: abs(RANK[call] - RANK[before]))
            if reversing:
                # Taking back a recent change goes one step, never straight across.
                target = BY_RANK[RANK[before] + direction]
            trigger, event_used = event["kind"], event["id"]
            reason = _event_reason(event, name, before, target)
        elif not in_hold:
            recent = votes[-rules.confirm_sessions:]
            if len(recent) == rules.confirm_sessions and all(
                (RANK[v[1]] - RANK[before]) * direction > 0 for v in recent
            ):
                target = BY_RANK[RANK[before] + direction]
                trigger = "confirmed"
                reason = _vote_reason(name, before, target, rules.confirm_sessions)

    if changed_today and state:
        # A change made earlier today stands for the rest of the day.
        current = {key: state.get(key) for key in _snapshot(state)}
        target = current["call"]
        trigger = None
    elif target != before:
        current["call"] = target
        current["since"] = today
        current["since_reason"] = reason
        current["since_trigger"] = trigger
        if event_used:
            current["used_events"] = (list(current.get("used_events") or []) + [event_used])[-MAX_USED_EVENTS:]
        current["changes"] = (list(current.get("changes") or []) + [
            {"date": today, "from": before, "to": target, "trigger": trigger, "reason": reason}
        ])[-MAX_CHANGES:]

    # levels
    sigma = daily_swing(facts, rules)
    threshold = max(rules.level_min_move_pct / 100, rules.level_move_sigma * (sigma or 0) * math.sqrt(rules.level_sessions))
    old_levels = dict(current.get("levels") or {}) if not changed_today else dict((state or {}).get("levels") or {})
    reset = (target != before and not changed_today) or base.get("session") is None
    # A day with no levels at all (no price, a glitch) keeps the ones we had; a day that
    # sets some levels but not this one drops it, so a stale level never lingers.
    no_levels = not any(_finite((raw_levels or {}).get(key)) for key in ("accumulate_below", "trim_above"))
    levels: dict[str, Any] = {}
    moved = False
    for key in ("accumulate_below", "trim_above"):
        if no_levels and not reset:
            kept = _finite(old_levels.get(key))
            if kept is not None:
                levels[key] = round(kept, 2)
            continue
        new_value = _finite((raw_levels or {}).get(key))
        value, did = _smooth_level(_finite(old_levels.get(key)), new_value, reset, threshold)
        moved = moved or did
        if value is not None:
            levels[key] = round(value, 2)
    if moved or "set_on" not in old_levels:
        levels["set_on"] = today
    else:
        levels["set_on"] = old_levels.get("set_on")
    current["levels"] = levels

    prior = _snapshot(base) if base.get("session") is not None else None
    new_state = {
        **current,
        "version": VERSION,
        "votes": [{"day": day, "call": call} for day, call in votes],
        "session": today,
        "prior": prior,
        "changed_on": today if (target != before or changed_today) else (state or {}).get("changed_on"),
        "last_raw": raw,
    }
    view = {
        "version": VERSION,
        "call": new_state["call"],
        "stance": STANCE_FOR[new_state["call"]],
        "since": new_state["since"],
        "since_reason": new_state.get("since_reason"),
        "changed": new_state.get("changed_on") == today and bool(new_state.get("changes")) and new_state["changes"][-1]["date"] == today,
        "trigger": new_state.get("since_trigger"),
        "raw_call": raw,
        "held_against_vote": bool(raw and raw != new_state["call"]),
        "levels": {k: v for k, v in levels.items() if k != "set_on"},
        "levels_set_on": levels.get("set_on"),
        "what_would_change": what_would_change(new_state, today, facts, name, rules),
    }
    return new_state, view


# ── the published directive (mode "on") ────────────────────────────────────

_LABELS = {
    ADD: ("accumulate", "pullback", "Accumulate on pullbacks", "The setup is still constructive; add on pullbacks rather than chasing."),
    HOLD: ("hold", "now", "Hold here", "Upside and downside look balanced; keep the position but do not force a new add."),
    TRIM: ("trim", "do_not_chase", "Do not add here", "Risk/reward has weakened; avoid adding and use any bounce to reduce exposure."),
}


def steady_directive(raw_directive: dict[str, Any], view: dict[str, Any]) -> dict[str, Any]:
    """The live directive with the steady call, its levels and its reasons.

    When the steady call matches the vote, the vote's own wording stays; only the
    levels and "what would change it" follow the rule. When it differs, the
    action words are the plain template for the steady call."""
    directive = dict(raw_directive or {})
    call = view["call"]
    if call_word(directive.get("stance")) != call:
        stance, execution, label, summary = _LABELS[call]
        directive.update({
            "stance": stance,
            "execution": execution,
            "action": {"label": label, "summary": summary},
            "confidence": "medium",
        })
        # The vote's own reason argues for the other call; it must not sit under this one.
        directive.pop("call_reason", None)
    zones = dict(directive.get("zones") or {}) if isinstance(directive.get("zones"), dict) else {}
    for key in ("accumulate_below", "trim_above"):
        if key in view["levels"]:
            zones[key] = view["levels"][key]
        else:
            zones.pop(key, None)
    directive["zones"] = zones
    directive["watch_out"] = view["what_would_change"]
    directive["invalidation"] = view["what_would_change"]
    directive["changed_from_previous"] = bool(view.get("changed"))
    directive["change_reason"] = view.get("since_reason") if view.get("changed") else ""
    directive["stability"] = {
        "version": view["version"],
        "since": view["since"],
        "since_reason": view.get("since_reason"),
        "trigger": view.get("trigger"),
        "what_would_change": view["what_would_change"],
        "levels_set_on": view.get("levels_set_on"),
        # Today's review pointed elsewhere and the call held: the page says so.
        "held_against_vote": bool(view.get("held_against_vote")),
        "vote": view.get("raw_call"),
    }
    directive["raw_stance"] = (raw_directive or {}).get("stance")
    return directive


# ── pipeline glue ──────────────────────────────────────────────────────────


def price_series(points: Iterable[dict[str, Any]] | None, today: str) -> tuple[list[str], list[float]]:
    """(days, closes) from the pipeline's price rows (``store.get_price_history``), up to today."""
    by_day: dict[str, float] = {}
    for row in points or []:
        if not isinstance(row, dict):
            continue
        day = str(row.get("captured_at") or row.get("timestamp") or "")[:10]
        quote = row.get("quote") if isinstance(row.get("quote"), dict) else {}
        close = _finite(quote.get("current") if quote else row.get("close"))
        if len(day) == 10 and close is not None and day <= today:
            by_day[day] = close
    days = sorted(by_day)
    return days, [by_day[d] for d in days]


def session_day(dates: list[str], today: str) -> str:
    """The trading day a run belongs to: weekend and holiday reruns belong to the last
    trading day, so they never count as extra days."""
    # Prices more than a few days behind (a stale feed) must not freeze the stock on an old day.
    if dates and dates[-1] <= today and _weekdays_after(dates[-1], today) <= 3:
        return dates[-1]
    day = date.fromisoformat(today[:10])
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day.isoformat()


class CallStabilityError(RuntimeError):
    """The steady call could not be decided and saved. In "on" mode this stops the
    brief job rather than publish a call the stored state does not back."""


MAX_SAVE_ATTEMPTS = 3


def apply(
    mode: str,
    *,
    store: Any,
    instrument_id: str,
    name: str,
    directive: dict[str, Any],
    facts: Facts,
    today: str,
) -> dict[str, Any]:
    """Decide the steady call and save its state before the brief is published.

    The state is written first, with a version check (``rev``): if another run saved
    this stock in between, the decision is made again from what it saved. So the
    published call is always the one the stored state backs, and a brief that later
    fails to publish only leaves the state a step ahead, which the next run of the
    same day reuses (it decides from the end of the previous session)."""
    if mode not in ("shadow", "on") or store is None or not instrument_id:
        return {}
    today = session_day(facts.dates, today)
    reader = getattr(store, "get_call_stability_state", None)
    writer = getattr(store, "save_call_stability_state", None)
    if not callable(reader) or not callable(writer):
        raise CallStabilityError("the store cannot keep call stability state")
    vote = vote_from_directive(directive)
    levels = directive.get("zones") if isinstance(directive.get("zones"), dict) else None
    for _ in range(MAX_SAVE_ATTEMPTS):
        stored = reader(instrument_id)
        rev = stored.get("rev") if isinstance(stored, dict) else None
        state = stored if isinstance(stored, dict) and stored.get("version") == VERSION else None
        new_state, view = stabilise(state, vote, today, facts, raw_levels=levels, name=name)
        if view is None or new_state is None:
            return {}
        row = {
            "session": today,
            "call": view["call"],
            "stance": view["stance"],
            "since": view["since"],
            "changed": bool(view["changed"]),
            "trigger": view["trigger"] if view["changed"] else None,
            "reason": view["since_reason"] if view["changed"] else None,
            "raw_call": view["raw_call"],
            "held_against_vote": bool(view["held_against_vote"]),
            "levels": view["levels"],
            "mode": mode,
            "version": VERSION,
        }
        if writer(instrument_id, new_state, expected_rev=rev, history_row=row):
            out: dict[str, Any] = {"call_stability": {**view, "mode": mode}}
            if mode == "on":
                out["directive_v2"] = steady_directive(directive, view)
            return out
    raise CallStabilityError(f"{instrument_id}: state kept changing under us; gave up after {MAX_SAVE_ATTEMPTS} tries")


MARKET_ID = "US_SPY"
_MARKET_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_MARKET_TTL_SECONDS = 600


def market_history(store: Any) -> list[dict[str, Any]]:
    """The S&P 500 (SPY) daily rows, read at most once every ten minutes per process."""
    key = f"{id(store)}:{MARKET_ID}"
    cached = _MARKET_CACHE.get(key)
    if cached and time.monotonic() - cached[0] < _MARKET_TTL_SECONDS:
        return cached[1]
    reader = getattr(store, "get_price_history", None)
    rows = list(reader(MARKET_ID, limit=65) or []) if callable(reader) else []
    if not rows:
        # Without it no move can be measured against the market and no sell-off seen:
        # calls still hold, but only votes and reports can move them.
        logger.warning("call stability: no S&P 500 (%s) price window; market checks are off this run", MARKET_ID)
    _MARKET_CACHE[key] = (time.monotonic(), rows)
    return rows


def new_york_day(now_utc: datetime | None = None) -> str:
    now = now_utc or datetime.now(timezone.utc)
    return now.astimezone(ZoneInfo("America/New_York")).date().isoformat()


def run_for_brief(
    *,
    store: Any,
    market: str,
    instrument: dict[str, Any],
    directive: dict[str, Any],
    history_points: Iterable[dict[str, Any]] | None,
    now_utc: datetime | None = None,
    mode: str | None = None,
) -> dict[str, Any]:
    """What the brief builders call. Off (the default), non-US or no store: {} and
    nothing is read.

    Shadow never changes the brief: a failure is logged as an error and the brief
    goes out as it would have. On raises ``CallStabilityError``, so the job stops
    and yesterday's briefs stay up instead of a call the rule did not decide."""
    mode = mode if mode in MODES else stability_mode()
    if mode == "off" or store is None or str(market or "").strip().upper() != "US" or not isinstance(directive, dict):
        return {}
    instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
    ticker = str(instrument.get("ticker") or instrument_id.split("_", 1)[-1]).strip().upper()
    name = str(instrument.get("name") or ticker or "The stock").strip()
    try:
        today = new_york_day(now_utc)
        dates, closes = price_series(history_points, today)
        mdates, mcloses = price_series(market_history(store), today)
        reports, upcoming = load_report_rows(store, ticker)
        facts = build_facts(dates, closes, mdates, mcloses, reports, upcoming, today)
        return apply(mode, store=store, instrument_id=instrument_id, name=name, directive=directive, facts=facts, today=today)
    except Exception as exc:
        if mode == "on":
            raise exc if isinstance(exc, CallStabilityError) else CallStabilityError(f"{instrument_id}: {exc}") from exc
        logger.error("call stability (shadow) failed for %s: %s", instrument_id, exc)
        return {}
