"""Parsers for the calendar feed and the earnings reaction windows."""

from backend.agentdata import calendar_events as ce
from backend.agentdata import earnings_reactions as er

ICS = """BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;TZID=US-Eastern:20261110T083000
SUMMARY:Consumer Price Index
END:VEVENT
BEGIN:VEVENT
SUMMARY:GDP (Second Estimate) and Corporate Profits\\, 3rd Quarter 20
 26
DTSTART;VALUE=DATE-TIME:20261125T133000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:GDP by County and Personal Income by County\\, 2025
DTSTART;VALUE=DATE-TIME:20261202T133000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:No start
END:VEVENT
END:VCALENDAR
"""


def test_parse_ics_unfolds_and_converts_to_eastern():
    events = ce.parse_ics(ICS)
    assert [(e["title"], e["date"], e["time_et"]) for e in events] == [
        ("Consumer Price Index", "2026-11-10", "08:30"),
        ("GDP (Second Estimate) and Corporate Profits, 3rd Quarter 2026", "2026-11-25", "08:30"),
        ("GDP by County and Personal Income by County, 2025", "2026-12-02", "08:30"),
    ]


def test_economic_docs_keep_market_releases_only():
    events = ce.parse_ics(ICS)
    bls = ce.economic_docs(events, ce._BLS_RELEASES, source="bls", source_name="BLS", source_url="u", now_iso="t")
    assert [(d["id"], d["title"], d["importance"]) for d in bls] == [("eco_bls_cpi_2026-11-10", "CPI inflation", "high")]
    bea = ce.economic_docs(events, ce._BEA_RELEASES, source="bea", source_name="BEA", source_url="u", now_iso="t")
    assert [(d["id"], d["period"]) for d in bea] == [("eco_bea_gdp_2026-11-25", "3rd Quarter 2026, second estimate")]


def test_release_period():
    assert ce.release_period("Personal Income and Outlays, October 2026") == "October 2026"
    assert ce.release_period("GDP (Advance Estimate), 4th Quarter and Year 2026") == "4th Quarter and Year 2026, advance estimate"
    assert ce.release_period("Employment Situation") == ""


def test_parse_fomc_uses_decision_day_and_skips_notation_votes():
    html = """
<div class="panel panel-default"><div class="panel-heading"><h4><a id="1">2026 FOMC Meetings</a></h4></div>
  <div class="fomc-meeting__month col"><strong>December</strong></div>
  <div class="fomc-meeting__date col">8-9*</div>
  <div class="fomc-meeting__month col"><strong>Apr/May</strong></div>
  <div class="fomc-meeting__date col">30-1</div>
  <div class="fomc-meeting__month col"><strong>August</strong></div>
  <div class="fomc-meeting__date col">22 (notation vote)</div>
</div>
"""
    meetings = ce.parse_fomc(html)
    assert meetings == [
        {"date": "2026-12-09", "start_date": "2026-12-08", "projections": True},
        {"date": "2026-05-01", "start_date": "2026-04-30", "projections": False},
    ]
    docs = ce.fomc_docs(meetings, now_iso="t")
    assert docs[0]["id"] == "eco_fed_fomc_2026-12-09" and docs[0]["time_et"] == "14:00"
    assert ce.parse_fomc("<html></html>") == []


def test_price_range_and_dates():
    assert ce.price_range("11.00-13.00") == (11.0, 13.0)
    assert ce.price_range("10.00") == (10.0, 10.0)
    assert ce.price_range("") == (None, None)
    assert ce._us_date("11/12/2026") == "2026-11-12"
    assert ce._us_date("13/40/2026") == ""
    assert ce._number("$249,166,671") == 249166671.0
    assert ce._number("N/A") is None


def test_parse_ipo_calendar_and_priced_wins():
    payload = {
        "data": {
            "priced": {"rows": [{"dealID": "1-1", "proposedTickerSymbol": "NARA", "companyName": "Narragansett Bancorp, Inc.",
                                 "proposedExchange": "NASDAQ Capital", "proposedSharePrice": "10.00", "sharesOffered": "9,098,800",
                                 "pricedDate": "11/02/2026", "dollarValueOfSharesOffered": "$90,988,000"}]},
            "upcoming": {"upcomingTable": {"rows": [
                {"dealID": "1-1", "proposedTickerSymbol": "NARA", "companyName": "Narragansett Bancorp, Inc.",
                 "proposedSharePrice": "9.00-11.00", "expectedPriceDate": "11/02/2026"},
                {"dealID": "2-2", "proposedTickerSymbol": None, "companyName": "Rezera Inc.", "proposedSharePrice": "11.00-13.00",
                 "expectedPriceDate": "11/12/2026", "dollarValueOfSharesOffered": "$249,166,671"},
                {"dealID": "", "companyName": "No id", "expectedPriceDate": "11/12/2026"},
            ]}},
        }
    }
    deals = ce.parse_ipo_calendar(payload)
    assert len(deals) == 3
    docs = {d["id"]: d for d in ce.ipo_docs(deals, now_iso="t")}
    assert docs["ipo_1-1"]["status"] == "priced" and docs["ipo_1-1"]["price_low"] == 10.0
    assert docs["ipo_2-2"]["ticker"] is None and docs["ipo_2-2"]["price_high"] == 13.0
    assert ce.parse_ipo_calendar({"data": None}) == []


def test_parse_dividend_day():
    payload = {"data": {"calendar": {"rows": [
        {"symbol": "AEP", "companyName": "American Electric Power", "dividend_Ex_Date": "11/10/2026", "payment_Date": "12/10/2026",
         "record_Date": "11/10/2026", "dividend_Rate": 0.97, "indicated_Annual_Dividend": 3.8, "announcement_Date": "10/20/2026"},
        {"symbol": "ZERO", "dividend_Ex_Date": "11/10/2026", "dividend_Rate": 0},
    ]}}}
    rows = ce.parse_dividend_day(payload)
    assert rows == [{"symbol": "AEP", "company": "American Electric Power", "ex_date": "2026-11-10", "payment_date": "2026-12-10",
                     "record_date": "2026-11-10", "announced": "2026-10-20", "amount": 0.97, "annual_amount": 3.8}]
    doc = ce.dividend_doc(rows[0], ticker="AEP", name="American Electric Power Company", now_iso="t")
    assert doc["id"] == "div_AEP_2026-11-10" and doc["kind"] == "dividend"
    assert ce.parse_dividend_day({"data": {"calendar": {"rows": None}}}) == []
    assert ce.parse_dividend_day({"data": {}}) is None


DATES = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]
CLOSES = [100.0, 110.0, 99.0, 108.9, 120.0]


def test_reaction_windows():
    assert er.reaction(DATES, CLOSES, "2026-11-03", "bmo") == {
        "pct": 10.0, "basis": "1d", "from_date": "2026-11-02", "from_close": 100.0, "to_date": "2026-11-03", "to_close": 110.0}
    amc = er.reaction(DATES, CLOSES, "2026-11-03", "amc")
    assert (amc["pct"], amc["from_date"], amc["to_date"], amc["basis"]) == (-10.0, "2026-11-03", "2026-11-04", "1d")
    unknown = er.reaction(DATES, CLOSES, "2026-11-03", "unknown")
    assert (unknown["pct"], unknown["from_date"], unknown["to_date"], unknown["basis"]) == (-1.0, "2026-11-02", "2026-11-04", "2d")


def test_reaction_waits_for_the_closing_price():
    assert er.reaction(DATES, CLOSES, "2026-11-06", "amc") is None      # next close not in yet
    assert er.reaction(DATES, CLOSES, "2026-11-06", "unknown") is None
    assert er.reaction(DATES, CLOSES, "2026-11-09", "bmo") is None      # report day not in yet
    assert er.reaction(DATES, CLOSES, "2026-11-02", "bmo") is None      # no prior close
    assert er.reaction([], [], "2026-11-03", "bmo") is None


def test_reaction_on_a_non_trading_day_uses_the_next_session():
    dates = ["2026-11-06", "2026-11-09", "2026-11-10"]
    closes = [100.0, 105.0, 110.0]
    weekend = er.reaction(dates, closes, "2026-11-07", "unknown")
    assert (weekend["from_date"], weekend["to_date"], weekend["basis"], weekend["pct"]) == ("2026-11-06", "2026-11-09", "1d", 5.0)


def test_completed_sessions_drops_the_bar_in_progress():
    dates, closes = er.completed_sessions(DATES, CLOSES, "2026-11-06")
    assert dates == DATES[:4] and closes == CLOSES[:4]
    assert er.completed_sessions(DATES, CLOSES, "2026-12-01")[0] == DATES
