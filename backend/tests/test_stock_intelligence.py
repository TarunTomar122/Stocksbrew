from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend.models import Article
from backend.stock_intelligence import (
    _expand_card_detail,
    _fundamental_driver_cards,
    _fundamental_risk_cards,
    _looks_like_metric_shorthand,
    _normalize_driver_cards,
    _normalize_risk_cards,
    _normalize_catalyst_cards,
    _stock_market_regime,
    _summarize_price_context,
    build_no_news_intelligence_doc,
    build_stock_intelligence_docs,
    generate_no_news_brief,
)


class StockIntelligenceTest(unittest.TestCase):
    def test_no_news_brief_retries_malformed_model_output(self) -> None:
        valid_brief = {
            "headline": "SNAP holds its current setup",
            "body": "The stock is quiet without a fresh company catalyst. Watch whether the current trend holds.",
            "key_findings": ["No fresh company news is driving the move."],
            "catalyst": "A new company update",
            "risk": "Momentum can fade without a catalyst.",
            "thesis": "Quiet trading keeps the setup unchanged",
            "setup_state": "unclear",
            "drivers": [],
            "catalyst_cards": [],
            "risk_cards": [],
        }
        invalid = {"choices": [{"message": {"content": ""}}]}
        valid = {"choices": [{"message": {"content": json.dumps(valid_brief)}}]}

        with patch("backend.stock_intelligence.llm_api_key", return_value="test-key"), patch(
            "backend.stock_intelligence.stock_brief_model", return_value="test-model"
        ), patch(
            "backend.stock_intelligence.post_chat_completion",
            side_effect=[invalid, invalid, invalid, valid],
        ) as completion:
            result = generate_no_news_brief(
                {"instrument_id": "US_SNAP", "ticker": "SNAP", "name": "Snap Inc."},
                {"quote": {"current": 9.5, "day_change_pct": 0.2, "volume": 1_000}},
                None,
                None,
            )

        self.assertEqual(result, valid_brief)
        self.assertEqual(completion.call_count, 4)

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
                    "priced_in": "med",
                }
            ],
            "risk_cards": [
                {
                    "risk": "Valuation is stretched.",
                    "detail": "Crowded positioning raises downside if follow-through fades.",
                    "trigger": "multiple compression",
                    "severity": 3,
                }
            ],
        }

        with patch("backend.stock_intelligence._llm_synthesize_brief", return_value=llm_brief), patch(
            "backend.stock_intelligence._load_earnings_by_instrument",
            return_value={"US_ABC": {"status": "reported", "event_date": "2026-04-22"}},
        ):
            docs_payload = build_stock_intelligence_docs("US", "us_test_1", instruments, articles, store=Store())

        self.assertEqual(len(docs_payload), 1)
        self.assertEqual(docs_payload[0]["source"], "llm")
        self.assertEqual(docs_payload[0]["coverage_type"], "on_demand_news")
        self.assertNotIn("Apr 22", docs_payload[0]["catalyst"])
        self.assertNotIn("Apr 22", docs_payload[0]["body"])
        cards = docs_payload[0]["visual_cards"]["catalyst_cards"]
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["window"], "post-earnings")
        self.assertEqual(cards[0]["event"], "Earnings setup")
        self.assertEqual(docs_payload[0]["visual_summary"]["catalyst_cards"], cards)

    def test_build_stock_intelligence_docs_persists_directive_v2_only(self) -> None:
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

        self.assertNotIn("directive", docs_payload[0])
        directive_v2 = docs_payload[0]["directive_v2"]
        self.assertIsInstance(directive_v2, dict)
        self.assertTrue(directive_v2["action"]["label"])
        self.assertIsInstance(directive_v2["zones"], dict)

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
        event_date = (datetime.now(timezone.utc).date() + timedelta(days=5)).isoformat()
        event_label = datetime.fromisoformat(event_date).strftime("%b %d")
        cards = [
            {
                "event": "Earnings Apr 22 AMC",
                "detail": "The model should not invent this date.",
                "window": "Apr 22",
                "priced_in": "med",
            }
        ]
        out = _normalize_catalyst_cards(
            cards,
            earnings={"status": "upcoming", "event_date": event_date},
        )
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["window"], event_date)
        self.assertEqual(out[0]["event"], f"Earnings {event_label}")

    def test_normalize_catalyst_cards_strips_reported_earnings_date(self) -> None:
        cards = [
            {
                "event": "Earnings Apr 22 AMC",
                "detail": "Reported print from Apr 22 should not look upcoming.",
                "window": "Apr 22",
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

    def test_normalize_catalyst_cards_drops_ungrounded_earnings_date(self) -> None:
        cards = [
            {
                "event": "Earnings setup",
                "detail": "Earnings report on April 30th could reset sentiment.",
                "window": "near-term",
                "priced_in": "med",
            }
        ]
        out = _normalize_catalyst_cards(cards, earnings=None)
        self.assertEqual(out, [])

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

    def test_metric_shorthand_detection(self) -> None:
        self.assertTrue(_looks_like_metric_shorthand("2 - Buy signal (2.0)."))
        self.assertTrue(_looks_like_metric_shorthand("3.5% - moderate short interest"))
        self.assertFalse(
            _looks_like_metric_shorthand(
                "Quant models rate this a Buy, supporting constructive momentum in the setup."
            )
        )

    def test_fundamental_driver_cards_use_full_sentences(self) -> None:
        cards = _fundamental_driver_cards(
            {
                "standout_metrics": [
                    {"label": "Quant rank", "value": 2, "summary": "2 - Buy signal"},
                    {"label": "Short float", "value": 3.49, "summary": "3.5% - moderate short interest"},
                ]
            },
            limit=2,
        )
        self.assertEqual(len(cards), 2)
        self.assertNotIn(" - ", cards[0]["detail"])
        self.assertIn("Buy", cards[0]["detail"])
        self.assertIn("short interest", cards[1]["detail"].lower())

    def test_normalize_driver_cards_rewrites_shorthand(self) -> None:
        out = _normalize_driver_cards(
            [{"label": "Momentum", "detail": "2 - Buy signal (2.0).", "direction": "up"}],
            [],
            limit=1,
        )
        self.assertEqual(len(out), 1)
        self.assertGreaterEqual(len(out[0]["detail"].split()), 8)
        self.assertNotRegex(out[0]["detail"], r"^\d+\s*-\s*")

    def test_normalize_risk_cards_rejects_shorthand_without_expansion(self) -> None:
        out = _normalize_risk_cards(
            [{"risk": "Valuation", "detail": "28.5 - weak", "severity": 4}],
            limit=1,
        )
        self.assertEqual(len(out), 1)
        self.assertGreaterEqual(len(out[0]["detail"].split()), 8)

    def test_fundamental_risk_cards_use_full_sentences(self) -> None:
        cards = _fundamental_risk_cards(
            {
                "weak_metrics": [
                    {"label": "PEG", "value": 3.2, "summary": "Pricing in heavy growth (3.20)"},
                ]
            },
            limit=1,
        )
        self.assertEqual(len(cards), 1)
        self.assertIn("PEG", cards[0]["detail"])
        self.assertGreaterEqual(len(cards[0]["detail"].split()), 8)


if __name__ == "__main__":
    unittest.main()
