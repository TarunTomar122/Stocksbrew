"""Factor library for the call engine: point-in-time inputs, raw factor values
and cross-sectional scoring.

The same functions feed the research/backtest script and the daily scoring job,
so what was tested is what runs.

* ``Fundamentals`` answers "what did the filings say as of this day" from a
  ``tm_fundamentals_pit`` document (see ``agentdata/sec_fundamentals.py``).
  Only facts filed on or before the day are used.
* ``PriceSeries`` gives price-derived inputs at any index from prefix sums.
* ``raw_factors`` turns both into raw values where HIGHER IS BETTER for every
  factor (the sign of "bad" factors such as asset growth is already flipped).
* ``rank_scores`` ranks a factor within sector and maps it to [-1, 1]. Ranks
  are used instead of raw values, so outliers cannot dominate.

Standard library only.
"""

from __future__ import annotations

import math
from bisect import bisect_left, bisect_right
from collections import deque
from datetime import date
from typing import Any, Iterable

FLOW_CONCEPTS = ("revenue", "cost_of_revenue", "gross_profit", "operating_income", "net_income", "operating_cash_flow", "capex")
STOCK_CONCEPTS = ("assets", "equity", "shares_cover")
SHARES_MAX_AGE_DAYS = 400

# Every candidate that was tested. Which ones the engine uses, and in which
# family, is fixed in call_engine.FAMILIES.
FACTOR_LABELS: dict[str, str] = {
    "momentum_12_1": "12-month price momentum, skipping the last month",
    "residual_momentum": "12-month momentum after removing the market's effect",
    "high_52w": "closeness to the 52-week high",
    "low_volatility": "low price volatility over the past year",
    "low_beta": "low sensitivity to the market",
    "reversal_1m": "weak last month (short-term reversal)",
    "gross_profitability": "gross profit relative to assets",
    "operating_profitability": "operating profit relative to assets",
    "return_on_equity": "profit relative to shareholders' equity",
    "earnings_yield": "earnings relative to the share price",
    "fcf_yield": "free cash flow relative to the share price",
    "sales_yield": "sales relative to the share price",
    "book_yield": "book value relative to the share price",
    "value_vs_history": "cheaper than its own five-year average on earnings",
    "low_asset_growth": "slow growth in total assets",
    "low_net_issuance": "few new shares issued (or shares bought back)",
    "low_accruals": "profits backed by cash rather than accounting accruals",
    "earnings_surprise": "latest quarter's profit versus a year earlier (standardised)",
    "earnings_reaction": "price reaction to the latest earnings report",
    "insider_buying": "several insiders buying shares",
    # For banks, brokers, insurers and property companies (call engine v3).
    "return_on_assets": "profit relative to total assets",
    "equity_to_assets": "shareholders' equity relative to total assets (less leverage)",
    "book_value_growth": "growth in book value per share over the past year",
    "earnings_stability": "steadiness of quarterly profit over the past two years",
    "cash_return_on_assets": "operating cash flow relative to total assets",
    "cash_flow_yield": "operating cash flow relative to the share price",
}

# Which factor set applies, by SEC industry code. Banks, brokers, insurers and
# REITs have balance sheets where the industrial factors (gross margin, cash
# flow versus profit) measure the business model rather than its quality.
STANDARD, FINANCIAL, REIT, FUND = "standard", "financial", "reit", "fund"
# Commodity trusts, funds and blank-check companies file with the SEC but are
# not operating companies: no factor set describes them.
FUND_SICS = frozenset({6221, 6722, 6726, 6770})


def factor_model(sic: str | int | None) -> str:
    """standard | financial (SIC 6000-6499: banks, lenders, brokers, insurers)
    | reit (SIC 6798) | fund (commodity trusts, funds, blank checks: not scored)."""
    try:
        code = int(str(sic or "").strip()[:4])
    except ValueError:
        return STANDARD
    if code in FUND_SICS:
        return FUND
    if code == 6798:
        return REIT
    if 6000 <= code <= 6499:
        return FINANCIAL
    return STANDARD


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b[:10]) - date.fromisoformat(a[:10])).days


def _clean(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


# --------------------------------------------------------------------------
# point-in-time fundamentals
# --------------------------------------------------------------------------

def ttm(rows: list[list[Any]]) -> tuple[float, str] | None:
    """Trailing-twelve-month value and its period end from flow facts.

    ``rows`` are ``[start, end, value, filed]`` already limited to what was
    known. Uses the latest annual figure when it is the newest period;
    otherwise annual + this year's year-to-date - last year's year-to-date;
    otherwise the last four quarters.
    """
    rows = [row for row in rows if row[0] and row[1]]
    if not rows:
        return None
    end = max(row[1] for row in rows)
    at_end = sorted((row for row in rows if row[1] == end), key=lambda row: _days(row[0], row[1]))
    current = at_end[-1]
    duration = _days(current[0], end)
    if 350 <= duration <= 380:
        return float(current[2]), end
    if duration < 350:
        annual = [row for row in rows if 350 <= _days(row[0], row[1]) <= 380 and abs(_days(row[1], current[0])) <= 10]
        prior = [row for row in rows if abs(_days(row[0], row[1]) - duration) <= 10 and abs(_days(row[1], end) - 365) <= 12]
        if annual and prior:
            return float(annual[-1][2]) + float(current[2]) - float(prior[-1][2]), end
    quarters: dict[str, float] = {}
    for row in rows:
        if 80 <= _days(row[0], row[1]) <= 100:
            quarters[row[1]] = float(row[2])
    ends = sorted(quarters)[-4:]
    if len(ends) == 4 and ends[-1] == end and 255 <= _days(ends[0], ends[-1]) <= 290:
        return sum(quarters[item] for item in ends), end
    return None


def quarterly_series(rows: list[list[Any]]) -> dict[str, tuple[float, str]]:
    """Quarter end -> (value, filed). Q4 is the annual figure minus nine months."""
    out: dict[str, tuple[float, str]] = {}
    annual, nine = [], {}
    for row in rows:
        if not row[0]:
            continue
        duration = _days(row[0], row[1])
        if 80 <= duration <= 100:
            out.setdefault(row[1], (float(row[2]), row[3]))
        elif 350 <= duration <= 380:
            annual.append(row)
        elif 260 <= duration <= 285:
            nine[row[0]] = row
    for row in annual:
        ytd = nine.get(row[0])
        if ytd and row[1] not in out:
            out[row[1]] = (float(row[2]) - float(ytd[2]), max(row[3], ytd[3]))
    return out


class Fundamentals:
    """What one company's filings said as of a given day."""

    def __init__(self, doc: dict[str, Any] | None) -> None:
        doc = doc if isinstance(doc, dict) else {}
        facts = doc.get("facts") if isinstance(doc.get("facts"), dict) else {}
        self.facts: dict[str, list[list[Any]]] = {name: sorted(rows, key=lambda row: row[3]) for name, rows in facts.items() if rows}
        self.earnings_dates: list[str] = sorted(str(item)[:10] for item in doc.get("earnings_dates") or [])
        self.sic = str(doc.get("sic") or "")
        self._filed = sorted({row[3] for rows in self.facts.values() for row in rows})
        self._cache: dict[int, dict[str, Any] | None] = {}
        self._quarterly_income = quarterly_series(self.facts.get("net_income", []))

    def _known(self, concept: str, cutoff: str) -> list[list[Any]]:
        rows = self.facts.get(concept) or []
        return rows[: bisect_right([row[3] for row in rows], cutoff)]

    def as_of(self, day: str) -> dict[str, Any] | None:
        """Trailing values known on ``day``; None before the first filing."""
        index = bisect_right(self._filed, day[:10])
        if index == 0:
            return None
        if index not in self._cache:
            self._cache[index] = self._build(self._filed[index - 1])
        return self._cache[index]

    def _latest_stock(self, concept: str, cutoff: str) -> tuple[float, str] | None:
        rows = self._known(concept, cutoff)
        if not rows:
            return None
        row = max(rows, key=lambda item: (item[1], item[3]))
        return float(row[2]), row[1]

    def _stock_near(self, concept: str, cutoff: str, target_end: str, tolerance: int = 25) -> float | None:
        best = None
        for row in self._known(concept, cutoff):
            gap = abs(_days(row[1], target_end))
            if gap <= tolerance and (best is None or gap < best[0]):
                best = (gap, float(row[2]))
        return best[1] if best else None

    def _build(self, cutoff: str) -> dict[str, Any]:
        out: dict[str, Any] = {"filed": cutoff}
        period_end = ""
        for concept in FLOW_CONCEPTS:
            value = ttm(self._known(concept, cutoff))
            if value:
                out[concept] = value[0]
                if concept in ("revenue", "net_income"):
                    period_end = max(period_end, value[1])
        if "gross_profit" not in out and "revenue" in out and "cost_of_revenue" in out:
            out["gross_profit"] = out["revenue"] - out["cost_of_revenue"]
        out["period_end"] = period_end
        for concept in ("assets", "equity"):
            latest = self._latest_stock(concept, cutoff)
            if latest:
                out[concept] = latest[0]
                target = date.fromordinal(date.fromisoformat(latest[1]).toordinal() - 365).isoformat()
                previous = self._stock_near(concept, cutoff, target)
                if previous is not None:
                    out[f"{concept}_year_ago"] = previous
        shares = self._latest_stock("shares_cover", cutoff)
        # Multi-class issuers (V, MA, BRK.B, F, CMCSA, ...) stop reporting the
        # undimensioned cover-page count, so the "latest" one can be a decade
        # old. Past ~13 months it is not today's share count: fall back.
        if shares and _days(shares[1], cutoff) > SHARES_MAX_AGE_DAYS:
            shares = None
        if shares and shares[0] > 0:
            out["shares"] = shares[0]
            out["shares_date"] = shares[1]
            target = date.fromordinal(date.fromisoformat(shares[1]).toordinal() - 365).isoformat()
            previous = self._stock_near("shares_cover", cutoff, target, tolerance=50)
            if previous:
                out["shares_year_ago"] = previous
        else:
            # Weighted-average diluted shares from the income statement as a fallback.
            rows = [row for row in self._known("shares_diluted", cutoff) if row[0] and _days(row[0], row[1]) <= 100]
            if rows:
                row = max(rows, key=lambda item: item[1])
                out["shares"] = float(row[2])
                out["shares_date"] = row[1]
        out.update(self._surprise(cutoff))
        spread = self._income_spread(cutoff)
        if spread is not None:
            out["net_income_quarter_std"] = spread
        return out

    def _income_spread(self, cutoff: str, quarters: int = 8, minimum: int = 6) -> float | None:
        """Sample standard deviation of the last ``quarters`` quarterly profits
        known on ``cutoff`` (at least ``minimum`` of them, all within about
        two and a half years of the latest)."""
        known = sorted((end, value) for end, (value, filed) in self._quarterly_income.items() if filed <= cutoff)[-quarters:]
        if not known:
            return None
        latest = known[-1][0]
        values = [value for end, value in known if _days(end, latest) <= 900]
        if len(values) < minimum:
            return None
        mean = sum(values) / len(values)
        return math.sqrt(sum((value - mean) ** 2 for value in values) / (len(values) - 1))

    def _surprise(self, cutoff: str) -> dict[str, Any]:
        """Seasonal-random-walk surprise: this quarter's profit minus the same
        quarter a year earlier, divided by the spread of the previous eight
        such changes."""
        known = sorted((end, value) for end, (value, filed) in self._quarterly_income.items() if filed <= cutoff)
        if len(known) < 9:
            return {}
        by_end = dict(known)
        ends = [end for end, _ in known]

        def change(end: str) -> float | None:
            for other in ends:
                if abs(_days(other, end) - 365) <= 12:
                    return by_end[end] - by_end[other]
            return None

        changes = [(end, change(end)) for end in ends]
        changes = [(end, value) for end, value in changes if value is not None]
        if len(changes) < 5:
            return {}
        latest_end, latest = changes[-1]
        history = [value for _, value in changes[-9:-1]]
        if len(history) < 4:
            return {}
        mean = sum(history) / len(history)
        spread = math.sqrt(sum((value - mean) ** 2 for value in history) / (len(history) - 1))
        if spread <= 0:
            return {}
        filed = self._quarterly_income[latest_end][1]
        return {"sue": latest / spread, "sue_filed": filed}

    def last_earnings_date(self, day: str) -> str | None:
        index = bisect_right(self.earnings_dates, day[:10])
        return self.earnings_dates[index - 1] if index else None


# --------------------------------------------------------------------------
# prices
# --------------------------------------------------------------------------

class PriceSeries:
    """Daily closes with O(1) rolling statistics at any index."""

    def __init__(self, dates: list[str], closes: list[float], bench_by_day: dict[str, float] | None = None) -> None:
        pairs = [(str(d)[:10], float(c)) for d, c in zip(dates, closes) if isinstance(c, (int, float)) and c > 0]
        self.dates = [d for d, _ in pairs]
        self.closes = [c for _, c in pairs]
        n = len(self.closes)
        bench = [(bench_by_day or {}).get(d) for d in self.dates]
        self.has_bench = bool(bench_by_day) and all(isinstance(b, (int, float)) and b > 0 for b in bench[-min(n, 300):]) if n else False
        rs = [0.0] * n
        rm = [0.0] * n
        for i in range(1, n):
            rs[i] = math.log(self.closes[i] / self.closes[i - 1])
            a, b = bench[i - 1], bench[i]
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) and a > 0 and b > 0:
                rm[i] = math.log(b / a)
        self._ps = self._prefix(rs)
        self._pss = self._prefix([x * x for x in rs])
        self._pm = self._prefix(rm)
        self._pmm = self._prefix([x * x for x in rm])
        self._psm = self._prefix([x * y for x, y in zip(rs, rm)])
        self._pc = self._prefix(self.closes)
        self._bench = bench
        self._high = self._rolling_max(self.closes, 252)
        self._low20 = self._rolling_min(self.closes, 20)

    @staticmethod
    def _prefix(values: list[float]) -> list[float]:
        out = [0.0] * (len(values) + 1)
        for i, value in enumerate(values):
            out[i + 1] = out[i] + value
        return out

    @staticmethod
    def _rolling_max(values: list[float], window: int) -> list[float]:
        out, queue = [0.0] * len(values), deque()
        for i, value in enumerate(values):
            while queue and values[queue[-1]] <= value:
                queue.pop()
            queue.append(i)
            while queue[0] <= i - window:
                queue.popleft()
            out[i] = values[queue[0]]
        return out

    @staticmethod
    def _rolling_min(values: list[float], window: int) -> list[float]:
        out, queue = [0.0] * len(values), deque()
        for i, value in enumerate(values):
            while queue and values[queue[-1]] >= value:
                queue.pop()
            queue.append(i)
            while queue[0] <= i - window:
                queue.popleft()
            out[i] = values[queue[0]]
        return out

    def index_on(self, day: str, max_stale_days: int = 6) -> int | None:
        """Index of the last close on or before ``day``; None if too stale."""
        i = bisect_right(self.dates, day[:10]) - 1
        if i < 0 or _days(self.dates[i], day) > max_stale_days:
            return None
        return i

    def _window(self, prefix: list[float], start: int, end: int) -> float:
        # sum over indices start..end inclusive
        return prefix[end + 1] - prefix[start]

    def sigma_daily(self, i: int, window: int = 63) -> float | None:
        if i < window:
            return None
        s = self._window(self._ps, i - window + 1, i)
        ss = self._window(self._pss, i - window + 1, i)
        variance = max(0.0, (ss - s * s / window) / (window - 1))
        return max(math.sqrt(variance), 0.12 / math.sqrt(252))

    def sma(self, i: int, window: int) -> float | None:
        if i < window - 1:
            return None
        return self._window(self._pc, i - window + 1, i) / window

    def features(self, i: int) -> dict[str, float] | None:
        """Price inputs at index i, or None with under a year of closes."""
        if i < 252 or i >= len(self.closes):
            return None
        c = self.closes
        n = 252
        start = i - n + 1
        s = self._window(self._ps, start, i)
        ss = self._window(self._pss, start, i)
        var_s = max(1e-12, (ss - s * s / n) / (n - 1))
        out = {
            "price": c[i],
            "momentum_12_1": c[i - 21] / c[i - 252] - 1,
            "ret_1m": c[i] / c[i - 21] - 1,
            "ret_5d": c[i] / c[i - 5] - 1,
            "high_52w": c[i] / self._high[i],
            "high_252": self._high[i],
            "low_20": self._low20[i],
            "vol_252": math.sqrt(var_s * 252),
            "sigma_daily": self.sigma_daily(i) or math.sqrt(var_s),
            "sma_50": self.sma(i, 50) or c[i],
            "sma_200": self.sma(i, 200) or c[i],
        }
        if self.has_bench:
            m = self._window(self._pm, start, i)
            mm = self._window(self._pmm, start, i)
            sm = self._window(self._psm, start, i)
            var_m = (mm - m * m / n) / (n - 1)
            if var_m > 1e-12:
                beta = ((sm - s * m / n) / (n - 1)) / var_m
                resid_var = max(1e-12, var_s - beta * beta * var_m)
                # Residual return over months 12..2, in units of its own noise.
                lo, hi = i - 251, i - 21
                count = hi - lo + 1
                resid = self._window(self._ps, lo, hi) - beta * self._window(self._pm, lo, hi)
                out["beta"] = beta
                out["residual_momentum"] = resid / math.sqrt(resid_var * count)
        return out

    def window_return(self, start_index: int, end_index: int) -> float | None:
        if start_index < 0 or end_index >= len(self.closes) or end_index <= start_index:
            return None
        return self.closes[end_index] / self.closes[start_index] - 1

    def bench_window_return(self, start_index: int, end_index: int) -> float | None:
        if start_index < 0 or end_index >= len(self._bench):
            return None
        a, b = self._bench[start_index], self._bench[end_index]
        if isinstance(a, (int, float)) and isinstance(b, (int, float)) and a > 0 and b > 0:
            return b / a - 1
        return None


def earnings_reaction(prices: PriceSeries, i: int, earnings_date: str | None, max_age_sessions: int = 63) -> float | None:
    """Stock minus benchmark over the two sessions around the report (prior
    close to the close after), once that window has closed and for 63 sessions."""
    if not earnings_date:
        return None
    k = bisect_left(prices.dates, earnings_date)
    if k < 1 or k + 1 > i or i - (k + 1) > max_age_sessions:
        return None
    stock = prices.window_return(k - 1, k + 1)
    bench = prices.bench_window_return(k - 1, k + 1)
    if stock is None:
        return None
    return stock - (bench or 0.0)


# --------------------------------------------------------------------------
# raw factors: higher is better for every one
# --------------------------------------------------------------------------

def raw_factors(
    price: dict[str, float] | None,
    fund: dict[str, Any] | None,
    *,
    market_cap: float | None,
    day: str,
    reaction: float | None = None,
    insider_buyers: int | None = None,
    earnings_yield_history: list[float] | None = None,
) -> dict[str, float]:
    """Raw values for every factor that has data. Missing inputs are omitted,
    never guessed."""
    out: dict[str, float] = {}
    if price:
        out["momentum_12_1"] = price["momentum_12_1"]
        out["high_52w"] = price["high_52w"]
        out["low_volatility"] = -price["vol_252"]
        out["reversal_1m"] = -price["ret_1m"]
        if "residual_momentum" in price:
            out["residual_momentum"] = price["residual_momentum"]
            out["low_beta"] = -price["beta"]
    if reaction is not None:
        out["earnings_reaction"] = reaction
    if insider_buyers is not None:
        out["insider_buying"] = float(min(insider_buyers, 4))
    if not fund:
        return out
    # Filings older than ~7 months are stale: the company stopped filing or the feed broke.
    fresh = bool(fund.get("period_end")) and _days(fund["period_end"], day) <= 215
    assets = _clean(fund.get("assets"))
    equity = _clean(fund.get("equity"))
    income = _clean(fund.get("net_income"))
    if fresh and assets and assets > 0:
        if _clean(fund.get("gross_profit")) is not None:
            out["gross_profitability"] = fund["gross_profit"] / assets
        if _clean(fund.get("operating_income")) is not None:
            out["operating_profitability"] = fund["operating_income"] / assets
        cash_flow = _clean(fund.get("operating_cash_flow"))
        if income is not None and cash_flow is not None:
            out["low_accruals"] = -(income - cash_flow) / assets
        previous = _clean(fund.get("assets_year_ago"))
        if previous and previous > 0:
            out["low_asset_growth"] = -(assets / previous - 1)
    if fresh and income is not None and equity and equity > 0:
        out["return_on_equity"] = income / equity
    if fresh and assets and assets > 0:
        if income is not None:
            out["return_on_assets"] = income / assets
        if equity is not None:
            out["equity_to_assets"] = equity / assets
        cash_flow = _clean(fund.get("operating_cash_flow"))
        if cash_flow is not None:
            out["cash_return_on_assets"] = cash_flow / assets
    spread = _clean(fund.get("net_income_quarter_std"))
    if fresh and spread is not None and equity and equity > 0:
        out["earnings_stability"] = -spread / equity
    equity_before = _clean(fund.get("equity_year_ago"))
    shares_now, shares_before = _clean(fund.get("shares")), _clean(fund.get("shares_year_ago"))
    if fresh and equity and equity > 0 and equity_before and equity_before > 0 and shares_now and shares_before and shares_now > 0 and shares_before > 0:
        # same split guard as net issuance: a jump this size is not issuance
        if abs(math.log(shares_now / shares_before)) <= math.log(1.4):
            out["book_value_growth"] = (equity / shares_now) / (equity_before / shares_before) - 1
    shares, previous_shares = _clean(fund.get("shares")), _clean(fund.get("shares_year_ago"))
    if shares and previous_shares and shares > 0 and previous_shares > 0:
        change = math.log(shares / previous_shares)
        # A jump this size is a split or a merger, not issuance; leave it out.
        if abs(change) <= math.log(1.4):
            out["low_net_issuance"] = -change
    if fresh and market_cap and market_cap > 0:
        if income is not None:
            out["earnings_yield"] = income / market_cap
            history = [value for value in (earnings_yield_history or []) if value is not None]
            if len(history) >= 24:
                ordered = sorted(history)
                out["value_vs_history"] = out["earnings_yield"] - ordered[len(ordered) // 2]
        cash_flow, capex = _clean(fund.get("operating_cash_flow")), _clean(fund.get("capex"))
        if cash_flow is not None:
            out["fcf_yield"] = (cash_flow - abs(capex or 0.0)) / market_cap
        if _clean(fund.get("revenue")):
            out["sales_yield"] = fund["revenue"] / market_cap
        if equity and equity > 0:
            out["book_yield"] = equity / market_cap
        if cash_flow is not None:
            out["cash_flow_yield"] = cash_flow / market_cap
    if fund.get("sue") is not None and fund.get("sue_filed") and _days(fund["sue_filed"], day) <= 100:
        out["earnings_surprise"] = max(-6.0, min(6.0, float(fund["sue"])))
    return out


# --------------------------------------------------------------------------
# cross-sectional scoring
# --------------------------------------------------------------------------

def rank_scores(
    values: dict[str, float],
    sector_of: dict[str, str] | None = None,
    *,
    min_group: int = 8,
) -> dict[str, float]:
    """Rank within sector and map to [-1, 1] (best = +1).

    A stock whose sector has fewer than ``min_group`` names with data is ranked
    against the whole universe instead. Ties share the average rank.
    """
    groups: dict[str, list[str]] = {}
    for symbol in values:
        groups.setdefault((sector_of or {}).get(symbol) or "", []).append(symbol)
    out: dict[str, float] = {}
    leftovers: list[str] = []
    for sector, members in groups.items():
        if not sector or len(members) < min_group:
            leftovers.extend(members)
        else:
            out.update(_rank(members, values))
    if leftovers:
        everyone = _rank(list(values), values)
        for symbol in leftovers:
            out[symbol] = everyone[symbol]
    return out


MIN_PEER_GROUP = 8
MIN_SIZE_HALF = 15


def peer_ranks(
    values: dict[str, float],
    group_of: dict[str, str] | None = None,
    size_of: dict[str, float] | None = None,
    *,
    min_group: int = MIN_PEER_GROUP,
    min_half: int = MIN_SIZE_HALF,
) -> dict[str, float]:
    """Rank within peer group and size, mapped to [-1, 1] (best = +1).

    A peer group with at least ``2 * min_half`` names that have a market cap
    is split at its median market cap and each half is ranked on its own
    (sector x size). Names in it without a market cap are ranked against the
    whole group. A group with fewer than ``2 * min_half`` but at least
    ``min_group`` names is ranked as one; smaller groups and names without a
    group are ranked against everyone in ``values``. Ties share the average rank.
    """
    groups: dict[str, list[str]] = {}
    for symbol in values:
        groups.setdefault((group_of or {}).get(symbol) or "", []).append(symbol)
    sizes = size_of or {}
    out: dict[str, float] = {}
    leftovers: list[str] = []
    for group, members in groups.items():
        if not group or len(members) < min_group:
            leftovers.extend(members)
            continue
        sized = sorted((symbol for symbol in members if (sizes.get(symbol) or 0) > 0), key=lambda symbol: (sizes[symbol], symbol))
        if len(sized) >= 2 * min_half:
            middle = len(sized) // 2
            for half in (sized[:middle], sized[middle:]):
                out.update(_rank(half, values))
            in_halves = set(sized)
            unsized = [symbol for symbol in members if symbol not in in_halves]
            if unsized:
                whole = _rank(members, values)
                for symbol in unsized:
                    out[symbol] = whole[symbol]
        else:
            out.update(_rank(members, values))
    if leftovers:
        everyone = _rank(list(values), values)
        for symbol in leftovers:
            out[symbol] = everyone[symbol]
    return out


def _rank(members: list[str], values: dict[str, float]) -> dict[str, float]:
    ordered = sorted(members, key=lambda symbol: values[symbol])
    n = len(ordered)
    if n == 1:
        return {ordered[0]: 0.0}
    out: dict[str, float] = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and values[ordered[j + 1]] == values[ordered[i]]:
            j += 1
        position = (i + j) / 2
        for k in range(i, j + 1):
            out[ordered[k]] = 2 * (position + 0.5) / n - 1
        i = j + 1
    return out


def percentile_ranks(values: dict[str, float]) -> dict[str, float]:
    """0..100 percentile of each value across the whole universe."""
    return {symbol: 50 * (score + 1) for symbol, score in _rank(list(values), values).items()} if values else {}


def composite(
    scores_by_factor: dict[str, dict[str, float]],
    weights: dict[str, float],
    symbols: Iterable[str],
    *,
    min_coverage: float = 0.5,
) -> dict[str, dict[str, Any]]:
    """Weighted mean of factor scores per stock over the factors it has.

    Returns ``{symbol: {score, coverage, contributions}}`` for stocks with at
    least ``min_coverage`` of the total weight available. ``score`` is in
    [-1, 1]; ``contributions`` add up to it.
    """
    total = sum(weights.values())
    out: dict[str, dict[str, Any]] = {}
    if total <= 0:
        return out
    for symbol in symbols:
        available = 0.0
        acc = 0.0
        parts: dict[str, float] = {}
        for name, weight in weights.items():
            value = scores_by_factor.get(name, {}).get(symbol)
            if value is None:
                continue
            available += weight
            acc += weight * value
            parts[name] = weight * value
        if available / total < min_coverage:
            continue
        out[symbol] = {
            "score": acc / available,
            "coverage": available / total,
            "contributions": {name: value / available for name, value in parts.items()},
            "factors": {name: scores_by_factor[name][symbol] for name in parts},
        }
    return out
