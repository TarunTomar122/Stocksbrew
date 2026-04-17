from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from backend.llm_enrichment import apply_enrichment
from backend.models import Article
from backend.pipeline import _select_articles_for_enrichment, article_priority, build_market_snapshot
from backend.rss import parse_rss


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures"
FIXTURE_MAP = {
    "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml": "nse-announcements.xml",
    "https://nsearchives.nseindia.com/content/RSS/Circulars.xml": "bse-notices.xml",
    "https://nsearchives.nseindia.com/content/RSS/Financial_Results.xml": "nse-announcements.xml",
    "https://nsearchives.nseindia.com/content/RSS/Board_Meetings.xml": "nse-announcements.xml",
    "https://www.bseindia.com/data/xml/notices.xml": "bse-notices.xml",
    "https://www.bseindia.com/data/xml/announcements.xml": "nse-announcements.xml",
    "https://www.bseindia.com/Data/XML/FinancialResultsFeed.xml": "nse-announcements.xml",
    "https://www.bseindia.com/Data/XML/BoardMeetingsFeed.xml": "bse-notices.xml",
    "https://www.livemint.com/rss/markets": "livemint-markets.xml",
    "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms": "economic-times-markets.xml",
    "https://www.thehindubusinessline.com/markets/feeder/default.rss": "economic-times-markets.xml",
    "https://feeds.content.dowjones.io/public/rss/mw_marketpulse": "economic-times-markets.xml",
    "https://www.investing.com/rss/news_25.rss": "economic-times-markets.xml",
}


def fixture_fetcher(url: str) -> str:
    fixture_name = FIXTURE_MAP[url]
    return (FIXTURES / fixture_name).read_text(encoding="utf-8")


def fixture_feed(source, fetcher=None):
    return parse_rss(source, fixture_fetcher(source.feed_url))


class FakeEnricher:
    def enrich_articles(self, articles):
        enriched = []
        for article in articles:
            payload = self._payload_for(article)
            enriched.append(apply_enrichment(article, payload))
        return enriched

    def _payload_for(self, article):
        text = f"{article.title} {article.summary}".lower()
        if "hdfc bank" in text:
            return {
                "article_overview": article.summary or article.title,
                "article_key_points": ["HDFC Bank is a direct focus."],
                "overall_sentiment_score": -0.4,
                "entities": [
                    {
                        "type": "stock",
                        "canonical_name": "HDFC Bank",
                        "ticker": "HDFCBANK",
                        "sector_id": "banking",
                        "market_id": "",
                        "sentiment_score": -0.5,
                        "confidence": 0.9,
                        "relevance": 0.9,
                        "entity_overview": "Direct HDFC Bank coverage.",
                        "entity_key_points": ["HDFC Bank is explicitly mentioned."],
                    }
                ],
            }
        if "idbi" in text:
            return {
                "article_overview": article.summary or article.title,
                "article_key_points": ["IDBI Bank is a direct focus."],
                "overall_sentiment_score": -0.2,
                "entities": [
                    {
                        "type": "stock",
                        "canonical_name": "IDBI Bank",
                        "ticker": "IDBI",
                        "sector_id": "banking",
                        "market_id": "",
                        "sentiment_score": -0.2,
                        "confidence": 0.9,
                        "relevance": 0.9,
                        "entity_overview": "Direct IDBI Bank coverage.",
                        "entity_key_points": ["IDBI Bank is explicitly mentioned."],
                    }
                ],
            }
        if "bank" in text:
            return {
                "article_overview": article.summary or article.title,
                "article_key_points": ["Banking sector is in focus."],
                "overall_sentiment_score": -0.1,
                "entities": [
                    {
                        "type": "sector",
                        "canonical_name": "Banking and NBFCs",
                        "ticker": "",
                        "sector_id": "banking",
                        "market_id": "",
                        "sentiment_score": -0.1,
                        "confidence": 0.85,
                        "relevance": 0.85,
                        "entity_overview": "Banking coverage.",
                        "entity_key_points": ["Banking sector is mentioned."],
                    }
                ],
            }
        return {
            "article_overview": article.summary or article.title,
            "article_key_points": ["General market coverage."],
            "overall_sentiment_score": 0.0,
            "entities": [
                {
                    "type": "market",
                    "canonical_name": "General market updates",
                    "ticker": "",
                    "sector_id": "",
                    "market_id": "general-market-updates",
                    "sentiment_score": 0.0,
                    "confidence": 0.8,
                    "relevance": 0.8,
                    "entity_overview": "General market coverage.",
                    "entity_key_points": ["General market update."],
                }
            ],
        }


class PipelineTest(unittest.TestCase):
    def test_build_snapshot(self) -> None:
        with patch("backend.pipeline.fetch_feed", side_effect=fixture_feed):
            snapshot = build_market_snapshot("IN", fetcher=fixture_fetcher, enricher=FakeEnricher())
        self.assertEqual(snapshot["market"], "IN")
        self.assertGreater(snapshot["stats"]["bucket_count"], 0)
        self.assertEqual(snapshot["stats"]["live_source_count"], 11)
        bucket_names = [bucket["name"] for bucket in snapshot["buckets"]]
        self.assertIn("Banking and NBFCs", bucket_names)

    def test_build_snapshot_with_review_sources(self) -> None:
        with patch("backend.pipeline.fetch_feed", side_effect=fixture_feed):
            snapshot = build_market_snapshot("IN", include_review_sources=True, fetcher=fixture_fetcher, enricher=FakeEnricher())
        self.assertEqual(snapshot["stats"]["live_source_count"], 11)
        bucket_names = [bucket["name"] for bucket in snapshot["buckets"]]
        self.assertIn("HDFC Bank", bucket_names)
        self.assertIn("Banking and NBFCs", bucket_names)

    def test_build_snapshot_with_limited_sources_and_articles(self) -> None:
        with patch("backend.pipeline.fetch_feed", side_effect=fixture_feed):
            snapshot = build_market_snapshot(
                "IN",
                fetcher=fixture_fetcher,
                enricher=FakeEnricher(),
                source_ids=["livemint-markets", "economic-times-markets"],
                max_articles=5,
            )
        self.assertEqual(snapshot["stats"]["live_source_count"], 2)
        self.assertEqual(snapshot["stats"]["tracked_source_count"], 2)
        self.assertLessEqual(snapshot["stats"]["article_count"], 5)

    def test_select_articles_prioritizes_promoted_and_core_lanes(self) -> None:
        def make_article(article_id: str, lane: str, title: str, published_at: str, focus_ticker: str = "") -> Article:
            return Article(
                id=article_id,
                source_id=f"{lane}-{article_id}",
                source_name=lane,
                source_kind="publisher",
                market="US",
                title=title,
                url=f"https://example.com/{article_id}",
                summary="company update",
                article_overview="",
                article_key_points=[],
                published_at=published_at,
                topic_key="",
                topic_label="",
                topic_kind="",
                tags=[],
                sector_tags=[],
                stock_candidates=[],
                stock_tickers=[],
                signal_types=["market_news"],
                bucket_keys=[],
                bucket_labels=[],
                bucket_kinds=[],
                entity_mentions=[],
                sentiment_score=0.0,
                sentiment_label="unscored",
                enrichment_source="raw",
                source_lane=lane,
                focus_ticker=focus_ticker,
            )

        articles = [
            make_article("b1", "broad", "Macro futures wobble", "2026-03-24T09:00:00+00:00"),
            make_article("b2", "broad", "Apple stock jumps after analysts raise targets", "2026-03-24T08:59:00+00:00"),
            make_article("c1", "core", "Nvidia stock rises after bullish analyst note", "2026-03-24T08:58:00+00:00", focus_ticker="NVDA"),
            make_article("c2", "core", "Tesla delivery watch intensifies", "2026-03-24T08:57:00+00:00", focus_ticker="TSLA"),
            make_article("p1", "promoted", "Palantir lands new defense contract", "2026-03-24T08:56:00+00:00", focus_ticker="PLTR"),
        ]

        selected = _select_articles_for_enrichment(articles, {"broad": 1, "core": 1, "promoted": 1}, max_articles=3)
        self.assertEqual(len(selected), 3)
        self.assertEqual({article.source_lane for article in selected}, {"broad", "core", "promoted"})
        self.assertIn("Apple stock jumps after analysts raise targets", [article.title for article in selected])

    def test_article_priority_penalizes_macro_noise(self) -> None:
        stock_article = Article(
            id="stock",
            source_id="a",
            source_name="Nasdaq",
            source_kind="publisher",
            market="US",
            title="Nvidia stock rises after analyst upgrade",
            url="https://example.com/stock",
            summary="price target lifted",
            article_overview="",
            article_key_points=[],
            published_at="2026-03-24T10:00:00+00:00",
            topic_key="",
            topic_label="",
            topic_kind="",
            tags=[],
            sector_tags=[],
            stock_candidates=[],
            stock_tickers=[],
            signal_types=["ratings"],
            bucket_keys=[],
            bucket_labels=[],
            bucket_kinds=[],
            entity_mentions=[],
            sentiment_score=0.0,
            sentiment_label="unscored",
            enrichment_source="raw",
            source_lane="broad",
            focus_ticker="",
        )
        macro_article = Article(
            id="macro",
            source_id="b",
            source_name="Nasdaq",
            source_kind="publisher",
            market="US",
            title="Stock futures slip as crude climbs on Iran headlines",
            url="https://example.com/macro",
            summary="macro move",
            article_overview="",
            article_key_points=[],
            published_at="2026-03-24T10:00:00+00:00",
            topic_key="",
            topic_label="",
            topic_kind="",
            tags=[],
            sector_tags=[],
            stock_candidates=[],
            stock_tickers=[],
            signal_types=["macro"],
            bucket_keys=[],
            bucket_labels=[],
            bucket_kinds=[],
            entity_mentions=[],
            sentiment_score=0.0,
            sentiment_label="unscored",
            enrichment_source="raw",
            source_lane="broad",
            focus_ticker="",
        )
        self.assertGreater(article_priority(stock_article)[0], article_priority(macro_article)[0])


if __name__ == "__main__":
    unittest.main()
