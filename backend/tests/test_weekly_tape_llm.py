from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.weekly_tape_llm import generate_weekly_stories, load_weekly_stories_for_email


class WeeklyTapeLlmTests(unittest.TestCase):
    def test_load_weekly_stories_uses_cache(self) -> None:
        store = MagicMock()
        store.get_active_ai_universe.return_value = "us_ai_launch"
        store.get_daily_anomaly_ticker_docs_batch.return_value = {}
        store.get_stock_intelligence_docs_batch.return_value = {}
        store.get_llm_enrichment.return_value = {
            "week_lede": "Cached week.",
            "stories": [{"ticker": "AAPL", "headline": "h", "story": "s", "week_change_pct": 1.0}],
        }
        weekly = {
            "week_key": "2026-W26",
            "movers_up": [{"ticker": "AAPL", "week_change_pct": 1.0, "instrument_id": "US_AAPL"}],
            "movers_down": [],
        }
        with patch("backend.weekly_tape_llm._llm_weekly_stories") as llm:
            result = load_weekly_stories_for_email(
                store,
                market="US",
                weekly=weekly,
                book_tickers={"AAPL"},
            )
        self.assertEqual(result["week_lede"], "Cached week.")
        llm.assert_not_called()


if __name__ == "__main__":
    unittest.main()
