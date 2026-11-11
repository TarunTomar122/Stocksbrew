"""Tests for the SEC earnings history job and the reaction window it settles (no network, no store)."""

from backend.agentdata import earnings_history as eh
from backend.agentdata import earnings_reactions as er
from backend.agentdata.feeds_common import Instrument


def _block(rows):
    """A submissions ``recent`` block from (form, items, filingDate, acceptanceDateTime, accession) rows."""
    keys = ("form", "items", "filingDate", "acceptanceDateTime", "accessionNumber")
    block = {key: [row[index] for row in rows] for index, key in enumerate(keys)}
    block["primaryDocument"] = [f"doc{index}.htm" for index in range(len(rows))]
    return block


# -- acceptance time -> session -------------------------------------------------


def test_acceptance_session_uses_new_york_time_across_daylight_saving():
    # Summer (EDT, UTC-4): 20:30Z is 4:30 PM, after the close.
    assert eh.acceptance_session("2026-07-30T20:30:28+00:00") == ("2026-07-30", "amc")
    # Winter (EST, UTC-5): 21:30Z is 4:30 PM, after the close; 20:30Z would be 3:30 PM, during.
    assert eh.acceptance_session("2026-11-02T21:30:23+00:00") == ("2026-11-02", "amc")
    assert eh.acceptance_session("2026-11-02T20:30:00Z") == ("2026-11-02", "during")
    # 7:00 AM ET before the open; 9:29 still before, 9:30 is the open, 4:00 PM exactly is after.
    assert eh.acceptance_session("2026-01-28T12:00:00Z") == ("2026-01-28", "bmo")
    assert eh.acceptance_session("2026-01-28T14:29:59Z") == ("2026-01-28", "bmo")
    assert eh.acceptance_session("2026-01-28T14:30:00Z") == ("2026-01-28", "during")
    assert eh.acceptance_session("2026-01-28T21:00:00Z") == ("2026-01-28", "amc")
    # Late evening UTC is still the same New York day; just after midnight UTC is the evening before.
    assert eh.acceptance_session("2026-01-29T02:15:00Z") == ("2026-01-28", "amc")


def test_acceptance_session_rejects_bad_or_naive_times():
    assert eh.acceptance_session("") is None
    assert eh.acceptance_session("not a time") is None
    assert eh.acceptance_session("2026-01-28T21:00:00") is None  # no zone: cannot place it


# -- filings -> reports -----------------------------------------------------------


def test_reports_keep_original_results_8ks_since_the_cutoff():
    block = _block(
        [
            ("8-K", "2.02,9.01", "2026-07-30", "2026-07-30T20:30:28.000Z", "0000320193-26-000018"),
            ("8-K/A", "2.02", "2026-08-02", "2026-08-02T14:00:00.000Z", "0000320193-26-000019"),  # amendment
            ("8-K", "5.02", "2026-06-01", "2026-06-01T20:30:00.000Z", "0000320193-26-000017"),  # not results
            ("10-Q", "", "2026-07-31", "2026-07-31T20:30:00.000Z", "0000320193-26-000020"),
            ("8-K", "2.02", "2026-05-01", "", "0000320193-26-000016"),  # no acceptance time
            ("8-K", "12.02", "2026-04-01", "2026-04-01T20:30:00.000Z", "0000320193-26-000015"),  # not item 2.02
            ("8-K", "2.02", "2023-01-01", "2023-01-01T20:30:00.000Z", "0000320193-23-000001"),  # before the cutoff
        ]
    )
    reports = eh.reports_from_block(block, cik=320193, since="2024-01-01")
    assert [report["accession"] for report in reports] == ["0000320193-26-000018"]
    report = reports[0]
    assert report["date"] == "2026-07-30"
    assert report["session"] == "amc"
    assert report["accepted_at"] == "2026-07-30T20:30:28+00:00"
    assert report["items"] == ["2.02", "9.01"]
    assert report["url"] == "https://www.sec.gov/Archives/edgar/data/320193/000032019326000018/doc0.htm"
    assert report["index_url"].endswith("/0000320193-26-000018-index.htm")


def test_report_date_is_the_acceptance_day_not_the_filing_date():
    # Accepted at 6:00 PM ET, after EDGAR's 5:30 PM cutoff, so the filing date is the next business day.
    block = _block([("8-K", "2.02", "2026-02-02", "2026-01-30T23:00:00.000Z", "0000000001-26-000001")])
    (report,) = eh.reports_from_block(block, cik=1, since="2024-01-01")
    assert report["date"] == "2026-01-30"
    assert report["filing_date"] == "2026-02-02"
    assert report["session"] == "amc"


def test_older_pages_only_when_recent_does_not_reach_back():
    payload = {
        "filings": {
            "recent": {"filingDate": ["2026-11-01", "2025-06-01"]},
            "files": [
                {"name": "CIK1-submissions-001.json", "filingFrom": "2023-01-01", "filingTo": "2025-05-31"},
                {"name": "CIK1-submissions-002.json", "filingFrom": "2015-01-01", "filingTo": "2022-12-31"},
            ],
        }
    }
    assert eh.older_pages_needed(payload, "2023-11-11") == ["CIK1-submissions-001.json"]
    assert eh.older_pages_needed(payload, "2025-01-01") == ["CIK1-submissions-001.json"]
    assert eh.older_pages_needed(payload, "2025-06-01") == []  # recent already covers it
    assert eh.older_pages_needed({"filings": {"recent": {}}}, "2023-01-01") == []


def test_merge_never_shrinks_a_history_and_sorts_newest_first():
    stored = [
        {"accession": "a1", "date": "2024-02-01", "accepted_at": "2024-02-01T21:30:00+00:00", "session": "amc"},
        {"accession": "a2", "date": "2024-05-02", "accepted_at": "2024-05-02T20:30:00+00:00", "session": "amc"},
        {"not": "a report"},
    ]
    fresh = [
        {"accession": "a2", "date": "2024-05-02", "accepted_at": "2024-05-02T20:30:00+00:00", "session": "amc", "url": "new"},
        {"accession": "a3", "date": "2024-08-01", "accepted_at": "2024-08-01T20:30:00+00:00", "session": "amc"},
    ]
    merged = eh.merge_reports(stored, fresh)
    assert [report["accession"] for report in merged] == ["a3", "a2", "a1"]
    assert merged[1]["url"] == "new"  # the fresh copy wins
    # A short reply (EDGAR returned nothing this time) keeps what was stored.
    assert [report["accession"] for report in eh.merge_reports(stored, [])] == ["a2", "a1"]


def test_build_doc_summarises_the_reports():
    reports = [
        {"accession": "a2", "date": "2026-07-30"},
        {"accession": "a1", "date": "2026-04-30"},
    ]
    doc = eh.build_doc(instrument=Instrument(ticker="AAPL", name="Apple"), cik=320193, sec_name="Apple Inc.", reports=reports, now_iso="2026-11-11T00:00:00+00:00")
    assert doc["ticker"] == "AAPL"
    assert doc["report_count"] == 2
    assert (doc["oldest"], doc["newest"]) == ("2026-04-30", "2026-07-30")
    assert doc["source_url"] == "https://data.sec.gov/submissions/CIK0000320193.json"
    assert doc["market"] == "US"


# -- reactions: the 8-K settles a missing time ---------------------------------------


def test_results_filings_by_day_takes_the_earliest_original_filing():
    history = {
        "reports": [
            {"accepted_at": "2026-11-02T21:30:23+00:00", "url": "late"},
            {"accepted_at": "2026-11-02T12:00:00+00:00", "url": "early"},  # 7:00 AM ET the same day
        ]
    }
    filings = [
        {"filed_at": "2026-10-30T11:00:00+00:00", "item_codes": ["2.02"], "form": "8-K/A", "is_amendment": True, "url": "amended"},
        {"filed_at": "2026-10-29T20:30:00+00:00", "item_codes": ["2.02", "9.01"], "form": "8-K", "url": "recent"},
        {"filed_at": "2026-10-28T20:30:00+00:00", "item_codes": ["5.02"], "form": "8-K", "url": "not results"},
    ]
    days = er.results_filings_by_day(history, filings)
    assert days["2026-11-02"] == {"session": "bmo", "accepted_at": "2026-11-02T12:00:00+00:00", "url": "early"}
    assert days["2026-10-29"]["session"] == "amc"
    assert "2026-10-30" not in days
    assert "2026-10-28" not in days
    assert er.results_filings_by_day(None, []) == {}


def test_resolve_session_only_fills_a_missing_time():
    amc = {"session": "amc"}
    during = {"session": "during"}
    assert er.resolve_session("bmo", amc) == ("bmo", "calendar")  # the calendar's own time wins
    assert er.resolve_session("unknown", amc) == ("amc", "sec_8k")
    assert er.resolve_session("unknown", during) == ("unknown", "calendar")  # still two sessions
    assert er.resolve_session("unknown", None) == ("unknown", "calendar")


def test_resolved_time_gives_the_one_day_window():
    dates = ["2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03"]
    closes = [340.0, 344.63, 338.32, 331.9]
    two_day = er.reaction(dates, closes, "2026-11-02", "unknown")
    assert two_day["basis"] == "2d" and two_day["pct"] == -3.69
    session, _source = er.resolve_session("unknown", {"session": "amc"})
    one_day = er.reaction(dates, closes, "2026-11-02", session)
    assert one_day == {
        "pct": -1.9,
        "basis": "1d",
        "from_date": "2026-11-02",
        "from_close": 338.32,
        "to_date": "2026-11-03",
        "to_close": 331.9,
    }
    session, _source = er.resolve_session("unknown", {"session": "bmo"})
    assert er.reaction(dates, closes, "2026-11-02", session)["from_date"] == "2026-10-30"


# -- which 2.02 8-Ks are releases -------------------------------------------------------


def _report(day, accepted_hour_utc=21, accession=None):
    return {"date": day, "accepted_at": f"{day}T{accepted_hour_utc:02d}:00:00+00:00", "accession": accession or f"acc-{day}", "session": "amc"}


def test_unreadable_acceptance_time_is_skipped_not_moved_to_midnight():
    block = _block([("8-K", "2.02", "2026-02-02", "garbage", "0000000001-26-000001")])
    assert eh.reports_from_block(block, cik=1, since="2024-01-01") == []


def test_periodic_from_block_keeps_original_10q_and_10k():
    block = {
        "form": ["10-Q", "10-Q/A", "10-K", "8-K", "10-KT", "10-Q"],
        "reportDate": ["2026-06-30", "2026-06-30", "2025-12-31", "2026-05-01", "2025-09-30", ""],
        "filingDate": ["2026-08-04", "2026-09-01", "2026-02-24", "2026-05-01", "2025-11-20", "2026-05-05"],
    }
    assert eh.periodic_from_block(block, since="2025-12-01") == [
        {"period_end": "2026-06-30", "filed": "2026-08-04", "form": "10-Q"},
        {"period_end": "2025-12-31", "filed": "2026-02-24", "form": "10-K"},
    ]


def test_mark_releases_drops_delivery_and_conference_8ks():
    # LCID-like: a deliveries 8-K after the quarter ends, then the release the day the 10-K is filed.
    # CUBE-like: the release before the open, the 10-Q a day later, a conference deck three days after that.
    reports = [
        _report("2026-01-05", 14),  # deliveries
        _report("2026-02-24"),  # Q4 release
        _report("2026-04-03"),  # deliveries
        _report("2026-04-30", 11),  # Q1 release
        _report("2026-05-04"),  # conference deck after the 10-Q
        _report("2026-06-01"),  # conference
    ]
    periodic = [
        {"period_end": "2025-12-31", "filed": "2026-02-24", "form": "10-K"},
        {"period_end": "2026-03-31", "filed": "2026-05-01", "form": "10-Q"},
    ]
    marked = {report["date"]: report for report in eh.mark_releases(reports, periodic, checked_from="2025-01-01")}
    assert [day for day, report in sorted(marked.items()) if report["release"]] == ["2026-02-24", "2026-04-30"]
    assert marked["2026-02-24"]["period_end"] == "2025-12-31" and marked["2026-02-24"]["periodic_form"] == "10-K"
    assert marked["2026-01-05"]["release"] is False
    assert marked["2026-05-04"]["release"] is False
    assert marked["2026-06-01"]["release"] is False  # after the newest 10-Q, but the next quarter has not ended
    # The input is not changed.
    assert "release" not in reports[0]


def test_mark_releases_accepts_the_coming_quarter_once_it_has_ended():
    periodic = [{"period_end": "2026-06-30", "filed": "2026-08-04", "form": "10-Q"}]
    early = eh.mark_releases([_report("2026-07-30"), _report("2026-10-05", 14)], periodic, checked_from="2025-01-01")
    assert [report["release"] for report in early] == [True, False]  # Oct 5 is five days after Sep 30
    late = eh.mark_releases([_report("2026-07-30"), _report("2026-10-20"), _report("2026-11-03")], periodic, checked_from="2025-01-01")
    assert [report["release"] for report in late] == [True, False, True]  # only the latest one counts


def test_mark_releases_without_periodic_filings_leaves_reports_unchecked():
    marked = eh.mark_releases([_report("2026-07-30")], [], checked_from="2025-01-01")
    assert marked[0]["release"] is None


def test_mark_releases_keeps_old_decisions_it_can_no_longer_check():
    stored_old = {**_report("2023-01-05"), "release": False, "period_end": None, "periodic_form": None}
    periodic = [{"period_end": "2026-06-30", "filed": "2026-08-04", "form": "10-Q"}]
    marked = eh.mark_releases([stored_old, _report("2026-07-30")], periodic, checked_from="2024-01-01")
    assert marked[0]["release"] is False
    assert marked[1]["release"] is True
    doc = eh.build_doc(instrument=Instrument(ticker="X", name="X"), cik=1, sec_name="X", reports=marked, now_iso="t")
    assert (doc["report_count"], doc["release_count"]) == (2, 1)


def test_results_filings_by_day_skips_what_the_history_marks_not_a_release():
    history = {"reports": [{"accepted_at": "2026-04-14T15:07:00+00:00", "accession": "a-x", "release": False, "url": "deck"}]}
    filings = [{"filed_at": "2026-04-14T15:07:00+00:00", "item_codes": ["2.02"], "form": "8-K", "accession": "a-x", "url": "deck"}]
    assert er.results_filings_by_day(history, filings) == {}
