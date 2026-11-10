from __future__ import annotations

import types
import unittest
from unittest.mock import MagicMock, patch

from backend.price_alerts import fetch_prices_for_alerts, price_alert_recipient_ok, row_for_email


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



class PriceAlertPlanTests(unittest.TestCase):
    ROW = {"instrument_id": "US_NVDA", "ai_directive": {"add_on": "Add below $150"}}

    def test_free_accounts_get_price_alert_emails(self) -> None:
        self.assertTrue(price_alert_recipient_ok({"is_subscribed": False}))
        self.assertTrue(price_alert_recipient_ok({"is_subscribed": True}))

    def test_opted_out_or_missing_accounts_do_not(self) -> None:
        self.assertFalse(price_alert_recipient_ok({"email_alerts_enabled": False}))
        self.assertFalse(price_alert_recipient_ok(None))

    def test_zones_only_go_out_for_covered_stocks(self) -> None:
        covered = {"tracked_stocks": ["US_NVDA"], "covered_stocks": ["US_NVDA"]}
        uncovered = {"tracked_stocks": ["US_NVDA", "US_AAPL"], "covered_stocks": ["US_AAPL"]}
        pro = {"is_subscribed": True, "tracked_stocks": ["US_NVDA"]}
        self.assertIs(row_for_email(covered, "US_NVDA", self.ROW), self.ROW)
        self.assertIsNone(row_for_email(uncovered, "US_NVDA", self.ROW))
        self.assertIs(row_for_email(pro, "US_NVDA", self.ROW), self.ROW)
        self.assertIsNone(row_for_email(None, "US_NVDA", self.ROW))


if __name__ == "__main__":
    unittest.main()
