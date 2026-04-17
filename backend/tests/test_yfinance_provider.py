from __future__ import annotations

import unittest

from backend.providers.yfinance_provider import yahoo_symbol_for


class YFinanceProviderTest(unittest.TestCase):
    def test_yahoo_symbol_for_us(self) -> None:
        instrument = {
            "market": "US",
            "ticker": "NVDA",
            "quote_symbol": "NVDA",
            "exchange": "NASDAQ",
        }
        self.assertEqual(yahoo_symbol_for(instrument), "NVDA")

    def test_yahoo_symbol_for_india_nse(self) -> None:
        instrument = {
            "market": "IN",
            "ticker": "RELIANCE",
            "quote_symbol": "RELIANCE",
            "quote_exchange": "NSE",
        }
        self.assertEqual(yahoo_symbol_for(instrument), "RELIANCE.NS")

    def test_yahoo_symbol_for_india_bse(self) -> None:
        instrument = {
            "market": "IN",
            "ticker": "TCS",
            "quote_symbol": "TCS",
            "quote_exchange": "BSE",
        }
        self.assertEqual(yahoo_symbol_for(instrument), "TCS.BO")


if __name__ == "__main__":
    unittest.main()
