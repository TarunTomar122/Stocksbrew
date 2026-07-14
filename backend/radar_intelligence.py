"""Radar thick-data domain engine (US equities only).

Pure-Python, dependency-free domain logic for the planned Radar pipeline.
This module owns no I/O: callers normalize raw provider payloads into
``Evidence``, feed them through :func:`process_evidence` (or the
multi-ticker convenience :func:`process_portfolio`) to get deterministic,
immutable :class:`RadarEvent` objects and a reduced :class:`StockState`,
then rank the result into a personalized inbox with
:func:`build_personalized_inbox`.

Design invariants:

- Every transformation is a pure function of its inputs: same evidence in,
  same events/state out, regardless of when or how many times it runs.
- Events are only generated from a *transition* between a previous and a
  current :class:`StockState` (or, for forward-looking / same-day facts
  such as an upcoming earnings date or an abnormal price move, from the
  current evidence alone). No transition means no event, which is what
  keeps static, unchanged facts from re-surfacing every run.
- Every event carries at least one citation back to the evidence that
  produced it, and its generated prose is validated (see
  :func:`validate_prose`) for AI-sounding filler, numbers that cannot be
  traced back to evidence, and unsupported "you should act" language.
"""
from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence, TypedDict

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

RSI_OVERSOLD_MAX = 35.0
RSI_OVERBOUGHT_MIN = 70.0
RSI_NEAR_BOUNDARY_MARGIN = 5.0

ANALYST_TARGET_MATERIAL_PCT = 3.0
ABNORMAL_MOVE_PCT_THRESHOLD = 5.0
EARNINGS_UPCOMING_SOON_DAYS = 3

STALE_AFTER_HOURS = 120.0
MAX_INBOX_ITEMS = 3
MAX_SEEN_EVENT_IDS = 200
NOVELTY_SUPPRESS_THRESHOLD = 10.0

EVIDENCE_KINDS = frozenset(
    {
        "rsi",
        "analyst_rating",
        "analyst_target",
        "earnings_upcoming",
        "earnings_result",
        "earnings_guidance",
        "filing",
        "price_move",
    }
)

EVENT_KINDS = frozenset(
    {
        "rsi_oversold_cross",
        "rsi_overbought_cross",
        "rsi_return_to_neutral",
        "analyst_rating_change",
        "analyst_target_revision",
        "earnings_upcoming",
        "earnings_results",
        "earnings_guidance_change",
        "filing_catalyst",
        "abnormal_price_move",
    }
)

_EXPLANATORY_EVIDENCE_KINDS = frozenset(
    {"analyst_rating", "analyst_target", "earnings_result", "earnings_guidance", "filing"}
)

_TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")
_NUMBER_RE = re.compile(r"(?<!\d)-?\d+(?:,\d{3})*(?:\.\d+)?")

_DEFAULT_RELIABILITY: dict[str, float] = {
    "rsi": 0.85,
    "analyst_rating": 0.75,
    "analyst_target": 0.75,
    "earnings_upcoming": 0.9,
    "earnings_result": 0.9,
    "earnings_guidance": 0.8,
    "filing": 0.95,
    "price_move": 0.9,
}

_VALUE_PAYLOAD_KEY: dict[str, str] = {
    "rsi": "rsi_14",
    "analyst_rating": "rating",
    "analyst_target": "target",
    "price_move": "day_change_pct",
}

_RATING_ORDER: dict[str, int] = {
    "sell": 1,
    "strong sell": 1,
    "underperform": 1,
    "underweight": 1,
    "hold": 2,
    "neutral": 2,
    "market perform": 2,
    "sector perform": 2,
    "equal weight": 2,
    "equal-weight": 2,
    "overweight": 3,
    "outperform": 3,
    "add": 3,
    "buy": 4,
    "strong buy": 4,
}

_FILING_MATERIALITY: dict[str, float] = {
    "8-K": 60.0,
    "13D": 65.0,
    "13G": 40.0,
    "S-1": 45.0,
    "10-Q": 35.0,
    "10-K": 40.0,
    "4": 30.0,
}

_SEC_ITEM_LABELS: dict[str, str] = {
    "1.01": "a material agreement",
    "2.01": "an acquisition or asset sale",
    "2.02": "quarterly results",
    "2.05": "restructuring costs",
    "2.06": "a material impairment",
    "3.01": "an exchange-listing notice",
    "4.01": "an auditor change",
    "5.02": "a leadership or board change",
    "7.01": "a Regulation FD disclosure",
    "8.01": "another material company event",
}

_POSITION_MULTIPLIER: dict[str, float] = {
    "long": 1.15,
    "short": 1.05,
    "watch": 0.9,
}

_W_MATERIALITY = 0.35
_W_CONFIDENCE = 0.20
_W_FRESHNESS = 0.30
_W_NOVELTY = 0.15

_AI_FILLER_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"as an ai",
        r"in today'?s fast-paced",
        r"in the fast-paced world",
        r"it'?s important to note",
        r"it is important to note",
        r"in conclusion",
        r"to sum up",
        r"in summary",
        r"\boverall,",
        r"delve(?:ing)? into",
        r"moving forward,",
        r"game[\s-]changer",
        r"unprecedented",
        r"unlock the potential",
        r"let'?s dive in",
        r"div(?:e|ing) into",
        r"navigating the",
        r"in this article",
        r"we will explore",
        r"stay tuned",
        r"exciting times",
        r"revolutioniz",
        r"in the world of",
        r"at the end of the day",
        r"needless to say",
        r"without a doubt",
        r"cutting-edge",
        r"ever-evolving",
        r"paradigm shift",
    )
]

_UNSUPPORTED_ACTION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"you should (buy|sell|short)",
        r"\bbuy (now|this)\b",
        r"\bsell (now|this)\b",
        r"\bshort this\b",
        r"add to your position",
        r"trim your position",
        r"take profits now",
        r"cut your losses",
    )
]


# --------------------------------------------------------------------------
# Input contract
# --------------------------------------------------------------------------


class RawEvidenceRecord(TypedDict, total=False):
    """Loosely structured evidence as it arrives from an upstream provider."""

    evidence_id: str
    kind: str
    ticker: str
    occurred_at: str
    source: str
    citation_title: str
    citation_url: str
    title: str
    url: str
    value: Any
    payload: dict[str, Any]
    reliability: float


# --------------------------------------------------------------------------
# Core types
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Evidence:
    """A normalized, evidence-backed observation about one ticker."""

    evidence_id: str
    kind: str
    ticker: str
    occurred_at: str
    source: str
    citation_title: str
    citation_url: str
    payload: dict[str, Any]
    reliability: float = 0.7

    def to_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "kind": self.kind,
            "ticker": self.ticker,
            "occurred_at": self.occurred_at,
            "source": self.source,
            "citation_title": self.citation_title,
            "citation_url": self.citation_url,
            "payload": dict(self.payload),
            "reliability": self.reliability,
        }


@dataclass(frozen=True, slots=True)
class Citation:
    """A pointer back to the evidence that backs a piece of generated prose."""

    source: str
    title: str
    url: str
    occurred_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "title": self.title,
            "url": self.url,
            "occurred_at": self.occurred_at,
        }


@dataclass(frozen=True, slots=True)
class StockState:
    """The latest reduced, canonical state for one ticker."""

    ticker: str
    as_of: str = ""
    rsi_14: float | None = None
    rsi_state: str = "neutral"
    analyst_rating: str | None = None
    analyst_target: float | None = None
    price: float | None = None
    day_change_pct: float | None = None
    earnings_status: str | None = None
    earnings_date: str | None = None
    guidance_direction: str | None = None
    last_filing_id: str | None = None
    last_filing_kind: str | None = None
    seen_event_ids: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ticker": self.ticker,
            "as_of": self.as_of,
            "rsi_14": self.rsi_14,
            "rsi_state": self.rsi_state,
            "analyst_rating": self.analyst_rating,
            "analyst_target": self.analyst_target,
            "price": self.price,
            "day_change_pct": self.day_change_pct,
            "earnings_status": self.earnings_status,
            "earnings_date": self.earnings_date,
            "guidance_direction": self.guidance_direction,
            "last_filing_id": self.last_filing_id,
            "last_filing_kind": self.last_filing_kind,
            "seen_event_ids": list(self.seen_event_ids),
        }


@dataclass(frozen=True, slots=True)
class RadarEvent:
    """A deterministic, immutable fact derived from a stock-state transition."""

    event_id: str
    ticker: str
    kind: str
    occurred_at: str
    materiality: float
    confidence: float
    novelty: float
    payload: dict[str, Any]
    citations: tuple[Citation, ...]
    what_changed: str
    why_it_matters: str
    next_trigger: str
    evidence_refs: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "ticker": self.ticker,
            "kind": self.kind,
            "occurred_at": self.occurred_at,
            "materiality": self.materiality,
            "confidence": self.confidence,
            "novelty": self.novelty,
            "payload": dict(self.payload),
            "citations": [c.to_dict() for c in self.citations],
            "what_changed": self.what_changed,
            "why_it_matters": self.why_it_matters,
            "next_trigger": self.next_trigger,
            "evidence_refs": list(self.evidence_refs),
        }


@dataclass(frozen=True, slots=True)
class PortfolioPosition:
    """A user's stake in a ticker, used to personalize inbox ranking."""

    ticker: str
    position_type: str = "watch"
    weight_pct: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {"ticker": self.ticker, "position_type": self.position_type, "weight_pct": self.weight_pct}


@dataclass(frozen=True, slots=True)
class InboxItem:
    """One ranked slot in a user's personalized Radar inbox."""

    rank: int
    event: RadarEvent
    score: float
    headline: str
    body: str
    next_trigger: str
    citations: tuple[Citation, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "rank": self.rank,
            "event": self.event.to_dict(),
            "score": self.score,
            "headline": self.headline,
            "body": self.body,
            "next_trigger": self.next_trigger,
            "citations": [c.to_dict() for c in self.citations],
        }


@dataclass(frozen=True, slots=True)
class QuietSummary:
    """A useful "nothing material happened" summary for an empty inbox."""

    generated_at: str
    headline: str
    body: str
    tickers_checked: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "headline": self.headline,
            "body": self.body,
            "tickers_checked": list(self.tickers_checked),
        }


@dataclass(frozen=True, slots=True)
class InboxResult:
    """The final, ranked, capped inbox payload for one user."""

    generated_at: str
    items: tuple[InboxItem, ...] = field(default_factory=tuple)
    quiet_summary: QuietSummary | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "items": [item.to_dict() for item in self.items],
            "quiet_summary": self.quiet_summary.to_dict() if self.quiet_summary else None,
        }


@dataclass(frozen=True, slots=True)
class ProcessResult:
    """Output of processing one ticker's evidence batch."""

    events: tuple[RadarEvent, ...]
    state: StockState
    rejected_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "events": [e.to_dict() for e in self.events],
            "state": self.state.to_dict(),
            "rejected_count": self.rejected_count,
        }


@dataclass(frozen=True, slots=True)
class PortfolioProcessResult:
    """Output of processing a full portfolio's evidence in one pass."""

    states: dict[str, StockState]
    events: tuple[RadarEvent, ...]
    inbox: InboxResult

    def to_dict(self) -> dict[str, Any]:
        return {
            "states": {ticker: state.to_dict() for ticker, state in self.states.items()},
            "events": [e.to_dict() for e in self.events],
            "inbox": self.inbox.to_dict(),
        }


@dataclass(frozen=True, slots=True)
class ProseValidationResult:
    """Result of validating generated prose against evidence and style rules."""

    is_valid: bool
    issues: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {"is_valid": self.is_valid, "issues": list(self.issues)}


# --------------------------------------------------------------------------
# Small pure helpers
# --------------------------------------------------------------------------


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _safe_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _stable_hash(*parts: str) -> str:
    joined = "\x1f".join(str(part) for part in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:20]


def _normalize_timestamp(value: Any) -> str:
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    text = str(value or "").strip()
    if not text:
        return ""
    candidate = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(candidate)
    except ValueError:
        if _DATE_RE.match(text):
            try:
                dt = datetime.fromisoformat(text[:10])
            except ValueError:
                return ""
        else:
            return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _hours_between(occurred_at: str, as_of: str) -> float:
    try:
        dt_occurred = datetime.fromisoformat(occurred_at)
        dt_as_of = datetime.fromisoformat(as_of)
    except ValueError:
        return 0.0
    return abs((dt_as_of - dt_occurred).total_seconds()) / 3600.0


def _days_until(date_str: str | None, as_of: str) -> int | None:
    if not date_str:
        return None
    try:
        target = datetime.fromisoformat(date_str[:10]).date()
        current = datetime.fromisoformat(as_of[:10]).date()
    except ValueError:
        return None
    return (target - current).days


def _rsi_bucket(rsi: float) -> str:
    if rsi <= RSI_OVERSOLD_MAX:
        return "oversold"
    if rsi >= RSI_OVERBOUGHT_MIN:
        return "overbought"
    return "neutral"


def _rating_direction(previous: str | None, current: str) -> str:
    prev_rank = _RATING_ORDER.get((previous or "").strip().lower())
    cur_rank = _RATING_ORDER.get(current.strip().lower())
    if prev_rank is None or cur_rank is None or prev_rank == cur_rank:
        return "revised"
    return "upgrade" if cur_rank > prev_rank else "downgrade"


def _beat_miss_label(actual: float | None, estimate: float | None) -> str:
    if actual is None or estimate is None:
        return "reported result"
    if actual > estimate:
        return "beat"
    if actual < estimate:
        return "miss"
    return "inline result"


def _citations(evidence: Sequence[Evidence]) -> tuple[Citation, ...]:
    out: list[Citation] = []
    seen: set[tuple[str, str, str]] = set()
    for item in evidence:
        key = (item.source, item.citation_url, item.citation_title)
        if key in seen:
            continue
        seen.add(key)
        out.append(
            Citation(
                source=item.source,
                title=item.citation_title or item.source,
                url=item.citation_url,
                occurred_at=item.occurred_at,
            )
        )
    return tuple(out)


# --------------------------------------------------------------------------
# Normalization
# --------------------------------------------------------------------------


def _payload_from_value(kind: str, value: Any) -> dict[str, Any]:
    key = _VALUE_PAYLOAD_KEY.get(kind)
    return {key: value} if key else {"value": value}


def _payload_discriminator(payload: Mapping[str, Any]) -> str:
    return "|".join(f"{key}={payload[key]}" for key in sorted(payload))


def normalize_evidence(raw: RawEvidenceRecord) -> Evidence | None:
    """Turn a loosely structured raw record into a canonical :class:`Evidence`.

    Returns ``None`` when the record is missing required fields (kind,
    ticker, a parseable timestamp) or uses an unrecognized evidence kind or
    a ticker that does not look like a US equity symbol.
    """
    kind = str(raw.get("kind") or "").strip().lower()
    ticker = str(raw.get("ticker") or "").strip().upper()
    occurred_at = _normalize_timestamp(raw.get("occurred_at"))

    if kind not in EVIDENCE_KINDS or not ticker or not occurred_at:
        return None
    if not _TICKER_RE.match(ticker):
        return None

    payload_raw = raw.get("payload")
    payload: dict[str, Any] = dict(payload_raw) if isinstance(payload_raw, dict) else {}
    if not payload and "value" in raw and raw.get("value") is not None:
        payload = _payload_from_value(kind, raw["value"])

    source = str(raw.get("source") or "").strip() or "unknown"
    citation_title = str(raw.get("citation_title") or raw.get("title") or "").strip()
    citation_url = str(raw.get("citation_url") or raw.get("url") or "").strip()

    reliability = _safe_float(raw.get("reliability"))
    if reliability is None:
        reliability = _DEFAULT_RELIABILITY.get(kind, 0.7)
    reliability = _clamp(reliability, 0.0, 1.0)

    provided_id = str(raw.get("evidence_id") or "").strip()
    evidence_id = provided_id or (
        "ev_" + _stable_hash("evidence", ticker, kind, occurred_at, _payload_discriminator(payload))
    )

    return Evidence(
        evidence_id=evidence_id,
        kind=kind,
        ticker=ticker,
        occurred_at=occurred_at,
        source=source,
        citation_title=citation_title,
        citation_url=citation_url,
        payload=payload,
        reliability=reliability,
    )


# --------------------------------------------------------------------------
# State derivation (evidence -> candidate state)
# --------------------------------------------------------------------------


def derive_candidate_state(
    previous: StockState | None,
    ticker: str,
    evidence: Sequence[Evidence],
    as_of: str,
) -> StockState:
    """Fold normalized evidence on top of the previous state for one ticker.

    Later evidence (by ``occurred_at``, then ``evidence_id`` as a stable
    tie-break) overrides earlier evidence of the same kind within the same
    batch, so the result is deterministic regardless of input order.
    """
    base = previous if (previous and previous.ticker == ticker) else StockState(ticker=ticker)
    overrides: dict[str, Any] = {"as_of": as_of}

    ordered = sorted(
        (item for item in evidence if item.ticker == ticker),
        key=lambda item: (item.occurred_at, item.evidence_id),
    )

    for item in ordered:
        if item.kind == "rsi":
            rsi = _safe_float(item.payload.get("rsi_14"))
            if rsi is not None:
                overrides["rsi_14"] = rsi
                overrides["rsi_state"] = _rsi_bucket(rsi)
        elif item.kind == "analyst_rating":
            rating = str(item.payload.get("rating") or "").strip()
            if rating:
                overrides["analyst_rating"] = rating
        elif item.kind == "analyst_target":
            target = _safe_float(item.payload.get("target"))
            if target is not None:
                overrides["analyst_target"] = target
        elif item.kind == "earnings_upcoming":
            overrides["earnings_status"] = "upcoming"
            date_value = str(item.payload.get("earnings_date") or "").strip()
            if date_value:
                overrides["earnings_date"] = date_value
        elif item.kind == "earnings_result":
            overrides["earnings_status"] = "reported"
        elif item.kind == "earnings_guidance":
            direction = str(item.payload.get("direction") or "").strip().lower()
            if direction in ("raised", "lowered", "maintained"):
                overrides["guidance_direction"] = direction
        elif item.kind == "filing":
            filing_id = str(item.payload.get("filing_id") or item.evidence_id).strip()
            overrides["last_filing_id"] = filing_id
            filing_kind = str(item.payload.get("filing_type") or "").strip()
            overrides["last_filing_kind"] = filing_kind or None
        elif item.kind == "price_move":
            pct = _safe_float(item.payload.get("day_change_pct"))
            if pct is not None:
                overrides["day_change_pct"] = pct
            price = _safe_float(item.payload.get("price"))
            if price is not None:
                overrides["price"] = price

    return replace(base, **overrides)


# --------------------------------------------------------------------------
# Materiality / confidence / novelty
# --------------------------------------------------------------------------


def compute_materiality(kind: str, payload: Mapping[str, Any]) -> float:
    """Score 0-100: how much this event matters on its own."""
    if kind == "rsi_oversold_cross":
        rsi = payload.get("current_rsi")
        rsi = rsi if isinstance(rsi, (int, float)) else RSI_OVERSOLD_MAX
        return round(_clamp(40.0 + (RSI_OVERSOLD_MAX - rsi) * 2.0, 40.0, 90.0), 1)
    if kind == "rsi_overbought_cross":
        rsi = payload.get("current_rsi")
        rsi = rsi if isinstance(rsi, (int, float)) else RSI_OVERBOUGHT_MIN
        return round(_clamp(40.0 + (rsi - RSI_OVERBOUGHT_MIN) * 2.0, 40.0, 90.0), 1)
    if kind == "rsi_return_to_neutral":
        return 35.0
    if kind == "analyst_rating_change":
        return 65.0
    if kind == "analyst_target_revision":
        pct = abs(payload.get("change_pct") or 0.0)
        return round(_clamp(40.0 + pct * 3.0, 40.0, 85.0), 1)
    if kind == "earnings_upcoming":
        days = payload.get("days_until")
        if isinstance(days, (int, float)) and days <= EARNINGS_UPCOMING_SOON_DAYS:
            return 55.0
        return 40.0
    if kind == "earnings_results":
        return 80.0
    if kind == "earnings_guidance_change":
        return 75.0 if payload.get("direction") == "lowered" else 70.0
    if kind == "filing_catalyst":
        return _FILING_MATERIALITY.get(str(payload.get("filing_type") or "").upper(), 45.0)
    if kind == "abnormal_price_move":
        pct = abs(payload.get("day_change_pct") or 0.0)
        return round(_clamp(50.0 + pct * 2.0, 50.0, 95.0), 1)
    return 30.0


def compute_confidence(evidence: Sequence[Evidence]) -> float:
    """Score 0-100: how much we trust the evidence behind this event."""
    if not evidence:
        return 30.0
    avg_reliability = sum(item.reliability for item in evidence) / len(evidence)
    corroboration_bonus = min(15.0, (len(evidence) - 1) * 5.0)
    return round(_clamp(avg_reliability * 80.0 + 15.0 + corroboration_bonus, 10.0, 99.0), 1)


def compute_novelty(kind: str, payload: Mapping[str, Any]) -> float:
    """Score 0-100: how surprising/new this fact is, used to rank and to
    suppress marginal, barely-over-threshold restatements of known facts."""
    if kind in ("rsi_oversold_cross", "rsi_overbought_cross"):
        return 80.0
    if kind == "rsi_return_to_neutral":
        return 55.0
    if kind == "analyst_rating_change":
        return 75.0
    if kind == "analyst_target_revision":
        pct = abs(payload.get("change_pct") or 0.0)
        return round(_clamp(pct * 8.0, 5.0, 95.0), 1)
    if kind == "earnings_upcoming":
        days = payload.get("days_until")
        if isinstance(days, (int, float)) and days <= EARNINGS_UPCOMING_SOON_DAYS:
            return 65.0
        return 45.0
    if kind == "earnings_results":
        return 85.0
    if kind == "earnings_guidance_change":
        return 80.0
    if kind == "filing_catalyst":
        return 55.0
    if kind == "abnormal_price_move":
        pct = abs(payload.get("day_change_pct") or 0.0)
        return round(_clamp(pct * 6.0, 20.0, 95.0), 1)
    return 50.0


# --------------------------------------------------------------------------
# Dedupe IDs
# --------------------------------------------------------------------------


def compute_event_id(ticker: str, kind: str, transition_key: str, *discriminator: str) -> str:
    """Stable, deterministic dedupe ID for an event.

    The transition key comes from the prior state watermark or a stable
    source occurrence, so retries remain idempotent across processing days.
    """
    parts = [str(part) for part in discriminator]
    return "evt_" + _stable_hash("event", ticker, kind, transition_key, *parts)


# --------------------------------------------------------------------------
# Prose rendering
# --------------------------------------------------------------------------


def _prose_rsi_oversold(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    rsi = payload.get("current_rsi")
    what = f"{ticker}'s 14-day RSI dropped to {rsi:.1f}, crossing into oversold territory (35 or below)."
    why = f"Selling has become unusually one-sided in {ticker}; that is a condition to monitor, not a reversal signal by itself."
    next_trigger = f"Watching for {ticker}'s RSI to climb back above 35, which would signal the selling pressure is easing."
    return what, why, next_trigger


def _prose_rsi_overbought(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    rsi = payload.get("current_rsi")
    what = f"{ticker}'s 14-day RSI climbed to {rsi:.1f}, crossing into overbought territory (70 or above)."
    why = f"Buying has become unusually one-sided in {ticker}; momentum is strong, but RSI alone does not predict a pullback."
    next_trigger = f"Watching for {ticker}'s RSI to fall back below 70, which would signal momentum is cooling."
    return what, why, next_trigger


def _prose_rsi_return_to_neutral(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    prev_state = payload.get("previous_state") or "extreme"
    rsi = payload.get("current_rsi")
    what = f"{ticker}'s 14-day RSI moved back to {rsi:.1f}, returning to neutral after being {prev_state}."
    why = f"The move out of {prev_state} territory suggests that extreme has faded and the trend is resetting for {ticker}."
    next_trigger = f"Watching for {ticker}'s RSI to break back out of the 35-70 neutral range in either direction."
    return what, why, next_trigger


def _prose_analyst_rating_change(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    prev = payload.get("previous_rating") or "no prior rating"
    cur = payload.get("current_rating")
    direction = payload.get("direction")
    verb = {"upgrade": "upgraded", "downgrade": "downgraded"}.get(direction, "revised")
    firm = citations[0].source if citations else "An analyst"
    what = f"{firm} {verb} {ticker} from {prev} to {cur}."
    why = f"A rating change from a covering analyst can shift how the street frames {ticker}'s risk/reward from here."
    next_trigger = f"Watching for other analysts to follow with matching {cur} calls on {ticker}."
    return what, why, next_trigger


def _prose_analyst_target_revision(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    prev = payload.get("previous_target")
    cur = payload.get("current_target")
    pct = payload.get("change_pct") or 0.0
    direction = "raised" if cur >= prev else "lowered"
    firm = citations[0].source if citations else "An analyst"
    what = f"{firm} {direction} its price target on {ticker} from ${prev:.2f} to ${cur:.2f}, a {abs(pct):.1f}% change."
    why = f"A target move of {abs(pct):.1f}% shifts the implied upside on {ticker} and can influence other desks' models."
    next_trigger = f"Watching for {ticker}'s price to react toward the new ${cur:.2f} target over the next few sessions."
    return what, why, next_trigger


def _prose_earnings_upcoming(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    date_value = payload.get("earnings_date")
    days = payload.get("days_until")
    if isinstance(days, (int, float)) and days <= EARNINGS_UPCOMING_SOON_DAYS:
        unit = "day" if days == 1 else "days"
        urgency = f"in {days} {unit}"
    else:
        urgency = f"on {date_value}"
    what = f"{ticker} has an upcoming earnings report scheduled for {date_value} ({urgency})."
    why = f"The report can reset estimates and guidance for {ticker}, so the next price move may depend more on the release than the current trend."
    next_trigger = f"Watching for {ticker}'s actual results and guidance when the report lands on {date_value}."
    return what, why, next_trigger


def _prose_earnings_results(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    eps_actual = payload.get("eps_actual")
    eps_estimate = payload.get("eps_estimate")
    label = payload.get("result_label") or "reported result"
    if isinstance(eps_actual, (int, float)) and isinstance(eps_estimate, (int, float)):
        what = f"{ticker} reported earnings of ${eps_actual:.2f} per share vs. a ${eps_estimate:.2f} estimate, a {label}."
    else:
        what = f"{ticker} reported quarterly earnings results ({label})."
    why = f"The {label} shifts the near-term earnings narrative on {ticker} heading into the next quarter."
    next_trigger = f"Watching for management commentary and updated guidance from {ticker}'s earnings call."
    return what, why, next_trigger


def _prose_guidance_change(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    direction = payload.get("direction")
    verb = "raised" if direction == "raised" else "lowered"
    what = f"{ticker} {verb} forward guidance in its latest update."
    why = f"A guidance {direction} changes the trajectory investors should expect for {ticker}'s next few quarters."
    next_trigger = f"Watching for analyst estimate revisions on {ticker} to catch up with the new guidance."
    return what, why, next_trigger


def _prose_filing_catalyst(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    filing_type = payload.get("filing_type") or "a new filing"
    items = str(payload.get("items") or "")
    item_codes = [code.strip() for code in items.split(",") if code.strip()]
    labels = [_SEC_ITEM_LABELS[code] for code in item_codes if code in _SEC_ITEM_LABELS]
    subject = ", ".join(labels[:2])
    what = (
        f"{ticker} filed {filing_type} covering {subject}."
        if subject
        else f"{ticker} published a new {filing_type} filing."
    )
    why = (
        f"This is the company's official disclosure for {subject}; it is more reliable than second-hand coverage."
        if subject
        else f"The filing is an official company update, but the headline alone does not show whether it changes {ticker}'s outlook."
    )
    next_trigger = (
        f"Watch for management or analysts to quantify the effect on {ticker}'s estimates."
        if subject
        else f"Watch for a specific financial or operating change in the filing before treating it as material."
    )
    return what, why, next_trigger


def _prose_abnormal_price_move(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    pct = payload.get("day_change_pct") or 0.0
    direction = "up" if pct >= 0 else "down"
    explanation_summary = payload.get("explanation_summary") or "a same-day catalyst"
    what = f"{ticker} moved {direction} {abs(pct):.1f}% today, a larger-than-usual swing."
    why = f"The move lines up with {explanation_summary}, the evidence-backed reason behind today's {abs(pct):.1f}% {direction}side."
    next_trigger = f"Watching whether {ticker} holds this level or reverses once the news is fully priced in."
    return what, why, next_trigger


def _prose_generic(ticker: str, payload: Mapping[str, Any], citations: Sequence[Citation]) -> tuple[str, str, str]:
    what = f"{ticker} has a new tracked change."
    why = f"This affects how {ticker} should be read right now."
    next_trigger = f"Watching for the next confirming signal on {ticker}."
    return what, why, next_trigger


_PROSE_BUILDERS = {
    "rsi_oversold_cross": _prose_rsi_oversold,
    "rsi_overbought_cross": _prose_rsi_overbought,
    "rsi_return_to_neutral": _prose_rsi_return_to_neutral,
    "analyst_rating_change": _prose_analyst_rating_change,
    "analyst_target_revision": _prose_analyst_target_revision,
    "earnings_upcoming": _prose_earnings_upcoming,
    "earnings_results": _prose_earnings_results,
    "earnings_guidance_change": _prose_guidance_change,
    "filing_catalyst": _prose_filing_catalyst,
    "abnormal_price_move": _prose_abnormal_price_move,
}


def render_prose(
    kind: str,
    ticker: str,
    payload: Mapping[str, Any],
    citations: Sequence[Citation],
) -> tuple[str, str, str]:
    """Deterministic, human-sounding (what_changed, why_it_matters, next_trigger)."""
    builder = _PROSE_BUILDERS.get(kind, _prose_generic)
    return builder(ticker, payload, citations)


# --------------------------------------------------------------------------
# Prose validation
# --------------------------------------------------------------------------


def _extract_numbers(text: str) -> list[float]:
    out: list[float] = []
    # A hyphen between digits describes a range ("35-70"), not a negative
    # number. Preserve actual negatives such as "-6.2%".
    normalized = re.sub(r"(?<=\d)-(?=\d)", " ", text)
    for match in _NUMBER_RE.findall(normalized):
        cleaned = match.replace(",", "")
        try:
            out.append(float(cleaned))
        except ValueError:
            continue
    return out


def _add_number_or_date(out: set[float], value: Any) -> None:
    number = _safe_float(value)
    if number is not None:
        out.add(round(number, 4))
        out.add(round(abs(number), 4))
        return
    if isinstance(value, str):
        for number_in_text in _extract_numbers(value):
            out.add(round(number_in_text, 4))
            out.add(round(abs(number_in_text), 4))


def _supported_numbers(payload: Mapping[str, Any], citations: Sequence[Citation]) -> set[float]:
    # 14 (the RSI lookback window) and the 35/70 RSI boundaries are fixed
    # domain constants that show up in prose regardless of evidence payload.
    out: set[float] = {14.0, 35.0, 70.0}
    for value in payload.values():
        _add_number_or_date(out, value)
    for citation in citations:
        for text in (citation.title, citation.source):
            for number in _extract_numbers(text or ""):
                out.add(round(number, 4))
    return out


def _number_supported(number: float, supported: set[float]) -> bool:
    for candidate in supported:
        if abs(number - candidate) <= max(0.05, abs(candidate) * 0.01):
            return True
    return False


def validate_prose(
    what_changed: str,
    why_it_matters: str,
    next_trigger: str,
    citations: Sequence[Citation],
    payload: Mapping[str, Any],
) -> ProseValidationResult:
    """Validate generated prose against evidence and house style rules.

    Flags (any subset of):

    - ``missing_evidence``: no citations back this text at all.
    - ``ai_like_filler``: contains a stock AI-writing filler phrase.
    - ``unsupported_action``: tells the reader to take an action (buy/sell/
      trim/etc.) rather than describing an evidence-backed fact.
    - ``unsupported_number``: a number appears in the text that cannot be
      traced back to the event payload or its citations.
    """
    issues: set[str] = set()
    combined = " ".join(text or "" for text in (what_changed, why_it_matters, next_trigger))

    if not citations:
        issues.add("missing_evidence")

    if any(pattern.search(combined) for pattern in _AI_FILLER_PATTERNS):
        issues.add("ai_like_filler")

    if any(pattern.search(combined) for pattern in _UNSUPPORTED_ACTION_PATTERNS):
        issues.add("unsupported_action")

    supported = _supported_numbers(payload, citations)
    for number in _extract_numbers(combined):
        if not _number_supported(number, supported):
            issues.add("unsupported_number")
            break

    return ProseValidationResult(is_valid=not issues, issues=tuple(sorted(issues)))


# --------------------------------------------------------------------------
# Event construction
# --------------------------------------------------------------------------


def _build_event(
    *,
    kind: str,
    ticker: str,
    occurred_at: str,
    as_of: str,
    payload: dict[str, Any],
    citations: tuple[Citation, ...],
    evidence: Sequence[Evidence],
    discriminator: tuple[str, ...],
) -> RadarEvent:
    event_id = compute_event_id(ticker, kind, "transition", *discriminator)
    materiality = compute_materiality(kind, payload)
    confidence = compute_confidence(evidence)
    novelty = compute_novelty(kind, payload)
    what_changed, why_it_matters, next_trigger = render_prose(kind, ticker, payload, citations)

    validation = validate_prose(what_changed, why_it_matters, next_trigger, citations, payload)
    if not validation.is_valid:
        raise ValueError(
            f"radar_intelligence: generated prose failed validation for {kind}/{ticker}: {validation.issues}"
        )

    return RadarEvent(
        event_id=event_id,
        ticker=ticker,
        kind=kind,
        occurred_at=occurred_at,
        materiality=materiality,
        confidence=confidence,
        novelty=novelty,
        payload=dict(payload),
        citations=citations,
        what_changed=what_changed,
        why_it_matters=why_it_matters,
        next_trigger=next_trigger,
        evidence_refs=tuple(item.evidence_id for item in evidence),
    )


def _rsi_transition_event(
    previous: StockState | None,
    candidate: StockState,
    evidence: Sequence[Evidence],
    as_of: str,
) -> RadarEvent | None:
    if previous is None:
        return None
    prev_state = previous.rsi_state
    cur_state = candidate.rsi_state
    cur_rsi = candidate.rsi_14
    if cur_rsi is None or cur_state == prev_state:
        return None

    rsi_evidence = [item for item in evidence if item.kind == "rsi"]
    if not rsi_evidence:
        return None

    if cur_state == "oversold":
        kind = "rsi_oversold_cross"
    elif cur_state == "overbought":
        kind = "rsi_overbought_cross"
    else:
        kind = "rsi_return_to_neutral"

    citations = _citations(rsi_evidence)
    occurred_at = max(item.occurred_at for item in rsi_evidence)
    payload = {
        "previous_rsi": previous.rsi_14,
        "current_rsi": cur_rsi,
        "previous_state": prev_state,
        "current_state": cur_state,
    }
    return _build_event(
        kind=kind,
        ticker=candidate.ticker,
        occurred_at=occurred_at,
        as_of=as_of,
        payload=payload,
        citations=citations,
        evidence=rsi_evidence,
        discriminator=(previous.as_of or "initial", prev_state, cur_state),
    )


def _analyst_rating_event(
    previous: StockState | None,
    candidate: StockState,
    evidence: Sequence[Evidence],
    as_of: str,
) -> RadarEvent | None:
    if previous is None:
        return None
    cur = candidate.analyst_rating
    prev = previous.analyst_rating
    if not cur or cur == prev:
        return None

    rating_evidence = [item for item in evidence if item.kind == "analyst_rating"]
    if not rating_evidence:
        return None

    direction = _rating_direction(prev, cur)
    citations = _citations(rating_evidence)
    occurred_at = max(item.occurred_at for item in rating_evidence)
    payload = {"previous_rating": prev, "current_rating": cur, "direction": direction}
    return _build_event(
        kind="analyst_rating_change",
        ticker=candidate.ticker,
        occurred_at=occurred_at,
        as_of=as_of,
        payload=payload,
        citations=citations,
        evidence=rating_evidence,
        discriminator=(previous.as_of or "initial", prev or "none", cur),
    )


def _analyst_target_event(
    previous: StockState | None,
    candidate: StockState,
    evidence: Sequence[Evidence],
    as_of: str,
) -> RadarEvent | None:
    if previous is None or previous.analyst_target is None:
        return None
    prev = previous.analyst_target
    cur = candidate.analyst_target
    if cur is None or cur == prev:
        return None

    change_pct = (cur - prev) / abs(prev) * 100.0 if prev else None
    if change_pct is None or abs(change_pct) < ANALYST_TARGET_MATERIAL_PCT:
        return None

    target_evidence = [item for item in evidence if item.kind == "analyst_target"]
    if not target_evidence:
        return None

    citations = _citations(target_evidence)
    occurred_at = max(item.occurred_at for item in target_evidence)
    payload = {"previous_target": prev, "current_target": cur, "change_pct": round(change_pct, 2)}
    return _build_event(
        kind="analyst_target_revision",
        ticker=candidate.ticker,
        occurred_at=occurred_at,
        as_of=as_of,
        payload=payload,
        citations=citations,
        evidence=target_evidence,
        discriminator=(previous.as_of or "initial", f"{prev:.2f}", f"{cur:.2f}"),
    )


def _earnings_upcoming_event(
    previous: StockState | None,
    candidate: StockState,
    evidence: Sequence[Evidence],
    as_of: str,
) -> RadarEvent | None:
    if candidate.earnings_status != "upcoming":
        return None
    prev_status = previous.earnings_status if previous else None
    prev_date = previous.earnings_date if previous else None
    if prev_status == "upcoming" and prev_date == candidate.earnings_date:
        return None

    upcoming_evidence = [item for item in evidence if item.kind == "earnings_upcoming"]
    if not upcoming_evidence:
        return None

    citations = _citations(upcoming_evidence)
    occurred_at = max(item.occurred_at for item in upcoming_evidence)
    payload = {
        "earnings_date": candidate.earnings_date,
        "days_until": _days_until(candidate.earnings_date, as_of),
        "previous_date": prev_date,
    }
    return _build_event(
        kind="earnings_upcoming",
        ticker=candidate.ticker,
        occurred_at=occurred_at,
        as_of=as_of,
        payload=payload,
        citations=citations,
        evidence=upcoming_evidence,
        discriminator=(previous.as_of if previous else "initial", candidate.earnings_date or ""),
    )


def _earnings_results_event(
    previous: StockState | None,
    candidate: StockState,
    evidence: Sequence[Evidence],
    as_of: str,
) -> RadarEvent | None:
    if candidate.earnings_status != "reported" or (
        previous is not None and previous.earnings_status == "reported"
    ):
        return None

    result_evidence = [item for item in evidence if item.kind == "earnings_result"]
    if not result_evidence:
        return None

    latest = max(result_evidence, key=lambda item: (item.occurred_at, item.evidence_id))
    eps_actual = _safe_float(latest.payload.get("eps_actual"))
    eps_estimate = _safe_float(latest.payload.get("eps_estimate"))
    label = _beat_miss_label(eps_actual, eps_estimate)

    citations = _citations(result_evidence)
    payload = {"eps_actual": eps_actual, "eps_estimate": eps_estimate, "result_label": label}
    return _build_event(
        kind="earnings_results",
        ticker=candidate.ticker,
        occurred_at=latest.occurred_at,
        as_of=as_of,
        payload=payload,
        citations=citations,
        evidence=result_evidence,
        discriminator=(
            previous.as_of if previous else "initial",
            latest.evidence_id,
            candidate.earnings_date or "",
            label,
        ),
    )


def _guidance_event(
    previous: StockState | None,
    candidate: StockState,
    evidence: Sequence[Evidence],
    as_of: str,
) -> RadarEvent | None:
    direction = candidate.guidance_direction
    if direction not in ("raised", "lowered"):
        return None
    if previous is not None and previous.guidance_direction == direction:
        return None

    guidance_evidence = [item for item in evidence if item.kind == "earnings_guidance"]
    if not guidance_evidence:
        return None

    citations = _citations(guidance_evidence)
    occurred_at = max(item.occurred_at for item in guidance_evidence)
    payload = {
        "direction": direction,
        "previous_direction": previous.guidance_direction if previous else None,
    }
    return _build_event(
        kind="earnings_guidance_change",
        ticker=candidate.ticker,
        occurred_at=occurred_at,
        as_of=as_of,
        payload=payload,
        citations=citations,
        evidence=guidance_evidence,
        discriminator=(previous.as_of if previous else "initial", direction),
    )


def _filing_event(
    previous: StockState | None,
    candidate: StockState,
    evidence: Sequence[Evidence],
    as_of: str,
) -> RadarEvent | None:
    if not candidate.last_filing_id or (
        previous is not None and candidate.last_filing_id == previous.last_filing_id
    ):
        return None

    filing_evidence = [item for item in evidence if item.kind == "filing"]
    if not filing_evidence:
        return None

    citations = _citations(filing_evidence)
    latest = max(filing_evidence, key=lambda item: (item.occurred_at, item.evidence_id))
    occurred_at = latest.occurred_at
    payload = {
        "filing_id": candidate.last_filing_id,
        "filing_type": candidate.last_filing_kind,
        "items": latest.payload.get("items"),
    }
    return _build_event(
        kind="filing_catalyst",
        ticker=candidate.ticker,
        occurred_at=occurred_at,
        as_of=as_of,
        payload=payload,
        citations=citations,
        evidence=filing_evidence,
        discriminator=(previous.as_of if previous else "initial", candidate.last_filing_id),
    )


def _abnormal_price_move_event(
    previous: StockState | None,
    candidate: StockState,
    evidence: Sequence[Evidence],
    as_of: str,
) -> RadarEvent | None:
    price_evidence = [item for item in evidence if item.kind == "price_move"]
    if not price_evidence:
        return None

    latest = max(price_evidence, key=lambda item: (item.occurred_at, item.evidence_id))
    pct = _safe_float(latest.payload.get("day_change_pct"))
    if pct is None or abs(pct) < ABNORMAL_MOVE_PCT_THRESHOLD:
        return None

    move_date = latest.occurred_at[:10]
    explanatory = [
        item
        for item in evidence
        if item.kind in _EXPLANATORY_EVIDENCE_KINDS and item.occurred_at[:10] == move_date
    ]
    if not explanatory:
        # No evidence-backed explanation for this move: do not manufacture one.
        return None

    explanation = explanatory[0]
    citations = _citations([latest, *explanatory])
    payload = {
        "day_change_pct": round(pct, 2),
        "price": _safe_float(latest.payload.get("price")),
        "explanation_kind": explanation.kind,
        "explanation_summary": explanation.citation_title or explanation.source,
    }
    return _build_event(
        kind="abnormal_price_move",
        ticker=candidate.ticker,
        occurred_at=latest.occurred_at,
        as_of=as_of,
        payload=payload,
        citations=citations,
        evidence=[latest, *explanatory],
        discriminator=(latest.evidence_id, move_date, f"{pct:.2f}"),
    )


_EVENT_BUILDERS = (
    _rsi_transition_event,
    _analyst_rating_event,
    _analyst_target_event,
    _earnings_upcoming_event,
    _earnings_results_event,
    _guidance_event,
    _filing_event,
    _abnormal_price_move_event,
)


def generate_events(
    previous: StockState | None,
    candidate: StockState,
    evidence: Sequence[Evidence],
    as_of: str,
) -> list[RadarEvent]:
    """Diff ``previous`` against ``candidate`` and emit deterministic events.

    Events with a dedupe ID already present in ``previous.seen_event_ids``
    are dropped, which makes re-processing the same evidence batch (e.g. a
    retried job) a no-op rather than a duplicate notification.
    """
    ordered_evidence = sorted(
        (item for item in evidence if item.ticker == candidate.ticker),
        key=lambda item: (item.occurred_at, item.evidence_id),
    )
    already_seen = set(previous.seen_event_ids) if previous else set()

    events: list[RadarEvent] = []
    for builder in _EVENT_BUILDERS:
        event = builder(previous, candidate, ordered_evidence, as_of)
        if event is None or event.event_id in already_seen:
            continue
        events.append(event)

    events.sort(key=lambda event: (event.occurred_at, event.kind, event.event_id))
    return events


def reduce_state(
    previous: StockState | None,
    candidate: StockState,
    events: Sequence[RadarEvent],
    as_of: str,
) -> StockState:
    """Fold newly generated events onto ``candidate`` to get the latest state."""
    seen = list(previous.seen_event_ids) if previous else []
    for event in events:
        seen.append(event.event_id)
    if len(seen) > MAX_SEEN_EVENT_IDS:
        seen = seen[-MAX_SEEN_EVENT_IDS:]
    return replace(candidate, as_of=as_of, seen_event_ids=tuple(seen))


def process_evidence(
    previous: StockState | None,
    raw_evidence: Sequence[RawEvidenceRecord],
    ticker: str,
    as_of: str,
) -> ProcessResult:
    """Normalize, diff, and reduce one ticker's evidence batch in one call."""
    ticker = ticker.strip().upper()
    normalized: list[Evidence] = []
    rejected = 0
    for raw in raw_evidence:
        evidence = normalize_evidence(raw)
        if evidence is None or evidence.ticker != ticker:
            rejected += 1
            continue
        normalized.append(evidence)

    candidate = derive_candidate_state(previous, ticker, normalized, as_of)
    events = generate_events(previous, candidate, normalized, as_of)
    new_state = reduce_state(previous, candidate, events, as_of)
    return ProcessResult(events=tuple(events), state=new_state, rejected_count=rejected)


# --------------------------------------------------------------------------
# Ranking / personalized inbox
# --------------------------------------------------------------------------


def _freshness(occurred_at: str, as_of: str) -> float:
    age_hours = _hours_between(occurred_at, as_of)
    if age_hours >= STALE_AFTER_HOURS:
        return 0.0
    return max(0.0, 100.0 * (1.0 - age_hours / STALE_AFTER_HOURS))


def _score_event(event: RadarEvent, position: PortfolioPosition, as_of: str) -> float:
    freshness = _freshness(event.occurred_at, as_of)
    base = (
        event.materiality * _W_MATERIALITY
        + event.confidence * _W_CONFIDENCE
        + freshness * _W_FRESHNESS
        + event.novelty * _W_NOVELTY
    )
    multiplier = _POSITION_MULTIPLIER.get(position.position_type, 1.0)
    weight_bonus = 1.0 + min(0.25, max(0.0, position.weight_pct) / 100.0 * 0.5)
    return round(base * multiplier * weight_bonus, 3)


def rank_inbox(
    events: Sequence[RadarEvent],
    positions: Sequence[PortfolioPosition],
    as_of: str,
    max_items: int = MAX_INBOX_ITEMS,
) -> tuple[InboxItem, ...]:
    """Rank events personalized to a user's positions, capped at ``max_items``.

    Filters out events for tickers the user does not hold/watch, events
    older than :data:`STALE_AFTER_HOURS`, and events whose novelty is below
    :data:`NOVELTY_SUPPRESS_THRESHOLD` (static/marginal restatements). Only
    the single highest-scoring event per ticker competes for a slot, so one
    chatty ticker cannot crowd out the rest of a user's book.
    """
    position_by_ticker = {position.ticker: position for position in positions}

    best_by_ticker: dict[str, tuple[float, RadarEvent, PortfolioPosition]] = {}
    for event in events:
        position = position_by_ticker.get(event.ticker)
        if position is None:
            continue
        if event.kind == "earnings_upcoming":
            days = event.payload.get("days_until")
            if not isinstance(days, (int, float)) or days > EARNINGS_UPCOMING_SOON_DAYS:
                # Calendar earnings belong in upcoming_events, not today's attention inbox.
                continue
        if _hours_between(event.occurred_at, as_of) >= STALE_AFTER_HOURS:
            continue
        if event.novelty < NOVELTY_SUPPRESS_THRESHOLD:
            continue
        score = _score_event(event, position, as_of)
        current_best = best_by_ticker.get(event.ticker)
        if current_best is None or score > current_best[0]:
            best_by_ticker[event.ticker] = (score, event, position)

    candidates = list(best_by_ticker.values())
    candidates.sort(key=lambda row: (-row[0], -row[1].materiality, row[1].ticker, row[1].event_id))

    items: list[InboxItem] = []
    selected: list[tuple[float, RadarEvent, PortfolioPosition]] = []
    seen_tickers: set[str] = set()
    for candidate in candidates:
        if candidate[1].ticker in seen_tickers:
            continue
        seen_tickers.add(candidate[1].ticker)
        selected.append(candidate)
        if len(selected) >= max(0, max_items):
            break
    for rank, (score, event, _position) in enumerate(selected, start=1):
        items.append(
            InboxItem(
                rank=rank,
                event=event,
                score=score,
                headline=event.what_changed,
                body=event.why_it_matters,
                next_trigger=event.next_trigger,
                citations=event.citations,
            )
        )
    return tuple(items)


def build_quiet_summary(
    states: Sequence[StockState],
    positions: Sequence[PortfolioPosition],
    as_of: str,
) -> QuietSummary:
    """A deterministic, useful summary for when nothing qualifies for the inbox."""
    tickers = tuple(sorted({state.ticker for state in states}))
    if not tickers:
        return QuietSummary(
            generated_at=as_of,
            headline="Radar is quiet — add a stock to get started.",
            body="Track a holding or a name on your watchlist to see personalized updates here.",
            tickers_checked=tickers,
        )

    position_by_ticker = {position.ticker: position for position in positions}
    holding_notes: list[str] = []
    for state in sorted(states, key=lambda item: item.ticker):
        if state.rsi_14 is None:
            continue
        position = position_by_ticker.get(state.ticker)
        if position is None or position.position_type != "long":
            continue
        if RSI_OVERSOLD_MAX < state.rsi_14 <= RSI_OVERSOLD_MAX + RSI_NEAR_BOUNDARY_MARGIN:
            holding_notes.append(
                f"{state.ticker} RSI {state.rsi_14:.0f} — weak stretch on a holding"
            )
        elif RSI_OVERBOUGHT_MIN - RSI_NEAR_BOUNDARY_MARGIN <= state.rsi_14 < RSI_OVERBOUGHT_MIN:
            holding_notes.append(f"{state.ticker} RSI {state.rsi_14:.0f} — getting extended on a holding")

    notes = holding_notes[:3]
    holdings_count = sum(1 for position in positions if position.position_type == "long")
    checked = len(tickers)
    headline = "Nothing needs action today."

    if notes:
        body = "On your holdings: " + "; ".join(notes) + "."
    elif holdings_count > 0:
        body = f"No material moves across your {holdings_count} {'holding' if holdings_count == 1 else 'holdings'} today."
    else:
        body = f"No material moves across your {checked} tracked {'name' if checked == 1 else 'names'}."

    return QuietSummary(generated_at=as_of, headline=headline, body=body, tickers_checked=tickers)


def build_personalized_inbox(
    events: Sequence[RadarEvent],
    states: Sequence[StockState],
    positions: Sequence[PortfolioPosition],
    as_of: str,
    max_items: int = MAX_INBOX_ITEMS,
) -> InboxResult:
    """Rank events into an inbox, falling back to a quiet summary if empty."""
    items = rank_inbox(events, positions, as_of, max_items=max_items)
    user_states = [
        state
        for state in states
        if any(position.ticker == state.ticker for position in positions)
    ]
    quiet_summary = None if items else build_quiet_summary(user_states, positions, as_of)
    return InboxResult(generated_at=as_of, items=items, quiet_summary=quiet_summary)


def process_portfolio(
    previous_states: Mapping[str, StockState],
    raw_evidence_by_ticker: Mapping[str, Sequence[RawEvidenceRecord]],
    positions: Sequence[PortfolioPosition],
    as_of: str,
    max_items: int = MAX_INBOX_ITEMS,
) -> PortfolioProcessResult:
    """Process every ticker's evidence and rank the resulting personalized inbox."""
    tickers = sorted({position.ticker for position in positions} | set(raw_evidence_by_ticker) | set(previous_states))

    new_states: dict[str, StockState] = {}
    all_events: list[RadarEvent] = []
    for ticker in tickers:
        previous = previous_states.get(ticker)
        raw_evidence = raw_evidence_by_ticker.get(ticker, [])
        result = process_evidence(previous, raw_evidence, ticker, as_of)
        new_states[ticker] = result.state
        all_events.extend(result.events)

    inbox = build_personalized_inbox(all_events, list(new_states.values()), positions, as_of, max_items=max_items)
    return PortfolioProcessResult(states=new_states, events=tuple(all_events), inbox=inbox)
