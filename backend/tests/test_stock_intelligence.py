from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.models import Article
from backend.stock_intelligence import (
    _normalize_catalyst_cards,
    _repair_directive,
    _stock_market_regime,
    _summarize_price_context,
    build_no_news_intelligence_doc,
    build_stock_intelligence_docs,
)


class StockIntelligenceTest(unittest.TestCase):
    def test_repair_directive_preserves_now_call_and_derives_primary_zone(self) -> None:
        directive = _repair_directive({
            "text": "Accumulate on dips below 185",
            "action_now": "Accumulate now",
            "stance": "accumulate",
            "trigger_type": "none",
            "trigger_value": "",
            "add_on": {
                "text": "Add on pullbacks below $185",
                "trigger_type": "price_below",
                "trigger_value": "185",
            },
            "trim_on": {
                "text": "Trim if it spikes above $230 without fresh guidance",
                "trigger_type": "price_above",
                "trigger_value": "230",
            },
            "breaks_if": {
                "text": "Reassess if $175 breaks",
                "trigger_type": "price_below",
                "trigger_value": "175",
            },
            "rationale": "NVDA is still leading semis, but the best add zone is below spot.",
            "confidence": "med",
        })

        self.assertEqual(directive["text"], "Accumulate now")
        self.assertEqual(directive["action_now"], "Accumulate now")
        self.assertEqual(directive["trigger_type"], "price_below")
        self.assertEqual(directive["trigger_value"], "185")
        self.assertEqual(directive["add_on"]["trigger_value"], "185")

    def test_repair_directive_converts_breached_break_zone_to_reclaim_call(self) -> None:
        directive = _repair_directive({
            "text": "Accumulate now",
            "action_now": "Price is near support at $366.57; accumulate on weakness below $370.",
            "stance": "accumulate",
            "trigger_type": "price_below",
            "trigger_value": "370",
            "add_on": {
                "text": "Add on dips below $370",
                "trigger_type": "price_below",
                "trigger_value": "370",
            },
            "trim_on": {
                "text": "Trim above recent highs near $380",
                "trigger_type": "price_above",
                "trigger_value": "380",
            },
            "breaks_if": {
                "text": "Reassess if support at $366.57 breaks",
                "trigger_type": "price_below",
                "trigger_value": "366.57",
            },
            "confidence": "high",
        }, current_price=365.46)

        self.assertEqual(directive["text"], "Watch for reclaim")
        self.assertEqual(directive["stance"], "watch")
        self.assertEqual(directive["trigger_type"], "price_above")
        self.assertEqual(directive["trigger_value"], "366.57")
        self.assertEqual(directive["add_on"]["trigger_type"], "price_above")
        self.assertEqual(directive["breaks_if"]["trigger_type"], "none")
        self.assertNotIn("if support", directive["action_now"].lower())
        self.assertEqual(directive["rationale"], directive["action_now"])

    def test_build_stock_intelligence_docs_normalizes_earnings_cards_even_with_risk_cards(self) -> None:
        instruments = [
            {
                "instrument_id": "US_ABC",
                "market": "US",
                "ticker": "ABC",
                "name": "ABC Corp",
            }
        ]
        articles = [
            Article(
                id="a1",
                source_id="abc-news",
                source_name="News",
                source_kind="publisher",
                market="US",
                title="ABC holds gains into catalyst window",
                url="https://example.com/abc",
                summary="ABC is in focus.",
                article_overview="ABC is in focus.",
                article_key_points=["ABC is in focus."],
                published_at="2026-06-21T12:00:00+00:00",
                topic_key="stock:US:abc",
                topic_label="ABC",
                topic_kind="stock",
                tags=[],
                sector_tags=["technology"],
                stock_candidates=["ABC"],
                stock_tickers=["ABC"],
                signal_types=["market_news"],
                bucket_keys=["stock:US:abc"],
                bucket_labels=["ABC"],
                bucket_kinds=["stock"],
                entity_mentions=[
                    {
                        "type": "stock",
                        "canonical_name": "ABC",
                        "ticker": "ABC",
                        "sentiment_score": 0.3,
                        "mention_role": "primary",
                    }
                ],
                sentiment_score=0.3,
                sentiment_label="constructive",
                enrichment_source="llm",
                source_lane="core",
                focus_ticker="ABC",
            )
        ]

        class Store:
            def get_latest_prices(self, _instrument_ids: list[str]) -> dict[str, dict]:
                return {}

            def list_stock_intel_pro(self, _market: str, _universe: str) -> list[dict]:
                return []

            def get_latest_stock_technicals_batch(self, _instrument_ids: list[str]) -> dict[str, dict]:
                return {}

            def get_sector_regimes(self, _market: str) -> dict:
                return {}

            def get_stock_intelligence_doc(self, _market: str, _universe: str, _instrument_id: str) -> dict | None:
                return None

        llm_brief = {
            "headline": "ABC setup stays active",
            "body": "ABC still has a catalyst window ahead.",
            "key_findings": ["ABC still has a catalyst window ahead."],
            "catalyst": "Earnings Apr 22 AMC",
            "risk": "Valuation is stretched.",
            "thesis": "ABC setup stays active",
            "setup_state": "constructive",
            "drivers": [],
            "catalyst_cards": [
                {
                    "event": "Earnings Apr 22 AMC",
                    "detail": "Model used the wrong date.",
                    "window": "Apr 22",
                    "expected_impact": 1,
                    "priced_in": "med",
                }
            ],
            "risk_cards": [
                {
                    "risk": "Valuation is stretched.",
                    "detail": "Crowded positioning raises downside if follow-through fades.",
                    "trigger": "multiple compression",
                    "severity": 3,
                    "probability": 3,
                }
            ],
        }

        with patch("backend.stock_intelligence._llm_synthesize_brief", return_value=llm_brief), patch(
            "backend.stock_intelligence._load_earnings_by_instrument",
            return_value={"US_ABC": {"status": "reported", "event_date": "2026-04-22"}},
        ):
            docs_payload = build_stock_intelligence_docs("US", "us_test_1", instruments, articles, store=Store())

        self.assertEqual(len(docs_payload), 1)
        self.assertNotIn("Apr 22", docs_payload[0]["catalyst"])
        self.assertNotIn("Apr 22", docs_payload[0]["body"])
        cards = docs_payload[0]["visual_cards"]["catalyst_cards"]
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["window"], "post-earnings")
        self.assertEqual(cards[0]["event"], "Earnings setup")
        self.assertEqual(docs_payload[0]["visual_summary"]["catalyst_cards"], cards)

    def test_build_stock_intelligence_docs_never_persists_completed_doc_without_directive(self) -> None:
        instruments = [
            {
                "instrument_id": "US_NVDA",
                "market": "US",
                "ticker": "NVDA",
                "name": "NVIDIA Corporation",
            }
        ]
        articles = [
            Article(
                id="nvda1",
                source_id="nvda-news",
                source_name="News",
                source_kind="publisher",
                market="US",
                title="Nvidia data center demand remains strong",
                url="https://example.com/nvda",
                summary="Data center demand remains strong.",
                article_overview="Data center demand remains strong.",
                article_key_points=["Data center demand remains strong."],
                published_at="2026-06-25T12:00:00+00:00",
                topic_key="stock:US:nvda",
                topic_label="NVDA",
                topic_kind="stock",
                tags=[],
                sector_tags=["semiconductors"],
                stock_candidates=["NVDA"],
                stock_tickers=["NVDA"],
                signal_types=["market_news"],
                bucket_keys=["stock:US:nvda"],
                bucket_labels=["NVDA"],
                bucket_kinds=["stock"],
                entity_mentions=[{"type": "stock", "ticker": "NVDA", "mention_role": "primary"}],
                sentiment_score=0.5,
                sentiment_label="constructive",
                enrichment_source="llm",
                source_lane="core",
                focus_ticker="NVDA",
            )
        ]

        class Store:
            def get_latest_prices(self, _instrument_ids: list[str]) -> dict[str, dict]:
                return {"US_NVDA": {"quote": {"current": 199.0, "day_change_pct": -0.5}}}

            def list_stock_intel_pro(self, _market: str, _universe: str) -> list[dict]:
                return []

            def get_latest_stock_technicals_batch(self, _instrument_ids: list[str]) -> dict[str, dict]:
                return {}

            def get_sector_regimes(self, _market: str) -> dict:
                return {}

            def get_stock_intelligence_doc(self, _market: str, _universe: str, _instrument_id: str) -> dict | None:
                return None

        llm_brief = {
            "headline": "Data center demand still leads",
            "body": "Nvidia demand remains constructive.",
            "key_findings": ["Demand remains constructive."],
            "catalyst": "AI server demand",
            "risk": "Sector weakness",
            "thesis": "AI demand still leads",
            "setup_state": "trend",
            "drivers": [],
            "catalyst_cards": [],
            "risk_cards": [],
        }

        with patch("backend.stock_intelligence._llm_synthesize_brief", return_value=llm_brief):
            docs_payload = build_stock_intelligence_docs("US", "us_test_1", instruments, articles, store=Store())

        directive = docs_payload[0]["directive"]
        self.assertIsInstance(directive, dict)
        self.assertTrue(directive["text"])
        self.assertIn(directive["trigger_type"], {"price_below", "price_above", "new_catalyst", "none"})

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
        self.assertEqual(len(block["recent_sessions"]), 6)
        self.assertEqual(block["returns"]["week_1_pct"], 10.0)

    def test_stock_market_regime_prefers_instrument_sector(self) -> None:
        instrument = {"ticker": "NVDA", "sector": "Semiconductors"}
        fundamentals = {"sector": "Technology"}
        sector_regimes = {
            "macro": {
                "market_phase": "trending_up",
                "risk_appetite": "high",
                "narrative": "AI leadership still owns the tape.",
                "leadership": ["Semiconductors", "Software"],
                "laggards": ["Utilities"],
                "rotation_signal": "Capital keeps rotating back into semis on pullbacks.",
            },
            "semiconductors": {
                "sector": "Semiconductors",
                "regime": "momentum",
                "conviction": "high",
                "narrative": "Estimate revisions remain positive.",
                "invalidators": ["AI capex cuts"],
                "leadership_stocks": ["NVDA", "AVGO"],
            },
            "technology": {
                "sector": "Technology",
                "regime": "range",
                "conviction": "med",
                "narrative": "Mixed breadth.",
                "invalidators": [],
                "leadership_stocks": ["MSFT"],
            },
        }

        result = _stock_market_regime(instrument, fundamentals, sector_regimes)
        assert result is not None
        self.assertEqual(result["macro"]["market_phase"], "trending_up")
        self.assertEqual(result["sector"]["sector"], "Semiconductors")
        self.assertEqual(result["sector"]["regime"], "momentum")

    def test_stock_market_regime_uses_fundamentals_sector_fallback(self) -> None:
        instrument = {"ticker": "CRWD"}
        fundamentals = {"sector": "Software"}
        sector_regimes = {
            "software": {
                "sector": "Software",
                "regime": "expanding",
                "conviction": "med",
                "narrative": "Enterprise spend is holding up.",
                "invalidators": ["Budget cuts"],
                "leadership_stocks": ["CRWD", "MSFT"],
            }
        }

        result = _stock_market_regime(instrument, fundamentals, sector_regimes)
        assert result is not None
        self.assertEqual(result["sector"]["sector"], "Software")
        self.assertEqual(result["sector"]["leadership_stocks"], ["CRWD", "MSFT"])

    def test_normalize_catalyst_cards_uses_upcoming_earnings_date(self) -> None:
        cards = [
            {
                "event": "Earnings Apr 22 AMC",
                "detail": "The model should not invent this date.",
                "window": "Apr 22",
                "expected_impact": 1,
                "priced_in": "med",
            }
        ]
        out = _normalize_catalyst_cards(
            cards,
            earnings={"status": "upcoming", "event_date": "2026-07-20"},
        )
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["window"], "2026-07-20")
        self.assertEqual(out[0]["event"], "Earnings Jul 20")

    def test_normalize_catalyst_cards_strips_reported_earnings_date(self) -> None:
        cards = [
            {
                "event": "Earnings Apr 22 AMC",
                "detail": "Reported print from Apr 22 should not look upcoming.",
                "window": "Apr 22",
                "expected_impact": 1,
                "priced_in": "med",
            }
        ]
        out = _normalize_catalyst_cards(
            cards,
            earnings={"status": "reported", "event_date": "2026-04-22"},
        )
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["window"], "post-earnings")
        self.assertEqual(out[0]["event"], "Earnings setup")
        self.assertNotIn("Apr 22", out[0]["event"])
        self.assertNotIn("Apr 22", out[0]["window"])

    def test_no_news_doc_matches_current_ui_contract(self) -> None:
        class Store:
            def get_stock_intelligence_doc(self, _market: str, _universe: str, _instrument_id: str) -> dict | None:
                return {"directive_v2": {"action": {"label": "Hold here"}}}

            def get_daily_anomaly_ticker_docs_batch(self, _market: str, _tickers: list[str]) -> dict:
                return {
                    "US__RDDT": {
                        "date": "2026-07-01",
                        "anomaly": {
                            "direction": "up",
                            "day_change_pct": 13.9,
                            "move_explanation": {
                                "headline": "Reddit beats earnings",
                                "why_it_matters": "Guidance improved.",
                                "confidence": "high",
                            },
                        },
                    }
                }

        with patch(
            "backend.stock_intelligence.generate_no_news_brief",
            return_value={
                "headline": "Reddit holds gains",
                "body": "The setup remains constructive.",
                "thesis": "Constructive setup",
                "setup_state": "trend",
                "drivers": [{"label": "Growth", "detail": "Revenue growth is strong.", "direction": "up"}],
                "catalyst_cards": [],
                "risk_cards": [{"risk": "Execution", "detail": "Execution risk remains."}],
                "directive": {"text": "Hold here", "stance": "hold"},
            },
        ):
            doc = build_no_news_intelligence_doc(
                instrument={"instrument_id": "US_RDDT", "ticker": "RDDT", "name": "Reddit Inc"},
                market="US",
                universe_id="us_core_100",
                latest_price_doc={"quote": {"current": 197.76, "day_change_pct": 13.9}},
                technical_doc=None,
                intel_pro_doc=None,
                store=Store(),
            )

        self.assertIsNotNone(doc)
        assert doc is not None
        self.assertIn("directive_v2", doc)
        self.assertEqual(doc["visual_cards"], doc["visual_summary"])
        self.assertEqual(doc["anomaly_digest"]["headline"], "Reddit beats earnings")
        self.assertEqual(doc["anomaly_digest"]["why_it_matters"], "Guidance improved.")


if __name__ == "__main__":
    unittest.main()
