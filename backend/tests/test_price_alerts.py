from __future__ import annotations

import types
import unittest
from unittest.mock import MagicMock, patch

from backend.price_alerts import fetch_prices_for_alerts


class PriceAlertsTests(unittest.TestCase):
    def test_yfinance_fallback_does_not_use_previous_close_as_current_price(self) -> None:
        store = MagicMock()
        store.get_latest_prices.return_value = {}

        class FakeTicker:
            def __init__(self, _ticker: str) -> None:
                self.info = {"previousClose": 100.0}

        fake_yfinance = types.SimpleNamespace(Ticker=FakeTicker)

        with patch.dict("sys.modules", {"yfinance": fake_yfinance}):
            prices = fetch_prices_for_alerts(
                store,
                [{"ticker": "NVDA", "instrument_id": "US_NVDA"}],
            )

        self.assertIsNone(prices["NVDA"])


if __name__ == "__main__":
    unittest.main()
