from __future__ import annotations

from typing import Any


VERSION = "v2-shadow-2"

# Extension guard: never say "accumulate now" after a hot run. Our monthly
# audits showed extended, fast-rising names underperform, while pullback
# entries age better. Deterministic and closes-based; no model input needed.
EXTENSION_FROM_LOW_PCT = 12.0
EXTENSION_RUNUP_PCT = 6.0


def _num(value: Any) -> float | None:
    try:
        out = float(value)
    except Exception:
        return None
    return out if out == out else None


def _text(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _cards(doc: dict[str, Any]) -> dict[str, Any]:
    cards = doc.get("visual_cards") if isinstance(doc.get("visual_cards"), dict) else {}
    if cards:
        return cards
    return doc.get("visual_summary") if isinstance(doc.get("visual_summary"), dict) else {}


def _setup_state(doc: dict[str, Any]) -> str:
    value = _text(doc.get("setup_state")).lower()
    return value if value in {"accumulation", "breakout", "trend", "rotation", "exhaustion"} else "unclear"


def _evidence_items(doc: dict[str, Any], *, limit: int = 5) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    visual = _cards(doc)
    for item in visual.get("drivers") or []:
        if not isinstance(item, dict):
            continue
        label = _text(item.get("label"))
        detail = _text(item.get("detail"))
        if label or detail:
            out.append({"type": "driver", "text": detail or label})
    for item in visual.get("catalyst_cards") or []:
        if not isinstance(item, dict):
            continue
        detail = _text(item.get("detail") or item.get("event"))
        if detail:
            out.append({"type": "catalyst", "text": detail})
    risk = _text(doc.get("risk"))
    if risk:
        out.append({"type": "risk", "text": risk})
    return out[:limit]


def _risk_count(doc: dict[str, Any]) -> int:
    visual = _cards(doc)
    return sum(1 for item in (visual.get("risk_cards") or []) if isinstance(item, dict) and _text(item.get("detail") or item.get("risk")))


def _driver_score(doc: dict[str, Any]) -> float:
    visual = _cards(doc)
    total = 0.0
    for item in visual.get("drivers") or []:
        if not isinstance(item, dict):
            continue
        strength = _num(item.get("strength")) or 3
        direction = _text(item.get("direction")).lower()
        if direction == "up":
            total += strength
        elif direction == "down":
            total -= strength
    return total


def _news_digest(doc: dict[str, Any]) -> dict[str, Any]:
    return doc.get("news_digest") if isinstance(doc.get("news_digest"), dict) else {}


def _evidence_history(doc: dict[str, Any], key: str) -> dict[str, Any]:
    value = doc.get(key)
    return value if isinstance(value, dict) else {}


def _evidence_history_score(doc: dict[str, Any]) -> float:
    """Give repeated dated evidence a small vote without making one day sticky."""
    stock = _evidence_history(doc, "evidence_history")
    sector = _evidence_history(doc, "sector_evidence_history")
    score = 0.0
    if int(stock.get("coverage_days") or 0) >= 2:
        trend = _text(stock.get("trend")).lower()
        if trend == "negative_building":
            score -= 8
        elif trend == "positive_building":
            score += 5
        elif trend == "negative":
            score -= 3
        elif trend == "positive":
            score += 2
        score -= min(4, len(stock.get("repeated_negative_themes") or []))

    if int(sector.get("coverage_days") or 0) >= 2:
        trend = _text(sector.get("trend")).lower()
        if trend == "negative_building":
            score -= 4
        elif trend == "positive_building":
            score += 3
        elif trend == "negative":
            score -= 2
        elif trend == "positive":
            score += 1
    return max(-12, min(8, score))


def _anomaly_digest(doc: dict[str, Any]) -> dict[str, Any]:
    return doc.get("anomaly_digest") if isinstance(doc.get("anomaly_digest"), dict) else {}


def _options_digest(doc: dict[str, Any]) -> dict[str, Any]:
    return doc.get("options_digest") if isinstance(doc.get("options_digest"), dict) else {}


def _trend(doc: dict[str, Any]) -> str:
    setup = _setup_state(doc)
    if setup == "breakout":
        return "breakout"
    if setup in {"trend", "rotation"}:
        return "uptrend"
    if setup == "exhaustion":
        return "breakdown"
    ctx = doc.get("comparative_context") if isinstance(doc.get("comparative_context"), dict) else {}
    day = _num(ctx.get("day_change_pct")) or 0
    vs_market = _num(ctx.get("vs_market_day_change_pct")) or 0
    if day > 2 and vs_market > 0:
        return "uptrend"
    if day < -2 and vs_market < 0:
        return "downtrend"
    return "range"


def _sector_state(doc: dict[str, Any]) -> str:
    regime = doc.get("market_regime") if isinstance(doc.get("market_regime"), dict) else {}
    sector = regime.get("sector") if isinstance(regime.get("sector"), dict) else {}
    label = _text(sector.get("regime") or sector.get("state")).lower()
    if label in {"momentum", "expanding", "leadership", "strong"}:
        return "tailwind"
    if label in {"breaking_down", "contracting", "lagging", "weak"}:
        return "headwind"
    ctx = doc.get("comparative_context") if isinstance(doc.get("comparative_context"), dict) else {}
    vs_sector = _num(ctx.get("vs_sector_day_change_pct")) or 0
    if vs_sector > 1:
        return "tailwind"
    if vs_sector < -1:
        return "headwind"
    return "neutral"


def _score(doc: dict[str, Any]) -> float:
    label = _text(doc.get("overall_label")).lower()
    score = (_num(doc.get("overall_score")) or 50) - 50
    if label in {"bullish", "constructive"}:
        score += 12
    elif label in {"bearish", "cautious"}:
        score -= 12

    setup = _setup_state(doc)
    score += {
        "breakout": 12,
        "trend": 10,
        "accumulation": 8,
        "rotation": 4,
        "unclear": 0,
        "exhaustion": -14,
    }.get(setup, 0)
    score += _driver_score(doc)
    score -= _risk_count(doc) * 3

    news = _news_digest(doc)
    news_direction = _text(news.get("direction")).lower()
    hard = bool(news.get("hard_catalyst"))
    if news_direction == "positive":
        score += 10 if hard else 5
    elif news_direction == "negative":
        score -= 20 if hard else 8
    elif news_direction == "mixed":
        score -= 2

    score += _evidence_history_score(doc)

    anomaly = _anomaly_digest(doc)
    if anomaly:
        move = _num(anomaly.get("day_change_pct")) or 0
        explanation = _text(anomaly.get("headline") or anomaly.get("why_it_matters"))
        if move > 0 and explanation:
            score += 6
        elif move < 0 and explanation:
            score -= 14

    options = _options_digest(doc)
    if options:
        iv_rank = _num(options.get("iv_rank"))
        put_call = _num(options.get("put_call_volume_ratio"))
        if iv_rank is not None and iv_rank >= 75:
            score -= 4
        if put_call is not None and put_call >= 1.4:
            score -= 4
        if bool(options.get("unusual_call_volume")) and put_call is not None and put_call < 0.8:
            score += 3
        if bool(options.get("unusual_put_volume")):
            score -= 5

    ctx = doc.get("comparative_context") if isinstance(doc.get("comparative_context"), dict) else {}
    score += max(-8, min(8, (_num(ctx.get("vs_market_day_change_pct")) or 0) * 1.5))
    return score


def _analyst_target(doc: dict[str, Any]) -> float | None:
    target = _num(doc.get("analyst_target"))
    if target and target > 0:
        return target
    fundamentals = doc.get("fundamentals") if isinstance(doc.get("fundamentals"), dict) else {}
    for item in fundamentals.get("standout_metrics") or []:
        if not isinstance(item, dict):
            continue
        if _text(item.get("label")).lower() == "analyst target":
            target = _num(item.get("value"))
            return target if target and target > 0 else None
    return None


def _extension_metrics(doc: dict[str, Any], current: float) -> dict[str, Any] | None:
    """How far and how fast the stock has run, from recent closes only."""
    closes = [value for value in _recent_closes(doc) if value > 0]
    if not closes or current <= 0:
        return None
    window = closes[-21:]
    low = min(window)
    from_low_pct = (current / low - 1) * 100 if low > 0 else 0.0
    anchor = closes[-5] if len(closes) >= 5 else closes[0]
    runup_pct = (current / anchor - 1) * 100 if anchor > 0 else 0.0
    return {
        "from_low_pct": from_low_pct,
        "runup_pct": runup_pct,
        "extended": from_low_pct >= EXTENSION_FROM_LOW_PCT or runup_pct >= EXTENSION_RUNUP_PCT,
    }


def _recent_closes(doc: dict[str, Any]) -> list[float]:
    price_context = doc.get("price_context") if isinstance(doc.get("price_context"), dict) else {}
    closes = []
    for row in price_context.get("recent_sessions") or []:
        if not isinstance(row, dict):
            continue
        close = _num(row.get("close"))
        if close and close > 0:
            closes.append(close)
    return closes


def _support_from_recent_sessions(doc: dict[str, Any], current: float) -> float | None:
    below = [value for value in _recent_closes(doc) if value < current]
    if not below:
        return None
    # Highest recent close below spot is the nearest realistic pullback level.
    return max(below)


def _below_current(value: Any, current: float) -> float | None:
    num = _num(value)
    return num if num and 0 < num < current else None


def _above_current(value: Any, current: float) -> float | None:
    num = _num(value)
    return num if num and num > current else None


def _zones(doc: dict[str, Any], current: float, stance: str, execution: str) -> dict[str, float]:
    target = _analyst_target(doc)
    support = _support_from_recent_sessions(doc, current)
    options = _options_digest(doc)
    put_wall = _below_current(options.get("put_wall_below"), current)
    lower_move = _below_current(options.get("lower_expected_move"), current)
    call_wall = _above_current(options.get("call_wall_above"), current)
    upper_move = _above_current(options.get("upper_expected_move"), current)
    zones: dict[str, float] = {}

    add_candidates = [value for value in (support, put_wall, lower_move) if value and value < current]
    if add_candidates:
        zones["accumulate_below"] = round(max(add_candidates), 2)
    elif stance == "accumulate" and execution in {"now", "pullback"}:
        zones["accumulate_below"] = round(current * 0.97, 2)

    if execution == "breakout":
        breakout = call_wall or current * 1.03
        zones["breakout_above"] = round(breakout, 2)

    # Prefer structured analyst and options levels over invented LLM price zones.
    if stance == "avoid":
        return zones

    if stance in {"accumulate", "hold"} and target and target > current * 1.12:
        zones["trim_above"] = round(target, 2)
        if call_wall and call_wall < target and call_wall >= current * 1.08:
            zones["near_term_resistance"] = round(call_wall, 2)
    elif stance in {"accumulate", "hold"}:
        zones["trim_above"] = round(current * 1.18, 2)
    if upper_move and "near_term_resistance" not in zones and upper_move >= current * 1.05:
        zones["near_term_resistance"] = round(upper_move, 2)

    return zones


def _watch_out(stance: str, execution: str) -> str:
    if stance == "avoid":
        return "Revisit only if fresh evidence improves the setup."
    if stance == "trim":
        return "Revisit if the stock resets and the next catalyst improves risk/reward."
    if execution == "breakout":
        return "Revisit if price confirms the breakout with stronger participation."
    return "Revisit if momentum breaks or fresh evidence weakens."


def _news_catalyst_state(doc: dict[str, Any], fallback_score: float) -> str:
    news = _news_digest(doc)
    if news:
        direction = _text(news.get("direction")).lower()
        if direction == "positive":
            return "fresh_positive"
        if direction == "negative":
            return "fresh_negative"
        if direction == "mixed":
            return "event_ahead"
    anomaly = _anomaly_digest(doc)
    if anomaly:
        move = _num(anomaly.get("day_change_pct")) or 0
        if move > 0:
            return "fresh_positive"
        if move < 0:
            return "fresh_negative"
    return "fresh_positive" if fallback_score >= 18 else "fresh_negative" if fallback_score <= -18 else "event_ahead" if doc.get("catalyst") else "quiet"


def build_directive_v2(doc: dict[str, Any], previous_v2: dict[str, Any] | None = None) -> dict[str, Any]:
    current = _num(doc.get("current_price"))
    if not current or current <= 0:
        return {
            "version": VERSION,
            "stance": "watch",
            "execution": "after_event",
            "horizon": "weeks",
            "confidence": "low",
            "action": {"label": "Watch setup", "summary": "No reliable current price is available, so this stays on watch."},
            "zones": {},
            "setup": {
                "valuation": "unclear",
                "quality": "mixed",
                "trend": "range",
                "catalyst_state": "quiet",
                "sector_state": _sector_state(doc),
                "risk_reward": "balanced",
            },
            "evidence": _evidence_items(doc),
            "watch_out": "Wait for fresh price data before setting levels.",
            "invalidation": "Wait for fresh price data before setting levels.",
            "changed_from_previous": bool(previous_v2),
            "change_reason": "Missing current price." if previous_v2 else "",
        }

    score = _score(doc)
    trend = _trend(doc)
    catalyst_state = _news_catalyst_state(doc, score)

    if score >= 24 and trend != "breakdown":
        stance, execution, confidence = "accumulate", "now", "high" if score >= 36 else "medium"
    elif score >= 10 and trend == "breakout":
        stance, execution, confidence = "watch", "breakout", "medium"
    elif score >= 8:
        stance, execution, confidence = "accumulate", "pullback", "medium"
    elif score <= -24:
        stance, execution, confidence = "avoid", "do_not_chase", "high" if score <= -36 else "medium"
    elif score <= -10 or trend == "breakdown":
        stance, execution, confidence = "trim", "do_not_chase", "medium"
    else:
        stance, execution, confidence = "hold", "now", "medium"

    stock_history = _evidence_history(doc, "evidence_history")
    if int(stock_history.get("coverage_days") or 0) == 1 and confidence == "high":
        confidence = "medium"

    options = _options_digest(doc)
    iv_rank = _num(options.get("iv_rank")) if options else None
    put_call = _num(options.get("put_call_volume_ratio")) if options else None
    crowded_calls = bool(options.get("unusual_call_volume")) and (put_call is None or put_call < 0.8)
    if stance == "accumulate" and execution == "now" and (iv_rank is not None and iv_rank >= 75 or crowded_calls):
        execution = "pullback"
        confidence = "medium"

    extension_note = ""
    extension = _extension_metrics(doc, current)
    if stance == "accumulate" and execution == "now" and extension and extension["extended"]:
        execution = "pullback"
        confidence = "medium"
        if extension["from_low_pct"] >= EXTENSION_FROM_LOW_PCT:
            extension_note = (
                f"price is up {extension['from_low_pct']:.0f}% from its recent low, "
                "so the first pullback is the better entry"
            )
        else:
            extension_note = (
                f"price is up {extension['runup_pct']:.0f}% in a handful of sessions, "
                "so wait for the move to settle"
            )

    if stance == "accumulate" and execution == "now":
        label = "Accumulate now"
        summary = "The setup is attractive at the current price; use pullbacks to add rather than waiting for a perfect entry."
    elif stance == "accumulate":
        label = "Accumulate on pullbacks"
        summary = "The setup is constructive, but the cleaner entry is a pullback into support."
        if extension_note:
            summary = f"Still constructive, but {extension_note}."
    elif execution == "breakout":
        label = "Watch breakout"
        summary = "Wait for price confirmation before adding; the evidence is not strong enough for an add-now call."
    elif stance == "trim":
        label = "Do not add here" if execution == "do_not_chase" else "Trim strength"
        summary = "Risk/reward has weakened; avoid adding and use any bounce to reduce exposure."
    elif stance == "avoid":
        label = "Avoid for now"
        summary = "The setup is not paying enough for the risk right now."
    else:
        label = "Hold here"
        summary = "Upside and downside look balanced; keep the position but do not force a new add."

    zones = _zones(doc, current, stance, execution)
    risk_reward = "favorable" if score >= 18 else "unfavorable" if score <= -18 else "balanced"
    watch_out = _watch_out(stance, execution)
    prev_label = _text((previous_v2 or {}).get("action", {}).get("label") if isinstance((previous_v2 or {}).get("action"), dict) else "")
    changed = bool(previous_v2 and prev_label and prev_label != label)

    return {
        "version": VERSION,
        "stance": stance,
        "execution": execution,
        "horizon": "weeks",
        "confidence": confidence,
        "action": {"label": label, "summary": summary},
        "zones": zones,
        "setup": {
            "valuation": "unclear",
            "quality": "mixed",
            "trend": trend,
            "catalyst_state": catalyst_state,
            "sector_state": _sector_state(doc),
            "risk_reward": risk_reward,
        },
        "evidence": _evidence_items(doc),
        "watch_out": watch_out,
        "invalidation": watch_out,
        "changed_from_previous": changed,
        "change_reason": "Shadow policy differs from prior directive." if changed else "",
    }
