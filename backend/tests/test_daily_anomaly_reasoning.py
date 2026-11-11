from __future__ import annotations

from datetime import datetime, timezone
import unittest
from unittest.mock import patch

from backend.scripts import research_daily_anomaly_reasons as reasons


class _Snapshot:
    def __init__(self, state: dict):
        self._state = state
        self.exists = True

    def to_dict(self):
        return self._state["payload"]


class _FeedRef:
    def __init__(self, state: dict):
        self._state = state

    def get(self):
        return _Snapshot(self._state)

    def set(self, value):
        self._state["payload"] = value


class _Collection:
    def __init__(self, state: dict):
        self._state = state

    def document(self, _name):
        return _FeedRef(self._state)


class _Db:
    def __init__(self, state: dict):
        self._state = state

    def collection(self, _name):
        return _Collection(self._state)


class _Store:
    def __init__(self, state: dict):
        self.db = _Db(state)

    def list_instruments(self, _market, _ids):
        return [{"instrument_id": "US_ABC", "ticker": "ABC", "name": "ABC Corp"}]

    def get_stock_intelligence_docs_batch(self, _market, _universe, _ids):
        return {}

    def get_latest_prices(self, _ids):
        return {}

    def save_stage_watermark(self, **_kwargs):
        return None


class DailyAnomalyReasoningTest(unittest.TestCase):
    def test_price_context_is_provisional_but_source_backed_reason_is_final(self) -> None:
        self.assertFalse(
            reasons._is_final_explanation(
                {"narrative_status": "verified", "move_explanation": {"cause_type": "price_context"}}
            )
        )
        self.assertTrue(
            reasons._is_final_explanation(
                {"narrative_status": "verified", "move_explanation": {"cause_type": "earnings"}}
            )
        )

    def test_unresolved_price_history_never_becomes_a_causal_explanation(self) -> None:
        explanation = reasons._price_context_explanation(
            row={"ticker": "ABC", "day_change_pct": -12.8},
            instrument={"ticker": "ABC"},
            history=[
                {"captured_at": "2026-07-23T20:00:00+00:00", "quote": {"current": 100, "volume": 10}},
                {"captured_at": "2026-07-24T20:00:00+00:00", "quote": {"current": 96, "volume": 12}},
                {"captured_at": "2026-07-27T20:00:00+00:00", "quote": {"current": 91, "volume": 11}},
                {"captured_at": "2026-07-28T20:00:00+00:00", "quote": {"current": 85, "volume": 14}},
                {"captured_at": "2026-07-29T20:00:00+00:00", "quote": {"current": 74, "volume": 28}},
            ],
        )

        self.assertEqual(explanation["cause_type"], "no_verified_catalyst")
        self.assertEqual(explanation["confidence"], "low")
        self.assertEqual(explanation["headline"], "--")
        self.assertEqual(explanation["why_it_matters"], "")

    def test_fresh_items_rejects_undated_and_stale_evidence(self) -> None:
        reference = datetime(2026, 7, 28, 20, tzinfo=timezone.utc)
        rows = reasons._fresh_items(
            [
                {"date": "2026-07-28T19:00:00+00:00", "title": "Current article", "url": "https://a"},
                {"date": "2026-07-20T19:00:00+00:00", "title": "Old article", "url": "https://b"},
                {"title": "Undated page", "url": "https://c"},
            ],
            reference=reference,
        )
        self.assertEqual([row["title"] for row in rows], ["Current article"])

    def test_live_page_requires_the_actual_session_date(self) -> None:
        reference = datetime(2026, 7, 30, 14, 57, tzinfo=timezone.utc)

        self.assertEqual(
            reasons._live_page_reference_at(
                "AMD +12.6%. Last Close 483.69 Jul 30 at 11:11 AM ET.",
                reference=reference,
            ),
            reference.isoformat(),
        )
        self.assertEqual(
            reasons._live_page_reference_at(
                "AMD is moving today after an analyst note.",
                reference=reference,
            ),
            "",
        )

    def test_tape_fallback_rejects_contradictory_extends_copy(self) -> None:
        body = {
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"supported":true,"dominant_angle":"technical_break",'
                            '"headline":"ABC extends its five-session slide",'
                            '"why_it_matters":"Today rises 8% and continues that pattern.",'
                            '"confidence":"low"}'
                        )
                    }
                }
            ]
        }
        with patch.object(reasons, "llm_api_key", return_value="test"), patch.object(
            reasons,
            "post_chat_completion",
            return_value=body,
        ):
            explanation = reasons._llm_tape_explanation(
                row={"ticker": "ABC", "day_change_pct": 8.0},
                instrument={"ticker": "ABC", "name": "ABC Corp"},
                price_doc={},
                intel_doc=None,
                relative_context={},
            )
        self.assertIsNone(explanation)

    def test_unsupported_tape_response_is_normalized_to_safe_dash(self) -> None:
        body = {
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"supported":false,"dominant_angle":"quiet_move",'
                            '"headline":"ABC may be selling off on positioning",'
                            '"why_it_matters":"No catalyst was found.",'
                            '"confidence":"low"}'
                        )
                    }
                }
            ]
        }
        with patch.object(reasons, "llm_api_key", return_value="test"), patch.object(
            reasons,
            "post_chat_completion",
            return_value=body,
        ):
            explanation = reasons._llm_tape_explanation(
                row={"ticker": "ABC", "day_change_pct": -8.0},
                instrument={"ticker": "ABC", "name": "ABC Corp"},
                price_doc={},
                intel_doc=None,
                relative_context={},
            )

        self.assertEqual(explanation["cause_type"], "no_verified_catalyst")
        self.assertEqual(explanation["headline"], "--")
        self.assertEqual(explanation["why_it_matters"], "")

    def test_session_tape_ignores_sparse_fetch_history(self) -> None:
        tape = reasons._session_tape(
            {
                "session_phase": "mid_check",
                "captured_at": "2026-07-30T16:00:00+00:00",
                "quote": {
                    "current": 153.79,
                    "previous_close": 168.01,
                    "day_change_pct": -8.46,
                    "captured_at": "2026-07-30T16:00:00+00:00",
                    "volume": 100,
                },
                "history_window": [
                    {
                        "captured_at": "2026-07-01T20:00:00+00:00",
                        "quote": {"current": 129.43, "volume": 200},
                    }
                ],
            }
        )

        self.assertEqual(
            tape["sessions"],
            [
                {
                    "date": "2026-07-30",
                    "close": 153.79,
                    "change_pct": -8.46,
                    "volume": 100.0,
                }
            ],
        )
        self.assertIsNone(tape["recent_close_low"])
        self.assertFalse(tape["volume_context"]["comparison_available"])

    def test_session_tape_uses_provider_daily_sessions_and_exact_today_move(self) -> None:
        tape = reasons._session_tape(
            {
                "session_phase": "post_close",
                "captured_at": "2026-07-30T20:10:00+00:00",
                "quote": {
                    "current": 93.0,
                    "previous_close": 100.0,
                    "day_change_pct": -7.0,
                    "captured_at": "2026-07-30T20:10:00+00:00",
                    "volume": 150,
                },
                "recent_sessions": [
                    {"date": "2026-07-28", "close": 98.0, "change_pct": -2.0, "volume": 100},
                    {"date": "2026-07-29", "close": 100.0, "change_pct": 2.04, "volume": 100},
                    {"date": "2026-07-30", "close": 92.5, "change_pct": -7.5, "volume": 120},
                ],
            }
        )

        self.assertEqual(tape["sessions"][-1]["close"], 93.0)
        self.assertEqual(tape["sessions"][-1]["change_pct"], -7.0)
        self.assertEqual(tape["recent_close_low"], 98.0)
        self.assertEqual(tape["recent_close_high"], 100.0)
        self.assertTrue(tape["breaks_below_recent_close_range"])
        self.assertFalse(tape["breaks_above_recent_close_range"])
        self.assertTrue(tape["today_opposes_prior_window"])
        self.assertTrue(tape["volume_context"]["comparison_available"])
        self.assertEqual(tape["volume_context"]["vs_recent_average_pct"], 50.0)

    def test_reasoner_updates_only_the_existing_price_snapshot(self) -> None:
        state = {
            "payload": {
                "market": "US",
                "generated_at": "2026-07-28T20:10:00+00:00",
                "price_session_phase": "post_close",
                "anomalies": [
                    {
                        "instrument_id": "US_ABC",
                        "ticker": "ABC",
                        "price": 100.0,
                        "price_as_of": "2026-07-28T20:10:00+00:00",
                        "day_change_pct": 7.5,
                        "direction": "up",
                        "narrative_status": "unverified",
                    }
                ],
            }
        }
        argv = [
            "research_daily_anomaly_reasons",
            "--market",
            "US",
            "--universe",
            "us_core_100",
            "--expected-price-session-phase",
            "post_close",
        ]
        explanation = {
            "headline": "ABC signs major customer",
            "why_it_matters": "A material contract gives investors a current reason for the move.",
            "confidence": "high",
        }
        with patch("sys.argv", argv), patch.object(reasons, "TraceMoneyStore", return_value=_Store(state)), patch.object(
            reasons,
            "_source_items_by_ticker",
            return_value={
                "ABC": [
                    {
                        "date": "2026-07-28T19:00:00+00:00",
                        "title": "ABC signs major customer",
                        "url": "https://example.com/abc",
                    }
                ]
            },
        ), patch.object(reasons, "_research_row", return_value=explanation), patch.object(
            reasons, "_write_ticker_read_models"
        ), patch.object(reasons, "trigger_web_revalidate", return_value=True), patch.object(
            reasons, "notify_indexnow_families", return_value=True
        ) as indexnow_families:
            reasons.main()

        # The evening run tells IndexNow about the stock pages rebuilt that day.
        indexnow_families.assert_called_once()
        self.assertEqual(indexnow_families.call_args.args[0], ["stocks"])
        self.assertEqual(indexnow_families.call_args.kwargs["changed_since"], "2026-07-28")

        row = state["payload"]["anomalies"][0]
        self.assertEqual(row["price"], 100.0)
        self.assertEqual(row["price_as_of"], "2026-07-28T20:10:00+00:00")
        self.assertEqual(row["move_explanation"]["headline"], explanation["headline"])
        self.assertEqual(row["move_explanation"]["why_it_matters"], explanation["why_it_matters"])
        self.assertEqual(row["narrative_status"], "verified")
