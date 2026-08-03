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
            "by_ticker": {
                "NVDA": {
                    "headline": "Nvidia gaps on earnings",
                    "tape_line": "Nvidia shares are moving after its earnings report.",
                }
            },
        }
        store.get_active_ai_universe.return_value = "us_ai_launch"
        rows = [
            {"ticker": "AAPL", "instrument_name": "Apple"},
            {"ticker": "NVDA", "instrument_name": "Nvidia"},
        ]

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
                premarket={
                    "by_ticker": {
                        "AAPL": {"pre_market_change_pct": 1.5},
                        "NVDA": {"pre_market_change_pct": 3.0},
                    }
                },
            )

        self.assertEqual(context["by_ticker"]["NVDA"]["headline"], "Nvidia gaps on earnings")
        self.assertEqual(headlines["AAPL"]["headline"], "Apple raises prices")
        overnight.assert_called_once_with(
            store,
            market="US",
            universe_id="us_ai_launch",
            tickers=["AAPL"],
            lookback_hours=14,
            company_by_ticker={"AAPL": "Apple", "NVDA": "Nvidia"},
            gap_by_ticker={"AAPL": 1.5, "NVDA": 3.0},
        )

    def test_load_premarket_intel_avoids_overnight_reads_when_context_covers_email_rows(self) -> None:
        store = MagicMock()
        store.get_premarket_context.return_value = {
            "by_ticker": {
                "NVDA": {
                    "headline": "Nvidia gaps on earnings",
                    "tape_line": "Nvidia shares are moving after its earnings report.",
                }
            },
        }
        store.get_active_ai_universe.return_value = "us_ai_launch"

        with patch("backend.premarket_email.overnight_headlines_by_ticker") as overnight, patch(
            "backend.premarket_tape_llm.enrich_context_with_tape_lines"
        ):
            _context, headlines = load_premarket_intel_for_book(
                store,
                market="US",
                rows=[
                    {"ticker": "NVDA", "instrument_name": "Nvidia"},
                    {"ticker": "AAPL", "instrument_name": "Apple"},
                ],
                premarket={
                    "by_ticker": {
                        "NVDA": {"pre_market_change_pct": 3.0},
                        "AAPL": {"pre_market_change_pct": 0.05},
                    }
                },
            )

        self.assertEqual(headlines, {})
        overnight.assert_not_called()

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
