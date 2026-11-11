"""The company reason under a call, built from the stock's own numbers.

``compose_company_reason`` (backend/call_reason.py) and the screener wiring
that puts it on every snapshot row (backend/agentdata/screener.py).
"""

from __future__ import annotations

import itertools
import json
import re
import unittest
from datetime import date

from backend.agentdata import screener
from backend.call_reason import (
    COMPANY_REASON_MAX_CHARS,
    _BANNED,
    _PRICE_LEVEL,
    _SENTENCE_SPLIT,
    compose_company_reason,
    numbers_supported,
    peer_label,
    short_name,
)

TODAY = date(2026, 11, 11)

# NVDA as the production snapshot had it on 2026-11-11.
NVDA = {
    "name": "NVIDIA Corporation",
    "symbol": "NVDA",
    "stance": "hold",
    "execution": "now",
    "pe": 29.14,
    "pe_hist_median": 32.9,
    "pe_hist_days": 48,
    "pe_hist_from": "2026-04-23",
    "pe_hist_to": "2026-07-23",
    "rev_growth": 83.38,
    "eps_next_y": 70.15,
    "ret_1w": -18.34,
    "ret_1m": -26.38,
    "buys_chg_3m": 2,
    "div_yield": 0.54,
    "div_growth_years": 2,
    "from_hi_pct": -29.45,
    "next_report": "2026-11-17",
    "has_add_level": False,
    "peer_label": "chip stocks",
    "peer_ret_1w": -3.3,
    "peer_ret_1m": -12.0,
}

KO = {
    "name": "Coca-Cola Company",
    "symbol": "KO",
    "stance": "accumulate",
    "execution": "now",
    "pe": 25.58,
    "pe_hist_median": 25.18,
    "pe_hist_days": 24,
    "pe_hist_from": "2026-04-23",
    "pe_hist_to": "2026-07-01",
    "rev_growth": 7.12,
    "eps_next_y": 5.64,
    "ret_1w": 2.22,
    "ret_1m": 4.0,
    "buys_chg_3m": 1,
    "div_yield": 2.22,
    "div_growth_years": 64,
    "from_hi_pct": -0.01,
    "has_add_level": True,
    "last_report": {"date": "2026-10-27", "label": "beat", "surprise_pct": 4.6},
}


def sentences(text: str) -> list[str]:
    return _SENTENCE_SPLIT.split(text)


class ComposeTest(unittest.TestCase):
    def test_hold_names_the_move_against_peers_the_growth_and_the_next_report(self):
        out = compose_company_reason(NVDA, today=TODAY)
        assert out is not None
        text = out["text"]
        self.assertTrue(text.startswith("NVIDIA fell 18% over the past week"), text)
        self.assertIn("other chip stocks (down 3.3%)", text)
        self.assertIn("sales grew 83%", text)
        self.assertIn("Nov 17 report", text)
        self.assertEqual(len(sentences(text)), 2)
        self.assertEqual(out["why"] + " " + out["change"], text)
        self.assertEqual(out["facts"], ["move", "growth"])

    def test_add_with_a_dividend_record_and_a_recent_beat(self):
        out = compose_company_reason(KO, today=TODAY)
        assert out is not None
        self.assertIn("Coca-Cola's report on Oct 27 beat profit forecasts by 4.6%", out["text"])
        self.assertIn("raised for 64 years in a row", out["text"])
        self.assertTrue(out["change"].startswith("We'd stop buying"), out["change"])

    def test_every_number_comes_from_the_facts(self):
        for facts in (NVDA, KO):
            out = compose_company_reason(facts, today=TODAY)
            assert out is not None
            evidence = json.dumps(facts) + " 2026-11-17 2026-10-27"
            self.assertTrue(numbers_supported(out["text"], evidence), out["text"])

    def test_trim_after_a_miss_says_what_would_stop_the_selling(self):
        facts = {
            "name": "Tesla, Inc.",
            "symbol": "TSLA",
            "stance": "trim",
            "rev_growth": -2.5,
            "last_report": {"date": "2026-10-21", "label": "miss", "surprise_pct": -9.1},
            "next_report": "2026-12-20",
        }
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertTrue(out["text"].startswith("Tesla's report on Oct 21 missed profit forecasts by 9.1%"), out["text"])
        self.assertIn("We'd stop selling if the Dec 20 report shows sales growing again.", out["text"])

    def test_avoid_does_not_say_stop_selling(self):
        facts = {"name": "Acme Corp", "symbol": "ACME", "stance": "avoid", "rev_growth": -12.0}
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertNotIn("stop selling", out["text"])
        self.assertIn("look again", out["text"])

    def test_trim_with_a_healthy_business_blames_the_run_up(self):
        facts = {
            "name": "Deere & Company",
            "symbol": "DE",
            "stance": "trim",
            "rev_growth": 8.3,
            "ret_1w": 1.0,
            "ret_1m": 11.0,
            "peer_label": "industrial stocks",
            "peer_ret_1m": 2.1,
        }
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertIn("Deere's sales grew 8.3% over the past year, but the stock rose 11% over the past month", out["text"])

    def test_add_on_a_dip_after_a_run_up(self):
        facts = {"name": "ADT Inc.", "symbol": "ADT", "stance": "accumulate", "execution": "pullback", "rev_growth": 2.0, "ret_1m": 54.0, "from_hi_pct": -0.3}
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertTrue(out["text"].startswith("ADT rose 54% over the past month"), out["text"])
        self.assertIn("buy on a dip rather than now", out["text"])

    def test_a_report_inside_the_week_is_the_cause_of_the_move(self):
        facts = dict(NVDA, last_report={"date": "2026-11-06", "label": "beat", "surprise_pct": 12.0})
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertIn("fell 18% over the past week after its Nov 6 report beat profit forecasts by 12%", out["text"])
        self.assertNotIn("chip stocks", out["text"])

    def test_an_older_report_is_not_blamed_for_a_month_move(self):
        facts = dict(NVDA, ret_1w=-2.0, last_report={"date": "2026-10-21", "label": "beat", "surprise_pct": 1.4})
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertNotIn("after its Oct 21 report", out["text"])

    def test_valuation_against_its_own_history(self):
        facts = {
            "name": "Ollie's Bargain Outlet Holdings, Inc.",
            "symbol": "OLLI",
            "stance": "accumulate",
            "execution": "now",
            "pe": 16.0,
            "pe_hist_median": 19.4,
            "pe_hist_days": 40,
            "pe_hist_from": "2026-05-02",
            "pe_hist_to": "2026-07-20",
            "next_report": "2026-12-08",
        }
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertIn("trades at 16 times its past year's earnings, below the 19 it typically traded at from May to July", out["text"])
        self.assertIn("P/E climbs back above 19 or the Dec 8 report misses", out["text"])

    def test_nothing_to_say_returns_none(self):
        self.assertIsNone(compose_company_reason({"name": "Quiet Co", "symbol": "QT", "stance": "hold"}, today=TODAY))
        self.assertIsNone(compose_company_reason({"name": "Quiet Co", "symbol": "QT", "stance": "mystery", "rev_growth": 50}, today=TODAY))

    def test_absurd_numbers_are_left_out(self):
        facts = {"name": "Bumble Inc - Class A", "symbol": "BMBL", "stance": "accumulate", "eps_next_y": 917.9, "rev_growth": 900.0}
        self.assertIsNone(compose_company_reason(facts, today=TODAY))

    def test_no_share_price_jargon_or_overflow_across_many_combinations(self):
        stances = ("accumulate", "hold", "watch", "trim", "avoid")
        moves = ((None, None), (-18.0, -26.0), (9.0, 20.0), (1.0, -12.0))
        growth = ((None, None), (83.0, 70.0), (-6.0, 25.0), (2.0, -11.0), (7.0, 5.0))
        reports = (None, {"date": "2026-11-06", "label": "beat", "surprise_pct": 19.0}, {"date": "2026-10-22", "label": "miss", "surprise_pct": -8.0})
        pes = ((None, None), (20.0, 30.0), (40.0, 30.0), (30.5, 30.0))
        seen = 0
        for stance, (week, month), (sales, ahead), report, (pe, median) in itertools.product(stances, moves, growth, reports, pes):
            facts = {
                "name": "Very Long Industrial Machinery Manufacturing Holdings Corporation",
                "symbol": "VLIM",
                "stance": stance,
                "execution": "pullback",
                "ret_1w": week,
                "ret_1m": month,
                "rev_growth": sales,
                "eps_next_y": ahead,
                "pe": pe,
                "pe_hist_median": median,
                "pe_hist_days": 40,
                "pe_hist_from": "2026-04-23",
                "pe_hist_to": "2026-07-23",
                "peer_label": "industrial stocks",
                "peer_ret_1w": -2.0,
                "peer_ret_1m": 3.0,
                "next_report": "2026-12-03",
                "buys_chg_3m": -3,
                "div_yield": 2.5,
                "div_growth_years": 20,
                "from_hi_pct": -30.0,
                "has_add_level": True,
            }
            if report:
                facts["last_report"] = report
            out = compose_company_reason(facts, today=TODAY)
            if out is None:
                continue
            seen += 1
            text = out["text"]
            self.assertLessEqual(len(text), COMPANY_REASON_MAX_CHARS, text)
            self.assertIsNone(_PRICE_LEVEL.search(text), text)
            self.assertFalse(any(pattern.search(text) for pattern in _BANNED), text)
            self.assertLessEqual(len(sentences(text)), 2, text)
            self.assertLessEqual(text.split(".")[0].count(" and "), 1, text)
            self.assertNotIn("..", text)
            self.assertRegex(text, r"^[A-Z0-9]")
            if stance in ("trim", "avoid"):
                self.assertNotIn("stop buying", text)
            if stance == "accumulate":
                self.assertNotIn("selling", text)
        self.assertGreater(seen, 200)


class QualityPassRegressionsTest(unittest.TestCase):
    def test_a_month_move_is_not_blamed_on_this_weeks_report(self):
        facts = {
            "name": "Redwire Corporation", "symbol": "RDW", "stance": "hold", "ret_1w": 0.2, "ret_1m": -15.0,
            "last_report": {"date": "2026-11-04", "label": "beat", "surprise_pct": 10.0},
            "peer_label": "aerospace and defense stocks", "peer_ret_1m": -2.0,
        }
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertNotIn("after its Nov 4 report", out["text"].split(".")[0].split(",")[0])
        self.assertIn("fell 15% over the past month", out["text"])

    def test_a_smaller_move_than_peers_says_less_than(self):
        facts = {"name": "ASML Holding N.V.", "symbol": "ASML", "stance": "hold", "ret_1w": -1.0, "ret_1m": -15.0, "peer_label": "chip stocks", "peer_ret_1m": -24.0}
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertIn("less than other chip stocks (down 24%)", out["text"])
        self.assertNotIn("in step", out["text"])

    def test_slow_but_positive_sales_do_not_say_growing_again(self):
        facts = {"name": "Zoetis Inc.", "symbol": "ZTS", "stance": "trim", "rev_growth": 0.9, "next_report": "2026-12-01"}
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertNotIn("growing again", out["text"])
        self.assertIn("faster sales growth", out["text"])

    def test_a_usual_pe_is_not_a_threshold_already_crossed(self):
        facts = {
            "name": "Science Applications International Corp", "symbol": "SAIC", "stance": "accumulate", "execution": "now",
            "pe": 13.0, "pe_hist_median": 12.2, "pe_hist_days": 40, "pe_hist_from": "2026-04-23", "pe_hist_to": "2026-07-23",
            "last_report": {"date": "2026-11-02", "label": "beat", "surprise_pct": 6.0},
        }
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertNotIn("climbs back above", out["text"])

    def test_profit_swinging_to_a_loss_is_not_printed_as_a_fall_over_100_percent(self):
        facts = {"name": "ZIM Integrated Shipping", "symbol": "ZIM", "stance": "trim", "eps_next_y": -104.0, "rev_growth": -20.0}
        out = compose_company_reason(facts, today=TODAY)
        assert out is not None
        self.assertNotIn("104%", out["text"])

    def test_flat_sales_never_print_zero_percent(self):
        out = compose_company_reason({"name": "Flat Co", "symbol": "FLT", "stance": "trim", "rev_growth": 0.03}, today=TODAY)
        assert out is not None
        self.assertNotIn("0%", out["text"])
        self.assertIn("sales were flat", out["text"])

    def test_names_that_start_small_or_end_in_s(self):
        out = compose_company_reason({"name": "eBay Inc.", "symbol": "EBAY", "stance": "accumulate", "rev_growth": 20.0}, today=TODAY)
        assert out is not None
        self.assertTrue(out["text"].startswith("eBay's sales"), out["text"])
        out = compose_company_reason({"name": "Domino's Pizza Inc", "symbol": "DPZ", "stance": "accumulate", "rev_growth": 20.0}, today=TODAY)
        assert out is not None
        self.assertNotIn("'s'", out["text"])

    def test_sqlite_filters_compare_both_ways(self):
        rows = [{"event_date": "2026-10-01"}, {"event_date": "2026-11-11"}, {"event_date": "2026-11-20"}]
        kept = [row for row in rows if screener._matches(row, {"field": "event_date", "op": "<=", "value": "2026-11-11"})]
        self.assertEqual([row["event_date"] for row in kept], ["2026-10-01", "2026-11-11"])
        kept = [row for row in rows if screener._matches(row, {"field": "event_date", "op": ">", "value": "2026-11-11"})]
        self.assertEqual([row["event_date"] for row in kept], ["2026-11-20"])
        with self.assertRaises(ValueError):
            screener._matches(rows[0], {"field": "event_date", "op": "!=", "value": "x"})

    def test_calendar_names_fill_in_for_ticker_names(self):
        names = screener.calendar_names(
            [
                {"ticker": "MCD", "company": "MCDONALD`S CORP"},
                {"ticker": "MCD", "company": "McDonald's Corporation"},
                {"ticker": "ON", "company": "ON"},
            ]
        )
        self.assertEqual(names, {"MCD": "McDonald's Corporation"})
        facts = screener.reason_facts({"symbol": "MCD", "name": "MCD"}, None, peers=None, report=None, today="2026-11-11", name=names["MCD"])
        self.assertEqual(facts["name"], "McDonald's Corporation")
        facts = screener.reason_facts({"symbol": "KO", "name": "Coca-Cola Company"}, None, peers=None, report=None, today="2026-11-11", name="Other")
        self.assertEqual(facts["name"], "Coca-Cola Company")


class NamesTest(unittest.TestCase):
    def test_share_classes_ampersands_and_leading_the_are_dropped(self):
        self.assertEqual(short_name("C3.ai Inc - Class A", "AI"), "C3.ai")
        self.assertEqual(short_name("JPMorgan Chase & Co.", "JPM"), "JPMorgan Chase")
        self.assertEqual(short_name("The Cigna Group", "CI"), "Cigna")
        self.assertEqual(short_name("Johnson & Johnson", "JNJ"), "Johnson & Johnson")
        self.assertEqual(short_name("Cooper Companies (The)", "COO"), "Cooper Companies")
        self.assertEqual(short_name("Nokia Corporation Sponsored ADR", "NOK"), "Nokia")
        self.assertEqual(short_name("Futu Holdings Limited - ADR", "FUTU"), "Futu")
        self.assertEqual(short_name("Clearway Energy, Inc. (Class C)", "CWEN"), "Clearway Energy")
        self.assertEqual(short_name("Hannon Armstrong Sustainable Infrastructure Capital", "HASI"), "Hannon Armstrong Sustainable")
        self.assertEqual(short_name("Planet Labs PBC", "PL"), "Planet Labs")

    def test_peer_labels(self):
        self.assertEqual(peer_label("Semiconductors", "Technology"), ("industry", "chip stocks"))
        self.assertEqual(peer_label("Something New", "Technology"), ("sector", "tech stocks"))
        self.assertEqual(peer_label("", ""), ("", ""))


class ScreenerWiringTest(unittest.TestCase):
    def rows(self):
        base = {"industry": "Semiconductors", "sector": "Technology"}
        rows = [dict(base, symbol=f"C{i}", instrument_id=f"US_C{i}", ret_1w=float(-i), ret_1m=float(-2 * i)) for i in range(1, 6)]
        rows.append(
            {
                **base,
                "symbol": "NVDA",
                "instrument_id": "US_NVDA",
                "name": "NVIDIA Corporation",
                "call": "Hold",
                "call_reason": "Upside and downside look balanced; keep the position but do not force a new add.",
                "call_reason_source": "template",
                "rev_growth": 83.0,
                "ret_1w": -18.0,
                "ret_1m": -26.0,
                "earnings_date": "2026-11-17",
            }
        )
        rows.append({**base, "symbol": "QUIET", "instrument_id": "US_QUIET", "name": "Quiet Co", "call": "Hold", "call_reason": "Old line.", "call_reason_source": "template"})
        return rows

    def test_peer_moves_exclude_the_stock_itself(self):
        peers = screener.peer_moves(self.rows())
        self.assertEqual(peers["NVDA"]["label"], "chip stocks")
        # The median of C1..C5 (-1 to -5); NVDA's own -18 is not in it and QUIET has no return.
        self.assertEqual(peers["NVDA"]["ret_1w"], -3.0)
        self.assertEqual(peers["C1"]["ret_1w"], -4.0)  # C2..C5 and NVDA

    def test_attach_replaces_the_template_and_keeps_a_thin_row(self):
        rows = self.rows()
        intel = {"US_NVDA": {"directive_v2": {"stance": "hold", "execution": "now"}}, "US_QUIET": {"directive_v2": {"stance": "hold"}}}
        counts = screener.attach_company_reasons(rows, intel, {}, "2026-11-11")
        by = {row["symbol"]: row for row in rows}
        self.assertEqual(by["NVDA"]["call_reason_source"], "company")
        self.assertTrue(by["NVDA"]["call_reason"].startswith("NVIDIA fell 18% over the past week, far more than other chip stocks"))
        self.assertTrue(by["NVDA"]["call_reason"].endswith(by["NVDA"]["call_change"]))
        self.assertEqual(by["QUIET"]["call_reason"], "Old line.")
        self.assertEqual(by["QUIET"]["call_reason_source"], "template")
        self.assertNotIn("call_reason", by["C1"])
        self.assertEqual(counts, {"company": 1, "template": 1})

    def test_last_reports_keep_the_latest_result_and_skip_future_or_unknown(self):
        events = [
            {"ticker": "aapl", "event_date": "2026-08-01", "surprise_label": "beat", "eps_surprise_pct": 2.0},
            {"ticker": "AAPL", "event_date": "2026-11-02", "actuals_reported_date": "2026-11-02", "surprise_label": "beat", "eps_surprise_pct": 3.54},
            {"ticker": "MSFT", "event_date": "2026-11-20", "surprise_label": "beat", "eps_surprise_pct": 1.0},
            {"ticker": "IBM", "event_date": "2026-10-20"},
        ]
        out = screener.last_reports(events, "2026-11-11")
        self.assertEqual(out, {"AAPL": {"date": "2026-11-02", "label": "beat", "surprise_pct": 3.54}})

    def test_brief_event_skips_earnings_past_and_numbered_labels(self):
        intel = {
            "visual_cards": {
                "catalyst_cards": [
                    {"event": "Earnings report", "window": "2026-11-20"},
                    {"event": "Old event", "window": "2026-10-01"},
                    {"event": "Q3 $5B deal", "window": "2026-11-30"},
                    {"event": "Congressional briefing attendance", "window": "2026-11-18"},
                ]
            }
        }
        self.assertEqual(screener._brief_next_event(intel, "2026-11-11"), ("the congressional briefing attendance", "2026-11-18"))
        self.assertEqual(screener._brief_next_event({}, "2026-11-11"), ("", ""))

    def test_call_fields_mark_where_the_reason_came_from(self):
        out = screener.call_fields({"directive_v2": {"stance": "hold", "action": {"summary": "Template."}}}, 10.0)
        self.assertEqual(out["call_reason_source"], "template")
        out = screener.call_fields({"directive_v2": {"stance": "hold", "call_reason": "Model line.", "call_reason_source": "model"}}, 10.0)
        self.assertEqual(out["call_reason_source"], "model")


if __name__ == "__main__":
    unittest.main()
