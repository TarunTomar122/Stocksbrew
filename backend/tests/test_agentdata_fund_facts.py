import unittest

from backend.agentdata import fund_facts as ff
from backend.agentdata.store import _check_writable

FETCHED = "2026-11-12T03:00:00+00:00"

VOO_INFO = {
    "quoteType": "ETF",
    "longName": "Vanguard S&P 500 ETF",
    "fundFamily": "Vanguard",
    "category": "Large Blend",
    "totalAssets": 1735726989312,
    "netAssets": 1735726990000.0,
    "yield": 0.0107,
    "dividendYield": 1.07,
    "netExpenseRatio": 0.03,
    "fundInceptionDate": 1283817600,
    "legalType": "Exchange Traded Fund",
}
VOO_OPERATIONS = {"Annual Report Expense Ratio": 0.00029999999, "Annual Holdings Turnover": 0.02}
VOO_SECTORS = {"technology": 0.4048, "healthcare": 0.0926, "financial_services": 0.1114, "realestate": 0.017, "made_up": 0.2}
VOO_ASSETS = {"cashPosition": -0.0012, "stockPosition": 1.0004, "bondPosition": 0.0}


class BuildFactDocTests(unittest.TestCase):
    def test_reads_every_figure_in_our_units(self) -> None:
        doc = ff.build_fact_doc("VOO", VOO_INFO, operations=VOO_OPERATIONS, sectors=VOO_SECTORS, assets=VOO_ASSETS, fetched_at=FETCHED)
        assert doc is not None
        self.assertEqual(doc["ticker"], "VOO")
        self.assertEqual(doc["name"], "Vanguard S&P 500 ETF")
        self.assertEqual(doc["quote_type"], "ETF")
        # The net ratio is in percent on Yahoo; stored as a fraction.
        self.assertAlmostEqual(doc["expense_ratio"], 0.0003)
        self.assertEqual(doc["aum_usd"], 1735726989312)
        self.assertAlmostEqual(doc["dividend_yield"], 0.0107)
        self.assertEqual(doc["inception_date"], "2010-09-07")
        self.assertEqual(doc["family"], "Vanguard")
        self.assertEqual(doc["category"], "Large Blend")
        self.assertEqual(doc["sector_weights"], {"Technology": 0.4048, "Health Care": 0.0926, "Financials": 0.1114, "Real Estate": 0.017})
        self.assertEqual(doc["asset_mix"], {"cash": -0.0012, "stocks": 1.0004, "bonds": 0.0})
        self.assertEqual(doc["source"], "Yahoo Finance")
        self.assertEqual(doc["fetched_at"], FETCHED)

    def test_not_a_fund_is_dropped(self) -> None:
        self.assertIsNone(ff.build_fact_doc("AAPL", {"quoteType": "EQUITY", "longName": "Apple Inc."}, fetched_at=FETCHED))
        self.assertIsNone(ff.build_fact_doc("X", {}, fetched_at=FETCHED))

    def test_a_fund_with_no_figures_is_dropped(self) -> None:
        self.assertIsNone(ff.build_fact_doc("NEWF", {"quoteType": "ETF", "longName": "New Fund"}, fetched_at=FETCHED))

    def test_missing_values_are_left_out_not_guessed(self) -> None:
        doc = ff.build_fact_doc("BND", {"quoteType": "ETF", "netExpenseRatio": 0.03}, sectors={}, fallback_name="Vanguard Total Bond Market ETF", fetched_at=FETCHED)
        assert doc is not None
        self.assertEqual(doc["name"], "Vanguard Total Bond Market ETF")
        for key in ("aum_usd", "dividend_yield", "inception_date", "sector_weights", "asset_mix", "category"):
            self.assertNotIn(key, doc)

    def test_falls_back_to_the_annual_report_ratio_and_percent_yield(self) -> None:
        info = {"quoteType": "ETF", "dividendYield": 2.95, "totalAssets": 121091694592}
        doc = ff.build_fact_doc("SCHD", info, operations={"Annual Report Expense Ratio": 0.0006}, fetched_at=FETCHED)
        assert doc is not None
        self.assertAlmostEqual(doc["expense_ratio"], 0.0006)
        self.assertAlmostEqual(doc["dividend_yield"], 0.0295)

    def test_nonsense_values_are_refused(self) -> None:
        info = {"quoteType": "ETF", "netExpenseRatio": float("nan"), "yield": 3.0, "dividendYield": None, "totalAssets": -5, "fundInceptionDate": "soon"}
        self.assertIsNone(ff.build_fact_doc("BAD", info, fetched_at=FETCHED))

    def test_a_bond_fund_has_no_sector_weights(self) -> None:
        self.assertIsNone(ff.sector_weights_of({"technology": 0.02}))
        self.assertIsNone(ff.sector_weights_of(None))


class HeldTickersTests(unittest.TestCase):
    def test_reads_tracked_and_positions_and_keeps_only_us_tickers(self) -> None:
        users = [
            ("users/a", {"tracked_stocks": ["US_VOO", "us_nvda", "IN_TCS", None], "watchlist_positions": {"US_SCHD": "holding"}}),
            ("users/b", {"tracked_stocks": "not a list", "watchlist_positions": {"US_BRK_B": "watchlist"}}),
            ("users/c", {"email": "someone@example.com"}),
        ]
        self.assertEqual(ff.held_tickers(users), ["BRK.B", "NVDA", "SCHD", "VOO"])


class MetaTests(unittest.TestCase):
    def test_keeps_earlier_funds_and_updates_this_runs(self) -> None:
        previous = {"funds": {"ARKK": {"name": "ARK Innovation ETF", "quote_type": "ETF"}, "VOO": {"name": "old"}}}
        docs = [("tm_fund_facts/VOO", {"ticker": "VOO", "name": "Vanguard S&P 500 ETF", "quote_type": "ETF", "fetched_at": FETCHED})]
        meta = ff.build_meta(previous, docs, held={"VOO"}, now_iso=FETCHED)
        self.assertEqual(sorted(meta["funds"]), ["ARKK", "VOO"])
        self.assertEqual(meta["funds"]["VOO"]["name"], "Vanguard S&P 500 ETF")
        self.assertTrue(meta["funds"]["VOO"]["held"])
        self.assertEqual(meta["funds"]["ARKK"]["name"], "ARK Innovation ETF")


class CollectTests(unittest.TestCase):
    def test_one_failure_does_not_cost_the_others(self) -> None:
        def fetch(ticker: str, *, fallback_name: str | None, fetched_at: str):
            if ticker == "BOOM":
                raise ConnectionError("down")
            if ticker == "AAPL":
                return None
            return {"ticker": ticker, "name": fallback_name or ticker, "quote_type": "ETF", "expense_ratio": 0.001, "fetched_at": fetched_at}

        docs, report = ff.collect(["VOO", "BOOM", "AAPL"], {"VOO": "Vanguard S&P 500 ETF"}, fetch=fetch, pause=0)
        self.assertEqual([path for path, _ in docs], ["tm_fund_facts/VOO"])
        self.assertEqual([item["status"] for item in report], ["ok", "failed", "not_a_fund"])


class PopularListTests(unittest.TestCase):
    def test_the_checked_in_list_is_clean(self) -> None:
        funds = ff.popular_funds()
        tickers = [row["ticker"] for row in funds]
        self.assertEqual(len(tickers), len(set(tickers)))
        for required in ("SPY", "VOO", "VTI", "QQQ", "SCHD", "BND", "JEPI", "VGT"):
            self.assertIn(required, tickers)
        for row in funds:
            self.assertTrue(row["name"])
            self.assertEqual(row["ticker"], row["ticker"].upper())


class WritableTests(unittest.TestCase):
    def test_the_job_may_write_its_collections(self) -> None:
        _check_writable("tm_fund_facts/VOO")
        _check_writable("tm_fund_meta/latest")
        with self.assertRaises(ValueError):
            _check_writable("tm_instruments/US_VOO")


if __name__ == "__main__":
    unittest.main()
