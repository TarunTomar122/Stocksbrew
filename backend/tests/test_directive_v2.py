from __future__ import annotations

import unittest

from backend.directive_v2 import build_directive_v2


class DirectiveV2Test(unittest.TestCase):
    def test_constructive_setup_can_accumulate_now(self) -> None:
        doc = {
            "current_price": 100,
            "overall_label": "constructive",
            "overall_score": 72,
            "setup_state": "trend",
            "price_context": {"recent_sessions": [{"close": 96}, {"close": 100}]},
            "visual_summary": {
                "drivers": [
                    {"direction": "up", "strength": 4, "detail": "Demand is still improving."},
                    {"direction": "up", "strength": 3, "detail": "Sector leadership remains intact."},
                ],
                "risk_cards": [],
            },
            "comparative_context": {"vs_market_day_change_pct": 1.2, "vs_sector_day_change_pct": 0.5},
        }

        out = build_directive_v2(doc)

        self.assertEqual(out["stance"], "accumulate")
        self.assertEqual(out["execution"], "now")
        self.assertEqual(out["action"]["label"], "Accumulate now")
        self.assertEqual(out["zones"]["accumulate_below"], 96)
        self.assertNotIn("invalid_below", out["zones"])
        self.assertIn("watch_out", out)
        self.assertNotIn("Reassess", out["action"]["label"])

    def test_breached_invalid_zone_is_not_kept_as_future_invalidation(self) -> None:
        doc = {
            "current_price": 80,
            "overall_label": "cautious",
            "overall_score": 38,
            "setup_state": "exhaustion",
            "visual_summary": {
                "drivers": [{"direction": "down", "strength": 5, "detail": "Momentum has cracked."}],
                "risk_cards": [{"risk": "Breakdown", "detail": "Support already failed."}],
            },
            "comparative_context": {"vs_market_day_change_pct": -3, "vs_sector_day_change_pct": -2},
        }

        out = build_directive_v2(doc)

        self.assertIn(out["stance"], {"trim", "avoid"})
        self.assertNotIn("invalid_below", out["zones"])
        if out["stance"] == "trim":
            self.assertEqual(out["action"]["label"], "Do not add here")
        self.assertNotIn("Reassess", out["action"]["label"])

    def test_analyst_target_sets_the_trim_zone(self) -> None:
        doc = {
            "current_price": 352.83,
            "analyst_target": 559.02,
            "overall_label": "mixed",
            "overall_score": 59,
            "setup_state": "accumulation",
            "visual_summary": {
                "drivers": [
                    {"direction": "down", "strength": 4, "detail": "Regulatory pressure is a near-term risk."},
                    {"direction": "up", "strength": 4, "detail": "Cloud growth remains strong."},
                    {"direction": "up", "strength": 4, "detail": "Analyst target implies large upside."},
                ],
                "risk_cards": [{"risk": "Regulatory pressure", "detail": "Probe risk can weigh on sentiment."}],
            },
            "price_context": {
                "recent_sessions": [
                    {"close": 379.4},
                    {"close": 367.34},
                    {"close": 373.94},
                    {"close": 365.46},
                    {"close": 352.83},
                ],
            },
            "comparative_context": {"vs_market_day_change_pct": -3.24, "vs_sector_day_change_pct": -2.65},
        }

        out = build_directive_v2(doc)

        self.assertEqual(out["zones"]["trim_above"], 559.02)

    def test_negative_anomaly_and_hard_news_lower_the_call(self) -> None:
        base = {
            "current_price": 100,
            "analyst_target": 150,
            "overall_label": "constructive",
            "overall_score": 62,
            "setup_state": "accumulation",
            "visual_summary": {
                "drivers": [{"direction": "up", "strength": 3, "detail": "Growth remains solid."}],
                "risk_cards": [],
            },
            "comparative_context": {"vs_market_day_change_pct": 0, "vs_sector_day_change_pct": 0},
        }
        clean = build_directive_v2(base)
        stressed = build_directive_v2({
            **base,
            "news_digest": {"direction": "negative", "hard_catalyst": True},
            "anomaly_digest": {"day_change_pct": -8.0, "headline": "ABC breaks lower on risk reset"},
        })

        self.assertIn(clean["stance"], {"accumulate", "hold"})
        self.assertIn(stressed["stance"], {"hold", "trim", "avoid"})
        self.assertNotEqual(stressed["setup"]["catalyst_state"], "fresh_positive")

    def test_single_day_history_does_not_change_the_score(self) -> None:
        base = {
            "current_price": 100,
            "overall_label": "constructive",
            "overall_score": 62,
            "setup_state": "accumulation",
            "visual_summary": {"drivers": [], "risk_cards": []},
            "evidence_history": {
                "history_status": "current_only",
                "coverage_days": 1,
                "trend": "negative",
            },
        }

        self.assertEqual(build_directive_v2(base)["stance"], "accumulate")

    def test_repeated_stock_and_sector_news_can_lower_the_call(self) -> None:
        base = {
            "current_price": 100,
            "overall_label": "constructive",
            "overall_score": 45,
            "setup_state": "accumulation",
            "visual_summary": {"drivers": [], "risk_cards": []},
        }
        history = {
            "history_status": "building",
            "coverage_days": 3,
            "trend": "negative_building",
            "repeated_negative_themes": ["guidance", "demand"],
        }
        sector_history = {
            "history_status": "building",
            "coverage_days": 3,
            "trend": "negative_building",
        }

        out = build_directive_v2({
            **base,
            "evidence_history": history,
            "sector_evidence_history": sector_history,
        })

        self.assertIn(out["stance"], {"hold", "trim", "avoid"})

    def test_extended_accumulate_prefers_pullback_with_reason(self) -> None:
        doc = {
            "current_price": 120,
            "overall_label": "constructive",
            "overall_score": 78,
            "setup_state": "trend",
            "visual_summary": {
                "drivers": [{"direction": "up", "strength": 5, "detail": "Demand is accelerating."}],
                "risk_cards": [],
            },
            "price_context": {"recent_sessions": [{"close": 96}, {"close": 100}, {"close": 104}]},
            "comparative_context": {"vs_market_day_change_pct": 1.0, "vs_sector_day_change_pct": 0.5},
        }

        out = build_directive_v2(doc)

        self.assertEqual(out["stance"], "accumulate")
        self.assertEqual(out["execution"], "pullback")
        self.assertEqual(out["confidence"], "medium")
        self.assertEqual(out["action"]["label"], "Accumulate on pullbacks")
        self.assertIn("recent low", out["action"]["summary"])

    def test_fast_runup_without_big_low_gap_also_prefers_pullback(self) -> None:
        doc = {
            "current_price": 115,
            "overall_label": "constructive",
            "overall_score": 78,
            "setup_state": "trend",
            "visual_summary": {
                "drivers": [{"direction": "up", "strength": 5, "detail": "Demand is accelerating."}],
                "risk_cards": [],
            },
            "price_context": {
                "recent_sessions": [
                    {"close": 108},
                    {"close": 109},
                    {"close": 108},
                    {"close": 109},
                    {"close": 107},
                    {"close": 108},
                    {"close": 109},
                    {"close": 110},
                    {"close": 111},
                    {"close": 106},
                ]
            },
            "comparative_context": {"vs_market_day_change_pct": 1.0, "vs_sector_day_change_pct": 0.5},
        }

        out = build_directive_v2(doc)

        self.assertEqual(out["stance"], "accumulate")
        self.assertEqual(out["execution"], "pullback")
        self.assertIn("sessions", out["action"]["summary"])

    def test_options_digest_moderates_zones_without_overriding_thesis(self) -> None:
        doc = {
            "current_price": 100,
            "analyst_target": 150,
            "overall_label": "constructive",
            "overall_score": 78,
            "setup_state": "trend",
            "visual_summary": {
                "drivers": [{"direction": "up", "strength": 5, "detail": "Demand is accelerating."}],
                "risk_cards": [],
            },
            "price_context": {"recent_sessions": [{"close": 96}, {"close": 98}]},
            "options_digest": {
                "iv_rank": 82,
                "put_wall_below": 97,
                "call_wall_above": 118,
                "lower_expected_move": 93,
                "upper_expected_move": 112,
                "unusual_call_volume": True,
                "put_call_volume_ratio": 0.6,
            },
            "comparative_context": {"vs_market_day_change_pct": 2, "vs_sector_day_change_pct": 1},
        }

        out = build_directive_v2(doc)

        self.assertEqual(out["stance"], "accumulate")
        self.assertEqual(out["execution"], "pullback")
        self.assertEqual(out["confidence"], "medium")
        self.assertEqual(out["zones"]["accumulate_below"], 98)
        self.assertEqual(out["zones"]["trim_above"], 150)
        self.assertEqual(out["zones"]["near_term_resistance"], 118)


if __name__ == "__main__":
    unittest.main()
