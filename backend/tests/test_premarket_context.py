from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.models import Article
from backend.premarket_intel import subscriber_book_mover_tickers
from backend.scripts.build_premarket_context import build_context_for_movers


def _article(ticker: str) -> Article:
    return Article(
        id=f"article-{ticker}",
        source_id="test",
        source_name="Test Wire",
        source_kind="publisher",
        market="US",
        title=f"{ticker} moves before the open",
        url=f"https://example.com/{ticker.lower()}",
        summary=f"Fresh catalyst for {ticker}.",
        article_overview="",
        article_key_points=[],
        published_at="2026-07-21T09:00:00+00:00",
        topic_key="markets",
        topic_label="Markets",
        topic_kind="market_news",
        tags=[],
        sector_tags=[],
        stock_candidates=[ticker],
        stock_tickers=[ticker],
        signal_types=[],
        bucket_keys=[],
        bucket_labels=[],
        bucket_kinds=[],
        entity_mentions=[],
        sentiment_score=0,
        sentiment_label="mixed",
        enrichment_source="test",
        source_lane="core",
        focus_ticker=ticker,
    )


class PremarketContextTests(unittest.TestCase):
    def test_subscriber_book_candidates_match_each_users_top_email_rows(self) -> None:
        store = MagicMock()
        store.list_subscribed_users.return_value = [
            {"uid": "u1", "is_subscribed": True},
            {"uid": "u2", "is_subscribed": True},
            {"uid": "u3", "is_subscribed": True, "email_digest_enabled": False},
        ]
        views = {
            "u1": {"rows": [{"ticker": "AAPL"}, {"ticker": "MSFT"}]},
            "u2": {"rows": [{"ticker": "NVDA"}]},
            "u3": {"rows": [{"ticker": "TSLA"}]},
        }
        store.get_watchlist_view.side_effect = views.get
        snapshot = {
            "by_ticker": {
                "AAPL": {"pre_market_change_pct": 3.0},
                "MSFT": {"pre_market_change_pct": 1.0},
                "NVDA": {"pre_market_change_pct": -5.0},
                "TSLA": {"pre_market_change_pct": 8.0},
            }
        }

        tickers = subscriber_book_mover_tickers(store, snapshot, per_user_limit=1)

        self.assertEqual(tickers, ["NVDA", "AAPL"])

    @patch("backend.scripts.build_premarket_context.enrich_context_with_tape_lines")
    @patch("backend.scripts.build_premarket_context.fetch_finnhub_news_for_tickers")
    @patch("backend.scripts.build_premarket_context.fetch_av_news_for_tickers")
    @patch("backend.scripts.build_premarket_context._instruments_for_tickers")
    @patch("backend.scripts.build_premarket_context.subscriber_book_mover_tickers")
    @patch("backend.scripts.build_premarket_context.mover_tickers_from_snapshot")
    def test_context_uses_one_market_batch_then_single_symbol_fallbacks(
        self,
        public_tickers,
        email_tickers,
        instruments,
        av_news,
        finnhub,
        _tape,
    ) -> None:
        public_tickers.return_value = ["AAPL"]
        email_tickers.return_value = ["AAPL", "MSFT", "GAP"]
        instruments.return_value = [
            {"instrument_id": "US_AAPL", "ticker": "AAPL", "name": "Apple"},
            {"instrument_id": "US_MSFT", "ticker": "MSFT", "name": "Microsoft"},
            {"instrument_id": "US_GAP", "ticker": "GAP", "name": "Gap"},
        ]
        av_news.return_value = [_article("AAPL")]
        finnhub.return_value = [_article("MSFT")]
        store = MagicMock()
        store.get_premarket_movers.return_value = {
            "date": "2026-07-22",
            "generated_at": "2026-07-22T08:30:00+00:00",
            "by_ticker": {
                "AAPL": {"pre_market_change_pct": 3.0},
                "MSFT": {"pre_market_change_pct": 1.0},
                "GAP": {"pre_market_change_pct": 0.5},
            }
        }
        store.get_active_ai_universe.return_value = "us_core_100"
        store.list_article_enrichments.return_value = []

        payload = build_context_for_movers(store, market="US")

        self.assertEqual(payload["candidate_tickers"], ["AAPL", "MSFT", "GAP"])
        self.assertEqual(payload["source_movers_generated_at"], "2026-07-22T08:30:00+00:00")
        self.assertEqual(payload["source_movers_date"], "2026-07-22")
        self.assertEqual(payload["ticker_count"], 2)
        self.assertNotIn("GAP", payload["by_ticker"])
        self.assertEqual(payload["build_stats"]["no_catalyst_tickers"], 1)
        av_news.assert_called_once_with(
            ["AAPL", "MSFT", "GAP"],
            market="US",
            lookback_hours=12,
        )
        finnhub.assert_called_once_with(["MSFT", "GAP"], market="US", lookback_days=1)
        store.save_premarket_context.assert_called_once()


if __name__ == "__main__":
    unittest.main()
