from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from backend.divergence import build_divergence_list


class FakeStore:
    def list_article_enrichments(self, market: str, universe_id: str) -> list[dict]:
        now = datetime.now(timezone.utc).isoformat()
        return [
            {
                "market": market,
                "title": "NVDA demand surprise",
                "url": "https://example.com/nvda-1",
                "source_name": "Example",
                "published_at": now,
                "sentiment_score": 0.6,
                "entity_mentions": [
                    {"type": "stock", "ticker": "NVDA", "mention_role": "primary", "sentiment_score": 0.7}
                ],
            },
            {
                "market": market,
                "title": "NVDA wins new orders",
                "url": "https://example.com/nvda-2",
                "source_name": "Example 2",
                "published_at": now,
                "sentiment_score": 0.5,
                "entity_mentions": [
                    {"type": "stock", "ticker": "NVDA", "mention_role": "secondary", "sentiment_score": 0.5}
                ],
            },
            {
                "market": market,
                "title": "TSLA demand warning",
                "url": "https://example.com/tsla-1",
                "source_name": "Example",
                "published_at": now,
                "sentiment_score": -0.5,
                "entity_mentions": [
                    {"type": "stock", "ticker": "TSLA", "mention_role": "primary", "sentiment_score": -0.6}
                ],
            },
            {
                "market": market,
                "title": "TSLA margin pressure",
                "url": "https://example.com/tsla-2",
                "source_name": "Example 2",
                "published_at": now,
                "sentiment_score": -0.4,
                "entity_mentions": [
                    {"type": "stock", "ticker": "TSLA", "mention_role": "secondary", "sentiment_score": -0.4}
                ],
            },
        ]

    def get_latest_prices(self, instrument_ids: list[str]) -> dict[str, dict]:
        return {
            "US_NVDA": {
                "ticker": "NVDA",
                "quote": {"current": 100.0, "day_change_pct": -3.8},
            },
            "US_TSLA": {
                "ticker": "TSLA",
                "quote": {"current": 250.0, "day_change_pct": 4.2},
            },
        }


class DivergenceTest(unittest.TestCase):
    def test_builds_both_divergence_directions(self) -> None:
        instruments = [
            {"instrument_id": "US_NVDA", "ticker": "NVDA", "name": "Nvidia", "sector": "Semiconductors"},
            {"instrument_id": "US_TSLA", "ticker": "TSLA", "name": "Tesla", "sector": "Consumer"},
        ]
        with patch("backend.divergence.list_instruments", return_value=instruments):
            payload = build_divergence_list(
                FakeStore(),
                "US",
                ai_universe_id="us_ai_launch",
                price_universe_id="us_core_100",
            )

        self.assertEqual(payload["row_count"], 2)
        directions = {row["instrument_id"]: row["direction"] for row in payload["rows"]}
        self.assertEqual(directions["US_NVDA"], "bullish_news_price_down")
        self.assertEqual(directions["US_TSLA"], "bearish_news_price_up")


if __name__ == "__main__":
    unittest.main()
