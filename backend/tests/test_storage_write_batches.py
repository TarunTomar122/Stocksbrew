from dataclasses import dataclass

from backend.storage import _firestore_write_batches, _latest_price_write_payload


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
