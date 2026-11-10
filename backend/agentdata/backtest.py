"""Rule-based backtest engine. Standard library only.

This file has a TypeScript twin at ``lib/backtest/engine.ts``. Both take the
same rule spec and the same price data and must return the same numbers; the
shared fixture in ``lib/backtest/fixtures`` is checked by both test suites.
When you change arithmetic here, change it there in the same order: floating
point sums are compared to nine decimal places.

The contract, in plain words:

* Signals at a rebalance use closes up to and including the signal session
  (the last session of the week, month or quarter). Nothing later.
* Trades fill at the NEXT session's close.
* Every trade pays ``cost_bps`` of the amount traded. On by default.
* Empty slots sit in cash at 0%.
* The benchmark is bought at the first fill and held.

``run_weights_backtest`` is the simpler self-serve mode: a fixed list of tickers
and weights, bought at one close and reset to those weights on a schedule.

Rule spec (JSON)::

    {
      "version": 1,
      "universe": {"id": "sp500", "top_by_size": 30},      # or {"symbols": [...]}
      "filters": [{"type": "trend", "ma_days": 200, "min": 0}],
      "rank": [{"type": "momentum", "months": 12, "skip_months": 1, "weight": 1}],
      "market_filter": {"symbol": "SPY", "ma_days": 200},  # optional
      "holdings": 20,
      "weighting": "equal",        # or "rank"
      "rebalance": "monthly",      # or "weekly", "quarterly"
      "cost_bps": 10,
      "benchmark": "SPY",
      "start": null, "end": null   # optional ISO dates
    }

Signal types: ``momentum`` (months, skip_months), ``low_volatility`` (days),
``trend`` (ma_days), ``near_high`` (days), ``pullback`` (days), ``size``,
``congress_net_buying`` (window_days) and ``fundamental`` (field). A spec with a ``fundamental`` signal
can pick today's stocks but cannot be backtested: we hold no point-in-time
fundamentals, so a backtest would use figures nobody had yet.
"""

from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path
from typing import Any

NAN = float("nan")
SQRT252 = math.sqrt(252.0)
SESSIONS_PER_MONTH = 21
MAX_STALE_SESSIONS = 5
EPOCH_ORDINAL = 719163  # date(1970, 1, 1).toordinal()
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

SIGNAL_TYPES = (
    "momentum",
    "low_volatility",
    "trend",
    "near_high",
    "size",
    "congress_net_buying",
    "fundamental",
    "pullback",
)
FUNDAMENTAL_FIELDS = (
    "fcf_yield",
    "shareholder_yield",
    "roic",
    "market_cap",
    "dividend_yield",
    "dividend_growth_years",
    "dividend_growth",
    "debt_to_equity",
)
REBALANCE = ("weekly", "monthly", "quarterly")
WEIGHTING = ("equal", "rank")

LIMITS = {
    "holdings": (1, 50),
    "cost_bps": (0, 200),
    "months": (1, 36),
    "days": (20, 504),
    "ma_days": (20, 300),
    "window_days": (7, 365),
    "top_by_size": (5, 300),
    "filters": 6,
    "rank": 4,
    "symbols": 60,
    "weight": (1, 10),
}

_CAVEATS_PATH = Path(__file__).resolve().parents[2] / "lib" / "backtest" / "caveats.json"
_caveats_cache: dict[str, Any] | None = None


class SpecError(ValueError):
    """The rule spec is malformed. The message is safe to show to a person."""


class BacktestError(RuntimeError):
    """The spec is fine but cannot be run on the data we hold."""


# -- small shared helpers (mirrored one for one in engine.ts) -----------------


def is_nan(value: float) -> bool:
    return value != value


def r4(value: float) -> float:
    return math.floor(value * 10000.0 + 0.5) / 10000.0


def r6(value: float) -> float:
    return math.floor(value * 1000000.0 + 0.5) / 1000000.0


def day_number(iso: str) -> int:
    """Days since 1970-01-01."""
    return date(int(iso[0:4]), int(iso[5:7]), int(iso[8:10])).toordinal() - EPOCH_ORDINAL


def format_day(iso: str) -> str:
    return f"{MONTHS[int(iso[5:7]) - 1]} {int(iso[8:10])}, {iso[0:4]}"


def period_key(iso: str, rebalance: str) -> int:
    year = int(iso[0:4])
    month = int(iso[5:7])
    if rebalance == "monthly":
        return year * 12 + (month - 1)
    if rebalance == "quarterly":
        return year * 4 + (month - 1) // 3
    if rebalance == "yearly":
        return year
    # weekly: weeks start on Monday. 1970-01-01 was a Thursday.
    return (day_number(iso) + 3) // 7


def _int_in(value: Any, name: str, low: int, high: int, default: int | None = None) -> int:
    if value is None:
        if default is None:
            raise SpecError(f"{name} is required")
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        raise SpecError(f"{name} must be a number")
    if value in (float("inf"), float("-inf")):
        raise SpecError(f"{name} must be between {low} and {high}")
    number = int(math.floor(value + 0.5))
    if number < low or number > high:
        raise SpecError(f"{name} must be between {low} and {high}")
    return number


def _bound(value: Any, name: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        raise SpecError(f"{name} must be a number")
    if value in (float("inf"), float("-inf")):
        raise SpecError(f"{name} must be a number")
    return float(value)


def _iso_or_none(value: Any, name: str) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str) or len(value) != 10 or value[4] != "-" or value[7] != "-":
        raise SpecError(f"{name} must be a date like 2020-01-31")
    try:
        day_number(value)
    except ValueError:
        raise SpecError(f"{name} must be a date like 2020-01-31") from None
    return value


def _normalize_signal(raw: Any, where: str) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise SpecError(f"{where} must be an object")
    kind = raw.get("type")
    if kind not in SIGNAL_TYPES:
        raise SpecError(f"{where} has an unknown signal type")
    out: dict[str, Any] = {"type": kind}
    if kind == "momentum":
        out["months"] = _int_in(raw.get("months"), "months", *LIMITS["months"], default=12)
        out["skip_months"] = _int_in(raw.get("skip_months"), "skip_months", 0, 35, default=1)
        if out["skip_months"] >= out["months"]:
            raise SpecError("skip_months must be smaller than months")
    elif kind == "low_volatility":
        out["days"] = _int_in(raw.get("days"), "days", *LIMITS["days"], default=252)
    elif kind == "trend":
        out["ma_days"] = _int_in(raw.get("ma_days"), "ma_days", *LIMITS["ma_days"], default=200)
    elif kind == "near_high":
        out["days"] = _int_in(raw.get("days"), "days", *LIMITS["days"], default=252)
    elif kind == "congress_net_buying":
        out["window_days"] = _int_in(raw.get("window_days"), "window_days", *LIMITS["window_days"], default=90)
    elif kind == "pullback":
        out["days"] = _int_in(raw.get("days"), "days", *LIMITS["days"], default=21)
    elif kind == "fundamental":
        if raw.get("field") not in FUNDAMENTAL_FIELDS:
            raise SpecError(f"{where} has an unknown fundamental field")
        out["field"] = raw["field"]
    return out


def signal_key(signal: dict[str, Any]) -> str:
    kind = signal["type"]
    if kind == "momentum":
        return f"momentum_{signal['months']}_{signal['skip_months']}"
    if kind == "low_volatility":
        return f"low_volatility_{signal['days']}"
    if kind == "trend":
        return f"trend_{signal['ma_days']}"
    if kind == "near_high":
        return f"near_high_{signal['days']}"
    if kind == "congress_net_buying":
        return f"congress_net_buying_{signal['window_days']}"
    if kind == "fundamental":
        return f"fundamental_{signal['field']}"
    if kind == "pullback":
        return f"pullback_{signal['days']}"
    return "size"


def _lower_is_better(signal: dict[str, Any]) -> bool:
    if signal["type"] == "fundamental":
        return signal["field"] == "debt_to_equity"
    return signal["type"] == "low_volatility"


def normalize_spec(raw: Any) -> dict[str, Any]:
    """Validate, clamp and fill defaults. Raises SpecError with a readable message."""
    if not isinstance(raw, dict):
        raise SpecError("spec must be an object")

    raw_universe = raw.get("universe")
    if not isinstance(raw_universe, dict):
        raise SpecError("universe is required")
    symbols = raw_universe.get("symbols")
    universe: dict[str, Any] = {"id": None, "symbols": None, "top_by_size": None}
    if symbols is not None:
        if not isinstance(symbols, list) or not symbols:
            raise SpecError("universe.symbols must be a list of tickers")
        cleaned: list[str] = []
        for item in symbols:
            if not isinstance(item, str):
                raise SpecError("universe.symbols must be a list of tickers")
            ticker = item.strip().upper()
            if not ticker or len(ticker) > 12:
                raise SpecError("universe.symbols has an invalid ticker")
            if ticker not in cleaned:
                cleaned.append(ticker)
        if len(cleaned) > LIMITS["symbols"]:
            raise SpecError(f"universe.symbols can list at most {LIMITS['symbols']} tickers")
        cleaned.sort()
        universe["symbols"] = cleaned
    else:
        universe_id = raw_universe.get("id")
        if not isinstance(universe_id, str) or not universe_id or len(universe_id) > 40:
            raise SpecError("universe.id is required")
        universe["id"] = universe_id
    if raw_universe.get("top_by_size") is not None:
        universe["top_by_size"] = _int_in(raw_universe.get("top_by_size"), "top_by_size", *LIMITS["top_by_size"])

    raw_filters = raw.get("filters") or []
    if not isinstance(raw_filters, list) or len(raw_filters) > LIMITS["filters"]:
        raise SpecError(f"filters can hold at most {LIMITS['filters']} rules")
    filters: list[dict[str, Any]] = []
    for index, item in enumerate(raw_filters):
        signal = _normalize_signal(item, f"filters[{index}]")
        signal["min"] = _bound(item.get("min"), "min")
        signal["max"] = _bound(item.get("max"), "max")
        if signal["min"] is None and signal["max"] is None:
            raise SpecError(f"filters[{index}] needs a min or a max")
        filters.append(signal)

    raw_rank = raw.get("rank")
    if not isinstance(raw_rank, list) or not raw_rank or len(raw_rank) > LIMITS["rank"]:
        raise SpecError(f"rank needs between 1 and {LIMITS['rank']} signals")
    rank: list[dict[str, Any]] = []
    for index, item in enumerate(raw_rank):
        signal = _normalize_signal(item, f"rank[{index}]")
        signal["weight"] = _int_in(item.get("weight"), "weight", *LIMITS["weight"], default=1)
        rank.append(signal)

    market_filter = None
    raw_market = raw.get("market_filter")
    if raw_market is not None:
        if not isinstance(raw_market, dict):
            raise SpecError("market_filter must be an object")
        symbol = raw_market.get("symbol", "SPY")
        if not isinstance(symbol, str) or not symbol.strip() or len(symbol) > 12:
            raise SpecError("market_filter.symbol is invalid")
        market_filter = {
            "symbol": symbol.strip().upper(),
            "ma_days": _int_in(raw_market.get("ma_days"), "ma_days", *LIMITS["ma_days"], default=200),
        }

    weighting = raw.get("weighting", "equal")
    if weighting not in WEIGHTING:
        raise SpecError("weighting must be equal or rank")
    rebalance = raw.get("rebalance", "monthly")
    if rebalance not in REBALANCE:
        raise SpecError("rebalance must be weekly, monthly or quarterly")
    benchmark = raw.get("benchmark", "SPY")
    if not isinstance(benchmark, str) or not benchmark.strip() or len(benchmark) > 12:
        raise SpecError("benchmark is invalid")

    start = _iso_or_none(raw.get("start"), "start")
    end = _iso_or_none(raw.get("end"), "end")
    if start and end and start >= end:
        raise SpecError("start must be before end")

    return {
        "version": 1,
        "universe": universe,
        "filters": filters,
        "rank": rank,
        "market_filter": market_filter,
        "holdings": _int_in(raw.get("holdings"), "holdings", *LIMITS["holdings"], default=20),
        "weighting": weighting,
        "rebalance": rebalance,
        "cost_bps": _int_in(raw.get("cost_bps"), "cost_bps", *LIMITS["cost_bps"], default=10),
        "benchmark": benchmark.strip().upper(),
        "start": start,
        "end": end,
    }


def spec_signals(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Every distinct signal the spec reads, filters first, in spec order."""
    seen: list[str] = []
    out: list[dict[str, Any]] = []
    for signal in list(spec["filters"]) + list(spec["rank"]):
        key = signal_key(signal)
        if key not in seen:
            seen.append(key)
            out.append(signal)
    return out


def uses_signal(spec: dict[str, Any], kind: str) -> bool:
    return any(signal["type"] == kind for signal in spec_signals(spec))


def is_backtestable(spec: dict[str, Any]) -> bool:
    return not uses_signal(spec, "fundamental")


def lookback_sessions(spec: dict[str, Any]) -> int:
    need = 0
    for signal in spec_signals(spec):
        kind = signal["type"]
        if kind == "momentum":
            need = max(need, SESSIONS_PER_MONTH * signal["months"])
        elif kind == "low_volatility":
            need = max(need, signal["days"])
        elif kind == "trend":
            need = max(need, signal["ma_days"] - 1)
        elif kind == "near_high":
            need = max(need, signal["days"] - 1)
        elif kind == "pullback":
            need = max(need, signal["days"])
    if spec["market_filter"] is not None:
        need = max(need, spec["market_filter"]["ma_days"] - 1)
    return need


def resolve_universe(spec: dict[str, Any], universe_doc: dict[str, Any]) -> dict[str, Any]:
    """Turn ``spec.universe`` into the candidate list. ``universe_doc`` is ``tm_backtest_universe/US``."""
    universe = spec["universe"]
    if universe["symbols"] is not None:
        count = len(universe["symbols"])
        return {
            "symbols": list(universe["symbols"]),
            "label": "tickers you listed",
            "kind": "stocks",
            "partial": False,
            "id": "custom",
            "count": count,
        }
    for group in universe_doc.get("groups") or []:
        if group.get("id") == universe["id"]:
            symbols = sorted(group.get("symbols") or [])
            return {
                "symbols": symbols,
                "label": group.get("label") or universe["id"],
                "kind": group.get("kind") or "stocks",
                "partial": bool(group.get("partial")),
                "id": universe["id"],
                "count": len(symbols),
            }
    raise SpecError("unknown universe")


# -- price panel --------------------------------------------------------------


class Panel:
    """Prices aligned to the benchmark's calendar, forward filled after the first print."""

    def __init__(self, spec: dict[str, Any], data: dict[str, Any]) -> None:
        prices = data.get("prices") or {}
        benchmark = prices.get(spec["benchmark"])
        if not benchmark or not benchmark.get("dates"):
            raise BacktestError("no price history for the benchmark")
        calendar = list(benchmark["dates"])
        if spec["end"] is not None:
            calendar = [day for day in calendar if day <= spec["end"]]
        if len(calendar) < 2:
            raise BacktestError("not enough price history")
        self.calendar: list[str] = calendar
        self.days: list[int] = [day_number(day) for day in calendar]
        self.size = len(calendar)

        self.universe: list[str] = sorted(set(data.get("universe") or []))
        self.px: dict[str, list[float]] = {}
        self.obs: dict[str, list[int]] = {}
        wanted = list(self.universe)
        wanted.append(spec["benchmark"])
        if spec["market_filter"] is not None:
            wanted.append(spec["market_filter"]["symbol"])
        for symbol in wanted:
            if symbol in self.px:
                continue
            series = prices.get(symbol)
            if not series:
                continue
            px, obs = self._align(series)
            self.px[symbol] = px
            self.obs[symbol] = obs
        self.universe = [symbol for symbol in self.universe if symbol in self.px]

        self.size_factors: dict[str, float] = data.get("size_factors") or {}
        self.fundamentals: dict[str, dict[str, Any]] = data.get("fundamentals") or {}
        self.events: dict[str, list[tuple[int, str]]] = {}
        self.events_start: str | None = None
        for event in data.get("events") or []:
            symbol = event.get("symbol")
            day = event.get("date")
            side = event.get("side")
            if not symbol or not day or side not in ("buy", "sell"):
                continue
            self.events.setdefault(symbol, []).append((day_number(day), side))
            if self.events_start is None or day < self.events_start:
                self.events_start = day

    def _align(self, series: dict[str, Any]) -> tuple[list[float], list[int]]:
        dates = series.get("dates") or []
        closes = series.get("closes") or []
        count = min(len(dates), len(closes))
        px = [NAN] * self.size
        obs = [-1] * self.size
        cursor = 0
        last = NAN
        last_obs = -1
        for index in range(self.size):
            day = self.calendar[index]
            while cursor < count and dates[cursor] <= day:
                close = closes[cursor]
                if isinstance(close, (int, float)) and not isinstance(close, bool) and close > 0:
                    last = float(close)
                    if dates[cursor] == day:
                        last_obs = index
                cursor += 1
            px[index] = last
            obs[index] = last_obs
        return px, obs


def signal_value(signal: dict[str, Any], symbol: str, index: int, panel: Panel) -> float:
    kind = signal["type"]
    px = panel.px[symbol]
    if kind == "momentum":
        recent = index - SESSIONS_PER_MONTH * signal["skip_months"]
        base = index - SESSIONS_PER_MONTH * signal["months"]
        if base < 0:
            return NAN
        end_price = px[recent]
        start_price = px[base]
        if is_nan(end_price) or is_nan(start_price) or start_price <= 0:
            return NAN
        return end_price / start_price - 1.0
    if kind == "low_volatility":
        days = signal["days"]
        start = index - days
        if start < 0 or is_nan(px[start]):
            return NAN
        total = 0.0
        for k in range(start + 1, index + 1):
            total += px[k] / px[k - 1] - 1.0
        mean = total / days
        squares = 0.0
        for k in range(start + 1, index + 1):
            gap = (px[k] / px[k - 1] - 1.0) - mean
            squares += gap * gap
        return math.sqrt(squares / (days - 1)) * SQRT252
    if kind == "trend":
        days = signal["ma_days"]
        start = index - days + 1
        if start < 0 or is_nan(px[start]):
            return NAN
        total = 0.0
        for k in range(start, index + 1):
            total += px[k]
        return px[index] / (total / days) - 1.0
    if kind == "near_high":
        days = signal["days"]
        start = index - days + 1
        if start < 0 or is_nan(px[start]):
            return NAN
        high = px[start]
        for k in range(start + 1, index + 1):
            if px[k] > high:
                high = px[k]
        return px[index] / high - 1.0
    if kind == "pullback":
        # How far the price has fallen over the window: 0.08 means down 8%.
        base = index - signal["days"]
        if base < 0 or is_nan(px[base]) or px[base] <= 0:
            return NAN
        return -(px[index] / px[base] - 1.0)
    if kind == "size":
        factor = panel.size_factors.get(symbol)
        if not isinstance(factor, (int, float)) or isinstance(factor, bool) or not factor > 0:
            return NAN
        return factor * px[index]
    if kind == "congress_net_buying":
        buys, sells = congress_counts(symbol, index, signal["window_days"], panel)
        return float(buys - sells)
    if kind == "fundamental":
        value = (panel.fundamentals.get(symbol) or {}).get(signal["field"])
        if not isinstance(value, (int, float)) or isinstance(value, bool) or value != value:
            return NAN
        return float(value)
    return NAN


def congress_counts(symbol: str, index: int, window_days: int, panel: Panel) -> tuple[int, int]:
    """Buy and sell filings dated in the ``window_days`` ending on the signal day."""
    today = panel.days[index]
    oldest = today - window_days
    buys = 0
    sells = 0
    for day, side in panel.events.get(symbol, []):
        if oldest < day <= today:
            if side == "buy":
                buys += 1
            else:
                sells += 1
    return buys, sells


def select(spec: dict[str, Any], panel: Panel, index: int) -> dict[str, Any]:
    """What the rules hold given closes up to and including ``index``."""
    pool: list[str] = []
    for symbol in panel.universe:
        price = panel.px[symbol][index]
        if is_nan(price) or price <= 0:
            continue
        seen = panel.obs[symbol][index]
        if seen < 0 or index - seen > MAX_STALE_SESSIONS:
            continue
        pool.append(symbol)
    candidates = len(pool)

    sizes: dict[str, float] = {}
    top = spec["universe"]["top_by_size"]
    if top is not None:
        sized: list[tuple[str, float]] = []
        for symbol in pool:
            value = signal_value({"type": "size"}, symbol, index, panel)
            if not is_nan(value):
                sized.append((symbol, value))
        sized.sort(key=lambda item: (-item[1], item[0]))
        sized = sized[:top]
        for symbol, value in sized:
            sizes[symbol] = value
        pool = sorted(sizes.keys())

    signals = spec_signals(spec)
    keys = [signal_key(signal) for signal in signals]
    rows: list[tuple[str, dict[str, float]]] = []
    for symbol in pool:
        values: dict[str, float] = {}
        usable = True
        for position, signal in enumerate(signals):
            value = signal_value(signal, symbol, index, panel)
            if is_nan(value):
                usable = False
                break
            values[keys[position]] = value
        if not usable:
            continue
        passed = True
        for rule in spec["filters"]:
            value = values[signal_key(rule)]
            if rule["min"] is not None and value < rule["min"]:
                passed = False
            if rule["max"] is not None and value > rule["max"]:
                passed = False
        if not passed:
            continue
        if symbol in sizes and "size" not in values:
            values["size"] = sizes[symbol]
        for signal in signals:
            if signal["type"] == "congress_net_buying":
                buys, sells = congress_counts(symbol, index, signal["window_days"], panel)
                values["congress_buys"] = float(buys)
                values["congress_sells"] = float(sells)
        rows.append((symbol, values))
    eligible = len(rows)

    market_ok = True
    if spec["market_filter"] is not None:
        market_symbol = spec["market_filter"]["symbol"]
        if market_symbol in panel.px:
            gauge = signal_value(
                {"type": "trend", "ma_days": spec["market_filter"]["ma_days"]}, market_symbol, index, panel
            )
            if not is_nan(gauge) and gauge < 0:
                market_ok = False

    holdings: list[dict[str, Any]] = []
    if market_ok and eligible > 0:
        composite = [0.0] * eligible
        total_weight = 0
        for rule in spec["rank"]:
            key = signal_key(rule)
            sign = 1.0 if _lower_is_better(rule) else -1.0
            order = sorted(range(eligible), key=lambda i: (sign * rows[i][1][key], rows[i][0]))
            for place, row_index in enumerate(order):
                share = 1.0 if eligible == 1 else 1.0 - place / (eligible - 1)
                composite[row_index] += rule["weight"] * share
            total_weight += rule["weight"]
        for row_index in range(eligible):
            composite[row_index] = composite[row_index] / total_weight
        final = sorted(range(eligible), key=lambda i: (-composite[i], rows[i][0]))
        slots = spec["holdings"]
        chosen = final[:slots]
        denominator = slots * (slots + 1) / 2.0
        for place, row_index in enumerate(chosen):
            if spec["weighting"] == "rank":
                weight = (slots - place) / denominator
            else:
                weight = 1.0 / slots
            holdings.append(
                {
                    "symbol": rows[row_index][0],
                    "weight": weight,
                    "score": composite[row_index],
                    "rank": place + 1,
                    "values": rows[row_index][1],
                }
            )

    return {
        "signal_date": panel.calendar[index],
        "candidates": candidates,
        "eligible": eligible,
        "market_ok": market_ok,
        "holdings": holdings,
    }


# -- statistics ---------------------------------------------------------------


def curve_stats(dates: list[str], curve: list[float]) -> dict[str, Any]:
    """Return, risk and drawdown for a curve that started at 100 before its first point."""
    count = len(curve)
    last = curve[count - 1]
    total_return = last / 100.0 - 1.0
    years = (day_number(dates[count - 1]) - day_number(dates[0])) / 365.25

    annualized = None
    if years >= 1.0 and last > 0:
        annualized = math.pow(last / 100.0, 1.0 / years) - 1.0

    returns: list[float] = []
    for i in range(1, count):
        returns.append(curve[i] / curve[i - 1] - 1.0)
    volatility = None
    sharpe = None
    if len(returns) >= 20:
        total = 0.0
        for value in returns:
            total += value
        mean = total / len(returns)
        squares = 0.0
        for value in returns:
            gap = value - mean
            squares += gap * gap
        deviation = math.sqrt(squares / (len(returns) - 1))
        volatility = deviation * SQRT252
        if len(returns) >= 60 and deviation > 0:
            sharpe = mean / deviation * SQRT252

    peak = 100.0
    peak_date = dates[0]
    worst = 0.0
    worst_peak = dates[0]
    worst_trough = dates[0]
    for i in range(count):
        if curve[i] > peak:
            peak = curve[i]
            peak_date = dates[i]
        drop = curve[i] / peak - 1.0
        if drop < worst:
            worst = drop
            worst_peak = peak_date
            worst_trough = dates[i]

    return {
        "total_return": r6(total_return),
        "annualized_return": None if annualized is None else r6(annualized),
        "volatility": None if volatility is None else r6(volatility),
        "sharpe": None if sharpe is None else r6(sharpe),
        "max_drawdown": r6(worst),
        "max_drawdown_peak": worst_peak,
        "max_drawdown_trough": worst_trough,
        "final_value": r4(last),
    }


def yearly_table(dates: list[str], strategy: list[float], benchmark: list[float]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start_strategy = 100.0
    start_benchmark = 100.0
    year = dates[0][0:4]
    sessions = 0
    for i in range(len(dates)):
        this_year = dates[i][0:4]
        if this_year != year:
            rows.append(_year_row(year, sessions, start_strategy, strategy[i - 1], start_benchmark, benchmark[i - 1]))
            start_strategy = strategy[i - 1]
            start_benchmark = benchmark[i - 1]
            year = this_year
            sessions = 0
        sessions += 1
    last = len(dates) - 1
    rows.append(_year_row(year, sessions, start_strategy, strategy[last], start_benchmark, benchmark[last]))
    return rows


def _year_row(
    year: str, sessions: int, s0: float, s1: float, b0: float, b1: float
) -> dict[str, Any]:
    strategy_return = s1 / s0 - 1.0
    benchmark_return = b1 / b0 - 1.0
    return {
        "year": int(year),
        "strategy": r6(strategy_return),
        "benchmark": r6(benchmark_return),
        "beat": strategy_return > benchmark_return,
        "complete": sessions >= 240,
        "sessions": sessions,
    }


# -- caveats ------------------------------------------------------------------


def load_caveats() -> dict[str, Any]:
    global _caveats_cache
    if _caveats_cache is None:
        _caveats_cache = json.loads(_CAVEATS_PATH.read_text())
    return _caveats_cache


def _fill(template: str, values: dict[str, str]) -> str:
    out = template
    for key, value in values.items():
        out = out.replace("{" + key + "}", value)
    return out


def _tenths(value: float) -> str:
    scaled = int(math.floor(abs(value) * 10.0 + 0.5))
    return f"{scaled // 10}.{scaled % 10}"


def _bps_as_pct(bps: int) -> str:
    whole = bps // 100
    cents = bps % 100
    if cents == 0:
        return str(whole)
    if cents % 10 == 0:
        return f"{whole}.{cents // 10}"
    return f"{whole}.{cents // 10}{cents % 10}"


def period_words(first: str, last: str) -> str:
    days = day_number(last) - day_number(first)
    years = days / 365.25
    if years < 1.0:
        months = int(math.floor(days / 30.44 + 0.5))
        if months < 1:
            return "less than a month"
        if months == 1:
            return "about 1 month"
        return f"about {months} months"
    return f"about {_tenths(years)} years"


def build_caveats(flags: list[str], values: dict[str, str], catalog: dict[str, Any] | None = None) -> list[dict[str, str]]:
    catalog = catalog or load_caveats()
    out: list[dict[str, str]] = []
    for caveat_id in catalog["order"]:
        if caveat_id not in flags:
            continue
        item = catalog["items"][caveat_id]
        out.append(
            {
                "id": caveat_id,
                "title": _fill(item["title"], values),
                "text": _fill(item["text"], values),
            }
        )
    return out


REBALANCE_WORD = {"weekly": "week", "monthly": "month", "quarterly": "quarter"}


# -- the backtest -------------------------------------------------------------


def run_backtest(raw_spec: dict[str, Any], data: dict[str, Any], catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run ``raw_spec`` over ``data``.

    ``data`` keys: ``prices`` ({symbol: {dates, closes}}), ``universe`` (candidate
    symbols), ``universe_label``, ``universe_kind`` ("stocks" or "funds"),
    ``universe_partial`` (bool), ``size_factors`` ({symbol: shares proxy}) and
    ``events`` ([{symbol, date, side}] where date is the public filing date).
    """
    spec = normalize_spec(raw_spec)
    if not is_backtestable(spec):
        raise BacktestError(
            "rules that use company financials cannot be backtested: we do not hold the figures as they were known on each past date"
        )
    panel = Panel(spec, data)
    if not panel.universe:
        raise BacktestError("no price history for this universe")
    calendar = panel.calendar
    size = panel.size
    need = lookback_sessions(spec)

    lower_bound = spec["start"]
    uses_congress = uses_signal(spec, "congress_net_buying")
    if uses_congress:
        if panel.events_start is None:
            raise BacktestError("no congressional filings to test against")
        if lower_bound is None or panel.events_start > lower_bound:
            lower_bound = panel.events_start

    signal_at: dict[int, int] = {}
    first_trade = -1
    for i in range(need, size - 1):
        if lower_bound is not None and calendar[i] < lower_bound:
            continue
        if period_key(calendar[i], spec["rebalance"]) != period_key(calendar[i + 1], spec["rebalance"]):
            signal_at[i + 1] = i
            if first_trade < 0:
                first_trade = i + 1
    if first_trade < 0:
        raise BacktestError("not enough price history for these rules")

    bench = panel.px[spec["benchmark"]]
    bench_start = bench[first_trade]
    rate = spec["cost_bps"] / 10000.0

    equity = 100.0
    cash = 100.0
    positions: list[list[Any]] = []  # [symbol, value]
    dates: list[str] = []
    strategy_curve: list[float] = []
    benchmark_curve: list[float] = []
    rebalances: list[dict[str, Any]] = []
    cost_drag = 0.0
    turnover_sum = 0.0
    turnover_count = 0
    max_cash = 0.0
    cash_sum = 0.0
    first_eligible = 0
    last_eligible = 0
    first_candidates = 0
    last_candidates = 0

    for i in range(first_trade, size):
        if i > first_trade:
            total = cash
            for position in positions:
                px = panel.px[position[0]]
                position[1] = position[1] * (px[i] / px[i - 1])
                total += position[1]
            equity = total

        if i in signal_at:
            picked = select(spec, panel, signal_at[i])
            target = picked["holdings"]
            current: dict[str, float] = {}
            for position in positions:
                current[position[0]] = position[1] / equity
            target_symbols: dict[str, bool] = {}
            traded = 0.0
            for holding in target:
                target_symbols[holding["symbol"]] = True
                traded += abs(holding["weight"] - current.get(holding["symbol"], 0.0))
            for position in positions:
                if position[0] not in target_symbols:
                    traded += current[position[0]]
            cost = equity * rate * traded
            cost_drag += rate * traded
            equity = equity - cost
            invested = 0.0
            next_positions: list[list[Any]] = []
            weight_sum = 0.0
            for holding in target:
                value = holding["weight"] * equity
                next_positions.append([holding["symbol"], value])
                invested += value
                weight_sum += holding["weight"]
            cash = equity - invested
            cash_weight = 1.0 - weight_sum
            if cash_weight < 1e-12:
                cash_weight = 0.0
            added = sorted(symbol for symbol in target_symbols if symbol not in current)
            dropped = sorted(symbol for symbol in current if symbol not in target_symbols)
            if rebalances:
                turnover_sum += traded / 2.0
                turnover_count += 1
            else:
                first_eligible = picked["eligible"]
                first_candidates = picked["candidates"]
            last_eligible = picked["eligible"]
            last_candidates = picked["candidates"]
            if cash_weight > max_cash:
                max_cash = cash_weight
            cash_sum += cash_weight
            rebalances.append(
                {
                    "signal_date": picked["signal_date"],
                    "trade_date": calendar[i],
                    "holdings": [
                        {"symbol": h["symbol"], "weight": r6(h["weight"]), "score": r6(h["score"])} for h in target
                    ],
                    "added": added,
                    "dropped": dropped,
                    "turnover": r6(traded / 2.0),
                    "cash": r6(cash_weight),
                    "eligible": picked["eligible"],
                    "candidates": picked["candidates"],
                    "market_ok": picked["market_ok"],
                }
            )
            positions = next_positions

        dates.append(calendar[i])
        strategy_curve.append(equity)
        benchmark_curve.append(100.0 * bench[i] / bench_start)

    strategy_stats = curve_stats(dates, strategy_curve)
    benchmark_stats = curve_stats(dates, benchmark_curve)
    years_table = yearly_table(dates, strategy_curve, benchmark_curve)
    complete = [row for row in years_table if row["complete"]]
    counted = complete if complete else years_table
    beat = 0
    worst_year = None
    best_year = None
    for row in counted:
        if row["beat"]:
            beat += 1
        if worst_year is None or row["strategy"] < worst_year["strategy"]:
            worst_year = row
        if best_year is None or row["strategy"] > best_year["strategy"]:
            best_year = row

    span_years = (day_number(dates[len(dates) - 1]) - day_number(dates[0])) / 365.25
    annual_turnover = None
    if span_years >= 1.0:
        annual_turnover = r6(turnover_sum / span_years)

    flags = ["backtest_label", "timing", "benchmark", "definitions"]
    kind = data.get("universe_kind") or "stocks"
    if kind == "funds":
        flags.append("fixed_funds")
        if "XLRE" in panel.universe or "XLC" in panel.universe:
            flags.append("fund_start_dates")
    else:
        flags.append("survivorship")
        if data.get("universe_partial"):
            flags.append("partial_index")
    if spec["universe"]["top_by_size"] is not None or uses_signal(spec, "size"):
        flags.append("estimated_size")
    if uses_congress:
        flags.append("congress_filings")
    if span_years < 3.0:
        flags.append("short_record")
    flags.append("costs" if spec["cost_bps"] > 0 else "no_costs")
    if max_cash > 1e-9:
        flags.append("cash")
    values = {
        "start": format_day(dates[0]),
        "end": format_day(dates[len(dates) - 1]),
        "candidates": str(len(panel.universe)),
        "universe_label": str(data.get("universe_label") or "companies"),
        "events_start": format_day(panel.events_start) if panel.events_start else "",
        "period_words": period_words(dates[0], dates[len(dates) - 1]),
        "rebalance_period": REBALANCE_WORD[spec["rebalance"]],
        "cost_bps": str(spec["cost_bps"]),
        "cost_pct": _bps_as_pct(spec["cost_bps"]),
        "cost_drag_pct": _tenths(cost_drag * 100.0),
        "holdings": str(spec["holdings"]),
        "benchmark": spec["benchmark"],
    }

    return {
        "spec": spec,
        "period": {
            "start": dates[0],
            "end": dates[len(dates) - 1],
            "first_signal": rebalances[0]["signal_date"],
            "years": r6(span_years),
            "sessions": len(dates),
        },
        "universe": {
            "label": str(data.get("universe_label") or "companies"),
            "kind": kind,
            "symbols": len(panel.universe),
            "candidates_first": first_candidates,
            "candidates_last": last_candidates,
            "eligible_first": first_eligible,
            "eligible_last": last_eligible,
        },
        "summary": {"strategy": strategy_stats, "benchmark": benchmark_stats},
        "years": years_table,
        "hit_rate": {
            "beat": beat,
            "years": len(counted),
            "complete_years_only": bool(complete),
        },
        "worst_year": worst_year,
        "best_year": best_year,
        "turnover": {
            "per_rebalance": r6(turnover_sum / turnover_count) if turnover_count else None,
            "annual": annual_turnover,
            "rebalances": len(rebalances),
        },
        "costs": {
            "bps": spec["cost_bps"],
            "total_drag": r6(cost_drag),
        },
        "cash": {
            "average": r6(cash_sum / len(rebalances)),
            "max": r6(max_cash),
        },
        "curve": {
            "dates": dates,
            "strategy": [r4(value) for value in strategy_curve],
            "benchmark": [r4(value) for value in benchmark_curve],
        },
        "rebalances": rebalances,
        "caveats": build_caveats(flags, values, catalog),
    }


def current_picks(raw_spec: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """What the rules hold as of the last session in the data. Works for fundamental specs too."""
    spec = normalize_spec(raw_spec)
    panel = Panel(spec, data)
    picked = select(spec, panel, panel.size - 1)
    picked["holdings"] = [
        {
            "symbol": h["symbol"],
            "weight": r6(h["weight"]),
            "score": r6(h["score"]),
            "rank": h["rank"],
            "values": {key: r6(value) for key, value in h["values"].items()},
        }
        for h in picked["holdings"]
    ]
    return picked


def simulate_decisions(
    decisions: list[dict[str, Any]],
    prices: dict[str, dict[str, Any]],
    *,
    benchmark: str = "SPY",
    cost_bps: int = 10,
) -> dict[str, Any] | None:
    """Value a list of frozen decisions: the forward (live) record.

    Each decision is ``{signal_date, holdings: [{symbol, weight}]}`` and fills at
    the close of the first session after its signal date. Returns None until the
    first decision has a session to fill on.
    """
    series = prices.get(benchmark)
    if not series or not decisions:
        return None
    calendar = list(series["dates"])
    symbols: list[str] = []
    for decision in decisions:
        for holding in decision["holdings"]:
            if holding["symbol"] not in symbols:
                symbols.append(holding["symbol"])
    spec = {"benchmark": benchmark, "end": None, "market_filter": None}
    panel = Panel(spec, {"prices": prices, "universe": symbols})

    trade_at: dict[int, dict[str, Any]] = {}
    for decision in decisions:
        for i in range(len(calendar)):
            if calendar[i] > decision["signal_date"]:
                trade_at[i] = decision
                break
    if not trade_at:
        return None
    first_trade = min(trade_at.keys())
    bench = panel.px[benchmark]
    bench_start = bench[first_trade]
    rate = cost_bps / 10000.0

    equity = 100.0
    cash = 100.0
    positions: list[list[Any]] = []
    dates: list[str] = []
    strategy_curve: list[float] = []
    benchmark_curve: list[float] = []
    for i in range(first_trade, len(calendar)):
        if i > first_trade:
            total = cash
            for position in positions:
                px = panel.px[position[0]]
                position[1] = position[1] * (px[i] / px[i - 1])
                total += position[1]
            equity = total
        if i in trade_at:
            target = [
                h
                for h in trade_at[i]["holdings"]
                if h["symbol"] in panel.px and not is_nan(panel.px[h["symbol"]][i])
            ]
            current = {position[0]: position[1] / equity for position in positions}
            traded = 0.0
            target_symbols = {h["symbol"] for h in target}
            for holding in target:
                traded += abs(holding["weight"] - current.get(holding["symbol"], 0.0))
            for position in positions:
                if position[0] not in target_symbols:
                    traded += current[position[0]]
            equity = equity - equity * rate * traded
            positions = [[h["symbol"], h["weight"] * equity] for h in target]
            invested = 0.0
            for position in positions:
                invested += position[1]
            cash = equity - invested
        dates.append(calendar[i])
        strategy_curve.append(equity)
        benchmark_curve.append(100.0 * bench[i] / bench_start)

    last = len(dates) - 1
    return {
        "first_fill_date": dates[0],
        "last_date": dates[last],
        "sessions": len(dates),
        "strategy_return": r6(strategy_curve[last] / 100.0 - 1.0),
        "benchmark_return": r6(benchmark_curve[last] / 100.0 - 1.0),
        "curve": {
            "dates": dates,
            "strategy": [r4(value) for value in strategy_curve],
            "benchmark": [r4(value) for value in benchmark_curve],
        },
    }


# -- fixed weights (the self-serve backtester) -------------------------------

WEIGHTS_REBALANCE = ("never", "monthly", "quarterly", "yearly")
WEIGHTS_MAX_HOLDINGS = 30
WEIGHTS_PERIOD_WORD = {"monthly": "month", "quarterly": "quarter", "yearly": "year"}


class MissingHistoryError(BacktestError):
    """We hold no price history for some of the tickers asked for."""

    def __init__(self, symbols: list[str]) -> None:
        super().__init__("no price history for " + ", ".join(symbols))
        self.symbols = symbols


def normalize_weights_input(raw: Any) -> dict[str, Any]:
    """Validate a fixed-weights request. Weights are rescaled to add up to 1."""
    if not isinstance(raw, dict):
        raise SpecError("input must be an object")
    raw_holdings = raw.get("holdings")
    if not isinstance(raw_holdings, list) or not raw_holdings:
        raise SpecError("add at least one ticker")
    if len(raw_holdings) > WEIGHTS_MAX_HOLDINGS:
        raise SpecError(f"a portfolio can hold at most {WEIGHTS_MAX_HOLDINGS} tickers")
    symbols: list[str] = []
    weights: list[float] = []
    total = 0.0
    for item in raw_holdings:
        if not isinstance(item, dict) or not isinstance(item.get("symbol"), str):
            raise SpecError("each holding needs a ticker")
        ticker = item["symbol"].strip().upper()
        if not ticker or len(ticker) > 12:
            raise SpecError("a ticker is invalid")
        if ticker in symbols:
            raise SpecError(f"{ticker} is listed twice")
        weight = item.get("weight")
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or weight != weight:
            raise SpecError(f"{ticker} needs a weight")
        if weight in (float("inf"), float("-inf")) or not weight > 0:
            raise SpecError(f"the weight for {ticker} must be above zero")
        symbols.append(ticker)
        weights.append(float(weight))
        total += float(weight)
    rebalance = raw.get("rebalance", "monthly")
    if rebalance not in WEIGHTS_REBALANCE:
        raise SpecError("rebalance must be never, monthly, quarterly or yearly")
    benchmark = raw.get("benchmark", "SPY")
    if not isinstance(benchmark, str) or not benchmark.strip() or len(benchmark) > 12:
        raise SpecError("benchmark is invalid")
    start = _iso_or_none(raw.get("start"), "start")
    end = _iso_or_none(raw.get("end"), "end")
    if start and end and start >= end:
        raise SpecError("start must be before end")
    return {
        "version": 1,
        "holdings": [{"symbol": symbols[i], "weight": weights[i] / total} for i in range(len(symbols))],
        "rebalance": rebalance,
        "benchmark": benchmark.strip().upper(),
        "start": start,
        "end": end,
        "cost_bps": _int_in(raw.get("cost_bps"), "cost_bps", *LIMITS["cost_bps"], default=10),
    }


def run_weights_backtest(
    raw_input: dict[str, Any], prices: dict[str, dict[str, Any]], catalog: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Buy a fixed set of weights at one close, hold, and reset on a schedule.

    The portfolio is bought at the close of the first session on or after
    ``start`` on which every ticker has a price. Nothing is invented for a
    ticker that listed later: the test starts later instead, and says so.
    """
    spec = normalize_weights_input(raw_input)
    symbols = [holding["symbol"] for holding in spec["holdings"]]
    missing: list[str] = []
    for symbol in symbols + [spec["benchmark"]]:
        series = prices.get(symbol)
        if (not series or not series.get("dates")) and symbol not in missing:
            missing.append(symbol)
    if missing:
        raise MissingHistoryError(missing)

    panel = Panel({"benchmark": spec["benchmark"], "end": spec["end"], "market_filter": None}, {"prices": prices, "universe": symbols})
    calendar = panel.calendar
    size = panel.size

    asked = 0
    if spec["start"] is not None:
        asked = size
        for i in range(size):
            if calendar[i] >= spec["start"]:
                asked = i
                break
    first_seen: dict[str, int] = {}
    for symbol in symbols:
        px = panel.px[symbol]
        seen = -1
        for i in range(size):
            if not is_nan(px[i]):
                seen = i
                break
        first_seen[symbol] = seen
    first = asked
    limited_by = None
    for symbol in symbols:
        seen = first_seen[symbol]
        if seen < 0:
            raise MissingHistoryError([symbol])
        if seen > first:
            first = seen
            limited_by = symbol
    if first >= size - 1:
        raise BacktestError("these tickers do not share enough price history in that period")

    bench = panel.px[spec["benchmark"]]
    bench_start = bench[first]
    rate = spec["cost_bps"] / 10000.0
    rebalance = spec["rebalance"]

    cost_drag = rate
    equity = 100.0 - 100.0 * rate
    values = [holding["weight"] * equity for holding in spec["holdings"]]
    dates: list[str] = []
    strategy_curve: list[float] = []
    benchmark_curve: list[float] = []
    turnover_sum = 0.0
    rebalances = 0
    for i in range(first, size):
        if i > first:
            total = 0.0
            for k in range(len(symbols)):
                px = panel.px[symbols[k]]
                values[k] = values[k] * (px[i] / px[i - 1])
                total += values[k]
            equity = total
            if rebalance != "never" and period_key(calendar[i], rebalance) != period_key(calendar[i - 1], rebalance):
                traded = 0.0
                for k in range(len(symbols)):
                    traded += abs(spec["holdings"][k]["weight"] - values[k] / equity)
                cost_drag += rate * traded
                equity = equity - equity * rate * traded
                for k in range(len(symbols)):
                    values[k] = spec["holdings"][k]["weight"] * equity
                turnover_sum += traded / 2.0
                rebalances += 1
        dates.append(calendar[i])
        strategy_curve.append(equity)
        benchmark_curve.append(100.0 * bench[i] / bench_start)

    last = size - 1
    strategy_stats = curve_stats(dates, strategy_curve)
    benchmark_stats = curve_stats(dates, benchmark_curve)
    years_table = yearly_table(dates, strategy_curve, benchmark_curve)
    complete = [row for row in years_table if row["complete"]]
    counted = complete if complete else years_table
    beat = 0
    worst_year = None
    best_year = None
    for row in counted:
        if row["beat"]:
            beat += 1
        if worst_year is None or row["strategy"] < worst_year["strategy"]:
            worst_year = row
        if best_year is None or row["strategy"] > best_year["strategy"]:
            best_year = row
    span_years = (day_number(dates[len(dates) - 1]) - day_number(dates[0])) / 365.25

    holdings_out: list[dict[str, Any]] = []
    for k in range(len(symbols)):
        px = panel.px[symbols[k]]
        seen = panel.obs[symbols[k]][last]
        holdings_out.append(
            {
                "symbol": symbols[k],
                "weight": r6(spec["holdings"][k]["weight"]),
                "end_weight": r6(values[k] / equity),
                "first_date": calendar[first_seen[symbols[k]]],
                "last_price_date": calendar[seen] if seen >= 0 else None,
                "total_return": r6(px[last] / px[first] - 1.0),
            }
        )

    flags = ["backtest_label", "hindsight_picks", "weights_timing", "benchmark", "definitions"]
    if limited_by is not None:
        flags.append("late_start")
    if span_years < 3.0:
        flags.append("short_record")
    flags.append("costs" if spec["cost_bps"] > 0 else "no_costs")
    if rebalance == "never":
        rebalance_sentence = "It is never rebalanced, so the weights drift with prices."
    else:
        rebalance_sentence = (
            "It is reset to your weights at the close of the first session of each "
            + WEIGHTS_PERIOD_WORD[rebalance]
            + "."
        )
    fill_values = {
        "start": format_day(dates[0]),
        "end": format_day(dates[len(dates) - 1]),
        "start_year": dates[0][0:4],
        "asked_start": format_day(calendar[asked]) if asked < size else "",
        "limited_symbol": limited_by or "",
        "limited_date": format_day(calendar[first]),
        "period_words": period_words(dates[0], dates[len(dates) - 1]),
        "rebalance_sentence": rebalance_sentence,
        "cost_bps": str(spec["cost_bps"]),
        "cost_pct": _bps_as_pct(spec["cost_bps"]),
        "cost_drag_pct": _tenths(cost_drag * 100.0),
        "benchmark": spec["benchmark"],
    }

    return {
        "input": {
            "version": 1,
            "holdings": [{"symbol": h["symbol"], "weight": r6(h["weight"])} for h in spec["holdings"]],
            "rebalance": rebalance,
            "benchmark": spec["benchmark"],
            "start": spec["start"],
            "end": spec["end"],
            "cost_bps": spec["cost_bps"],
        },
        "period": {
            "start": dates[0],
            "end": dates[len(dates) - 1],
            "asked_start": spec["start"],
            "years": r6(span_years),
            "sessions": len(dates),
        },
        "limited_by": None if limited_by is None else {"symbol": limited_by, "first_date": calendar[first]},
        "summary": {"strategy": strategy_stats, "benchmark": benchmark_stats},
        "years": years_table,
        "hit_rate": {"beat": beat, "years": len(counted), "complete_years_only": bool(complete)},
        "worst_year": worst_year,
        "best_year": best_year,
        "turnover": {
            "annual": r6(turnover_sum / span_years) if span_years >= 1.0 else None,
            "rebalances": rebalances,
        },
        "costs": {"bps": spec["cost_bps"], "total_drag": r6(cost_drag)},
        "holdings": holdings_out,
        "curve": {
            "dates": dates,
            "strategy": [r4(value) for value in strategy_curve],
            "benchmark": [r4(value) for value in benchmark_curve],
        },
        "caveats": build_caveats(flags, fill_values, catalog),
    }
