from __future__ import annotations

import os

from backend.radar_intelligence import Citation, RadarEvent, StockState
from backend.scripts.materialize_radar_views import (
    build_user_view,
    event_document,
    event_direction,
    materialize_radar_views,
    official_evidence_to_raw,
    row_evidence,
    synthesize_narrative,
)
from unittest.mock import patch
import json
from pathlib import Path
from dataclasses import replace

import pytest

NOW = "2026-07-10T12:00:00+00:00"


def _event(ticker: str = "AAPL") -> RadarEvent:
    return RadarEvent(
        event_id=f"evt_{ticker}",
        ticker=ticker,
        kind="rsi_oversold_cross",
        occurred_at=NOW,
        materiality=70,
        confidence=90,
        novelty=80,
        payload={"current_rsi": 31.0},
        citations=(
            Citation(
                source="Daily price history",
                title=f"{ticker} RSI",
                url="",
                occurred_at=NOW,
            ),
        ),
        what_changed=f"{ticker}'s 14-day RSI fell to 31.",
        why_it_matters="Selling has become unusually one-sided.",
        next_trigger="Watch for RSI to move back above 35.",
        evidence_refs=(f"evidence_{ticker}",),
    )


def test_existing_watchlist_row_becomes_transition_evidence() -> None:
    evidence = row_evidence(
        {
            "ticker": "AAPL",
            "technicals": {"rsi_14": {"value": 31.2}},
            "facts": {"analyst": {"label": "Buy", "target_price": 240}},
        },
        NOW,
    )
    assert [row["kind"] for row in evidence] == ["rsi", "analyst_rating", "analyst_target"]
    assert all(row["ticker"] == "AAPL" for row in evidence)


def test_official_sec_evidence_maps_to_filing_transition() -> None:
    raw = official_evidence_to_raw(
        {
            "evidence_id": "ev_sec",
            "instrument_ids": ["US_AAPL"],
            "document_kind": "filing",
            "published_at": NOW,
            "provider": "sec_edgar",
            "title": "AAPL filed an 8-K",
            "url": "https://www.sec.gov/aapl",
            "facts": {"accession_number": "001", "form": "8-K", "items": "2.02"},
            "citation": {"publisher": "SEC EDGAR"},
            "extraction_confidence": 1,
        },
        "US_AAPL",
    )
    assert raw is not None
    assert raw["kind"] == "filing"
    assert raw["payload"]["filing_type"] == "8-K"


def test_user_view_caps_attention_and_keeps_evidence() -> None:
    events = [_event("AAPL"), _event("MSFT"), _event("GOOG"), _event("AMZN")]
    rows = [
        {
            "instrument_id": f"US_{ticker}",
            "ticker": ticker,
            "instrument_name": ticker,
            "position_type": "holding",
            "holding": {"portfolio_weight_pct": 25},
        }
        for ticker in ("AAPL", "MSFT", "GOOG", "AMZN")
    ]
    view, inbox = build_user_view(
        {"uid": "user-1"},
        {"rows": rows, "source_version": 3, "built_at": NOW},
        events,
        [StockState(ticker=ticker, as_of=NOW) for ticker in ("AAPL", "MSFT", "GOOG", "AMZN")],
        NOW,
        shadow_mode=True,
    )
    assert len(view["attention_items"]) == 3
    assert len(inbox) == 3
    assert view["quality"]["passed"] is True
    assert all(item["citations"] for item in view["attention_items"])
    assert view["shadow_mode"] is True


def test_event_document_preserves_dedupe_and_evidence_refs() -> None:
    document = event_document(_event(), NOW)
    assert document["event_id"] == document["dedupe_key"]
    assert document["instrument_id"] == "US_AAPL"
    assert document["evidence_refs"] == ["evidence_AAPL"]


def test_event_direction_uses_event_payload() -> None:
    raised_target = replace(
        _event(), kind="analyst_target_revision", payload={"change_pct": 12.0}
    )
    miss = replace(_event(), kind="earnings_results", payload={"result_label": "miss"})
    overbought = replace(
        _event(), kind="rsi_overbought_cross", payload={"current_rsi": 73}
    )
    assert event_direction(raised_target) == "positive"
    assert event_direction(miss) == "negative"
    assert event_direction(overbought) == "negative"


def test_llm_narrative_falls_back_when_copy_recommends_trading() -> None:
    response = {
        "choices": [
            {
                "message": {
                    "content": '{"headline":"Buy AAPL now","body":"This is a game-changer."}'
                }
            }
        ]
    }
    fallback = {"headline": "1 change needs attention", "body": "AAPL changed."}
    with patch("backend.llm_client.post_chat_completion", return_value=response):
        narrative, status = synthesize_narrative(
            [{"ticker": "AAPL", "headline": "RSI changed", "what_changed": "RSI fell to 31."}],
            fallback,
        )
    assert narrative == fallback
    assert status == "fallback"


def test_llm_narrative_accepts_short_fact_only_copy() -> None:
    response = {
        "choices": [
            {
                "message": {
                    "content": '{"headline":"AAPL needs a closer look","body":"Its RSI crossed into oversold territory today."}'
                }
            }
        ]
    }
    fallback = {"headline": "1 change needs attention", "body": "AAPL changed."}
    with patch.dict(os.environ, {}, clear=True), patch(
        "backend.llm_client.post_chat_completion", return_value=response
    ) as post:
        narrative, status = synthesize_narrative(
            [{"ticker": "AAPL", "headline": "RSI changed", "what_changed": "RSI crossed into oversold territory."}],
            fallback,
        )
    assert narrative["headline"] == "AAPL needs a closer look"
    assert status == "generated"
    assert post.call_args.kwargs["model"] == "gpt-5.6-luna"


def test_materialized_contracts_match_json_schemas() -> None:
    jsonschema = pytest.importorskip("jsonschema")
    schema_dir = Path(__file__).parents[1] / "config" / "schemas"
    event = _event()
    event_payload = event_document(event, NOW)
    state_payload = {
        "instrument_id": "US_AAPL",
        **StockState(ticker="AAPL", as_of=NOW).to_dict(),
    }
    view, _ = build_user_view(
        {"uid": "user-1"},
        {
            "rows": [
                {
                    "instrument_id": "US_AAPL",
                    "ticker": "AAPL",
                    "instrument_name": "Apple",
                    "position_type": "holding",
                    "holding": {"portfolio_weight_pct": 100},
                }
            ],
            "source_version": 3,
            "built_at": NOW,
        },
        [event],
        [StockState(ticker="AAPL", as_of=NOW)],
        NOW,
        shadow_mode=True,
    )
    for filename, payload in (
        ("radar_event.schema.json", event_payload),
        ("radar_stock_state.schema.json", state_payload),
        ("radar_user_view.schema.json", view),
    ):
        schema = json.loads((schema_dir / filename).read_text(encoding="utf-8"))
        jsonschema.validate(payload, schema)


def test_materializer_isolates_one_bad_instrument() -> None:
    class Store:
        def list_subscribed_users(self):
            return [{"uid": "user-1", "tracked_stocks": ["US_BAD", "US_GOOD"]}]

        def get_watchlist_view(self, _uid):
            return {
                "rows": [
                    {"instrument_id": "US_BAD", "ticker": "BAD", "position_type": "watchlist"},
                    {"instrument_id": "US_GOOD", "ticker": "GOOD", "position_type": "watchlist"},
                ],
                "source_version": 1,
                "built_at": NOW,
            }

        def get_radar_stock_states(self, _ids):
            return {}

        def list_radar_evidence(self, _ids, limit=500):
            return []

        def list_radar_events(self, _ids, limit=200):
            return []

    from backend.radar_intelligence import process_evidence as real_process

    def isolated(previous, evidence, ticker, as_of):
        if ticker == "BAD":
            raise ValueError("bad upstream payload")
        return real_process(previous, evidence, ticker, as_of)

    with patch(
        "backend.scripts.materialize_radar_views.process_evidence",
        side_effect=isolated,
    ):
        result = materialize_radar_views(Store(), as_of=NOW)
    assert result["stocks_processed"] == 1
    assert result["views_built"] == 1
    assert result["error_count"] == 1
    assert result["errors"][0]["id"] == "US_BAD"
