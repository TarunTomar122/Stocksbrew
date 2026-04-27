"""Derived metrics for landing-page MVP datasets."""
from __future__ import annotations

from datetime import datetime, timezone
from statistics import median
from typing import Any


def _to_float(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _safe_pct(numerator: float, denominator: float) -> float | None:
    if denominator <= 0:
        return None
    return (numerator / denominator) * 100.0


def _extract_series(
    history_points: list[dict[str, Any]],
    latest_price: dict[str, Any],
) -> tuple[list[float], list[float]]:
    pairs: list[tuple[str, float, float]] = []
    for row in history_points:
        quote = row.get("quote") or {}
        close = _to_float(quote.get("current"))
        vol = _to_float(quote.get("volume"))
        ts = str(row.get("captured_at") or row.get("timestamp") or "")
        if close is None:
            continue
        pairs.append((ts, close, vol or 0.0))
    latest_quote = latest_price.get("quote") or {}
    latest_close = _to_float(latest_quote.get("current"))
    latest_vol = _to_float(latest_quote.get("volume")) or 0.0
    latest_ts = str(latest_price.get("captured_at") or "")
    if latest_close is not None:
        pairs.append((latest_ts, latest_close, latest_vol))
    pairs.sort(key=lambda item: item[0])

    dedup: dict[str, tuple[float, float]] = {}
    for ts, close, vol in pairs:
        dedup[ts] = (close, vol)
    closes = [item[0] for _ts, item in sorted(dedup.items(), key=lambda kv: kv[0])]
    volumes = [item[1] for _ts, item in sorted(dedup.items(), key=lambda kv: kv[0])]
    return closes, volumes


def _sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def _ema(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    k = 2.0 / (period + 1.0)
    ema_val = sum(values[:period]) / period
    for value in values[period:]:
        ema_val = value * k + ema_val * (1.0 - k)
    return ema_val


def _rsi(values: list[float], period: int = 14) -> float | None:
    if len(values) < period + 1:
        return None
    gains: list[float] = []
    losses: list[float] = []
    for i in range(-period, 0):
        delta = values[i] - values[i - 1]
        if delta >= 0:
            gains.append(delta)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(delta))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _rsi_state(rsi_value: float | None) -> str:
    if rsi_value is None:
        return "insufficient_data"
    if rsi_value >= 70:
        return "overbought"
    if rsi_value <= 30:
        return "oversold"
    return "neutral"


def _ema_slope_state(values: list[float], period: int = 20) -> str:
    if len(values) < period + 3:
        return "insufficient_data"
    prev = _ema(values[:-1], period)
    curr = _ema(values, period)
    if prev is None or curr is None:
        return "insufficient_data"
    delta_pct = ((curr - prev) / prev * 100.0) if prev else 0.0
    if delta_pct > 0.1:
        return "rising"
    if delta_pct < -0.1:
        return "falling"
    return "flat"


def build_stock_technical_doc(
    instrument: dict[str, Any],
    latest_price: dict[str, Any],
    history_points: list[dict[str, Any]],
    as_of_date: str,
) -> dict[str, Any]:
    quote = latest_price.get("quote") or {}
    fundamentals = latest_price.get("fundamentals") or {}
    closes, volumes = _extract_series(history_points, latest_price)
    current_price = _to_float(quote.get("current")) or 0.0

    sma20 = _sma(closes, 20)
    sma50 = _sma(closes, 50)
    sma200 = _sma(closes, 200)
    ema20 = _ema(closes, 20)
    rsi14 = _rsi(closes, 14)

    # Yahoo-derived trend fallbacks. We only store ~60 sessions of daily history
    # per instrument, so our own sma_50 / sma_200 are often null. Yahoo's
    # `.info` exposes 50D/200D averages pre-computed on their side — we capture
    # them in yfinance_provider and fall back to them here so the Trend card
    # renders for every listed ticker, not just those we've backfilled deeply.
    yahoo_50d = _to_float(fundamentals.get("fifty_day_average"))
    yahoo_200d = _to_float(fundamentals.get("two_hundred_day_average"))
    if sma50 is None and yahoo_50d is not None and yahoo_50d > 0:
        sma50 = yahoo_50d
    if sma200 is None and yahoo_200d is not None and yahoo_200d > 0:
        sma200 = yahoo_200d

    week_52_high = _to_float(fundamentals.get("week_52_high"))
    week_52_low = _to_float(fundamentals.get("week_52_low"))
    distance_high = None
    if week_52_high and week_52_high > 0:
        distance_high = ((current_price - week_52_high) / week_52_high) * 100.0
    distance_low = None
    if week_52_low and week_52_low > 0:
        distance_low = ((current_price - week_52_low) / week_52_low) * 100.0

    return {
        "instrument_id": instrument["instrument_id"],
        "market": instrument.get("market", ""),
        "ticker": instrument.get("ticker", ""),
        "as_of_date": as_of_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "tm_latest_prices.history_window",
        "sample_size": {
            "price_points": len(closes),
            "volume_points": len([value for value in volumes if value > 0]),
        },
        "rsi_14": {
            "value": round(rsi14, 2) if rsi14 is not None else None,
            "state": _rsi_state(rsi14),
        },
        "moving_averages": {
            "sma_20": round(sma20, 4) if sma20 is not None else None,
            "sma_50": round(sma50, 4) if sma50 is not None else None,
            "sma_200": round(sma200, 4) if sma200 is not None else None,
            "ema_20": round(ema20, 4) if ema20 is not None else None,
            "ema_20_slope_state": _ema_slope_state(closes, period=20),
            "price_vs_sma_20": "above" if sma20 is not None and current_price >= sma20 else ("below" if sma20 is not None else "insufficient_data"),
            "price_vs_sma_50": "above" if sma50 is not None and current_price >= sma50 else ("below" if sma50 is not None else "insufficient_data"),
            "price_vs_sma_200": "above" if sma200 is not None and current_price >= sma200 else ("below" if sma200 is not None else "insufficient_data"),
        },
        "distance": {
            "from_52w_high_pct": round(distance_high, 2) if distance_high is not None else None,
            "from_52w_low_pct": round(distance_low, 2) if distance_low is not None else None,
        },
    }


def build_market_breadth_doc(
    market: str,
    universe_id: str,
    as_of_date: str,
    latest_prices: dict[str, dict[str, Any]],
    technical_docs: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    advancers = 0
    decliners = 0
    unchanged = 0
    up_volume = 0.0
    down_volume = 0.0
    new_52w_high = 0
    new_52w_low = 0
    abs_changes: list[float] = []

    sma20_above = sma20_eligible = 0
    sma50_above = sma50_eligible = 0
    sma200_above = sma200_eligible = 0

    for instrument_id, payload in latest_prices.items():
        quote = payload.get("quote") or {}
        fundamentals = payload.get("fundamentals") or {}
        change_pct = _to_float(quote.get("day_change_pct")) or 0.0
        volume = _to_float(quote.get("volume")) or 0.0
        current = _to_float(quote.get("current")) or 0.0

        abs_changes.append(abs(change_pct))
        if change_pct > 0:
            advancers += 1
            up_volume += volume
        elif change_pct < 0:
            decliners += 1
            down_volume += volume
        else:
            unchanged += 1

        week_52_high = _to_float(fundamentals.get("week_52_high"))
        week_52_low = _to_float(fundamentals.get("week_52_low"))
        if week_52_high and current >= week_52_high:
            new_52w_high += 1
        if week_52_low and current <= week_52_low:
            new_52w_low += 1

        technical = technical_docs.get(instrument_id) or {}
        ma = technical.get("moving_averages") or {}
        if ma.get("sma_20") is not None:
            sma20_eligible += 1
            if ma.get("price_vs_sma_20") == "above":
                sma20_above += 1
        if ma.get("sma_50") is not None:
            sma50_eligible += 1
            if ma.get("price_vs_sma_50") == "above":
                sma50_above += 1
        if ma.get("sma_200") is not None:
            sma200_eligible += 1
            if ma.get("price_vs_sma_200") == "above":
                sma200_above += 1

    instrument_count = len(latest_prices)
    return {
        "market": market.upper(),
        "universe_id": universe_id,
        "as_of_date": as_of_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "instrument_count": instrument_count,
        "advancers": advancers,
        "decliners": decliners,
        "unchanged": unchanged,
        "up_volume": round(up_volume, 2),
        "down_volume": round(down_volume, 2),
        "new_52w_high": new_52w_high,
        "new_52w_low": new_52w_low,
        "pct_above_20dma": round(_safe_pct(sma20_above, sma20_eligible), 2) if sma20_eligible else None,
        "pct_above_50dma": round(_safe_pct(sma50_above, sma50_eligible), 2) if sma50_eligible else None,
        "pct_above_200dma": round(_safe_pct(sma200_above, sma200_eligible), 2) if sma200_eligible else None,
        "coverage": {
            "sma20_eligible": sma20_eligible,
            "sma50_eligible": sma50_eligible,
            "sma200_eligible": sma200_eligible,
        },
        "volatility_proxy": {
            "median_abs_day_change_pct": round(median(abs_changes), 4) if abs_changes else None,
        },
    }


def build_sentiment_gauge_doc(
    market: str,
    universe_id: str,
    as_of_date: str,
    breadth_doc: dict[str, Any],
) -> dict[str, Any]:
    adv = int(breadth_doc.get("advancers", 0))
    dec = int(breadth_doc.get("decliners", 0))
    high = int(breadth_doc.get("new_52w_high", 0))
    low = int(breadth_doc.get("new_52w_low", 0))
    up_vol = _to_float(breadth_doc.get("up_volume")) or 0.0
    down_vol = _to_float(breadth_doc.get("down_volume")) or 0.0
    pct_above_50 = _to_float(breadth_doc.get("pct_above_50dma"))
    median_abs = _to_float((breadth_doc.get("volatility_proxy") or {}).get("median_abs_day_change_pct"))

    adv_dec_score = 50.0
    if adv + dec > 0:
        adv_dec_score = _clamp(50.0 + 50.0 * ((adv - dec) / (adv + dec)))

    high_low_score = 50.0
    if high + low > 0:
        high_low_score = _clamp(50.0 + 50.0 * ((high - low) / (high + low)))

    volume_balance_score = 50.0
    if up_vol + down_vol > 0:
        volume_balance_score = _clamp((up_vol / (up_vol + down_vol)) * 100.0)

    trend_score = pct_above_50 if pct_above_50 is not None else 50.0
    volatility_score = 50.0
    if median_abs is not None:
        volatility_score = _clamp(100.0 - ((median_abs / 4.0) * 100.0))

    components = [
        {"name": "advance_decline", "value": adv - dec, "score": round(adv_dec_score, 2), "weight": 0.30},
        {"name": "new_high_low", "value": high - low, "score": round(high_low_score, 2), "weight": 0.20},
        {"name": "trend_above_50dma", "value": pct_above_50, "score": round(trend_score, 2), "weight": 0.20},
        {"name": "volume_balance", "value": round(volume_balance_score, 2), "score": round(volume_balance_score, 2), "weight": 0.15},
        {"name": "volatility_stability", "value": median_abs, "score": round(volatility_score, 2), "weight": 0.15},
    ]

    final_score = sum(float(part["score"]) * float(part["weight"]) for part in components)
    rounded_score = int(round(_clamp(final_score)))
    if rounded_score < 40:
        label = "fear"
    elif rounded_score < 60:
        label = "neutral"
    else:
        label = "greed"

    return {
        "market": market.upper(),
        "universe_id": universe_id,
        "as_of_date": as_of_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "score": rounded_score,
        "label": label,
        "components": components,
        "explanation": (
            f"Gauge={rounded_score} from breadth, trend participation, volume balance, and volatility stability."
        ),
    }


def build_user_alert_flags(
    user_id: str,
    market: str,
    instrument_ids: list[str],
    as_of_date: str,
    latest_prices: dict[str, dict[str, Any]],
    stock_intelligence: dict[str, dict[str, Any]],
    technical_docs: dict[str, dict[str, Any]],
    price_histories: dict[str, list[dict[str, Any]]],
    thresholds: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    settings = thresholds or {}
    price_shock_threshold = float(settings.get("price_shock_pct", 4.0))
    sentiment_drop_threshold = float(settings.get("sentiment_drop_score", 40.0))
    volume_anomaly_multiple = float(settings.get("volume_anomaly_multiple", 1.8))

    output: list[dict[str, Any]] = []
    for instrument_id in instrument_ids:
        latest = latest_prices.get(instrument_id) or {}
        quote = latest.get("quote") or {}
        ticker = str(latest.get("ticker") or instrument_id.replace("US_", "").replace("IN_", ""))
        day_change_pct = _to_float(quote.get("day_change_pct")) or 0.0
        current_volume = _to_float(quote.get("volume")) or 0.0
        history = price_histories.get(instrument_id) or []
        _closes, history_volumes = _extract_series(history, latest)
        trailing_volumes = [value for value in history_volumes[-20:] if value > 0]
        baseline_volume = median(trailing_volumes) if trailing_volumes else None

        intel = stock_intelligence.get(instrument_id) or {}
        tech = technical_docs.get(instrument_id) or {}
        timeline = intel.get("timeline") or []
        overall_score = _to_float(intel.get("overall_score"))
        overall_label = str(intel.get("overall_label", "")).lower()

        flags: list[dict[str, Any]] = []

        if abs(day_change_pct) >= price_shock_threshold:
            severity = 3 if abs(day_change_pct) >= (price_shock_threshold * 1.5) else 2
            direction = "up" if day_change_pct > 0 else "down"
            flags.append({
                "type": "price_shock",
                "severity": severity,
                "direction": direction,
                "value": round(day_change_pct, 2),
                "threshold": price_shock_threshold,
                "message": f"{ticker} moved {day_change_pct:+.2f}% today.",
            })

        if overall_score is not None and (overall_score <= sentiment_drop_threshold or overall_label == "bearish"):
            severity = 2 if overall_score <= sentiment_drop_threshold else 1
            flags.append({
                "type": "sentiment_drop",
                "severity": severity,
                "value": round(overall_score, 2),
                "threshold": sentiment_drop_threshold,
                "message": f"AI sentiment is {overall_label or 'weak'} ({overall_score:.0f}).",
            })

        risk_events = [
            item for item in timeline
            if str(item.get("sentiment_label", "")).lower() == "bearish"
            and (_to_float(item.get("impact_score")) or 0.0) >= 4.0
        ]
        if risk_events:
            event = risk_events[0]
            flags.append({
                "type": "news_risk_spike",
                "severity": 2,
                "value": len(risk_events),
                "threshold": 1,
                "message": str(event.get("title") or "Elevated bearish news risk detected."),
            })

        if baseline_volume and current_volume >= baseline_volume * volume_anomaly_multiple:
            ratio = (current_volume / baseline_volume) if baseline_volume else 0.0
            severity = 3 if ratio >= 2.5 else 2
            flags.append({
                "type": "volume_anomaly",
                "severity": severity,
                "value": round(ratio, 2),
                "threshold": volume_anomaly_multiple,
                "message": f"Volume is {ratio:.2f}x the recent baseline.",
            })

        rsi_state = str(((tech.get("rsi_14") or {}).get("state"))).lower()
        if rsi_state in {"overbought", "oversold"}:
            flags.append({
                "type": "rsi_extreme",
                "severity": 1,
                "value": (tech.get("rsi_14") or {}).get("value"),
                "threshold": "70/30",
                "message": f"RSI indicates {rsi_state}.",
            })

        severity_score = int(sum(int(item.get("severity", 0)) for item in flags))
        status = "alert" if flags else "clear"
        output.append({
            "user_id": user_id,
            "market": market.upper(),
            "instrument_id": instrument_id,
            "ticker": ticker,
            "as_of_date": as_of_date,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "severity_score": severity_score,
            "flag_count": len(flags),
            "flags": flags,
        })

    output.sort(key=lambda item: (-int(item.get("severity_score", 0)), str(item.get("instrument_id", ""))))
    return output
