"""Fetch ACTUAL reported earnings from Alpha Vantage's EARNINGS endpoint.

The earnings *calendar* (sync_earnings_calendar) only carries estimates and the
report date. This module fetches the *actuals* - reportedEPS, the estimate that
was in place, and the surprise - so post-earnings reports and the AI news brief
can talk about a real beat/miss instead of parroting the estimate as if it were
the result.

Alpha Vantage's free tier is rate-limited, so callers should fetch only for the
handful of stocks that just reported (not the whole universe), with a short
sleep between calls.
"""
from __future__ import annotations

from datetime import datetime
import math
from typing import Any

import requests

from backend.news_av import _pick_key

AV_URL = "https://www.alphavantage.co/query"


def _to_float(value: Any) -> float | None:
    try:
        if value in (None, "", "None", "none"):
            return None
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def _parse_date(value: str) -> datetime | None:
    candidate = str(value or "").split("T", 1)[0].strip()
    if not candidate:
        return None
    try:
        return datetime.strptime(candidate, "%Y-%m-%d")
    except ValueError:
        return None


def _yf_index_date(value: Any) -> str:
    try:
        if hasattr(value, "to_pydatetime"):
            return value.to_pydatetime().strftime("%Y-%m-%d")
        text = str(value or "").strip()
        if len(text) >= 10 and text[4] == "-" and text[7] == "-":
            return text[:10]
    except Exception:
        pass
    return ""


def fetch_yfinance_quarterly_actuals(ticker: str) -> list[dict[str, Any]]:
    """Yahoo fallback when Alpha Vantage actuals are missing or rate-limited."""
    try:
        import yfinance as yf
    except Exception:
        return []
    try:
        frame = yf.Ticker(ticker.upper().strip()).earnings_dates
    except Exception:
        return []
    if frame is None or getattr(frame, "empty", True):
        return []

    out: list[dict[str, Any]] = []
    for idx, row in frame.iterrows():
        reported_eps = _to_float(row.get("Reported EPS"))
        if reported_eps is None:
            continue
        estimated_eps = _to_float(row.get("EPS Estimate"))
        surprise_pct = _to_float(row.get("Surprise(%)"))
        surprise = (
            reported_eps - estimated_eps
            if estimated_eps is not None and reported_eps is not None
            else None
        )
        reported_date = _yf_index_date(idx)
        if not reported_date:
            continue
        out.append(
            {
                "fiscal_date_ending": "",
                "reported_date": reported_date,
                "reported_eps": reported_eps,
                "estimated_eps": estimated_eps,
                "surprise": surprise,
                "surprise_pct": surprise_pct,
            }
        )
    return out


def fetch_quarterly_actuals(
    ticker: str,
    *,
    api_key: str | None = None,
    timeout: int = 20,
) -> list[dict[str, Any]]:
    """Return quarterly actuals for a ticker, newest-first. Empty list on error.

    Each row: fiscal_date_ending, reported_date, reported_eps, estimated_eps,
    surprise, surprise_pct.
    """
    key = _pick_key(api_key)
    params = {"function": "EARNINGS", "symbol": ticker.upper().strip(), "apikey": key}
    try:
        resp = requests.get(AV_URL, params=params, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []
    if not isinstance(data, dict):
        return []
    # AV returns {"Note": ...} or {"Information": ...} when rate-limited.
    if data.get("Note") or data.get("Information") or data.get("Error Message"):
        return []
    rows = data.get("quarterlyEarnings") or []
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        out.append(
            {
                "fiscal_date_ending": str(row.get("fiscalDateEnding") or "").strip(),
                "reported_date": str(row.get("reportedDate") or "").strip(),
                "reported_eps": _to_float(row.get("reportedEPS")),
                "estimated_eps": _to_float(row.get("estimatedEPS")),
                "surprise": _to_float(row.get("surprise")),
                "surprise_pct": _to_float(row.get("surprisePercentage")),
            }
        )
    return out


def pick_actual_for_event(
    actuals: list[dict[str, Any]],
    event_date: str,
    *,
    tolerance_days: int = 4,
) -> dict[str, Any] | None:
    """Pick the quarterly actual that corresponds to a calendar event_date.

    Match on reported_date first (exact, then within tolerance), since the
    calendar's event_date IS the report date. Only returns a row that actually
    has a reported_eps - an entry with no actual is not a real result.
    """
    target = _parse_date(event_date)
    if target is None:
        return None
    best: dict[str, Any] | None = None
    best_gap = None
    for row in actuals:
        reported_eps = row.get("reported_eps")
        if reported_eps is None:
            continue
        estimated_eps = row.get("estimated_eps")
        surprise = row.get("surprise")
        surprise_pct = row.get("surprise_pct")
        if (
            reported_eps == 0
            and estimated_eps not in (None, 0)
            and surprise is not None
            and abs(float(surprise) + float(estimated_eps)) < 0.0001
            and surprise_pct is not None
            and abs(float(surprise_pct) + 100.0) < 0.01
        ):
            # Alpha Vantage sometimes publishes a same-day placeholder row with
            # reportedEPS=0 and surprise=-estimate before the real print settles.
            # Treat that as "not captured yet" instead of generating fake misses.
            continue
        reported = _parse_date(row.get("reported_date", ""))
        if reported is None:
            continue
        gap = abs((reported - target).days)
        if gap > tolerance_days:
            continue
        if best_gap is None or gap < best_gap:
            best, best_gap = row, gap
    return best


def summarize_surprise(actual: dict[str, Any]) -> str:
    """Human label for a beat/miss given an actuals row."""
    pct = actual.get("surprise_pct")
    reported = actual.get("reported_eps")
    estimate = actual.get("estimated_eps")
    if reported is None:
        return "unknown"
    if pct is None and estimate is not None:
        diff = reported - estimate
        pct = (diff / abs(estimate) * 100.0) if estimate else None
    if pct is None:
        return "reported"
    if pct >= 1.0:
        return "beat"
    if pct <= -1.0:
        return "miss"
    return "in-line"
