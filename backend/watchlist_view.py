"""Assemble a materialized watchlist view for a user.

Join pattern: for each instrument_id in `tracked_stocks`, pull the already-
computed intel_pro doc (scores, verdict, catalysts) + the latest price doc
(price, day change, history_window) + the user's alert flags, then fold into
one self-contained doc at `tm_watchlist_views/{uid}`.

Consumers read that one doc on `/watchlist` page load — no per-entity
Firestore round trips at render time.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.storage import TraceMoneyStore
from backend.stock_intelligence import generate_portfolio_brief

WATCHLIST_ROW_CAP = 20  # safety cap; UI limit is 10
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
    return {
        "US": store.get_active_ai_universe("US") or "",
        "IN": store.get_active_ai_universe("IN") or "",
        "US_price": store.get_active_price_universe("US") or "",
        "IN_price": store.get_active_price_universe("IN") or "",
    }


def _safe_float(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if isinstance(value, (int, float)) else None


def _signed_pct(value: float | None) -> str:
    if value is None:
        return "—"
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


def _candidate_universes(market: str, active_universes: dict[str, str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in [active_universes.get(market, ""), active_universes.get(f"{market}_price", "")]:
        if value and value not in seen:
            out.append(value)
            seen.add(value)
    return out


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


def _event_is_current(date_label: str) -> bool:
    parts = date_label.lower().replace(",", " ").split()
    if len(parts) < 2:
        return True
    month = MONTHS.get(parts[0][:3])
    try:
        day = int(parts[1])
    except (TypeError, ValueError):
        return True
    if not month:
        return True
    today = datetime.now(timezone.utc).date()
    try:
        event_date = today.replace(month=month, day=day)
    except ValueError:
        return True
    delta = (event_date - today).days
    return -1 <= delta <= 45


def _catalyst_is_current(catalyst: dict[str, Any]) -> bool:
    if str(catalyst.get("kind") or "").lower() != "earnings":
        return True
    title = str(catalyst.get("title") or "")
    # Expected shape is usually "Earnings May 04 AMC"; keep non-date titles
    # rather than accidentally dropping useful non-standard catalyst text.
    parts = title.split()
    if len(parts) >= 3:
        return _event_is_current(" ".join(parts[1:3]))
    return True


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
                "sentence": message[:140],
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
            "attention_reason": alert_message[:150],
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
        "attention_reason": f"{ticker} is calm. No major price, technical, alert, or news anomaly stood out.",
        "attention_kind": "calm",
        "suggested_action": "Hold thesis" if position_type == "holding" else "Keep on watch",
        "action_tone": "neutral",
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
    latest: dict[str, Any],
    intel_pro: dict[str, Any],
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
    micro, vibe = _row_microcopy(
        ticker,
        day_change,
        intel_pro,
        alert_flags,
    )

    return {
        "instrument_id": instrument_id,
        "ticker": ticker,
        "position_type": position_type,
        "market": market,
        "sector_label": intel_pro.get("sector_label", ""),
        "industry_label": intel_pro.get("industry_label", ""),
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
        "catalysts": [
            catalyst for catalyst in (intel_pro.get("catalysts") or [])
            if isinstance(catalyst, dict) and _catalyst_is_current(catalyst)
        ][:3],
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
    }


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
    """Heuristic pulse summary — no LLM needed for v1."""
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
        mood = "Mixed tape"

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
    return {
        "symbol": row.get("ticker", ""),
        "name": row.get("ticker", ""),
        "sector": row.get("sector_label") or row.get("market", ""),
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
        else "No obvious concentration yet. Add more stocks and Tikrr will flag sector, style, and event blind spots."
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
                "headline": pulse.get("headline", "Mixed tape"),
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
    result = generate_portfolio_brief(payloads, store=store)
    if not isinstance(result, dict):
        return fallback

    result = {
        **result,
        "source": "mimo",
        "status": "ready",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return result


def _sector_counts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for row in rows:
        sector = str(row.get("sector_label") or row.get("market") or "Unknown")
        counts[sector] = counts.get(sector, 0) + 1
    return [
        {"sector": sector, "count": count, "weight_pct": round(count / max(len(rows), 1) * 100, 1)}
        for sector, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)
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


def _screen_suggestions(
    store: TraceMoneyStore,
    rows: list[dict[str, Any]],
    markets: list[str],
) -> list[dict[str, Any]]:
    tracked = {row.get("instrument_id") for row in rows}
    suggested: set[str] = set()
    suggestions: list[dict[str, Any]] = []
    preferred_screen_ids = [
        "quality_compounders",
        "cheap_growth",
        "oversold_quality",
        "smart_money",
        "tikrr_top",
    ]
    for market in markets:
        screens_doc = store.get_thematic_screens(market)
        for screen_id in preferred_screen_ids:
            screen = next(
                (item for item in (screens_doc or {}).get("screens", []) if item.get("id") == screen_id),
                None,
            )
            if not screen:
                continue
            for match in screen.get("matches") or []:
                instrument_id = match.get("instrument_id")
                if not instrument_id or instrument_id in tracked or instrument_id in suggested:
                    continue
                suggested.add(str(instrument_id))
                suggestions.append({
                    "instrument_id": instrument_id,
                    "ticker": match.get("ticker"),
                    "name": match.get("name"),
                    "market": market,
                    "reason": screen.get("title"),
                    "why": screen.get("hook") or screen.get("tagline"),
                    "score": match.get("overall_score"),
                    "match_score": match.get("match_score"),
                    "sector": match.get("sector"),
                })
                break
            if len(suggestions) >= 6:
                return suggestions
    return suggestions[:6]


def _portfolio_diagnostics(
    rows: list[dict[str, Any]],
    store: TraceMoneyStore,
) -> dict[str, Any]:
    if not rows:
        return {
            "summary": "No tracked stocks yet.",
            "clusters": [],
            "risk_flags": [],
            "opportunities": [],
            "suggestions": [],
        }

    clusters = _sector_counts(rows)
    dominant = clusters[0] if clusters else None
    risk_flags: list[dict[str, Any]] = []
    if dominant and dominant["weight_pct"] >= 50:
        risk_flags.append({
            "kind": "sector_concentration",
            "severity": "high" if dominant["weight_pct"] >= 70 else "medium",
            "headline": f"{dominant['weight_pct']:.0f}% clustered in {dominant['sector']}",
            "body": "A single-sector watchlist can look great until one macro factor hits every name together.",
        })

    weak_rows = [
        row for row in rows
        if _safe_float((row.get("scores") or {}).get("overall")) is not None
        and (_safe_float((row.get("scores") or {}).get("overall")) or 0) < 45
    ]
    for row in sorted(weak_rows, key=lambda item: _safe_float((item.get("scores") or {}).get("overall")) or 0)[:3]:
        risk_flags.append({
            "kind": "low_score",
            "severity": "medium",
            "ticker": row.get("ticker"),
            "headline": f"{row.get('ticker')} is the weakest score in the list",
            "body": f"Overall score {row.get('scores', {}).get('overall')} with pressure in the factor stack.",
        })

    overbought = [
        row for row in rows
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
    for row in sorted(rows, key=lambda item: (_safe_float(item.get("target_upside_pct")) or -999), reverse=True)[:4]:
        upside = _safe_float(row.get("target_upside_pct"))
        if upside is None:
            continue
        opportunities.append({
            "ticker": row.get("ticker"),
            "kind": "analyst_runway",
            "headline": f"{row.get('ticker')} has {upside:+.1f}% target runway",
            "body": f"Score {row.get('scores', {}).get('overall')}; analyst count {(row.get('facts') or {}).get('analyst', {}).get('analyst_count')}.",
        })

    markets = sorted({str(row.get("market")) for row in rows if row.get("market") in {"US", "IN"}})
    suggestions = _screen_suggestions(store, rows, markets)
    summary_parts = []
    if dominant:
        summary_parts.append(f"{dominant['sector']} is the largest cluster at {dominant['weight_pct']:.0f}%.")
    avg_overall = _average_score(rows, "overall")
    if avg_overall is not None:
        summary_parts.append(f"Average Tikrr score is {avg_overall}.")
    if risk_flags:
        summary_parts.append(f"{len(risk_flags)} risk flags need review.")
    if opportunities:
        summary_parts.append(f"{len(opportunities)} upside candidates stand out.")

    return {
        "summary": " ".join(summary_parts) or "Watchlist diagnosis is ready.",
        "clusters": clusters,
        "factor_tilt": {
            "overall": _average_score(rows, "overall"),
            "valuation": _average_score(rows, "valuation"),
            "growth": _average_score(rows, "growth"),
            "quality": _average_score(rows, "quality"),
            "momentum": _average_score(rows, "momentum"),
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
        body = "Add more holdings/watchlist names and Tikrr will detect concentration, technical, and news risk."
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
    positions: dict[str, Any] | None = None,
    active_universes: dict[str, str] | None = None,
    include_llm_brief: bool = True,
) -> dict[str, Any]:
    """Produce the materialized payload for `tm_watchlist_views/{uid}`.

    Does not write — caller is responsible for calling
    `store.save_watchlist_view(uid, payload)`.
    """
    active_universes = active_universes or _active_universe_cache(store)
    alerts_by_instrument = _load_user_alerts(store, uid)
    previous_view = store.get_watchlist_view(uid)

    ids = [str(instrument_id) for instrument_id in (tracked_stocks or [])[:WATCHLIST_ROW_CAP]]
    latest_by_id = store.get_latest_prices(ids)
    facts_by_id = store.get_stock_facts_batch(ids)
    technical_by_id = store.get_latest_stock_technicals_batch(ids)
    mention_by_id = store.get_mention_stats_batch(ids)

    intel_by_id: dict[str, dict[str, Any]] = {}
    for market in ["US", "IN"]:
        market_ids = [instrument_id for instrument_id in ids if _market_from_instrument_id(instrument_id) == market]
        if not market_ids:
            continue
        missing = list(market_ids)
        for universe in _candidate_universes(market, active_universes):
            if not missing:
                break
            docs = store.get_stock_intel_pro_batch(market, universe, missing)
            intel_by_id.update(docs)
            missing = [instrument_id for instrument_id in missing if instrument_id not in intel_by_id]

    rows: list[dict[str, Any]] = []
    for instrument_id in ids:
        row = _row_for_instrument(
            instrument_id,
            _position_type(instrument_id, positions),
            latest_by_id.get(instrument_id) or {},
            intel_by_id.get(instrument_id) or {},
            facts_by_id.get(instrument_id) or {},
            technical_by_id.get(instrument_id) or {},
            mention_by_id.get(instrument_id) or {},
            alerts_by_instrument,
        )
        if row:
            rows.append(row)

    rows = _apply_row_deltas(rows, previous_view)
    rows.sort(key=lambda r: r.get("attention_score") or 0, reverse=True)
    pulse = _pulse_headline(rows)
    portfolio = _portfolio_diagnostics(rows, store)
    suggestions = portfolio.get("suggestions") or []
    event_radar = _event_radar(rows, portfolio)
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
        "changes": _change_summary(rows, previous_view),
        "built_at": datetime.now(timezone.utc).isoformat(),
    }
