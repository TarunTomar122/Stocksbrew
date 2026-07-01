from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.scripts import build_daily_anomalies


class DailyAnomaliesTest(unittest.TestCase):
    def test_select_mover_ids_balances_gainers_and_losers(self) -> None:
        prices = {
            "US_A": {"quote": {"day_change_pct": 5.0}},
            "US_B": {"quote": {"day_change_pct": 1.2}},
            "US_C": {"quote": {"day_change_pct": 0.8}},
            "US_D": {"quote": {"day_change_pct": -4.0}},
            "US_E": {"quote": {"day_change_pct": -1.5}},
            "US_F": {"quote": {"day_change_pct": -0.9}},
        }

        selected = build_daily_anomalies._select_mover_ids(
            prices=prices,
            instrument_ids=["US_A", "US_B", "US_C", "US_D", "US_E", "US_F"],
            threshold_pct=1.0,
            limit_per_side=2,
        )

        self.assertEqual(selected, ["US_A", "US_B", "US_D", "US_E"])

    def test_internal_move_payload_filters_generic_earnings_and_keeps_context(self) -> None:
        payload = build_daily_anomalies._internal_move_payload(
            instrument={"ticker": "ABC", "name": "ABC Corp", "sector": "Technology"},
            intel_doc={
                "headline": "Upcoming earnings report will test growth.",
                "today_brief": "Upcoming earnings report could decide the setup.",
                "catalyst": "Earnings setup",
                "risk": "Operating margin remains weak.",
                "key_points": ["Earnings setup", "Revenue growth is strong."],
                "visual_summary": {
                    "drivers": [{"label": "Growth acceleration", "detail": "Revenue growth is strong."}],
                    "catalyst_cards": [{"event": "Earnings setup"}],
                },
                "comparative_context": {"vs_market_day_change_pct": -2.2},
            },
            intel_pro_doc={
                "pillars": {
                    "growth": {"score": 82, "metrics": [{"label": "Revenue growth", "score": 82}]},
                    "quality": {"score": 24, "metrics": [{"label": "Operating margin", "score": 24}]},
                }
            },
            market_context={"today_brief": "Risk appetite cooled across growth stocks."},
            sector_context={"today_brief": "Software lagged as investors faded expensive growth."},
            day_change_pct=-6.4,
        )

        self.assertEqual(payload["headline"], "")
        self.assertEqual(payload["today_brief"], "")
        self.assertNotIn("catalyst", payload)
        self.assertEqual(payload["key_points"], ["Revenue growth is strong."])
        self.assertEqual(payload["pillars"]["growth"]["score"], 82)
        self.assertEqual(payload["sector_context"]["today_brief"], "Software lagged as investors faded expensive growth.")
        self.assertEqual(payload["visual_summary"]["catalyst_cards"] if "catalyst_cards" in payload["visual_summary"] else [], [])

    def test_move_explanation_ignores_small_moves(self) -> None:
        explanation = build_daily_anomalies._move_explanation(
            instrument={"ticker": "ABC", "name": "ABC Corp"},
            intel_doc={"headline": "ABC earnings beat estimates", "news_count": 3},
            day_change_pct=1.9,
            external_search=False,
        )

        self.assertIsNone(explanation)

    def test_filtered_catalyst_keeps_observed_driver_not_future_filler(self) -> None:
        self.assertEqual(
            build_daily_anomalies._filtered_catalyst_text("SpaceX bond issuance and debt debut"),
            "SpaceX bond issuance and debt debut",
        )
        self.assertEqual(
            build_daily_anomalies._filtered_catalyst_text("Upcoming regulatory updates could reignite interest."),
            "",
        )

    def test_latest_timeline_items_uses_three_freshest_articles(self) -> None:
        rows = build_daily_anomalies._latest_timeline_items(
            {
                "timeline": [
                    {"timestamp": "2026-06-10T10:00:00Z", "title": "old", "summary": "old summary"},
                    {"timestamp": "2026-06-12T12:00:00Z", "title": "new", "summary": "new summary"},
                    {"timestamp": "2026-06-11T12:00:00Z", "title": "middle", "summary": "middle summary"},
                    {"timestamp": "2026-06-09T12:00:00Z", "title": "older", "summary": "older summary"},
                ]
            }
        )

        self.assertEqual([row["title"] for row in rows], ["new", "middle", "old"])

    def test_hard_news_explainer_skips_unrelated_timeline_items(self) -> None:
        with patch.object(build_daily_anomalies, "llm_api_key", return_value="key"), patch.object(
            build_daily_anomalies.requests, "post"
        ) as post:
            explanation = build_daily_anomalies._llm_move_explanation(
                instrument={"ticker": "RKLB", "name": "Rocket Lab USA"},
                day_change_pct=-10.2,
                articles=[
                    {
                        "title": "Crypto market bloodbath hits MicroStrategy",
                        "summary": "Bitcoin exposed names fall sharply.",
                        "url": "https://example.com/crypto",
                    }
                ],
            )

        self.assertIsNone(explanation)
        post.assert_not_called()

    def test_hard_news_explainer_rejects_off_topic_crypto_reason(self) -> None:
        class Response:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict:
                return {
                    "choices": [
                        {
                            "message": {
                                "content": (
                                    '{"can_explain":true,"cause_type":"market_beta",'
                                    '"headline":"Rocket Lab drops amid crypto bloodbath",'
                                    '"why_it_matters":"Crypto weakness is pressuring RKLB.",'
                                    '"confidence":"medium"}'
                                )
                            }
                        }
                    ]
                }

        with patch.object(build_daily_anomalies, "llm_api_key", return_value="key"), patch.object(
            build_daily_anomalies.requests, "post", return_value=Response()
        ):
            explanation = build_daily_anomalies._llm_move_explanation(
                instrument={"ticker": "RKLB", "name": "Rocket Lab USA", "sector": "Industrials"},
                day_change_pct=-10.2,
                articles=[
                    {
                        "title": "Bitcoin crashes, but MSTR and RKLB lead crypto-stocks bloodbath",
                        "summary": "Rocket Lab shares fell sharply amid crypto weakness.",
                    }
                ],
            )

        self.assertIsNone(explanation)

    def test_move_explanation_uses_llm_decision_over_articles(self) -> None:
        with patch.object(
            build_daily_anomalies,
            "_llm_move_explanation",
            return_value={
                "cause_type": "earnings",
                "headline": "ABC cuts guidance",
                "why_it_matters": "ABC cut guidance after orders slowed, giving investors a direct reason for the selloff.",
                "confidence": "high",
                "searched_externally": False,
                "evidence": [],
            },
        ) as explain:
            explanation = build_daily_anomalies._move_explanation(
                instrument={"ticker": "ABC", "name": "ABC Corp"},
                intel_doc={"timeline": [{"timestamp": "2026-06-12T12:00:00Z", "title": "ABC cuts guidance", "summary": "Orders slowed."}]},
                day_change_pct=-6.2,
                external_search=True,
            )

        explain.assert_called_once()
        self.assertIsNotNone(explanation)
        self.assertEqual(explanation["headline"], "ABC cuts guidance")
        self.assertFalse(explanation["searched_externally"])

    def test_move_explanation_falls_back_when_llm_cannot_explain(self) -> None:
        with patch.object(build_daily_anomalies, "_llm_move_explanation", return_value=None), patch.object(
            build_daily_anomalies, "_context_rescue_move_explanation", return_value=None
        ), patch.object(
            build_daily_anomalies, "_llm_internal_context_move_explanation", return_value=None
        ):
            explanation = build_daily_anomalies._move_explanation(
                instrument={"ticker": "ABC", "name": "ABC Corp"},
                intel_doc={"timeline": [{"timestamp": "2026-06-12T12:00:00Z", "title": "Unrelated item", "summary": "No stock catalyst."}]},
                day_change_pct=8.1,
                external_search=True,
            )

        self.assertIsNotNone(explanation)
        self.assertEqual(explanation["cause_type"], "unclear")
        self.assertFalse(explanation["searched_externally"])

    def test_move_explanation_uses_context_rescue_before_internal_context(self) -> None:
        with patch.object(build_daily_anomalies, "_llm_move_explanation", return_value=None), patch.object(
            build_daily_anomalies,
            "_context_rescue_move_explanation",
            return_value={
                "cause_type": "company_news",
                "dominant_angle": "hard_catalyst",
                "headline": "ABC wins major contract",
                "why_it_matters": "Context search found a fresh contract announcement that explains the sharp move.",
                "confidence": "high",
                "searched_externally": True,
                "external_source": "context_web_search",
                "evidence": [{"title": "ABC wins major contract", "url": "https://example.com/abc"}],
            },
        ) as rescue, patch.object(
            build_daily_anomalies,
            "_llm_internal_context_move_explanation",
            return_value=None,
        ) as internal:
            explanation = build_daily_anomalies._move_explanation(
                instrument={"ticker": "ABC", "name": "ABC Corp"},
                intel_doc={"timeline": []},
                day_change_pct=8.1,
                external_search=True,
                market="US",
                universe_id="us_core",
                store=None,
            )

        rescue.assert_called_once()
        internal.assert_not_called()
        self.assertIsNotNone(explanation)
        self.assertEqual(explanation["headline"], "ABC wins major contract")
        self.assertTrue(explanation["searched_externally"])

    def test_move_explanation_uses_internal_context_after_news_rejected(self) -> None:
        with patch.object(build_daily_anomalies, "_llm_move_explanation", return_value=None), patch.object(
            build_daily_anomalies, "_context_rescue_move_explanation", return_value=None
        ), patch.object(
            build_daily_anomalies,
            "_llm_internal_context_move_explanation",
            return_value={
                "cause_type": "internal_context",
                "dominant_angle": "quiet_move",
                "headline": "ABC dips amid consolidation and strong analyst upside",
                "why_it_matters": "The move looks like positioning around valuation and technical setup, not a confirmed news catalyst.",
                "confidence": "medium",
                "searched_externally": False,
                "evidence": [],
            },
        ) as internal:
            explanation = build_daily_anomalies._move_explanation(
                instrument={"ticker": "ABC", "name": "ABC Corp", "sector": "Technology"},
                intel_doc={
                    "timeline": [{"timestamp": "2026-06-12T12:00:00Z", "title": "Unrelated item", "summary": "No stock catalyst."}],
                    "today_brief": "ABC is consolidating above analyst targets.",
                    "key_points": ["Analyst target is below current price."],
                    "news_count": 0,
                    "source_count": 0,
                },
                day_change_pct=8.1,
                external_search=True,
            )

        internal.assert_called_once()
        self.assertIsNotNone(explanation)
        self.assertEqual(explanation["cause_type"], "internal_context")
        self.assertEqual(explanation["dominant_angle"], "quiet_move")
        self.assertEqual(explanation["headline"], "ABC lifts as buyers step in")
        self.assertEqual(explanation["confidence"], "medium")

    def test_internal_context_rejects_invented_earnings_explanation(self) -> None:
        class Response:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict:
                return {
                    "choices": [
                        {
                            "message": {
                                "content": (
                                    '{"headline":"ABC falls before earnings",'
                                    '"why_it_matters":"Investors are positioning ahead of earnings.",'
                                    '"confidence":"medium","is_generic":false}'
                                )
                            }
                        }
                    ]
                }

        with patch.object(build_daily_anomalies, "llm_api_key", return_value="key"), patch.object(
            build_daily_anomalies.requests, "post", return_value=Response()
        ):
            explanation = build_daily_anomalies._llm_internal_context_move_explanation(
                instrument={"ticker": "ABC", "name": "ABC Corp"},
                intel_doc={"risk": "Operating margin remains weak.", "news_count": 0, "source_count": 0},
                intel_pro_doc={"pillars": {"quality": {"score": 24}}},
                market_context={"today_brief": "Risk appetite cooled."},
                sector_context={"today_brief": "Software lagged."},
                day_change_pct=-6.4,
            )

        self.assertIsNone(explanation)

    def test_missing_intelligence_fill_allows_context_fallback(self) -> None:
        with patch.object(build_daily_anomalies.subprocess, "run") as run:
            build_daily_anomalies._run_intelligence_fill_for_missing(
                market="US",
                universe_id="us_core",
                instrument_ids=["US_ABC"],
                per_stock_cap=3,
                chunk_workers=2,
                per_stock_lookback_hours=24,
            )

        cmd = run.call_args.args[0]
        self.assertNotIn("--skip-context", cmd)
        self.assertIn("--instrument-ids", cmd)


if __name__ == "__main__":
    unittest.main()
