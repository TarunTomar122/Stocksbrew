from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.evidence_history import (
    build_daily_evidence_snapshots,
    merge_evidence_history_rows,
    summarize_evidence_history,
)


def article(
    article_id: str,
    published_at: str,
    score: float,
    title: str,
    *,
    ticker: str = "ABC",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=article_id,
        published_at=published_at,
        title=title,
        summary=title,
        article_overview=title,
        article_key_points=[title],
        tags=[],
        signal_types=[],
        source_name=f"Source {article_id}",
        sentiment_score=score,
        sentiment_label="bearish" if score < 0 else "bullish",
        sector_tags=["technology"],
        entity_mentions=[
            {
                "type": "stock",
                "ticker": ticker,
                "mention_role": "primary",
                "sentiment_score": score,
            }
        ],
    )


class EvidenceHistoryTest(unittest.TestCase):
    def test_first_snapshot_is_explicitly_cold_start(self) -> None:
        rows = build_daily_evidence_snapshots(
            [article("a1", "2026-08-26T10:00:00+00:00", -0.4, "ABC faces guidance pressure")],
            market="US",
            subject_kind="stock",
            instrument_id="US_ABC",
            ticker="ABC",
        )

        summary = summarize_evidence_history(rows)

        self.assertEqual(summary["history_status"], "current_only")
        self.assertEqual(summary["coverage_days"], 1)
        self.assertEqual(summary["trend"], "negative")
        self.assertEqual(summary["negative_streak"], 1)

    def test_repeated_negative_news_builds_a_signal_and_theme(self) -> None:
        rows = build_daily_evidence_snapshots(
            [
                article("a1", "2026-08-24T10:00:00+00:00", -0.4, "ABC cuts guidance"),
                article("a2", "2026-08-25T10:00:00+00:00", -0.3, "ABC warns on guidance"),
                article("a3", "2026-08-26T10:00:00+00:00", -0.2, "ABC guidance pressure grows"),
            ],
            market="US",
            subject_kind="stock",
            instrument_id="US_ABC",
            ticker="ABC",
        )

        summary = summarize_evidence_history(rows)

        self.assertEqual(summary["history_status"], "building")
        self.assertEqual(summary["trend"], "negative_building")
        self.assertEqual(summary["negative_streak"], 3)
        self.assertIn("guidance", summary["repeated_negative_themes"])

    def test_new_snapshot_replaces_same_day_backfill(self) -> None:
        old = {"day": "2026-08-26", "mean_sentiment": -0.4, "direction": "negative"}
        fresh = {"day": "2026-08-26", "mean_sentiment": 0.4, "direction": "positive"}

        merged = merge_evidence_history_rows([old], [fresh])

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["direction"], "positive")


if __name__ == "__main__":
    unittest.main()
