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

    def save_stage_watermark(self, **_kwargs):
        return None


class DailyAnomalyReasoningTest(unittest.TestCase):
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
            reasons, "_source_items_by_ticker", return_value={"ABC": []}
        ), patch.object(reasons, "_research_row", return_value=explanation), patch.object(
            reasons, "_write_ticker_read_models"
        ), patch.object(reasons, "trigger_web_revalidate", return_value=True):
            reasons.main()

        row = state["payload"]["anomalies"][0]
        self.assertEqual(row["price"], 100.0)
        self.assertEqual(row["price_as_of"], "2026-07-28T20:10:00+00:00")
        self.assertEqual(row["move_explanation"], explanation)
        self.assertEqual(row["narrative_status"], "verified")
