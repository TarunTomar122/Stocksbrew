"""Pure-function tests for the event feed jobs (no network, no store)."""

from datetime import datetime, timezone

from backend.agentdata import earnings_calendar as ec
from backend.agentdata import news_feed as nf
from backend.agentdata import sec_filings as sf
from backend.agentdata.feeds_common import Instrument


# -- earnings calendar ---------------------------------------------------------


def test_parse_money_and_fiscal_month():
    assert ec.parse_money("$1.38") == 1.38
    assert ec.parse_money("($0.12)") == -0.12
    assert ec.parse_money("N/A") is None
    assert ec.parse_money("") is None
    assert ec.fiscal_month_end("Sep/2026") == "2026-09-30"
    assert ec.fiscal_month_end("Feb/2028") == "2028-02-29"
    assert ec.fiscal_month_end("soon") == ""


def test_parse_calendar_day_separates_empty_from_broken():
    assert ec.parse_calendar_day({"data": None}) is None
    assert ec.parse_calendar_day("nope") is None
    assert ec.parse_calendar_day({"data": {"rows": None}}) == []
    rows = ec.parse_calendar_day(
        {"data": {"rows": [{"symbol": "aapl", "name": "Apple  Inc.", "time": "time-after-hours", "fiscalQuarterEnding": "Sep/2026", "epsForecast": "$1.60"}, {"name": "no symbol"}]}}
    )
    assert rows == [
        {
            "symbol": "AAPL",
            "company": "Apple Inc.",
            "time": "amc",
            "fiscal_date_ending": "2026-09-30",
            "eps_estimate": 1.6,
            "reported_eps": None,
            "surprise_pct": None,
        }
    ]


def test_build_event_keeps_other_jobs_actuals_and_known_time():
    row = {"symbol": "AAPL", "company": "", "time": "during", "fiscal_date_ending": "", "eps_estimate": 1.5, "reported_eps": 1.8, "surprise_pct": None}
    fresh = ec.build_event(row, ticker="AAPL", day="2026-10-29", now_iso="now")
    assert fresh["market"] == "US" and fresh["source"] == "nasdaq_calendar"
    assert fresh["reported_eps"] == 1.8 and fresh["surprise_label"] == "beat"
    assert fresh["eps_surprise_pct"] == 20.0

    existing = {"time": "amc", "reported_eps": 1.79, "source": "alpha_vantage", "company": "Apple Inc"}
    merged = ec.build_event(row, ticker="AAPL", day="2026-10-29", now_iso="now", existing=existing)
    assert merged["time"] == "amc"
    assert merged["source"] == "alpha_vantage"
    assert merged["company"] == "Apple Inc"
    assert "reported_eps" not in merged  # the other job's result is left alone


def test_first_writable_date_guards_the_old_range():
    assert ec.FIRST_WRITABLE_DATE == "2026-08-14"


# -- news ---------------------------------------------------------------------

UNIVERSE = [
    Instrument("AAPL", "Apple Inc.", ("AAPL", "Apple")),
    Instrument("META", "Meta Platforms, Inc.", ("META", "Meta Platforms")),
    Instrument("TGT", "Target Corporation", ("TGT", "Target")),
    Instrument("COF", "Capital One Financial", ("COF", "Capital One", "Capital")),
    Instrument("F", "Ford Motor Company", ("F", "Ford Motor")),
    Instrument("GOOG", "Alphabet Inc.", ("GOOG", "Alphabet")),
    Instrument("GOOGL", "Alphabet Inc.", ("GOOGL", "Alphabet")),
    Instrument("BRK.B", "Berkshire Hathaway", ("BRKB",)),
    Instrument("ALL", "Allstate", ("ALL",)),
]


def test_matcher_is_strict():
    matcher = nf.TickerMatcher(UNIVERSE)
    assert matcher.match("Apple and Meta Platforms report; Target misses") == ["AAPL", "META"]
    assert matcher.match("Meta unveils glasses as capital spending climbs") == []
    assert matcher.match("Capital One raises its dividend") == ["COF"]
    assert matcher.match("F is for Friday, ALL in on stocks") == []  # bare tickers never match
    assert matcher.match("Pineapple prices jump") == []  # whole words only
    assert matcher.match("Shares of Berkshire Hathaway (NYSE: BRK.B) and $AAPL rose") == ["BRK.B", "AAPL"]
    assert matcher.match("(NASDAQ: ZZZZ) and $ZZZZ are not covered") == []
    assert matcher.match("Alphabet earnings") == ["GOOG"]  # share classes: one stable owner
    assert matcher.match("Allstate lifts rates") == ["ALL"]


STORY_UNIVERSE = [
    Instrument("SPCX", "Space Exploration Technologies Corp.", ("SPCX", "SpaceX", "SPACEX", "Space Exploration Technologies")),
    Instrument("NVDA", "NVIDIA Corporation", ("NVDA", "NVIDIA")),
    Instrument("GOOG", "Alphabet Inc.", ("GOOG", "Alphabet")),
    Instrument("GOOGL", "Alphabet Inc.", ("GOOGL", "Alphabet")),
    Instrument("JEF", "Jefferies", ("JEF", "Jefferies")),
    Instrument("MS", "Morgan Stanley", ("MS", "Morgan Stanley")),
    Instrument("GS", "The Goldman Sachs Group, Inc.", ("GS", "The Goldman Sachs")),
    Instrument("BAC", "Bank of America Corporation", ("BAC", "Bank of America")),
    Instrument("MP", "MP Materials Corp.", ("MP", "MP Materials")),
    Instrument("MRK", "Merck & Co., Inc.", ("MRK", "Merck &")),
    Instrument("TMO", "Thermo Fisher Scientific", ("TMO", "Thermo Fisher")),
    Instrument("CVS", "CVS Health Corporation", ("CVS", "CVS Health")),
    Instrument("PFE", "Pfizer Inc.", ("PFE", "Pfizer")),
    Instrument("HIMS", "Hims & Hers Health, Inc.", ("HIMS", "Hims & Hers Health")),
]


def test_story_names_count_in_the_headline_not_in_background():
    matcher = nf.TickerMatcher(STORY_UNIVERSE)
    # The bug: SpaceX is only background in the description of an Anthropic story.
    assert matcher.match_story(
        "Anthropic sets price range of $70 to $78 in upcoming IPO as AI lab marches toward Nasdaq",
        "Anthropic's IPO is expected to come roughly five months after Elon Musk took SpaceX public in a record offering.",
    ) == []
    assert matcher.match_story("SpaceX plans $24 billion power plant in Starbase, Texas") == ["SPCX"]
    # Explicit tags still count anywhere.
    assert matcher.match_story("Chip stocks rally", "Shares of NVIDIA (NASDAQ: NVDA) rose.") == ["NVDA"]


def test_story_brand_spellings():
    matcher = nf.TickerMatcher(STORY_UNIVERSE)
    assert matcher.match_story("Nvidia CEO faces board probe") == ["NVDA"]
    assert matcher.match_story("Google unveils new TPUs") == ["GOOG"]
    assert matcher.match_story("Goldman Sachs rises 5% on deal") == ["GS"]


def test_story_banks_quoted_for_a_view_are_not_the_subject():
    matcher = nf.TickerMatcher(STORY_UNIVERSE)
    assert matcher.match_story("MP Materials rises as Jefferies highlights rare earth growth") == ["MP"]
    assert matcher.match_story("Morgan Stanley Says S&P 500 Correction Is In Its 'Final Innings'") == []
    assert matcher.match_story("Compass Pathways could win approval by 2027, Jefferies says") == []
    assert matcher.match_story("Morgan Stanley's Mike Wilson sees an entry point") == []
    assert matcher.match_story("Zoetis to Participate in the Jefferies Global Healthcare Conference") == []
    # A story about the bank itself still counts.
    assert matcher.match_story("Morgan Stanley adds transfer agent Vinyl Equity in wealth push") == ["MS"]
    assert matcher.match_story("Bank of America sends stark warning on travel sites", target="BAC") == []


def test_story_research_reports_and_other_companies():
    matcher = nf.TickerMatcher(STORY_UNIVERSE)
    assert matcher.match_story("Global CRISPR Screening Market Report 2026 | Capitalize on 17.7% CAGR as Thermo Fisher, Merck lead") == []
    assert matcher.match_story("Bio-Techne beats as Merck KGaA merger deal advances") == []
    assert matcher.match_story("Merck & Co. wins approval") == ["MRK"]


def test_story_per_ticker_feed_needs_the_symbol_or_an_opening_name():
    matcher = nf.TickerMatcher(STORY_UNIVERSE)
    # The headline uses the symbol of the feed's own stock.
    assert matcher.match_story("Mark Cuban Says the CVS Breakup Is 'Great for Shareholders'", "", target="CVS") == ["CVS"]
    # The description opens with the company, after a dateline.
    assert matcher.match_story(
        "Dr. Andrew Huberman Joins Board of Directors",
        'SAN FRANCISCO, November 09, 2026--Hims & Hers Health, Inc. ("Hims & Hers", NYSE: HIMS), the leading platform',
        target="HIMS",
    ) == ["HIMS"]
    # A company named later in the description is not what the story is about.
    assert matcher.match_story(
        "Arbutus Reports Third Quarter 2026 Financial Results",
        "Maintained strong financial position, including payments received from Pfizer under a licence.",
        target="PFE",
    ) == []
    assert matcher.match_story("Key metrics", "Key TakeawaysFabrinet shares fell 33% as Nvidia and others slid", target="NVDA") == []


def test_retag_doc_keeps_a_per_ticker_rows_own_stock():
    matcher = nf.TickerMatcher(STORY_UNIVERSE)
    doc = {"feed": "yahoo_ticker", "title": "Dr. Andrew Huberman Joins Board", "summary": "Hims & Hers Health said on Monday", "stock_tickers": ["HIMS", "PFE"]}
    assert nf.retag_doc(matcher, doc) == ["HIMS"]
    market = {"feed": "cnbc_top", "title": "Anthropic sets price range", "summary": "after Elon Musk took SpaceX public", "stock_tickers": ["SPCX"]}
    assert nf.retag_doc(matcher, market) == []


def test_strip_suffixes():
    assert nf.strip_suffixes("Meta Platforms, Inc.") == "Meta Platforms"
    assert nf.strip_suffixes("Ford Motor Company") == "Ford Motor"
    assert nf.strip_suffixes("Inc.") == "Inc"


def test_parse_feed_rss_and_atom_and_bad_xml():
    rss = """<?xml version="1.0"?><rss><channel>
      <item><title>Apple &amp; friends</title><link>https://example.com/a?utm_source=x&amp;id=7#frag</link>
        <pubDate>Mon, 09 Nov 2026 15:00:00 -0500</pubDate><description>&lt;p&gt;Body text&lt;/p&gt;</description></item>
      <item><title>No date</title><link>https://example.com/b</link></item>
      <item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Mon, 09 Nov 2026 15:00:00 GMT</pubDate></item>
    </channel></rss>"""
    items = nf.parse_feed(rss)
    assert len(items) == 1
    assert items[0]["title"] == "Apple & friends"
    assert items[0]["url"] == "https://example.com/a?id=7"
    assert items[0]["published"] == datetime(2026, 11, 9, 20, 0, tzinfo=timezone.utc)

    atom = """<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title>
      <link href="https://example.com/c"/><updated>2026-11-09T10:00:00Z</updated><summary>S</summary></entry></feed>"""
    assert nf.parse_feed(atom)[0]["url"] == "https://example.com/c"
    assert nf.parse_feed("<rss><channel><item>") == []


def test_excerpt_is_trimmed_publisher_text():
    assert nf.excerpt("<b>Hello</b>   world", "Other title") == "Hello world"
    assert nf.excerpt("Same title", "Same title") == ""
    long = nf.excerpt("word " * 200, "t")
    assert len(long) <= nf.EXCERPT_LIMIT + 1 and long.endswith("…")


def test_build_doc_uses_the_app_field_names_and_stable_ids():
    item = {"title": "T", "url": "https://example.com/a", "published": datetime(2026, 11, 9, tzinfo=timezone.utc), "description": "A publisher sentence about it."}
    doc = nf.build_doc(item, source_name="CNBC", source_kind="publisher", feed_key="cnbc", tickers=["AAPL"], now_iso="now")
    assert doc["id"] == nf.doc_id("https://example.com/a") and len(doc["id"]) == 24
    assert {"title", "url", "source_name", "published_at", "stock_tickers", "market"} <= set(doc)
    assert doc["summary_origin"] == "publisher_excerpt"
    assert "sentiment_label" not in doc


# -- filings ------------------------------------------------------------------


def test_classify_form_and_items():
    assert sf.classify_form("8-K") == ("8-K", False)
    assert sf.classify_form("sc 13g/a") == ("13D/G", True)
    assert sf.classify_form("SCHEDULE 13D") == ("13D/G", False)
    assert sf.classify_form("S-1/A") == ("S-1", True)
    assert sf.classify_form("4") is None
    assert sf.classify_form("10-KT") is None
    assert sf.parse_items("2.02,9.01,2.02") == [
        {"code": "2.02", "label": "Results of operations (earnings)"},
        {"code": "9.01", "label": "Financial statements and exhibits"},
    ]
    assert sf.parse_items("9.99") == [{"code": "9.99", "label": "Item 9.99"}]
    assert sf.parse_items("") == []


def test_headline_leads_with_the_item_that_matters():
    items = sf.parse_items("9.01,7.01,5.02")
    assert sf.headline_for("8-K", "8-K", False, items) == "Director or executive change"
    assert sf.headline_for("8-K", "8-K/A", True, sf.parse_items("2.02")) == "Results of operations (earnings), amended"
    assert sf.headline_for("10-Q", "10-Q", False, []) == "Quarterly report"
    assert "13D" in sf.headline_for("13D/G", "SCHEDULE 13D", False, [])
    assert "13G" in sf.headline_for("13D/G", "SC 13G/A", True, [])


def test_parse_accepted():
    assert sf.parse_accepted("2026-11-03T13:05:15.000Z", "2026-11-03") == "2026-11-03T13:05:15+00:00"
    assert sf.parse_accepted("", "2026-11-03") == "2026-11-03T00:00:00+00:00"
    assert sf.parse_accepted("garbage", "") == ""


def _payload():
    return {
        "name": "ACME  CORP",
        "filings": {
            "recent": {
                "form": ["8-K", "4", "SC 13G", "SC 13G/A", "SC 13G", "10-Q", "SC 13G"],
                "accessionNumber": [
                    "0000000042-26-000009",
                    "0000000042-26-000008",
                    "0000000042-26-000007",  # own prefix: Acme reporting a stake in someone else
                    "0000999999-26-000001",
                    "0000888888-26-000002",
                    "0000000042-26-000001",
                    "0000777777-26-000003",  # an agent filing for Acme about another company
                ],
                "filingDate": ["2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02", "2026-11-01", "2026-07-01", "2026-10-30"],
                "reportDate": ["2026-11-05", "", "", "", "", "2026-06-30", ""],
                "acceptanceDateTime": ["2026-11-05T21:31:00.000Z"] * 7,
                "fileNumber": ["001-1", "", "005-555", "005-100", "005-100", "001-1", "005-777"],
                "items": ["2.02,9.01", "", "", "", "", "", ""],
                "primaryDocument": ["a.htm", "b.xml", "c.htm", "d.htm", "", "f.htm", "g.htm"],
            }
        },
    }


def test_build_filings_window_roles_and_links():
    instrument = Instrument("ACME", "Acme")
    docs = sf.build_filings(_payload(), instrument=instrument, cik=42, since="2026-08-11", now_iso="now")
    by_id = {doc["id"]: doc for doc in docs}
    assert set(by_id) == {
        "ACME_000000004226000009",
        "ACME_000000004226000007",
        "ACME_000099999926000001",
        "ACME_000088888826000002",
        "ACME_000077777726000003",
    }  # the Form 4 and the July 10-Q are out
    lead = by_id["ACME_000000004226000009"]
    assert lead["form_group"] == "8-K" and lead["item_codes"] == ["2.02", "9.01"]
    assert lead["url"] == "https://www.sec.gov/Archives/edgar/data/42/000000004226000009/a.htm"
    assert lead["filed_at"] == "2026-11-05T21:31:00+00:00"
    assert lead["role"] == "subject" and lead["company"] == "Acme" and lead["sec_name"] == "ACME CORP"
    assert by_id["ACME_000000004226000007"]["role"] == "filer"
    assert by_id["ACME_000099999926000001"]["role"] == "subject"
    assert by_id["ACME_000099999926000001"]["is_amendment"] is True
    assert by_id["ACME_000088888826000002"]["role"] == "subject"
    assert by_id["ACME_000088888826000002"]["url"].endswith("/0000888888-26-000002-index.htm")
    assert by_id["ACME_000077777726000003"]["role"] == "filer"


def test_stake_roles_when_it_cannot_tell():
    recent = {
        "form": ["SC 13G", "SC 13G"],
        "accessionNumber": ["0000000001-26-000001", "0000000002-26-000001"],
        "fileNumber": ["005-1", "005-2"],
    }
    assert sf.stake_report_roles(recent, 42) == {0: "unknown", 1: "unknown"}
    assert sf.stake_report_roles({"form": ["SC 13D"], "accessionNumber": ["0000000001-26-000001"], "fileNumber": ["005-1"]}, 42) == {0: "subject"}
