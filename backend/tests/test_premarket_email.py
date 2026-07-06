from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from backend.premarket_email import (
    has_sendable_premarket_snapshot,
    load_premarket_intel_for_book,
    market_today_key,
)


class PremarketEmailIntelTests(unittest.TestCase):
    def test_sendable_snapshot_requires_current_market_date_and_recent_generation(self) -> None:
        snapshot = {
            "date": market_today_key("US"),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "quoted_count": 3,
        }

        self.assertTrue(has_sendable_premarket_snapshot(snapshot, market="US"))

    def test_sendable_snapshot_rejects_stale_market_date(self) -> None:
        snapshot = {
            "date": "2000-01-01",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "quoted_count": 3,
        }

        self.assertFalse(has_sendable_premarket_snapshot(snapshot, market="US"))

    def test_sendable_snapshot_rejects_old_generation_time(self) -> None:
        snapshot = {
            "date": market_today_key("US"),
            "generated_at": (datetime.now(timezone.utc) - timedelta(hours=8)).isoformat(),
            "quoted_count": 3,
        }

        self.assertFalse(has_sendable_premarket_snapshot(snapshot, market="US"))

    def test_sendable_snapshot_rejects_missing_generation_time(self) -> None:
        snapshot = {
            "date": market_today_key("US"),
            "quoted_count": 3,
        }

        self.assertFalse(has_sendable_premarket_snapshot(snapshot, market="US"))

    def test_load_premarket_intel_for_book_merges_context_and_overnight(self) -> None:
        store = MagicMock()
        store.get_premarket_context.return_value = {
            "by_ticker": {"NVDA": {"headline": "Nvidia gaps on earnings"}},
        }
        store.get_active_ai_universe.return_value = "us_ai_launch"
        rows = [{"ticker": "AAPL"}, {"ticker": "NVDA"}]

        with patch("backend.premarket_email.overnight_headlines_by_ticker") as overnight, patch(
            "backend.premarket_tape_llm.enrich_context_with_tape_lines"
        ):
            overnight.return_value = {
                "AAPL": {"headline": "Apple raises prices", "source": "Reuters"},
            }
            context, headlines = load_premarket_intel_for_book(
                store,
                market="US",
                rows=rows,
            )

        self.assertEqual(context["by_ticker"]["NVDA"]["headline"], "Nvidia gaps on earnings")
        self.assertEqual(headlines["AAPL"]["headline"], "Apple raises prices")
        overnight.assert_called_once_with(
            store,
            market="US",
            universe_id="us_ai_launch",
            tickers=["AAPL", "NVDA"],
            lookback_hours=14,
            company_by_ticker={"AAPL": "AAPL", "NVDA": "NVDA"},
            gap_by_ticker={},
        )

    def test_load_premarket_intel_skips_overnight_without_universe(self) -> None:
        store = MagicMock()
        store.get_premarket_context.return_value = None
        store.get_active_ai_universe.return_value = ""

        with patch("backend.premarket_email.overnight_headlines_by_ticker") as overnight:
            context, headlines = load_premarket_intel_for_book(
                store,
                market="US",
                rows=[{"ticker": "AAPL"}],
            )

        self.assertIsNone(context)
        self.assertEqual(headlines, {})
        overnight.assert_not_called()


if __name__ == "__main__":
    unittest.main()
