from datetime import datetime, timezone

from backend.scripts.audit_data_health import _open_session_item


def test_open_session_health_fails_closed_when_publish_stages_are_missing() -> None:
    item = _open_session_item(
        market="US",
        data={
            "stages": {
                "price": {"status": "success"},
            }
        },
        now=datetime(2026, 7, 31, 14, 45, tzinfo=timezone.utc),
    )

    assert item["due"] is True
    assert item["status"] == "stale"
    assert item["missing_stages"] == ["briefs", "anomalies"]


def test_open_session_health_is_fresh_only_after_all_publish_stages_complete() -> None:
    item = _open_session_item(
        market="US",
        data={
            "stages": {
                "price": {"status": "success"},
                "briefs": {"status": "success"},
                "anomalies": {"status": "success"},
            }
        },
        now=datetime(2026, 7, 31, 14, 45, tzinfo=timezone.utc),
    )

    assert item["due"] is True
    assert item["status"] == "fresh"
    assert item["missing_stages"] == []


def test_open_session_is_not_due_on_a_market_holiday() -> None:
    # Thanksgiving 2026, 10:45 ET: the exchange is closed, so no opening chain runs and nothing is stale.
    item = _open_session_item(
        market="US",
        data=None,
        now=datetime(2026, 11, 26, 15, 45, tzinfo=timezone.utc),
    )

    assert item["due"] is False
    assert item["status"] == "fresh"
    assert item["missing_stages"] == []
