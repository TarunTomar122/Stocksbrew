from datetime import datetime, timezone

import pytest

from backend.price_pipeline_contract import (
    PriceFreshnessPolicy,
    is_current_market_timestamp,
    partition_fresh_price_documents,
    require_price_batch_coverage,
)


NOW = datetime(2026, 7, 30, 14, 0, tzinfo=timezone.utc)


def test_same_phase_document_from_yesterday_is_not_fresh() -> None:
    fresh, stale = partition_fresh_price_documents(
        {
            "US_FRESH": {
                "session_phase": "open_check",
                "captured_at": "2026-07-30T13:30:00+00:00",
                "updated_at": "2026-07-30T13:31:00+00:00",
            },
            "US_STALE": {
                "session_phase": "open_check",
                "captured_at": "2026-07-29T13:30:00+00:00",
                "updated_at": "2026-07-29T13:31:00+00:00",
            },
        },
        ["US_FRESH", "US_STALE"],
        policy=PriceFreshnessPolicy(
            required_phase="open_check",
            max_age_hours=3,
            market="US",
        ),
        now=NOW,
    )

    assert list(fresh) == ["US_FRESH"]
    assert stale == ["US_STALE"]


def test_later_same_day_phase_satisfies_open_requirement() -> None:
    fresh, stale = partition_fresh_price_documents(
        {
            "US_NEWER": {
                "session_phase": "mid_check",
                "captured_at": "2026-07-30T15:00:00+00:00",
                "updated_at": "2026-07-30T15:01:00+00:00",
            }
        },
        ["US_NEWER"],
        policy=PriceFreshnessPolicy(
            required_phase="open_check",
            max_age_hours=3,
            market="US",
        ),
        now=datetime(2026, 7, 30, 15, 15, tzinfo=timezone.utc),
    )

    assert list(fresh) == ["US_NEWER"]
    assert stale == []


def test_earlier_phase_does_not_satisfy_open_requirement() -> None:
    fresh, stale = partition_fresh_price_documents(
        {
            "US_EARLY": {
                "session_phase": "pre_open",
                "captured_at": "2026-07-30T12:00:00+00:00",
                "updated_at": "2026-07-30T12:01:00+00:00",
            }
        },
        ["US_EARLY"],
        policy=PriceFreshnessPolicy(
            required_phase="open_check",
            max_age_hours=3,
            market="US",
        ),
        now=NOW,
    )

    assert fresh == {}
    assert stale == ["US_EARLY"]


def test_yahoo_midnight_utc_daily_bar_is_the_market_date_label() -> None:
    fresh, stale = partition_fresh_price_documents(
        {
            "US_DAILY": {
                "session_phase": "post_close",
                "captured_at": "2026-07-30T00:00:00+00:00",
                "updated_at": "2026-07-30T20:11:00+00:00",
            }
        },
        ["US_DAILY"],
        policy=PriceFreshnessPolicy(
            required_phase="post_close",
            max_age_hours=3,
            market="US",
        ),
        now=datetime(2026, 7, 30, 21, 0, tzinfo=timezone.utc),
    )

    assert list(fresh) == ["US_DAILY"]
    assert stale == []


def test_intraday_timestamp_after_midnight_utc_uses_market_timezone() -> None:
    assert is_current_market_timestamp(
        "2026-07-31T03:00:00+00:00",
        market="US",
        now=datetime(2026, 7, 31, 3, 15, tzinfo=timezone.utc),
    )


def test_prior_daily_bar_label_is_rejected_after_midnight_utc() -> None:
    assert not is_current_market_timestamp(
        "2026-07-29T00:00:00+00:00",
        market="US",
        now=datetime(2026, 7, 31, 3, 15, tzinfo=timezone.utc),
    )


def test_price_batch_coverage_rejects_a_successful_but_empty_provider_run() -> None:
    with pytest.raises(RuntimeError, match="0.0%.*98%"):
        require_price_batch_coverage(
            {"input_count": 573, "saved_count": 0},
            minimum_coverage=0.98,
            context="US open price batch",
        )


def test_price_batch_coverage_accepts_measured_production_shape() -> None:
    coverage = require_price_batch_coverage(
        {"input_count": 573, "saved_count": 569},
        minimum_coverage=0.98,
        context="US open price batch",
    )

    assert coverage == pytest.approx(569 / 573)
