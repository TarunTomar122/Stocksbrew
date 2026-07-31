"""Shared correctness checks for market-price pipeline stages.

Price documents are mutable "latest" records. A matching ``session_phase`` is
therefore not proof that a document belongs to the current run: when a provider
misses one symbol, yesterday's record remains in Firestore with the same phase.
Every downstream publisher must validate both phase and write age.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo


MARKET_TIMEZONES = {
    "US": ZoneInfo("America/New_York"),
    "IN": ZoneInfo("Asia/Kolkata"),
}


@dataclass(frozen=True)
class PriceFreshnessPolicy:
    required_phase: str
    max_age_hours: float
    market: str | None = None
    future_tolerance_hours: float = 0.25

    def __post_init__(self) -> None:
        if not self.required_phase.strip():
            raise ValueError("required_phase must not be empty")
        if self.max_age_hours <= 0:
            raise ValueError("max_age_hours must be positive")
        if self.future_tolerance_hours < 0:
            raise ValueError("future_tolerance_hours must not be negative")
        if self.market is not None and self.market.upper() not in MARKET_TIMEZONES:
            raise ValueError(f"unsupported market: {self.market}")


def _parse_utc(value: object) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def is_current_market_timestamp(
    value: object,
    *,
    market: str,
    now: datetime | None = None,
) -> bool:
    """Whether a provider timestamp is labelled for today's market session.

    Yahoo daily bars encode the trading date as midnight UTC. That value is a
    date label, not an instant to convert into New York time; timezone
    conversion would incorrectly turn a valid ``2026-07-30T00:00Z`` daily bar
    into July 29. Non-midnight values are real instants and must be converted
    to the exchange timezone. This matters for US after-hours and futures
    observations after midnight UTC, which still belong to the prior New York
    market date.
    """
    raw = str(value or "").strip()
    parsed = _parse_utc(raw)
    if len(raw) < 10 or parsed is None:
        return False
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    zone = MARKET_TIMEZONES.get(market.upper())
    if zone is None:
        raise ValueError(f"unsupported market: {market}")
    market_date = current.astimezone(zone).date()
    if parsed.time() == datetime.min.time():
        provider_date = parsed.date()
    else:
        provider_date = parsed.astimezone(zone).date()
    return provider_date == market_date


def price_freshness_error(
    document: Mapping[str, Any] | None,
    *,
    policy: PriceFreshnessPolicy,
    now: datetime | None = None,
) -> str | None:
    """Return a concrete rejection reason, or ``None`` for a fresh document."""
    payload = document or {}
    phase = str(payload.get("session_phase") or "").strip()
    if phase != policy.required_phase:
        return f"phase={phase or 'missing'}"

    captured_raw = str(payload.get("captured_at") or "").strip()
    if policy.market and not is_current_market_timestamp(
        captured_raw,
        market=policy.market,
        now=now,
    ):
        return f"captured_at={captured_raw or 'missing'}"

    updated_raw = str(payload.get("updated_at") or "").strip()
    updated_at = _parse_utc(updated_raw)
    if updated_at is None:
        return f"updated_at={updated_raw or 'missing'}"

    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    age_hours = (
        current.astimezone(timezone.utc) - updated_at
    ).total_seconds() / 3600.0
    if age_hours < -policy.future_tolerance_hours:
        return f"updated_at={updated_raw},age_hours={age_hours:.2f}"
    if age_hours > policy.max_age_hours:
        return f"updated_at={updated_raw},age_hours={age_hours:.2f}"
    return None


def partition_fresh_price_documents(
    prices: Mapping[str, Mapping[str, Any]],
    instrument_ids: Sequence[str],
    *,
    policy: PriceFreshnessPolicy,
    now: datetime | None = None,
) -> tuple[dict[str, Mapping[str, Any]], list[str]]:
    """Split current-run price inputs from missing or stale latest documents."""
    fresh: dict[str, Mapping[str, Any]] = {}
    stale: list[str] = []
    for instrument_id in instrument_ids:
        document = prices.get(instrument_id)
        if price_freshness_error(document, policy=policy, now=now) is None:
            fresh[instrument_id] = document or {}
        else:
            stale.append(instrument_id)
    return fresh, stale


def assert_fresh_price_documents(
    prices: Mapping[str, Mapping[str, Any]],
    instrument_ids: Sequence[str],
    *,
    policy: PriceFreshnessPolicy,
    context: str,
    now: datetime | None = None,
) -> None:
    """Fail closed with instrument-level reasons for stale publisher inputs."""
    rejected: list[str] = []
    for instrument_id in instrument_ids:
        reason = price_freshness_error(
            prices.get(instrument_id),
            policy=policy,
            now=now,
        )
        if reason:
            rejected.append(f"{instrument_id}({reason})")
    if rejected:
        raise RuntimeError(
            f"Refusing {context} from stale price inputs: {', '.join(rejected[:12])}"
        )


def require_price_batch_coverage(
    result: Mapping[str, Any],
    *,
    minimum_coverage: float,
    context: str,
) -> float:
    """Validate provider coverage before a worker can mark its stage successful."""
    if not 0 < minimum_coverage <= 1:
        raise ValueError("minimum_coverage must be in (0, 1]")
    try:
        input_count = int(result["input_count"])
        saved_count = int(result["saved_count"])
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError(f"{context} did not report valid price counts") from exc
    if input_count <= 0:
        raise RuntimeError(f"{context} received no price inputs")
    if saved_count < 0 or saved_count > input_count:
        raise RuntimeError(
            f"{context} reported impossible price counts: "
            f"saved={saved_count} input={input_count}"
        )
    coverage = saved_count / input_count
    if coverage < minimum_coverage:
        raise RuntimeError(
            f"{context} price coverage {coverage:.1%} is below the "
            f"{minimum_coverage:.0%} publish floor "
            f"({saved_count}/{input_count})"
        )
    return coverage
