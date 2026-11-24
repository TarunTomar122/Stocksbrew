"""Tests for the next-report-date job: the estimate, Yahoo's confirmed dates and the supersede rules (no network, no store)."""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from backend.agentdata import earnings_calendar as ec
from backend.agentdata import earnings_dates as ed
from backend.mail import alerts

TODAY = date(2026, 11, 24)
NOW = "2026-11-24T22:00:00+00:00"
NY = ZoneInfo("America/New_York")


def _history(*days, session="amc"):
    """A tm_earnings_history doc from release days, stored newest first like the job writes it."""
    return {"reports": [{"date": day, "session": session, "release": True} for day in sorted(days, reverse=True)]}


# NVIDIA's real release days (tm_earnings_history, Nov 2026): always a Wednesday or so, after the close.
NVDA = _history(
    "2023-11-21", "2024-02-21", "2024-05-22", "2024-08-28", "2024-11-20", "2025-02-26",
    "2025-05-28", "2025-08-27", "2025-11-19", "2026-02-25", "2026-05-20", "2026-08-26", "2026-11-17",
)
# Allegion: the fourth quarter comes out about four weeks later than the usual 91-day gap.
ALLE = _history("2025-02-18", "2025-04-24", "2025-07-24", "2025-10-23", "2026-02-17", "2026-04-28", "2026-07-23", "2026-10-22", session="bmo")


def _epoch(local: str) -> int:
    return int(datetime.fromisoformat(local).replace(tzinfo=NY).timestamp())


# -- NYSE days ---------------------------------------------------------------------


def test_nyse_holidays_match_the_exchange_calendar():
    days = ed.nyse_holidays(2027)
    for holiday in ("2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"):
        assert date.fromisoformat(holiday) in days, holiday
    assert not ed.is_trading_day(date(2027, 1, 18))
    assert ed.trading_day_on_or_after(date(2027, 1, 16)) == date(2027, 1, 19)  # Saturday, then MLK Monday
    # A Saturday New Year's Day (2028) is not observed on the Friday before.
    assert date(2027, 12, 31) not in ed.nyse_holidays(2027) | ed.nyse_holidays(2028)


# -- the estimate ------------------------------------------------------------------


def test_release_days_skip_non_releases_and_keep_one_per_day():
    doc = {
        "reports": [
            {"date": "2026-11-17", "session": "amc", "release": True},
            {"date": "2026-11-17", "session": "during", "release": None},
            {"date": "2026-09-01", "session": "bmo", "release": False},  # a conference deck, not results
            {"date": "2026-08-26", "session": "amc"},
            {"date": "not a day", "session": "amc"},
        ]
    }
    assert ed.release_days(doc) == [(date(2026, 8, 26), "amc"), (date(2026, 11, 17), "amc")]
    assert ed.release_days(None) == []


def test_estimate_takes_last_years_same_quarter_on_the_same_weekday():
    estimate = ed.estimate_next(ed.release_days(NVDA), TODAY)
    assert estimate["date"] == "2027-02-24"  # Feb 25, 2026 moved 52 weeks: a Wednesday again
    assert estimate["time"] == "amc"
    assert estimate["basis"] == {"method": "year_ago", "from_report": "2026-02-25", "last_report": "2026-11-17", "gap_days": 91, "reports": 13}


def test_a_late_fourth_quarter_stays_late():
    estimate = ed.estimate_next(ed.release_days(ALLE), TODAY)
    # The usual gap would say Jan 21; last year's fourth quarter came Feb 17.
    assert estimate["date"] == "2027-02-16"
    assert estimate["time"] == "bmo"


def test_an_estimate_on_a_holiday_moves_to_the_next_session():
    # Jan 19, 2026 + 52 weeks is MLK Day 2027.
    history = _history("2025-10-20", "2026-01-20", "2026-04-20", "2026-07-20", "2026-10-19")
    estimate = ed.estimate_next(ed.release_days(history), TODAY)
    assert estimate["date"] == "2027-01-19"
    assert date.fromisoformat(estimate["date"]).weekday() == 1


def test_no_estimate_without_enough_history():
    assert ed.estimate_next([], TODAY) is None
    assert ed.estimate_next([(date(2026, 11, 5), "amc")], TODAY) is None  # one report


def test_no_estimate_when_the_history_stopped_or_the_report_is_already_due():
    stale = _history("2024-11-05", "2025-02-05", "2025-05-05")
    assert ed.estimate_next(ed.release_days(stale), TODAY) is None
    # Reported Aug 12 and nothing since: the next one was due in November, so we do not know.
    overdue = _history("2025-08-12", "2025-11-11", "2026-02-10", "2026-05-12", "2026-08-12")
    assert ed.estimate_next(ed.release_days(overdue), TODAY) is None


def test_a_year_of_irregular_history_gets_no_estimate():
    # Reports a year apart from nothing that lines up (a changed fiscal year): no year-ago match, no guess.
    irregular = _history("2025-09-18", "2025-12-18", "2026-03-19", "2026-07-21", "2026-10-28")
    assert ed.estimate_next(ed.release_days(irregular), TODAY) is None


def test_under_a_year_of_steady_history_uses_the_usual_gap_and_weekday():
    steady = _history("2026-02-24", "2026-05-26", "2026-08-25", "2026-11-17", session="bmo")
    estimate = ed.estimate_next(ed.release_days(steady), TODAY)
    assert estimate["basis"]["method"] == "usual_gap"
    assert estimate["date"] == "2027-02-16"  # Nov 17 + 91 days, on a Tuesday like the reports
    assert estimate["time"] == "bmo"
    # Gaps that disagree by more than two weeks: too unsteady to guess from.
    unsteady = _history("2026-03-02", "2026-05-01", "2026-08-25", "2026-11-17")
    assert ed.estimate_next(ed.release_days(unsteady), TODAY) is None


def test_reported_calendar_days_fill_gaps_in_the_sec_history():
    # Bumble's November 8-K never reached the history: without the calendar row it looks overdue.
    history = _history("2025-05-07", "2025-08-06", "2025-11-05", "2026-03-11", "2026-05-05", "2026-08-05")
    assert ed.estimate_next(ed.release_days(history), TODAY) is None
    events = [
        _event("BMBL", "2026-11-04", market="US", reported_eps=0.31, time="amc"),
        _event("BMBL", "2026-08-06", market="US", reported_eps=0.4, time="amc"),  # the same report as Aug 5: not doubled
        _event("BMBL", "2026-10-01", market="US_SUPERSEDED", reported_eps=0.1),  # retired: never counted
        _event("BMBL", "2026-12-01", market="US"),  # not reported yet
    ]
    releases = ed.with_reported_days(ed.release_days(history), events, TODAY)
    assert [day.isoformat() for day, _ in releases][-2:] == ["2026-08-05", "2026-11-04"]
    assert ed.estimate_next(releases, TODAY)["date"] == "2027-03-10"


def test_usual_session_needs_a_majority():
    assert ed.usual_session(["amc", "amc", "bmo", "amc"]) == "amc"
    assert ed.usual_session(["amc", "bmo"]) == "during"
    assert ed.usual_session(["during", "during", "amc"]) == "during"
    assert ed.usual_session([]) == "during"


# -- Yahoo -------------------------------------------------------------------------


def test_yahoo_date_counts_only_when_confirmed_and_on_one_day():
    at = _epoch("2027-01-14T08:30:00")
    row = {"isEarningsDateEstimate": False, "earningsTimestamp": at, "earningsTimestampStart": at, "earningsTimestampEnd": at}
    assert ed.yahoo_confirmed(row, TODAY) == {"date": "2027-01-14", "time": "bmo"}
    assert ed.yahoo_confirmed({**row, "isEarningsDateEstimate": True}, TODAY) is None
    assert ed.yahoo_confirmed({**row, "isEarningsDateEstimate": None}, TODAY) is None
    # Apple, Nov 24: the main time still points at the last report while the range points ahead.
    assert ed.yahoo_confirmed({**row, "earningsTimestamp": _epoch("2026-11-02T16:30:00")}, TODAY) is None
    assert ed.yahoo_confirmed({**row, "earningsTimestampEnd": at + 86400 * 7}, TODAY) is None
    past = _epoch("2026-11-17T16:20:00")
    assert ed.yahoo_confirmed({**row, "earningsTimestamp": past, "earningsTimestampStart": past, "earningsTimestampEnd": past}, TODAY) is None
    assert ed.yahoo_confirmed({"isEarningsDateEstimate": False}, TODAY) is None
    assert ed.yahoo_confirmed(None, TODAY) is None


def test_yahoo_times_map_to_sessions():
    def session(local):
        at = _epoch(local)
        return ed.yahoo_confirmed({"isEarningsDateEstimate": False, "earningsTimestamp": at, "earningsTimestampStart": at, "earningsTimestampEnd": at}, TODAY)["time"]

    assert session("2027-02-18T16:05:00") == "amc"
    assert session("2027-02-18T07:00:00") == "bmo"
    assert session("2027-02-18T00:00:00") == "during"  # midnight means no time was given
    assert session("2027-02-18T12:00:00") == "during"


# -- the plan ------------------------------------------------------------------------


def _event(ticker, day, **fields):
    return (f"tm_earnings_events/{ticker}_{day}", {"ticker": ticker, "event_date": day, **fields})


def _plan(events=(), histories=None, yahoo=None, universe=None):
    return ed.plan(
        universe=universe or {"NVDA": "NVIDIA Corp"},
        histories={"NVDA": NVDA} if histories is None else histories,
        events=list(events),
        yahoo_rows=yahoo,
        today=TODAY,
        now_iso=NOW,
    )


def test_an_estimate_is_written_under_its_own_market():
    writes, stats = _plan()
    assert len(writes) == 1
    path, doc = writes[0]
    assert path == "tm_earnings_events/NVDA_2027-02-24"
    assert doc["market"] == "US_ESTIMATED" and doc["date_status"] == "estimated" and doc["source"] == "stocksbrew_estimate"
    assert doc["company"] == "NVIDIA Corp" and doc["time"] == "amc" and doc["eps_estimate"] is None
    assert doc["estimate_basis"]["method"] == "year_ago"
    assert stats["with_estimate"] == 1 and stats["covered"] == 1


def test_an_unchanged_estimate_is_not_rewritten():
    first, _ = _plan()
    stored = {key: value for key, value in first[0][1].items() if key != "captured_at"}
    writes, stats = _plan(events=[(first[0][0], {**stored, "captured_at": "2026-11-23T22:00:00+00:00"})])
    assert writes == []
    assert stats["estimates_unchanged"] == 1


def test_a_confirmed_date_retires_every_estimate():
    events = [
        _event("NVDA", "2027-02-25", market="US", source="nasdaq_calendar"),
        _event("NVDA", "2027-02-24", market="US_ESTIMATED", source="stocksbrew_estimate"),
    ]
    writes, stats = _plan(events=events)
    assert writes == [("tm_earnings_events/NVDA_2027-02-24", {"market": "US_SUPERSEDED", "superseded_at": NOW, "superseded_reason": "a confirmed date is listed"})]
    assert stats["with_confirmed"] == 1 and stats["confirmed_nasdaq"] == 1 and stats.get("with_estimate", 0) == 0


def test_a_reported_or_past_confirmed_row_does_not_block_the_next_estimate():
    events = [_event("NVDA", "2026-11-17", market="US", source="nasdaq_calendar", reported_eps=2.68)]
    writes, stats = _plan(events=events)
    assert [path for path, _ in writes] == ["tm_earnings_events/NVDA_2027-02-24"]
    assert stats["with_estimate"] == 1


def test_a_new_estimate_retires_the_old_one_and_a_passed_one_is_retired():
    events = [
        _event("NVDA", "2027-02-17", market="US_ESTIMATED", source="stocksbrew_estimate"),
        _event("NVDA", "2026-11-18", market="US_ESTIMATED", source="stocksbrew_estimate"),
    ]
    writes, _ = _plan(events=events)
    by_path = dict(writes)
    assert by_path["tm_earnings_events/NVDA_2027-02-24"]["market"] == "US_ESTIMATED"
    assert by_path["tm_earnings_events/NVDA_2027-02-17"]["superseded_reason"] == "re-estimated to another day"
    assert by_path["tm_earnings_events/NVDA_2026-11-18"]["superseded_reason"] == "the estimated day has passed"


def test_an_estimate_with_no_history_left_is_retired():
    events = [_event("NVDA", "2027-02-24", market="US_ESTIMATED", source="stocksbrew_estimate")]
    writes, stats = _plan(events=events, histories={})
    assert writes == [("tm_earnings_events/NVDA_2027-02-24", {"market": "US_SUPERSEDED", "superseded_at": NOW, "superseded_reason": "no longer estimable from the history"})]
    assert stats["with_neither"] == 1 and stats["neither_no_history"] == 1


def test_an_estimate_never_lands_on_a_day_another_source_retired():
    events = [_event("NVDA", "2027-02-24", market="US_SUPERSEDED", source="nasdaq_calendar")]
    writes, stats = _plan(events=events)
    assert writes == []
    assert stats["estimate_skipped_taken_day"] == 1


def _yahoo_row(local):
    at = _epoch(local)
    return {"isEarningsDateEstimate": False, "earningsTimestamp": at, "earningsTimestampStart": at, "earningsTimestampEnd": at}


def test_a_yahoo_confirmed_date_is_written_as_confirmed_and_replaces_the_estimate():
    events = [
        _event("NVDA", "2027-02-24", market="US_ESTIMATED", source="stocksbrew_estimate"),
        _event("NVDA", "2027-02-17", market="US_ESTIMATED", source="stocksbrew_estimate"),
    ]
    writes, stats = _plan(events=events, yahoo={"NVDA": _yahoo_row("2027-02-24T16:20:00")})
    by_path = dict(writes)
    taken = by_path["tm_earnings_events/NVDA_2027-02-24"]
    assert taken["market"] == "US" and taken["date_status"] == "confirmed" and taken["source"] == "yahoo_quote" and taken["estimate_basis"] is None
    assert by_path["tm_earnings_events/NVDA_2027-02-17"]["superseded_reason"] == "a confirmed date is listed"
    assert stats["confirmed_yahoo"] == 1 and stats["yahoo_written"] == 1


def test_yahoo_rows_move_with_yahoo_and_survive_a_yahoo_outage():
    held = [_event("NVDA", "2027-02-24", market="US", source="yahoo_quote")]
    # Yahoo not asked, or no row for the stock: the date stands, and no estimate is made.
    for yahoo in (None, {}):
        writes, stats = _plan(events=held, yahoo=yahoo)
        assert writes == [] and stats["confirmed_yahoo"] == 1
    # Yahoo answered but no longer confirms it: retired, and the estimate takes its place.
    writes, _ = _plan(events=held, yahoo={"NVDA": {"isEarningsDateEstimate": True}})
    by_path = dict(writes)
    assert by_path["tm_earnings_events/NVDA_2027-02-24"]["market"] == "US_ESTIMATED"
    # Yahoo moved it a day: the old row is retired, the new one written.
    writes, _ = _plan(events=held, yahoo={"NVDA": _yahoo_row("2027-02-25T16:20:00")})
    by_path = dict(writes)
    assert by_path["tm_earnings_events/NVDA_2027-02-24"]["market"] == "US_SUPERSEDED"
    assert by_path["tm_earnings_events/NVDA_2027-02-25"]["source"] == "yahoo_quote"


def test_nasdaq_wins_over_yahoo():
    events = [
        _event("NVDA", "2027-02-24", market="US", source="yahoo_quote"),
        _event("NVDA", "2027-02-25", market="US", source="nasdaq_calendar"),
    ]
    writes, stats = _plan(events=events, yahoo={"NVDA": _yahoo_row("2027-02-24T16:20:00")})
    assert writes == [("tm_earnings_events/NVDA_2027-02-24", {"market": "US_SUPERSEDED", "superseded_at": NOW, "superseded_reason": "nasdaq_calendar lists another date"})]
    assert stats["confirmed_nasdaq"] == 1


def test_a_yahoo_row_dated_today_is_never_retired():
    # The job runs after the close: a Yahoo-only row dated today is the report going out right now.
    # yahoo_confirmed() never returns today, so without the guard it was retired (yahoo_retired: 1)
    # and the reactions step, earnings_day and the stock page missed the report.
    held = [_event("NVDA", TODAY.isoformat(), market="US", source="yahoo_quote", time="amc")]
    for yahoo in ({"NVDA": _yahoo_row(f"{TODAY.isoformat()}T16:20:00")}, {"NVDA": {"isEarningsDateEstimate": True}}, {"NVDA": {}}):
        writes, stats = _plan(events=held, histories={}, yahoo=yahoo)
        assert writes == []
        assert stats.get("yahoo_retired", 0) == 0 and stats["confirmed_yahoo"] == 1
    # A future day Yahoo no longer lists is still retired.
    later = [_event("NVDA", (TODAY + timedelta(days=1)).isoformat(), market="US", source="yahoo_quote")]
    writes, stats = _plan(events=later, histories={}, yahoo={"NVDA": {"isEarningsDateEstimate": True}})
    assert stats["yahoo_retired"] == 1 and writes[0][1]["market"] == "US_SUPERSEDED"


def test_a_yahoo_date_too_close_to_the_last_report_is_ignored():
    writes, stats = _plan(yahoo={"NVDA": _yahoo_row("2026-12-02T16:20:00")})
    assert [doc["market"] for _, doc in writes] == ["US_ESTIMATED"]
    assert stats["yahoo_ignored_too_soon"] == 1


# -- the Nasdaq job takes a day over ----------------------------------------------------


def test_nasdaq_takes_over_an_estimated_or_yahoo_day():
    row = {"symbol": "NVDA", "company": "NVIDIA", "time": "amc", "fiscal_date_ending": "2027-01-31", "eps_estimate": 2.9, "reported_eps": None}
    estimate = {"ticker": "NVDA", "market": "US_ESTIMATED", "source": "stocksbrew_estimate", "estimate_basis": {"method": "year_ago"}}
    event = ec.build_event(row, ticker="NVDA", day="2027-02-24", now_iso=NOW, existing=estimate)
    assert event["market"] == "US" and event["source"] == "nasdaq_calendar" and event["date_status"] == "confirmed"
    assert event["estimate_basis"] is None
    yahoo = ec.build_event(row, ticker="NVDA", day="2027-02-24", now_iso=NOW, existing={"market": "US", "source": "yahoo_quote"})
    assert yahoo["source"] == "nasdaq_calendar" and "estimate_basis" not in yahoo
    # An Alpha Vantage row keeps its own source, as before.
    old = ec.build_event(row, ticker="NVDA", day="2027-02-24", now_iso=NOW, existing={"market": "US", "source": "alpha_vantage"})
    assert old["source"] == "alpha_vantage"


# -- readers never take an estimate for a date -----------------------------------------


def test_the_earnings_reminder_skips_estimated_and_retired_rows():
    tomorrow = (datetime(2026, 11, 24, 15, tzinfo=timezone.utc)).astimezone(NY).date() + timedelta(days=1)

    class Src:
        def query(self, collection, filters=None, **kw):
            return [
                ("e/1", {"ticker": "NVDA", "event_date": tomorrow.isoformat(), "time": "amc", "market": "US_ESTIMATED"}),
                ("e/2", {"ticker": "KO", "event_date": tomorrow.isoformat(), "time": "bmo", "market": "US_SUPERSEDED"}),
                ("e/3", {"ticker": "AAPL", "event_date": tomorrow.isoformat(), "time": "amc", "market": "US"}),
            ]

    calendar = alerts.load_earnings_calendar(Src(), datetime(2026, 11, 24, 15, tzinfo=timezone.utc))
    assert calendar == {("US", "AAPL"): (tomorrow, "amc")}


def test_the_daily_email_takes_confirmed_dates_only():
    from backend.mail import data as mail_data

    class Src:
        def query(self, collection, filters=None, **kw):
            return [
                ("e/1", {"ticker": "NVDA", "event_date": "2026-11-26", "time": "amc", "market": "US_ESTIMATED"}),
                ("e/2", {"ticker": "AAPL", "event_date": "2026-11-27", "time": "amc", "market": "US"}),
                ("e/3", {"ticker": "KO", "event_date": "2026-11-27", "time": "bmo"}),  # old rows carry no market
            ]

    class Stock:
        def __init__(self, ticker):
            self.ticker = ticker
            self.earnings_date = None
            self.earnings_time = None

    stocks = [Stock("NVDA"), Stock("AAPL"), Stock("KO")]
    mail_data._apply_earnings(Src(), stocks, datetime(2026, 11, 24, 15, tzinfo=timezone.utc))
    assert [stock.earnings_date for stock in stocks] == [None, date(2026, 11, 27), date(2026, 11, 27)]
