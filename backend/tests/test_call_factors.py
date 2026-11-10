from __future__ import annotations

import io
import math
import random
import unittest
import zipfile
from datetime import date, timedelta

from backend import call_factors as cf
from backend.agentdata import insider_history, sec_fundamentals


def weekdays(n: int, start: str = "2022-01-03") -> list[str]:
    out: list[str] = []
    day = date.fromisoformat(start)
    while len(out) < n:
        if day.weekday() < 5:
            out.append(day.isoformat())
        day += timedelta(days=1)
    return out


def walk(n: int, drift: float, seed: int, vol: float = 0.012) -> list[float]:
    rng = random.Random(seed)
    out = [100.0]
    for _ in range(n - 1):
        out.append(out[-1] * math.exp(drift + rng.gauss(0, vol)))
    return out


# A company with a December year end: quarterly facts in 10-Qs (three months and
# year to date), annual facts in the 10-K. Revenue is 100 per quarter in 2022 and
# 110, 120, 130, 140 through 2023.
def flow_rows() -> list[list]:
    rows = [
        ["2022-01-01", "2022-12-31", 400.0, "2023-02-15"],
        ["2023-01-01", "2023-03-31", 110.0, "2023-05-01"],
        ["2022-01-01", "2022-03-31", 100.0, "2022-05-01"],
        ["2022-04-01", "2022-06-30", 100.0, "2022-08-01"],
        ["2022-01-01", "2022-06-30", 200.0, "2022-08-01"],
        ["2023-04-01", "2023-06-30", 120.0, "2023-08-01"],
        ["2023-01-01", "2023-06-30", 230.0, "2023-08-01"],
        ["2022-07-01", "2022-09-30", 100.0, "2022-11-01"],
        ["2022-01-01", "2022-09-30", 300.0, "2022-11-01"],
        ["2023-07-01", "2023-09-30", 130.0, "2023-11-01"],
        ["2023-01-01", "2023-09-30", 360.0, "2023-11-01"],
        ["2023-01-01", "2023-12-31", 500.0, "2024-02-15"],
    ]
    return sorted(rows, key=lambda row: row[3])


class TtmTest(unittest.TestCase):
    def known(self, cutoff: str) -> list[list]:
        return [row for row in flow_rows() if row[3] <= cutoff]

    def test_annual_is_used_when_it_is_the_newest_period(self) -> None:
        self.assertEqual(cf.ttm(self.known("2023-03-01")), (400.0, "2022-12-31"))
        self.assertEqual(cf.ttm(self.known("2024-03-01")), (500.0, "2023-12-31"))

    def test_annual_plus_year_to_date_minus_last_years(self) -> None:
        self.assertEqual(cf.ttm(self.known("2023-05-02")), (410.0, "2023-03-31"))   # 400 + 110 - 100
        self.assertEqual(cf.ttm(self.known("2023-08-02")), (430.0, "2023-06-30"))   # 400 + 230 - 200
        self.assertEqual(cf.ttm(self.known("2023-11-02")), (460.0, "2023-09-30"))   # 400 + 360 - 300

    def test_nothing_known_yet(self) -> None:
        self.assertIsNone(cf.ttm([]))
        self.assertIsNone(cf.ttm(self.known("2022-05-02")))  # one quarter, no annual

    def test_quarterly_series_derives_the_fourth_quarter(self) -> None:
        series = cf.quarterly_series(flow_rows())
        self.assertEqual(series["2023-09-30"], (130.0, "2023-11-01"))
        self.assertEqual(series["2022-12-31"], (100.0, "2023-02-15"))   # 400 - 300, known when the 10-K was filed
        self.assertEqual(series["2023-12-31"], (140.0, "2024-02-15"))


class FundamentalsTest(unittest.TestCase):
    def doc(self) -> dict:
        income = []
        # ten years of quarterly profits so the surprise has a history
        for year in range(2014, 2024):
            for quarter, (start, end, filed_month) in enumerate((("01-01", "03-31", "05"), ("04-01", "06-30", "08"), ("07-01", "09-30", "11"))):
                value = 10.0 + (year - 2014) + quarter + (5.0 if (year, quarter) == (2023, 2) else 0.0) + (0.5 if year % 2 else 0.0)
                income.append([f"{year}-{start}", f"{year}-{end}", value, f"{year}-{filed_month}-01"])
        return {
            "sic": "3571",
            "facts": {
                "revenue": flow_rows(),
                "net_income": income,
                "assets": [[None, "2022-12-31", 1000.0, "2023-02-15"], [None, "2023-09-30", 1200.0, "2023-11-01"], [None, "2022-09-30", 900.0, "2022-11-01"]],
                "equity": [[None, "2023-09-30", 600.0, "2023-11-01"]],
                "shares_cover": [[None, "2022-10-20", 50.0, "2022-11-01"], [None, "2023-10-20", 48.0, "2023-11-01"]],
            },
            "earnings_dates": ["2023-07-28", "2023-10-27"],
        }

    def test_only_filed_facts_are_visible(self) -> None:
        fund = cf.Fundamentals(self.doc())
        self.assertIsNone(fund.as_of("2013-01-01"))
        before = fund.as_of("2023-10-31")
        after = fund.as_of("2023-11-01")
        assert before is not None and after is not None
        self.assertEqual(before["revenue"], 430.0)
        self.assertEqual(after["revenue"], 460.0)
        self.assertEqual(before["assets"], 1000.0)
        self.assertEqual(after["assets"], 1200.0)
        self.assertEqual(after["assets_year_ago"], 900.0)
        self.assertEqual(after["shares"], 48.0)
        self.assertEqual(after["shares_year_ago"], 50.0)
        self.assertEqual(after["period_end"], "2023-09-30")

    def test_surprise_is_standardised_and_dated_by_filing(self) -> None:
        fund = cf.Fundamentals(self.doc())
        after = fund.as_of("2023-11-05")
        assert after is not None
        self.assertEqual(after["sue_filed"], "2023-11-01")
        self.assertGreater(after["sue"], 3.0)  # the +5 jump against changes that normally sit near 1
        before = fund.as_of("2023-10-31")
        assert before is not None
        self.assertLess(abs(before["sue"]), 3.0)

    def test_quarterly_profit_spread_needs_six_quarters(self) -> None:
        values = [10.0, 12.0, 8.0, 11.0, 9.0, 10.0, 14.0, 6.0]
        ends = ["2022-03-31", "2022-06-30", "2022-09-30", "2022-12-31", "2023-03-31", "2023-06-30", "2023-09-30", "2023-12-31"]
        rows = [[(date.fromisoformat(end) - timedelta(days=89)).isoformat(), end, value, (date.fromisoformat(end) + timedelta(days=35)).isoformat()] for end, value in zip(ends, values)]
        fund = cf.Fundamentals({"facts": {"net_income": rows}})
        early = fund.as_of("2023-05-10")   # five quarters filed
        self.assertNotIn("net_income_quarter_std", early or {})
        later = fund.as_of("2024-02-10")
        mean = sum(values) / 8
        self.assertAlmostEqual(later["net_income_quarter_std"], math.sqrt(sum((v - mean) ** 2 for v in values) / 7))

    def test_last_earnings_date(self) -> None:
        fund = cf.Fundamentals(self.doc())
        self.assertIsNone(fund.last_earnings_date("2023-07-27"))
        self.assertEqual(fund.last_earnings_date("2023-10-26"), "2023-07-28")
        self.assertEqual(fund.last_earnings_date("2023-10-27"), "2023-10-27")

    def test_stale_cover_share_count_is_not_used(self) -> None:
        # A multi-class issuer whose last undimensioned cover count is years old:
        # no market cap or issuance from it, the diluted count is used instead.
        doc = self.doc()
        doc["facts"]["shares_cover"] = [[None, "2010-01-27", 9.0, "2010-02-03"], [None, "2009-01-27", 10.0, "2009-02-03"]]
        doc["facts"]["shares_diluted"] = [["2023-07-01", "2023-09-30", 47.0, "2023-11-01"]]
        after = cf.Fundamentals(doc).as_of("2023-11-01")
        assert after is not None
        self.assertEqual(after["shares"], 47.0)
        self.assertEqual(after["shares_date"], "2023-09-30")
        self.assertNotIn("shares_year_ago", after)
        self.assertNotIn("low_net_issuance", cf.raw_factors(None, after, market_cap=None, day="2023-11-15"))

    def test_empty_document(self) -> None:
        self.assertIsNone(cf.Fundamentals(None).as_of("2024-01-01"))
        self.assertIsNone(cf.Fundamentals({"facts": {}}).as_of("2024-01-01"))


class PriceSeriesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dates = weekdays(600)
        self.bench = walk(600, 0.0003, 2, vol=0.008)
        self.closes = walk(600, 0.001, 1)
        self.series = cf.PriceSeries(self.dates, self.closes, dict(zip(self.dates, self.bench)))

    def test_features_match_a_direct_calculation(self) -> None:
        i = 500
        features = self.series.features(i)
        assert features is not None
        c = self.closes
        self.assertAlmostEqual(features["momentum_12_1"], c[i - 21] / c[i - 252] - 1)
        self.assertAlmostEqual(features["high_52w"], c[i] / max(c[i - 251 : i + 1]))
        self.assertAlmostEqual(features["low_20"], min(c[i - 19 : i + 1]))
        self.assertAlmostEqual(features["sma_50"], sum(c[i - 49 : i + 1]) / 50)
        rs = [math.log(c[k] / c[k - 1]) for k in range(i - 251, i + 1)]
        rm = [math.log(self.bench[k] / self.bench[k - 1]) for k in range(i - 251, i + 1)]
        ms, mm = sum(rs) / 252, sum(rm) / 252
        beta = sum((a - ms) * (b - mm) for a, b in zip(rs, rm)) / sum((b - mm) ** 2 for b in rm)
        self.assertAlmostEqual(features["beta"], beta, places=6)
        self.assertAlmostEqual(features["vol_252"], math.sqrt(sum((a - ms) ** 2 for a in rs) / 251 * 252), places=6)

    def test_features_use_only_the_past(self) -> None:
        short = cf.PriceSeries(self.dates[:501], self.closes[:501], dict(zip(self.dates, self.bench)))
        a, b = short.features(500), self.series.features(500)
        assert a is not None and b is not None
        for key in a:
            self.assertAlmostEqual(a[key], b[key], places=9, msg=key)

    def test_needs_a_year(self) -> None:
        self.assertIsNone(self.series.features(251))
        self.assertIsNone(self.series.features(600))

    def test_index_on_rejects_stale_series(self) -> None:
        self.assertEqual(self.series.index_on(self.dates[100]), 100)
        self.assertEqual(self.series.index_on(self.dates[-1]), 599)
        later = (date.fromisoformat(self.dates[-1]) + timedelta(days=30)).isoformat()
        self.assertIsNone(self.series.index_on(later))

    def test_earnings_reaction_waits_for_the_window_to_close(self) -> None:
        day = self.dates[400]
        self.assertIsNone(cf.earnings_reaction(self.series, 400, day))  # the close after the report is not in yet
        value = cf.earnings_reaction(self.series, 401, day)
        expected = (self.closes[401] / self.closes[399] - 1) - (self.bench[401] / self.bench[399] - 1)
        assert value is not None
        self.assertAlmostEqual(value, expected)
        self.assertIsNone(cf.earnings_reaction(self.series, 401 + 64, day))  # too old
        self.assertIsNone(cf.earnings_reaction(self.series, 400, None))


class RawFactorsTest(unittest.TestCase):
    FUND = {
        "period_end": "2023-09-30",
        "revenue": 460.0,
        "gross_profit": 200.0,
        "operating_income": 90.0,
        "net_income": 60.0,
        "operating_cash_flow": 80.0,
        "capex": 20.0,
        "assets": 1200.0,
        "assets_year_ago": 1000.0,
        "equity": 600.0,
        "shares": 48.0,
        "shares_year_ago": 50.0,
        "equity_year_ago": 500.0,
        "net_income_quarter_std": 6.0,
        "sue": 2.0,
        "sue_filed": "2023-11-01",
    }
    PRICE = {"momentum_12_1": 0.3, "high_52w": 0.95, "vol_252": 0.25, "ret_1m": 0.04, "residual_momentum": 1.2, "beta": 1.1}

    def test_higher_is_better_for_every_factor(self) -> None:
        raw = cf.raw_factors(self.PRICE, self.FUND, market_cap=1200.0, day="2023-11-15", reaction=0.05, insider_buyers=3)
        self.assertAlmostEqual(raw["gross_profitability"], 200 / 1200)
        self.assertAlmostEqual(raw["operating_profitability"], 90 / 1200)
        self.assertAlmostEqual(raw["return_on_equity"], 0.1)
        self.assertAlmostEqual(raw["earnings_yield"], 0.05)
        self.assertAlmostEqual(raw["fcf_yield"], 0.05)
        self.assertAlmostEqual(raw["sales_yield"], 460 / 1200)
        self.assertAlmostEqual(raw["book_yield"], 0.5)
        self.assertAlmostEqual(raw["low_asset_growth"], -0.2)
        self.assertAlmostEqual(raw["low_accruals"], 20 / 1200)       # cash flow above profit is good
        self.assertAlmostEqual(raw["low_net_issuance"], -math.log(48 / 50))  # a buyback is good
        self.assertEqual(raw["low_volatility"], -0.25)
        self.assertEqual(raw["low_beta"], -1.1)
        self.assertEqual(raw["reversal_1m"], -0.04)
        self.assertEqual(raw["earnings_surprise"], 2.0)
        self.assertEqual(raw["earnings_reaction"], 0.05)
        self.assertEqual(raw["insider_buying"], 3.0)
        # the bank and REIT measures (call engine v3)
        self.assertAlmostEqual(raw["return_on_assets"], 60 / 1200)
        self.assertAlmostEqual(raw["equity_to_assets"], 0.5)
        self.assertAlmostEqual(raw["cash_return_on_assets"], 80 / 1200)
        self.assertAlmostEqual(raw["cash_flow_yield"], 80 / 1200)
        self.assertAlmostEqual(raw["book_value_growth"], (600 / 48) / (500 / 50) - 1)
        self.assertAlmostEqual(raw["earnings_stability"], -6.0 / 600)   # steadier profit is better
        self.assertTrue(set(raw) <= set(cf.FACTOR_LABELS))

    def test_missing_inputs_are_omitted(self) -> None:
        raw = cf.raw_factors(self.PRICE, None, market_cap=None, day="2023-11-15")
        self.assertEqual(set(raw), {"momentum_12_1", "high_52w", "low_volatility", "reversal_1m", "residual_momentum", "low_beta"})
        no_cap = cf.raw_factors(None, self.FUND, market_cap=None, day="2023-11-15")
        self.assertNotIn("earnings_yield", no_cap)
        self.assertIn("gross_profitability", no_cap)

    def test_stale_filings_and_splits_are_left_out(self) -> None:
        stale = cf.raw_factors(None, self.FUND, market_cap=1200.0, day="2024-08-01")
        self.assertNotIn("gross_profitability", stale)
        self.assertNotIn("earnings_yield", stale)
        self.assertNotIn("earnings_surprise", stale)
        for name in ("return_on_assets", "equity_to_assets", "cash_return_on_assets", "cash_flow_yield", "book_value_growth", "earnings_stability"):
            self.assertNotIn(name, stale)
        split = cf.raw_factors(None, {**self.FUND, "shares": 200.0}, market_cap=1200.0, day="2023-11-15")
        self.assertNotIn("low_net_issuance", split)
        self.assertNotIn("book_value_growth", split)  # a split is not a fall in book value per share
        negative = cf.raw_factors(None, {**self.FUND, "equity": -50.0}, market_cap=1200.0, day="2023-11-15")
        self.assertNotIn("earnings_stability", negative)
        self.assertNotIn("book_value_growth", negative)
        self.assertAlmostEqual(negative["equity_to_assets"], -50 / 1200)

    def test_value_versus_own_history_needs_two_years(self) -> None:
        short = cf.raw_factors(None, self.FUND, market_cap=1200.0, day="2023-11-15", earnings_yield_history=[0.03] * 10)
        self.assertNotIn("value_vs_history", short)
        long = cf.raw_factors(None, self.FUND, market_cap=1200.0, day="2023-11-15", earnings_yield_history=[0.03] * 30)
        self.assertAlmostEqual(long["value_vs_history"], 0.02)


class RankTest(unittest.TestCase):
    def test_ranks_within_sector(self) -> None:
        values = {f"T{i}": float(i) for i in range(10)}
        values.update({f"B{i}": 100.0 + i for i in range(10)})
        sector = {**{f"T{i}": "tech" for i in range(10)}, **{f"B{i}": "banks" for i in range(10)}}
        scores = cf.rank_scores(values, sector)
        self.assertAlmostEqual(scores["T9"], 0.9)
        self.assertAlmostEqual(scores["B9"], 0.9)   # best bank scores like the best tech name
        self.assertAlmostEqual(scores["T0"], -0.9)
        self.assertAlmostEqual(sum(scores.values()), 0.0)

    def test_small_sectors_fall_back_to_the_universe(self) -> None:
        values = {f"T{i}": float(i) for i in range(10)}
        values["LONE"] = 1000.0
        sector = {**{f"T{i}": "tech" for i in range(10)}, "LONE": "utilities"}
        scores = cf.rank_scores(values, sector)
        self.assertAlmostEqual(scores["LONE"], 2 * 10.5 / 11 - 1)

    def test_ties_and_outliers(self) -> None:
        scores = cf.rank_scores({"A": 1.0, "B": 1.0, "C": 1e12, "D": -1e12}, None)
        self.assertEqual(scores["A"], scores["B"])
        self.assertAlmostEqual(scores["C"], 0.75)   # an outlier is just the top rank
        self.assertAlmostEqual(scores["D"], -0.75)
        self.assertEqual(cf.rank_scores({}, None), {})
        self.assertEqual(cf.rank_scores({"A": 5.0}, None), {"A": 0.0})

    def test_composite_reweights_missing_factors_and_enforces_coverage(self) -> None:
        scores = {"a": {"X": 1.0, "Y": -1.0, "Z": 0.5}, "b": {"X": 0.0, "Y": 1.0}, "c": {"X": -1.0}}
        weights = {"a": 0.5, "b": 0.3, "c": 0.2}
        out = cf.composite(scores, weights, ["X", "Y", "Z", "W"], min_coverage=0.5)
        self.assertAlmostEqual(out["X"]["score"], 0.5 - 0.2)
        self.assertAlmostEqual(out["X"]["coverage"], 1.0)
        self.assertAlmostEqual(sum(out["X"]["contributions"].values()), out["X"]["score"])
        self.assertAlmostEqual(out["Y"]["score"], (-0.5 + 0.3) / 0.8)
        self.assertAlmostEqual(out["Z"]["coverage"], 0.5)
        self.assertNotIn("W", out)
        self.assertEqual(cf.composite(scores, weights, ["Z"], min_coverage=0.6), {})

    def test_percentile_ranks(self) -> None:
        pct = cf.percentile_ranks({"A": 1.0, "B": 2.0, "C": 3.0, "D": 4.0})
        self.assertEqual(pct, {"A": 12.5, "B": 37.5, "C": 62.5, "D": 87.5})

    def test_factor_model_by_sic(self) -> None:
        self.assertEqual(cf.factor_model("6021"), cf.FINANCIAL)   # national bank
        self.assertEqual(cf.factor_model("6331"), cf.FINANCIAL)   # Berkshire: fire and casualty insurance
        self.assertEqual(cf.factor_model("6211"), cf.FINANCIAL)   # broker-dealer
        self.assertEqual(cf.factor_model("6798"), cf.REIT)
        self.assertEqual(cf.factor_model("6221"), cf.FUND)        # commodity trust (GLD)
        self.assertEqual(cf.factor_model("6770"), cf.FUND)        # blank check
        self.assertEqual(cf.factor_model("6531"), cf.STANDARD)    # real estate agents, not a REIT
        self.assertEqual(cf.factor_model("7389"), cf.STANDARD)    # Visa
        self.assertEqual(cf.factor_model(""), cf.STANDARD)
        self.assertEqual(cf.factor_model(None), cf.STANDARD)
        self.assertEqual(cf.factor_model("abc"), cf.STANDARD)

    def test_peer_ranks_split_by_size_only_when_the_group_is_big_enough(self) -> None:
        values = {f"S{i}": float(i) for i in range(40)}
        group = {symbol: "tech" for symbol in values}
        size = {f"S{i}": (1e9 if i % 2 else 1e11) * (i + 1) for i in range(40)}  # odd names are small
        split = cf.peer_ranks(values, group, size)
        whole = cf.peer_ranks(values, group, None)
        self.assertAlmostEqual(split["S39"], 0.95)   # best small name tops the small half
        self.assertAlmostEqual(split["S38"], 0.95)   # best big name tops the big half
        self.assertAlmostEqual(whole["S38"], 2 * 38.5 / 40 - 1)
        small_group = cf.peer_ranks({k: v for k, v in values.items() if int(k[1:]) < 20}, group, size)
        self.assertAlmostEqual(small_group["S19"], 0.95)  # 20 names: no split, one ranking

    def test_peer_ranks_unsized_and_leftover_names(self) -> None:
        values = {f"S{i}": float(i) for i in range(40)}
        values.update({"U": 100.0, "LONE": -5.0})
        group = {**{f"S{i}": "tech" for i in range(40)}, "U": "tech", "LONE": "utilities"}
        size = {f"S{i}": float(i + 1) for i in range(40)}
        ranks = cf.peer_ranks(values, group, size)
        self.assertAlmostEqual(ranks["U"], 2 * 40.5 / 41 - 1)        # no market cap: ranked against the whole group
        self.assertAlmostEqual(ranks["LONE"], 2 * 0.5 / 42 - 1)      # group too small: ranked against everyone
        self.assertEqual(cf.peer_ranks({}, group, size), {})


class SecExtractionTest(unittest.TestCase):
    def test_first_filing_wins_and_tags_are_merged(self) -> None:
        raw = {
            "facts": {
                "us-gaap": {
                    "Revenues": {"units": {"USD": [
                        {"start": "2017-01-01", "end": "2017-12-31", "val": 90, "filed": "2018-02-01"},
                        {"start": "2017-01-01", "end": "2017-12-31", "val": 95, "filed": "2019-02-01"},  # restated later
                    ]}},
                    "RevenueFromContractWithCustomerExcludingAssessedTax": {"units": {"USD": [
                        {"start": "2018-01-01", "end": "2018-12-31", "val": 120, "filed": "2019-02-01"},
                        {"start": "2017-01-01", "end": "2017-12-31", "val": 96, "filed": "2019-02-01"},
                    ]}},
                    "Assets": {"units": {"USD": [{"end": "2018-12-31", "val": 500, "filed": "2019-02-01"}, {"end": "2018-12-31", "val": "bad", "filed": "2019-02-01"}]}},
                },
                "dei": {"EntityCommonStockSharesOutstanding": {"units": {"shares": [{"end": "2019-01-20", "val": 10, "filed": "2019-02-01"}]}}},
            }
        }
        facts = sec_fundamentals.extract_facts(raw)
        self.assertEqual(facts["revenue"], [["2017-01-01", "2017-12-31", 90.0, "2018-02-01"], ["2018-01-01", "2018-12-31", 120.0, "2019-02-01"]])
        self.assertEqual(facts["assets"], [[None, "2018-12-31", 500.0, "2019-02-01"]])
        self.assertEqual(facts["shares_cover"], [[None, "2019-01-20", 10.0, "2019-02-01"]])
        self.assertNotIn("net_income", facts)

    def test_earnings_dates_are_item_2_02_only(self) -> None:
        submissions = {"filings": {"recent": {"form": ["8-K", "8-K", "10-Q", "8-K/A"], "items": ["2.02,9.01", "5.02", "", "2.02"], "filingDate": ["2024-01-25", "2024-02-01", "2024-02-02", "2024-04-25"]}}}
        older = [{"form": ["8-K"], "items": ["2.02"], "filingDate": ["2019-01-29"]}]
        self.assertEqual(sec_fundamentals.earnings_dates_from_submissions(submissions, older), ["2019-01-29", "2024-01-25", "2024-04-25"])

    def test_predecessor_facts_merge_with_the_first_filing_winning(self) -> None:
        successor = {"revenue": [["2025-01-01", "2025-09-30", 250.0, "2026-11-02"], ["2026-01-01", "2026-09-30", 314.0, "2026-11-02"]], "assets": [[None, "2026-09-30", 471.0, "2026-11-02"]]}
        predecessor = {"revenue": [["2025-01-01", "2025-09-30", 249.0, "2025-11-01"], ["2025-01-01", "2025-12-31", 330.0, "2026-02-18"]], "capex": [["2025-01-01", "2025-12-31", 20.0, "2026-02-18"]]}
        merged = sec_fundamentals.merge_facts(successor, predecessor)
        self.assertEqual(merged["revenue"], [["2025-01-01", "2025-09-30", 249.0, "2025-11-01"], ["2025-01-01", "2025-12-31", 330.0, "2026-02-18"], ["2026-01-01", "2026-09-30", 314.0, "2026-11-02"]])
        self.assertEqual(merged["capex"], predecessor["capex"])
        self.assertEqual(merged["assets"], successor["assets"])
        # with the annual figure from the predecessor, the trailing year exists again
        fund = cf.Fundamentals({"facts": merged})
        self.assertAlmostEqual(fund.as_of("2026-11-05")["revenue"], 330.0 + 314.0 - 249.0)
        self.assertEqual(sec_fundamentals.PREDECESSOR_CIKS["XOM"], (34088,))

    def test_ticker_forms(self) -> None:
        self.assertEqual(sec_fundamentals.sec_ticker("brk.b"), "BRK-B")


class InsiderHistoryTest(unittest.TestCase):
    def archive(self) -> zipfile.ZipFile:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as out:
            out.writestr("SUBMISSION.tsv", "ACCESSION_NUMBER\tFILING_DATE\tISSUERCIK\tISSUERTRADINGSYMBOL\tAFF10B5ONE\n"
                         "a1\t31-JAN-2024\t0000000111\tAAA\t0\n"
                         "a2\t02-FEB-2024\t0000000111\tAAA\t1\n"
                         "a3\t03-FEB-2024\t0000000999\tZZZ\t0\n"
                         "a4\t05-FEB-2024\t0000000111\tAAA\t\n")
            out.writestr("REPORTINGOWNER.tsv", "ACCESSION_NUMBER\tRPTOWNERCIK\tRPTOWNER_RELATIONSHIP\na1\t0000000007\tDirector\na4\t0000000008\tOfficer\n")
            out.writestr("NONDERIV_TRANS.tsv", "ACCESSION_NUMBER\tTRANS_DATE\tTRANS_CODE\tTRANS_SHARES\tTRANS_PRICEPERSHARE\tTRANS_ACQUIRED_DISP_CD\n"
                         "a1\t29-JAN-2024\tP\t100\t10.5\tA\n"
                         "a1\t29-JAN-2024\tS\t100\t10.5\tD\n"
                         "a2\t30-JAN-2024\tP\t100\t10.5\tA\n"
                         "a3\t30-JAN-2024\tP\t100\t10.5\tA\n"
                         "a4\t02-FEB-2024\tP\t50\t0\tA\n"
                         "a4\t02-FEB-2024\tP\t50\t11\tA\n")
        buffer.seek(0)
        return zipfile.ZipFile(buffer)

    def test_only_open_market_purchases_for_known_issuers(self) -> None:
        found = insider_history.purchases_in_archive(self.archive(), {111: "AAA"})
        self.assertEqual(found, {"AAA": [["2024-01-31", "2024-01-29", "7", 100.0, 10.5, "Director"], ["2024-02-05", "2024-02-02", "8", 50.0, 11.0, "Officer"]]})

    def test_cluster_counts_distinct_filers_by_filing_date(self) -> None:
        rows = [["2024-01-31", "2024-01-29", "7", 1, 1, ""], ["2024-02-05", "2024-02-02", "8", 1, 1, ""], ["2024-02-06", "2024-02-02", "8", 1, 1, ""], ["2023-06-01", "2023-06-01", "9", 1, 1, ""]]
        self.assertEqual(insider_history.cluster_buyers(rows, "2024-02-10"), 2)
        self.assertEqual(insider_history.cluster_buyers(rows, "2024-02-01"), 1)   # the second filing was not public yet
        self.assertEqual(insider_history.cluster_buyers(rows, "2023-01-01"), 0)

    def test_dates_and_quarters(self) -> None:
        self.assertEqual(insider_history.iso_day("31-JAN-2024"), "2024-01-31")
        self.assertEqual(insider_history.iso_day("nonsense"), "")
        from datetime import datetime, timezone

        self.assertEqual(insider_history.quarters(2025, datetime(2026, 5, 1, tzinfo=timezone.utc)), ["2025q1", "2025q2", "2025q3", "2025q4", "2026q1", "2026q2"])


if __name__ == "__main__":
    unittest.main()
