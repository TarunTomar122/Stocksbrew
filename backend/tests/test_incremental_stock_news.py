from __future__ import annotations

import unittest

from backend.models import Article
from backend.scripts.build_per_stock_intelligence import (
    _article_fingerprint,
    _filter_articles_for_instruments,
    _map_articles_to_instruments,
    _needs_incremental_brief_refresh,
)


def _article(
    article_id: str,
    *,
    title: str,
    focus_ticker: str = "",
    stock_tickers: list[str] | None = None,
    summary: str = "",
) -> Article:
    return Article(
        id=article_id,
        source_id="rss",
        source_name="RSS",
        source_kind="rss",
        market="US",
        title=title,
        url=f"https://example.com/{article_id}",
        summary=summary,
        article_overview="",
        article_key_points=[],
        published_at="2026-06-10T12:00:00+00:00",
        topic_key="stock",
        topic_label="Stock",
        topic_kind="stock",
        tags=[],
        sector_tags=[],
        stock_candidates=[],
        stock_tickers=stock_tickers or [],
        signal_types=[],
        bucket_keys=[],
        bucket_labels=[],
        bucket_kinds=[],
        entity_mentions=[],
        sentiment_score=0.1,
        sentiment_label="neutral",
        enrichment_source="test",
        focus_ticker=focus_ticker,
        body_text="",
    )


class IncrementalStockNewsTest(unittest.TestCase):
    def test_map_articles_to_instruments_uses_focus_and_regex(self) -> None:
        instruments = [
            {"instrument_id": "US_NVDA", "ticker": "NVDA"},
            {"instrument_id": "US_MU", "ticker": "MU"},
        ]
        articles = [
            _article("a1", title="NVIDIA signs new AI deal", focus_ticker="NVDA"),
            _article("a2", title="Micron rises", summary="MU stock jumps after guidance"),
        ]

        result = _map_articles_to_instruments(articles, instruments)

        self.assertEqual([article.id for article in result["US_NVDA"]], ["a1"])
        self.assertEqual([article.id for article in result["US_MU"]], ["a2"])

    def test_filter_articles_for_instruments_keeps_only_matching_rows(self) -> None:
        instruments = [{"instrument_id": "US_NVDA", "ticker": "NVDA"}]
        articles = [
            _article("a1", title="NVIDIA signs new AI deal", focus_ticker="NVDA"),
            _article("a2", title="Oil rises on supply concerns", summary="Macro update"),
        ]

        filtered = _filter_articles_for_instruments(articles, instruments)

        self.assertEqual([article.id for article in filtered], ["a1"])

    def test_article_fingerprint_changes_when_article_set_changes(self) -> None:
        first = [_article("a1", title="NVIDIA signs new AI deal", focus_ticker="NVDA")]
        second = first + [_article("a2", title="NVIDIA gets analyst upgrade", focus_ticker="NVDA")]

        self.assertNotEqual(_article_fingerprint(first), _article_fingerprint(second))

    def test_incremental_refresh_rebuilds_missing_stock_intelligence_doc(self) -> None:
        fingerprint = _article_fingerprint([_article("a1", title="SanDisk update", focus_ticker="SNDK")])

        changed, missing = _needs_incremental_brief_refresh(
            article_fingerprint=fingerprint,
            previous_fingerprint=fingerprint,
            existing_stock_intelligence_doc=None,
        )

        self.assertTrue(changed)
        self.assertTrue(missing)

    def test_incremental_refresh_skips_existing_doc_when_articles_unchanged(self) -> None:
        fingerprint = _article_fingerprint([_article("a1", title="SanDisk update", focus_ticker="SNDK")])

        changed, missing = _needs_incremental_brief_refresh(
            article_fingerprint=fingerprint,
            previous_fingerprint=fingerprint,
            existing_stock_intelligence_doc={"instrument_id": "US_SNDK"},
        )

        self.assertFalse(changed)
        self.assertFalse(missing)


if __name__ == "__main__":
    unittest.main()
