"""The NYSE trading calendar, by rule, for any year: which days trade, and when each session closes.

Holidays (NYSE Rule 7.2 and the published calendars): New Year's Day, Martin Luther King Jr. Day, Washington's
Birthday, Good Friday, Memorial Day, Juneteenth (from 2022), Independence Day, Labor Day, Thanksgiving and
Christmas. A holiday on a Saturday is observed the Friday before and one on a Sunday the Monday after, except New
Year's Day: on a Saturday it is not observed at all (the exchange stays open on the last day of the year).

Early closes (1pm ET): the day before Independence Day, the day after Thanksgiving and Christmas Eve, each only when
it is a weekday the exchange is open. So July 3 closes early from Monday to Thursday; on a Friday it is the observed
Independence Day. Christmas Eve closes early from Monday to Thursday; on a Friday it is the observed Christmas.

Closures nobody can schedule (a national day of mourning) go in UNSCHEDULED_CLOSED as they are announced.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")

# Announced one-off closures: the national day of mourning for President Carter, Jan 9 2025.
UNSCHEDULED_CLOSED = {date(2025, 1, 9)}


def easter(year: int) -> date:
    """Western Easter Sunday (the anonymous Gregorian computus)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    day = (h + l_ - 7 * m + 114) % 31 + 1
    return date(year, month, day)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """The nth (1-based) weekday (Monday 0) of a month."""
    first = date(year, month, 1)
    return first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    nxt = date(year + (month == 12), month % 12 + 1, 1)
    last = nxt - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _observed(d: date) -> date:
    """A fixed-date holiday on a weekend: Saturday moves to Friday, Sunday to Monday."""
    return d - timedelta(days=1) if d.weekday() == 5 else d + timedelta(days=1) if d.weekday() == 6 else d


@lru_cache(maxsize=64)
def holidays(year: int) -> frozenset[date]:
    out = set()
    new_year = date(year, 1, 1)
    if new_year.weekday() != 5:  # a Saturday New Year's Day is not observed
        out.add(_observed(new_year))
    out.add(_nth_weekday(year, 1, 0, 3))  # Martin Luther King Jr. Day
    out.add(_nth_weekday(year, 2, 0, 3))  # Washington's Birthday
    out.add(easter(year) - timedelta(days=2))  # Good Friday
    out.add(_last_weekday(year, 5, 0))  # Memorial Day
    if year >= 2022:
        out.add(_observed(date(year, 6, 19)))  # Juneteenth
    out.add(_observed(date(year, 7, 4)))  # Independence Day
    out.add(_nth_weekday(year, 9, 0, 1))  # Labor Day
    out.add(_nth_weekday(year, 11, 3, 4))  # Thanksgiving
    out.add(_observed(date(year, 12, 25)))  # Christmas
    out |= {d for d in UNSCHEDULED_CLOSED if d.year == year}
    return frozenset(out)


@lru_cache(maxsize=64)
def early_closes(year: int) -> frozenset[date]:
    candidates = [date(year, 7, 3), _nth_weekday(year, 11, 3, 4) + timedelta(days=1), date(year, 12, 24)]
    return frozenset(d for d in candidates if trading_day(d))


def trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in holidays(d.year)


def session_close(d: date) -> datetime:
    """When the regular session on `d` ends: 4pm ET, or 1pm ET on a half day."""
    return datetime(d.year, d.month, d.day, 13 if d in early_closes(d.year) else 16, 0, tzinfo=ET)


def previous_session(d: date) -> date:
    """The trading day before `d`."""
    d -= timedelta(days=1)
    while not trading_day(d):
        d -= timedelta(days=1)
    return d


def session_on_or_before(d: date) -> date:
    while not trading_day(d):
        d -= timedelta(days=1)
    return d


def last_closed_session(now: datetime) -> date:
    """The most recent trading day whose regular session has ended by `now`."""
    d = session_on_or_before(now.astimezone(ET).date())
    return d if session_close(d) <= now else previous_session(d)


def first_close_at_or_after(at: datetime) -> date:
    """The trading day whose close is the first at or after `at` (10am: that day; the evening: the next session)."""
    d = at.astimezone(ET).date()
    while not trading_day(d) or session_close(d) < at:
        d += timedelta(days=1)
    return d
