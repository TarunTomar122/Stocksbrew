from __future__ import annotations

import unittest

from backend.scripts.build_daily_anomalies import is_confirmed_move, merge_explained_day


def _row(ticker: str, pct: float, url: str | None = "https://example.com/a", headline: str = "Reason") -> dict:
    evidence = [{"title": "Source", "url": url}] if url else []
    return {
        "ticker": ticker,
        "day_change_pct": pct,
        "narrative_status": "verified",
        "move_explanation": {"headline": headline, "confidence": "high", "evidence": evidence},
    }


class ExplainedMoveArchiveTest(unittest.TestCase):
    def test_keeps_only_sourced_explanations(self) -> None:
        rows, added = merge_explained_day(
            [], [_row("AAA", 5), _row("BBB", -7, url=None), _row("CCC", 3, url="javascript:x"), {"ticker": "DDD"}]
        )
        self.assertEqual([row["ticker"] for row in rows], ["AAA"])
        self.assertEqual(added, ["AAA"])

    def test_a_later_run_replaces_a_ticker_and_never_drops_one(self) -> None:
        first, added_first = merge_explained_day([], [_row("AAA", 5, headline="Old"), _row("BBB", -2)])
        self.assertEqual(added_first, ["AAA", "BBB"])
        # BBB left the live list; AAA was researched again; CCC is new.
        second, added_second = merge_explained_day(first, [_row("AAA", 6, headline="New"), _row("CCC", -9)])
        self.assertEqual([row["ticker"] for row in second], ["CCC", "AAA", "BBB"])
        self.assertEqual(next(row for row in second if row["ticker"] == "AAA")["move_explanation"]["headline"], "New")
        self.assertEqual(added_second, ["CCC"])


class ConfirmedMoveTest(unittest.TestCase):
    def test_matches_the_web_rule(self) -> None:
        row = _row("AAA", 5)
        self.assertFalse(is_confirmed_move(row))  # no cause type
        row["move_explanation"]["cause_type"] = "earnings_and_guidance"
        self.assertTrue(is_confirmed_move(row))
        row["move_explanation"]["confidence"] = "low"
        self.assertFalse(is_confirmed_move(row))
        row["move_explanation"]["confidence"] = "medium"
        row["move_explanation"]["external_source"] = "internal_tape_v1"
        self.assertFalse(is_confirmed_move(row))
        price_action = _row("BBB", 4)
        price_action["move_explanation"]["cause_type"] = "price_action"
        self.assertFalse(is_confirmed_move(price_action))
        unverified = _row("CCC", 4)
        unverified["move_explanation"]["cause_type"] = "contract"
        unverified["narrative_status"] = "draft"
        self.assertFalse(is_confirmed_move(unverified))


if __name__ == "__main__":
    unittest.main()
