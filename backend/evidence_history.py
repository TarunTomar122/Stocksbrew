"""Small, date-keyed summaries of stock and sector news evidence.

The summaries deliberately keep evidence metadata rather than article prose. That
makes the history cheap to persist, safe to backfill, and useful for deciding
whether a one-day story is becoming a multi-day pattern.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
import re
from typing import Any, Iterable


HISTORY_VERSION = "v1"
_HARD_CATALYST_TERMS = (
    "earnings",
    "guidance",
    "contract",
    "deal",
    "approval",
    "probe",
    "investigation",
    "downgrade",
    "upgrade",
    "price target",
    "partnership",
    "acquisition",
    "offering",
    "filing",
)
_THEME_TERMS = (
    "guidance",
    "earnings",
    "revenue",
    "margin",
    "demand",
    "regulatory",
    "legal",
    "dilution",
    "offering",
    "downgrade",
    "upgrade",
    "contract",
    "partnership",
    "acquisition",
    "capex",
    "valuation",
    "macro",
    "sector",
    "ai",
)
_POSITIVE_LABELS = {"bullish", "constructive", "positive", "strong", "up"}
_NEGATIVE_LABELS = {"bearish", "cautious", "negative", "weak", "down"}


def _day_key(value: Any) -> str:
    raw = str(value or "").strip()
    candidate = raw[:10]
    try:
        date.fromisoformat(candidate)
    except ValueError:
        return ""
    return candidate


def _normalise_slug(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")


def normalise_sector_slug(value: Any) -> str:
    """Normalise the sector key shared by instrument and article metadata."""
    return _normalise_slug(value)


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _article_text(article: Any) -> str:
    parts = [
        getattr(article, "title", ""),
        getattr(article, "summary", ""),
        getattr(article, "article_overview", ""),
        *list(getattr(article, "article_key_points", []) or []),
        *list(getattr(article, "tags", []) or []),
        *list(getattr(article, "signal_types", []) or []),
    ]
    return " ".join(str(part or "") for part in parts).lower()


def _article_score(article: Any, ticker: str = "") -> float:
    if ticker:
        target = ticker.upper().strip()
        for mention in getattr(article, "entity_mentions", []) or []:
            if not isinstance(mention, dict):
                continue
            if str(mention.get("ticker") or "").upper().strip() != target:
                continue
            if str(mention.get("mention_role") or "secondary").lower() == "incidental":
                continue
            score = _number(mention.get("sentiment_score"))
            if score is not None:
                return score
    score = _number(getattr(article, "sentiment_score", None))
    if score is not None:
        return score
    label = str(getattr(article, "sentiment_label", "") or "").lower().strip()
    if label in _POSITIVE_LABELS:
        return 0.25
    if label in _NEGATIVE_LABELS:
        return -0.25
    return 0.0


def _direction(score: float, article_count: int) -> str:
    if article_count <= 0:
        return "quiet"
    if score > 0.1:
        return "positive"
    if score < -0.1:
        return "negative"
    return "mixed"


def _themes(article: Any) -> list[str]:
    text = _article_text(article)
    explicit = [
        _normalise_slug(value)
        for value in list(getattr(article, "signal_types", []) or [])
        + list(getattr(article, "tags", []) or [])
        if _normalise_slug(value)
    ]
    inferred = [term.replace(" ", "-") for term in _THEME_TERMS if term in text]
    return list(dict.fromkeys(explicit + inferred))[:6]


def _snapshot(
    *,
    market: str,
    day: str,
    articles: list[Any],
    subject_kind: str,
    instrument_id: str = "",
    ticker: str = "",
    sector_slug: str = "",
    generated_at: str = "",
) -> dict[str, Any]:
    rows: list[tuple[Any, float]] = []
    seen_ids: set[str] = set()
    for article in articles:
        article_id = str(getattr(article, "id", "") or "").strip()
        if article_id and article_id in seen_ids:
            continue
        if article_id:
            seen_ids.add(article_id)
        rows.append((article, _article_score(article, ticker)))

    positive = [score for _, score in rows if score > 0.1]
    negative = [score for _, score in rows if score < -0.1]
    neutral = len(rows) - len(positive) - len(negative)
    mean_sentiment = sum(score for _, score in rows) / len(rows) if rows else 0.0
    negative_themes: Counter[str] = Counter()
    positive_themes: Counter[str] = Counter()
    source_names: set[str] = set()
    article_ids: list[str] = []
    latest_article_at = ""
    hard_catalyst_count = 0
    for article, score in rows:
        article_id = str(getattr(article, "id", "") or "").strip()
        if article_id:
            article_ids.append(article_id)
        source_name = str(getattr(article, "source_name", "") or "").strip()
        if source_name:
            source_names.add(source_name)
        published_at = str(getattr(article, "published_at", "") or "").strip()
        if published_at > latest_article_at:
            latest_article_at = published_at
        text = _article_text(article)
        hard_catalyst_count += int(any(term in text for term in _HARD_CATALYST_TERMS))
        theme_counter = negative_themes if score < -0.1 else positive_themes if score > 0.1 else None
        if theme_counter is not None:
            theme_counter.update(_themes(article))

    return {
        "history_version": HISTORY_VERSION,
        "market": str(market or "").upper(),
        "day": day,
        "subject_kind": subject_kind,
        "instrument_id": instrument_id,
        "ticker": ticker.upper().strip(),
        "sector_slug": sector_slug,
        "article_count": len(rows),
        "source_count": len(source_names),
        "source_names": sorted(source_names)[:30],
        "article_ids": article_ids[:50],
        "positive_count": len(positive),
        "negative_count": len(negative),
        "neutral_count": neutral,
        "mean_sentiment": round(mean_sentiment, 3),
        "direction": _direction(mean_sentiment, len(rows)),
        "hard_catalyst_count": hard_catalyst_count,
        "negative_themes": [name for name, _ in negative_themes.most_common(6)],
        "positive_themes": [name for name, _ in positive_themes.most_common(6)],
        "latest_article_at": latest_article_at,
        "generated_at": generated_at,
    }


def build_daily_evidence_snapshots(
    articles: Iterable[Any],
    *,
    market: str,
    subject_kind: str,
    instrument_id: str = "",
    ticker: str = "",
    sector_slug: str = "",
    generated_at: str = "",
) -> list[dict[str, Any]]:
    """Group the supplied evidence into idempotent calendar-day snapshots."""
    grouped: dict[str, list[Any]] = defaultdict(list)
    for article in articles:
        day = _day_key(getattr(article, "published_at", ""))
        if day:
            grouped[day].append(article)
    return [
        _snapshot(
            market=market,
            day=day,
            articles=grouped[day],
            subject_kind=subject_kind,
            instrument_id=instrument_id,
            ticker=ticker,
            sector_slug=sector_slug,
            generated_at=generated_at,
        )
        for day in sorted(grouped)
    ]


def merge_evidence_history_rows(
    stored_rows: Iterable[dict[str, Any]] | None,
    current_rows: Iterable[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Merge stored and freshly-derived rows, with the fresh row winning by day."""
    by_day: dict[str, dict[str, Any]] = {}
    for row in list(stored_rows or []) + list(current_rows or []):
        if not isinstance(row, dict):
            continue
        day = _day_key(row.get("day") or row.get("date"))
        if day:
            by_day[day] = {**row, "day": day}
    return [by_day[day] for day in sorted(by_day)]


def merge_evidence_history_for_storage(
    stored_rows: Iterable[dict[str, Any]] | None,
    current_rows: Iterable[dict[str, Any]] | None,
    *,
    keep_days: int = 30,
) -> list[dict[str, Any]]:
    """Rows to persist: one per day, newest ``keep_days`` days.

    Unlike ``merge_evidence_history_rows`` the fresh row does not always win.
    A single-stock on-demand run sees far fewer articles than the full run, so
    for the same day the row built from more articles is kept.
    """
    by_day: dict[str, dict[str, Any]] = {}
    for row in list(stored_rows or []) + list(current_rows or []):
        if not isinstance(row, dict):
            continue
        day = _day_key(row.get("day") or row.get("date"))
        if not day:
            continue
        existing = by_day.get(day)
        if existing is None or int(row.get("article_count") or 0) >= int(existing.get("article_count") or 0):
            by_day[day] = {**row, "day": day}
    return [by_day[day] for day in sorted(by_day)][-max(1, keep_days):]


def summarize_evidence_history(
    rows: Iterable[dict[str, Any]] | None,
    *,
    lookback_days: int = 5,
) -> dict[str, Any]:
    """Turn daily rows into a prompt-sized signal with an explicit cold start."""
    merged = merge_evidence_history_rows(rows, None)
    recent = merged[-max(1, lookback_days):]
    if not recent:
        return {
            "history_version": HISTORY_VERSION,
            "history_status": "no_history",
            "coverage_days": 0,
            "lookback_days": lookback_days,
            "trend": "insufficient_history",
            "negative_streak": 0,
            "positive_streak": 0,
            "negative_days": 0,
            "positive_days": 0,
            "article_count": 0,
            "source_count": 0,
            "weighted_mean_sentiment": 0.0,
            "repeated_negative_themes": [],
            "recent_days": [],
        }

    negative_days = sum(1 for row in recent if str(row.get("direction")) == "negative")
    positive_days = sum(1 for row in recent if str(row.get("direction")) == "positive")
    negative_streak = 0
    positive_streak = 0
    for row in reversed(recent):
        direction = str(row.get("direction") or "")
        if direction == "negative" and positive_streak == 0:
            negative_streak += 1
        else:
            break
    for row in reversed(recent):
        direction = str(row.get("direction") or "")
        if direction == "positive" and negative_streak == 0:
            positive_streak += 1
        else:
            break

    weights = list(range(1, len(recent) + 1))
    weighted_mean = sum(
        (_number(row.get("mean_sentiment")) or 0.0) * weight
        for row, weight in zip(recent, weights)
    )
    weight_total = sum(weights)
    weighted_mean = weighted_mean / weight_total if recent else 0.0
    negative_theme_counts: Counter[str] = Counter()
    for row in recent:
        negative_theme_counts.update(str(theme) for theme in row.get("negative_themes") or [] if str(theme).strip())

    if negative_streak >= 2 or (negative_days >= 3 and weighted_mean < -0.05):
        trend = "negative_building"
    elif positive_streak >= 2 or (positive_days >= 3 and weighted_mean > 0.05):
        trend = "positive_building"
    elif negative_days and positive_days:
        trend = "mixed"
    elif negative_days:
        trend = "negative"
    elif positive_days:
        trend = "positive"
    else:
        trend = "quiet"

    if len(recent) == 1:
        history_status = "current_only"
    elif len(recent) < lookback_days:
        history_status = "building"
    else:
        history_status = "established"

    source_names = {
        str(source).strip()
        for row in recent
        for source in row.get("source_names") or []
        if str(source).strip()
    }
    return {
        "history_version": HISTORY_VERSION,
        "history_status": history_status,
        "coverage_days": len(recent),
        "lookback_days": lookback_days,
        "latest_day": str(recent[-1].get("day") or ""),
        "trend": trend,
        "negative_streak": negative_streak,
        "positive_streak": positive_streak,
        "negative_days": negative_days,
        "positive_days": positive_days,
        "article_count": sum(int(row.get("article_count") or 0) for row in recent),
        "source_count": len(source_names),
        "weighted_mean_sentiment": round(weighted_mean, 3),
        "repeated_negative_themes": [
            theme for theme, count in negative_theme_counts.most_common(6) if count >= 2
        ],
        "recent_days": [
            {
                "day": str(row.get("day") or ""),
                "article_count": int(row.get("article_count") or 0),
                "mean_sentiment": round(_number(row.get("mean_sentiment")) or 0.0, 3),
                "direction": str(row.get("direction") or "mixed"),
                "hard_catalyst_count": int(row.get("hard_catalyst_count") or 0),
                "negative_themes": list(row.get("negative_themes") or [])[:4],
                "positive_themes": list(row.get("positive_themes") or [])[:4],
            }
            for row in recent
        ],
    }
