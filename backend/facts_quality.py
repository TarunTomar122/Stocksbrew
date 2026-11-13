"""Plausibility checks for a stock's facts (``tm_stock_facts``), shared by the writer and its readers.

The rule (docs/volaren-parity-hillclimb.md, data conventions): every number is traceable, and the page shows
nothing rather than a wrong number. The facts come from StockAnalysis tables, which are usually right but not
always: around a spin-off, a sale or a restatement the "TTM" growth column can compare this year's company with a
different one (Honeywell, Nov 2026: +80% "sales over four quarters" against +7.8% for fiscal 2025, while the same
table's TTM revenue was 0.8% above fiscal 2025), and a foreign filer's tables are in its own currency (TSMC's
sales in Taiwan dollars printed as "$4.9T").

So the writer (backend/providers/stock_facts_provider.py) checks each figure against the source's own other
tables before it is stored:

* four-quarter sales growth: recomputed from the quarterly table (the last four quarters against the four
  before), see ``check_revenue_growth``. When they agree the source's figure stands; when the quarters are clean,
  add up to the TTM revenue and fit the fiscal years, the quarters' figure replaces it; when they contradict it,
  the figure is withheld. Without a usable quarterly table, the growth must at least fit the fiscal years
  (``annual_bracket_problem``).
* currency: money amounts in another currency are converted to dollars at the day's rate, and per-share
  figures (per ordinary share, not per ADR) are withheld.

A withheld or corrected figure keeps the source's value and the reason in the doc's ``withheld`` list, one record
per figure: ``{field, value, rule, action, reason}`` with the field's dotted path (a list, not a map keyed by the path:
a dotted map key reads as a nested field path to Firestore's merge). The list is for us (the data-quality check,
debugging); readers strip it and never show it.

``guard_facts`` is the reader half: it applies the checks that need nothing but the stored doc, for docs written
before the writer checked (no ``revenue_growth_basis``). lib/facts-guard.ts is the same guard for the web app.

Standard library only.
"""

from __future__ import annotations

import copy
import math
import re
from datetime import date
from typing import Any, Iterable

GROWTH_PATH = "financials.revenue_growth_yoy_pct"

# The source's growth and the quarters' may differ by rounding; beyond the larger of these they disagree.
GROWTH_AGREE_PP = 1.0
GROWTH_AGREE_SHARE = 0.03
# Close enough that a figure which also fits the fiscal years stands (bank revenue lines, a lagging TTM column).
GROWTH_CLOSE_PP = 5.0
GROWTH_CLOSE_SHARE = 0.15
# The last four quarters add up to the TTM revenue within this share: they back the source's figure ...
TTM_SUM_TOLERANCE = 0.05
# ... and within this one they are the same four quarters, so their own growth may replace a figure they contradict.
TTM_SUM_EXACT = 0.01
# The four quarters a year earlier lie between the last two fiscal years' sales (any four consecutive quarters
# cover every season once); lumpy revenue can take them a little outside.
BRACKET_TOLERANCE = 0.15
# Stored sales this many times larger than the source's price-to-sales ratio allows are in another currency.
FOREIGN_RATIO_FACTOR = 4.0
# Quarters must follow each other: period ends 2 to 4 months apart.
QUARTER_GAP_DAYS = (60, 120)

# Money amounts per section, converted together when the source reports in another currency.
MONEY_FIELDS: dict[str, tuple[str, ...]] = {
    "financials": ("revenue", "gross_profit", "operating_income", "net_income", "free_cash_flow"),
    "financial_history": ("revenue", "gross_profit", "operating_income", "net_income", "free_cash_flow"),
    "balance": ("cash_and_investments", "total_debt", "net_cash"),
}
# Per ordinary share in the reporting currency; an ADR can stand for several shares, so no rate makes these right.
PER_SHARE_FIELDS: dict[str, tuple[str, ...]] = {
    "financials": ("eps_diluted",),
    "financial_history": ("eps_diluted",),
}

_UNITS = {"thousands": 1_000.0, "millions": 1_000_000.0, "billions": 1_000_000_000.0}
# "Financials in millions USD." (wide pages) or "Millions USD. Fiscal year" (narrow ones). The currency is matched in
# capitals only, so ordinary words ("billions and more") never read as one.
_UNITS_RES = (
    re.compile(r"[Ff]inancials in (thousands|millions|billions) ([A-Z]{3})\b"),
    re.compile(r"\b(Thousands|Millions|Billions) ([A-Z]{3})\. Fiscal year"),
)
_FY_RE = re.compile(r"^FY\s*(\d{4})$", re.I)


def money(value: float) -> str:
    """1.23B, 45.6M: for the reasons we keep, never for the page."""
    return f"{value / 1e9:.2f}B" if abs(value) >= 1e9 else f"{value / 1e6:.1f}M"


def num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def parse_units(text: str | None) -> tuple[str | None, float | None]:
    """("USD", 1e6) from "Financials in millions USD. Fiscal year is ...". (None, None) when not said."""
    for pattern in _UNITS_RES:
        match = pattern.search(text or "")
        if match:
            return match.group(2), _UNITS[match.group(1).lower()]
    return None, None


def fiscal_years(history: Any) -> dict[int, float]:
    """Revenue per fiscal year ("FY 2025") with a positive figure."""
    years: dict[int, float] = {}
    for row in history if isinstance(history, list) else []:
        if not isinstance(row, dict):
            continue
        match = _FY_RE.match(str(row.get("period") or "").strip())
        revenue = num(row.get("revenue"))
        if match and revenue is not None and revenue > 0:
            years[int(match.group(1))] = revenue
    return years


def annual_bracket_problem(revenue: Any, growth: Any, history: Any) -> str | None:
    """Why a four-quarter growth figure cannot be right given the fiscal years beside it, or None.

    Growth g on TTM revenue R puts the four quarters a year earlier at R / (1 + g). Those quarters end between the
    last two fiscal years' ends, so their sales sit between those years' sales (give or take lumpy quarters).
    """
    revenue, growth = num(revenue), num(growth)
    if revenue is None or growth is None or revenue <= 0 or growth <= -100:
        return None
    years = fiscal_years(history)
    if not years:
        return None
    latest = max(years)
    if latest - 1 not in years:
        return None
    prior = revenue / (1.0 + growth / 100.0)
    low, high = min(years[latest], years[latest - 1]), max(years[latest], years[latest - 1])
    if low * (1 - BRACKET_TOLERANCE) <= prior <= high * (1 + BRACKET_TOLERANCE):
        return None
    year_growth = (years[latest] / years[latest - 1] - 1.0) * 100.0
    return (
        f"{growth:+.1f}% on {money(revenue)} puts the year-earlier four quarters at {money(prior)}, "
        f"outside fiscal {latest - 1} to {latest} ({money(years[latest - 1])} to {money(years[latest])}, "
        f"{year_growth:+.1f}%)"
    )


def _day(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def quarters_growth(quarters: Any, ttm_revenue: Any) -> dict[str, Any]:
    """Four-quarter growth from the quarterly table (newest first): the last four quarters against the four before.

    Returns ``{"growth", "prior", "sum_off", "problem", "kind"}``. ``growth`` is None when the table cannot give one:
    ``kind`` "gap" (too short, a missing or zero quarter, quarters that do not follow each other: says nothing about
    the source's figure; milestone and pre-revenue companies have zero quarters) or "contradiction" (a negative
    quarter: the table itself is broken). ``sum_off`` is how
    far the last four quarters are from the TTM revenue, as a share (None without a TTM revenue).
    """
    out: dict[str, Any] = {"growth": None, "prior": None, "sum_off": None, "problem": None, "kind": None}
    rows = [row for row in quarters if isinstance(row, dict)] if isinstance(quarters, list) else []
    if len(rows) < 8:
        return {**out, "problem": f"only {len(rows)} quarters in the quarterly table", "kind": "gap"}
    eight = rows[:8]
    values = [num(row.get("revenue")) for row in eight]
    missing = [str(row.get("period") or "?") for row, value in zip(eight, values) if value is None]
    if missing:
        return {**out, "problem": f"no sales for {', '.join(missing)} in the quarterly table", "kind": "gap"}
    negative = [f"{row.get('period')} ({money(value)})" for row, value in zip(eight, values) if value is not None and value < 0]
    if negative:
        return {**out, "problem": f"negative quarterly sales: {', '.join(negative)}", "kind": "contradiction"}
    zero = [str(row.get("period") or "?") for row, value in zip(eight, values) if value == 0]
    if zero:
        return {**out, "problem": f"no sales in {', '.join(zero)}", "kind": "gap"}
    ends = [_day(row.get("end")) for row in eight]
    if all(ends):
        for newer, older in zip(ends, ends[1:]):
            gap = (newer - older).days  # type: ignore[operator]
            if not QUARTER_GAP_DAYS[0] <= gap <= QUARTER_GAP_DAYS[1]:
                return {**out, "problem": f"quarters do not follow each other ({older} to {newer})", "kind": "gap"}
    last4 = sum(values[:4])  # type: ignore[arg-type]
    prior4 = sum(values[4:8])  # type: ignore[arg-type]
    ttm = num(ttm_revenue)
    sum_off = abs(last4 / ttm - 1.0) if ttm is not None and ttm > 0 else None
    problem = None
    if sum_off is not None and sum_off > TTM_SUM_TOLERANCE:
        problem = f"the last four quarters add up to {money(last4)}, not the {money(ttm)} TTM revenue (restated or mixed periods)"  # type: ignore[arg-type]
    return {"growth": (last4 / prior4 - 1.0) * 100.0, "prior": prior4, "sum_off": sum_off, "problem": problem, "kind": None}


def _record(source: float, rule: str, action: str, reason: str) -> dict[str, Any]:
    return {"field": GROWTH_PATH, "value": source, "rule": rule, "action": action, "reason": reason}


def check_revenue_growth(financials: dict[str, Any], history: Any, quarters: Any | None) -> dict[str, Any]:
    """The four-quarter growth to store, how it was checked, and what to record if it was changed.

    Returns ``{"value", "basis", "withheld"}``. ``basis`` is "quarters" (the quarterly table backs it, or gave it),
    "fiscal_years" (it fits the fiscal years; the quarterly table could not settle it), "withheld", or None when
    there was no figure. ``withheld`` is the record for the doc's ``withheld`` list, or None when the source's figure
    stands.

    * The quarters agree (within rounding) and add up to the TTM revenue: the source's figure stands.
    * They roughly agree (within 5 points) or only roughly add up, and the figure fits the fiscal years: it stands.
    * The figure does not fit the fiscal years, the quarters add up exactly to the TTM revenue and their own
      figure fits: the quarters' figure replaces it (Dana after a sale: -21.8% against +5.1% from its own quarters).
    * The table has a gap (a missing quarter, a half-year filer): the fiscal years decide, as with no table.
    * Anything else (a broken table, quarters that add up to another company) withholds it.
    """
    source = num(financials.get("revenue_growth_yoy_pct"))
    revenue = num(financials.get("revenue"))
    source_fits = source is not None and annual_bracket_problem(revenue, source, history) is None
    result = quarters_growth(quarters, revenue) if quarters is not None else None
    computed = result["growth"] if result else None
    if result and computed is not None:
        sum_off = result["sum_off"]
        exact = sum_off is not None and sum_off <= TTM_SUM_EXACT
        bracket = annual_bracket_problem(revenue, computed, history)
        if source is None:
            if exact and bracket is None:
                return {"value": round(computed, 2), "basis": "quarters", "withheld": None}
            return {"value": None, "basis": None, "withheld": None}
        diff = abs(computed - source)
        if diff <= max(GROWTH_AGREE_PP, GROWTH_AGREE_SHARE * abs(source)) and result["problem"] is None:
            return {"value": source, "basis": "quarters", "withheld": None}
        if diff <= max(GROWTH_CLOSE_PP, GROWTH_CLOSE_SHARE * abs(source)) and source_fits:
            return {"value": source, "basis": "fiscal_years", "withheld": None}
        # Replace only a figure the fiscal years rule out: when both fit, which one is right cannot be told.
        if exact and bracket is None and not source_fits:
            reason = f"source said {source:+.1f}%, its own last eight quarters say {computed:+.1f}%"
            return {"value": round(computed, 2), "basis": "quarters", "withheld": _record(source, "ttm_growth_vs_quarters", "corrected", reason)}
        reason = result["problem"] or f"source said {source:+.1f}%, its own last eight quarters say {computed:+.1f}%"
        if result["problem"] is None and bracket:
            reason = f"source said {source:+.1f}%, quarters say {computed:+.1f}% but {bracket}"
        return {"value": None, "basis": "withheld", "withheld": _record(source, "ttm_growth_vs_quarters", "withheld", reason)}
    if source is None:
        return {"value": None, "basis": None, "withheld": None}
    if result and result["kind"] == "contradiction":
        return {"value": None, "basis": "withheld", "withheld": _record(source, "ttm_growth_vs_quarters", "withheld", result["problem"])}
    if source_fits:
        return {"value": source, "basis": "fiscal_years", "withheld": None}
    bracket = annual_bracket_problem(revenue, source, history)
    if result and result["problem"]:
        bracket = f"{bracket}; {result['problem']}"
    return {"value": None, "basis": "withheld", "withheld": _record(source, "ttm_growth_vs_fiscal_years", "withheld", bracket or "")}


def _scaled(value: Any, rate: float) -> Any:
    parsed = num(value)
    return round(parsed * rate, 2) if parsed is not None else value


def convert_to_usd(doc: dict[str, Any], currency: str, rate: float | None, *, as_of: str) -> list[dict[str, Any]]:
    """Put a foreign filer's money amounts in dollars, in place; per-share figures are withheld.

    With no rate the amounts are withheld too. Returns the ``withheld`` records to add to the doc's list.
    """
    withheld: list[dict[str, Any]] = []
    usable = rate is not None and math.isfinite(rate) and rate > 0

    def handle(path: str, row: dict[str, Any], keys: Iterable[str], per_share: bool) -> None:
        for key in keys:
            value = num(row.get(key))
            if value is None:
                continue
            if per_share or not usable:
                row[key] = None
                withheld.append({
                    "field": f"{path}.{key}",
                    "value": value,
                    "rule": "reporting_currency",
                    "action": "withheld",
                    "reason": (
                        f"per ordinary share in {currency}; an ADR can stand for several shares"
                        if per_share
                        else f"in {currency} and no {currency}/USD rate today"
                    ),
                })
            else:
                row[key] = _scaled(value, rate)  # type: ignore[arg-type]

    for section in ("financials", "balance"):
        row = doc.get(section)
        if isinstance(row, dict):
            handle(section, row, MONEY_FIELDS[section], False)
            handle(section, row, PER_SHARE_FIELDS.get(section, ()), True)
            # Said on the section itself, so the facts writer stores it even with every amount withheld: the writer
            # keeps the last stored section when a new one has nothing in it (backend/storage.py), which would leave
            # the old amounts in the other currency standing.
            row["reported_currency"] = currency
    history = doc.get("financial_history")
    if isinstance(history, list):
        for row in history:
            if isinstance(row, dict):
                label = str(row.get("period") or "?")
                handle(f"financial_history[{label}]", row, MONEY_FIELDS["financial_history"], False)
                handle(f"financial_history[{label}]", row, PER_SHARE_FIELDS["financial_history"], True)
    for section in ("business_segments", "geographic_mix"):
        mix = doc.get(section)
        if isinstance(mix, dict) and isinstance(mix.get("items"), list):
            if usable:
                for item in mix["items"]:
                    if isinstance(item, dict):
                        item["value"] = _scaled(item.get("value"), rate)  # type: ignore[arg-type]
            else:
                doc[section] = {"period": mix.get("period"), "items": [], "reported_currency": currency}
                withheld.append({"field": section, "value": None, "rule": "reporting_currency", "action": "withheld", "reason": f"in {currency} and no rate"})
    financials = doc.get("financials")
    if isinstance(financials, dict):
        financials["reported_currency"] = currency
        financials["currency"] = "USD" if usable else None
        if usable:
            financials["fx_to_usd"] = rate
            financials["fx_as_of"] = as_of
    return withheld


def foreign_amounts_problem(facts: dict[str, Any]) -> str | None:
    """Why a doc's money amounts look like another currency's, or None.

    For a doc written before the writer read the tables' currency: the source's own price-to-sales ratio against the
    market value over the stored sales. Sales several times too large for the ratio are in a currency worth a
    fraction of a dollar (yuan, Taiwan dollars, rupees, won, kroner, reais).
    """
    financials = facts.get("financials") if isinstance(facts.get("financials"), dict) else {}
    quick = facts.get("quick_stats") if isinstance(facts.get("quick_stats"), dict) else {}
    valuation = facts.get("valuation") if isinstance(facts.get("valuation"), dict) else {}
    revenue, cap, ratio = num(financials.get("revenue")), num(quick.get("market_cap")), num(valuation.get("price_to_sales"))
    if not revenue or not cap or not ratio or revenue <= 0 or cap <= 0 or ratio <= 0:
        return None
    implied = cap / revenue
    if implied * FOREIGN_RATIO_FACTOR >= ratio:
        return None
    return f"market value over stored sales is {implied:.3g}x but the source's price-to-sales is {ratio:.3g}x"


def withhold_amounts(facts: dict[str, Any]) -> dict[str, Any]:
    """A copy with every money amount and per-share figure taken out (growth and margins are unit-free and stay)."""
    out = dict(facts)
    for section in ("financials", "balance"):
        row = out.get(section)
        if isinstance(row, dict):
            keys = (*MONEY_FIELDS[section], *PER_SHARE_FIELDS.get(section, ()))
            out[section] = {**row, **{key: None for key in keys if key in row}}
    history = out.get("financial_history")
    if isinstance(history, list):
        keys = (*MONEY_FIELDS["financial_history"], *PER_SHARE_FIELDS["financial_history"])
        out["financial_history"] = [
            {**row, **{key: None for key in keys if key in row}} if isinstance(row, dict) else row for row in history
        ]
    return out


def guard_facts(facts: dict[str, Any] | None) -> dict[str, Any] | None:
    """The facts as a reader may use them. Never mutates the input.

    The ``withheld`` list is removed. A doc the writer did not check (no ``revenue_growth_basis``) also loses a
    four-quarter growth that cannot fit its own fiscal years, and its money amounts when they look like another
    currency's. lib/facts-guard.ts is the same guard for the web app.
    """
    if not isinstance(facts, dict):
        return facts
    out = copy.copy(facts)
    out.pop("withheld", None)
    financials = out.get("financials")
    if not isinstance(financials, dict) or "revenue_growth_basis" in financials:
        return out
    if annual_bracket_problem(financials.get("revenue"), financials.get("revenue_growth_yoy_pct"), out.get("financial_history")):
        out["financials"] = {**financials, "revenue_growth_yoy_pct": None}
    if foreign_amounts_problem(out):
        out = withhold_amounts(out)
    return out
