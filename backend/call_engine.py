"""Call engine v3: a per-family scorecard -> ADD / HOLD / TRIM -> levels -> change log.

The call is a rule over a scorecard, not a prediction and not a blended score.

1. Families. Every stock is measured on up to six families: quality, value,
   trend (price momentum), investment (asset growth and share issuance),
   accruals (profits backed by cash) and insider buying. Which factors make up
   a family depends on the business model (``FAMILIES``): banks, brokers and
   insurers, and REITs, get their own set, and a family that does not apply to
   them is marked "not scored" instead of being filled in (``NOT_SCORED``).
2. Ranking. Each factor is ranked within its peer group (sector, split by size
   where the group is big enough: ``call_factors.peer_ranks``). A family's
   score is the average of its factors' ranks, ranked again within the same
   peers, so it reads as a percentile among similar companies. Every family is
   shown on its own.
3. Votes. A family in the top third of its peers votes for, the bottom third
   votes against, the middle third abstains. Insider buying can only vote for
   (two or more insiders buying within 90 days); its absence says little.
4. The rule (``Params``), the same for every stock:
   * ADD when at least 3 families vote for, at most 1 votes against, and the
     price is above its 200-day average.
   * TRIM when at least 3 families vote against, at most 1 votes for, and the
     price is below its 200-day average.
   * HOLD otherwise. Disagreement is HOLD.
   * Once in ADD (TRIM), the call is kept while at least 2 families still vote
     for (against) and at most 1 votes the other way; the trend gate applies
     to entering only.
   * At least 4 families must be scored for a call, so no family is more than
     a quarter of it.
   * Evaluated once per ISO week. A new target must show on two weekly
     evaluations in a row, and a call is held at least four weeks before a
     routine change.
5. Levels (``build_zones``) are rebuilt from the latest close on every run, so
   the entry state always matches the price the call is shown with.

Why these numbers: thirds are the plainest split of a percentile; "3 of 5 or
6 families with at most 1 against" is a clear majority that one family cannot
make or break; the 200-day average is the most common long-term trend line
in practitioner use; the 2-week confirmation and 4-week minimum hold come
from v1/v2's finding that weekly re-ranking without them changed calls about
90 times a year. None of them were fitted to returns. The walk-forward check
is in ``backend/scripts/backtest_call_engine_v3.py``. It found no edge: ADD
did not beat TRIM in either half. Read ``EVIDENCE`` before writing any copy
about this engine.

The daily job that scores the universe and owns the state is
``backend/agentdata/call_scores.py``. The brief pipeline only reads its output
(``backend/call_engine_pipeline.py``), behind ``CALL_ENGINE_MODE``.

Standard library only.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from typing import Any

from backend import call_factors as cf
from backend.call_factors import FACTOR_LABELS, FINANCIAL, REIT, STANDARD

ENGINE_VERSION = "call-engine-3"

ADD, HOLD, TRIM = "add", "hold", "trim"

# --------------------------------------------------------------------------
# the scorecard
# --------------------------------------------------------------------------

FAMILY_ORDER: tuple[str, ...] = ("quality", "value", "trend", "investment", "accruals", "insider")
FAMILY_LABELS: dict[str, str] = {
    "quality": "Quality",
    "value": "Value",
    "trend": "Trend",
    "investment": "Investment",
    "accruals": "Accruals",
    "insider": "Insider buying",
}
FAMILY_MEANS: dict[str, str] = {
    "quality": "how profitable and sound the business is",
    "value": "how cheap the shares are for what the company earns or owns",
    "trend": "how the share price has moved over the past year",
    "investment": "how slowly assets and the share count are growing",
    "accruals": "how much of reported profit is backed by cash",
    "insider": "whether several insiders bought shares recently",
}

_TREND = ("momentum_12_1", "residual_momentum")
_INVESTMENT = ("low_asset_growth", "low_net_issuance")

# Factors per family, per business model. Fixed from the published factor
# literature, not chosen on this data. "insider" is handled separately.
FAMILIES: dict[str, dict[str, tuple[str, ...]]] = {
    STANDARD: {
        # return on assets covers companies that report neither gross profit
        # nor operating income (Exxon, conglomerates)
        "quality": ("gross_profitability", "operating_profitability", "return_on_assets"),
        "value": ("earnings_yield", "fcf_yield", "sales_yield"),
        "trend": _TREND,
        "investment": _INVESTMENT,
        "accruals": ("low_accruals",),
    },
    FINANCIAL: {
        "quality": ("return_on_assets", "return_on_equity", "earnings_stability", "equity_to_assets", "book_value_growth"),
        "value": ("book_yield", "earnings_yield"),
        "trend": _TREND,
        "investment": _INVESTMENT,
    },
    REIT: {
        # Operating cash flow stands in for FFO, which has no standard XBRL tag.
        "quality": ("cash_return_on_assets", "equity_to_assets"),
        "value": ("cash_flow_yield", "book_yield"),
        "trend": _TREND,
        "investment": _INVESTMENT,
    },
}

NOT_SCORED: dict[str, dict[str, str]] = {
    FINANCIAL: {
        "accruals": (
            "Not scored for banks, brokers and insurers: their operating cash flow mixes lending, trading and "
            "insurance float, so the gap between profit and cash flow does not measure earnings quality."
        ),
    },
    REIT: {
        "accruals": (
            "Not scored for REITs: property depreciation keeps reported profit far below cash flow by design, "
            "so the gap does not measure earnings quality. Cash flow is used directly in quality and value instead."
        ),
    },
}

# What a family leaves out for a model, shown next to it so nothing looks complete when it is not.
FAMILY_NOTES: dict[str, dict[str, str]] = {
    FINANCIAL: {"quality": "Dividend payout is not included: dividends are not in the filings feed yet."},
    REIT: {"value": "FFO is not reported in a standard tag; operating cash flow stands in for it."},
}

MODEL_LABELS: dict[str, str] = {
    STANDARD: "operating company",
    FINANCIAL: "bank, broker or insurer",
    REIT: "real estate investment trust",
}


def peer_group(model: str, sector: str | None, sic: str | None) -> str:
    """The group a stock is ranked in. Financials are split by SEC industry
    code, REITs are one group whatever the screener calls them (it files
    several as Technology), and everyone else uses the screener sector."""
    sic = str(sic or "")
    if model == REIT:
        return "REITs"
    if model == FINANCIAL:
        return {"60": "Banks", "61": "Lenders and other finance companies", "62": "Brokers, exchanges and asset managers"}.get(sic[:2], "Insurers")
    return str(sector or "") or (f"SIC {sic[:2]}" if sic else "")


BASIS = (
    "A rules-based scorecard: the stock is compared with similar companies on up to six measured families, "
    "and the call follows only when most of them agree and the price trend does not contradict them. "
    "It describes where the evidence stands today. It is not a forecast of the price."
)

RULE_TEXT = (
    "ADD needs at least 3 families in the top third of their peers, no more than 1 in the bottom third, and the "
    "price above its 200-day average. TRIM is the mirror image. Anything else is HOLD."
)

# What the walk-forward check measured for this rule, and what it did not.
# Stored with every call so no reader has to guess. Source:
# ``backend/scripts/backtest_call_engine_v3.py``, run 2026-11-10: 659 US
# stocks, weekly, point-in-time SEC filings and prices. The rule was
# pre-registered (with code hashes) after the development half (2018-08 to
# 2022-09) and before the holdout (2022-10 to 2026-11) was run.
#
# Six-month ADD minus TRIM, non-overlapping t in brackets:
#   development half  -2.15% (t -0.63)   holdout  -4.03% (t -1.46)
#   holdout, sector x size demeaned -2.53% (t -0.99); 200 largest -2.05%
#   (t -0.98); banks, brokers, insurers and REITs -3.62% (t -1.47).
# Every pre-registered condition failed, so copy quotes no return gap,
# t-stat or win rate. Change this only to what a re-run supports.
EVIDENCE: dict[str, Any] = {
    "horizon_sessions": 126,
    "hit_rate": None,
    "summary": (
        "Checked weekly from August 2018 to November 2026 on about 660 US stocks that are listed today, using only "
        "what had been filed at the time. The rule was written down before the second half of that period was "
        "examined. Stocks while called ADD did not do better than stocks while called TRIM over the following six "
        "months: not in either half, not among the 200 largest companies, not among banks, insurers and property "
        "companies, and not after comparing each stock only with companies of the same sector and size. In this "
        "sample TRIM stocks did better on average, though not by a statistically reliable margin. Calls changed "
        "about once per stock per year."
    ),
    "limits": (
        "No return gap, win rate or test statistic is quoted because none held up. The call is a transparent summary "
        "of where the company stands against its peers, not a tested way to pick stocks that do better. Only stocks "
        "listed today were tested, so companies that failed or were delisted are missing; that flatters stocks that "
        "were weak, cheap or falling at the time (the survivors recovered), which may be part of why TRIM looked "
        "better. The comparison is against other covered stocks, not against an index fund. Copy may say the call "
        "is a rules-based scorecard, which families agree, how stable it is and what would change it. Copy may not "
        "promise outperformance, suggest that ADD stocks tend to do better, quote a win rate or a tested return gap, "
        "or call it a forecast."
    ),
}


@dataclass(frozen=True)
class Params:
    """The rule and the level sizing. Fixed in code; see the module docstring
    for why each number is what it is."""

    top_pct: float = 200.0 / 3     # a family at or above this percentile votes for
    bottom_pct: float = 100.0 / 3  # at or below this, it votes against
    enter_votes: int = 3           # families on one side needed to leave HOLD
    keep_votes: int = 2            # families on that side needed to stay in ADD / TRIM
    max_against: int = 1           # families on the other side tolerated
    min_families: int = 4          # scored families needed for any call (each is then at most 25%)
    insider_buyers: int = 2        # distinct insiders buying within 90 days for an insider vote
    dwell_weeks: int = 4           # weekly evaluations in a call before a routine change
    confirm_weeks: int = 2         # weekly evaluations a new target must hold
    add_band_sigma: tuple[float, float] = (0.5, 1.5)   # in one-month sigmas below price
    add_fallback_sigma: float = 0.75
    pullback_sigma: float = 0.75   # a one-month fall this large counts as "already pulled back"
    trim_band_sigma: tuple[float, float] = (0.75, 2.0)  # in three-month sigmas above price
    trim_fallback_sigma: float = 1.0
    review_sessions: int = 21      # levels are shown with this review date


DEFAULT_PARAMS = Params()


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------

def _num(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def round_level(value: float) -> float:
    """Three significant figures: 349.51 -> 350, 41.37 -> 41.4, 7.238 -> 7.24."""
    if value <= 0 or not math.isfinite(value):
        return 0.0
    digits = 2 - int(math.floor(math.log10(value)))
    return round(value, max(-6, min(4, digits)))


def round_level_toward(value: float, up: bool) -> float:
    """Three significant figures, rounded away from the close: up for levels
    that must stay at or above it, down for levels that must stay below it."""
    if value <= 0 or not math.isfinite(value):
        return 0.0
    digits = max(-6, min(4, 2 - int(math.floor(math.log10(value)))))
    unit = 10.0 ** -digits
    steps = value / unit
    # tolerate float noise so 95.0 stays 95.0
    steps = math.ceil(steps - 1e-9) if up else math.floor(steps + 1e-9)
    return round(steps * unit, max(0, digits))


def _money(value: float) -> str:
    return f"${value:,.0f}" if value >= 100 else f"${value:,.2f}"


def ordinal(value: float) -> str:
    n = int(round(max(0.0, min(100.0, value))))
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def add_sessions(day: str, sessions: int) -> str:
    """Weekday arithmetic (holidays ignored): good enough for a review date."""
    current = date.fromisoformat(day[:10])
    left = max(0, int(sessions))
    while left > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:
            left -= 1
    return current.isoformat()


def week_key(day: str) -> tuple[int, int]:
    """ISO (year, week) of a date: the unit the state machine advances in."""
    iso = date.fromisoformat(day[:10]).isocalendar()
    return (iso[0], iso[1])


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


# --------------------------------------------------------------------------
# family scores (cross-sectional)
# --------------------------------------------------------------------------

def min_members(names: tuple[str, ...]) -> int:
    """Measures a family needs to be scored: half of them, rounded down, at least one."""
    return max(1, len(names) // 2)


def family_scores(stocks: dict[str, dict[str, Any]], params: Params = DEFAULT_PARAMS) -> dict[str, dict[str, dict[str, Any]]]:
    """Score every family for every stock, against its peers.

    ``stocks[symbol]`` needs ``model`` (``call_factors.factor_model``),
    ``group`` (``peer_group``), ``size`` (market cap or None), ``raw``
    (``call_factors.raw_factors``) and ``insider_buyers`` (int or None).

    Returns ``{symbol: {family: entry}}`` for every family in ``FAMILY_ORDER``.
    An entry's ``status`` is "scored" (with ``percentile`` 0..100 or None for
    insider buying, ``vote`` -1/0/+1 and ``members``), "not_scored" (the
    family does not apply to this kind of company) or "no_data".
    """
    p = params
    group_of = {symbol: str(item.get("group") or "") for symbol, item in stocks.items()}
    size_of = {symbol: float(item["size"]) for symbol, item in stocks.items() if _num(item.get("size")) and item["size"] > 0}
    out: dict[str, dict[str, dict[str, Any]]] = {symbol: {} for symbol in stocks}

    for model, families in FAMILIES.items():
        members_of = [symbol for symbol, item in stocks.items() if item.get("model") == model]
        if not members_of:
            continue
        factor_ranks: dict[str, dict[str, float]] = {}
        for factor in sorted({name for names in families.values() for name in names}):
            values = {symbol: stocks[symbol]["raw"][factor] for symbol in members_of if _num((stocks[symbol].get("raw") or {}).get(factor)) is not None}
            factor_ranks[factor] = cf.peer_ranks(values, group_of, size_of) if values else {}
        for family, names in families.items():
            need = min_members(names)
            averages: dict[str, float] = {}
            parts: dict[str, dict[str, float]] = {}
            for symbol in members_of:
                have = {name: factor_ranks[name][symbol] for name in names if symbol in factor_ranks[name]}
                if len(have) >= need:
                    averages[symbol] = sum(have.values()) / len(have)
                    parts[symbol] = have
            ranked = cf.peer_ranks(averages, group_of, size_of) if averages else {}
            for symbol in members_of:
                if symbol not in ranked:
                    out[symbol][family] = {
                        "status": "no_data",
                        "reason": f"Not enough filed data: needs {need} of {len(names)} measures, has {sum(1 for name in names if symbol in factor_ranks[name])}.",
                    }
                    continue
                pct = round(50.0 * (ranked[symbol] + 1.0), 1)
                out[symbol][family] = {
                    "status": "scored",
                    "percentile": pct,
                    "vote": 1 if pct >= p.top_pct else -1 if pct <= p.bottom_pct else 0,
                    "members": {name: round(50.0 * (value + 1.0), 1) for name, value in parts[symbol].items()},
                }
        for family, reason in NOT_SCORED.get(model, {}).items():
            for symbol in members_of:
                out[symbol][family] = {"status": "not_scored", "reason": reason}

    for symbol, item in stocks.items():
        if item.get("model") not in FAMILIES:
            continue
        buyers = item.get("insider_buyers")
        if buyers is None:
            out[symbol]["insider"] = {"status": "no_data", "reason": "No insider filing history for this stock."}
        else:
            buyers = int(buyers)
            out[symbol]["insider"] = {"status": "scored", "percentile": None, "vote": 1 if buyers >= p.insider_buyers else 0, "buyers_90d": buyers}
        for family in FAMILY_ORDER:
            note = FAMILY_NOTES.get(item["model"], {}).get(family)
            if note and out[symbol].get(family, {}).get("status") == "scored":
                out[symbol][family]["note"] = note
    return out


def tally(families: dict[str, dict[str, Any]]) -> dict[str, int]:
    """Votes for and against, abstentions, and how many families were scored."""
    scored = [entry for entry in families.values() if entry.get("status") == "scored"]
    pos = sum(1 for entry in scored if entry.get("vote") == 1)
    neg = sum(1 for entry in scored if entry.get("vote") == -1)
    return {"for": pos, "against": neg, "neutral": len(scored) - pos - neg, "scored": len(scored)}


def has_enough_families(families: dict[str, dict[str, Any]], params: Params = DEFAULT_PARAMS) -> bool:
    return tally(families)["scored"] >= params.min_families


# --------------------------------------------------------------------------
# the rule and the state machine
# --------------------------------------------------------------------------

def target_call(current: str | None, votes: dict[str, int], trend_up: bool, params: Params = DEFAULT_PARAMS) -> str:
    """The call the rule asks for this week, before confirmation and dwell."""
    p = params
    pos, neg = int(votes["for"]), int(votes["against"])
    if current == ADD and pos >= p.keep_votes and neg <= p.max_against:
        return ADD
    if current == TRIM and neg >= p.keep_votes and pos <= p.max_against:
        return TRIM
    if pos >= p.enter_votes and neg <= p.max_against and trend_up:
        return ADD
    if neg >= p.enter_votes and pos <= p.max_against and not trend_up:
        return TRIM
    return HOLD


def advance(
    prev: dict[str, Any] | None,
    *,
    day: str,
    votes: dict[str, int],
    trend_up: bool,
    params: Params = DEFAULT_PARAMS,
) -> dict[str, Any]:
    """One weekly evaluation. Returns the new state; ``state["change"]`` is set
    only on the evaluation the call changed.

    A ``day`` in the same ISO week as the previous evaluation (or earlier) is a
    rerun and never moves the state machine.

    State keys: call, since, weeks_in_call, pending, pending_weeks, votes,
    trend_up, day.
    """
    p = params
    snapshot = {"for": int(votes["for"]), "against": int(votes["against"]), "scored": int(votes["scored"])}
    if prev and prev.get("day") and week_key(day) <= week_key(str(prev["day"])):
        return {**prev, "change": None}

    if not prev or prev.get("call") not in (ADD, HOLD, TRIM):
        call = target_call(None, snapshot, trend_up, p)
        return {
            "call": call,
            "since": day,
            "weeks_in_call": 0,
            "pending": None,
            "pending_weeks": 0,
            "votes": snapshot,
            "trend_up": bool(trend_up),
            "day": day,
            "change": {"day": day, "from": None, "to": call, "trigger": "initial", "votes": snapshot},
        }

    call = prev["call"]
    held = int(prev.get("weeks_in_call", 0)) + 1
    target = target_call(call, snapshot, trend_up, p)
    pending = prev.get("pending")
    pending_weeks = int(prev.get("pending_weeks", 0))
    if target == call:
        pending, pending_weeks = None, 0
    elif pending == target:
        pending_weeks += 1
    else:
        pending, pending_weeks = target, 1

    state = {
        "call": call,
        "since": prev.get("since") or day,
        "weeks_in_call": held,
        "pending": pending,
        "pending_weeks": pending_weeks,
        "votes": snapshot,
        "trend_up": bool(trend_up),
        "day": day,
        "change": None,
    }
    if pending is None or held < p.dwell_weeks or pending_weeks < p.confirm_weeks:
        return state
    state.update(
        {
            "call": pending,
            "since": day,
            "weeks_in_call": 0,
            "pending": None,
            "pending_weeks": 0,
            "change": {"day": day, "from": call, "to": pending, "trigger": "rule", "votes": snapshot},
        }
    )
    return state


# --------------------------------------------------------------------------
# levels
# --------------------------------------------------------------------------

def build_zones(
    call: str,
    price: dict[str, float],
    *,
    day: str,
    analyst_target: float | None = None,
    params: Params = DEFAULT_PARAMS,
) -> dict[str, Any]:
    """Add/trim levels from a real level inside a volatility band, rebuilt from
    this close every run.

    ``price`` is ``call_factors.PriceSeries.features``: price, sigma_daily,
    sma_50, sma_200, high_252, low_20, ret_1m.

    Invariants: with ``entry_state`` "wait_for_pullback" the add level is
    below the close; with "in_zone" it is at or above it; every trim level is
    above the close.
    """
    p = params
    spot = price["price"]
    sigma_month = price["sigma_daily"] * math.sqrt(21)
    sigma_quarter = price["sigma_daily"] * math.sqrt(63)
    zones: dict[str, Any] = {
        "anchored_on": day,
        "anchor_price": round(spot, 4),
        "sigma_month_pct": round(100 * sigma_month, 2),
        "review_on": add_sessions(day, p.review_sessions),
    }

    if call != TRIM:
        month_return = _num(price.get("ret_1m")) or 0.0
        if month_return <= -p.pullback_sigma * sigma_month:
            # The pullback has already happened: the entry is here, with a
            # little room above so a normal day does not flip it in and out.
            level = spot * (1 + 0.15 * sigma_month)
            name = f"it has already fallen {abs(100 * month_return):.0f}% in a month, more than a normal pullback"
            zones["entry_state"] = "in_zone"
        else:
            low = spot * (1 - p.add_band_sigma[1] * sigma_month)
            high = spot * (1 - p.add_band_sigma[0] * sigma_month)
            candidates = [
                (price.get("sma_50"), "its 50-day average"),
                (price.get("low_20"), "its 20-day low"),
                (price.get("sma_200"), "its 200-day average"),
            ]
            inside = [(level, name) for level, name in candidates if level and low <= level <= high]
            if inside:
                level, name = max(inside)
            else:
                level, name = spot * (1 - p.add_fallback_sigma * sigma_month), "three quarters of a normal month's swing below the latest close"
            zones["entry_state"] = "wait_for_pullback"
        zones["accumulate_below"] = round_level_toward(level, up=zones["entry_state"] == "in_zone")
        zones["add_anchor"] = name

        low = spot * (1 + p.trim_band_sigma[0] * sigma_quarter)
        high = spot * (1 + p.trim_band_sigma[1] * sigma_quarter)
        target = _num(analyst_target)
        if target and low <= target <= high:
            level, name = target, "the average analyst target"
        elif price.get("high_252") and low <= price["high_252"] <= high:
            level, name = price["high_252"], "its 52-week high"
        else:
            level, name = spot * (1 + p.trim_fallback_sigma * sigma_quarter), "one normal quarter's swing above the latest close"
        zones["trim_above"] = round_level_toward(level, up=True)
        zones["trim_anchor"] = name
    else:
        # A low-ranked name: say where a bounce is a chance to cut, not where to buy.
        ceiling = spot * (1 + 1.5 * sigma_month)
        above = [
            (level, name)
            for level, name in ((price.get("sma_50"), "its 50-day average"), (price.get("sma_200"), "its 200-day average"))
            if level and spot * (1 + 0.5 * sigma_month) <= level <= ceiling
        ]
        if above:
            level, name = min(above)
        else:
            level, name = spot * (1 + 0.5 * sigma_month), "half a normal month's swing above the latest close"
        zones["trim_above"] = round_level_toward(level, up=True)
        zones["trim_anchor"] = name
        zones["entry_state"] = "no_entry"
    # Belt and braces for prices so small that three figures cannot separate them.
    add = zones.get("accumulate_below")
    if add is not None and zones["entry_state"] == "wait_for_pullback" and add >= spot:
        zones["accumulate_below"] = round(spot * (1 - 0.001), 6)
    if add is not None and zones["entry_state"] == "in_zone" and add < spot:
        zones["accumulate_below"] = round(spot * (1 + 0.001), 6)
    if zones["trim_above"] <= spot:
        zones["trim_above"] = round(spot * 1.001, 6)
    return zones


def entry_state_at(zones: dict[str, Any], price: float | None) -> str | None:
    """The entry state at another price (a live quote): never contradicts it."""
    state = zones.get("entry_state")
    add = _num(zones.get("accumulate_below"))
    if state == "no_entry" or price is None or not add:
        return state
    return "in_zone" if price <= add else "wait_for_pullback"


# --------------------------------------------------------------------------
# explanation: scorecard text, reasons, confidence, what would change it
# --------------------------------------------------------------------------

def family_text(family: str, entry: dict[str, Any], group: str) -> str:
    label = FAMILY_LABELS[family]
    if entry.get("status") != "scored":
        return f"{label}: {entry.get('reason') or 'not scored.'}"
    if family == "insider":
        buyers = int(entry.get("buyers_90d") or 0)
        if entry.get("vote") == 1:
            return f"{label}: {buyers} insiders bought shares in the last 90 days."
        return f"{label}: no cluster of insider buying in the last 90 days (neutral)."
    side = "top third" if entry["vote"] == 1 else "bottom third" if entry["vote"] == -1 else "middle third"
    return f"{label}: {ordinal(entry['percentile'])} percentile in its peer group ({group or 'all covered stocks'}), {side}."


def scorecard(families: dict[str, dict[str, Any]], group: str, params: Params = DEFAULT_PARAMS) -> list[dict[str, Any]]:
    """Every family, in a fixed order, as it should be shown."""
    votes = tally(families)
    weight = 1.0 / votes["scored"] if votes["scored"] else 0.0
    rows = []
    for family in FAMILY_ORDER:
        entry = families.get(family) or {"status": "no_data", "reason": "No data."}
        row: dict[str, Any] = {
            "family": family,
            "label": FAMILY_LABELS[family],
            "means": FAMILY_MEANS[family],
            "status": entry.get("status"),
            "text": family_text(family, entry, group),
        }
        if entry.get("status") == "scored":
            row.update(
                {
                    "percentile": entry.get("percentile"),
                    "vote": entry.get("vote", 0),
                    # each scored family counts the same: its share of the call
                    "weight": round(weight, 4),
                    "members": [
                        {"factor": name, "label": FACTOR_LABELS.get(name, name), "percentile": pct}
                        for name, pct in (entry.get("members") or {}).items()
                    ],
                }
            )
            if family == "insider":
                row["buyers_90d"] = entry.get("buyers_90d")
            if entry.get("note"):
                row["note"] = entry["note"]
        else:
            row["reason"] = entry.get("reason")
        rows.append(row)
    return rows


def top_reasons(call: str, families: dict[str, dict[str, Any]], group: str, limit: int = 3) -> list[dict[str, Any]]:
    """The families behind the call: those voting its way (both ways for HOLD)."""
    scored = [(family, families[family]) for family in FAMILY_ORDER if (families.get(family) or {}).get("status") == "scored"]
    if call == ADD:
        chosen = [(f, e) for f, e in scored if e["vote"] == 1]
    elif call == TRIM:
        chosen = [(f, e) for f, e in scored if e["vote"] == -1]
    else:
        chosen = [(f, e) for f, e in scored if e["vote"] != 0] or scored
    chosen.sort(key=lambda item: -abs((item[1].get("percentile") if item[1].get("percentile") is not None else 50.0) - 50.0))
    out = []
    for family, entry in chosen[:limit]:
        pct = entry.get("percentile")
        out.append(
            {
                "family": family,
                "label": FAMILY_LABELS[family],
                "rank_pct": pct,
                "vote": entry.get("vote", 0),
                "direction": "up" if entry.get("vote") == 1 else "down" if entry.get("vote") == -1 else "flat",
                "text": family_text(family, entry, group),
            }
        )
    return out


def trend_view(price: dict[str, float]) -> dict[str, Any]:
    close, average = float(price["price"]), _num(price.get("sma_200"))
    up = bool(average) and close >= average
    out: dict[str, Any] = {"up": up, "close": round(close, 4), "sma_200": round(average, 4) if average else None}
    if average:
        gap = (close / average - 1) * 100
        out["text"] = f"The price is {abs(gap):.0f}% {'above' if up else 'below'} its 200-day average of {_money(average)}."
    else:
        out["text"] = "Not enough price history for a 200-day average."
    return out


def confidence(call: str, votes: dict[str, int]) -> dict[str, Any]:
    """How many scored families back the call. Not a probability of being right."""
    pos, neg, n = votes["for"], votes["against"], votes["scored"]
    if call in (ADD, TRIM):
        backing, against = (pos, neg) if call == ADD else (neg, pos)
        label = "high" if backing >= 4 and against == 0 else "medium" if backing >= 3 and against <= 1 else "low"
        text = f"{backing} of {n} scored families back the call and {against} point the other way."
        value = backing / n if n else 0.0
    else:
        strongest = max(pos, neg)
        label = "high" if strongest <= 1 else "medium" if strongest == 2 else "low"
        text = f"{pos} of {n} scored families point up and {neg} point down, which is not enough agreement for ADD or TRIM."
        value = 1 - strongest / n if n else 0.0
    return {"label": label, "value": round(value, 3), "for": pos, "against": neg, "scored": n, "text": text}


def what_would_change(state: dict[str, Any], trend: dict[str, Any], params: Params = DEFAULT_PARAMS) -> list[dict[str, Any]]:
    """Statements generated from the rule itself."""
    p = params
    call = state["call"]
    votes = state["votes"]
    pos, neg = votes["for"], votes["against"]
    average = trend.get("sma_200")
    items: list[dict[str, Any]] = []
    if call in (ADD, TRIM):
        side, other = (pos, neg) if call == ADD else (neg, pos)
        top = "top" if call == ADD else "bottom"
        items.append(
            {
                "kind": "rule",
                "to": HOLD,
                "text": (
                    f"Moves to HOLD if fewer than {p.keep_votes} families stay in the {top} third of their peers "
                    f"(now {side}) or more than {p.max_against} lands on the other side (now {other})."
                ),
            }
        )
    else:
        for to, need, against, gate_ok, gate_word in (
            (ADD, p.enter_votes - pos, neg, bool(trend.get("up")), "above"),
            (TRIM, p.enter_votes - neg, pos, not trend.get("up"), "below"),
        ):
            side = "top" if to == ADD else "bottom"
            parts = []
            if need > 0:
                parts.append(f"{need} more {'family reaches' if need == 1 else 'families reach'} the {side} third of the peers")
            if against > p.max_against:
                parts.append(f"{against - p.max_against} of the {against} families on the other side move to the middle")
            item: dict[str, Any] = {"kind": "rule", "to": to}
            if not gate_ok and average:
                parts.append(f"the price closes {gate_word} its 200-day average (about {_money(round_level(average))})")
                item["price_level"] = round_level(average)
            if not parts:
                parts.append("the agreement holds for two weekly checks in a row")
            item["text"] = f"Moves to {to.upper()} if " + ", and ".join(parts) + "."
            items.append(item)
    pending = state.get("pending")
    if pending in (ADD, HOLD, TRIM) and pending != call:
        left = max(0, p.confirm_weeks - int(state.get("pending_weeks", 0)))
        held_left = max(0, p.dwell_weeks - int(state.get("weeks_in_call", 0)))
        wait = max(left, held_left)
        items.insert(
            0,
            {
                "kind": "pending",
                "to": pending,
                "text": f"A move to {pending.upper()} is pending: it happens if the rule still points there at the next {_plural(wait, 'weekly check') if wait > 1 else 'weekly check'}.",
                "weeks_left": wait,
            },
        )
    items.append(
        {
            "kind": "data",
            "text": "Family rankings move when new filings arrive or peers' numbers change; a lower price also lifts the value ranking.",
        }
    )
    wait = max(0, p.dwell_weeks - int(state.get("weeks_in_call", 0)))
    if wait:
        items.append(
            {
                "kind": "dwell",
                "text": f"The call is re-checked once a week and is held for at least {_plural(wait, 'more week')}.",
                "weeks_left": wait,
                "earliest_routine_change": add_sessions(str(state["day"]), 5 * wait),
            }
        )
    else:
        items.append({"kind": "cadence", "text": "The call is re-checked once a week; a change has to show on two checks in a row."})
    return items


def change_reason(change: dict[str, Any], families: dict[str, dict[str, Any]]) -> str:
    """Plain sentence for the change log."""
    if change.get("trigger") == "initial" or change.get("from") is None:
        return "First call from the engine."
    votes = change.get("votes") or {}
    to = str(change.get("to"))
    if to == ADD:
        names = [FAMILY_LABELS[f].lower() for f in FAMILY_ORDER if (families.get(f) or {}).get("vote") == 1]
        return f"Moved to ADD: {', '.join(names)} rank in the top third of their peers ({votes.get('against', 0)} against) and the price is above its 200-day average."
    if to == TRIM:
        names = [FAMILY_LABELS[f].lower() for f in FAMILY_ORDER if (families.get(f) or {}).get("vote") == -1]
        return f"Moved to TRIM: {', '.join(names)} rank in the bottom third of their peers ({votes.get('for', 0)} for) and the price is below its 200-day average."
    was = str(change.get("from")).upper()
    return f"Moved from {was} to HOLD: the families no longer agree enough ({votes.get('for', 0)} for, {votes.get('against', 0)} against, of {votes.get('scored', 0)})."


# --------------------------------------------------------------------------
# one-call entry point for the scoring job
# --------------------------------------------------------------------------

def horizon_for(call: str) -> dict[str, Any]:
    sessions = int(EVIDENCE.get("horizon_sessions") or 126)
    months = max(1, round(sessions / 21))
    if call == HOLD:
        return {"horizon": "weeks", "horizon_label": "until the weekly re-check moves it", "horizon_sessions": 5}
    return {"horizon": "months", "horizon_label": f"about {months} months", "horizon_sessions": sessions}


ACTION = {
    ADD: "Most of its measured families rank in the top third of similar companies and the price trend agrees.",
    HOLD: "Its measured families do not agree enough for ADD or TRIM.",
    TRIM: "Most of its measured families rank in the bottom third of similar companies and the price trend agrees.",
}

LEGACY_LABELS = {"add_now": "Accumulate now", "add_pullback": "Accumulate on pullbacks", HOLD: "Hold here", TRIM: "Do not add here"}


def build_call(
    *,
    day: str,
    model: str,
    group: str,
    families: dict[str, dict[str, Any]],
    price: dict[str, float],
    universe_size: int,
    previous: dict[str, Any] | None = None,
    analyst_target: float | None = None,
    params: Params = DEFAULT_PARAMS,
) -> dict[str, Any]:
    """This close's call for one stock.

    ``families`` is the stock's ``family_scores`` entry. ``previous`` is the
    object this function returned last time (stored in ``tm_call_engine_state``);
    state from another engine version is ignored.
    """
    day = day[:10]
    prev_state = (previous or {}).get("state") if isinstance(previous, dict) and previous.get("version") == ENGINE_VERSION else None
    if prev_state is None:
        previous = None
    votes = tally(families)
    trend = trend_view(price)
    state = advance(prev_state, day=day, votes=votes, trend_up=trend["up"], params=params)
    call = state["call"]
    change = state.pop("change", None)

    log = list((previous or {}).get("change_log") or [])
    if change:
        change["reason"] = change_reason(change, families)
        log.append(change)

    zones = build_zones(call, price, day=day, analyst_target=analyst_target, params=params)
    horizon = horizon_for(call)
    since = str(state["since"])
    review_on = add_sessions(since, horizon["horizon_sessions"])
    while review_on <= day:
        review_on = add_sessions(review_on, horizon["horizon_sessions"])
    card = scorecard(families, group, params)
    scored = [row for row in card if row["status"] == "scored"]
    applicable = [row for row in card if row["status"] != "not_scored"]
    return {
        "version": ENGINE_VERSION,
        "basis": BASIS,
        "rule": RULE_TEXT,
        "evidence": {key: EVIDENCE.get(key) for key in ("summary", "limits")},
        "as_of": day,
        "call": call,
        "since": since,
        "model": model,
        "model_label": MODEL_LABELS.get(model, model),
        "peer_group": group,
        "families": card,
        "votes": votes,
        "trend": trend,
        # net agreement on a -100..+100 scale: (for - against) / scored
        "score": round(100.0 * (votes["for"] - votes["against"]) / votes["scored"], 1) if votes["scored"] else 0.0,
        "coverage": round(len(scored) / len(applicable), 3) if applicable else 0.0,
        "universe_size": int(universe_size),
        "confidence": confidence(call, votes),
        **horizon,
        "review_on": review_on,
        "zones": zones,
        "reasons": top_reasons(call, families, group),
        # today's votes: on a mid-week rerun the call is the week's, the scorecard is today's
        "what_would_change": what_would_change({**state, "votes": votes}, trend, params),
        "changed": bool(change) and change.get("from") is not None,
        "change": change,
        "change_log": log[-12:],
        "state": state,
        "params": asdict(params),
    }


def _setup_word(card: list[dict[str, Any]], family: str, words: tuple[str, str, str]) -> str:
    """A family's vote as a word (top / middle / bottom third), or not_scored."""
    row = next((item for item in card if item.get("family") == family), None)
    if not row or row.get("status") != "scored":
        return "not_scored"
    return words[0] if row.get("vote") == 1 else words[2] if row.get("vote") == -1 else words[1]


def to_directive_v2(call: dict[str, Any], live_price: float | None = None) -> dict[str, Any]:
    """The engine's call in the shape every existing reader already understands.

    ADD maps to "Accumulate now" or "Accumulate on pullbacks" by the live price
    against the add level, HOLD to "Hold here" and TRIM to "Do not add here".
    ``setup.valuation`` and ``setup.quality`` come from the value and quality
    families (their third among peers), never a placeholder.
    """
    kind = call["call"]
    zones = call.get("zones") or {}
    price = _num(live_price) or _num(zones.get("anchor_price")) or 0.0
    add = _num(zones.get("accumulate_below"))
    trim = _num(zones.get("trim_above"))
    stance = {ADD: "accumulate", HOLD: "hold", TRIM: "trim"}[kind]
    entry = entry_state_at(zones, price or None)
    execution = "do_not_chase" if kind == TRIM else "pullback" if (kind == ADD and entry == "wait_for_pullback") else "now"
    if kind == ADD:
        label = LEGACY_LABELS["add_pullback" if execution == "pullback" else "add_now"]
    else:
        label = LEGACY_LABELS[kind]
    votes = call.get("votes") or {}
    summary = f"{ACTION[kind]} {votes.get('for', 0)} of {votes.get('scored', 0)} families point up, {votes.get('against', 0)} point down."
    if kind == ADD and add:
        summary += f" The add level is {_money(add)} ({zones.get('add_anchor')})."
    elif kind == TRIM and trim:
        summary += f" The level to reduce into is {_money(trim)} ({zones.get('trim_anchor')})."
    change = call.get("change") or {}
    changers = [item["text"] for item in call.get("what_would_change") or [] if item.get("kind") == "rule"]
    legacy_zones = {key: zones[key] for key in ("accumulate_below", "trim_above") if isinstance(zones.get(key), (int, float))}
    card = call.get("families") or []
    trend_up = (call.get("trend") or {}).get("up")
    return {
        "version": call["version"],
        "stance": stance,
        "execution": execution,
        "horizon": call["horizon"],
        "confidence": call["confidence"]["label"],
        "action": {"label": label, "summary": summary},
        "zones": legacy_zones,
        "setup": {
            "valuation": _setup_word(card, "value", ("cheap_vs_peers", "in_line_with_peers", "expensive_vs_peers")),
            "quality": _setup_word(card, "quality", ("strong_vs_peers", "in_line_with_peers", "weak_vs_peers")),
            "trend": "uptrend" if trend_up else "downtrend" if trend_up is False else "neutral",
            "catalyst_state": "quiet",
            "sector_state": "neutral",
            "risk_reward": "favorable" if kind == ADD else "unfavorable" if kind == TRIM else "balanced",
        },
        "evidence": [{"type": "driver" if item.get("vote", 0) >= 0 else "risk", "text": item["text"]} for item in call.get("reasons") or []],
        "watch_out": changers[0] if changers else "",
        "invalidation": changers[0] if changers else "",
        "changed_from_previous": bool(call.get("changed")),
        "change_reason": str(change.get("reason") or "") if call.get("changed") else "",
    }
