from __future__ import annotations

import unittest

from backend.context_intelligence import _render_stock_visual_summary


class ContextIntelligenceTest(unittest.TestCase):
    def test_render_stock_visual_summary_drops_generic_follow_through_watch(self) -> None:
        generated = {
            "what_changed": "AVGO slipped after a sector selloff.",
            "why_it_matters": {
                "claim": "AVGO still screens well on AI demand",
                "gap_anchor": "analyst_target",
            },
            "what_to_watch": {
                "monitor": "Follow-through in AVGO's AI client engagements and revenue growth",
                "price_anchor": "current_price",
                "future_date_iso": None,
            },
        }
        payload = {
            "today": "2026-06-24",
            "market": "US",
            "ticker": "AVGO",
            "current_price": 401.76,
            "analyst_target": 523.84,
            "week_52_high": 612.0,
            "week_52_low": 290.0,
        }

        rendered = _render_stock_visual_summary(generated, payload)

        self.assertEqual(rendered["what_to_watch"], "")

    def test_render_stock_visual_summary_keeps_concrete_event_watch(self) -> None:
        generated = {
            "what_changed": "TSLA fell on delivery concerns.",
            "why_it_matters": {
                "claim": "TSLA sentiment stays fragile",
                "gap_anchor": "none",
            },
            "what_to_watch": {
                "monitor": "TSLA Q2 delivery report",
                "price_anchor": "current_price",
                "future_date_iso": "2026-07-02",
            },
        }
        payload = {
            "today": "2026-06-24",
            "market": "US",
            "ticker": "TSLA",
            "current_price": 181.25,
            "analyst_target": 210.0,
            "week_52_high": 245.0,
            "week_52_low": 138.0,
        }

        rendered = _render_stock_visual_summary(generated, payload)

        self.assertEqual(
            rendered["what_to_watch"],
            "TSLA Q2 delivery report - vs the current price of $181.25 - by Jul 2, 2026.",
        )


if __name__ == "__main__":
    unittest.main()
