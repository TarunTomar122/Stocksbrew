from __future__ import annotations

import unittest

from backend.heat_list import bucket_enrichments_by_day


class HeatListTest(unittest.TestCase):
    def test_bucket_enrichments_rejects_unsafe_or_placeholder_tickers(self) -> None:
        enrichments = [
            {
                "market": "US",
                "published_at": "2026-07-15T12:00:00Z",
                "sentiment_score": 0.5,
                "entity_mentions": [
                    {"type": "stock", "ticker": "AAPL", "mention_role": "primary"},
                    {"type": "stock", "ticker": "XAU/USD", "mention_role": "secondary"},
                    {"type": "stock", "ticker": "EUR/USD", "mention_role": "secondary"},
                    {"type": "stock", "ticker": "N/A", "mention_role": "secondary"},
                ],
            }
        ]

        buckets = bucket_enrichments_by_day(enrichments)

        self.assertEqual(list(buckets), ["US_AAPL"])


if __name__ == "__main__":
    unittest.main()
