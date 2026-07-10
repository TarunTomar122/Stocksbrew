from __future__ import annotations

import unittest

from backend.newsletter_intel import has_sendable_newsletter_snapshot, previous_trading_date_key


class NewsletterSnapshotGateTests(unittest.TestCase):
    def test_morning_mode_accepts_previous_close_snapshot(self) -> None:
        market = "US"
        doc = {
            "date": previous_trading_date_key(market),
            "anomalies": [{"ticker": "NVDA", "day_change_pct": 3.0}],
        }
        self.assertTrue(has_sendable_newsletter_snapshot(doc, market=market, mode="morning"))

    def test_morning_mode_rejects_empty_snapshot(self) -> None:
        self.assertFalse(has_sendable_newsletter_snapshot({"date": "2026-07-09", "anomalies": []}, market="US"))


if __name__ == "__main__":
    unittest.main()
