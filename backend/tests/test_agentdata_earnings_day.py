"""Earnings day reports: figure extraction from real releases, the beat/miss math,
guidance changes, the reaction windows, the model check and rerun safety.

The fixtures are real EX-99.1 earnings releases from SEC EDGAR (filed 2026-11-09),
converted to text with ``html_to_text``. No network, no store, no model.
"""

import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from backend.agentdata import earnings_day as ed
from backend.agentdata import earnings_day_extract as x

FIXTURES = Path(__file__).parent / "fixtures" / "earnings_day"


def release(name: str) -> str:
    text = (FIXTURES / f"{name}_ex99_1.txt").read_text()
    return "\n".join(line for line in text.splitlines() if not line.startswith("# Source:"))


class HtmlToTextTest(unittest.TestCase):
    def test_table_cells_fold_dollar_and_parenthesis(self):
        html = """<html><head><title>x</title><style>p{}</style></head><body>
        <p>Qualys Announces Third Quarter 2026 Financial Results</p>
        <table><tr><td>Revenues</td><td>$</td><td>188,049</td><td></td><td>$</td><td>169,882</td></tr>
        <tr><td>Diluted</td><td>$</td><td>(0.14</td><td>)</td><td>$</td><td>0.06</td></tr>
        <tr><td>Gross margin %</td><td>57</td><td>%</td></tr></table></body></html>"""
        lines = x.html_to_text(html).splitlines()
        self.assertEqual(lines[0], "Qualys Announces Third Quarter 2026 Financial Results")
        self.assertIn("Revenues | $188,049 | $169,882", lines)
        self.assertIn("Diluted | $(0.14) | $0.06", lines)
        self.assertIn("Gross margin % | 57%", lines)

    def test_parse_number(self):
        self.assertEqual(x.parse_number("$(0.14)"), -0.14)
        self.assertEqual(x.parse_number("1,497.0"), 1497.0)
        self.assertEqual(x.parse_number("49%"), 49.0)
        self.assertIsNone(x.parse_number("—"))
        self.assertIsNone(x.parse_number("(b),(c)"))
        self.assertIsNone(x.parse_number("Three Months"))


class ExtractRealReleasesTest(unittest.TestCase):
    def test_qualys(self):
        facts = x.extract_release(release("qlys"), fiscal_date_ending="2026-09-30")
        self.assertEqual(facts["period"]["label"], "Q3 2026")
        revenue = facts["revenue"]
        self.assertEqual(revenue["value"], 188_049_000)
        self.assertEqual(revenue["prior"], 169_882_000)
        self.assertEqual(revenue["method"], "table+text")
        self.assertEqual(facts["eps"]["gaap"]["value"], 1.62)
        self.assertEqual(facts["eps"]["gaap"]["prior"], 1.39)
        self.assertEqual(facts["eps"]["adjusted"]["value"], 2.12)
        self.assertEqual(facts["eps"]["adjusted"]["prior"], 1.86)
        guidance = facts["guidance"]
        self.assertEqual(guidance["change"], "raised")
        full_year = next(i for i in guidance["items"] if i["metric"] == "revenue" and i["period"] == "Full year 2026")
        self.assertEqual((full_year["low"], full_year["high"]), (736_900_000, 738_900_000))
        self.assertEqual((full_year["prev_low"], full_year["prev_high"]), (732_000_000, 738_000_000))
        self.assertEqual(full_year["direction"], "raised")
        q4 = next(i for i in guidance["items"] if i["metric"] == "revenue" and i["period"] == "Q4 2026")
        self.assertEqual((q4["low"], q4["high"]), (191_000_000, 193_000_000))
        adjusted = next(i for i in guidance["items"] if i["metric"] == "adjusted_eps" and i["period"] == "Full year 2026")
        self.assertEqual((adjusted["prev_low"], adjusted["prev_high"]), (7.74, 7.88))
        quotes = x.pick_quotes(facts["quote_candidates"])
        self.assertTrue(quotes)
        self.assertTrue(all(q["speaker"] == "Sumedh Thakar, CEO" for q in quotes))

    def test_hims(self):
        facts = x.extract_release(release("hims"), fiscal_date_ending="2026-09-30")
        self.assertEqual(facts["revenue"]["value"], 890_373_000)
        self.assertEqual(facts["revenue"]["prior"], 598_976_000)
        self.assertEqual(facts["eps"]["gaap"]["value"], -0.14)
        self.assertEqual(facts["eps"]["gaap"]["prior"], 0.06)
        self.assertIsNone(facts["eps"]["adjusted"])
        by_metric = {i["metric"]: i for i in facts["guidance"]["items"]}
        self.assertEqual(by_metric["revenue"]["direction"], "narrowed")
        self.assertEqual(by_metric["adjusted_ebitda"]["direction"], "lowered")
        self.assertEqual((by_metric["adjusted_ebitda"]["low"], by_metric["adjusted_ebitda"]["high"]), (257_000_000, 277_000_000))
        self.assertEqual(facts["guidance"]["change"], "lowered")
        speakers = {q["speaker"] for q in facts["quote_candidates"]}
        self.assertIn("Yemi Okupe, CFO", speakers)

    def test_take_two_fiscal_quarter_and_loss(self):
        facts = x.extract_release(release("ttwo"), fiscal_date_ending="2026-09-30")
        self.assertEqual(facts["period"]["label"], "fiscal Q2 2027")
        self.assertAlmostEqual(facts["revenue"]["value"], 1_497_000_000)
        self.assertAlmostEqual(facts["revenue"]["prior"], 1_773_800_000)
        # A loss stated in words ("net loss ... or $0.29 per share") is negative.
        self.assertEqual(facts["eps"]["gaap"]["value"], -0.29)
        self.assertEqual(facts["eps"]["gaap"]["prior"], -0.73)
        self.assertIsNone(facts["eps"]["adjusted"])
        bookings = next(i for i in facts["guidance"]["items"] if i["metric"] == "net_bookings")
        self.assertEqual((bookings["low"], bookings["high"]), (8_000_000_000, 8_200_000_000))
        self.assertEqual(bookings["direction"], "reaffirmed")
        self.assertEqual(facts["guidance"]["change"], "reaffirmed")
        self.assertTrue(facts["quote_candidates"][0]["speaker"].startswith("Strauss Zelnick"))

    def test_constellation_refuses_tables_without_a_year_ago_column(self):
        facts = x.extract_release(release("ceg"), fiscal_date_ending="2026-09-30")
        # The statement puts Q3 next to nine months of the same year, and the reconciliation
        # interleaves adjustments; neither may be read as "this quarter vs a year ago".
        self.assertIsNone(facts["revenue"])
        self.assertEqual(facts["eps"]["gaap"]["value"], 5.19)
        self.assertEqual(facts["eps"]["gaap"]["prior"], 2.97)
        self.assertEqual(facts["eps"]["adjusted"]["value"], 5.06)
        self.assertEqual(facts["eps"]["adjusted"]["prior"], 3.04)
        guidance = facts["guidance"]
        self.assertEqual(guidance["change"], "raised")
        item = guidance["items"][0]
        self.assertEqual((item["metric"], item["low"], item["high"]), ("adjusted_eps", 12.5, 12.8))


class GuidanceRulesTest(unittest.TestCase):
    def item(self, low, high, prev_low=None, prev_high=None, words=None, unit="usd"):
        return {"metric": "revenue", "period": "Full year 2026", "low": low, "high": high, "prev_low": prev_low, "prev_high": prev_high, "words": words, "unit": unit}

    def test_direction_from_previous_range(self):
        self.assertEqual(x.guidance_direction(self.item(740e6, 750e6, 730e6, 740e6)), "raised")
        self.assertEqual(x.guidance_direction(self.item(720e6, 730e6, 730e6, 740e6)), "lowered")
        self.assertEqual(x.guidance_direction(self.item(732e6, 738e6, 730e6, 740e6)), "narrowed")
        self.assertEqual(x.guidance_direction(self.item(730e6, 740e6, 730e6, 740e6)), "reaffirmed")
        # Numbers beat words: "reaffirms" with a lower range is still a cut.
        self.assertEqual(x.guidance_direction(self.item(700e6, 710e6, 730e6, 740e6, words="reaffirmed")), "lowered")
        self.assertEqual(x.guidance_direction(self.item(1, 2, words="raised")), "raised")
        self.assertEqual(x.guidance_direction(self.item(1, 2)), "issued")

    def test_compare_with_last_report(self):
        current = [self.item(740e6, 750e6)]
        previous = [{"metric": "revenue", "period": "Full year 2026", "low": 730e6, "high": 740e6}]
        compared = x.compare_with_previous(current, previous)
        self.assertEqual(compared[0]["direction"], "raised")
        self.assertEqual(compared[0]["prev_from"], "last report")
        # A different period is not a comparison.
        other = x.compare_with_previous([dict(self.item(740e6, 750e6), period="Q4 2026")], previous)
        self.assertNotIn("prev_from", other[0])

    def test_overall_change(self):
        self.assertEqual(x.overall_change([{"direction": "raised"}, {"direction": "lowered"}]), "mixed")
        self.assertEqual(x.overall_change([{"direction": "narrowed"}, {"direction": "issued"}]), "narrowed")
        self.assertEqual(x.overall_change([], "raised"), "raised")
        self.assertEqual(x.overall_change([]), "none")
        self.assertEqual(x.overall_change([{"direction": "issued"}]), "issued")

    def test_two_metrics_in_one_sentence_keep_their_own_verbs(self):
        sentence = "Tightens full year 2026 revenue guidance to a range of $3.13 billion to $3.15 billion and reduces Adjusted EBITDA guidance to a range of $257 million to $277 million"
        items = x._guidance_from_sentence(sentence, None)
        self.assertEqual([(i["metric"], i["words"]) for i in items], [("revenue", "narrowed"), ("adjusted_ebitda", "lowered")])


class BeatMissTest(unittest.TestCase):
    def test_thresholds_match_the_calendar(self):
        self.assertEqual(ed.eps_verdict(1.46, 1.67), {"verdict": "beat", "surprise": 0.21, "surprise_pct": 14.4})
        self.assertEqual(ed.eps_verdict(1.00, 0.95)["verdict"], "miss")
        self.assertEqual(ed.eps_verdict(1.00, 1.005)["verdict"], "in_line")
        self.assertEqual(ed.eps_verdict(-0.06, -0.09)["verdict"], "miss")

    def test_tiny_estimates_get_no_percentage(self):
        result = ed.eps_verdict(0.07, 0.03)
        self.assertEqual(result["verdict"], "miss")
        self.assertIsNone(result["surprise_pct"])
        self.assertEqual(result["surprise"], -0.04)

    def test_missing_sides(self):
        self.assertEqual(ed.eps_verdict(1.0, None)["verdict"], "pending")
        self.assertEqual(ed.eps_verdict(None, None)["verdict"], "no_estimate")

    def test_expectations_keep_one_provider(self):
        rows = [{"symbol": "QLYS", "eps_estimate": 1.46, "reported_eps": 1.67}]
        self.assertEqual(ed.expectations({"ticker": "QLYS", "eps_estimate": 1.40}, rows), (1.46, 1.67, "Nasdaq earnings calendar"))
        stored = {"ticker": "CEG", "eps_estimate": 3.9, "reported_eps": 5.06, "estimated_eps": 3.89, "actuals_source": "yfinance"}
        self.assertEqual(ed.expectations(stored, None), (3.89, 5.06, "Yahoo Finance"))
        self.assertEqual(ed.expectations({"ticker": "X", "eps_estimate": 0.5}, []), (0.5, None, "Nasdaq earnings calendar"))

    def test_revenue_estimate_only_for_the_reported_quarter(self):
        revenue = {"value": 269_348_000, "prior": 52_437_000}
        now = "2026-11-12T13:00:00+00:00"
        # Same quarter: Yahoo's year-ago revenue is the release's prior-year figure (LUNR, Nov 12).
        taken = ed.revenue_estimate(revenue, {"avg": 247_563_070.0, "analysts": 10.0, "year_ago": 52_437_000.0}, None, now_iso=now)
        self.assertEqual((taken["value"], taken["analysts"], taken["source"]), (247_563_070, 10, "Yahoo Finance"))
        self.assertEqual(ed.revenue_verdict(revenue["value"], taken), {"verdict": "beat", "surprise_pct": 8.8})
        # Rolled to the next quarter (its year-ago is another quarter's), no prior to match, or NaN: nothing.
        self.assertIsNone(ed.revenue_estimate(revenue, {"avg": 280e6, "analysts": 5.0, "year_ago": 44_785_000.0}, None, now_iso=now))
        self.assertIsNone(ed.revenue_estimate({"value": 90e6, "prior": None}, {"avg": 600e6, "analysts": 1.0, "year_ago": 500e6}, None, now_iso=now))
        self.assertIsNone(ed.revenue_estimate(revenue, {"avg": float("nan"), "analysts": None, "year_ago": 52_437_000.0}, None, now_iso=now))
        # Once stored it is kept, whatever Yahoo says later.
        self.assertIs(ed.revenue_estimate(revenue, None, taken, now_iso=now), taken)

    def test_revenue_verdict_judged_unrounded(self):
        self.assertEqual(ed.revenue_verdict(100.99, {"value": 100})["verdict"], "in_line")
        self.assertEqual(ed.revenue_verdict(98.9, {"value": 100})["verdict"], "miss")
        self.assertEqual(ed.revenue_verdict(100.0, None), {"verdict": None, "surprise_pct": None})

    def test_a_percent_of_sales_is_not_the_sales_figure(self):
        text = "Operating income increased 12% to $61.0 million, or 12.0% of sales and Adjusted operating income increased 35% to $90.0 million."
        self.assertIsNone(x.extract_revenue(text))
        self.assertEqual(x.extract_revenue("Net sales increased 4% to $487.8 million, compared to $478.4 million in the prior year quarter.")["value"], 487_800_000)
        # A sentence that opens on the revenue word has no word before it.
        opening = x.extract_revenue("Revenue was $188.0 million, compared to $169.9 million for the same quarter in 2025.")
        self.assertEqual((opening["value"], opening["prior"]), (188_000_000, 169_900_000))

    def test_yoy(self):
        self.assertEqual(ed.yoy_pct(188.049, 169.882), 10.7)
        self.assertIsNone(ed.yoy_pct(1.0, 0))
        self.assertIsNone(ed.yoy_pct(None, 1.0))


class ReactionTest(unittest.TestCase):
    dates = ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"]
    closes = [100.0, 102.0, 100.0, 110.0]

    def test_session_from_acceptance_time(self):
        self.assertEqual(ed.session_of("2026-11-09T21:08:26+00:00"), ("amc", "2026-11-09"))
        self.assertEqual(ed.session_of("2026-11-09T11:53:11+00:00"), ("bmo", "2026-11-09"))
        self.assertEqual(ed.session_of("2026-11-09T16:00:00+00:00"), ("during", "2026-11-09"))

    def test_after_close_uses_the_next_session(self):
        moved = ed.window_move(self.dates, self.closes, "amc", "2026-11-09")
        self.assertEqual((moved["pct"], moved["basis"], moved["from_date"], moved["to_date"]), (10.0, "next_session", "2026-11-09", "2026-11-10"))
        self.assertIsNone(ed.window_move(self.dates, self.closes, "amc", "2026-11-10"))

    def test_before_open_uses_the_report_day(self):
        moved = ed.window_move(self.dates, self.closes, "bmo", "2026-11-09")
        self.assertEqual((moved["pct"], moved["basis"]), (-1.96, "report_day"))

    def test_live_after_hours_move(self):
        tz = ed.NY
        bars = [(datetime(2026, 11, 9, 15, 55, tzinfo=tz), 100.0), (datetime(2026, 11, 9, 16, 30, tzinfo=tz), 105.0)]
        moved = ed.live_move(self.dates[:3], self.closes[:3], bars, "amc", "2026-11-09", datetime(2026, 11, 9, 16, 5, tzinfo=tz))
        self.assertEqual((moved["pct"], moved["basis"], moved["final"]), (5.0, "after_hours", False))

    def test_typical_move_needs_four_reports(self):
        self.assertEqual(x.typical_move([5, -3, 10, -1]), 4.0)
        self.assertIsNone(x.typical_move([5, -3, 10]))

    def test_past_moves_skip_the_current_report(self):
        filings = [
            {"accession": "now", "form": "8-K", "accepted": "2026-11-09T21:08:00+00:00"},
            {"accession": "old", "form": "8-K", "accepted": "2026-11-06T11:00:00+00:00"},
        ]
        history = ed.past_moves(self.dates, self.closes, filings, exclude="now")
        self.assertEqual(history, [{"day": "2026-11-06", "session": "bmo", "pct": 2.0}])


class EdgarTest(unittest.TestCase):
    payload = {
        "filings": {
            "recent": {
                "form": ["8-K", "8-K", "10-Q", "8-K/A"],
                "items": ["2.02,9.01", "5.02", "", "2.02"],
                "accessionNumber": ["0001-26-000043", "0001-26-000040", "0001-26-000041", "0001-26-000050"],
                "filingDate": ["2026-11-09", "2026-11-01", "2026-11-05", "2026-11-10"],
                "acceptanceDateTime": ["2026-11-09T16:08:26.000Z", "2026-11-01T12:00:00.000Z", "", "2026-11-10T12:00:00.000Z"],
                "primaryDocument": ["qlys-20261109.htm", "a.htm", "b.htm", "c.htm"],
            }
        }
    }

    def test_earnings_filings_and_pick(self):
        rows = ed.earnings_filings(self.payload)
        self.assertEqual([row["accession"] for row in rows], ["0001-26-000050", "0001-26-000043"])
        picked = ed.pick_release(rows, "2026-11-09")
        self.assertEqual(picked["accession"], "0001-26-000043")  # the original, not the amendment
        self.assertIsNone(ed.pick_release(rows, "2026-12-01"))

    def test_index_and_exhibit(self):
        html = """<table><tr><td scope="row">1</td><td scope="row">8-K</td><td scope="row"><a href="/Archives/edgar/data/1/0001/q-8k.htm">q-8k.htm</a></td><td scope="row">8-K</td></tr>
        <tr><td scope="row">2</td><td scope="row">EX-99.1</td><td scope="row"><a href="/Archives/edgar/data/1/0001/q-ex991.htm">q-ex991.htm</a></td><td scope="row">EX-99.1</td></tr></table>"""
        documents = ed.parse_index(html)
        self.assertEqual([d["type"] for d in documents], ["8-K", "EX-99.1"])
        self.assertEqual(ed.release_document(documents)["url"], "https://www.sec.gov/Archives/edgar/data/1/0001/q-ex991.htm")
        self.assertIsNone(ed.release_document([{"url": "https://www.sec.gov/a.htm", "type": "8-K"}]))


class ModelCheckTest(unittest.TestCase):
    report = {
        "ticker": "QLYS",
        "eps": {"estimate": 1.46, "actual": 1.67, "verdict": "beat", "surprise_pct": 14.4},
        "revenue": {"value": 188_049_000, "prior": 169_882_000, "yoy_pct": 10.7},
        "guidance": {"items": [], "change": "raised"},
        "period": {"label": "Q3 2026"},
    }
    quotes = [{"text": "Revenue grew 11% on strong demand for our platform this quarter.", "speaker": "A, CEO", "score": 6}]

    def test_numbers_in_the_facts_pass(self):
        reply = json.dumps({"lead": "Qualys earned $1.67 a share, ahead of $1.46, and revenue rose 10.7% to $188.0 million.", "quotes": [{"i": 0, "why": "Demand held up, with 11% growth."}], "watch": []})
        worded = ed.apply_llm(self.report, "Qualys", self.quotes, lambda system, prompt: reply)
        self.assertTrue(worded["llm"]["used"])
        self.assertEqual(worded["quotes"][0]["why"], "Demand held up, with 11% growth.")

    def test_an_invented_number_throws_the_text_away(self):
        reply = json.dumps({"lead": "Qualys earned $1.67 a share and margins hit 52%.", "quotes": [{"i": 0, "why": "x"}], "watch": []})
        worded = ed.apply_llm(self.report, "Qualys", self.quotes, lambda system, prompt: reply)
        self.assertFalse(worded["llm"]["used"])
        self.assertIn("52", worded["llm"]["reason"])
        self.assertIsNone(worded["lead"])
        self.assertEqual(worded["quotes"][0]["why"], None)  # rule pick, verbatim

    def test_model_errors_fall_back(self):
        def boom(system, prompt):
            raise TimeoutError("slow")

        worded = ed.apply_llm(self.report, "Qualys", self.quotes, boom)
        self.assertFalse(worded["llm"]["used"])
        self.assertTrue(worded["quotes"])


class FakeStore:
    def __init__(self, docs=None):
        self.docs = dict(docs or {})
        self.writes = []

    def get_many(self, paths):
        return {path: self.docs[path] for path in paths if path in self.docs}

    def set_many(self, docs, merge=False):
        docs = list(docs)
        self.writes.extend(docs)
        for path, data in docs:
            self.docs[path] = json.loads(json.dumps(data, default=str))
        return len(docs)


class FakeSources:
    def __init__(self):
        self.calls = []
        self.raw = "<html><body>" + "".join(f"<p>{line}</p>" for line in release("qlys").splitlines() if " | " not in line) + "</body></html>"

    def cik_map(self):
        self.calls.append("cik")
        return {"QLYS": 1107843}

    def submissions(self, cik):
        self.calls.append("submissions")
        return {"filings": {"recent": {"form": ["8-K"], "items": ["2.02,9.01"], "accessionNumber": ["0001107843-26-000043"], "filingDate": ["2026-11-09"], "acceptanceDateTime": ["2026-11-09T21:08:26.000Z"], "primaryDocument": ["qlys-20261109.htm"]}}}

    def text(self, url, *, immutable):
        self.calls.append("text")
        if url.endswith("-index.htm"):
            return '<tr><td>2</td><td>EX-99.1</td><td><a href="/Archives/edgar/data/1107843/000110784326000043/qlys-ex991.htm">x</a></td><td>EX-99.1</td></tr>'
        return self.raw

    def nasdaq_day(self, day):
        self.calls.append("nasdaq")
        return [{"symbol": "QLYS", "eps_estimate": 1.46, "reported_eps": 1.67}]

    def daily(self, ticker):
        self.calls.append("daily")
        return {"dates": ["2026-11-06", "2026-11-09", "2026-11-10"], "closes": [200.0, 202.46, 175.11]}

    def intraday(self, ticker):
        self.calls.append("intraday")
        return []


class RunTest(unittest.TestCase):
    def setUp(self):
        self._query, self._universe = ed.query, ed.load_universe
        event = {"ticker": "QLYS", "event_date": "2026-11-09", "market": "US", "eps_estimate": 1.46, "fiscal_date_ending": "2026-09-30", "time": "amc", "company": "Qualys, Inc."}

        def fake_query(store, collection, filters=(), orders=(), limit=None):
            if collection == ed.EVENTS:
                return [("tm_earnings_events/QLYS_2026-11-09", event)]
            return [(path, data) for path, data in store.docs.items() if path.startswith(collection + "/")]

        class Item:
            ticker = "QLYS"
            name = "Qualys, Inc."

        ed.query = fake_query
        ed.load_universe = lambda store: [Item()]
        self.now = datetime(2026, 11, 10, 22, 0, tzinfo=timezone.utc)

    def tearDown(self):
        ed.query, ed.load_universe = self._query, self._universe

    def test_rerun_writes_nothing_and_a_settled_report_costs_no_request(self):
        store, sources = FakeStore(), FakeSources()
        first = ed.run(days=1, store=store, sources=sources, use_llm=False, now=self.now, log=lambda line: None)
        self.assertEqual(first["written"], 1)
        doc = store.docs["tm_earnings_day/QLYS__2026-11-09"]
        self.assertEqual(doc["status"], "complete")
        self.assertEqual(doc["eps"]["verdict"], "beat")
        self.assertEqual(doc["reaction"]["basis"], "next_session")
        self.assertTrue(doc["reaction"]["final"])
        self.assertTrue(doc["read"]["title"].startswith("Qualys Q3 2026 Earnings: Beat on EPS"))
        self.assertEqual(doc["revenue"]["value"], 188_000_000.0)  # the sentence's figure; the fake release has no tables

        sources.calls.clear()
        second = ed.run(days=1, store=store, sources=sources, use_llm=False, now=self.now, log=lambda line: None)
        self.assertEqual((second["written"], second["settled"]), (0, 1))
        self.assertEqual(sources.calls, [])
        self.assertEqual(len(store.writes), 1)

    def test_unchanged_inputs_are_not_rewritten(self):
        store, sources = FakeStore(), FakeSources()
        ed.run(days=1, store=store, sources=sources, use_llm=False, now=self.now, log=lambda line: None)
        path = "tm_earnings_day/QLYS__2026-11-09"
        store.docs[path]["reaction"]["final"] = False  # not settled, so the run looks again
        store.docs[path]["inputs_hash"] = ed.inputs_hash({**store.docs[path], "reaction": {**store.docs[path]["reaction"], "final": True}})
        again = ed.run(days=1, store=store, sources=sources, use_llm=False, now=self.now, log=lambda line: None)
        self.assertEqual((again["written"], again["unchanged"]), (0, 1))

    def test_revenue_estimate_is_stored_and_kept_after_yahoo_rolls(self):
        store, sources = FakeStore(), FakeSources()
        # A release that states the year-ago revenue, so an estimate can be matched to its quarter.
        sources.raw = "<html><body><p>Revenues increased 11% to $188.0 million compared to $169.9 million for the same quarter in 2025.</p></body></html>"
        sources.revenue_estimate = lambda ticker: {"avg": 185_000_000.0, "analysts": 9.0, "year_ago": 169_900_000.0}
        ed.run(days=1, store=store, sources=sources, use_llm=False, now=self.now, log=lambda line: None)
        path = "tm_earnings_day/QLYS__2026-11-09"
        revenue = store.docs[path]["revenue"]
        self.assertEqual((revenue["estimate"]["value"], revenue["verdict"]), (185_000_000, "beat"))
        # The next run sees the next quarter's estimate; the stored one stays and no request is made for it.
        store.docs[path]["reaction"]["final"] = False
        asked = []
        sources.revenue_estimate = lambda ticker: asked.append(ticker) or {"avg": 200_000_000.0, "analysts": 9.0, "year_ago": 180_000_000.0}
        ed.run(days=1, store=store, sources=sources, use_llm=False, now=self.now, log=lambda line: None)
        self.assertEqual(asked, [])
        self.assertEqual(store.docs[path]["revenue"]["estimate"]["value"], 185_000_000)

    def test_nothing_filed_and_no_actual_writes_nothing(self):
        store, sources = FakeStore(), FakeSources()
        sources.submissions = lambda cik: {"filings": {"recent": {}}}
        sources.nasdaq_day = lambda day: [{"symbol": "QLYS", "eps_estimate": 1.46, "reported_eps": None}]
        stats = ed.run(days=1, store=store, sources=sources, use_llm=False, now=self.now, log=lambda line: None)
        self.assertEqual((stats["waiting"], stats["written"]), (1, 0))


class ScheduleTest(unittest.TestCase):
    def test_the_job_has_its_own_group(self):
        from backend.agentdata import schedule

        self.assertIn("earnings_day", schedule.GROUPS)
        self.assertEqual(schedule.GROUPS["earnings_day"][0][1][0], "backend.agentdata.earnings_day")


if __name__ == "__main__":
    unittest.main()
