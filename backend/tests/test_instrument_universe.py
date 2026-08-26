from __future__ import annotations

import unittest

from backend.instrument_universe import (
    get_coverage_universe_id,
    get_default_universe_id,
    get_instrument,
    list_coverage_delta_instrument_ids,
    list_instruments,
    list_tickers,
)


class InstrumentUniverseTest(unittest.TestCase):
    def test_default_us_universe(self) -> None:
        self.assertEqual(get_default_universe_id("US"), "us_test_5")

    def test_list_instruments_preserves_universe_order(self) -> None:
        instruments = list_instruments("US", "us_test_5")
        self.assertEqual([instrument["ticker"] for instrument in instruments], ["NVDA", "AMD", "MSFT", "AAPL", "TSLA"])

    def test_get_instrument(self) -> None:
        instrument = get_instrument("US_NVDA")
        self.assertIsNotNone(instrument)
        assert instrument is not None
        self.assertEqual(instrument["ticker"], "NVDA")

    def test_list_tickers(self) -> None:
        self.assertEqual(list_tickers("US", "us_test_10")[:3], ["NVDA", "AMD", "MSFT"])

    def test_coverage_universe_id(self) -> None:
        self.assertEqual(get_coverage_universe_id("US"), "us_core_155")

    def test_runtime_core_is_the_60_stock_product_cohort(self) -> None:
        runtime = list_instruments("US", "us_core_100")
        self.assertEqual(len(runtime), 60)
        self.assertEqual(len({row["instrument_id"] for row in runtime}), 60)
        self.assertTrue(
            {"AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA", "TSLA"}.issubset(
                {row["ticker"] for row in runtime}
            )
        )

    def test_legacy_seo_cohort_stays_independent_from_runtime_compute(self) -> None:
        seo = list_instruments("US", "us_seo_100")
        self.assertEqual(len(seo), 100)
        self.assertEqual(len({row["instrument_id"] for row in seo}), 100)

    def test_coverage_delta_excludes_runtime_core(self) -> None:
        runtime = list_instruments("US", "us_core_100")
        delta = list_coverage_delta_instrument_ids("US", "us_core_100")
        runtime_ids = {row["instrument_id"] for row in runtime}
        self.assertTrue(len(delta) > 0)
        self.assertTrue(all(item not in runtime_ids for item in delta))

    def test_power_and_resource_research_names_are_in_search_catalog(self) -> None:
        coverage = list_instruments("US", "us_core_155")
        by_ticker = {row["ticker"]: row for row in coverage}
        expected = {
            "GEV": "GE Vernova Inc.",
            "PWR": "Quanta Services, Inc.",
            "WMB": "The Williams Companies, Inc.",
            "LNG": "Cheniere Energy, Inc.",
            "CCJ": "Cameco Corporation",
            "BEPC": "Brookfield Renewable Corporation",
            "NVO": "Novo Nordisk A/S",
            "HII": "Huntington Ingalls Industries, Inc.",
        }
        self.assertEqual({ticker: by_ticker[ticker]["name"] for ticker in expected}, expected)
        self.assertTrue(all(by_ticker[ticker]["status"] == "active" for ticker in expected))


if __name__ == "__main__":
    unittest.main()
