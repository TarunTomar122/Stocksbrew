from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from backend.llm_client import parse_json_content
from backend.llm_enrichment import OpenAIArticleEnricher, _fallback_payload, apply_enrichment
from backend.models import Article


class LLMEnrichmentTest(unittest.TestCase):
    def test_fallback_payload_uses_focus_ticker(self) -> None:
        article = Article(
            id="fallback-a1",
            source_id="core-google_news-msft",
            source_name="Barron's",
            source_kind="publisher",
            market="US",
            title="Microsoft stock tracking worst 6-month stretch since 2009",
            url="https://example.com/msft-stretch",
            summary="Microsoft shares remain under pressure this quarter.",
            article_overview="",
            article_key_points=[],
            published_at="2026-03-26T10:00:00+00:00",
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
            source_lane="core",
            focus_ticker="MSFT",
        )

        payload = _fallback_payload(article)
        enriched = apply_enrichment(article, payload)
        self.assertEqual(enriched.stock_tickers, ["MSFT"])
        self.assertIn("stock:US:msft", enriched.bucket_keys)
        self.assertEqual(enriched.topic_label, "Microsoft")

    def test_post_with_retry_retries_timeout_once(self) -> None:
        article = Article(
            id="retry-a1",
            source_id="src",
            source_name="Nasdaq",
            source_kind="publisher",
            market="US",
            title="Nvidia rises after analyst upgrades",
            url="https://example.com/nvda-upgrades",
            summary="Analyst upgrades lifted Nvidia shares.",
            article_overview="",
            article_key_points=[],
            published_at="2026-03-26T09:00:00+00:00",
            topic_key="market:general-market-updates",
            topic_label="General market updates",
            topic_kind="market",
            tags=[],
            sector_tags=[],
            stock_candidates=[],
            stock_tickers=[],
            signal_types=[],
            bucket_keys=[],
            bucket_labels=[],
            bucket_kinds=[],
            entity_mentions=[],
            sentiment_score=0.0,
            sentiment_label="mixed",
            enrichment_source="raw",
        )

        enricher = OpenAIArticleEnricher(api_key="test-key", timeout=1)
        timeout = Exception("placeholder")
        import requests
        timeout = requests.ReadTimeout("timed out")
        response = Mock()
        response.raise_for_status.return_value = None

        with patch("backend.llm_enrichment.requests.post", side_effect=[timeout, response]) as post_mock:
            result = enricher._post_with_retry(article)

        self.assertIs(result, response)
        self.assertEqual(post_mock.call_count, 2)

    def test_apply_enrichment_promotes_stock_and_sector_entities(self) -> None:
        article = Article(
            id="a1",
            source_id="src",
            source_name="Mint Markets",
            source_kind="publisher",
            market="IN",
            title="HDFC Bank stock plunges to a fresh 52-week low",
            url="https://example.com/hdfc-bank",
            summary="The banking heavyweight was under pressure in a broader sell-off.",
            article_overview="The banking heavyweight was under pressure in a broader sell-off.",
            article_key_points=[],
            published_at="2026-03-23T10:00:00+00:00",
            topic_key="market:general-market-updates",
            topic_label="General market updates",
            topic_kind="market",
            tags=["market"],
            sector_tags=["banking"],
            stock_candidates=[],
            stock_tickers=[],
            signal_types=["market_news"],
            bucket_keys=["market:general-market-updates"],
            bucket_labels=["General market updates"],
            bucket_kinds=["market"],
            entity_mentions=[],
            sentiment_score=0.0,
            sentiment_label="mixed",
            enrichment_source="heuristic",
        )

        payload = {
            "article_overview": "HDFC Bank was one of the sharpest banking decliners and hit a new 52-week low.",
            "article_key_points": [
                "HDFC Bank hit a fresh 52-week low.",
                "The move came amid broader banking weakness.",
            ],
            "overall_sentiment_score": -0.66,
            "entities": [
                {
                    "type": "stock",
                    "canonical_name": "HDFC Bank",
                    "ticker": "HDFCBANK",
                    "sector_id": "",
                    "market_id": "",
                    "sentiment_score": -0.82,
                    "confidence": 0.96,
                    "relevance": 0.98,
                    "entity_overview": "The article is directly negative for HDFC Bank.",
                    "entity_key_points": ["The stock hit a fresh low."],
                },
                {
                    "type": "sector",
                    "canonical_name": "Banking and NBFCs",
                    "ticker": "",
                    "sector_id": "banking",
                    "market_id": "",
                    "sentiment_score": -0.38,
                    "confidence": 0.88,
                    "relevance": 0.79,
                    "entity_overview": "The story suggests wider stress in banking names.",
                    "entity_key_points": ["Banking sentiment remained weak."],
                },
            ],
        }

        enriched = apply_enrichment(article, payload)
        self.assertEqual(enriched.enrichment_source, "llm")
        self.assertEqual(enriched.topic_kind, "stock")
        self.assertEqual(enriched.topic_label, "HDFC Bank")
        self.assertIn("stock:IN:hdfcbank", enriched.bucket_keys)
        self.assertIn("sector:IN:banking", enriched.bucket_keys)
        self.assertEqual(enriched.stock_tickers, ["HDFCBANK"])
        self.assertEqual(enriched.sector_tags, ["banking"])
        self.assertEqual(enriched.sentiment_label, "bearish")
        self.assertEqual(len(enriched.article_key_points), 2)
        self.assertEqual(len(enriched.entity_mentions), 2)

    def test_apply_enrichment_promotes_market_entity(self) -> None:
        article = Article(
            id="a2",
            source_id="src",
            source_name="BusinessLine",
            source_kind="publisher",
            market="IN",
            title="Sensex tumbles as crude spikes",
            url="https://example.com/sensex",
            summary="A risk-off day for the wider market.",
            article_overview="A risk-off day for the wider market.",
            article_key_points=[],
            published_at="2026-03-23T11:00:00+00:00",
            topic_key="market:indices-and-breadth",
            topic_label="Indices and breadth",
            topic_kind="market",
            tags=["indices"],
            sector_tags=[],
            stock_candidates=[],
            stock_tickers=[],
            signal_types=["market_news"],
            bucket_keys=["market:indices-and-breadth"],
            bucket_labels=["Indices and breadth"],
            bucket_kinds=["market"],
            entity_mentions=[],
            sentiment_score=-0.33,
            sentiment_label="cautious",
            enrichment_source="heuristic",
        )

        payload = {
            "article_overview": "The broader market sold off as oil jumped.",
            "article_key_points": ["Sensex declined sharply."],
            "overall_sentiment_score": -0.41,
            "entities": [
                {
                    "type": "market",
                    "canonical_name": "Indices and breadth",
                    "ticker": "",
                    "sector_id": "",
                    "market_id": "indices-and-breadth",
                    "sentiment_score": -0.41,
                    "confidence": 0.86,
                    "relevance": 0.91,
                    "entity_overview": "The article is primarily about broad index weakness.",
                    "entity_key_points": ["Index-level selling dominated the session."],
                },
            ],
        }

        enriched = apply_enrichment(article, payload)
        self.assertEqual(enriched.topic_kind, "market")
        self.assertEqual(enriched.bucket_keys, ["market:indices-and-breadth"])
        self.assertEqual(enriched.stock_candidates, [])
        self.assertEqual(len(enriched.entity_mentions), 1)

    def test_apply_enrichment_canonicalizes_known_stock_without_ticker(self) -> None:
        article = Article(
            id="a3",
            source_id="src",
            source_name="ET Markets",
            source_kind="publisher",
            market="IN",
            title="HDFC Bank among biggest losers",
            url="https://example.com/hdfc-bank-losers",
            summary="HDFC Bank fell sharply during Monday trade.",
            article_overview="HDFC Bank fell sharply during Monday trade.",
            article_key_points=[],
            published_at="2026-03-23T12:00:00+00:00",
            topic_key="market:general-market-updates",
            topic_label="General market updates",
            topic_kind="market",
            tags=["market"],
            sector_tags=[],
            stock_candidates=[],
            stock_tickers=[],
            signal_types=["market_news"],
            bucket_keys=["market:general-market-updates"],
            bucket_labels=["General market updates"],
            bucket_kinds=["market"],
            entity_mentions=[],
            sentiment_score=-0.2,
            sentiment_label="cautious",
            enrichment_source="heuristic",
        )

        payload = {
            "article_overview": "HDFC Bank was one of the notable laggards.",
            "article_key_points": ["HDFC Bank was among the session losers."],
            "overall_sentiment_score": -0.45,
            "entities": [
                {
                    "type": "stock",
                    "canonical_name": "HDFC Bank",
                    "ticker": "",
                    "sector_id": "banking",
                    "market_id": "",
                    "sentiment_score": -0.55,
                    "confidence": 0.9,
                    "relevance": 0.95,
                    "entity_overview": "The article is directly negative for HDFC Bank.",
                    "entity_key_points": ["The stock underperformed on the day."],
                },
            ],
        }

        enriched = apply_enrichment(article, payload)
        self.assertEqual(enriched.stock_tickers, ["HDFCBANK"])
        self.assertEqual(enriched.bucket_keys, ["stock:IN:hdfcbank"])
        self.assertEqual(enriched.topic_label, "HDFC Bank")

    def test_apply_enrichment_rejects_index_as_stock(self) -> None:
        article = Article(
            id="a4",
            source_id="src",
            source_name="Mint Markets",
            source_kind="publisher",
            market="IN",
            title="S&P 500 futures jump as oil falls",
            url="https://example.com/sp500",
            summary="Risk appetite improved after oil prices cooled.",
            article_overview="Risk appetite improved after oil prices cooled.",
            article_key_points=[],
            published_at="2026-03-23T13:00:00+00:00",
            topic_key="market:indices-and-breadth",
            topic_label="Indices and breadth",
            topic_kind="market",
            tags=["indices"],
            sector_tags=[],
            stock_candidates=[],
            stock_tickers=[],
            signal_types=["market_news"],
            bucket_keys=["market:indices-and-breadth"],
            bucket_labels=["Indices and breadth"],
            bucket_kinds=["market"],
            entity_mentions=[],
            sentiment_score=0.2,
            sentiment_label="constructive",
            enrichment_source="heuristic",
        )

        payload = {
            "article_overview": "US futures rose as oil softened.",
            "article_key_points": ["S&P 500 futures moved higher."],
            "overall_sentiment_score": 0.32,
            "entities": [
                {
                    "type": "stock",
                    "canonical_name": "S&P 500",
                    "ticker": "",
                    "sector_id": "",
                    "market_id": "",
                    "sentiment_score": 0.4,
                    "confidence": 0.9,
                    "relevance": 0.9,
                    "entity_overview": "The index moved higher.",
                    "entity_key_points": ["Futures opened stronger."],
                },
                {
                    "type": "market",
                    "canonical_name": "Indices and breadth",
                    "ticker": "",
                    "sector_id": "",
                    "market_id": "indices-and-breadth",
                    "sentiment_score": 0.32,
                    "confidence": 0.9,
                    "relevance": 0.9,
                    "entity_overview": "The article is about index-level moves.",
                    "entity_key_points": ["The session focused on broad index gains."],
                },
            ],
        }

        enriched = apply_enrichment(article, payload)
        self.assertEqual(enriched.topic_kind, "market")
        self.assertEqual(enriched.stock_candidates, [])
        self.assertEqual(len(enriched.entity_mentions), 1)
        self.assertEqual(enriched.entity_mentions[0]["type"], "market")

    def test_enricher_reuses_cached_payload(self) -> None:
        article = Article(
            id="a5",
            source_id="src",
            source_name="Nasdaq",
            source_kind="publisher",
            market="US",
            title="Amazon stock rises after cloud growth improves",
            url="https://example.com/amazon",
            summary="Amazon gained after stronger cloud commentary.",
            article_overview="Amazon gained after stronger cloud commentary.",
            article_key_points=[],
            published_at="2026-03-24T10:00:00+00:00",
            topic_key="market:general-market-updates",
            topic_label="General market updates",
            topic_kind="market",
            tags=["market"],
            sector_tags=[],
            stock_candidates=[],
            stock_tickers=[],
            signal_types=["market_news"],
            bucket_keys=["market:general-market-updates"],
            bucket_labels=["General market updates"],
            bucket_kinds=["market"],
            entity_mentions=[],
            sentiment_score=0.0,
            sentiment_label="mixed",
            enrichment_source="raw",
        )

        payload = {
            "article_overview": "Amazon advanced after stronger cloud growth commentary.",
            "article_key_points": ["Amazon shares rose after the update."],
            "overall_sentiment_score": 0.44,
            "entities": [
                {
                    "type": "stock",
                    "canonical_name": "Amazon",
                    "ticker": "AMZN",
                    "sector_id": "",
                    "market_id": "",
                    "sentiment_score": 0.61,
                    "confidence": 0.95,
                    "relevance": 0.98,
                    "entity_overview": "The article is directly positive for Amazon.",
                    "entity_key_points": ["Cloud commentary improved sentiment."],
                },
            ],
        }

        class StubStore:
            def __init__(self) -> None:
                self.rows: dict[str, dict] = {}

            def get_llm_enrichment(self, cache_key: str) -> dict | None:
                return self.rows.get(cache_key)

            def save_llm_enrichment(self, cache_key: str, row: dict) -> None:
                self.rows[cache_key] = row

        store = StubStore()
        enricher = OpenAIArticleEnricher(api_key="test-key", store=store, max_workers=2)
        calls = {"count": 0}

        def fake_extract(_article: Article, repair: bool = False) -> dict:
            self.assertFalse(repair)
            calls["count"] += 1
            return payload

        enricher._extract = fake_extract  # type: ignore[method-assign]

        first = enricher.enrich_articles([article])
        second = enricher.enrich_articles([article])

        self.assertEqual(calls["count"], 1)
        self.assertEqual(first[0].topic_label, "Amazon")
        self.assertEqual(second[0].topic_label, "Amazon")

    def test_parse_json_content_rejects_empty(self) -> None:
        for raw in ("", "   ", "\n", "```\n```", "```json\n```"):
            with self.subTest(raw=repr(raw)):
                with self.assertRaises(ValueError):
                    parse_json_content(raw)


if __name__ == "__main__":
    unittest.main()
