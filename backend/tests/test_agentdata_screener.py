import math
import unittest
from datetime import date, timedelta

from backend.agentdata import screener


def daily(start: str, closes: list[float]) -> list[tuple[str, float]]:
    day = date.fromisoformat(start)
    out = []
    for close in closes:
        out.append((day.isoformat(), close))
        day += timedelta(days=1)
    return out


class HelpersTest(unittest.TestCase):
    def test_num_rejects_everything_that_is_not_a_finite_number(self):
        self.assertEqual(screener.num(3), 3.0)
        self.assertIsNone(screener.num(True))
        self.assertIsNone(screener.num("3"))
        self.assertIsNone(screener.num(float("nan")))
        self.assertIsNone(screener.num(None))

    def test_sector_names_fold_into_one_scheme(self):
        self.assertEqual(screener.normalize_sector("Information Technology"), "Technology")
        self.assertEqual(screener.normalize_sector("", "Healthcare"), "Health Care")
        self.assertEqual(screener.normalize_sector("Consumer Cyclical"), "Consumer Discretionary")
        self.assertIsNone(screener.normalize_sector("", "Macro", None))

    def test_sector_comes_from_the_industry_when_known(self):
        self.assertEqual(screener.sector_for_industry("Biotechnology"), "Health Care")
        self.assertEqual(screener.sector_for_industry("REITs"), "Real Estate")
        self.assertEqual(screener.sector_for_industry("Utilities"), "Utilities")
        self.assertEqual(screener.sector_for_industry("Financial Data"), "Financials")
        self.assertEqual(screener.sector_for_industry("  Office  REITs "), "Real Estate")
        self.assertEqual(screener.sector_for_industry("Mortgage REITs"), "Financials")
        self.assertEqual(screener.sector_for_industry("Semiconductors"), "Technology")
        self.assertIsNone(screener.sector_for_industry("Consumer Electronics"))
        self.assertIsNone(screener.sector_for_industry(""))
        allowed = set(screener.SECTOR_ALIASES.values())
        self.assertTrue(set(screener.INDUSTRY_SECTORS.values()) <= allowed)

    def test_cap_tiers(self):
        self.assertEqual(screener.cap_tier(4.6e12), "mega")
        self.assertEqual(screener.cap_tier(200e9), "mega")
        self.assertEqual(screener.cap_tier(50e9), "large")
        self.assertEqual(screener.cap_tier(5e9), "mid")
        self.assertEqual(screener.cap_tier(1e9), "small")
        self.assertEqual(screener.cap_tier(1e8), "micro")
        self.assertIsNone(screener.cap_tier(None))
        self.assertIsNone(screener.cap_tier(0))

    def test_months_before_clamps_to_month_end(self):
        self.assertEqual(screener.months_before("2026-03-31", 1), "2026-02-28")
        self.assertEqual(screener.months_before("2024-03-31", 1), "2024-02-29")
        self.assertEqual(screener.months_before("2026-01-15", 1), "2025-12-15")
        self.assertEqual(screener.months_before("2026-11-09", 12), "2025-11-09")
        self.assertEqual(screener.months_before("2026-11-09", 60), "2021-11-09")

    def test_clean_series_drops_bad_rows_and_sorts(self):
        series = screener.clean_series(["2026-01-02", "2026-01-01", "bad", "2026-01-03"], [2.0, 1.0, 5.0, None])
        self.assertEqual(series, [("2026-01-01", 1.0), ("2026-01-02", 2.0)])
        self.assertEqual(screener.clean_series(None, None), [])

    def test_close_on_or_before(self):
        series = daily("2026-01-01", [1, 2, 3])
        self.assertEqual(screener.close_on_or_before(series, "2026-01-02"), ("2026-01-02", 2))
        self.assertEqual(screener.close_on_or_before(series, "2026-06-01"), ("2026-01-03", 3))
        self.assertIsNone(screener.close_on_or_before(series, "2025-12-31"))


class ReturnsTest(unittest.TestCase):
    def test_windows_that_do_not_fit_are_left_out(self):
        series = daily("2026-08-01", [100.0] * 100)  # Aug 1 to Nov 8
        last_day = series[-1][0]
        returns = screener.window_returns(series, 110.0, last_day)
        self.assertEqual(returns["ret_1w"], 10.0)
        self.assertEqual(returns["ret_1m"], 10.0)
        self.assertEqual(returns["ret_3m"], 10.0)
        self.assertNotIn("ret_6m", returns)
        self.assertNotIn("ret_1y", returns)
        self.assertNotIn("ret_ytd", returns)

    def test_week_return_counts_its_trading_days(self):
        # NVDA's real closes: Nov 3 to Nov 10 is five sessions, -18%, while Friday Nov 6 to Nov 10 (the memo's week so far) is -9.5%.
        early = daily("2026-08-01", [200.0] * 90)
        series = early + [("2026-11-03", 206.69), ("2026-11-04", 200.13), ("2026-11-05", 181.6), ("2026-11-06", 186.64), ("2026-11-09", 178.67), ("2026-11-10", 168.89)]
        returns = screener.window_returns(series, 168.89, "2026-11-10")
        self.assertEqual(returns["ret_1w"], -18.29)
        self.assertEqual(returns["ret_1w_sessions"], 5)
        # Around a holiday (Thanksgiving, Nov 26) the same seven days hold four sessions.
        holiday = early + [("2026-11-20", 100.0), ("2026-11-23", 101.0), ("2026-11-24", 102.0), ("2026-11-25", 103.0), ("2026-11-27", 104.0)]
        self.assertEqual(screener.window_returns(holiday, 104.0, "2026-11-27")["ret_1w_sessions"], 4)
        # A live quote after the last stored close is one more session.
        self.assertEqual(screener.window_returns(series, 175.53, "2026-11-11")["ret_1w_sessions"], 5)
        # A quote stamped on a Saturday (a Friday evening in UTC) is not one more session: still the five from Friday Nov 6.
        friday = early + [("2026-11-06", 1.0), ("2026-11-09", 1.0), ("2026-11-10", 1.0), ("2026-11-11", 1.0), ("2026-11-12", 1.0), ("2026-11-13", 1.0)]
        self.assertEqual(screener.window_returns(friday, 1.0, "2026-11-14")["ret_1w_sessions"], 5)
        # Closes that lag the quote by days give no count, so the reason keeps "over the past week".
        lagging = early + [("2026-11-05", 181.6), ("2026-11-06", 186.64)]
        self.assertNotIn("ret_1w_sessions", screener.window_returns(lagging, 175.53, "2026-11-11"))

    def test_ytd_uses_the_last_close_of_the_previous_year(self):
        series = [("2025-12-30", 90.0), ("2025-12-31", 100.0), ("2026-01-02", 105.0), ("2026-02-02", 120.0)]
        returns = screener.window_returns(series, 120.0, "2026-02-02")
        self.assertEqual(returns["ret_ytd"], 20.0)

    def test_volatility_is_annualised_and_needs_enough_history(self):
        flat = [100.0] * 120
        self.assertEqual(screener.annualized_volatility(flat), 0.0)
        self.assertIsNone(screener.annualized_volatility([100.0, 101.0, 102.0]))
        zigzag = [100.0 * (1.01 if i % 2 else 1.0) for i in range(120)]
        vol = screener.annualized_volatility(zigzag)
        self.assertTrue(10 < vol < 20, vol)  # ~1% a day is ~16% a year

    def test_max_drawdown(self):
        self.assertAlmostEqual(screener.max_drawdown([100, 120, 90, 130]), -25.0)
        self.assertEqual(screener.max_drawdown([1, 2, 3]), 0.0)
        self.assertIsNone(screener.max_drawdown([1]))

    def test_thin_keeps_both_ends(self):
        values = [float(i) for i in range(100)]
        thinned = screener.thin(values, 10)
        self.assertEqual(len(thinned), 10)
        self.assertEqual(thinned[0], 0.0)
        self.assertEqual(thinned[-1], 99.0)
        self.assertEqual(screener.thin([1.0, 2.0], 10), [1.0, 2.0])

    def test_price_fields_use_a_fresher_quote_as_the_end_price(self):
        series = daily("2025-01-01", [100.0] * 400)
        last_day = series[-1][0]
        fields = screener.price_fields(series, 150.0, last_day)
        self.assertEqual(fields["ret_1m"], 50.0)
        self.assertEqual(fields["hi_52w"], 150.0)
        self.assertEqual(fields["from_hi_pct"], 0.0)
        self.assertEqual(fields["from_lo_pct"], 50.0)
        self.assertEqual(fields["spark"][-1], 150.0)
        # 199 closes at 100 and one at 150 average 100.25.
        self.assertAlmostEqual(fields["vs_200d"], (150 / 100.25 - 1) * 100, places=2)
        stale = screener.price_fields(series, 150.0, "2024-12-01")
        self.assertEqual(stale["ret_1m"], 0.0)

    def test_price_fields_need_two_closes(self):
        self.assertEqual(screener.price_fields([("2026-01-01", 1.0)], None, None), {})


class StoredHistoryTest(unittest.TestCase):
    def window(self, days: int, pe=lambda i: 20.0 + i, target=lambda i: 100.0):
        start = date(2026, 6, 1)
        out = []
        for i in range(days):
            stamp = f"{(start + timedelta(days=i)).isoformat()}T20:00:00+00:00"
            out.append({"captured_at": stamp, "fundamentals": {"pe_ttm": pe(i)}, "analyst_consensus": {"target_price": target(i)}})
        return out

    def test_pe_percentile_measures_todays_pe_against_stored_days(self):
        window = self.window(40)  # stored P/Es run 20 to 59
        stats = screener.stored_history_stats(window, 70.0)
        self.assertEqual(stats["pe_hist_days"], 40)
        self.assertEqual(stats["pe_hist_from"], "2026-06-01")
        self.assertEqual(stats["pe_hist_to"], "2026-07-10")
        self.assertEqual(stats["pe_hist_pctile"], 100.0)
        self.assertEqual(screener.stored_history_stats(window, 20.0)["pe_hist_pctile"], 0.0)
        self.assertEqual(screener.stored_history_stats(window, 39.5)["pe_hist_pctile"], 50.0)

    def test_short_history_or_no_pe_says_nothing(self):
        self.assertEqual(screener.stored_history_stats(self.window(10), 25.0), {})
        self.assertEqual(screener.stored_history_stats(self.window(40), None), {})
        self.assertEqual(screener.stored_history_stats(self.window(40), -3.0), {})
        self.assertEqual(screener.stored_history_stats(None, 25.0), {})

    def test_rating_trend(self):
        months = [
            {"period": "Jun", "strong_buy": 4, "buy": 2, "hold": 4},
            {"period": "Jul", "strong_buy": 4, "buy": 2, "hold": 4},
            {"period": "Aug", "strong_buy": 4, "buy": 3, "hold": 3},
            {"period": "Sep", "strong_buy": 5, "buy": 3, "hold": 2},
            {"period": "Oct", "strong_buy": 6, "buy": 3, "hold": 1, "sell": 0, "strong_sell": None},
        ]
        trend = screener.rating_trend({"analyst_trend": {"recommendation_trend": months}})
        self.assertEqual(trend["buy_pct"], 90.0)
        self.assertEqual(trend["buys_chg_3m"], 3)  # 9 buys now against 6 three months earlier
        short = screener.rating_trend({"analyst_trend": {"recommendation_trend": months[:2]}})
        self.assertEqual(short, {"buy_pct": 60.0})
        self.assertEqual(screener.rating_trend({}), {})
        self.assertEqual(screener.rating_trend({"analyst_trend": {"recommendation_trend": [{"period": "x"}]}}), {})

    def test_one_snapshot_per_day_keeps_the_last(self):
        window = [
            {"captured_at": "2026-06-01T14:00:00+00:00", "fundamentals": {"pe_ttm": 1.0}},
            {"captured_at": "2026-06-01T20:00:00+00:00", "fundamentals": {"pe_ttm": 2.0}},
            {"captured_at": "bad"},
            "junk",
        ]
        days = screener.daily_history(window)
        self.assertEqual(len(days), 1)
        self.assertEqual(days[0][1]["fundamentals"]["pe_ttm"], 2.0)


class CallTest(unittest.TestCase):
    def test_zones_and_distances(self):
        intel = {
            "generated_at": "2026-11-09T15:00:00+00:00",
            "directive_v2": {
                "stance": "accumulate",
                "confidence": "med",
                "action": {"summary": "Add on pullbacks."},
                "zones": {"accumulate_below": 100.0, "trim_above": 150.0},
            },
        }
        inside = screener.call_fields(intel, 95.0)
        self.assertEqual(inside["call"], "Add")
        self.assertEqual(inside["zone"], "add")
        self.assertEqual(inside["to_add_pct"], -5.0)
        self.assertEqual(inside["call_confidence"], "medium")
        self.assertEqual(inside["call_reason"], "Add on pullbacks.")
        self.assertEqual(screener.call_fields(intel, 120.0)["zone"], "between")
        self.assertEqual(screener.call_fields(intel, 150.0)["zone"], "trim")
        self.assertEqual(screener.call_fields(intel, 100.0)["zone"], "add")

    def test_stance_words(self):
        self.assertEqual(screener.call_word("watch"), "Hold")
        self.assertEqual(screener.call_word("AVOID"), "Trim")
        self.assertIsNone(screener.call_word("maybe"))

    def test_no_call_means_no_fields(self):
        self.assertEqual(screener.call_fields(None, 10.0), {})
        self.assertEqual(screener.call_fields({"directive_v2": {"stance": "??"}}, 10.0), {})
        # A call without zones still has no zone.
        self.assertNotIn("zone", screener.call_fields({"directive_v2": {"stance": "hold"}}, 10.0))


class RowTest(unittest.TestCase):
    def build(self, **overrides):
        args = dict(
            instrument={"ticker": "abc", "instrument_id": "US_ABC", "name": "ABC Corp", "sector": "Information Technology", "industry": "Software"},
            latest={
                "captured_at": "2026-11-09T20:00:00+00:00",
                "quote": {"current": 50.0, "day_change_pct": 1.234, "captured_at": "2026-11-09T20:00:00+00:00"},
                "fundamentals": {"market_cap": 5e9, "pe_ttm": 25.0, "beta": 1.1},
            },
            facts={
                "financials": {"revenue_growth_yoy_pct": 12.5, "revenue": 1000.0},
                "financial_history": [
                    {"period": "TTM", "operating_margin_pct": 20.0, "revenue": 1000.0, "free_cash_flow": 150.0},
                    {"period": "FY 2026", "revenue": 800.0},
                    {"period": "FY 2023", "revenue": 100.0},
                ],
                "analyst": {"target_price": 60.0, "label": "Buy", "analyst_count": 12},
                "events": [{"kind": "earnings", "date": "2026-11-12", "date_label": "Nov 12 AMC"}],
                "dividends": {"yield_pct": 0.0},
            },
            technicals={"rsi_14": {"value": 44.44}, "moving_averages": {"sma_50": 40.0}},
            intel_pro={"overall": {"score": 71.26, "verdict": "Solid"}, "pillars": {"valuation": {"score": 60.0, "metrics": [{"label": "PEG", "value": 1.5}]}}},
            intel=None,
            series=[],
            earnings={},
            today="2026-11-09",
        )
        args.update(overrides)
        return screener.build_row(**args)

    def test_row_carries_what_exists_and_nothing_else(self):
        row = self.build()
        self.assertEqual(row["symbol"], "ABC")
        self.assertEqual(row["sector"], "Technology")
        self.assertEqual(row["cap_tier"], "mid")
        self.assertEqual(row["day_pct"], 1.23)
        self.assertEqual(row["upside"], 20.0)
        self.assertEqual(row["peg"], 1.5)
        self.assertEqual(row["fcf_margin"], 15.0)
        self.assertEqual(row["rev_cagr_3y"], 100.0)
        self.assertEqual(row["earnings_in_days"], 3)
        self.assertEqual(row["earnings_time"], "after close")
        self.assertEqual(row["vs_50d"], 25.0)
        self.assertEqual(row["analyst_count"], 12)
        self.assertIsInstance(row["analyst_count"], int)
        self.assertEqual(row["verdict"], "solid")
        # No dividend is "no yield", never a 0% yield; no history means no returns.
        for missing in ("div_yield", "ret_1m", "vol_90d", "call", "zone", "roe", "vs_200d", "spark"):
            self.assertNotIn(missing, row)
        for value in row.values():
            if isinstance(value, float):
                self.assertTrue(math.isfinite(value))

    def test_row_sector_follows_the_industry_over_a_wrong_stored_sector(self):
        row = self.build(instrument={"ticker": "AMGN", "sector": "Technology", "industry": "Biotechnology"})
        self.assertEqual(row["sector"], "Health Care")
        self.assertEqual(row["industry"], "Biotechnology")
        unknown = self.build(instrument={"ticker": "IBM", "sector": "", "industry": ""}, intel_pro={"sector_label": "Technology"})
        self.assertEqual(unknown["sector"], "Technology")

    def test_pe_comes_from_todays_price_and_the_facts_eps_not_yahoos_block(self):
        # Yahoo's block says 25x; the facts' four-quarter EPS in dollars puts $50 at 10x.
        facts = {
            "financials": {"fiscal_year": "TTM", "eps_diluted": 5.0, "currency": "USD", "revenue_growth_basis": "quarters"},
            "quick_stats": {"pe_ttm": 11.0, "market_cap": 4e9},
        }
        row = self.build(facts=facts)
        self.assertEqual(row["pe"], 10.0)
        self.assertEqual(row["market_cap"], 4e9)
        loss = self.build(facts={**facts, "financials": {**facts["financials"], "eps_diluted": -1.0}})
        self.assertNotIn("pe", loss)
        # A loss is a loss in any currency: no weekly P/E beside it either.
        old_loss = self.build(facts={**facts, "financials": {"fiscal_year": "TTM", "eps_diluted": -1.0}})
        self.assertNotIn("pe", old_loss)
        # Amounts converted from another currency (or not known to be dollars): the weekly P/E, never Yahoo's.
        foreign = self.build(facts={**facts, "financials": {**facts["financials"], "reported_currency": "TWD"}})
        self.assertEqual(foreign["pe"], 11.0)
        self.assertNotIn("pe", self.build())

    def test_growth_its_own_fiscal_years_rule_out_is_left_out(self):
        facts = {
            "financials": {"revenue": 37_743.0, "revenue_growth_yoy_pct": 79.64},
            "financial_history": [{"period": "TTM", "revenue": 37_743.0}, {"period": "FY 2025", "revenue": 37_442.0}, {"period": "FY 2024", "revenue": 34_717.0}],
            "withheld": [{"field": "x", "reason": "for us"}],
        }
        row = self.build(facts=facts)
        self.assertNotIn("rev_growth", row)
        self.assertEqual(row["revenue"], 37_743.0)

    def test_no_price_means_no_row(self):
        self.assertIsNone(self.build(latest={}, series=[]))
        self.assertIsNone(self.build(instrument={"ticker": ""}))

    def test_falls_back_to_the_last_close_and_the_earnings_calendar(self):
        series = daily("2026-10-01", [10.0 + i for i in range(40)])
        row = self.build(latest={}, facts={}, series=series, earnings={"ABC": ("2026-11-20", "amc")})
        self.assertEqual(row["price"], 49.0)
        self.assertEqual(row["earnings_date"], "2026-11-20")
        self.assertEqual(row["earnings_time"], "after close")
        self.assertIn("ret_1m", row)

    def test_past_earnings_dates_are_ignored(self):
        row = self.build(facts={"events": [{"kind": "earnings", "date": "2026-10-01"}]})
        self.assertNotIn("earnings_date", row)

    def test_coverage_counts_fields(self):
        self.assertEqual(screener.coverage([{"a": 1, "b": 2}, {"a": 3}]), {"a": 2, "b": 1})

    def test_minimal_row_for_benchmarks(self):
        row = screener.minimal_row("SPY", daily("2026-01-01", [100.0, 101.0, 102.0]), benchmark=True)
        self.assertEqual(row["symbol"], "SPY")
        self.assertTrue(row["benchmark"])
        self.assertEqual(row["price"], 102.0)
        self.assertIsNone(screener.minimal_row("X", [("2026-01-01", 1.0)], benchmark=False))


if __name__ == "__main__":
    unittest.main()
