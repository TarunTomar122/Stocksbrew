"""The nightly data-quality check: the figures a covered stock's page and the briefing show, held to each other.

The rule (docs/volaren-parity-hillclimb.md, data conventions): every number is traceable, and the page shows
nothing rather than a wrong number. The writers check what they can before storing (backend/facts_quality.py) and
the readers check again (lib/facts-guard.ts); this job counts what still gets through, per rule, so a new class of
error shows up on the owner's System tab the night it appears instead of on a stock page.

For every covered US stock (the screener snapshot's rows) it reads the facts, the quote and the screener row,
applies the readers' guard, and checks:

* error: four-quarter sales growth outside its own fiscal years; amounts in another currency; a gross margin
  outside +/-100%; a P/E far from today's price over the four-quarter EPS; a past-year range the price is outside;
  a quote more than four days old
* warn: four-quarter growth far from the last fiscal year's; growth above 60% at a $200B+ company; an operating or
  net margin above 100%; a P/E far from Finviz's; a market value far from price times shares; a dividend yield above 15% or an annual
  dividend below the last payment; reported EPS far from the forecast; dates out of order; facts more than 14 days
  old
* info: what the facts job withheld or corrected, by rule, and how each stock's growth was checked
  ("growth_basis:quarters", "growth_basis:fiscal_years", "growth_basis:unchecked" for a doc from before the checks)

Output (additive): ``tm_data_quality/latest`` and ``tm_data_quality/<YYYY-MM-DD>``, each
``{as_of, stocks, totals, rules: [{id, label, severity, count, worst: [...]}], withheld: {rule: count}}``.
lib/data-quality.ts reads it for the admin System tab. Read-only everywhere else.

Run it:  python3 -m backend.agentdata.data_quality            (writes)
         python3 -m backend.agentdata.data_quality --dry-run  (prints the summary)
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from backend.facts_quality import annual_bracket_problem, fiscal_years, foreign_amounts_problem, guard_facts, num

from .screener import _get_many, _query
from .store import DocStore

COLLECTION = "tm_data_quality"
WORST = 10

GROWTH_GAP_PP = 40.0
MEGA_CAP = 200e9
MEGA_GROWTH_PCT = 60.0
PE_TOLERANCE = 0.30
PE_SOURCES_TOLERANCE = 0.40
CAP_TOLERANCE = 0.35
HIGH_YIELD_PCT = 15.0
STALE_QUOTE_DAYS = 4
STALE_FACTS_DAYS = 14
EPS_WINDOW_DAYS = 120

# id -> (label, severity)
RULES: dict[str, tuple[str, str]] = {
    "growth_outside_fiscal_years": ("Sales growth over four quarters its own fiscal years rule out", "error"),
    "amounts_other_currency": ("Money amounts in another currency", "error"),
    "gross_margin_out_of_range": ("Gross margin outside -100% to 100%", "error"),
    "pe_vs_price_eps": ("P/E far from today's price over the four-quarter EPS", "error"),
    "price_outside_range": ("Price outside the past year's range", "error"),
    "stale_quote": (f"Quote more than {STALE_QUOTE_DAYS} days old", "error"),
    "growth_far_from_fiscal": (f"Four-quarter growth {GROWTH_GAP_PP:.0f}+ points from the last fiscal year's", "warn"),
    "mega_cap_growth": (f"Growth above {MEGA_GROWTH_PCT:.0f}% at a $200B+ company", "warn"),
    "margin_above_100": ("Operating or net margin above 100%", "warn"),
    "pe_vs_weekly": ("P/E far from Finviz's weekly P/E", "warn"),
    "market_cap_vs_shares": ("Market value far from price times shares", "warn"),
    "dividend_yield_high": (f"Dividend yield above {HIGH_YIELD_PCT:.0f}%", "warn"),
    "annual_dividend_vs_payments": ("Annual dividend below the last payment", "warn"),
    "eps_far_from_forecast": ("Reported EPS far from the forecast (two bases?)", "warn"),
    "dates_out_of_order": ("Dates out of order", "warn"),
    "stale_facts": (f"Facts more than {STALE_FACTS_DAYS} days old", "warn"),
}


def _age_days(stamp: Any, now: datetime) -> float | None:
    if not isinstance(stamp, str) or not stamp:
        return None
    try:
        at = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    return (now - at).total_seconds() / 86400.0


def _parse_day(value: Any) -> date | None:
    text = str(value or "").strip()
    for fmt in ("%Y-%m-%d", "%b %d, %Y"):
        try:
            return datetime.strptime(text[:10] if fmt == "%Y-%m-%d" else text, fmt).date()
        except ValueError:
            continue
    return None


def _r(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


def check_stock(
    *,
    ticker: str,
    row: dict[str, Any],
    facts: dict[str, Any] | None,
    latest: dict[str, Any] | None,
    events: list[dict[str, Any]],
    now: datetime,
    guard: bool = True,
) -> list[tuple[str, dict[str, Any], float]]:
    """(rule id, offender, how bad) for one stock. Pure: the caller does the reads.

    ``guard=False`` checks the stored figures as they are, without the readers' guard (for audits of old data).
    """
    out: list[tuple[str, dict[str, Any], float]] = []

    def flag(rule: str, field: str, value: Any, badness: float, **extra: Any) -> None:
        out.append((rule, {"ticker": ticker, "field": field, "value": value, **extra}, badness))

    shown = (guard_facts(facts) if guard else facts) or {}
    financials = shown.get("financials") if isinstance(shown.get("financials"), dict) else {}
    history = shown.get("financial_history") if isinstance(shown.get("financial_history"), list) else []
    quick = shown.get("quick_stats") if isinstance(shown.get("quick_stats"), dict) else {}
    quote = (latest or {}).get("quote") if isinstance((latest or {}).get("quote"), dict) else {}
    price = num(quote.get("current")) or num(row.get("price"))

    # Sales growth over four quarters, as the page reads it.
    growth, revenue = num(financials.get("revenue_growth_yoy_pct")), num(financials.get("revenue"))
    # A figure the writer checked against the quarterly table stands even outside the fiscal years (lumpy revenue).
    backed = financials.get("revenue_growth_basis") == "quarters"
    problem = None if backed else annual_bracket_problem(revenue, growth, history)
    if problem:
        flag("growth_outside_fiscal_years", "financials.revenue_growth_yoy_pct", growth, abs(growth or 0), note=problem)
    years = fiscal_years(history)
    if growth is not None and years and not backed:
        latest_year = max(years)
        if latest_year - 1 in years:
            year_growth = (years[latest_year] / years[latest_year - 1] - 1.0) * 100.0
            gap = abs(growth - year_growth)
            if gap > GROWTH_GAP_PP:
                flag("growth_far_from_fiscal", "financials.revenue_growth_yoy_pct", _r(growth, 1), gap, fiscal=_r(year_growth, 1), year=latest_year)
    cap = num(quick.get("market_cap")) or num(row.get("market_cap"))
    if growth is not None and cap and cap >= MEGA_CAP and abs(growth) > MEGA_GROWTH_PCT:
        flag("mega_cap_growth", "financials.revenue_growth_yoy_pct", _r(growth, 1), abs(growth), market_cap=cap)

    # Currency: amounts the source's own price-to-sales ratio rules out.
    foreign = foreign_amounts_problem(shown)
    if foreign:
        flag("amounts_other_currency", "financials.revenue", revenue, revenue or 0.0, note=foreign)

    # Margins of the latest row the page reads (TTM first).
    top = history[0] if history and isinstance(history[0], dict) else {}
    gross = num(top.get("gross_margin_pct"))
    if gross is not None and not -100.0 <= gross <= 100.0:
        flag("gross_margin_out_of_range", "financial_history[0].gross_margin_pct", gross, abs(gross), period=top.get("period"))
    for key in ("operating_margin_pct", "profit_margin_pct"):
        value = num(top.get(key))
        if value is not None and value > 100.0:
            flag("margin_above_100", f"financial_history[0].{key}", value, value, period=top.get("period"))

    # P/E: the screen's (what the evidence and the screener show) against today's price over the four-quarter EPS.
    eps = num(financials.get("eps_diluted"))
    # Dollars: said so by the facts job, or (a doc from before it said) not caught by the currency check above.
    in_dollars = (
        financials.get("fiscal_year") == "TTM"
        and not financials.get("reported_currency")
        and (financials.get("currency") == "USD" if "currency" in financials else foreign is None)
    )
    pe = num(row.get("pe"))
    if pe is not None and pe > 0 and price and eps and eps > 0 and in_dollars:
        implied = price / eps
        if abs(pe / implied - 1.0) > PE_TOLERANCE:
            flag("pe_vs_price_eps", "pe", _r(pe, 1), abs(pe / implied - 1.0), expected=_r(implied, 1))
    if pe is not None and pe > 0 and eps is not None and eps <= 0 and financials.get("fiscal_year") == "TTM":
        flag("pe_vs_price_eps", "pe", _r(pe, 1), 1.0, expected=None, note="a P/E on a four-quarter loss")
    # Against Finviz's own P/E too: catches an EPS on another basis (an ADR ratio) that price over EPS cannot.
    weekly = num(quick.get("pe_ttm"))
    if pe is not None and pe > 0 and weekly is not None and weekly > 0 and abs(pe / weekly - 1.0) > PE_SOURCES_TOLERANCE:
        flag("pe_vs_weekly", "pe", _r(pe, 1), abs(pe / weekly - 1.0), expected=_r(weekly, 1))

    # Market value against price times diluted shares (net income over EPS).
    net_income = num(financials.get("net_income"))
    if cap and price and eps and net_income and in_dollars and abs(eps) >= 0.05 and abs(net_income) > 0:
        shares = net_income / eps
        if shares > 0:
            implied_cap = shares * price
            off = abs(cap / implied_cap - 1.0)
            if off > CAP_TOLERANCE:
                flag("market_cap_vs_shares", "market_cap", cap, off, expected=_r(implied_cap, 0))

    # The past year's range the screen shows.
    high, low = num(row.get("hi_52w")), num(row.get("lo_52w"))
    if price and high and price > high * 1.005:
        flag("price_outside_range", "hi_52w", high, price / high - 1.0, price=_r(price))
    if price and low and price < low * 0.995:
        flag("price_outside_range", "lo_52w", low, 1.0 - price / low, price=_r(price))

    # Dividends.
    dividends = shown.get("dividends") if isinstance(shown.get("dividends"), dict) else {}
    annual = num(dividends.get("annual_dividend"))
    if annual and price and annual > 0:
        yield_pct = annual / price * 100.0
        if yield_pct > HIGH_YIELD_PCT:
            flag("dividend_yield_high", "dividends.annual_dividend", annual, yield_pct, yield_pct=_r(yield_pct, 1), price=_r(price))
        payments = dividends.get("history") if isinstance(dividends.get("history"), list) else []
        last = num(payments[0].get("amount")) if payments and isinstance(payments[0], dict) else None
        if last and annual < last * 0.9:
            flag("annual_dividend_vs_payments", "dividends.annual_dividend", annual, last / annual, last_payment=last)
        for payment in payments[:4]:
            if not isinstance(payment, dict):
                continue
            ex_day, pay_day = _parse_day(payment.get("ex_date")), _parse_day(payment.get("pay_date"))
            if ex_day and pay_day and pay_day < ex_day:
                flag("dates_out_of_order", "dividends.history", str(payment.get("ex_date")), (ex_day - pay_day).days, pay_date=payment.get("pay_date"))

    # EPS against the forecast in the latest report (the page's pair: estimated_eps, else eps_estimate).
    today = now.date().isoformat()
    since = (now.date() - timedelta(days=EPS_WINDOW_DAYS)).isoformat()
    past = sorted(
        (event for event in events if since <= str(event.get("event_date") or "")[:10] < today and num(event.get("reported_eps")) is not None),
        key=lambda event: str(event.get("event_date")),
    )
    if past:
        event = past[-1]
        actual = num(event.get("reported_eps"))
        forecast = num(event.get("estimated_eps"))
        if forecast is None:
            forecast = num(event.get("eps_estimate"))
        if actual is not None and forecast is not None and abs(actual - forecast) > max(abs(forecast), 0.5):
            flag(
                "eps_far_from_forecast", "reported_eps", actual, abs(actual - forecast),
                expected=forecast, day=str(event.get("event_date"))[:10],
                sources=f"{event.get('source') or 'calendar'} / {event.get('actuals_source') or '?'}",
            )
        reported_day = str(event.get("actuals_reported_date") or "")[:10]
        if reported_day and reported_day < str(event.get("event_date"))[:10]:
            flag("dates_out_of_order", "actuals_reported_date", reported_day, 1, event_date=str(event.get("event_date"))[:10])

    # Freshness.
    quote_age = _age_days(quote.get("captured_at") or (latest or {}).get("captured_at"), now)
    if quote_age is None or quote_age > STALE_QUOTE_DAYS:
        flag("stale_quote", "quote.captured_at", quote.get("captured_at"), quote_age if quote_age is not None else 999.0)
    facts_age = _age_days((facts or {}).get("captured_at"), now)
    if facts_age is not None and facts_age < -1:
        flag("dates_out_of_order", "captured_at", (facts or {}).get("captured_at"), -facts_age, note="in the future")
    elif facts_age is None or facts_age > STALE_FACTS_DAYS:
        flag("stale_facts", "captured_at", (facts or {}).get("captured_at"), facts_age if facts_age is not None else 999.0)
    return out


def summarize(results: list[tuple[str, dict[str, Any], float]], withheld: Counter, stocks: int, now: datetime) -> dict[str, Any]:
    by_rule: dict[str, list[tuple[dict[str, Any], float]]] = {rule: [] for rule in RULES}
    for rule, offender, badness in results:
        by_rule.setdefault(rule, []).append((offender, badness))
    rules = []
    totals = Counter()
    for rule, (label, severity) in RULES.items():
        offenders = by_rule.get(rule, [])
        tickers = {offender["ticker"] for offender, _ in offenders}
        totals[severity] += len(tickers)
        rules.append({
            "id": rule,
            "label": label,
            "severity": severity,
            "count": len(tickers),
            "worst": [offender for offender, _ in sorted(offenders, key=lambda item: -item[1])[:WORST]],
        })
    return {
        "as_of": now.isoformat(),
        "stocks": stocks,
        "totals": {"error": totals["error"], "warn": totals["warn"]},
        "rules": rules,
        "withheld": dict(sorted(withheld.items())),
    }


def _snapshot_rows(store: DocStore) -> list[dict[str, Any]]:
    meta = store.get("tm_screener_snapshot/US") or {}
    paths = [f"tm_screener_snapshot/{shard}" for shard in meta.get("shards") or [] if isinstance(shard, str)]
    rows: list[dict[str, Any]] = []
    for path, data in sorted(_get_many(store, paths, chunk=10).items()):
        rows.extend(row for row in data.get("rows") or [] if isinstance(row, dict))
    return [row for row in rows if not row.get("benchmark") and not row.get("uncovered") and row.get("symbol")]


def build(
    store: DocStore, *, now: datetime | None = None, guard: bool = True, log: Callable[[str], None] = print
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    rows = _snapshot_rows(store)
    if not rows:
        raise RuntimeError("screener snapshot has no rows")
    ids = {str(row["symbol"]).upper(): str(row.get("instrument_id") or f"US_{row['symbol']}") for row in rows}
    facts = _get_many(store, [f"tm_stock_facts/{i}" for i in ids.values()], chunk=150)
    latest = _get_many(store, [f"tm_latest_prices/{i}" for i in ids.values()], chunk=150, select=["quote", "captured_at"])
    events = _query(
        store,
        "tm_earnings_events",
        [{"field": "event_date", "op": ">=", "value": (now.date() - timedelta(days=EPS_WINDOW_DAYS)).isoformat()}],
        ["ticker", "event_date", "reported_eps", "estimated_eps", "eps_estimate", "actuals_reported_date", "source", "actuals_source"],
    )
    log(f"{len(rows)} covered stocks, {len(facts)} facts, {len(latest)} quotes, {len(events)} earnings rows")
    by_ticker: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        by_ticker.setdefault(str(event.get("ticker") or "").upper(), []).append(event)

    results: list[tuple[str, dict[str, Any], float]] = []
    withheld: Counter = Counter()
    for row in rows:
        ticker = str(row["symbol"]).upper()
        doc = facts.get(f"tm_stock_facts/{ids[ticker]}")
        # How the stored growth figures were checked ("unchecked": written before the checks).
        financials = (doc or {}).get("financials") if isinstance((doc or {}).get("financials"), dict) else {}
        basis = financials.get("revenue_growth_basis", "unchecked") if financials else "no facts"
        withheld[f"growth_basis:{basis}"] += 1
        records = (doc or {}).get("withheld")
        for record in records if isinstance(records, list) else []:
            if isinstance(record, dict):
                withheld[f"{record.get('rule') or '?'}:{record.get('action') or 'withheld'}"] += 1
        results.extend(
            check_stock(
                ticker=ticker,
                row=row,
                facts=doc,
                latest=latest.get(f"tm_latest_prices/{ids[ticker]}"),
                events=by_ticker.get(ticker, []),
                now=now,
                guard=guard,
            )
        )
    return summarize(results, withheld, len(rows), now)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Count the covered stocks' data-quality problems.")
    parser.add_argument("--dry-run", action="store_true", help="print the summary, write nothing")
    parser.add_argument("--unguarded", action="store_true", help="check the stored figures without the readers' guard (implies --dry-run)")
    args = parser.parse_args(argv)
    store = DocStore.from_env()
    summary = build(store, guard=not args.unguarded, log=lambda message: print(message, file=sys.stderr, flush=True))
    for rule in summary["rules"]:
        print(f"{rule['severity']:5s} {rule['count']:4d}  {rule['label']}", file=sys.stderr)
    if args.dry_run or args.unguarded:
        print(json.dumps(summary, indent=1, default=str))
        return 0
    day = summary["as_of"][:10]
    written = store.set_many([(f"{COLLECTION}/latest", summary), (f"{COLLECTION}/{day}", summary)])
    print(f"wrote {written} documents to {COLLECTION} ({store.mode})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
