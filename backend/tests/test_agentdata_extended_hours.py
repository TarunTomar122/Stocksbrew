"""Extended-hours quotes: which prints count as after hours or pre-market, the move against the close, the
report tie-in, the stored document across sessions, and a whole run against a fake Yahoo and store.

The quote rows are Yahoo's real v7 replies for CBRS and NVDA on the evening of 2026-11-12 (CBRS reported after
the close). No network, no store.
"""

import unittest
from datetime import datetime, timezone
from unittest import mock

from backend.agentdata import extended_hours as eh

# 2026-11-13 01:45 New York (06:45 UTC): the morning after.
NOW = datetime(2026, 11, 13, 6, 45, tzinfo=timezone.utc)
CBRS = {
    "symbol": "CBRS",
    "regularMarketPrice": 97.75,
    "regularMarketTime": 1794517201,  # 2026-11-12 16:00:01 ET
    "postMarketPrice": 115.6776,
    "postMarketTime": 1794531596,  # 19:59:56 ET
}
NVDA = {
    "symbol": "NVDA",
    "regularMarketPrice": 166.19,
    "regularMarketTime": 1794517201,
    "postMarketPrice": 167.8351,
    "postMarketTime": 1794531599,
}
CBRS_REPORT = {
    "event_date": "2026-11-12",
    "session": "amc",
    "filing": {"accession": "0001628280-26-073366"},
    "guidance": {"change": "raised"},
    "eps": {"verdict": "pending"},
    "revenue": {"yoy_pct": 55.3, "verdict": None},
}


class SessionTest(unittest.TestCase):
    def test_post_and_pre_against_the_close(self):
        close = "2026-11-12T16:00:01-05:00"
        self.assertEqual(eh.session_of("2026-11-12T19:59:56-05:00", close), "post")
        self.assertEqual(eh.session_of("2026-11-13T08:41:00-05:00", close), "pre")
        # A print inside the next regular session is not an extended quote, nor one before the close.
        self.assertIsNone(eh.session_of("2026-11-13T10:00:00-05:00", close))
        self.assertIsNone(eh.session_of("2026-11-12T15:30:00-05:00", close))

    def test_half_day_close(self):
        self.assertEqual(eh.session_of("2026-11-27T13:30:00-05:00", "2026-11-27T13:00:00-05:00"), "post")

    def test_block_from_a_real_quote(self):
        blocks = eh.blocks_from_quote(CBRS, NOW)
        self.assertEqual(len(blocks), 1)
        block = blocks[0]
        self.assertEqual(block["session"], "post")
        self.assertEqual(block["price"], 115.6776)
        self.assertEqual(block["regular_close"], 97.75)
        self.assertEqual(block["change_pct"], 18.34)
        self.assertEqual(block["day"], "2026-11-12")

    def test_stale_or_penny_prints_are_left_out(self):
        later = datetime(2026, 11, 14, 6, 45, tzinfo=timezone.utc)
        self.assertEqual(eh.blocks_from_quote(CBRS, later), [])
        penny = {**CBRS, "regularMarketPrice": 0.5, "postMarketPrice": 0.6}
        self.assertEqual(eh.blocks_from_quote(penny, NOW), [])
        self.assertEqual(eh.blocks_from_quote({"symbol": "X", "regularMarketPrice": 10}, NOW), [])

    def test_chart_fallback_takes_the_last_bar_after_the_close(self):
        payload = {
            "chart": {
                "result": [
                    {
                        "meta": {"regularMarketPrice": 97.75, "regularMarketTime": 1794517201},
                        "timestamp": [1794517000, 1794520000, 1794531500],
                        "indicators": {"quote": [{"close": [97.9, 110.0, 115.6]}]},
                    }
                ]
            }
        }
        blocks = eh.blocks_from_chart(payload, NOW)
        self.assertEqual([b["session"] for b in blocks], ["post"])
        self.assertEqual(blocks[0]["price"], 115.6)


class EarningsTest(unittest.TestCase):
    def test_reason_words(self):
        self.assertEqual(eh.earnings_reason(CBRS_REPORT), "raised its outlook and revenue up 55% on a year ago")
        self.assertEqual(
            eh.earnings_reason({"eps": {"verdict": "beat"}, "revenue": {"verdict": "miss"}, "guidance": {"change": "lowered"}}),
            "cut its outlook, beat on earnings and revenue missed",
        )
        self.assertIsNone(eh.earnings_reason({"eps": {"verdict": "pending"}}))
        self.assertIsNone(eh.earnings_reason(None))

    def test_report_fits_only_its_own_session(self):
        post = eh.blocks_from_quote(CBRS, NOW)[0]
        fit = eh.earnings_for(post, {"date": "2026-11-12", "session": "amc"}, CBRS_REPORT)
        self.assertEqual(fit, {"date": "2026-11-12", "session": "amc", "confirmed": True, "reason": "raised its outlook and revenue up 55% on a year ago"})
        # A before-open report that day happened before this close: it does not explain the after-hours move.
        self.assertIsNone(eh.earnings_for(post, {"date": "2026-11-12", "session": "bmo"}, None))
        # A calendar-only row is used, unconfirmed.
        self.assertEqual(eh.earnings_for(post, {"date": "2026-11-12", "session": "amc"}, None)["confirmed"], False)


class DocTest(unittest.TestCase):
    def test_pre_market_keeps_last_evening_and_its_report(self):
        post = eh.blocks_from_quote(CBRS, NOW)
        evening = eh.build_doc("CBRS", post, None, event={"date": "2026-11-12", "session": "amc"}, report=CBRS_REPORT, captured_at="t1")
        self.assertEqual(evening["session"], "post")
        self.assertEqual(evening["post"]["crossed_at"], {"3": post[0]["as_of"], "5": post[0]["as_of"]})
        pre_block = eh.extended_block(
            price=112.0, as_of="2026-11-13T08:41:00-05:00", regular_close=97.75, regular_close_at="2026-11-12T16:00:01-05:00", now=datetime(2026, 11, 13, 13, 45, tzinfo=timezone.utc)
        )
        morning = eh.build_doc("CBRS", [pre_block], evening, event={"date": "2026-11-12", "session": "amc"}, report=CBRS_REPORT, captured_at="t2")
        self.assertEqual(morning["session"], "pre")
        self.assertEqual(morning["price"], 112.0)
        self.assertEqual(morning["post"]["price"], 115.6776)
        self.assertEqual(morning["earnings"]["date"], "2026-11-12")

    def test_never_steps_back_to_an_older_print(self):
        post = eh.blocks_from_quote(CBRS, NOW)
        stored = eh.build_doc("CBRS", post, None, event=None, report=None, captured_at="t1")
        older = {**post[0], "as_of": "2026-11-12T18:00:00-05:00", "price": 100.0}
        again = eh.build_doc("CBRS", [older], stored, event=None, report=None, captured_at="t2")
        self.assertEqual(again["price"], 115.6776)
        self.assertTrue(eh._same(stored, again))

    def test_crossings_keep_the_first_time(self):
        first = {"session": "post", "day": "2026-11-12", "change_pct": 6.0, "as_of": "a"}
        later = {"session": "post", "day": "2026-11-12", "change_pct": 4.0, "as_of": "b"}
        crossed = eh.with_crossings(first, None)
        self.assertEqual(crossed["crossed_at"], {"3": "a", "5": "a"})
        self.assertEqual(eh.with_crossings(later, crossed)["crossed_at"], {"3": "a", "5": "a"})
        next_day = {**later, "day": "2026-11-13"}
        self.assertEqual(eh.with_crossings(next_day, crossed)["crossed_at"], {"3": "b"})


class ReportFitTest(unittest.TestCase):
    def test_before_open_report_never_explains_that_evening(self):
        post = eh.blocks_from_quote(CBRS, NOW)
        stored = {"earnings": {"date": "2026-11-12", "session": "bmo", "confirmed": True, "reason": "beat on earnings"}}
        doc = eh.build_doc("CBRS", post, stored, event=None, report=None, captured_at="t")
        self.assertIsNone(doc["earnings"])
        # An after-close report on that close is kept.
        stored = {"earnings": {"date": "2026-11-12", "session": "amc", "confirmed": True, "reason": None}}
        self.assertEqual(eh.build_doc("CBRS", post, stored, event=None, report=None, captured_at="t")["earnings"]["session"], "amc")

    def test_filing_time_sets_the_report_day(self):
        post = eh.blocks_from_quote(CBRS, NOW)[0]
        # The calendar said the day before; the 8-K was accepted after this close.
        report = {**CBRS_REPORT, "event_date": "2026-11-11", "filing": {"accession": "x", "filed_at": "2026-11-12T21:03:59+00:00"}}
        self.assertEqual(eh.earnings_for(post, {"date": "2026-11-11", "session": "amc"}, report)["date"], "2026-11-12")


class CrumbTest(unittest.TestCase):
    def test_a_stale_crumb_is_refreshed_once(self):
        import io
        import urllib.error

        calls = []

        def opener(request, timeout=20):
            url = request.full_url
            calls.append(url)
            if "getcrumb" in url:
                return io.BytesIO(b"fresh" if len([c for c in calls if "getcrumb" in c]) > 1 else b"stale")
            if "fc.yahoo.com" in url:
                return io.BytesIO(b"")
            if "crumb=stale" in url:
                raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, None)
            return io.BytesIO(b'{"quoteResponse": {"result": [{"symbol": "CBRS"}]}}')

        yahoo = eh.Yahoo(min_interval=0, opener=opener)
        self.assertEqual(list(yahoo.quotes(["CBRS"])), ["CBRS"])
        self.assertEqual(yahoo.crumb, "fresh")


class FakeYahoo:
    def __init__(self, rows):
        self.rows = rows
        self.requests = 0
        self.failures = []
        self.refused = False
        self.crumb = "x"
        self.batches = []

    def quotes(self, symbols):
        self.requests += 1
        self.batches.append(symbols)
        return {symbol: self.rows[symbol] for symbol in symbols if symbol in self.rows}

    def chart(self, symbol):  # pragma: no cover - not reached while quotes answer
        raise AssertionError("chart should not be called")


class FakeStore:
    def __init__(self, docs=None):
        self.docs = dict(docs or {})
        self.writes = []

    def get_many(self, paths):
        return {path: self.docs[path] for path in paths if path in self.docs}

    def set_many(self, docs, merge=False):
        docs = list(docs)
        for path, data in docs:
            assert path.startswith("tm_extended_quotes/"), path
            self.docs[path] = data
        self.writes.append(docs)
        return len(docs)


class RunTest(unittest.TestCase):
    def test_reporters_first_then_idempotent(self):
        store = FakeStore({"tm_earnings_day/CBRS__2026-11-12": CBRS_REPORT})
        yahoo = FakeYahoo({"CBRS": CBRS, "NVDA": NVDA})
        calendar = {"CBRS": {"date": "2026-11-12", "session": "amc"}}
        with mock.patch.object(eh, "reporters", return_value=calendar), mock.patch.object(eh, "load_universe", return_value=[]), mock.patch.object(
            eh, "tracked_tickers", return_value=["NVDA", "CBRS"]
        ):
            summary = eh.run(store, now=NOW, yahoo=yahoo, log=lambda _line: None)
            self.assertEqual(yahoo.batches[0][0], "CBRS")
            self.assertEqual(summary["written"], 2)
            doc = store.docs["tm_extended_quotes/CBRS"]
            self.assertEqual(doc["earnings"]["reason"], "raised its outlook and revenue up 55% on a year ago")
            self.assertEqual(doc["source"], "Yahoo Finance")
            again = eh.run(store, now=NOW, yahoo=FakeYahoo({"CBRS": CBRS, "NVDA": NVDA}), log=lambda _line: None)
            self.assertEqual(again["written"], 0)

    def test_dry_run_writes_nothing(self):
        store = FakeStore()
        with mock.patch.object(eh, "reporters", return_value={}):
            summary = eh.run(store, now=NOW, tickers=["NVDA"], dry_run=True, yahoo=FakeYahoo({"NVDA": NVDA}), log=lambda _line: None)
        self.assertEqual(summary["changed"], 1)
        self.assertEqual(store.writes, [])


class ScheduleTest(unittest.TestCase):
    def test_group_and_prefix(self):
        from backend.agentdata import schedule, store

        self.assertIn("extended_hours", schedule.GROUPS)
        self.assertIn("tm_extended_quotes", store.WRITABLE_PREFIXES)


if __name__ == "__main__":
    unittest.main()
