from __future__ import annotations

import unittest

from backend.models import Article
from backend.stock_intelligence import (
    _summarize_price_context,
    build_stock_intelligence_docs,
)


class StockIntelligenceTest(unittest.TestCase):
    def test_build_stock_intelligence_docs(self) -> None:
        instruments = [
            {
                "instrument_id": "US_NVDA",
                "market": "US",
                "ticker": "NVDA",
                "name": "NVIDIA Corporation",
            },
            {
                "instrument_id": "US_AMD",
                "market": "US",
                "ticker": "AMD",
                "name": "Advanced Micro Devices",
            },
        ]
        articles = [
            Article(
                id="a1",
                source_id="nasdaq-nvda",
                source_name="Nasdaq",
                source_kind="publisher",
                market="US",
                title="Nvidia jumps after analyst upgrade",
                url="https://example.com/nvda-upgrade",
                summary="Upgrade boosts sentiment.",
                article_overview="Analyst upgrade boosts Nvidia sentiment.",
                article_key_points=["Analyst upgrade boosts Nvidia sentiment.", "AI demand remains strong."],
                published_at="2026-03-25T12:00:00+00:00",
                topic_key="stock:US:nvda",
                topic_label="Nvidia",
                topic_kind="stock",
                tags=[],
                sector_tags=["semiconductors"],
                stock_candidates=["Nvidia"],
                stock_tickers=["NVDA"],
                signal_types=["ratings"],
                bucket_keys=["stock:US:nvda"],
                bucket_labels=["Nvidia"],
                bucket_kinds=["stock"],
                entity_mentions=[
                    {
                        "type": "stock",
                        "canonical_name": "Nvidia",
                        "ticker": "NVDA",
                        "sentiment_score": 0.7,
                    },
                    {
                        "type": "stock",
                        "canonical_name": "AMD",
                        "ticker": "AMD",
                        "sentiment_score": 0.2,
                    },
                ],
                sentiment_score=0.6,
                sentiment_label="bullish",
                enrichment_source="llm",
                source_lane="core",
                focus_ticker="NVDA",
            ),
            Article(
                id="a2",
                source_id="investing-nvda",
                source_name="Investing.com",
                source_kind="publisher",
                market="US",
                title="Nvidia leads chip stocks higher",
                url="https://example.com/nvda-chips",
                summary="Chip rally continues.",
                article_overview="Nvidia led a broader chip rally.",
                article_key_points=["Nvidia led a broader chip rally.", "Momentum remains constructive."],
                published_at="2026-03-25T10:00:00+00:00",
                topic_key="stock:US:nvda",
                topic_label="Nvidia",
                topic_kind="stock",
                tags=[],
                sector_tags=["semiconductors"],
                stock_candidates=["Nvidia"],
                stock_tickers=["NVDA"],
                signal_types=["market_news"],
                bucket_keys=["stock:US:nvda"],
                bucket_labels=["Nvidia"],
                bucket_kinds=["stock"],
                entity_mentions=[
                    {
                        "type": "stock",
                        "canonical_name": "Nvidia",
                        "ticker": "NVDA",
                        "sentiment_score": 0.5,
                    }
                ],
                sentiment_score=0.5,
                sentiment_label="constructive",
                enrichment_source="llm",
                source_lane="broad",
                focus_ticker="",
            ),
        ]

        docs_payload = build_stock_intelligence_docs("US", "us_test_5", instruments, articles)
        self.assertEqual(len(docs_payload), 2)
        docs_by_id = {doc["instrument_id"]: doc for doc in docs_payload}
        nvda = docs_by_id["US_NVDA"]
        amd = docs_by_id["US_AMD"]
        self.assertEqual(nvda["news_count"], 2)
        self.assertEqual(nvda["source_count"], 2)
        self.assertEqual(nvda["overall_label"], "bullish")
        self.assertEqual(nvda["related_instrument_ids"], ["US_AMD"])
        self.assertEqual(amd["news_count"], 1)

    def test_summarize_price_context(self) -> None:
        latest = {
            "captured_at": "2026-05-20T20:00:00+00:00",
            "quote": {
                "current": 110.0,
                "day_change_pct": 2.5,
                "volume": 200.0,
            },
        }
        history = [
            {
                "captured_at": "2026-05-15T20:00:00+00:00",
                "quote": {"current": 100.0, "day_change_pct": -1.0, "volume": 100.0},
            },
            {
                "captured_at": "2026-05-16T20:00:00+00:00",
                "quote": {"current": 102.0, "day_change_pct": 2.0, "volume": 100.0},
            },
            {
                "captured_at": "2026-05-17T20:00:00+00:00",
                "quote": {"current": 104.0, "day_change_pct": 1.9, "volume": 100.0},
            },
            {
                "captured_at": "2026-05-18T20:00:00+00:00",
                "quote": {"current": 106.0, "day_change_pct": 1.9, "volume": 100.0},
            },
            {
                "captured_at": "2026-05-19T20:00:00+00:00",
                "quote": {"current": 108.0, "day_change_pct": 1.9, "volume": 100.0},
            },
        ]
        technical = {
            "rsi_14": {"value": 68.0, "state": "neutral"},
            "distance": {"from_52w_high_pct": -8.0, "from_52w_low_pct": 42.0},
            "moving_averages": {
                "price_vs_sma_20": "above",
                "price_vs_sma_50": "above",
                "price_vs_sma_200": "above",
            },
        }
        block = _summarize_price_context(
            latest,
            technical,
            history,
            vs_market_day_change_pct=1.8,
            vs_sector_day_change_pct=0.6,
        )
        assert block is not None
        self.assertEqual(block["current_price"], 110.0)
        self.assertEqual(block["day_change_pct"], 2.5)
        self.assertEqual(block["vs_market_day_change_pct"], 1.8)
        self.assertEqual(block["volume_vs_avg"], 2.0)
        self.assertEqual(len(block["recent_sessions"]), 5)
        self.assertEqual(block["returns"]["week_1_pct"], 10.0)


if __name__ == "__main__":
    unittest.main()
