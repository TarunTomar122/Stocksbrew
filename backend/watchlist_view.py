"""Assemble a materialized watchlist view for a user.

Join pattern: for each instrument_id in `tracked_stocks`, pull the already-
computed intel_pro doc (scores, verdict, catalysts) + the latest price doc
(price, day change, history_window) + the user's alert flags, then fold into
one self-contained doc at `tm_watchlist_views/{uid}`.

Consumers read that one doc on `/watchlist` page load - no per-entity
Firestore round trips at render time.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
import json
from pathlib import Path
from typing import Any

from backend.storage import TraceMoneyStore
from backend.llm_client import LLM_BRIEF_SOURCE
from backend.stock_intelligence import generate_portfolio_brief

FREE_WATCHLIST_ROW_CAP = 3
MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}


def _market_from_instrument_id(instrument_id: str) -> str:
    prefix = instrument_id.split("_", 1)[0] if "_" in instrument_id else ""
    return prefix if prefix in {"US", "IN"} else ""


def _position_type(instrument_id: str, positions: dict[str, Any] | None) -> str:
    return "holding" if (positions or {}).get(instrument_id) == "holding" else "watchlist"


def _active_universe_cache(store: TraceMoneyStore) -> dict[str, str]:
    """Return active universe ids. Cached per build run."""
    us_universe = store.get_active_universe("US")
    if not us_universe:
        raise ValueError("Missing active universe config key: US_universe")
    in_ai = store.get_active_ai_universe("IN")
    in_price = store.get_active_price_universe("IN")
    return {
        "US_ai": str(us_universe),
        "IN_ai": str(in_ai or ""),
        "US_price": str(us_universe),
        "IN_price": str(in_price or ""),
    }


def _instrument_meta_by_id(store: TraceMoneyStore, ids: list[str]) -> dict[str, dict[str, Any]]:
    """Load instrument metadata keyed by the document ID, never response order."""
    return {
        snap.id: (snap.to_dict() or {})
        for snap in store.db.get_all(
            [store.db.collection("tm_instruments").document(instrument_id) for instrument_id in ids]
        )
        if snap.exists and snap.id in ids
    }


def _safe_float(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if isinstance(value, (int, float)) else None


def _normalize_holding(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    quantity = _safe_float(raw.get("quantity"))
    market_value = _safe_float(raw.get("market_value"))
    average_cost = _safe_float(raw.get("average_cost"))
    if quantity is not None and quantity < 0:
        quantity = None
    if market_value is not None and market_value < 0:
        market_value = None
    if average_cost is not None and average_cost < 0:
        average_cost = None
    currency = str(raw.get("currency") or "").strip().upper()
    source = str(raw.get("source") or "unknown").strip().lower() or "unknown"
    updated_at = str(raw.get("updated_at") or "").strip()
    return {
        "quantity": quantity,
        "market_value": market_value,
        "average_cost": average_cost,
        "currency": currency,
        "source": source,
        "updated_at": updated_at,
    }


def _signed_pct(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:+.1f}%"


def _metric_value(intel_pro: dict[str, Any], pillar: str, label: str) -> float | None:
    metrics = ((intel_pro.get("pillars") or {}).get(pillar) or {}).get("metrics") or []
    for metric in metrics:
        if str(metric.get("label") or "").strip().lower() == label.lower():
            return _safe_float(metric.get("value"))
    return None


def _metric_summary(intel_pro: dict[str, Any], pillar: str, label: str) -> str:
    metrics = ((intel_pro.get("pillars") or {}).get(pillar) or {}).get("metrics") or []
    for metric in metrics:
        if str(metric.get("label") or "").strip().lower() == label.lower():
            return str(metric.get("summary") or "").strip()
    return ""


def _price_universe(market: str, active_universes: dict[str, str]) -> str:
    key = f"{market}_price"
    value = str(active_universes.get(key) or "").strip()
    if not value:
        raise ValueError(f"Missing active universe key: {key}")
    return value


def _ai_universe(market: str, active_universes: dict[str, str]) -> str:
    key = f"{market}_ai"
    value = str(active_universes.get(key) or "").strip()
    if not value:
        raise ValueError(f"Missing active universe key: {key}")
    return value


def _first_metric_summary(intel_pro: dict[str, Any], pillar: str) -> str:
    metrics = ((intel_pro.get("pillars") or {}).get(pillar) or {}).get("metrics") or []
    for metric in metrics:
        summary = str(metric.get("summary") or "").strip()
        if summary:
            return summary
    return ""


def _row_microcopy(
    ticker: str,
    day_change_pct: float | None,
    intel_pro: dict[str, Any],
    alerts: list[dict[str, Any]],
) -> tuple[str, str]:
    if alerts:
        first = alerts[0]
        message = str(first.get("message") or first.get("label") or first.get("type") or "").strip()
        if message:
            return message[:120], "wild"

    overall = intel_pro.get("overall") or {}
    pillars = intel_pro.get("pillars") or {}
    score = _safe_float(overall.get("score"))
    best_pillar = ""
    best_score = -1.0
    for key, payload in pillars.items():
        pillar_score = _safe_float((payload or {}).get("score"))
        if pillar_score is not None and pillar_score > best_score:
            best_pillar = str(key)
            best_score = pillar_score

    if score is not None and best_pillar:
        detail = _first_metric_summary(intel_pro, best_pillar)
        label = best_pillar.replace("_", " ")
        text = f"{label.title()} leads the scorecard"
        if detail:
            text = f"{text}: {detail}"
        vibe = "up" if score >= 70 else "wild" if score >= 50 else "down"
        return text[:120], vibe

    if day_change_pct is not None:
        direction = "ripping" if day_change_pct > 0 else "under pressure"
        return f"{ticker} is {direction} with AI score pending.", "up" if day_change_pct > 0 else "down"

    return f"{ticker} has price coverage; deeper AI score is pending.", "wild"


def _compact_alert_flags(alert_docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    for doc in alert_docs:
        if isinstance(doc.get("flags"), list):
            flags.extend([f for f in doc["flags"] if isinstance(f, dict)])
        else:
            flags.append(doc)
    return flags


def _facts_summary(facts: dict[str, Any]) -> dict[str, Any]:
    analyst = facts.get("analyst") or {}
    returns = facts.get("returns") or {}
    quick = facts.get("quick_stats") or {}
    financials = facts.get("financials") or {}
    institutions = facts.get("institutions") or {}
    return {
        "returns": {
            "one_month_pct": _safe_float(returns.get("one_month_pct")),
            "three_month_pct": _safe_float(returns.get("three_month_pct")),
            "six_month_pct": _safe_float(returns.get("six_month_pct")),
            "one_year_pct": _safe_float(returns.get("one_year_pct")),
        },
        "quick_stats": {
            "market_cap": _safe_float(quick.get("market_cap")),
            "pe_ttm": _safe_float(quick.get("pe_ttm")),
            "eps_next_year_growth_pct": _safe_float(quick.get("eps_next_year_growth_pct")),
            "institutional_ownership_pct": _safe_float(quick.get("institutional_ownership_pct")),
            "recommendation_score": _safe_float(quick.get("recommendation_score")),
        },
        "analyst": {
            "label": analyst.get("label"),
            "target_price": _safe_float(analyst.get("target_price")),
            "target_low": _safe_float(analyst.get("target_low")),
            "target_high": _safe_float(analyst.get("target_high")),
            "buy": int(analyst.get("buy") or 0),
            "hold": int(analyst.get("hold") or 0),
            "sell": int(analyst.get("sell") or 0),
            "analyst_count": int(analyst.get("analyst_count") or 0),
        },
        "events": [
            event for event in (facts.get("events") or [])
            if isinstance(event, dict) and _event_is_current(str(event.get("date_label") or ""))
        ],
        "financials": {
            "fiscal_year": financials.get("fiscal_year"),
            "revenue": _safe_float(financials.get("revenue")),
            "revenue_growth_yoy_pct": _safe_float(financials.get("revenue_growth_yoy_pct")),
            "operating_income": _safe_float(financials.get("operating_income")),
            "net_income": _safe_float(financials.get("net_income")),
            "eps_diluted": _safe_float(financials.get("eps_diluted")),
        },
        "institutions": {
            "ownership_pct": _safe_float(institutions.get("ownership_pct")),
            "top_holders": (institutions.get("top_holders") or [])[:3],
        },
    }


def _technical_summary(technical: dict[str, Any]) -> dict[str, Any]:
    return {
        "rsi_14": technical.get("rsi_14") or {},
        "moving_averages": technical.get("moving_averages") or {},
        "distance": technical.get("distance") or {},
    }


def _mention_summary(mention_stats: dict[str, Any]) -> dict[str, Any]:
    days = mention_stats.get("days") or {}
    counts = [float((payload or {}).get("count") or 0) for _day, payload in sorted(days.items())[-7:]]
    sentiment_values = [
        float(payload.get("sentiment_sum", 0)) / max(float(payload.get("sentiment_n", 0)), 1)
        for _day, payload in sorted(days.items())[-7:]
        if float((payload or {}).get("sentiment_n") or 0) > 0
    ]
    return {
        "mentions_1d": counts[-1] if counts else 0,
        "mentions_7d": round(sum(counts), 2),
        "avg_sentiment_7d": round(sum(sentiment_values) / len(sentiment_values), 3) if sentiment_values else None,
    }


def _target_upside_pct(price: float | None, facts: dict[str, Any], intel_pro: dict[str, Any]) -> float | None:
    analyst_target = _safe_float(((facts.get("analyst") or {}).get("target_price")))
    if analyst_target is None:
        analyst_target = _metric_value(intel_pro, "valuation", "Analyst target")
    if price and analyst_target:
        return round(((analyst_target - price) / price) * 100.0, 2)
    return None


def _parse_event_date(raw: Any) -> date | None:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    text = str(raw).strip()
    if not text:
        return None

    # ISO date first: YYYY-MM-DD
    iso_candidate = text.split("T", 1)[0]
    try:
        return datetime.strptime(iso_candidate, "%Y-%m-%d").date()
    except ValueError:
        pass

    # Month day labels like "May 20 AMC" / "May 20, 2026"
    cleaned = (
        text.lower()
        .replace(",", " ")
        .replace("amc", "")
        .replace("bmo", "")
        .replace("after close", "")
        .replace("before open", "")
        .replace("during market", "")
        .strip()
    )
    parts = [part for part in cleaned.split() if part]
    if len(parts) < 2:
        return None

    month = MONTHS.get(parts[0][:3])
    if not month:
        return None
    try:
        day = int(parts[1])
    except (TypeError, ValueError):
        return None

    today = datetime.now(timezone.utc).date()
    parsed_year = None
    if len(parts) >= 3:
        try:
            parsed_year = int(parts[2])
        except (TypeError, ValueError):
            parsed_year = None
    year = parsed_year or today.year

    try:
        event_date = date(year=year, month=month, day=day)
    except ValueError:
        return None

    if parsed_year is None:
        # Handle year-boundary labels that omit year (e.g. Dec viewing Jan event).
        if (event_date - today).days < -180:
            try:
                event_date = date(year=year + 1, month=month, day=day)
            except ValueError:
                return None
        elif (event_date - today).days > 180:
            try:
                event_date = date(year=year - 1, month=month, day=day)
            except ValueError:
                return None
    return event_date


def _event_is_current(date_label: str) -> bool:
    parsed = _parse_event_date(date_label)
    if parsed is None:
        return False
    today = datetime.now(timezone.utc).date()
    delta = (parsed - today).days
    return -1 <= delta <= 45


def _catalyst_merge_key(catalyst: dict[str, Any]) -> str:
    """Dedupe earnings from facts + intel_pro on calendar date, not title shape."""
    kind = str(catalyst.get("kind") or "").lower()
    if kind != "earnings":
        return f"{kind}|{str(catalyst.get('title') or '').strip().lower()}"
    parsed = (
        _parse_event_date(catalyst.get("date"))
        or _parse_event_date(catalyst.get("date_label"))
        or _parse_event_date(catalyst.get("window"))
    )
    if parsed is None:
        title = str(catalyst.get("title") or "")
        parts = title.split()
        if len(parts) >= 3:
            parsed = _parse_event_date(" ".join(parts[1:]))
    if parsed is not None:
        return f"earnings|{parsed.isoformat()}"
    return f"earnings|{str(catalyst.get('title') or '').strip().lower()}"


def _catalyst_richness(catalyst: dict[str, Any]) -> int:
    score = 0
    if catalyst.get("date"):
        score += 4
    if catalyst.get("date_label"):
        score += 2
    if catalyst.get("window"):
        score += 2
    return score


def _catalyst_is_current(catalyst: dict[str, Any]) -> bool:
    if str(catalyst.get("kind") or "").lower() != "earnings":
        return True
    parsed = (
        _parse_event_date(catalyst.get("date"))
        or _parse_event_date(catalyst.get("date_label"))
        or _parse_event_date(catalyst.get("window"))
    )
    if parsed is None:
        title = str(catalyst.get("title") or "")
        parts = title.split()
        if len(parts) >= 3:
            parsed = _parse_event_date(" ".join(parts[1:]))
    if parsed is None:
        return False
    today = datetime.now(timezone.utc).date()
    delta = (parsed - today).days
    return -1 <= delta <= 45


def _facts_earnings_catalysts(facts: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for event in (facts.get("events") or []):
        if not isinstance(event, dict):
            continue
        if str(event.get("kind") or "").lower() != "earnings":
            continue
        parsed = _parse_event_date(event.get("date")) or _parse_event_date(event.get("date_label"))
        if parsed is None:
            continue
        today = datetime.now(timezone.utc).date()
        delta = (parsed - today).days
        if not (-1 <= delta <= 45):
            continue
        date_label = str(event.get("date_label") or parsed.strftime("%b %d"))
        out.append(
            {
                "kind": "earnings",
                "title": f"Earnings {date_label}",
                "date": parsed.isoformat(),
                "date_label": date_label,
                "urgency": "high" if delta <= 7 else "med",
                "window": date_label,
                "source": event.get("source") or "facts",
            }
        )
    return out


def _row_premium_signals(
    ticker: str,
    price: float | None,
    day_change_pct: float | None,
    facts: dict[str, Any],
    intel_pro: dict[str, Any],
    technical: dict[str, Any],
    alerts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    facts_compact = _facts_summary(facts)
    target_upside = _target_upside_pct(price, facts, intel_pro)
    analyst = facts_compact["analyst"]
    if target_upside is not None:
        signals.append({
            "kind": "analyst_upside",
            "label": "Analyst runway",
            "value": target_upside,
            "unit": "%",
            "tone": "positive" if target_upside >= 10 else "neutral" if target_upside >= 0 else "negative",
            "sentence": f"{ticker} has {target_upside:+.1f}% target runway from {analyst.get('analyst_count', 0)} analysts.",
        })
    one_month = _safe_float((facts_compact["returns"] or {}).get("one_month_pct"))
    one_year = _safe_float((facts_compact["returns"] or {}).get("one_year_pct"))
    if one_month is not None or one_year is not None:
        signals.append({
            "kind": "return_profile",
            "label": "Return profile",
            "value": one_month,
            "unit": "%",
            "tone": "positive" if (one_month or 0) > 5 else "negative" if (one_month or 0) < -5 else "neutral",
            "sentence": f"Returns: 1M {one_month:+.1f}% / 1Y {one_year:+.1f}%" if one_month is not None and one_year is not None else "Return history available.",
        })
    rsi = _safe_float(((technical.get("rsi_14") or {}).get("value")))
    rsi_state = str(((technical.get("rsi_14") or {}).get("state") or "")).replace("_", " ")
    if rsi is not None:
        signals.append({
            "kind": "technical_state",
            "label": "Technical setup",
            "value": rsi,
            "unit": "RSI",
            "tone": "negative" if rsi >= 70 else "positive" if rsi <= 35 else "neutral",
            "sentence": f"RSI {rsi:.1f} is {rsi_state or 'neutral'}.",
        })
    ownership = _safe_float((facts_compact["quick_stats"] or {}).get("institutional_ownership_pct"))
    if ownership is not None:
        signals.append({
            "kind": "ownership",
            "label": "Ownership",
            "value": ownership,
            "unit": "%",
            "tone": "positive" if ownership >= 60 else "neutral",
            "sentence": f"Institutions own {ownership:.1f}% of {ticker}.",
        })
    for event in (facts_compact.get("events") or [])[:1]:
        title = str(event.get("title") or event.get("kind") or "Event")
        date_label = str(event.get("date_label") or "").strip()
        if date_label and _event_is_current(date_label):
            signals.append({
                "kind": "event",
                "label": title,
                "value": date_label,
                "tone": "neutral",
                "sentence": f"{title}: {date_label}.",
            })
    for flag in alerts[:1]:
        message = str(flag.get("message") or flag.get("label") or flag.get("type") or "").strip()
        if message:
            signals.append({
                "kind": "alert",
                "label": "Alert",
                "value": flag.get("type") or flag.get("kind"),
                "tone": "negative" if "bear" in str(flag).lower() else "neutral",
                "sentence": message,
            })
    if day_change_pct is not None and abs(day_change_pct) >= 3:
        signals.append({
            "kind": "price_move",
            "label": "Large move",
            "value": round(day_change_pct, 2),
            "unit": "%",
            "tone": "positive" if day_change_pct > 0 else "negative",
            "sentence": f"{ticker} moved {day_change_pct:+.1f}% today.",
        })
    return signals[:6]


def _row_attention(
    position_type: str,
    ticker: str,
    day_change_pct: float | None,
    target_upside: float | None,
    facts: dict[str, Any],
    technical: dict[str, Any],
    mention_summary: dict[str, Any],
    alerts: list[dict[str, Any]],
) -> dict[str, Any]:
    facts_compact = _facts_summary(facts)
    one_month = _safe_float((facts_compact.get("returns") or {}).get("one_month_pct"))
    rsi = _safe_float(((technical.get("rsi_14") or {}).get("value")))
    mentions_1d = _safe_float(mention_summary.get("mentions_1d")) or 0
    mentions_7d = _safe_float(mention_summary.get("mentions_7d")) or 0
    first_alert = alerts[0] if alerts else {}
    alert_message = str(first_alert.get("message") or first_alert.get("label") or "").strip()
    if alert_message:
        return {
            "attention_score": 92,
            "attention_reason": alert_message,
            "attention_kind": "risk",
            "suggested_action": "Review holding" if position_type == "holding" else "Keep watching",
            "action_tone": "negative",
        }
    if day_change_pct is not None and abs(day_change_pct) >= 3:
        up = day_change_pct > 0
        return {
            "attention_score": 88 if abs(day_change_pct) >= 5 else 74,
            "attention_reason": (
                f"{ticker} moved {_signed_pct(day_change_pct)} today"
                + (f" and is {_signed_pct(one_month)} over 1M" if one_month is not None else "")
                + "."
            ),
            "attention_kind": "move",
            "suggested_action": (
                "Check if move changes trim/add plan" if position_type == "holding" and up
                else "Check if thesis is intact" if position_type == "holding"
                else "Do not chase blindly" if up
                else "Watch for entry setup"
            ),
            "action_tone": "positive" if up else "negative",
        }
    if rsi is not None and (rsi >= 70 or rsi <= 35):
        stretched = rsi >= 70
        return {
            "attention_score": 78 if stretched else 72,
            "attention_reason": f"{ticker} RSI is {rsi:.1f}, {'stretched after strength' if stretched else 'washed out after weakness'}.",
            "attention_kind": "risk" if stretched else "opportunity",
            "suggested_action": (
                "Avoid adding into heat" if position_type == "holding" and stretched
                else "Decide if weakness is buyable" if position_type == "holding"
                else "Wait for pullback" if stretched
                else "Investigate entry"
            ),
            "action_tone": "negative" if stretched else "positive",
        }
    if target_upside is not None and abs(target_upside) >= 15:
        positive = target_upside > 0
        return {
            "attention_score": 68 if positive else 76,
            "attention_reason": f"{ticker} has {_signed_pct(target_upside)} analyst target runway.",
            "attention_kind": "opportunity" if positive else "risk",
            "suggested_action": (
                "Let thesis breathe" if position_type == "holding" and positive
                else "Recheck valuation risk" if position_type == "holding"
                else "Add to shortlist" if positive
                else "Avoid until reset"
            ),
            "action_tone": "positive" if positive else "negative",
        }
    if mentions_1d >= 2 or mentions_7d >= 4:
        return {
            "attention_score": 64,
            "attention_reason": f"{ticker} has elevated news activity: {mentions_1d:.0f} today, {mentions_7d:.0f} this week.",
            "attention_kind": "news",
            "suggested_action": "Read latest context",
            "action_tone": "neutral",
        }
    return {
        "attention_score": 35,
        "attention_reason": f"Nothing material has changed for {ticker} today.",
        "attention_kind": "calm",
        "suggested_action": "Hold thesis" if position_type == "holding" else "Keep on watch",
        "action_tone": "neutral",
    }


def _holding_status(position_type: str, holding_payload: dict[str, Any] | None) -> str:
    if position_type != "holding":
        return "watchlist"
    if not isinstance(holding_payload, dict):
        return "unknown"
    quantity = _safe_float(holding_payload.get("quantity"))
    market_value = _safe_float(holding_payload.get("market_value"))
    computed_value = _safe_float(holding_payload.get("computed_market_value"))
    if (quantity is not None and quantity > 0) or (market_value is not None and market_value > 0) or (computed_value is not None and computed_value > 0):
        return "known"
    return "unknown"


def _directive_trigger(directive: dict[str, Any]) -> str | None:
    zones = directive.get("zones") if isinstance(directive.get("zones"), dict) else {}
    if not isinstance(zones, dict):
        return None
    if isinstance(zones.get("accumulate_below"), (int, float)):
        return f"below {zones['accumulate_below']:.2f}"
    if isinstance(zones.get("breakout_above"), (int, float)):
        return f"above {zones['breakout_above']:.2f}"
    if isinstance(zones.get("trim_above"), (int, float)):
        return f"above {zones['trim_above']:.2f}"
    return None


def _directive_v2(row: dict[str, Any], directive: dict[str, Any] | None = None) -> dict[str, Any]:
    ai = directive if isinstance(directive, dict) else ((row.get("ai_directive") or {}) if isinstance(row.get("ai_directive"), dict) else {})
    stance = str(ai.get("stance") or "watch").lower()
    action = ai.get("action") if isinstance(ai.get("action"), dict) else {}
    text = str(ai.get("text") or action.get("label") or row.get("ai_directive_text") or "").strip()
    trigger = str(ai.get("trigger") or "").strip() or _directive_trigger(ai)
    confidence = str(ai.get("confidence") or "low").lower()
    holding = row.get("holding") if isinstance(row.get("holding"), dict) else {}
    holding_status = _holding_status(str(row.get("position_type") or "watchlist"), holding)
    weight = _safe_float((holding or {}).get("portfolio_weight_pct")) or 0.0
    score = _safe_float((row.get("scores") or {}).get("overall")) or 50.0
    day_change = _safe_float(row.get("day_change_pct")) or 0.0

    priority = "low"
    if stance in {"trim", "avoid"}:
        priority = "high" if weight >= 10 or confidence == "high" else "medium"
    elif stance in {"accumulate"}:
        priority = "high" if confidence == "high" and day_change <= -2 else "medium"
    elif stance in {"watch"}:
        priority = "medium" if abs(day_change) >= 3 or score < 50 else "low"
    elif stance in {"hold"}:
        priority = "medium" if weight >= 20 and score < 55 else "low"

    if holding_status == "unknown" and row.get("position_type") == "holding" and priority == "high":
        priority = "medium"

    if text:
        title = text
    elif stance == "trim":
        title = "Trim exposure"
    elif stance == "avoid":
        title = "Avoid adding"
    elif stance == "accumulate":
        title = "Accumulate on weakness"
    elif stance == "hold":
        title = "Hold position"
    else:
        title = "Keep on watch"

    detail = str(action.get("summary") or ai.get("watch_out") or ai.get("detail") or "").strip() or None

    return {
        **ai,
        "title": title[:140],
        "detail": detail[:180] if detail else None,
        "priority": priority,
        "trigger": trigger,
        "holding_status": holding_status,
    }


def _previous_rows_by_id(previous_view: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    rows = (previous_view or {}).get("rows") or []
    return {
        str(row.get("instrument_id")): row
        for row in rows
        if isinstance(row, dict) and row.get("instrument_id")
    }


def _score_delta(current: dict[str, Any], previous: dict[str, Any] | None, key: str) -> float | None:
    curr = _safe_float((current.get("scores") or {}).get(key))
    prev = _safe_float(((previous or {}).get("scores") or {}).get(key))
    if curr is None or prev is None:
        return None
    return round(curr - prev, 1)


def _value_delta(current: Any, previous: Any) -> float | None:
    curr = _safe_float(current)
    prev = _safe_float(previous)
    if curr is None or prev is None:
        return None
    return round(curr - prev, 2)


def _apply_row_deltas(rows: list[dict[str, Any]], previous_view: dict[str, Any] | None) -> list[dict[str, Any]]:
    previous_by_id = _previous_rows_by_id(previous_view)
    for row in rows:
        previous = previous_by_id.get(str(row.get("instrument_id")))
        score_deltas = {
            key: _score_delta(row, previous, key)
            for key in ("overall", "valuation", "growth", "quality", "momentum")
        }
        target_delta = _value_delta(row.get("target_upside_pct"), (previous or {}).get("target_upside_pct"))
        day_change_delta = _value_delta(row.get("day_change_pct"), (previous or {}).get("day_change_pct"))
        new_alerts = []
        previous_alert_keys = {
            str(alert.get("type") or alert.get("kind") or alert.get("message") or alert)
            for alert in ((previous or {}).get("alerts") or [])
            if isinstance(alert, dict)
        }
        for alert in row.get("alerts") or []:
            if not isinstance(alert, dict):
                continue
            key = str(alert.get("type") or alert.get("kind") or alert.get("message") or alert)
            if key not in previous_alert_keys:
                new_alerts.append(alert)
        material = [
            value for value in [*score_deltas.values(), target_delta, day_change_delta]
            if isinstance(value, (int, float)) and abs(value) >= 1
        ]
        row["changes"] = {
            "is_new": previous is None,
            "score_deltas": score_deltas,
            "target_upside_delta": target_delta,
            "day_change_delta": day_change_delta,
            "new_alerts": new_alerts[:3],
            "has_material_change": previous is None or bool(material) or bool(new_alerts),
        }
    return rows


def _row_for_instrument(
    instrument_id: str,
    position_type: str,
    holding_raw: dict[str, Any] | None,
    instrument_meta: dict[str, Any],
    latest: dict[str, Any],
    intel_pro: dict[str, Any],
    stock_intel: dict[str, Any],
    facts: dict[str, Any],
    technical: dict[str, Any],
    mention_stats: dict[str, Any],
    alerts_by_instrument: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    market = _market_from_instrument_id(instrument_id)
    if not market:
        return None

    if not latest:
        return None
    quote = latest.get("quote") or {}

    pillars = intel_pro.get("pillars") or {}
    overall = intel_pro.get("overall") or {}
    alert_flags = _compact_alert_flags(alerts_by_instrument.get(instrument_id, []))
    ticker = str(latest.get("ticker") or intel_pro.get("ticker") or instrument_id.split("_", 1)[-1])
    day_change = _safe_float(quote.get("day_change_pct"))
    price = _safe_float(quote.get("current"))
    mention_summary = _mention_summary(mention_stats)
    target_upside = _target_upside_pct(price, facts, intel_pro)
    holding_in = _normalize_holding(holding_raw)
    quantity = _safe_float(holding_in.get("quantity"))
    entered_market_value = _safe_float(holding_in.get("market_value"))
    average_cost = _safe_float(holding_in.get("average_cost"))
    computed_market_value = quantity * price if quantity is not None and price is not None else None
    effective_market_value = computed_market_value if computed_market_value is not None else entered_market_value
    cost_basis = quantity * average_cost if quantity is not None and average_cost is not None else None
    unrealized_gain_pct = None
    if (
        computed_market_value is not None
        and cost_basis is not None
        and cost_basis > 0
    ):
        unrealized_gain_pct = ((computed_market_value - cost_basis) / cost_basis) * 100.0
    micro, vibe = _row_microcopy(
        ticker,
        day_change,
        intel_pro,
        alert_flags,
    )
    raw_directive = stock_intel.get("directive_v2") if isinstance(stock_intel.get("directive_v2"), dict) else None
    directive = raw_directive if isinstance(raw_directive, dict) else {}
    action = directive.get("action") if isinstance(directive.get("action"), dict) else {}
    directive_text = str(action.get("label") or "").strip()
    directive_rationale = str(action.get("summary") or directive.get("watch_out") or "").strip()
    instrument_peers = [
        str(peer_id).strip()
        for peer_id in (instrument_meta.get("peer_ids") or [])
        if str(peer_id).strip()
    ]
    intel_catalysts = [
        catalyst for catalyst in (intel_pro.get("catalysts") or [])
        if isinstance(catalyst, dict) and _catalyst_is_current(catalyst)
    ]
    facts_earnings = _facts_earnings_catalysts(facts)
    merged_by_key: dict[str, dict[str, Any]] = {}
    for catalyst in [*facts_earnings, *intel_catalysts]:
        key = _catalyst_merge_key(catalyst)
        prev = merged_by_key.get(key)
        if prev is None or _catalyst_richness(catalyst) > _catalyst_richness(prev):
            merged_by_key[key] = catalyst
    merged_catalysts = list(merged_by_key.values())

    holding_payload = {
        "quantity": quantity,
        "market_value": entered_market_value,
        "average_cost": average_cost,
        "computed_market_value": _round(computed_market_value, 2),
        "portfolio_weight_pct": None,
        "cost_basis": _round(cost_basis, 2),
        "unrealized_gain_pct": _round(unrealized_gain_pct, 2),
        "source": str(holding_in.get("source") or "unknown"),
        "updated_at": str(holding_in.get("updated_at") or "") or None,
        "_effective_market_value": _round(effective_market_value, 2),
    } if position_type == "holding" else None

    row = {
        "instrument_id": instrument_id,
        "ticker": ticker,
        "position_type": position_type,
        "market": market,
        "sector_label": intel_pro.get("sector_label", "") or instrument_meta.get("sector") or "",
        "industry_label": intel_pro.get("industry_label", ""),
        "instrument_name": instrument_meta.get("name") or latest.get("name") or "",
        "instrument_sector": instrument_meta.get("sector") or "",
        "instrument_industry": instrument_meta.get("industry") or "",
        "peer_ids": instrument_peers,
        "peer_tickers": [peer_id.split("_", 1)[-1] for peer_id in instrument_peers if "_" in peer_id],
        "currency": latest.get("currency", "USD" if market == "US" else "INR"),
        "price": price,
        "day_change_pct": day_change,
        "day_change_abs": _safe_float(quote.get("day_change_abs")),
        "scores": {
            "overall": _safe_float((overall or {}).get("score")),
            "verdict": (overall or {}).get("verdict"),
            "valuation": _safe_float((pillars.get("valuation") or {}).get("score")),
            "growth": _safe_float((pillars.get("growth") or {}).get("score")),
            "quality": _safe_float((pillars.get("quality") or {}).get("score")),
            "momentum": _safe_float((pillars.get("momentum") or {}).get("score")),
        },
        "alerts": alert_flags,
        "catalysts": merged_catalysts[:3],
        "facts": _facts_summary(facts),
        "technicals": _technical_summary(technical),
        "news_velocity": mention_summary,
        "premium_signals": _row_premium_signals(
            ticker,
            price,
            day_change,
            facts,
            intel_pro,
            technical,
            alert_flags,
        ),
        "target_upside_pct": target_upside,
        "top_metric_summaries": [
            summary for summary in (
                _metric_summary(intel_pro, "valuation", "Analyst target"),
                _metric_summary(intel_pro, "growth", "Revenue growth (TTM)"),
                _metric_summary(intel_pro, "quality", "Institutional ownership"),
                _metric_summary(intel_pro, "momentum", "1-month performance"),
            ) if summary
        ][:3],
        "brief_tile": {
            "micro": micro,
            "vibe": vibe,
            "source": "rules",
        },
        "ai_directive": {
            **directive,
            "text": directive_text or None,
            "rationale": directive_rationale or None,
            "trigger": _directive_trigger(directive),
        } if directive else {},
        "ai_directive_text": directive_text,
        "ai_directive_rationale": directive_rationale,
        **_row_attention(
            position_type,
            ticker,
            day_change,
            target_upside,
            facts,
            technical,
            mention_summary,
            alert_flags,
        ),
        "coverage_status": "ready" if intel_pro else "score_pending",
        "has_intel_pro": bool(intel_pro),
        "holding": holding_payload,
    }
    row["holding_status"] = _holding_status(position_type, holding_payload)
    row["directive_v2"] = _directive_v2(row, row.get("ai_directive") if isinstance(row.get("ai_directive"), dict) else None)
    return row


def _load_user_alerts(store: TraceMoneyStore, uid: str) -> dict[str, list[dict[str, Any]]]:
    docs = (
        store.db.collection("tm_user_alert_flags")
        .where("user_id", "==", uid)
        .stream()
    )
    by_instrument: dict[str, list[dict[str, Any]]] = {}
    for doc in docs:
        data = doc.to_dict() or {}
        instrument_id = str(data.get("instrument_id", "")).strip()
        flags = data.get("flags") or []
        if not instrument_id or not flags:
            continue
        by_instrument.setdefault(instrument_id, []).extend(flags)
    return by_instrument


def _pulse_headline(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Heuristic pulse summary - no LLM needed for v1."""
    if not rows:
        return {
            "headline": "Your watchlist is empty",
            "subtitle": "Track a stock from any detail page to start getting daily briefs.",
            "stats": {},
        }
    movers_up = [r for r in rows if (r.get("day_change_pct") or 0) > 0]
    movers_down = [r for r in rows if (r.get("day_change_pct") or 0) < 0]
    scored = [r for r in rows if r.get("scores", {}).get("overall") is not None]
    avg_overall = (
        round(sum(r["scores"]["overall"] for r in scored) / len(scored), 1)
        if scored else None
    )
    alert_count = sum(len(r.get("alerts", [])) for r in rows)

    if movers_up and not movers_down:
        mood = "Green across the board"
    elif movers_down and not movers_up:
        mood = "Red across the board"
    elif len(movers_up) > len(movers_down):
        mood = "Mostly green"
    elif len(movers_down) > len(movers_up):
        mood = "Mostly red"
    else:
        mood = "A mixed day"

    pieces = []
    if alert_count:
        pieces.append(f"{alert_count} alert{'s' if alert_count != 1 else ''} active")
    if avg_overall is not None:
        pieces.append(f"avg overall score {avg_overall}")
    pieces.append(f"{len(movers_up)} up, {len(movers_down)} down")
    subtitle = " · ".join(pieces)

    return {
        "headline": mood,
        "subtitle": subtitle,
        "stats": {
            "count": len(rows),
            "movers_up": len(movers_up),
            "movers_down": len(movers_down),
            "avg_overall_score": avg_overall,
            "alert_count": alert_count,
        },
    }


def _portfolio_payload_for_row(row: dict[str, Any]) -> dict[str, Any]:
    price = {
        "current": row.get("price") or 0,
        "changePct": row.get("day_change_pct") or 0,
        "volume": 0,
        "avgVolume": 0,
    }
    scores = row.get("scores") or {}
    catalysts = row.get("catalysts") or []
    alerts = row.get("alerts") or []
    facts = dict(row.get("facts") or {})
    facts["events"] = [
        event for event in (facts.get("events") or [])
        if isinstance(event, dict) and _event_is_current(str(event.get("date_label") or ""))
    ]
    technicals = row.get("technicals") or {}
    holding = row.get("holding") if isinstance(row.get("holding"), dict) else {}
    return {
        "symbol": row.get("ticker", ""),
        "name": row.get("ticker", ""),
        "sector": _cluster_sector(row),
        "position_type": row.get("position_type", "watchlist"),
        "portfolio_weight_pct": _safe_float((holding or {}).get("portfolio_weight_pct")),
        "price": price,
        "bottomLine": (row.get("brief_tile") or {}).get("micro", ""),
        "premiumSignals": row.get("premium_signals") or [],
        "targetUpsidePct": row.get("target_upside_pct"),
        "keyMetricSummaries": row.get("top_metric_summaries") or [],
        "facts": facts,
        "sentiment": {
            "overall": scores.get("overall") or 50,
            "trend": "stable",
            "drivers": [
                f"{key}: {value:.0f}"
                for key, value in (scores or {}).items()
                if key not in {"overall", "verdict"} and isinstance(value, (int, float))
            ][:3],
        },
        "catalysts": catalysts,
        "technicals": {
            "trend": "up" if (row.get("day_change_pct") or 0) >= 0 else "down",
            "rsi14": ((technicals.get("rsi_14") or {}).get("value")),
            "rsiState": ((technicals.get("rsi_14") or {}).get("state")),
            "fromHigh": ((technicals.get("distance") or {}).get("from_52w_high_pct")),
            "movingAverages": technicals.get("moving_averages") or {},
        },
        "analystConsensus": facts.get("analyst") or {},
        "returns": facts.get("returns") or {},
        "ownership": facts.get("institutions") or {},
        "financials": facts.get("financials") or {},
        "newsVelocity": row.get("news_velocity") or {},
        "news": [{"title": flag.get("message", "")} for flag in alerts[:3] if isinstance(flag, dict)],
    }


def _fallback_portfolio_brief(rows: list[dict[str, Any]], pulse: dict[str, Any]) -> dict[str, Any]:
    sectors = [str(row.get("sector_label") or "").strip() for row in rows if row.get("sector_label")]
    sector_counts = {sector: sectors.count(sector) for sector in sorted(set(sectors))}
    dominant_sector = max(sector_counts, key=sector_counts.get) if sector_counts else ""
    missing_body = (
        f"Most of this watchlist clusters around {dominant_sector}. Add a defensive or unrelated sector to reduce single-theme risk."
        if dominant_sector and sector_counts.get(dominant_sector, 0) >= max(2, len(rows) // 2)
        else "No obvious concentration yet. Add more stocks and stocksbrew will flag sector, style, and event blind spots."
    )
    movers = sorted(rows, key=lambda r: abs(r.get("day_change_pct") or 0), reverse=True)[:4]
    events: list[dict[str, Any]] = []
    for row in rows:
        for flag in (row.get("alerts") or [])[:1]:
            if isinstance(flag, dict):
                events.append({
                    "sentence": str(flag.get("message") or flag.get("type") or "Watchlist alert triggered.")[:120],
                    "event_type": "technical",
                    "scope": "stock",
                    "direction": str(flag.get("direction") or "mixed"),
                    "confidence": "med",
                    "impact_score": min(100, 55 + int(flag.get("severity", 1)) * 10),
                    "evidence": [str(flag.get("type") or "alert")],
                    "symbol": str(row.get("ticker") or ""),
                    "sector_id": "",
                })
    if not events:
        events = [
            {
                "sentence": f"{row.get('ticker')} remains on watch: {(row.get('brief_tile') or {}).get('micro', 'AI score pending.')}"[:120],
                "event_type": "sentiment",
                "scope": "stock",
                "direction": (row.get("brief_tile") or {}).get("vibe", "mixed"),
                "confidence": "low" if not row.get("has_intel_pro") else "med",
                "impact_score": 50,
                "evidence": ["price", "score" if row.get("has_intel_pro") else "pending"],
                "symbol": str(row.get("ticker") or ""),
                "sector_id": "",
            }
            for row in movers[:3]
        ]

    return {
        "narrative": pulse.get("subtitle") or pulse.get("headline") or "Your watchlist is ready for the next refresh.",
        "tiles": [
            {
                "ticker": row.get("ticker", ""),
                "micro": (row.get("brief_tile") or {}).get("micro", "AI brief pending."),
                "vibe": (row.get("brief_tile") or {}).get("vibe", "wild"),
            }
            for row in rows
        ],
        "movers": [
            {
                "ticker": row.get("ticker", ""),
                "one_liner": (row.get("brief_tile") or {}).get("micro", "Largest watchlist move."),
                "vibe": (row.get("brief_tile") or {}).get("vibe", "wild"),
            }
            for row in movers
        ],
        "signals": [
            {
                "tag": "Breadth",
                "headline": pulse.get("headline", "A mixed day"),
                "body": pulse.get("subtitle", "Watchlist breadth is mixed."),
                "detail": "This fallback uses prices, factor scores, and alert flags while the personalized LLM brief is unavailable.",
                "vibe": "neutral",
            }
        ],
        "blind_spot_title": "Exposure check",
        "blind_spot_body": missing_body,
        "essential_events": events[:5],
        "source": "rules",
        "status": "fallback",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _build_portfolio_brief(
    rows: list[dict[str, Any]],
    pulse: dict[str, Any],
    store: TraceMoneyStore,
    *,
    include_llm: bool,
) -> dict[str, Any]:
    fallback = _fallback_portfolio_brief(rows, pulse)
    if not include_llm or not rows:
        fallback["status"] = "pending" if rows and not include_llm else fallback["status"]
        return fallback

    payloads = [_portfolio_payload_for_row(row) for row in rows]
    market = str((rows[0].get("market") or "US")).upper() if rows else "US"
    sector_regimes: dict[str, Any] = {}
    try:
        sector_regimes = store.get_sector_regimes(market) if store else {}
    except Exception:
        pass
    result = generate_portfolio_brief(payloads, store=store, sector_regimes=sector_regimes)
    if not isinstance(result, dict):
        return fallback

    result = {
        **result,
        "source": LLM_BRIEF_SOURCE,
        "status": "ready",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return result


def _apply_position_weights(rows: list[dict[str, Any]]) -> dict[str, Any]:
    # All-or-none: only stamp weights when EVERY holding has a resolvable market value.
    holdings = [row for row in rows if row.get("position_type") == "holding" and isinstance(row.get("holding"), dict)]
    resolved: list[tuple[dict[str, Any], float]] = []
    for row in holdings:
        val = _holding_market_value(row.get("holding") if isinstance(row.get("holding"), dict) else None)
        if val is not None:
            resolved.append((row, val))

    all_covered = bool(holdings) and len(resolved) == len(holdings)
    if not all_covered:
        for row in holdings:
            row_holding = row.get("holding") or {}
            row_holding["portfolio_weight_pct"] = None
            row["holding"] = row_holding
        return {
            "position_aware": False,
            "total_entered_value": None,
            "value_coverage_count": len(resolved),
        }

    total_value = sum(v for _, v in resolved)
    if total_value <= 0:
        for row in holdings:
            row_holding = row.get("holding") or {}
            row_holding["portfolio_weight_pct"] = None
            row["holding"] = row_holding
        return {
            "position_aware": False,
            "total_entered_value": None,
            "value_coverage_count": 0,
        }

    for row, raw_value in resolved:
        row_holding = row.get("holding") or {}
        row_holding["portfolio_weight_pct"] = _round((raw_value / total_value) * 100.0, 2)
        row["holding"] = row_holding
    return {
        "position_aware": True,
        "total_entered_value": _round(total_value, 2),
        "value_coverage_count": len(resolved),
    }


def _boost_attention_for_position(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        if row.get("position_type") != "holding":
            continue
        holding = row.get("holding") if isinstance(row.get("holding"), dict) else {}
        weight = _safe_float((holding or {}).get("portfolio_weight_pct")) or 0.0
        if weight <= 0:
            continue
        score = _safe_float((row.get("scores") or {}).get("overall")) or 50.0
        day_change = _safe_float(row.get("day_change_pct")) or 0.0
        stance = str(((row.get("ai_directive") or {}).get("stance") or "")).lower()
        negative_signal = score < 55 or day_change <= -2.0 or stance in {"trim", "avoid"}
        if not negative_signal:
            continue
        current_attention = _safe_float(row.get("attention_score")) or 0.0
        boost = min(18.0, weight * 0.35)
        row["attention_score"] = round(current_attention + boost, 1)
        reason = str(row.get("attention_reason") or "").strip()
        suffix = f"Large holding ({weight:.1f}% portfolio) with weak signal."
        row["attention_reason"] = f"{reason} {suffix}".strip() if reason else suffix


def _holding_market_value(holding: dict[str, Any] | None) -> float | None:
    """Resolve market value from a holding dict, trying all known field names."""
    if not holding:
        return None
    for field in ("computed_market_value", "_effective_market_value", "market_value"):
        v = _safe_float(holding.get(field))
        if v is not None and v > 0:
            return v
    return None


def _cluster_sector(row: dict[str, Any]) -> str:
    for key in ("sector_label", "instrument_sector", "industry_label"):
        label = str(row.get(key) or "").strip()
        if label:
            return label
    return "Uncategorized"


def _sector_counts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # All-or-none: only use dollar-weighting when EVERY holding has a market value.
    # A partial set would give misleading sector weights, so fall back to count.
    holding_rows = [r for r in rows if r.get("position_type") == "holding"]
    all_have_value = bool(holding_rows) and all(
        _holding_market_value(r.get("holding") if isinstance(r.get("holding"), dict) else None) is not None
        for r in holding_rows
    )

    by_sector_count: dict[str, int] = {}
    if all_have_value:
        by_sector_value: dict[str, float] = {}
        for row in holding_rows:
            sector = _cluster_sector(row)
            by_sector_count[sector] = by_sector_count.get(sector, 0) + 1
            val = _holding_market_value(row.get("holding") if isinstance(row.get("holding"), dict) else None) or 0.0
            by_sector_value[sector] = by_sector_value.get(sector, 0.0) + val
        total = sum(by_sector_value.values()) or 1.0
        return [
            {
                "sector": sector,
                "count": by_sector_count.get(sector, 0),
                "value": _round(value, 2),
                "weight_pct": _round((value / total) * 100.0, 1),
                "weight_basis": "value",
            }
            for sector, value in sorted(by_sector_value.items(), key=lambda item: item[1], reverse=True)
        ]

    # Fall back to count-weighted across holdings when present, else all rows.
    scope_rows = holding_rows if holding_rows else rows
    for row in scope_rows:
        sector = _cluster_sector(row)
        by_sector_count[sector] = by_sector_count.get(sector, 0) + 1
    return [
        {
            "sector": sector,
            "count": count,
            "weight_pct": round(count / max(len(scope_rows), 1) * 100, 1),
            "weight_basis": "count",
        }
        for sector, count in sorted(by_sector_count.items(), key=lambda item: item[1], reverse=True)
    ]


def _average_score(rows: list[dict[str, Any]], key: str) -> float | None:
    values = [
        _safe_float((row.get("scores") or {}).get(key))
        for row in rows
    ]
    values = [value for value in values if value is not None]
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def _weighted_average_score(rows: list[dict[str, Any]], key: str) -> float | None:
    """Dollar-weighted average when ALL holdings have portfolio_weight_pct, else equal-weight fallback."""
    holding_rows = [r for r in rows if r.get("position_type") == "holding"]
    all_weighted = bool(holding_rows) and all(
        _safe_float((r.get("holding") or {}).get("portfolio_weight_pct")) is not None
        and (_safe_float((r.get("holding") or {}).get("portfolio_weight_pct")) or 0.0) > 0
        for r in holding_rows
    )
    if not all_weighted:
        scope = holding_rows if holding_rows else rows
        return _average_score(scope, key)
    weighted_sum = 0.0
    total_weight = 0.0
    for r in holding_rows:
        score = _safe_float((r.get("scores") or {}).get(key))
        w = _safe_float((r.get("holding") or {}).get("portfolio_weight_pct")) or 0.0
        if score is not None and w > 0:
            weighted_sum += score * w
            total_weight += w
    if total_weight == 0:
        scope = holding_rows if holding_rows else rows
        return _average_score(scope, key)
    return round(weighted_sum / total_weight, 1)


def _load_reddit_buzz_by_market(store: TraceMoneyStore, markets: list[str]) -> dict[str, dict[str, dict[str, Any]]]:
    by_market: dict[str, dict[str, dict[str, Any]]] = {}
    for market in markets:
        market_key = str(market).upper()
        snap = store.db.collection("reddit_snapshots").document(f"{market_key}__latest").get()
        if not snap.exists:
            continue
        payload = snap.to_dict() or {}
        rows = payload.get("tickers") or []
        if isinstance(rows, dict):
            mapped: dict[str, dict[str, Any]] = {}
            for ticker, item in rows.items():
                mapped[str(ticker).upper()] = item if isinstance(item, dict) else {}
            by_market[market_key] = mapped
            continue
        mapped = {}
        for item in rows:
            if not isinstance(item, dict):
                continue
            ticker = str(item.get("ticker") or item.get("symbol") or "").upper()
            if not ticker:
                continue
            mapped[ticker] = item
        by_market[market_key] = mapped
    return by_market


def _load_anomalies_by_market(store: TraceMoneyStore, markets: list[str]) -> dict[str, dict[str, dict[str, Any]]]:
    by_market: dict[str, dict[str, dict[str, Any]]] = {}
    for market in markets:
        market_key = str(market).upper()
        snap = store.db.collection("tm_daily_anomalies").document(f"{market_key}__latest").get()
        if not snap.exists:
            continue
        payload = snap.to_dict() or {}
        rows = payload.get("anomalies") or []
        mapped: dict[str, dict[str, Any]] = {}
        for item in rows:
            if not isinstance(item, dict):
                continue
            ticker = str(item.get("ticker") or item.get("symbol") or "").upper()
            if not ticker:
                continue
            mapped[ticker] = item
        by_market[market_key] = mapped
    return by_market


def _load_market_context_by_market(
    store: TraceMoneyStore,
    active_universes: dict[str, str],
    markets: list[str],
) -> dict[str, dict[str, Any]]:
    by_market: dict[str, dict[str, Any]] = {}
    for market in markets:
        market_key = str(market).upper()
        universe = _price_universe(market_key, active_universes)
        payload = store.get_market_context_doc(market_key, universe) or {}
        if payload:
            by_market[market_key] = payload
    return by_market


def _load_sector_context_by_market(
    store: TraceMoneyStore,
    active_universes: dict[str, str],
    markets: list[str],
) -> dict[str, dict[str, dict[str, Any]]]:
    by_market: dict[str, dict[str, dict[str, Any]]] = {}
    for market in markets:
        market_key = str(market).upper()
        universe = _price_universe(market_key, active_universes)
        docs = store.list_sector_context_docs(market_key, universe)
        by_label: dict[str, dict[str, Any]] = {}
        for doc in docs:
            label = str(doc.get("sector_label") or "").strip().lower()
            if label:
                by_label[label] = doc
        by_market[market_key] = by_label
    return by_market


def _load_recent_enrichments_by_market(
    store: TraceMoneyStore,
    active_universes: dict[str, str],
    markets: list[str],
    *,
    limit: int = 60,
) -> dict[str, list[dict[str, Any]]]:
    by_market: dict[str, list[dict[str, Any]]] = {}
    for market in markets:
        market_key = str(market).upper()
        universe = _ai_universe(market_key, active_universes)
        collection = store.db.collection("tm_news_runs").document(f"{market_key}__{universe}").collection("enrichments")
        try:
            snaps = collection.order_by("published_at", direction="DESCENDING").limit(limit).stream()
        except Exception:
            snaps = collection.limit(limit).stream()
        rows = []
        for snap in snaps:
            payload = snap.to_dict() or {}
            if isinstance(payload, dict):
                rows.append(payload)
        by_market[market_key] = rows
    return by_market


def _load_ticker_read_models(
    store: TraceMoneyStore,
    rows: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    anomaly_refs = []
    reddit_refs = []
    earnings_refs = []
    row_ids: list[str] = []
    for row in rows:
        instrument_id = str(row.get("instrument_id") or "").strip()
        ticker = str(row.get("ticker") or "").strip().upper()
        market = str(row.get("market") or "").strip().upper()
        if not instrument_id or not ticker or market not in {"US", "IN"}:
            continue
        row_ids.append(instrument_id)
        anomaly_refs.append(store.db.collection("tm_daily_anomaly_tickers").document(f"{market}__{ticker}"))
        reddit_refs.append(store.db.collection("reddit_ticker_contexts").document(f"{market}__{ticker}"))
        earnings_refs.append(store.db.collection("tm_pre_earnings_intel").document(f"{market}__{instrument_id}__upcoming"))

    anomaly_docs: dict[str, dict[str, Any]] = {}
    reddit_docs: dict[str, dict[str, Any]] = {}
    earnings_docs: dict[str, dict[str, Any]] = {}
    if row_ids:
        for instrument_id, snap in zip(row_ids, store.db.get_all(anomaly_refs), strict=False):
            if snap.exists:
                anomaly_docs[instrument_id] = snap.to_dict() or {}
        for instrument_id, snap in zip(row_ids, store.db.get_all(reddit_refs), strict=False):
            if snap.exists:
                reddit_docs[instrument_id] = snap.to_dict() or {}
        for instrument_id, snap in zip(row_ids, store.db.get_all(earnings_refs), strict=False):
            if snap.exists:
                earnings_docs[instrument_id] = snap.to_dict() or {}
    return anomaly_docs, reddit_docs, earnings_docs


THEME_KEYWORDS: dict[str, tuple[str, ...]] = {
    "ai_infra": ("ai infrastructure", "ai budget", "ai workloads", "ai server", "data center", "datacenter", "gpu", "accelerator"),
    "semis": ("semiconductor", "chip", "chips", "foundry", "wafer", "memory"),
    "cloud_software": ("cloud", "saas", "subscription", "enterprise software", "workflow", "platform"),
    "cybersecurity": ("cybersecurity", "security", "identity", "zero trust", "threat", "endpoint"),
    "ev": ("electric vehicle", "electric vehicles", "battery", "autonomous driving"),
    "space": ("spacex", "space", "satellite", "launch"),
    "adtech": ("advertising", "ads", "ad spend", "digital ad"),
    "consumer_internet": ("ecommerce", "travel", "marketplace", "consumer app"),
}

THEME_LEADERS: dict[str, tuple[str, ...]] = {
    "ai_infra": ("NVDA", "AMD", "SMCI", "AVGO", "MRVL", "MU", "ARM", "DELL", "ORCL", "MSFT"),
    "semis": ("NVDA", "AMD", "AVGO", "MRVL", "MU", "ARM", "QCOM", "TSM", "INTC"),
    "cloud_software": ("MSFT", "NOW", "ORCL", "PLTR", "SNOW", "CRM"),
    "cybersecurity": ("PANW", "CRWD", "ZS", "OKTA", "S"),
    "ev": ("TSLA", "RIVN", "LI", "NIO"),
    "space": ("RKLB", "SPCE"),
    "consumer_internet": ("AMZN", "META", "GOOGL", "ABNB"),
}

THEME_LABELS: dict[str, str] = {
    "ai_infra": "AI infra",
    "semis": "semi",
    "cloud_software": "cloud software",
    "cybersecurity": "cybersecurity",
    "ev": "EV",
    "space": "space",
    "consumer_internet": "consumer internet",
}

LEADER_BENEFICIARY_BASKETS: dict[str, tuple[str, ...]] = {
    "NVDA": ("SMCI", "DELL", "AVGO", "MRVL", "MU", "AMD", "ARM", "TSM", "GLW", "NBIS", "PLTR", "MSFT"),
    "AMD": ("SMCI", "DELL", "AVGO", "MRVL", "MU", "ARM", "TSM", "NVDA", "GLW"),
    "AVGO": ("MRVL", "NVDA", "AMD", "ARM", "MU", "TSM", "QCOM"),
    "MRVL": ("AVGO", "NVDA", "AMD", "MU", "ARM", "TSM"),
    "MU": ("NVDA", "AVGO", "MRVL", "ARM", "AMD", "TSM", "INTC", "QCOM"),
    "ARM": ("NVDA", "AMD", "AVGO", "MRVL", "MU", "QCOM", "TSM", "INTC"),
    "TSM": ("NVDA", "AMD", "AVGO", "MRVL", "MU", "ARM", "QCOM", "INTC"),
    "DELL": ("SMCI", "NVDA", "AVGO", "AMD", "MRVL", "MU", "GLW", "NBIS", "PLTR", "MSFT"),
    "SMCI": ("NVDA", "DELL", "AVGO", "AMD", "MRVL", "MU", "GLW"),
    "MSFT": ("NVDA", "AMD", "AVGO", "PLTR", "NBIS", "DELL", "SMCI", "GOOGL", "META", "AMZN"),
    "ORCL": ("MSFT", "SMCI", "DELL", "NVDA", "AMD", "PLTR", "NBIS"),
    "NOW": ("MSFT", "PLTR", "AMZN", "GOOGL", "META", "NBIS"),
    "PLTR": ("MSFT", "NVDA", "AMD", "DELL", "SMCI", "NBIS"),
    "META": ("NVDA", "AMD", "GOOGL", "AMZN", "MSFT"),
    "AMZN": ("GOOGL", "META", "MSFT", "NVDA"),
    "GOOGL": ("META", "AMZN", "MSFT", "NVDA"),
}

LOW_SIGNAL_PREOPEN_TITLE_TERMS: tuple[str, ...] = (
    "better value option",
    "brilliant buys",
    "top performing",
    "top stocks",
    "stock to watch",
    "stocks to watch",
    "should you buy",
    "worth watching",
    "buy them both",
    "best stocks",
    "buying back shares hand over fist",
)

NON_OPERATIONAL_PREOPEN_TERMS: tuple[str, ...] = (
    "pay package",
    "ceo pay",
    "billion-dollar payday",
    "trillion-dollar club",
    "market capitalization target",
    "compensation package",
    "stock split",
)


def _theme_tags_from_text(*parts: Any) -> set[str]:
    text = " ".join(str(part or "") for part in parts).strip().lower()
    tags: set[str] = set()
    if not text:
        return tags
    for tag, needles in THEME_KEYWORDS.items():
        if any(needle in text for needle in needles):
            tags.add(tag)
    return tags


def _row_theme_tags(row: dict[str, Any]) -> set[str]:
    tags: set[str] = set()
    sector = str(row.get("sector_label") or "").strip().lower()
    industry = str(row.get("industry_label") or "").strip().lower()
    text_tags = _theme_tags_from_text(
        row.get("ai_directive_text"),
        row.get("ai_directive_rationale"),
        row.get("attention_reason"),
    )
    if "software" in industry or "internet" in industry:
        tags.add("cloud_software")
    if "semiconductor" in industry:
        tags.add("semis")
    if "computer hardware" in industry or "electronic components" in industry or "software - infrastructure" in industry:
        tags.add("ai_infra")
    if "cyber" in industry or "security" in industry:
        tags.add("cybersecurity")
    if "auto" in industry or "vehicle" in industry:
        tags.add("ev")
    if "aerospace" in industry or "space" in industry:
        tags.add("space")
    if "internet retail" in industry or "travel services" in industry or "internet content" in industry:
        tags.add("consumer_internet")
    if "technology" in sector and ("ai_infra" in text_tags or "semis" in text_tags):
        tags.update({"ai_infra", "semis"})
    if "communication services" in sector and "consumer_internet" in text_tags:
        tags.add("consumer_internet")
    tags.update(text_tags - {"ev"})
    return tags


def _clean_signal_text(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _clip_signal_text(value: Any, limit: int) -> str:
    del limit
    return _clean_signal_text(value)


def _stock_mentions(article: dict[str, Any]) -> list[dict[str, Any]]:
    mentions: list[dict[str, Any]] = []
    for mention in article.get("entity_mentions") or []:
        if not isinstance(mention, dict):
            continue
        if str(mention.get("type") or "").strip().lower() != "stock":
            continue
        if str(mention.get("mention_role") or "secondary").strip().lower() == "incidental":
            continue
        ticker = _clean_signal_text(mention.get("ticker")).upper()
        if not ticker:
            continue
        mentions.append(mention)
    return mentions


def _is_low_signal_event_article(article: dict[str, Any], mentions: list[dict[str, Any]]) -> bool:
    title = _clean_signal_text(article.get("title")).lower()
    if not title:
        return True
    if " vs " in title or " versus " in title:
        return True
    if any(term in title for term in LOW_SIGNAL_PREOPEN_TITLE_TERMS):
        return True
    article_text = " ".join(
        [
            title,
            _clean_signal_text(article.get("summary")).lower(),
            " ".join(_clean_signal_text(mention.get("what_happened")).lower() for mention in mentions),
            " ".join(_clean_signal_text(mention.get("why_it_matters")).lower() for mention in mentions),
        ]
    )
    if any(term in article_text for term in NON_OPERATIONAL_PREOPEN_TERMS):
        return True
    primary_count = sum(1 for mention in mentions if str(mention.get("mention_role") or "").strip().lower() == "primary")
    return primary_count >= 4


def _event_tagline(article: dict[str, Any], mention: dict[str, Any] | None = None) -> str:
    event_text = " ".join(
        filter(
            None,
            [
                _clean_signal_text((mention or {}).get("what_happened")),
                _clean_signal_text((mention or {}).get("why_it_matters")),
                _clean_signal_text(article.get("title")),
                _clean_signal_text(article.get("summary")),
            ],
        )
    ).lower()
    return _event_tagline_from_text(event_text)


def _event_tagline_from_text(event_text: str) -> str:
    event_text = _clean_signal_text(event_text).lower()
    if "launch" in event_text or "unveil" in event_text or "introduced" in event_text:
        return "new product signal"
    if "guidance" in event_text or "earnings" in event_text or "revenue" in event_text:
        return "earnings and demand signal"
    if "investment" in event_text or "deal" in event_text or "contract" in event_text or "acquisition" in event_text:
        return "deal signal"
    if "buyback" in event_text or "repurchase" in event_text:
        return "capital return signal"
    if "price target" in event_text or "upside" in event_text:
        return "analyst reset"
    if "pay package" in event_text or "market cap target" in event_text or "ceo" in event_text:
        return "expectations reset"
    if "ai" in event_text and ("server" in event_text or "chip" in event_text or "data center" in event_text):
        return "AI demand signal"
    return "fresh market signal"


def _mention_quality_score(article: dict[str, Any], mention: dict[str, Any]) -> int:
    score = 0
    role = _clean_signal_text(mention.get("mention_role")).lower()
    if role == "primary":
        score += 120
    elif role == "secondary":
        score += 60
    text = " ".join(
        [
            _clean_signal_text(article.get("title")),
            _clean_signal_text(article.get("summary")),
            _clean_signal_text(mention.get("what_happened")),
            _clean_signal_text(mention.get("why_it_matters")),
            " ".join(_clean_signal_text(point) for point in (mention.get("entity_key_points") or [])),
        ]
    ).lower()
    if any(token in text for token in ("launch", "unveil", "introduced", "guidance", "earnings", "revenue", "contract", "deal", "investment", "buyback", "demand", "orders", "backlog")):
        score += 35
    if any(char.isdigit() for char in text):
        score += 10
    if any(token in text for token in NON_OPERATIONAL_PREOPEN_TERMS):
        score -= 80
    if any(token in text for token in LOW_SIGNAL_PREOPEN_TITLE_TERMS):
        score -= 120
    return score


def _format_event_body(base: str, beneficiaries: list[str] | None = None) -> str:
    body = _clean_signal_text(base)
    if beneficiaries:
        suffix = f" That can matter for {', '.join(beneficiaries)} in your Watchlist."
        body = f"{body}{suffix}"
    return body


def _beneficiary_verb(tone: str | None) -> str:
    normalized = _clean_signal_text(tone).lower()
    if normalized == "positive":
        return "could lift"
    if normalized == "negative":
        return "could pressure"
    return "could move"


def _beneficiary_score(
    source_row: dict[str, Any] | None,
    candidate_row: dict[str, Any],
    source_tags: set[str],
    candidate_tags: set[str],
) -> int:
    score = 0
    candidate_id = _clean_signal_text(candidate_row.get("instrument_id"))
    candidate_ticker = _clean_signal_text(candidate_row.get("ticker")).upper()
    source_peer_ids = {_clean_signal_text(v) for v in ((source_row or {}).get("peer_ids") or []) if _clean_signal_text(v)}
    source_peer_tickers = {_clean_signal_text(v).upper() for v in ((source_row or {}).get("peer_tickers") or []) if _clean_signal_text(v)}
    if candidate_id and candidate_id in source_peer_ids:
        score += 140
    if candidate_ticker and candidate_ticker in source_peer_tickers:
        score += 120
    candidate_peer_tickers = {_clean_signal_text(v).upper() for v in (candidate_row.get("peer_tickers") or []) if _clean_signal_text(v)}
    source_ticker = _clean_signal_text((source_row or {}).get("ticker")).upper()
    if source_ticker and source_ticker in candidate_peer_tickers:
        score += 90

    source_industry = _clean_signal_text((source_row or {}).get("instrument_industry") or (source_row or {}).get("industry_label")).lower()
    candidate_industry = _clean_signal_text(candidate_row.get("instrument_industry") or candidate_row.get("industry_label")).lower()
    if source_industry and candidate_industry and source_industry == candidate_industry:
        score += 80
    elif source_industry and candidate_industry and any(
        token in candidate_industry for token in source_industry.split()
        if len(token) >= 5
    ):
        score += 35

    source_sector = _clean_signal_text((source_row or {}).get("instrument_sector") or (source_row or {}).get("sector_label")).lower()
    candidate_sector = _clean_signal_text(candidate_row.get("instrument_sector") or candidate_row.get("sector_label")).lower()
    if source_sector and candidate_sector and source_sector == candidate_sector:
        score += 20

    shared_tags = source_tags.intersection(candidate_tags)
    score += 18 * len(shared_tags)
    if "semis" in shared_tags:
        score += 22
    if "ai_infra" in shared_tags:
        score += 18
    if "cloud_software" in shared_tags:
        score += 12

    attention = int(_safe_float(candidate_row.get("attention_score")) or 0)
    score += min(18, max(0, attention // 8))
    return score


def _preferred_basket_targets(source_ticker: str, tracked_market_tickers: set[str]) -> list[str]:
    ordered = LEADER_BENEFICIARY_BASKETS.get(source_ticker) or ()
    return [ticker for ticker in ordered if ticker in tracked_market_tickers and ticker != source_ticker]


def _preopen_signal_rank(item: dict[str, Any]) -> tuple[int, int]:
    kind = _clean_signal_text(item.get("kind")).lower()
    title = _clean_signal_text(item.get("title")).lower()
    score = 0
    if kind == "event_readthrough":
        score += 60
    elif kind == "leader_basket":
        score += 50
    elif kind == "event_catalyst":
        score += 42
    elif kind == "preopen_catalyst":
        score += 34
    elif kind == "theme_beneficiary":
        score += 24
    elif kind == "theme_spillover":
        score += 16
    elif kind == "sector_theme":
        score += 12
    if "new product signal" in title:
        score += 18
    if "deal signal" in title or "ai demand signal" in title or "earnings and demand signal" in title:
        score += 14
    if "capital return signal" in title:
        score += 6
    if "analyst reset" in title:
        score -= 10
    if "expectations reset" in title:
        score -= 14
    return score, int(_safe_float(item.get("urgency")) or 0)


def _leader_basket_signals(
    rows_by_market_ticker: dict[tuple[str, str], dict[str, Any]],
    row_theme_map: dict[tuple[str, str], set[str]],
    anomaly_by_market: dict[str, dict[str, dict[str, Any]]],
) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for market_key, anomalies in anomaly_by_market.items():
        tracked_market_tickers = {
            ticker
            for (row_market, ticker), _row in rows_by_market_ticker.items()
            if row_market == market_key
        }
        if not tracked_market_tickers:
            continue
        for leader_ticker, ordered_targets in LEADER_BENEFICIARY_BASKETS.items():
            if leader_ticker not in anomalies:
                continue
            item = anomalies.get(leader_ticker) or {}
            move = _safe_float(item.get("day_change_pct"))
            headline = _clean_signal_text(item.get("headline"))
            brief = _clean_signal_text(item.get("today_brief") or item.get("thesis"))
            catalyst = _clean_signal_text(item.get("catalyst"))
            if move is None and not headline and not brief and not catalyst:
                continue
            if move is not None and abs(move) < 4 and not catalyst:
                continue
            source_row = rows_by_market_ticker.get((market_key, leader_ticker))
            source_tags = set(row_theme_map.get((market_key, leader_ticker), set()))
            source_tags.update(_theme_tags_from_text(headline, brief, catalyst))
            ranked_targets: list[tuple[int, str]] = []
            for idx, candidate_ticker in enumerate(ordered_targets):
                if candidate_ticker not in tracked_market_tickers or candidate_ticker == leader_ticker:
                    continue
                candidate_row = rows_by_market_ticker.get((market_key, candidate_ticker))
                if not candidate_row:
                    continue
                score = _beneficiary_score(
                    source_row,
                    candidate_row,
                    source_tags,
                    row_theme_map.get((market_key, candidate_ticker), set()),
                ) + 220 - idx * 10
                ranked_targets.append((score, candidate_ticker))
            beneficiaries = [ticker for _score, ticker in sorted(ranked_targets, reverse=True)[:3]]
            if not beneficiaries:
                continue
            signal_text = " ".join(part for part in [headline, brief, catalyst] if part).strip()
            tone = "positive" if (move or 0) > 0 else "negative" if (move or 0) < 0 else "neutral"
            signals.append(
                {
                    "ticker": leader_ticker,
                    "position_type": "market",
                    "kind": "leader_basket",
                    "tone": tone,
                    "urgency": int(min(92, 84 + abs(move or 0))),
                    "title": f"{leader_ticker} {_event_tagline_from_text(signal_text)} {_beneficiary_verb(tone)} {', '.join(beneficiaries[:2])}",
                    "why_it_matters": _format_event_body(brief or headline or catalyst, beneficiaries),
                    "action": f"Check {', '.join(beneficiaries)} for follow-through after the open",
                    "evidence": [value for value in [f"{move:+.1f}% move" if move is not None else "", catalyst or headline] if value][:2],
                }
            )
    return signals


def _direct_event_signals(
    rows: list[dict[str, Any]],
    enrichments_by_market: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    rows_by_market_ticker: dict[tuple[str, str], dict[str, Any]] = {}
    row_theme_map: dict[tuple[str, str], set[str]] = {}
    for row in rows:
        market_key = _clean_signal_text(row.get("market")).upper()
        ticker = _clean_signal_text(row.get("ticker")).upper()
        if market_key and ticker:
            rows_by_market_ticker[(market_key, ticker)] = row
            row_theme_map[(market_key, ticker)] = _row_theme_tags(row)

    event_signals: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for market_key, articles in enrichments_by_market.items():
        tracked_market_tickers = {
            ticker
            for (row_market, ticker), _row in rows_by_market_ticker.items()
            if row_market == market_key
        }
        if not tracked_market_tickers:
            continue
        for article in articles:
            mentions = _stock_mentions(article)
            if not mentions or _is_low_signal_event_article(article, mentions):
                continue
            primary_mentions = [
                mention
                for mention in mentions
                if str(mention.get("mention_role") or "").strip().lower() == "primary"
            ]
            secondary_mentions = [
                mention
                for mention in mentions
                if str(mention.get("mention_role") or "").strip().lower() == "secondary"
            ]
            tracked_secondary = [
                mention for mention in secondary_mentions if _clean_signal_text(mention.get("ticker")).upper() in tracked_market_tickers
            ]
            tracked_primary = [
                mention for mention in primary_mentions if _clean_signal_text(mention.get("ticker")).upper() in tracked_market_tickers
            ]
            published_at = _clean_signal_text(article.get("published_at"))
            article_title = _clean_signal_text(article.get("title"))
            article_summary = _clean_signal_text(article.get("summary"))
            article_tags = _theme_tags_from_text(
                article_title,
                article_summary,
                *[_clean_signal_text(mention.get("what_happened")) for mention in mentions],
                *[_clean_signal_text(mention.get("why_it_matters")) for mention in mentions],
            )

            source_mention = None
            if primary_mentions:
                external_primary = [
                    mention for mention in primary_mentions if _clean_signal_text(mention.get("ticker")).upper() not in tracked_market_tickers
                ]
                source_mention = external_primary[0] if external_primary else primary_mentions[0]

            if source_mention is not None:
                source_ticker = _clean_signal_text(source_mention.get("ticker")).upper()
                source_label = source_ticker or article_title or "Market event"
                source_row = rows_by_market_ticker.get((market_key, source_ticker))
                source_tags = set(article_tags)
                source_tags.update(row_theme_map.get((market_key, source_ticker), set()))
                basket_targets = _preferred_basket_targets(source_ticker, tracked_market_tickers)
                ranked_candidates: list[tuple[int, str, str]] = []
                beneficiaries: list[str] = []
                beneficiary_lines: list[str] = []
                for mention in tracked_secondary:
                    ticker = _clean_signal_text(mention.get("ticker")).upper()
                    if not ticker or ticker in beneficiaries:
                        continue
                    candidate_row = rows_by_market_ticker.get((market_key, ticker))
                    if not candidate_row:
                        continue
                    score = _beneficiary_score(
                        source_row,
                        candidate_row,
                        source_tags,
                        row_theme_map.get((market_key, ticker), set()),
                    )
                    if ticker in basket_targets:
                        score += 200 - basket_targets.index(ticker) * 10
                    why = _clean_signal_text(mention.get("why_it_matters")) or _clean_signal_text(mention.get("what_happened"))
                    ranked_candidates.append((score, ticker, why))
                for idx, ticker in enumerate(basket_targets):
                    candidate_row = rows_by_market_ticker.get((market_key, ticker))
                    if not candidate_row:
                        continue
                    score = _beneficiary_score(
                        source_row,
                        candidate_row,
                        source_tags,
                        row_theme_map.get((market_key, ticker), set()),
                    ) + 260 - idx * 12
                    ranked_candidates.append((score, ticker, ""))
                for _score, ticker, why in sorted(ranked_candidates, reverse=True):
                    if ticker in beneficiaries:
                        continue
                    beneficiaries.append(ticker)
                    if why:
                        beneficiary_lines.append(f"{ticker}: {why}")
                    if len(beneficiaries) >= 3:
                        break
                if not beneficiaries:
                    if not basket_targets:
                        continue
                key = f"direct:{market_key}:{source_label}:{','.join(beneficiaries)}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                source_event = _clean_signal_text(source_mention.get("what_happened")) or article_title
                source_tagline = _event_tagline(article, source_mention)
                evidence = [value for value in [source_event, published_at[:10] if published_at else ""] if value][:2]
                body = _format_event_body(" ".join(beneficiary_lines[:2]).strip() or article_summary or source_event, beneficiaries)
                event_signals.append(
                    {
                        "ticker": source_ticker or beneficiaries[0],
                        "position_type": "market",
                        "kind": "event_readthrough",
                        "tone": str(source_mention.get("sentiment_label") or "neutral").strip().lower(),
                        "urgency": 95 if source_ticker in {"NVDA", "AMD", "AVGO", "TSM", "MU", "MSFT", "AMZN", "META", "GOOGL"} else 91,
                        "title": f"{source_label} {source_tagline} {_beneficiary_verb(str(source_mention.get('sentiment_label') or 'neutral'))} {', '.join(beneficiaries[:2])}",
                        "why_it_matters": body,
                        "action": f"Check {', '.join(beneficiaries[:3])} for read-through after the open",
                        "evidence": evidence,
                    }
                )
                continue

            if tracked_primary and not primary_mentions:
                # Unreachable today because tracked_primary comes from primary_mentions,
                # but kept to avoid silently widening this branch later.
                continue

            if tracked_primary and not tracked_secondary:
                beneficiary = max(tracked_primary, key=lambda mention: _mention_quality_score(article, mention))
                ticker = _clean_signal_text(beneficiary.get("ticker")).upper()
                why = _clean_signal_text(beneficiary.get("why_it_matters")) or _clean_signal_text(beneficiary.get("what_happened"))
                if not ticker or not why:
                    continue
                source_row = rows_by_market_ticker.get((market_key, ticker))
                beneficiary_targets: list[str] = []
                candidate_tags = set(article_tags)
                candidate_tags.update(row_theme_map.get((market_key, ticker), set()))
                if candidate_tags:
                    ranked_candidates: list[tuple[int, str]] = []
                    for candidate_ticker in tracked_market_tickers:
                        if candidate_ticker == ticker:
                            continue
                        candidate_row = rows_by_market_ticker.get((market_key, candidate_ticker))
                        if not candidate_row:
                            continue
                        candidate_row_tags = row_theme_map.get((market_key, candidate_ticker), set())
                        if not candidate_tags.intersection(candidate_row_tags):
                            continue
                        score = _beneficiary_score(source_row, candidate_row, candidate_tags, candidate_row_tags)
                        ranked_candidates.append((score, candidate_ticker))
                    for _score, candidate_ticker in sorted(ranked_candidates, reverse=True):
                        if candidate_ticker in beneficiary_targets:
                            continue
                        beneficiary_targets.append(candidate_ticker)
                        if len(beneficiary_targets) >= 3:
                            break
                key = f"macro:{market_key}:{ticker}:{article_title}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                event_text = _clean_signal_text(beneficiary.get("what_happened")) or article_title
                evidence = [value for value in [_clip_signal_text(event_text, 120), published_at[:10] if published_at else ""] if value][:2]
                if beneficiary_targets:
                    event_signals.append(
                        {
                            "ticker": ticker,
                            "position_type": "market",
                            "kind": "event_readthrough",
                            "tone": str(beneficiary.get("sentiment_label") or "neutral").strip().lower(),
                            "urgency": 90,
                            "title": f"{ticker} {_event_tagline(article, beneficiary)} {_beneficiary_verb(str(beneficiary.get('sentiment_label') or 'neutral'))} {', '.join(beneficiary_targets[:2])}",
                            "why_it_matters": _format_event_body(why, beneficiary_targets),
                            "action": f"Check {', '.join(beneficiary_targets[:3])} for follow-through after the open",
                            "evidence": evidence,
                        }
                    )
                else:
                    event_signals.append(
                        {
                            "ticker": ticker,
                            "position_type": "market",
                            "kind": "event_catalyst",
                            "tone": str(beneficiary.get("sentiment_label") or "neutral").strip().lower(),
                            "urgency": 86,
                            "title": f"{ticker} has a fresh pre-open event to price in",
                            "why_it_matters": why,
                            "action": f"Keep {ticker} on the first read after the open",
                            "evidence": evidence,
                        }
                    )
    return event_signals


def _today_setup(
    rows: list[dict[str, Any]],
    anomaly_by_id: dict[str, dict[str, Any]],
    reddit_by_id: dict[str, dict[str, Any]],
    earnings_by_id: dict[str, dict[str, Any]],
    anomaly_by_market: dict[str, dict[str, dict[str, Any]]],
    reddit_by_market: dict[str, dict[str, dict[str, Any]]],
    market_context_by_market: dict[str, dict[str, Any]],
    sector_context_by_market: dict[str, dict[str, dict[str, Any]]],
    enrichments_by_market: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    signals: list[dict[str, Any]] = []
    market_threads: list[str] = []
    tracked_tickers = {str(row.get("ticker") or "").strip().upper() for row in rows if row.get("ticker")}
    rows_by_market_sector: dict[tuple[str, str], list[dict[str, Any]]] = {}
    rows_by_market_ticker: dict[tuple[str, str], dict[str, Any]] = {}
    row_theme_map: dict[str, set[str]] = {}
    row_theme_by_market_ticker: dict[tuple[str, str], set[str]] = {}
    for row in rows:
        market_key = str(row.get("market") or "").strip().upper()
        ticker = str(row.get("ticker") or "").strip().upper()
        sector_key = str(row.get("sector_label") or "").strip().lower()
        if market_key and sector_key:
            rows_by_market_sector.setdefault((market_key, sector_key), []).append(row)
        if market_key and ticker:
            rows_by_market_ticker[(market_key, ticker)] = row
            row_theme_by_market_ticker[(market_key, ticker)] = _row_theme_tags(row)
        instrument_id = str(row.get("instrument_id") or "").strip()
        if instrument_id:
            row_theme_map[instrument_id] = row_theme_by_market_ticker.get((market_key, ticker), _row_theme_tags(row))

    for row in rows:
        instrument_id = str(row.get("instrument_id") or "").strip()
        ticker = str(row.get("ticker") or "").strip().upper()
        position_type = str(row.get("position_type") or "watchlist").strip().lower()
        directive = (row.get("directive_v2") or {}) if isinstance(row.get("directive_v2"), dict) else {}
        action = str(directive.get("title") or row.get("suggested_action") or "Review in Watchlist").strip()

        anomaly_doc = anomaly_by_id.get(instrument_id) or {}
        anomaly = anomaly_doc.get("anomaly") if isinstance(anomaly_doc.get("anomaly"), dict) else {}
        if anomaly:
            move = _safe_float(anomaly.get("day_change_pct"))
            catalyst = str(anomaly.get("catalyst") or "").strip()
            headline_raw = str(anomaly.get("headline") or "").strip()
            brief_raw = str(anomaly.get("today_brief") or anomaly.get("thesis") or "").strip()
            headline = headline_raw if ticker and ticker in headline_raw.upper() else f"{ticker} is in today's anomaly feed"
            why = brief_raw if ticker and ticker in brief_raw.upper() else ""
            if not why:
                move_text = f"{move:+.1f}% move" if move is not None else "material move"
                why = f"{ticker} is already showing a {move_text} ahead of today's session."
                if catalyst:
                    why += f" Catalyst: {catalyst}"
            evidence = []
            if move is not None:
                evidence.append(f"{move:+.1f}% move")
            if catalyst:
                evidence.append(catalyst)
            for point in (anomaly.get("key_points") or [])[:2]:
                if str(point or "").strip():
                    evidence.append(str(point).strip())
            signals.append(
                {
                    "ticker": ticker,
                    "position_type": position_type,
                    "kind": "preopen_catalyst",
                    "tone": "positive" if (move or 0) > 0 else "negative" if (move or 0) < 0 else "neutral",
                    "urgency": int(min(98, 72 + abs(move or 0) * 3)),
                    "title": headline,
                    "why_it_matters": why if why else f"{ticker} is already moving hard enough to matter for today's setup.",
                    "action": action,
                    "evidence": evidence[:3],
                }
            )

        reddit_doc = reddit_by_id.get(instrument_id) or {}
        cue = reddit_doc.get("cue") if isinstance(reddit_doc.get("cue"), dict) else {}
        mentions = int(_safe_float(cue.get("mention_count") or cue.get("mentions")) or 0)
        if cue and mentions > 0:
            summary = str(cue.get("summary") or cue.get("context") or "").strip()
            sentiment = str(cue.get("sentiment") or "neutral").strip().lower()
            catalysts = [str(v).strip() for v in (cue.get("catalysts") or []) if str(v).strip()]
            if mentions >= 2 or catalysts:
                top_posts = reddit_doc.get("top_posts") or []
                if isinstance(top_posts, list):
                    for post in top_posts[:1]:
                        if isinstance(post, dict):
                            title = str(post.get("title") or "").strip()
                            if title:
                                market_threads.append(title)
                signals.append(
                    {
                        "ticker": ticker,
                        "position_type": position_type,
                        "kind": "retail_buzz",
                        "tone": "positive" if sentiment == "bullish" else "negative" if sentiment == "bearish" else "neutral",
                        "urgency": int(min(90, 54 + mentions * 7)),
                        "title": f"{ticker} has fresh retail buzz before the open",
                        "why_it_matters": summary or f"Retail attention on {ticker} is elevated heading into today's session.",
                        "action": action,
                        "evidence": [f"{mentions} Reddit mentions", *catalysts[:2]],
                    }
                )

        earnings_doc = earnings_by_id.get(instrument_id) or {}
        if earnings_doc:
            event_date = str(earnings_doc.get("event_date") or "").strip()
            report = earnings_doc.get("report") if isinstance(earnings_doc.get("report"), dict) else {}
            setup = report.get("setup") if isinstance(report.get("setup"), dict) else {}
            decision = report.get("decision_guide") if isinstance(report.get("decision_guide"), dict) else {}
            headline = str(report.get("headline") or "").strip() or f"{ticker} earnings setup is live"
            summary = str(report.get("summary") or "").strip()
            days_until = int(_safe_float(earnings_doc.get("days_until")) or 99)
            audience_line = str(
                decision.get("for_holders") if position_type == "holding" else decision.get("for_watchers")
                or ""
            ).strip()
            why = audience_line or summary or str(setup.get("pre_earnings_positioning") or "").strip()
            evidence = [event_date] if event_date else []
            confidence = _safe_float(((report.get("confidence") or {}).get("score_0_100")))
            if confidence is not None:
                evidence.append(f"confidence {int(confidence)}/100")
            signals.append(
                {
                    "ticker": ticker,
                    "position_type": position_type,
                    "kind": "earnings_setup",
                    "tone": "neutral",
                    "urgency": int(min(96, 92 - max(0, days_until) * 7)),
                    "title": headline,
                    "why_it_matters": why if why else f"{ticker} reports soon and needs a pre-open read.",
                    "action": f"Open {ticker} earnings setup",
                    "evidence": evidence[:3],
                }
            )

    direct_event_signals = _direct_event_signals(rows, enrichments_by_market)
    signals.extend(direct_event_signals)
    existing_event_tickers = {
        _clean_signal_text(item.get("ticker")).upper()
        for item in direct_event_signals
        if _clean_signal_text(item.get("ticker"))
    }
    basket_signals = [
        item
        for item in _leader_basket_signals(rows_by_market_ticker, row_theme_by_market_ticker, anomaly_by_market)
        if _clean_signal_text(item.get("ticker")).upper() not in existing_event_tickers
    ]
    basket_signals.sort(key=_preopen_signal_rank, reverse=True)
    signals.extend(basket_signals[:2])
    cross_signals: list[dict[str, Any]] = []
    theme_groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        instrument_id = str(row.get("instrument_id") or "").strip()
        market_key = str(row.get("market") or "").strip().upper()
        for tag in row_theme_map.get(instrument_id, set()):
            theme_groups.setdefault((market_key, tag), []).append(row)

    for (market_key, sector_key), sector_rows in rows_by_market_sector.items():
        sector_label = str(sector_rows[0].get("sector_label") or "").strip() or sector_key.title()
        affected = [str(row.get("ticker") or "").strip().upper() for row in sector_rows if row.get("ticker")]
        if not affected:
            continue

        broad_anomalies = anomaly_by_market.get(market_key) or {}
        for broad_ticker, item in broad_anomalies.items():
            if broad_ticker in tracked_tickers:
                continue
            if str(item.get("sector") or "").strip().lower() != sector_key:
                continue
            move = _safe_float(item.get("day_change_pct"))
            why = str(item.get("today_brief") or item.get("thesis") or "").strip()
            catalyst = str(item.get("catalyst") or "").strip()
            if not why:
                continue
            cross_signals.append(
                {
                    "ticker": broad_ticker,
                    "position_type": "market",
                    "kind": "theme_spillover",
                    "tone": "positive" if (move or 0) > 0 else "negative" if (move or 0) < 0 else "neutral",
                    "urgency": int(min(94, 76 + abs(move or 0) * 2.5)),
                    "title": f"{broad_ticker} may set the tone for your {sector_label} names",
                    "why_it_matters": f"{why} This could spill into {', '.join(affected[:3])} in your Watchlist.",
                    "action": f"Watch {', '.join(affected[:3])} for follow-through after the open",
                    "evidence": [f"{move:+.1f}% move" if move is not None else sector_label, catalyst][:2],
                }
            )
            break

        sector_context = (sector_context_by_market.get(market_key) or {}).get(sector_key) or {}
        sector_visual = sector_context.get("visual_summary") if isinstance(sector_context.get("visual_summary"), dict) else {}
        sector_change = str(sector_visual.get("what_changed") or sector_context.get("today_brief") or "").strip()
        sector_watch = str(sector_visual.get("what_to_watch") or "").strip()
        if len(affected) >= 2 and sector_change:
            cross_signals.append(
                {
                    "ticker": sector_label,
                    "position_type": "market",
                    "kind": "sector_theme",
                    "tone": "neutral",
                    "urgency": 70,
                    "title": f"{sector_label} is a live theme across your Watchlist",
                    "why_it_matters": f"{sector_change} This theme runs through {', '.join(affected[:3])}.",
                    "action": sector_watch if sector_watch else f"Review {', '.join(affected[:3])} together, not one by one",
                    "evidence": [f"{len(affected)} tracked names in {sector_label}"],
                }
            )

    for market_key, market_context in market_context_by_market.items():
        visual = market_context.get("visual_summary") if isinstance(market_context.get("visual_summary"), dict) else {}
        for line in (
            str(market_context.get("today_brief") or "").strip(),
            str(visual.get("what_changed") or "").strip(),
            str(visual.get("what_to_watch") or "").strip(),
        ):
            if line:
                market_threads.append(line)
        reddit_snapshot = reddit_by_market.get(market_key) or {}
        for item in reddit_snapshot.values():
            summary = str(item.get("summary") or item.get("context") or "").strip()
            if summary:
                market_threads.append(summary)
                break

    for (market_key, tag), tagged_rows in theme_groups.items():
        affected = []
        seen_affected: set[str] = set()
        for row in tagged_rows:
            ticker = str(row.get("ticker") or "").strip().upper()
            if not ticker or ticker in seen_affected:
                continue
            seen_affected.add(ticker)
            affected.append(ticker)
        if len(affected) < 2:
            continue
        candidate: dict[str, Any] | None = None
        candidate_ticker = ""
        preferred_leaders = set(THEME_LEADERS.get(tag) or ())
        for broad_ticker, item in (anomaly_by_market.get(market_key) or {}).items():
            tags = _theme_tags_from_text(item.get("headline"), item.get("today_brief"), item.get("thesis"), item.get("catalyst"))
            if broad_ticker in preferred_leaders and tag in tags:
                candidate = item
                candidate_ticker = broad_ticker
                break
        if candidate is None:
            for broad_ticker, item in (anomaly_by_market.get(market_key) or {}).items():
                tags = _theme_tags_from_text(item.get("headline"), item.get("today_brief"), item.get("thesis"), item.get("catalyst"))
                if tag in tags:
                    candidate = item
                    candidate_ticker = broad_ticker
                    break
        if candidate is None:
            for broad_ticker, item in (reddit_by_market.get(market_key) or {}).items():
                tags = _theme_tags_from_text(item.get("summary"), item.get("context"), *(item.get("catalysts") or []))
                if broad_ticker in preferred_leaders and tag in tags:
                    candidate = item
                    candidate_ticker = broad_ticker
                    break
        if candidate is None:
            for broad_ticker, item in (reddit_by_market.get(market_key) or {}).items():
                tags = _theme_tags_from_text(item.get("summary"), item.get("context"), *(item.get("catalysts") or []))
                if tag in tags:
                    candidate = item
                    candidate_ticker = broad_ticker
                    break
        if candidate is None:
            continue
        beneficiary_targets = [ticker for ticker in affected if ticker != candidate_ticker][:3]
        if not beneficiary_targets:
            continue
        why = str(candidate.get("today_brief") or candidate.get("thesis") or candidate.get("summary") or candidate.get("context") or "").strip()
        if not why:
            continue
        move = _safe_float(candidate.get("day_change_pct"))
        catalyst = str(candidate.get("catalyst") or "").strip()
        display_tag = THEME_LABELS.get(tag, tag.replace("_", " "))
        cross_signals.append(
            {
                "ticker": candidate_ticker or tag,
                "position_type": "market",
                "kind": "theme_beneficiary",
                "tone": "positive" if (move or 0) > 0 else "negative" if (move or 0) < 0 else "neutral",
                "urgency": int(min(96, 82 + abs(move or 0) * 2.5)),
                "title": f"{candidate_ticker or tag.upper()} could influence your {display_tag} names",
                "why_it_matters": f"{why} That can matter for {', '.join(beneficiary_targets)} in your Watchlist.",
                "action": f"Check {', '.join(beneficiary_targets)} for theme follow-through after the open",
                "evidence": [f"{move:+.1f}% move" if move is not None else display_tag, catalyst][:2],
            }
        )

    priority = {"event_readthrough": 6, "leader_basket": 5, "event_catalyst": 4, "macro_readthrough": 3, "theme_beneficiary": 3, "theme_spillover": 2, "sector_theme": 1}
    best_cross: dict[str, dict[str, Any]] = {}
    for item in cross_signals:
        ticker = str(item.get("ticker") or "")
        existing = best_cross.get(ticker)
        if existing is None:
            best_cross[ticker] = item
            continue
        existing_rank = priority.get(str(existing.get("kind") or ""), 0)
        item_rank = priority.get(str(item.get("kind") or ""), 0)
        if item_rank > existing_rank or (
            item_rank == existing_rank and int(item.get("urgency") or 0) > int(existing.get("urgency") or 0)
        ):
            best_cross[ticker] = item
    deduped_cross = list(best_cross.values())

    signals.extend(deduped_cross)
    signals.sort(key=lambda item: int(item.get("urgency") or 0), reverse=True)
    direct_kinds = {"event_readthrough", "leader_basket", "event_catalyst", "macro_readthrough"}
    direct_top = sorted(
        [item for item in signals if str(item.get("kind") or "") in direct_kinds],
        key=_preopen_signal_rank,
        reverse=True,
    )[:2]
    used_direct_tickers = {str(item.get("ticker") or "") for item in direct_top}
    remaining = [
        item
        for item in signals
        if item not in direct_top and str(item.get("ticker") or "") not in used_direct_tickers
    ]
    trimmed = [*direct_top, *remaining[: max(0, 6 - len(direct_top))]]
    unique_threads: list[str] = []
    seen_threads: set[str] = set()
    for line in market_threads:
        if line.lower() in seen_threads:
            continue
        seen_threads.add(line.lower())
        unique_threads.append(line)
    top = trimmed[:3]
    if trimmed:
        cross_top = [
            item
            for item in trimmed
            if str(item.get("kind") or "") in {"event_readthrough", "leader_basket", "event_catalyst", "macro_readthrough", "theme_spillover", "sector_theme", "theme_beneficiary"}
        ]
        if cross_top:
            direct_cross_top = [
                item for item in cross_top
                if str(item.get("kind") or "") in {"event_readthrough", "leader_basket", "event_catalyst", "macro_readthrough"}
            ]
            if direct_cross_top:
                visible_direct_count = min(len(direct_top), 2)
                headline = f"{visible_direct_count} market event{'s' if visible_direct_count != 1 else ''} could move names in your Watchlist today"
            else:
                headline = f"{len(cross_top)} broader market theme{'s' if len(cross_top) != 1 else ''} may affect your Watchlist today"
            body_source = direct_top[:2] if direct_cross_top else cross_top[:2]
            body = " ".join(str(item.get("why_it_matters") or "").strip() for item in body_source if str(item.get("why_it_matters") or "").strip())[:520]
        else:
            headline = (
                f"{len(top)} pre-open catalyst{'s' if len(top) != 1 else ''} matter for your Watchlist today"
                if len(top) > 1
                else f"{top[0].get('ticker') or 'A tracked name'} has the key pre-open setup today"
            )
            body = " ".join(
                f"{item.get('ticker')}: {str(item.get('why_it_matters') or '').strip()}"
                for item in top
                if str(item.get("why_it_matters") or "").strip()
            )[:520]
    else:
        headline = "No fresh pre-open catalyst stood above the noise"
        body = "Your tracked names do not have a clear overnight catalyst yet, so today's plan stays price- and directive-led."
    return {
        "headline": headline,
        "body": body,
        "signals": trimmed,
        "market_threads": unique_threads[:3],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


RADAR_UNIVERSE_PATH = Path(__file__).resolve().parent / "config" / "radar_universe.json"
RADAR_THEME_NAMES = {
    "ai-capex": "AI capex",
    "energy": "Energy",
    "healthcare": "Healthcare",
    "defense": "Defense",
    "financials": "Financials",
    "cybersecurity": "Cybersecurity",
    "robotics-automation": "Robotics & automation",
    "water-infrastructure": "Water infrastructure",
    "critical-materials": "Critical materials",
    "space-infrastructure": "Space infrastructure",
}
RADAR_THEME_SECTORS = {
    "ai-capex": "Technology",
    "energy": "Energy",
    "healthcare": "Healthcare",
    "defense": "Industrials",
    "financials": "Financials",
    "cybersecurity": "Technology",
    "robotics-automation": "Industrials",
    "water-infrastructure": "Industrials",
    "critical-materials": "Materials",
    "space-infrastructure": "Industrials",
}


def _radar_theme_data(store: TraceMoneyStore) -> tuple[dict[str, list[str]], dict[str, float]]:
    try:
        live_payload = store.get_research_themes() or {}
    except Exception:
        live_payload = {}
    live_themes = live_payload.get("themes") if isinstance(live_payload, dict) else None
    if isinstance(live_themes, list):
        universe: dict[str, list[str]] = {}
        scores: dict[str, float] = {}
        for theme in live_themes:
            if not isinstance(theme, dict) or not str(theme.get("slug") or "").strip():
                continue
            candidates = theme.get("candidates")
            if not isinstance(candidates, list):
                continue
            slug = str(theme["slug"])
            universe[slug] = [
                str(row.get("ticker") or "").upper()
                for row in candidates
                if isinstance(row, dict) and str(row.get("ticker") or "").strip()
            ]
            for row in candidates:
                if not isinstance(row, dict) or not isinstance(row.get("stocksbrewScore"), (int, float)):
                    continue
                scores[str(row.get("ticker") or "").upper()] = float(row["stocksbrewScore"])
        if universe:
            return universe, scores

    try:
        payload = json.loads(RADAR_UNIVERSE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}, {}
    us = payload.get("US") if isinstance(payload, dict) else None
    raw_scores = payload.get("US_scores") if isinstance(payload, dict) else None
    universe = {
        str(theme): [str(ticker).upper() for ticker in tickers if str(ticker).strip()]
        for theme, tickers in (us or {}).items()
        if isinstance(tickers, list)
    }
    scores = {
        str(ticker).upper(): float(score)
        for ticker, score in (raw_scores or {}).items()
        if isinstance(score, (int, float))
    }
    return universe, scores


def _radar_suggestions(
    store: TraceMoneyStore,
    rows: list[dict[str, Any]],
    markets: list[str],
) -> list[dict[str, Any]]:
    effective_markets = [str(market).upper() for market in markets if str(market).upper() in {"US", "IN"}] or ["US"]
    tracked_ids = {str(row.get("instrument_id") or "").upper() for row in rows}
    tracked_tickers = {str(row.get("ticker") or "").upper() for row in rows}
    avg_overall = _average_score(rows, "overall")
    clusters = _sector_counts(rows)
    dominant_sector = str((clusters[0] or {}).get("sector") or "") if clusters else ""
    dominant_weight = float((clusters[0] or {}).get("weight_pct") or 0) if clusters else 0.0
    snapshots_by_market: dict[str, dict[str, dict[str, Any]]] = {}
    for market in effective_markets:
        by_ticker: dict[str, dict[str, Any]] = {}
        for snapshot in store.get_market_price_snapshot(market):
            ticker = str(snapshot.get("symbol") or snapshot.get("ticker") or "").strip().upper()
            if ticker:
                by_ticker[ticker] = snapshot
        snapshots_by_market[market] = by_ticker

    candidate_map: dict[str, dict[str, Any]] = {}

    def fit_for(sector: str, score: float | None) -> tuple[float, list[str]]:
        points = 0.0
        reasons: list[str] = []
        if score is not None and avg_overall is not None and score - avg_overall >= 4:
            gap = score - avg_overall
            points += min(12.0, gap * 0.35)
            reasons.append(f"scores {gap:.0f} points above your average")
        if dominant_weight >= 50 and dominant_sector and sector:
            if sector.lower() != dominant_sector.lower():
                points += 10.0
                reasons.append(f"adds exposure outside {dominant_sector}")
            else:
                points -= 6.0
        return points, reasons

    def resolve(market: str, ticker: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        item = payload or {}
        snapshot = snapshots_by_market.get(market, {}).get(ticker, {})
        price = snapshot.get("price") if isinstance(snapshot.get("price"), dict) else {}
        return {
            "instrument_id": str(item.get("instrument_id") or item.get("instrumentId") or snapshot.get("instrumentId") or f"{market}_{ticker}").upper(),
            "ticker": ticker,
            "market": market,
            "name": str(item.get("name") or item.get("company_name") or snapshot.get("name") or ticker),
            "price": _safe_float(item.get("price")) or _safe_float(price.get("current")),
            "day_change_pct": _safe_float(item.get("day_change_pct")) if item.get("day_change_pct") is not None else _safe_float(price.get("changePct")),
        }

    def merge(candidate: dict[str, Any]) -> None:
        instrument_id = str(candidate.get("instrument_id") or "").upper()
        ticker = str(candidate.get("ticker") or "").upper()
        if not instrument_id or instrument_id in tracked_ids or ticker in tracked_tickers:
            return
        candidate["instrument_id"] = instrument_id
        existing = candidate_map.get(instrument_id)
        if not existing:
            candidate_map[instrument_id] = candidate
            return
        sources = list(dict.fromkeys([*(existing.get("sources") or []), *(candidate.get("sources") or [])]))
        reasons = list(dict.fromkeys([*(existing.get("personalization_reasons") or []), *(candidate.get("personalization_reasons") or [])]))
        existing.update({
            "name": existing.get("name") or candidate.get("name"),
            "price": existing.get("price") if existing.get("price") is not None else candidate.get("price"),
            "day_change_pct": existing.get("day_change_pct") if existing.get("day_change_pct") is not None else candidate.get("day_change_pct"),
            "why": existing.get("why") or candidate.get("why"),
            "score": existing.get("score") if existing.get("score") is not None else candidate.get("score"),
            "overall_score": existing.get("overall_score") if existing.get("overall_score") is not None else candidate.get("overall_score"),
            "sources": sources,
            "theme_names": list(dict.fromkeys([*(existing.get("theme_names") or []), *(candidate.get("theme_names") or [])])),
            "theme_roles": list(dict.fromkeys([*(existing.get("theme_roles") or []), *(candidate.get("theme_roles") or [])])),
            "reddit_mentions": max(int(existing.get("reddit_mentions") or 0), int(candidate.get("reddit_mentions") or 0)),
            "reddit_summary": existing.get("reddit_summary") or candidate.get("reddit_summary"),
            "mover_move_pct": existing.get("mover_move_pct") if existing.get("mover_move_pct") is not None else candidate.get("mover_move_pct"),
            "mover_headline": existing.get("mover_headline") or candidate.get("mover_headline"),
            "personalization_score": round(max(float(existing.get("personalization_score") or 0), float(candidate.get("personalization_score") or 0)) + (len(sources) - 1) * 8, 1),
            "personalization_reasons": reasons[:3],
        })

    # Theme membership is the evergreen universe. The daily inputs below rotate the result.
    theme_universe, theme_scores = _radar_theme_data(store)
    if "US" in effective_markets:
        for theme_id, tickers in theme_universe.items():
            theme_name = RADAR_THEME_NAMES.get(theme_id, theme_id.replace("-", " ").title())
            sector = RADAR_THEME_SECTORS.get(theme_id, theme_name)
            for rank, ticker in enumerate(tickers[:10]):
                base = resolve("US", ticker)
                score = theme_scores.get(ticker)
                fit, fit_reasons = fit_for(sector, score)
                merge({
                    **base,
                    "reason": theme_name,
                    "why": theme_name,
                    "score": score,
                    "overall_score": score,
                    "sector": sector,
                    "sources": ["theme"],
                    "theme_names": [theme_name],
                    "theme_roles": [],
                    "personalization_score": round(38.0 + (score if score is not None else 55.0) * 0.42 + max(0.0, 10.0 - rank) + fit, 1),
                    "personalization_reasons": [theme_name, *fit_reasons][:3],
                })

    # The latest completed movers doc is the prior session: keep ten gainers and ten losers.
    for market in effective_markets:
        movers = store.get_market_movers(market) or {}
        for direction, key in (("gainer", "gainers"), ("loser", "losers")):
            for rank, item in enumerate((movers.get(key) or [])[:10]):
                if not isinstance(item, dict):
                    continue
                ticker = str(item.get("ticker") or item.get("symbol") or "").strip().upper()
                if not ticker:
                    continue
                base = resolve(market, ticker, item)
                move = _safe_float(item.get("day_change_pct"))
                fit, fit_reasons = fit_for(str(item.get("sector") or ""), _safe_float(item.get("overall_score")))
                move_text = f"{move:+.1f}% yesterday" if move is not None else "Yesterday's mover"
                merge({
                    **base,
                    "reason": "Yesterday's movers",
                    "why": move_text,
                    "score": _safe_float(item.get("overall_score")),
                    "overall_score": _safe_float(item.get("overall_score")),
                    "sector": str(item.get("sector") or ""),
                    "sources": ["mover"],
                    "mover_direction": direction,
                    "mover_rank": rank + 1,
                    "mover_move_pct": move,
                    "mover_headline": move_text,
                    "personalization_score": round(42.0 + min(28.0, abs(move or 0.0) * 1.35) + max(0.0, 10.0 - rank) + fit, 1),
                    "personalization_reasons": [move_text, *fit_reasons][:3],
                })

    # Reddit contributes the six most-mentioned names in the latest scan.
    reddit_by_market = _load_reddit_buzz_by_market(store, effective_markets)
    for market, tickers in reddit_by_market.items():
        ranked = sorted(
            tickers.items(),
            key=lambda pair: _safe_float(pair[1].get("mention_count", pair[1].get("mentions"))) or 0,
            reverse=True,
        )[:6]
        for rank, (ticker, item) in enumerate(ranked):
            mentions = int(_safe_float(item.get("mention_count", item.get("mentions"))) or 0)
            base = resolve(market, ticker, item)
            summary = str(item.get("summary") or item.get("context") or "").strip()[:200]
            fit, fit_reasons = fit_for(str(item.get("sector") or ""), _safe_float(item.get("overall_score")))
            merge({
                **base,
                "name": str(item.get("company_name") or item.get("name") or base.get("name")),
                "reason": "Reddit buzz",
                "why": summary or f"{mentions} Reddit mentions",
                "score": _safe_float(item.get("overall_score")),
                "overall_score": _safe_float(item.get("overall_score")),
                "sector": str(item.get("sector") or ""),
                "sources": ["reddit"],
                "reddit_mentions": mentions,
                "reddit_summary": summary,
                "reddit_sentiment": str(item.get("sentiment") or "").lower(),
                "personalization_score": round(40.0 + min(28.0, mentions * 1.7) + max(0.0, 8.0 - rank) + fit, 1),
                "personalization_reasons": [f"Reddit buzz · {mentions} mentions", *fit_reasons][:3],
            })

    candidates = sorted(candidate_map.values(), key=lambda item: float(item.get("personalization_score") or 0.0), reverse=True)
    mover_candidate = next(
        (item for item in candidates if "mover" in (item.get("sources") or [])),
        None,
    )
    reddit_candidate = next(
        (item for item in candidates if "reddit" in (item.get("sources") or [])),
        None,
    )
    ordered_candidates: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for item in [mover_candidate, reddit_candidate, *candidates]:
        if not item:
            continue
        instrument_id = str(item.get("instrument_id") or "")
        if instrument_id in seen_ids:
            continue
        seen_ids.add(instrument_id)
        ordered_candidates.append(item)
    for item in ordered_candidates:
        if int(item.get("reddit_mentions") or 0) > 0 and item.get("sources") == ["reddit"]:
            item["why"] = item.get("reddit_summary") or item.get("why")
        elif item.get("mover_move_pct") is not None:
            item["why"] = item.get("mover_headline") or item.get("why")
    return ordered_candidates[:6]


def _portfolio_diagnostics(
    rows: list[dict[str, Any]],
    store: TraceMoneyStore,
    position_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not rows:
        return {
            "summary": "No tracked stocks yet.",
            "clusters": [],
            "risk_flags": [],
            "opportunities": [],
            "suggestions": _radar_suggestions(store, [], ["US"]),
        }

    holding_rows = [row for row in rows if row.get("position_type") == "holding"]
    diagnosis_rows = holding_rows if holding_rows else rows

    clusters = _sector_counts(diagnosis_rows)
    dominant = clusters[0] if clusters else None
    risk_flags: list[dict[str, Any]] = []
    if dominant and dominant["weight_pct"] >= 50:
        risk_flags.append({
            "kind": "sector_concentration",
            "severity": "high" if dominant["weight_pct"] >= 70 else "medium",
            "headline": f"{dominant['weight_pct']:.0f}% clustered in {dominant['sector']}",
            "body": "A single-sector book can look great until one macro factor hits every name together.",
        })

    weak_rows = [
        row for row in diagnosis_rows
        if _safe_float((row.get("scores") or {}).get("overall")) is not None
        and (_safe_float((row.get("scores") or {}).get("overall")) or 0) < 45
    ]
    for row in sorted(weak_rows, key=lambda item: _safe_float((item.get("scores") or {}).get("overall")) or 0)[:3]:
        weakest_label = "your holdings" if holding_rows else "the list"
        risk_flags.append({
            "kind": "low_score",
            "severity": "medium",
            "ticker": row.get("ticker"),
            "headline": f"{row.get('ticker')} is the weakest score in {weakest_label}",
            "body": f"Overall score {row.get('scores', {}).get('overall')} with pressure in the factor stack.",
        })

    overbought = [
        row for row in diagnosis_rows
        if (_safe_float(((row.get("technicals") or {}).get("rsi_14") or {}).get("value")) or 0) >= 70
    ]
    for row in overbought[:3]:
        rsi = _safe_float(((row.get("technicals") or {}).get("rsi_14") or {}).get("value"))
        risk_flags.append({
            "kind": "overbought",
            "severity": "medium",
            "ticker": row.get("ticker"),
            "headline": f"{row.get('ticker')} is technically stretched",
            "body": f"RSI is {rsi:.1f}; this is a watch-for-pullback setup, not fresh confirmation.",
        })

    opportunities = []
    watching_rows = [row for row in rows if row.get("position_type") != "holding"]
    for row in sorted(
        watching_rows,
        key=lambda item: (_safe_float(item.get("target_upside_pct")) or -999),
        reverse=True,
    ):
        upside = _safe_float(row.get("target_upside_pct"))
        if upside is None or upside < 15:
            continue
        opportunities.append({
            "ticker": row.get("ticker"),
            "market": row.get("market"),
            "kind": "analyst_runway",
            "headline": f"{row.get('ticker')} has {upside:+.1f}% target runway",
            "body": (
                f"On your watch list · score {row.get('scores', {}).get('overall')}; "
                "consider adding at good entry points while runway holds."
            ),
        })
        if len(opportunities) >= 3:
            break

    markets = sorted({str(row.get("market")) for row in rows if row.get("market") in {"US", "IN"}})
    suggestions = _radar_suggestions(store, rows, markets)
    summary_parts = []
    if holding_rows:
        if dominant:
            summary_parts.append(f"{dominant['sector']} is the largest cluster at {dominant['weight_pct']:.0f}%.")
        avg_overall = _weighted_average_score(diagnosis_rows, "overall")
        if avg_overall is not None:
            summary_parts.append(f"Average stocksbrew score is {avg_overall}.")
        if risk_flags:
            summary_parts.append(f"{len(risk_flags)} risk flag{'s' if len(risk_flags) != 1 else ''} need review.")
    else:
        if dominant:
            summary_parts.append(f"{dominant['sector']} is the largest cluster at {dominant['weight_pct']:.0f}%.")
        avg_overall = _average_score(diagnosis_rows, "overall")
        if avg_overall is not None:
            summary_parts.append(f"Average stocksbrew score is {avg_overall}.")
        if risk_flags:
            summary_parts.append(f"{len(risk_flags)} risk flags need review.")
        if opportunities:
            summary_parts.append(
                f"{len(opportunities)} watch list name{'s' if len(opportunities) != 1 else ''} "
                "have strong analyst runway for entry."
            )

    position_meta = position_meta or {}
    holdings_with_weight = []
    for row in rows:
        if row.get("position_type") != "holding":
            continue
        holding = row.get("holding") if isinstance(row.get("holding"), dict) else {}
        weight = _safe_float((holding or {}).get("portfolio_weight_pct"))
        if weight is None:
            continue
        holdings_with_weight.append((row, weight))
    holdings_with_weight.sort(key=lambda item: item[1], reverse=True)
    top1 = holdings_with_weight[0][1] if holdings_with_weight else 0.0
    top3 = sum(weight for _, weight in holdings_with_weight[:3]) if holdings_with_weight else 0.0
    hhi = sum((weight / 100.0) ** 2 for _, weight in holdings_with_weight) if holdings_with_weight else 0.0
    if top1 >= 35 or top3 >= 75 or hhi >= 0.22:
        concentration_label = "high"
    elif top1 >= 25 or top3 >= 60 or hhi >= 0.14:
        concentration_label = "medium"
    else:
        concentration_label = "low"

    position_risks: list[dict[str, Any]] = []
    if holdings_with_weight and top1 >= 30:
        top_row = holdings_with_weight[0][0]
        position_risks.append({
            "kind": "single_position_concentration",
            "severity": "high",
            "ticker": top_row.get("ticker"),
            "headline": f"{top_row.get('ticker')} is {top1:.1f}% of entered holdings",
            "body": "One position dominates your entered portfolio value; review sizing risk.",
        })
    if holdings_with_weight and top3 >= 65:
        position_risks.append({
            "kind": "top3_concentration",
            "severity": "medium" if top3 < 75 else "high",
            "headline": f"Top 3 holdings are {top3:.1f}% of entered value",
            "body": "Concentration across a few names can amplify drawdowns if one thesis breaks.",
        })
    for row, weight in holdings_with_weight[:5]:
        stance = str(((row.get("ai_directive") or {}).get("stance") or "")).lower()
        overall = _safe_float((row.get("scores") or {}).get("overall")) or 50.0
        if weight >= 15 and stance in {"trim", "avoid"}:
            position_risks.append({
                "kind": "large_position_negative_directive",
                "severity": "high" if weight >= 25 else "medium",
                "ticker": row.get("ticker"),
                "headline": f"{row.get('ticker')} is large ({weight:.1f}%) with {stance} directive",
                "body": "The highest-impact directive is on a large position; prioritize this review first.",
            })
        elif weight >= 15 and overall < 50:
            position_risks.append({
                "kind": "large_position_low_score",
                "severity": "medium",
                "ticker": row.get("ticker"),
                "headline": f"{row.get('ticker')} is large ({weight:.1f}%) with low score {overall:.0f}",
                "body": "Large allocation and weak factor stack can materially affect portfolio outcomes.",
            })

    return {
        "summary": " ".join(summary_parts) or "Watchlist diagnosis is ready.",
        "position_aware": bool(position_meta.get("position_aware")),
        "total_entered_value": position_meta.get("total_entered_value"),
        "concentration": {
            "top1_pct": _round(top1, 2),
            "top3_pct": _round(top3, 2),
            "hhi": _round(hhi, 4),
            "risk_label": concentration_label,
        },
        "position_risks": position_risks[:8],
        "clusters": clusters,
        "factor_tilt": {
            "overall": _weighted_average_score(diagnosis_rows, "overall"),
            "valuation": _weighted_average_score(diagnosis_rows, "valuation"),
            "growth": _weighted_average_score(diagnosis_rows, "growth"),
            "quality": _weighted_average_score(diagnosis_rows, "quality"),
            "momentum": _weighted_average_score(diagnosis_rows, "momentum"),
        },
        "risk_flags": risk_flags[:6],
        "opportunities": opportunities[:6],
        "suggestions": suggestions,
    }


def _attention_items(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "instrument_id": row.get("instrument_id"),
            "ticker": row.get("ticker"),
            "position_type": row.get("position_type", "watchlist"),
            "price": row.get("price"),
            "currency": row.get("currency", "USD"),
            "day_change_pct": row.get("day_change_pct"),
            "attention_score": row.get("attention_score", 0),
            "attention_reason": row.get("attention_reason", ""),
            "attention_kind": row.get("attention_kind", "calm"),
            "suggested_action": row.get("suggested_action", "Review"),
            "action_tone": row.get("action_tone", "neutral"),
            "sector_label": row.get("sector_label", ""),
        }
        for row in sorted(rows, key=lambda item: item.get("attention_score") or 0, reverse=True)[:8]
    ]


def _risk_summary(rows: list[dict[str, Any]], portfolio: dict[str, Any]) -> dict[str, Any]:
    holdings = [row for row in rows if row.get("position_type") == "holding"]
    watching = [row for row in rows if row.get("position_type") != "holding"]
    hot_holdings = [row for row in holdings if (row.get("attention_score") or 0) >= 70]
    clusters = portfolio.get("clusters") or []
    dominant = clusters[0] if clusters else {}
    if hot_holdings:
        headline = f"{hot_holdings[0].get('ticker')} needs review first"
        body = str(hot_holdings[0].get("attention_reason") or "A holding has a material signal.")
    elif dominant:
        headline = f"{dominant.get('sector')} dominates your tracked names"
        body = f"{round(float(dominant.get('weight_pct') or 0))}% of tracked names sit in {dominant.get('sector')}. Keep an eye on single-theme risk."
    else:
        headline = "No obvious risk cluster yet"
        body = "Add more holdings/watchlist names and stocksbrew will detect concentration, technical, and news risk."
    return {
        "headline": headline,
        "body": body,
        "holdings_with_attention": len(hot_holdings),
        "holding_count": len(holdings),
        "watchlist_count": len(watching),
    }


def _event_radar(rows: list[dict[str, Any]], portfolio: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    def add(
        *,
        ticker: str = "",
        kind: str,
        title: str,
        body: str,
        urgency: int,
        tone: str = "neutral",
        evidence: list[str] | None = None,
    ) -> None:
        events.append({
            "ticker": ticker,
            "kind": kind,
            "title": title,
            "body": body,
            "urgency": max(0, min(100, int(urgency))),
            "tone": tone,
            "evidence": evidence or [],
        })

    for row in rows:
        ticker = str(row.get("ticker") or "")
        changes = row.get("changes") or {}
        if changes.get("is_new"):
            add(
                ticker=ticker,
                kind="new_tracking",
                title=f"{ticker} is new to the watchlist",
                body="Baseline facts, score, technicals, and alerts are now being tracked for changes.",
                urgency=60,
                evidence=["new baseline"],
            )
        elif changes.get("has_material_change"):
            overall_delta = _safe_float(((changes.get("score_deltas") or {}).get("overall")))
            if overall_delta is not None and abs(overall_delta) >= 1:
                add(
                    ticker=ticker,
                    kind="conviction_delta",
                    title=f"{ticker} conviction {'improved' if overall_delta > 0 else 'weakened'}",
                    body=f"Overall score changed {overall_delta:+.1f} since the last watchlist build.",
                    urgency=72 if abs(overall_delta) >= 5 else 58,
                    tone="positive" if overall_delta > 0 else "negative",
                    evidence=[f"score {overall_delta:+.1f}"],
                )
            target_delta = _safe_float(changes.get("target_upside_delta"))
            if target_delta is not None and abs(target_delta) >= 2:
                add(
                    ticker=ticker,
                    kind="target_delta",
                    title=f"{ticker} analyst runway changed",
                    body=f"Target upside moved {target_delta:+.1f} points since the last refresh.",
                    urgency=65,
                    tone="positive" if target_delta > 0 else "negative",
                    evidence=[f"runway {target_delta:+.1f} pts"],
                )

        for signal in row.get("premium_signals") or []:
            if not isinstance(signal, dict):
                continue
            kind = str(signal.get("kind") or "")
            tone = str(signal.get("tone") or "neutral")
            value = _safe_float(signal.get("value"))
            if kind == "event":
                add(
                    ticker=ticker,
                    kind="upcoming_event",
                    title=f"{ticker}: {signal.get('label') or 'Event'}",
                    body=str(signal.get("sentence") or ""),
                    urgency=70,
                    evidence=[str(signal.get("value") or "")],
                )
            elif kind == "technical_state" and value is not None and (value >= 70 or value <= 35):
                add(
                    ticker=ticker,
                    kind="technical_extreme",
                    title=f"{ticker} RSI is {'stretched' if value >= 70 else 'washed out'}",
                    body=str(signal.get("sentence") or ""),
                    urgency=68 if value >= 70 else 62,
                    tone=tone,
                    evidence=[f"RSI {value:.1f}"],
                )
            elif kind == "analyst_upside" and value is not None and abs(value) >= 15:
                add(
                    ticker=ticker,
                    kind="analyst_runway",
                    title=f"{ticker} has meaningful analyst runway",
                    body=str(signal.get("sentence") or ""),
                    urgency=64,
                    tone=tone,
                    evidence=[f"{value:+.1f}% target upside"],
                )
            elif kind == "price_move" and value is not None and abs(value) >= 5:
                add(
                    ticker=ticker,
                    kind="large_move",
                    title=f"{ticker} made a large move",
                    body=str(signal.get("sentence") or ""),
                    urgency=66,
                    tone=tone,
                    evidence=[f"{value:+.1f}% today"],
                )

        news_velocity = row.get("news_velocity") or {}
        mentions_7d = _safe_float(news_velocity.get("mentions_7d")) or 0
        mentions_1d = _safe_float(news_velocity.get("mentions_1d")) or 0
        if mentions_7d >= 3 or mentions_1d >= 2:
            add(
                ticker=ticker,
                kind="news_velocity",
                title=f"{ticker} news activity is elevated",
                body=f"{mentions_1d:.0f} mention(s) today and {mentions_7d:.0f} over 7 days.",
                urgency=55 + min(20, int(mentions_7d * 3)),
                evidence=[f"{mentions_7d:.0f} mentions / 7D"],
            )

    for risk in (portfolio.get("risk_flags") or [])[:3]:
        if not isinstance(risk, dict):
            continue
        severity = str(risk.get("severity") or "medium")
        add(
            ticker=str(risk.get("ticker") or ""),
            kind=str(risk.get("kind") or "portfolio_risk"),
            title=str(risk.get("headline") or "Portfolio risk flag"),
            body=str(risk.get("body") or ""),
            urgency=82 if severity == "high" else 70,
            tone="negative",
            evidence=[severity],
        )

    events.sort(key=lambda item: item.get("urgency", 0), reverse=True)
    seen: set[tuple[str, str, str]] = set()
    unique: list[dict[str, Any]] = []
    for event in events:
        key = (str(event.get("ticker")), str(event.get("kind")), str(event.get("title")))
        if key in seen:
            continue
        seen.add(key)
        unique.append(event)
    return unique[:12]


def _change_summary(rows: list[dict[str, Any]], previous_view: dict[str, Any] | None) -> dict[str, Any]:
    changed = [row for row in rows if (row.get("changes") or {}).get("has_material_change")]
    new_rows = [row for row in rows if (row.get("changes") or {}).get("is_new")]
    score_changes = []
    for row in rows:
        delta = _safe_float(((row.get("changes") or {}).get("score_deltas") or {}).get("overall"))
        if delta is not None and abs(delta) >= 1:
            score_changes.append({
                "ticker": row.get("ticker"),
                "delta": delta,
                "direction": "up" if delta > 0 else "down",
                "sentence": f"{row.get('ticker')} score moved {delta:+.1f}.",
            })
    score_changes.sort(key=lambda item: abs(item["delta"]), reverse=True)
    return {
        "has_previous": bool(previous_view),
        "changed_count": len(changed),
        "new_count": len(new_rows),
        "score_changes": score_changes[:6],
        "new_tickers": [row.get("ticker") for row in new_rows],
        "summary": (
            "No previous snapshot yet; this build sets the baseline."
            if not previous_view
            else f"{len(changed)} tracked stock(s) changed materially since the last build."
        ),
    }


def build_watchlist_view(
    store: TraceMoneyStore,
    uid: str,
    tracked_stocks: list[str],
    *,
    is_subscribed: bool = False,
    positions: dict[str, Any] | None = None,
    holdings: dict[str, Any] | None = None,
    active_universes: dict[str, str] | None = None,
    include_llm_brief: bool = True,
) -> dict[str, Any]:
    """Produce the materialized payload for `tm_watchlist_views/{uid}`.

    Does not write - caller is responsible for calling
    `store.save_watchlist_view(uid, payload)`.
    """
    active_universes = active_universes or _active_universe_cache(store)
    alerts_by_instrument = _load_user_alerts(store, uid)
    previous_view = store.get_watchlist_view(uid)

    max_rows = FREE_WATCHLIST_ROW_CAP if not is_subscribed else None
    source_ids = tracked_stocks or []
    if max_rows is not None:
        source_ids = source_ids[:max_rows]
    ids = [str(instrument_id) for instrument_id in source_ids]
    latest_by_id = store.get_latest_prices(ids)
    facts_by_id = store.get_stock_facts_batch(ids)
    technical_by_id = store.get_latest_stock_technicals_batch(ids)
    mention_by_id = store.get_mention_stats_batch(ids)
    instrument_meta_by_id = _instrument_meta_by_id(store, ids)
    markets = sorted({_market_from_instrument_id(instrument_id) for instrument_id in ids if _market_from_instrument_id(instrument_id)})

    intel_by_id: dict[str, dict[str, Any]] = {}
    stock_intel_by_id: dict[str, dict[str, Any]] = {}
    for market in ["US", "IN"]:
        market_ids = [instrument_id for instrument_id in ids if _market_from_instrument_id(instrument_id) == market]
        if not market_ids:
            continue
        universe = _price_universe(market, active_universes)
        docs = store.get_stock_intel_pro_batch(market, universe, market_ids)
        intel_by_id.update(docs)
        stock_docs = store.get_stock_intelligence_docs_batch(market, universe, market_ids)
        stock_intel_by_id.update(stock_docs)

    rows: list[dict[str, Any]] = []
    for instrument_id in ids:
        row = _row_for_instrument(
            instrument_id,
            _position_type(instrument_id, positions),
            (holdings or {}).get(instrument_id) if isinstance(holdings, dict) else None,
            instrument_meta_by_id.get(instrument_id) or {},
            latest_by_id.get(instrument_id) or {},
            intel_by_id.get(instrument_id) or {},
            stock_intel_by_id.get(instrument_id) or {},
            facts_by_id.get(instrument_id) or {},
            technical_by_id.get(instrument_id) or {},
            mention_by_id.get(instrument_id) or {},
            alerts_by_instrument,
        )
        if row:
            rows.append(row)

    position_meta = _apply_position_weights(rows)
    _boost_attention_for_position(rows)
    for row in rows:
        holding_payload = row.get("holding") if isinstance(row.get("holding"), dict) else None
        row["holding_status"] = _holding_status(str(row.get("position_type") or "watchlist"), holding_payload)
        row["directive_v2"] = _directive_v2(row, row.get("ai_directive") if isinstance(row.get("ai_directive"), dict) else None)
    rows = _apply_row_deltas(rows, previous_view)
    for row in rows:
        if isinstance(row.get("holding"), dict):
            row["holding"].pop("_effective_market_value", None)
    rows.sort(key=lambda r: r.get("attention_score") or 0, reverse=True)
    pulse = _pulse_headline(rows)
    portfolio = _portfolio_diagnostics(rows, store, position_meta=position_meta)
    suggestions = portfolio.get("suggestions") or []
    event_radar = _event_radar(rows, portfolio)
    anomaly_by_id, reddit_by_id, earnings_by_id = _load_ticker_read_models(store, rows)
    anomaly_by_market = _load_anomalies_by_market(store, markets)
    reddit_by_market = _load_reddit_buzz_by_market(store, markets)
    market_context_by_market = _load_market_context_by_market(store, active_universes, markets)
    sector_context_by_market = _load_sector_context_by_market(store, active_universes, markets)
    enrichments_by_market = _load_recent_enrichments_by_market(store, active_universes, markets)
    today_setup = _today_setup(
        rows,
        anomaly_by_id,
        reddit_by_id,
        earnings_by_id,
        anomaly_by_market,
        reddit_by_market,
        market_context_by_market,
        sector_context_by_market,
        enrichments_by_market,
    )
    holdings_count = len([row for row in rows if row.get("position_type") == "holding"])

    return {
        "uid": uid,
        "tracked_count": len(rows),
        "holdings_count": holdings_count,
        "watchlist_count": len(rows) - holdings_count,
        "tracked_ids": [r["instrument_id"] for r in rows],
        "rows": rows,
        "pulse": pulse,
        "brief": _build_portfolio_brief(rows, pulse, store, include_llm=include_llm_brief),
        "portfolio": portfolio,
        "attention_items": _attention_items(rows),
        "suggestions": suggestions,
        "risk_summary": _risk_summary(rows, portfolio),
        "event_radar": event_radar,
        "today_setup": today_setup,
        "changes": _change_summary(rows, previous_view),
        "built_at": datetime.now(timezone.utc).isoformat(),
    }
