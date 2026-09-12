"""Read-only audit: mechanical technical baseline vs model directives vs hybrids.

Measures, at the exact dates of historical directive calls, three signal
families against forward returns (1/7/30 trading-day approximations, matching
the stored outcome horizons):

  baseline  = TradingView-style 26-indicator technical rating computed from
              our own OHLCV history (15 moving averages + 11 oscillators,
              each voting +1/0/-1, averaged to a -1..+1 score).
  vibe      = the directive_v2 stance we actually published (accumulate /
              hold / watch / trim / avoid).
  hybrids   = disagreement policies that combine both.

Everything is causal: indicator values at a call date only use history up to
that date. The script never writes to the database.

Usage (on the VPS):
  LOCALDB_PATH=/srv/tikrr-data/localdb/documents.sqlite3 \
    python3 -m backend.scripts.audit_technical_baseline --write-report
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
from collections import defaultdict
from datetime import date
from typing import Any, Callable

from backend.radar_outcomes import measure_directive_outcome

HORIZONS = (1, 7, 30)
BENCHMARK_ID = "US_IDX_SPX"

SIGNAL = {"accumulate": 1, "hold": 0, "watch": 0, "trim": -1, "avoid": -1}
BASELINE_TO_SIGNAL = {
    "strong_buy": 1,
    "buy": 1,
    "neutral": 0,
    "sell": -1,
    "strong_sell": -1,
}


# ─── indicator math (pure python, causal) ─────────────────────────────────────

def sma(values: list[float], period: int, index: int) -> float | None:
    if index + 1 < period:
        return None
    window = values[index + 1 - period : index + 1]
    return sum(window) / period


def ema_series(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) < period:
        return out
    multiplier = 2 / (period + 1)
    seed = sum(values[:period]) / period
    out[period - 1] = seed
    prev = seed
    for i in range(period, len(values)):
        prev = (values[i] - prev) * multiplier + prev
        out[i] = prev
    return out


def rsi_series(closes: list[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    if len(closes) <= period:
        return out
    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        delta = closes[i] - closes[i - 1]
        gains += max(delta, 0.0)
        losses += max(-delta, 0.0)
    avg_gain = gains / period
    avg_loss = losses / period
    out[period] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(period + 1, len(closes)):
        delta = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(delta, 0.0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-delta, 0.0)) / period
        out[i] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    return out


def stoch_k_series(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> list[float | None]:
    raw: list[float | None] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        hh = max(highs[i + 1 - period : i + 1])
        ll = min(lows[i + 1 - period : i + 1])
        raw[i] = 50.0 if hh == ll else (closes[i] - ll) / (hh - ll) * 100.0
    return _smooth(raw, 3)


def _smooth(values: list[float | None], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    for i in range(len(values)):
        window = [v for v in values[max(0, i + 1 - period) : i + 1] if v is not None]
        if len(window) == period:
            out[i] = sum(window) / period
    return out


def cci_series(highs: list[float], lows: list[float], closes: list[float], period: int = 20) -> list[float | None]:
    tp = [(highs[i] + lows[i] + closes[i]) / 3 for i in range(len(closes))]
    out: list[float | None] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        window = tp[i + 1 - period : i + 1]
        mean = sum(window) / period
        deviation = sum(abs(v - mean) for v in window) / period
        out[i] = 0.0 if deviation == 0 else (tp[i] - mean) / (0.015 * deviation)
    return out


def adx_series(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> tuple[list[float | None], list[float | None], list[float | None]]:
    n = len(closes)
    plus_dm = [0.0] * n
    minus_dm = [0.0] * n
    tr = [0.0] * n
    for i in range(1, n):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        plus_dm[i] = up if up > down and up > 0 else 0.0
        minus_dm[i] = down if down > up and down > 0 else 0.0
        tr[i] = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
    adx: list[float | None] = [None] * n
    plus_di: list[float | None] = [None] * n
    minus_di: list[float | None] = [None] * n
    if n <= period * 2:
        return adx, plus_di, minus_di
    atr = sum(tr[1 : period + 1])
    p_dm = sum(plus_dm[1 : period + 1])
    m_dm = sum(minus_dm[1 : period + 1])
    dx_values: list[float | None] = [None] * n

    def di(p: float, m: float, a: float) -> tuple[float | None, float | None]:
        if a <= 0:
            return None, None
        return 100 * p / a, 100 * m / a

    pdi, mdi = di(p_dm, m_dm, atr)
    plus_di[period] = pdi
    minus_di[period] = mdi
    if pdi is not None and mdi is not None and (pdi + mdi) > 0:
        dx_values[period] = 100 * abs(pdi - mdi) / (pdi + mdi)
    for i in range(period + 1, n):
        atr = atr - atr / period + tr[i]
        p_dm = p_dm - p_dm / period + plus_dm[i]
        m_dm = m_dm - m_dm / period + minus_dm[i]
        pdi, mdi = di(p_dm, m_dm, atr)
        plus_di[i] = pdi
        minus_di[i] = mdi
        if pdi is not None and mdi is not None and (pdi + mdi) > 0:
            dx_values[i] = 100 * abs(pdi - mdi) / (pdi + mdi)
    first_dx = next((i for i in range(n) if dx_values[i] is not None), None)
    if first_dx is not None and first_dx + period <= n:
        seed_window = [v for v in dx_values[first_dx : first_dx + period] if v is not None]
        if len(seed_window) == period:
            prev = sum(seed_window) / period
            adx[first_dx + period - 1] = prev
            for i in range(first_dx + period, n):
                if dx_values[i] is None:
                    continue
                prev = (prev * (period - 1) + dx_values[i]) / period
                adx[i] = prev
    return adx, plus_di, minus_di


def williams_r_series(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        hh = max(highs[i + 1 - period : i + 1])
        ll = min(lows[i + 1 - period : i + 1])
        out[i] = None if hh == ll else (hh - closes[i]) / (hh - ll) * -100.0
    return out


def ultimate_oscillator_series(highs: list[float], lows: list[float], closes: list[float]) -> list[float | None]:
    n = len(closes)
    bp = [0.0] * n
    tr = [0.0] * n
    for i in range(1, n):
        bp[i] = closes[i] - min(lows[i], closes[i - 1])
        tr[i] = max(highs[i], closes[i - 1]) - min(lows[i], closes[i - 1])

    def window_sum(values: list[float], period: int, index: int) -> float | None:
        if index + 1 < period + 1:
            return None
        return sum(values[index + 1 - period : index + 1])

    out: list[float | None] = [None] * n
    for i in range(28, n):
        avg7 = window_sum(bp, 7, i), window_sum(tr, 7, i)
        avg14 = window_sum(bp, 14, i), window_sum(tr, 14, i)
        avg28 = window_sum(bp, 28, i), window_sum(tr, 28, i)
        if any(v is None or t in (None, 0) for v, t in (avg7, avg14, avg28)):
            continue
        out[i] = 100 * (4 * (avg7[0] / avg7[1]) + 2 * (avg14[0] / avg14[1]) + (avg28[0] / avg28[1])) / 7
    return out


def hma_series(closes: list[float], period: int = 9) -> list[float | None]:
    half = max(1, period // 2)
    sqrt_p = max(1, int(math.sqrt(period)))
    wma_half = _wma_series(closes, half)
    wma_full = _wma_series(closes, period)
    raw: list[float | None] = [
        (2 * wma_half[i] - wma_full[i]) if wma_half[i] is not None and wma_full[i] is not None else None
        for i in range(len(closes))
    ]
    return _wma_series(raw, sqrt_p)


def _wma_series(values: list[float | None], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    for i in range(len(values)):
        window = values[i + 1 - period : i + 1] if i + 1 >= period else []
        if len(window) != period or any(v is None for v in window):
            continue
        weights = list(range(1, period + 1))
        out[i] = sum(v * w for v, w in zip(window, weights)) / sum(weights)  # type: ignore[operator]
    return out


# ─── baseline rating ──────────────────────────────────────────────────────────

MA_PERIODS = (10, 20, 30, 50, 100, 200)


def baseline_rating_series(bars: list[dict[str, float]]) -> list[dict[str, Any]]:
    """One rating per bar, using only bars up to that index."""
    closes = [b["close"] for b in bars]
    highs = [b["high"] for b in bars]
    lows = [b["low"] for b in bars]
    volumes = [b.get("volume") or 0.0 for b in bars]
    n = len(closes)

    smas = {p: [sma(closes, p, i) for i in range(n)] for p in MA_PERIODS}
    emas = {p: ema_series(closes, p) for p in MA_PERIODS}
    hma = hma_series(closes, 9)
    vwma20: list[float | None] = [None] * n
    for i in range(19, n):
        window_c = closes[i + 1 - 20 : i + 1]
        window_v = volumes[i + 1 - 20 : i + 1]
        total_v = sum(window_v)
        vwma20[i] = sum(c * v for c, v in zip(window_c, window_v)) / total_v if total_v > 0 else None

    rsi = rsi_series(closes)
    stoch_k = stoch_k_series(highs, lows, closes)
    cci = cci_series(highs, lows, closes)
    adx, plus_di, minus_di = adx_series(highs, lows, closes)
    williams = williams_r_series(highs, lows, closes)
    uo = ultimate_oscillator_series(highs, lows, closes)
    ema9 = ema_series(closes, 9)
    macd_ema12 = ema_series(closes, 12)
    macd_ema26 = ema_series(closes, 26)
    macd_line = [
        (macd_ema12[i] - macd_ema26[i]) if macd_ema12[i] is not None and macd_ema26[i] is not None else None
        for i in range(n)
    ]
    macd_signal = ema_series([v if v is not None else 0.0 for v in macd_line], 9)
    stoch_rsi_raw = _stoch_of_series(rsi)
    stoch_rsi = _smooth(_smooth(stoch_rsi_raw, 3), 3)

    median = [(highs[i] + lows[i]) / 2 for i in range(n)]
    ao = _sma_series_of(median, 5, 34)
    momentum = [closes[i] - closes[i - 10] if i >= 10 else None for i in range(n)]
    bull_power = [highs[i] - (ema9[i] or highs[i]) if ema9[i] is not None else None for i in range(n)]
    bear_power = [lows[i] - (ema9[i] or lows[i]) if ema9[i] is not None else None for i in range(n)]

    ratings: list[dict[str, Any]] = []
    for i in range(n):
        ma_votes: list[int] = []
        for period in MA_PERIODS:
            value = smas[period][i]
            if value is not None:
                ma_votes.append(1 if closes[i] > value else -1)
            value = emas[period][i]
            if value is not None:
                ma_votes.append(1 if closes[i] > value else -1)
        if hma[i] is not None:
            ma_votes.append(1 if closes[i] > hma[i] else -1)
        if vwma20[i] is not None:
            ma_votes.append(1 if closes[i] > vwma20[i] else -1)

        osc_votes: list[int] = []
        if rsi[i] is not None:
            osc_votes.append(1 if rsi[i] < 30 else -1 if rsi[i] > 70 else 0)
        if stoch_k[i] is not None:
            osc_votes.append(1 if stoch_k[i] < 20 else -1 if stoch_k[i] > 80 else 0)
        if cci[i] is not None:
            osc_votes.append(1 if cci[i] < -100 else -1 if cci[i] > 100 else 0)
        if adx[i] is not None and plus_di[i] is not None and minus_di[i] is not None:
            if adx[i] > 20:
                osc_votes.append(1 if plus_di[i] > minus_di[i] else -1)
            else:
                osc_votes.append(0)
        if ao[i] is not None and ao[i - 1] is not None:
            rising = ao[i] > ao[i - 1]
            osc_votes.append(1 if ao[i] > 0 and rising else -1 if ao[i] < 0 and not rising else 0)
        if momentum[i] is not None:
            osc_votes.append(1 if momentum[i] > 0 else -1 if momentum[i] < 0 else 0)
        if macd_line[i] is not None and macd_signal[i] is not None:
            osc_votes.append(1 if macd_line[i] > macd_signal[i] else -1)
        if stoch_rsi[i] is not None:
            osc_votes.append(1 if stoch_rsi[i] < 20 else -1 if stoch_rsi[i] > 80 else 0)
        if williams[i] is not None:
            osc_votes.append(1 if williams[i] < -80 else -1 if williams[i] > -20 else 0)
        if bull_power[i] is not None and bear_power[i] is not None:
            osc_votes.append(1 if bull_power[i] > 0 else -1 if bear_power[i] < 0 else 0)
        if uo[i] is not None:
            osc_votes.append(1 if uo[i] < 30 else -1 if uo[i] > 70 else 0)

        ma_score = sum(ma_votes) / len(ma_votes) if ma_votes else 0.0
        osc_score = sum(osc_votes) / len(osc_votes) if osc_votes else 0.0
        score = (ma_score + osc_score) / 2
        if score >= 0.5:
            label = "strong_buy"
        elif score >= 0.1:
            label = "buy"
        elif score > -0.1:
            label = "neutral"
        elif score > -0.5:
            label = "sell"
        else:
            label = "strong_sell"
        ratings.append(
            {
                "score": round(score, 4),
                "ma_score": round(ma_score, 4),
                "osc_score": round(osc_score, 4),
                "label": label,
                "ma_votes": len(ma_votes),
                "osc_votes": len(osc_votes),
            }
        )
    return ratings


def _stoch_of_series(series: list[float | None], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(series)
    for i in range(len(series)):
        window = [v for v in series[max(0, i + 1 - period) : i + 1] if v is not None]
        if len(window) != period:
            continue
        low = min(window)
        high = max(window)
        out[i] = 50.0 if high == low else (window[-1] - low) / (high - low) * 100.0
    return out


def _sma_series_of(values: list[float], fast: int, slow: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    for i in range(slow - 1, len(values)):
        fast_avg = sum(values[i + 1 - fast : i + 1]) / fast
        slow_avg = sum(values[i + 1 - slow : i + 1]) / slow
        out[i] = fast_avg - slow_avg
    return out


# ─── data loading ─────────────────────────────────────────────────────────────

def _num(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, dict):
        for key in ("raw", "value", "current"):
            if key in value:
                return _num(value.get(key))
        return None
    if isinstance(value, str):
        try:
            return float(value.replace(",", "").strip())
        except ValueError:
            return None
    return None


def load_store_rows(db_path: str) -> tuple[dict[str, list[dict[str, float]]], list[dict[str, Any]], list[dict[str, Any]]]:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=15)
    price_rows = con.execute(
        "select path, data_json from documents where path like 'tm_latest_prices/%'"
    ).fetchall()
    call_rows = con.execute(
        "select path, data_json from documents where path like 'tm_directive_history/%/calls/%'"
    ).fetchall()
    con.close()

    bars_by_instrument: dict[str, list[dict[str, float]]] = {}
    hist_by_instrument: dict[str, list[dict[str, Any]]] = {}
    for path, data_json in price_rows:
        instrument_id = path.split("/")[-1]
        data = json.loads(data_json)
        history = data.get("history_window") or []
        hist_by_instrument[instrument_id] = history
        by_day: dict[str, dict[str, float]] = {}
        for point in history:
            quote = point.get("quote") or {}
            captured = str(point.get("captured_at") or quote.get("captured_at") or "")[:10]
            close = _num(quote.get("current"))
            if not captured or close is None or close <= 0:
                continue
            by_day[captured] = {
                "open": _num(quote.get("open")) or close,
                "high": _num(quote.get("high")) or close,
                "low": _num(quote.get("low")) or close,
                "close": close,
                "volume": _num(quote.get("volume")) or 0.0,
            }
        bars_by_instrument[instrument_id] = [by_day[day] | {"date": day} for day in sorted(by_day)]  # type: ignore[dict-item]

    calls: list[dict[str, Any]] = []
    for path, data_json in call_rows:
        parts = path.split("/")
        data = json.loads(data_json)
        data.setdefault("instrument_id", parts[1])
        data.setdefault("call_date", parts[3])
        calls.append(data)

    price_docs = [{"instrument_id": iid, "history_window": hist} for iid, hist in hist_by_instrument.items()]
    return bars_by_instrument, calls, price_docs


# ─── audit ────────────────────────────────────────────────────────────────────

def build_rows(
    bars_by_instrument: dict[str, list[dict[str, float]]],
    hist_by_instrument: dict[str, list[dict[str, Any]]],
    calls: list[dict[str, Any]],
    benchmark_history: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rating_cache: dict[str, list[dict[str, Any]]] = {}
    date_index_cache: dict[str, dict[str, int]] = {}
    rows: list[dict[str, Any]] = []

    for call in calls:
        instrument_id = str(call.get("instrument_id") or "")
        call_date = str(call.get("call_date") or "")[:10]
        price_at_call = call.get("price_at_call")
        bars = bars_by_instrument.get(instrument_id) or []
        if not bars or not isinstance(price_at_call, (int, float)) or price_at_call <= 0:
            continue

        if instrument_id not in rating_cache:
            rating_cache[instrument_id] = baseline_rating_series(bars)
            date_index_cache[instrument_id] = {bar["date"]: i for i, bar in enumerate(bars)}  # type: ignore[index]
        date_index = date_index_cache[instrument_id]
        if call_date not in date_index:
            continue
        index = date_index[call_date]
        rating = rating_cache[instrument_id][index]

        row: dict[str, Any] = {
            "instrument_id": instrument_id,
            "call_date": call_date,
            "vibe_stance": str(call.get("stance") or ""),
            "vibe_confidence": str(call.get("confidence") or ""),
            "baseline_label": rating["label"],
            "baseline_score": rating["score"],
            "baseline_ma_score": rating["ma_score"],
            "baseline_osc_score": rating["osc_score"],
        }
        history = hist_by_instrument.get(instrument_id) or []
        for days in HORIZONS:
            outcome = measure_directive_outcome(
                {
                    "generated_at": f"{call_date}T15:00:00+00:00",
                    "price_at_call": price_at_call,
                },
                history,
                horizon_days=days,
                benchmark_history=benchmark_history,
            )
            if outcome:
                row[f"ret_{days}d"] = outcome["return_pct"]
                row[f"max_dd_{days}d"] = outcome["max_drawdown_pct"]
                if "benchmark_return_pct" in outcome:
                    row[f"bench_{days}d"] = outcome["benchmark_return_pct"]
                if "relative_return_pct" in outcome:
                    row[f"rel_{days}d"] = outcome["relative_return_pct"]
        if "ret_7d" in row or "ret_30d" in row or "ret_1d" in row:
            rows.append(row)
    return rows


def signal_column(row: dict[str, Any], strategy: str) -> int:
    vibe = SIGNAL.get(row["vibe_stance"], 0)
    base = BASELINE_TO_SIGNAL.get(row["baseline_label"], 0)
    if strategy == "vibe":
        return vibe
    if strategy == "baseline":
        return base
    if strategy == "agree_then_vibe_else_baseline":
        return vibe if (vibe == 0 or base == 0 or vibe == base) else base
    if strategy == "vibe_only_when_agree":
        return vibe if (vibe != 0 and vibe == base) else 0
    if strategy == "vibe_blocked_by_strong_baseline":
        if vibe != 0 and abs(row["baseline_score"]) >= 0.5 and base != vibe:
            return 0
        return vibe
    if strategy == "strong_baseline_outranks_vibe":
        return base if abs(row["baseline_score"]) >= 0.5 else (vibe if vibe != 0 else base)
    if strategy == "vibe_inverted":
        return -vibe
    if strategy == "baseline_inverted":
        return -base
    raise ValueError(strategy)


def summarize(
    rows: list[dict[str, Any]],
    strategy: str,
    horizon: int,
) -> dict[str, Any]:
    ret_key = f"ret_{horizon}d"
    rel_key = f"rel_{horizon}d"
    per_day: dict[str, list[float]] = defaultdict(list)
    signals: list[float] = []
    hits = 0
    total = 0
    rel_signals: list[float] = []
    for row in rows:
        if ret_key not in row:
            continue
        signal = signal_column(row, strategy)
        signal_return = signal * row[ret_key] / 2  # half-weight so long/short max 50%
        per_day[row["call_date"]].append(signal_return)
        signals.append(signal_return)
        if signal != 0:
            total += 1
            if signal_return > 0:
                hits += 1
        if rel_key in row:
            rel_signals.append(signal * row[rel_key] / 2)
    if not signals:
        return {"strategy": strategy, "horizon": horizon, "n": 0}
    day_means = [sum(v) / len(v) for v in per_day.values()]
    return {
        "strategy": strategy,
        "horizon": horizon,
        "n": len(signals),
        "n_active": total,
        "date_avg_signal_return_pct": round(sum(day_means) / len(day_means), 3),
        "pooled_avg_signal_return_pct": round(sum(signals) / len(signals), 3),
        "hit_rate_pct": round(100 * hits / total, 1) if total else None,
        "date_avg_relative_pct": round(sum(rel_signals) / len(rel_signals), 3) if rel_signals else None,
    }


def per_stance_table(rows: list[dict[str, Any]], horizon: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    ret_key = f"ret_{horizon}d"
    for family, key in (("vibe", "vibe_stance"), ("baseline", "baseline_label")):
        buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            if ret_key in row:
                buckets[row[key]].append(row)
        for label, bucket in sorted(buckets.items()):
            returns = [r[ret_key] for r in bucket]
            rels = [r[f"rel_{horizon}d"] for r in bucket if f"rel_{horizon}d" in r]
            out.append(
                {
                    "family": family,
                    "label": label,
                    "n": len(returns),
                    "avg_return_pct": round(sum(returns) / len(returns), 2),
                    "median_return_pct": round(sorted(returns)[len(returns) // 2], 2),
                    "hit_rate_pct": round(100 * sum(1 for r in returns if r > 0) / len(returns), 1),
                    "avg_relative_pct": round(sum(rels) / len(rels), 2) if rels else None,
                    "avg_max_dd_pct": round(sum(r[f"max_dd_{horizon}d"] for r in bucket if f"max_dd_{horizon}d" in r) / len(bucket), 2),
                }
            )
    return out


def agreement_table(rows: list[dict[str, Any]], horizon: int) -> list[dict[str, Any]]:
    ret_key = f"ret_{horizon}d"
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if ret_key not in row:
            continue
        vibe = SIGNAL.get(row["vibe_stance"], 0)
        base = BASELINE_TO_SIGNAL.get(row["baseline_label"], 0)
        if vibe == 0 or base == 0:
            continue
        buckets["agree" if vibe == base else "disagree"].append(row)
    out = []
    for label, bucket in buckets.items():
        returns = [r[ret_key] for r in bucket]
        rels = [r[f"rel_{horizon}d"] for r in bucket if f"rel_{horizon}d" in r]
        out.append(
            {
                "bucket": label,
                "n": len(returns),
                "avg_return_pct": round(sum(returns) / len(returns), 2),
                "hit_rate_pct": round(100 * sum(1 for r in returns if r > 0) / len(returns), 1),
                "avg_relative_pct": round(sum(rels) / len(rels), 2) if rels else None,
            }
        )
    return out


def confidence_table(rows: list[dict[str, Any]], horizon: int) -> list[dict[str, Any]]:
    ret_key = f"ret_{horizon}d"
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if ret_key in row and row["vibe_stance"] in {"accumulate", "trim", "avoid"}:
            buckets[row["vibe_confidence"] or "unknown"].append(row)
    out = []
    for label, bucket in buckets.items():
        signed = [SIGNAL.get(r["vibe_stance"], 0) * r[ret_key] / 2 for r in bucket]
        out.append(
            {
                "confidence": label,
                "n": len(signed),
                "avg_signal_return_pct": round(sum(signed) / len(signed), 3),
                "hit_rate_pct": round(100 * sum(1 for r in signed if r > 0) / len(signed), 1),
            }
        )
    return out


STRATEGIES = (
    "vibe",
    "baseline",
    "agree_then_vibe_else_baseline",
    "vibe_only_when_agree",
    "vibe_blocked_by_strong_baseline",
    "strong_baseline_outranks_vibe",
    "vibe_inverted",
    "baseline_inverted",
)


def market_context(rows: list[dict[str, Any]], horizon: int) -> dict[str, Any]:
    rets = [r[f"ret_{horizon}d"] for r in rows if f"ret_{horizon}d" in r]
    bench = [r[f"bench_{horizon}d"] for r in rows if f"bench_{horizon}d" in r]
    rels = [r[f"rel_{horizon}d"] for r in rows if f"rel_{horizon}d" in r]
    return {
        "n": len(rets),
        "avg_raw_return_pct": round(sum(rets) / len(rets), 3) if rets else None,
        "avg_benchmark_return_pct": round(sum(bench) / len(bench), 3) if bench else None,
        "avg_relative_pct": round(sum(rels) / len(rels), 3) if rels else None,
    }


def score_bucket_table(rows: list[dict[str, Any]], horizon: int) -> list[dict[str, Any]]:
    ret_key = f"ret_{horizon}d"
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        if ret_key not in row:
            continue
        score = row["baseline_score"]
        if score >= 0.5:
            label = ">= +0.5"
        elif score >= 0.1:
            label = "+0.1 .. +0.5"
        elif score > -0.1:
            label = "-0.1 .. +0.1"
        elif score > -0.5:
            label = "-0.5 .. -0.1"
        else:
            label = "<= -0.5"
        buckets[label].append(row[ret_key])
    order = [">= +0.5", "+0.1 .. +0.5", "-0.1 .. +0.1", "-0.5 .. -0.1", "<= -0.5"]
    out = []
    for label in order:
        values = buckets.get(label) or []
        if not values:
            continue
        out.append(
            {
                "bucket": label,
                "n": len(values),
                "avg_return_pct": round(sum(values) / len(values), 3),
                "hit_rate_pct": round(100 * sum(1 for v in values if v > 0) / len(values), 1),
            }
        )
    return out


def render_report(rows: list[dict[str, Any]], generated_for: str) -> str:
    lines: list[str] = []
    lines.append(f"# technical baseline vs model directives audit")
    lines.append("")
    lines.append(f"sample: {generated_for} | calls scored: {len(rows)} | horizons: 1d / 7d / 30d")
    lines.append("")
    lines.append("signal mapping: accumulate=+1, hold/watch=0, trim/avoid=-1; baseline strong_buy/buy=+1, neutral=0, sell/strong_sell=-1. returns are close-to-close, signal returns are half-weighted so long+short max out at 0.5.")
    lines.append("")
    for horizon in HORIZONS:
        lines.append(f"## horizon {horizon}d")
        lines.append("")
        ctx = market_context(rows, horizon)
        lines.append("market context for the same call set (long-only, no signal):")
        lines.append("")
        lines.append(f"- n: {ctx['n']} | avg stock return: {ctx['avg_raw_return_pct']}% | avg benchmark return: {ctx['avg_benchmark_return_pct']}% | avg relative: {ctx['avg_relative_pct']}%")
        lines.append("")
        lines.append("| strategy | n | active | date-avg signal ret | hit rate | date-avg relative |")
        lines.append("|---|---:|---:|---:|---:|---:|")
        for strategy in STRATEGIES:
            s = summarize(rows, strategy, horizon)
            if not s.get("n"):
                continue
            lines.append(
                f"| {strategy} | {s['n']} | {s['n_active']} | {s['date_avg_signal_return_pct']}% | "
                f"{s['hit_rate_pct']}% | {s['date_avg_relative_pct'] if s['date_avg_relative_pct'] is not None else '-'}% |"
            )
        lines.append("")
        lines.append("### per-label outcomes")
        lines.append("")
        lines.append("| family | label | n | avg ret | median | hit rate | avg relative | avg max dd |")
        lines.append("|---|---|---:|---:|---:|---:|---:|---:|")
        for row in per_stance_table(rows, horizon):
            lines.append(
                f"| {row['family']} | {row['label']} | {row['n']} | {row['avg_return_pct']}% | {row['median_return_pct']}% | "
                f"{row['hit_rate_pct']}% | {row['avg_relative_pct'] if row['avg_relative_pct'] is not None else '-'}% | {row['avg_max_dd_pct']}% |"
            )
        lines.append("")
        lines.append("### baseline score vs forward return")
        lines.append("")
        lines.append("| score bucket | n | avg ret | hit rate |")
        lines.append("|---|---:|---:|---:|")
        for row in score_bucket_table(rows, horizon):
            lines.append(f"| {row['bucket']} | {row['n']} | {row['avg_return_pct']}% | {row['hit_rate_pct']}% |")
        lines.append("")
        lines.append("### model vs baseline agreement")
        lines.append("")
        lines.append("| bucket | n | avg ret | hit rate | avg relative |")
        lines.append("|---|---:|---:|---:|---:|")
        for row in agreement_table(rows, horizon):
            lines.append(
                f"| {row['bucket']} | {row['n']} | {row['avg_return_pct']}% | {row['hit_rate_pct']}% | "
                f"{row['avg_relative_pct'] if row['avg_relative_pct'] is not None else '-'}% |"
            )
        lines.append("")
    lines.append("## model confidence calibration (7d, directional calls only)")
    lines.append("")
    lines.append("| confidence | n | avg signal ret | hit rate |")
    lines.append("|---|---:|---:|---:|")
    for row in confidence_table(rows, 7):
        lines.append(f"| {row['confidence']} | {row['n']} | {row['avg_signal_return_pct']}% | {row['hit_rate_pct']}% |")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit technical baseline vs model directives")
    parser.add_argument("--db", default=os.getenv("LOCALDB_PATH", ""), help="sqlite file path")
    parser.add_argument("--write-report", action="store_true")
    parser.add_argument("--out-dir", default="explorations")
    args = parser.parse_args()
    if not args.db:
        raise SystemExit("Set LOCALDB_PATH or pass --db")

    bars_by_instrument, calls, price_docs = load_store_rows(args.db)
    hist_by_instrument = {doc["instrument_id"]: doc["history_window"] for doc in price_docs}
    benchmark_history = hist_by_instrument.get(BENCHMARK_ID) or []
    rows = build_rows(bars_by_instrument, hist_by_instrument, calls, benchmark_history)
    print(json.dumps({"calls": len(calls), "scored": len(rows), "benchmark_points": len(benchmark_history)}))

    dates = sorted({row["call_date"] for row in rows})
    sample = f"{dates[0]} to {dates[-1]}" if dates else "empty"
    report = render_report(rows, sample)

    if args.write_report:
        os.makedirs(args.out_dir, exist_ok=True)
        report_path = os.path.join(args.out_dir, "technical-baseline-audit.md")
        raw_path = os.path.join(args.out_dir, "technical-baseline-audit.json")
        with open(report_path, "w", encoding="utf-8") as handle:
            handle.write(report)
        with open(raw_path, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "sample": sample,
                    "rows": rows,
                    "strategies": {
                        strategy: {str(h): summarize(rows, strategy, h) for h in HORIZONS}
                        for strategy in STRATEGIES
                    },
                },
                handle,
                indent=2,
            )
        print(json.dumps({"report": report_path, "raw": raw_path}))


if __name__ == "__main__":
    main()
