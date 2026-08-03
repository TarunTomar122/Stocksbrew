from dataclasses import dataclass

from backend.storage import (
    TraceMoneyStore,
    _firestore_write_batches,
    _latest_price_write_payload,
    _stock_facts_write_payload,
)


@dataclass
class _Ref:
    path: str


def test_firestore_batches_respect_payload_bytes_not_only_write_count() -> None:
    writes = [
        (_Ref(f"tm_latest_prices/{index}"), {"history_window": ["x" * 900]})
        for index in range(10)
    ]
    batches = _firestore_write_batches(
        writes,
        max_operations=400,
        max_payload_bytes=4_000,
    )

    assert len(batches) > 1
    assert sum(len(batch) for batch in batches) == 10
    assert all(len(batch) < 10 for batch in batches)


def _point(day: str, phase: str, price: float) -> dict:
    return {
        "instrument_id": "US_AAPL",
        "captured_at": f"{day}T15:00:00+00:00",
        "session_phase": phase,
        "quote": {"current": price},
    }


def test_intraday_merge_does_not_rewrite_the_rolling_history_array() -> None:
    existing = {
        "history_window": [_point("2026-07-30", "open_check", 200.0)],
        "history_window_size": 1,
    }
    payload = _latest_price_write_payload(
        existing,
        _point("2026-07-30", "mid_check", 202.0),
        updated_at="2026-07-30T16:00:00+00:00",
        history_limit=300,
    )

    assert payload["quote"]["current"] == 202.0
    assert "history_window" not in payload
    assert "history_window_size" not in payload


def test_post_close_replaces_the_current_day_history_point() -> None:
    existing = {
        "history_window": [
            _point("2026-07-29", "post_close", 198.0),
            _point("2026-07-30", "open_check", 200.0),
        ],
        "history_window_size": 2,
    }
    payload = _latest_price_write_payload(
        existing,
        _point("2026-07-30", "post_close", 205.0),
        updated_at="2026-07-30T20:10:00+00:00",
        history_limit=300,
    )

    assert len(payload["history_window"]) == 2
    assert payload["history_window"][-1]["quote"]["current"] == 205.0
    assert payload["history_window"][-1]["session_phase"] == "post_close"


def test_first_quote_of_new_day_appends_history() -> None:
    existing = {
        "history_window": [_point("2026-07-29", "post_close", 198.0)],
        "history_window_size": 1,
    }
    payload = _latest_price_write_payload(
        existing,
        _point("2026-07-30", "open_check", 200.0),
        updated_at="2026-07-30T13:31:00+00:00",
        history_limit=300,
    )

    assert len(payload["history_window"]) == 2
    assert payload["history_window_size"] == 2


def test_empty_financial_depth_sections_are_omitted_from_merge_writes() -> None:
    payload = _stock_facts_write_payload(
        {
            "instrument_id": "US_AAPL",
            "financials": {"source": "stockanalysis", "fiscal_year": "TTM"},
            "financial_history": [{"period": "TTM", "revenue": None}],
            "balance": {},
            "valuation": {"forward_pe": None},
            "quality": {"roic_pct": None},
            "business_segments": None,
            "source_status": {"errors": ["stockanalysis: temporary failure"]},
        },
        updated_at="2026-08-03T00:00:00+00:00",
    )

    assert payload["instrument_id"] == "US_AAPL"
    assert payload["source_status"]["errors"]
    assert payload["updated_at"] == "2026-08-03T00:00:00+00:00"
    assert "financial_history" not in payload
    assert "balance" not in payload
    assert "valuation" not in payload
    assert "quality" not in payload
    assert "business_segments" not in payload
    assert "financial_depth_updated_at" not in payload


def test_successful_financial_depth_sections_replace_old_values() -> None:
    payload = _stock_facts_write_payload(
        {
            "instrument_id": "US_AAPL",
            "financial_history": [{"period": "TTM", "revenue": 100}],
            "valuation": {"forward_pe": 24.5},
        },
        updated_at="2026-08-03T00:00:00+00:00",
    )

    assert payload["financial_history"][0]["revenue"] == 100
    assert payload["valuation"]["forward_pe"] == 24.5
    assert payload["financial_depth_updated_at"] == "2026-08-03T00:00:00+00:00"


class _HistoryDocument:
    def __init__(self, sink: dict) -> None:
        self.sink = sink

    def collection(self, _name: str) -> "_HistoryCollection":
        return _HistoryCollection(self.sink)

    def set(self, payload: dict, *, merge: bool = False) -> None:
        self.sink.update({"payload": payload, "merge": merge})


class _HistoryCollection:
    def __init__(self, sink: dict) -> None:
        self.sink = sink

    def document(self, _document_id: str) -> _HistoryDocument:
        return _HistoryDocument(self.sink)


class _HistoryDatabase:
    def __init__(self, sink: dict) -> None:
        self.sink = sink

    def collection(self, _name: str) -> _HistoryCollection:
        return _HistoryCollection(self.sink)


def test_directive_history_uses_directive_v2_action_and_zones() -> None:
    saved: dict = {}
    store = object.__new__(TraceMoneyStore)
    store.db = _HistoryDatabase(saved)

    store.append_directive_history(
        "US",
        [{
            "instrument_id": "US_AAPL",
            "current_price": 200.0,
            "generated_at": "2026-08-01T14:00:00+00:00",
            "directive_v2": {
                "version": "v2-shadow-1",
                "stance": "accumulate",
                "confidence": "high",
                "action": {"label": "Accumulate now", "summary": "The setup remains constructive."},
                "zones": {"accumulate_below": 194.0, "trim_above": 225.0},
            },
        }],
    )

    assert saved["merge"] is True
    assert saved["payload"]["text"] == "Accumulate now"
    assert saved["payload"]["trigger_type"] == "price_below"
    assert saved["payload"]["trigger_value"] == 194.0
    assert saved["payload"]["directive_version"] == "v2-shadow-1"
