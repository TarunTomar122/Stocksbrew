from backend.price_history import latest_price_history


def test_latest_quote_overlays_same_provider_day_without_recursive_history() -> None:
    rows = latest_price_history(
        {
            "instrument_id": "US_AAPL",
            "captured_at": "2026-07-30T18:00:00+00:00",
            "updated_at": "2026-07-30T18:00:05+00:00",
            "quote": {"current": 210.0},
            "history_window_size": 2,
            "history_window": [
                {
                    "captured_at": "2026-07-29T20:00:00+00:00",
                    "quote": {"current": 198.0},
                },
                {
                    "captured_at": "2026-07-30T13:30:00+00:00",
                    "quote": {"current": 200.0},
                },
            ],
        }
    )

    assert [row["quote"]["current"] for row in rows] == [198.0, 210.0]
    assert "history_window" not in rows[-1]
    assert "updated_at" not in rows[-1]


def test_history_overlay_uses_provider_date_not_document_write_date() -> None:
    rows = latest_price_history(
        {
            "captured_at": "2026-07-29T20:00:00+00:00",
            "updated_at": "2026-07-30T13:00:00+00:00",
            "quote": {"current": 101.0},
            "history_window": [
                {
                    "captured_at": "2026-07-29T13:30:00+00:00",
                    "quote": {"current": 100.0},
                }
            ],
        }
    )

    assert len(rows) == 1
    assert rows[0]["captured_at"] == "2026-07-29T20:00:00+00:00"
    assert rows[0]["quote"]["current"] == 101.0


def test_stale_top_level_quote_does_not_overwrite_newer_history() -> None:
    rows = latest_price_history(
        {
            "captured_at": "2026-07-17T00:00:00+00:00",
            "updated_at": "2026-07-30T20:10:00+00:00",
            "quote": {"current": 81.45},
            "history_window": [
                {
                    "captured_at": "2026-07-17T00:00:00+00:00",
                    "quote": {"current": 80.0},
                },
                {
                    "captured_at": "2026-07-30T00:00:00+00:00",
                    "quote": {"current": 54.3},
                },
            ],
        }
    )

    assert [row["quote"]["current"] for row in rows] == [80.0, 54.3]
