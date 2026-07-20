from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from backend.open_email_intel import fresh_sector_summary_from_prices, has_fresh_open_snapshot


class OpenEmailFreshnessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 7, 20, 13, 50, tzinfo=timezone.utc)

    def _snapshot(self, *, generated_at: datetime, price_as_of: datetime, date: str = "2026-07-20") -> dict:
        return {
            "date": date,
            "generated_at": generated_at.isoformat(),
            "anomalies": [{"ticker": "NVDA", "price_as_of": price_as_of.isoformat()}],
        }

    def test_snapshot_requires_current_date_and_fresh_quotes(self) -> None:
        fresh = self._snapshot(
            generated_at=self.now - timedelta(minutes=12),
            price_as_of=self.now - timedelta(minutes=15),
        )
        self.assertTrue(has_fresh_open_snapshot(fresh, market="US", now=self.now))

        old_quote = self._snapshot(
            generated_at=self.now - timedelta(minutes=12),
            price_as_of=self.now - timedelta(hours=3),
        )
        self.assertFalse(has_fresh_open_snapshot(old_quote, market="US", now=self.now))

        prior_day = self._snapshot(
            generated_at=self.now - timedelta(minutes=12),
            price_as_of=self.now - timedelta(minutes=15),
            date="2026-07-19",
        )
        self.assertFalse(has_fresh_open_snapshot(prior_day, market="US", now=self.now))

    def test_sector_summary_uses_all_fresh_prices_and_ignores_stale_quotes(self) -> None:
        instruments = [
            {"instrument_id": "US_A", "sector": "Technology"},
            {"instrument_id": "US_B", "sector": "Technology"},
            {"instrument_id": "US_C", "sector": "Energy"},
        ]
        prices = {
            "US_A": {
                "captured_at": (self.now - timedelta(minutes=10)).isoformat(),
                "quote": {"day_change_pct": 2.0},
            },
            "US_B": {
                "captured_at": (self.now - timedelta(minutes=20)).isoformat(),
                "quote": {"day_change_pct": -1.0},
            },
            "US_C": {
                "captured_at": (self.now - timedelta(hours=2)).isoformat(),
                "quote": {"day_change_pct": 8.0},
            },
        }

        summary, price_as_of, quoted_count = fresh_sector_summary_from_prices(instruments, prices, now=self.now)

        self.assertEqual(summary, [{"sector": "Technology", "avg_move_pct": 0.5, "count": 2}])
        self.assertEqual(price_as_of, (self.now - timedelta(minutes=20)).isoformat())
        self.assertEqual(quoted_count, 2)


if __name__ == "__main__":
    unittest.main()
