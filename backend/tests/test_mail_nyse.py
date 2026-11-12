"""The rule-based NYSE calendar against the exchange's published holidays and early closes, 2025-2030."""
from __future__ import annotations

from datetime import date, datetime

import pytest

from backend.mail import nyse

D = date

# NYSE's published market holidays (2025-2027 from nyse.com; 2028-2030 from the same rules the exchange applies).
HOLIDAYS = {
    2025: [D(2025, 1, 1), D(2025, 1, 9), D(2025, 1, 20), D(2025, 2, 17), D(2025, 4, 18), D(2025, 5, 26), D(2025, 6, 19),
           D(2025, 7, 4), D(2025, 9, 1), D(2025, 11, 27), D(2025, 12, 25)],
    2026: [D(2026, 1, 1), D(2026, 1, 19), D(2026, 2, 16), D(2026, 4, 3), D(2026, 5, 25), D(2026, 6, 19), D(2026, 7, 3),
           D(2026, 9, 7), D(2026, 11, 26), D(2026, 12, 25)],
    2027: [D(2027, 1, 1), D(2027, 1, 18), D(2027, 2, 15), D(2027, 3, 26), D(2027, 5, 31), D(2027, 6, 18), D(2027, 7, 5),
           D(2027, 9, 6), D(2027, 11, 25), D(2027, 12, 24)],
    # New Year's Day 2028 is a Saturday: not observed
    2028: [D(2028, 1, 17), D(2028, 2, 21), D(2028, 4, 14), D(2028, 5, 29), D(2028, 6, 19), D(2028, 7, 4), D(2028, 9, 4),
           D(2028, 11, 23), D(2028, 12, 25)],
    2029: [D(2029, 1, 1), D(2029, 1, 15), D(2029, 2, 19), D(2029, 3, 30), D(2029, 5, 28), D(2029, 6, 19), D(2029, 7, 4),
           D(2029, 9, 3), D(2029, 11, 22), D(2029, 12, 25)],
    2030: [D(2030, 1, 1), D(2030, 1, 21), D(2030, 2, 18), D(2030, 4, 19), D(2030, 5, 27), D(2030, 6, 19), D(2030, 7, 4),
           D(2030, 9, 2), D(2030, 11, 28), D(2030, 12, 25)],
}
EARLY = {
    2025: [D(2025, 7, 3), D(2025, 11, 28), D(2025, 12, 24)],
    2026: [D(2026, 11, 27), D(2026, 12, 24)],  # July 3 is the observed Independence Day
    2027: [D(2027, 11, 26)],  # July 3 is a Saturday; Christmas Eve is the observed Christmas
    2028: [D(2028, 7, 3), D(2028, 11, 24)],  # Christmas Eve is a Sunday
    2029: [D(2029, 7, 3), D(2029, 11, 23), D(2029, 12, 24)],
    2030: [D(2030, 7, 3), D(2030, 11, 29), D(2030, 12, 24)],
}


@pytest.mark.parametrize("year", range(2025, 2031))
def test_holidays_match_the_published_calendar(year):
    assert sorted(nyse.holidays(year)) == HOLIDAYS[year]


@pytest.mark.parametrize("year", range(2025, 2031))
def test_early_closes_match_the_published_calendar(year):
    assert sorted(nyse.early_closes(year)) == EARLY[year]
    for d in EARLY[year]:
        assert nyse.session_close(d).hour == 13
    assert nyse.session_close(D(year, 3, 10) if nyse.trading_day(D(year, 3, 10)) else D(year, 3, 11)).hour == 16


def test_easter_computus():
    assert [nyse.easter(y) for y in range(2025, 2031)] == [D(2025, 4, 20), D(2026, 4, 5), D(2027, 3, 28), D(2028, 4, 16),
                                                            D(2029, 4, 1), D(2030, 4, 21)]


def test_sessions_step_over_weekends_and_holidays():
    et = nyse.ET
    assert nyse.previous_session(D(2026, 11, 27)) == D(2026, 11, 25)  # over Thanksgiving
    assert nyse.previous_session(D(2027, 1, 4)) == D(2026, 12, 31)  # New Year's Day 2027 is a Friday holiday
    assert nyse.session_on_or_before(D(2026, 11, 26)) == D(2026, 11, 25)
    assert nyse.last_closed_session(datetime(2026, 11, 27, 13, 5, tzinfo=et)) == D(2026, 11, 27)  # after a half day's close
    assert nyse.last_closed_session(datetime(2026, 11, 30, 9, 0, tzinfo=et)) == D(2026, 11, 27)
    assert nyse.first_close_at_or_after(datetime(2026, 11, 27, 13, 30, tzinfo=et)) == D(2026, 11, 30)
    assert nyse.first_close_at_or_after(datetime(2026, 11, 27, 12, 30, tzinfo=et)) == D(2026, 11, 27)
