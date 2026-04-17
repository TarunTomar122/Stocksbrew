from __future__ import annotations

import unittest

from backend.instrument_universe import (
    get_default_universe_id,
    get_instrument,
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


if __name__ == "__main__":
    unittest.main()
