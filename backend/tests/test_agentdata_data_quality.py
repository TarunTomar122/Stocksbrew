from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from backend.agentdata import data_quality

NOW = datetime(2026, 11, 13, 14, 0, tzinfo=timezone.utc)
FRESH = "2026-11-12T21:00:00+00:00"


def facts(**overrides):
    doc = {
        "captured_at": "2026-11-08T09:00:00+00:00",
        "financials": {"fiscal_year": "TTM", "revenue": 1000e6, "revenue_growth_yoy_pct": 10.0, "eps_diluted": 2.0, "net_income": 200e6, "currency": "USD", "revenue_growth_basis": "quarters"},
        "financial_history": [
            {"period": "TTM", "revenue": 1000e6, "gross_margin_pct": 40.0, "operating_margin_pct": 20.0, "profit_margin_pct": 15.0},
            {"period": "FY 2025", "revenue": 950e6},
            {"period": "FY 2024", "revenue": 870e6},
        ],
        "quick_stats": {"market_cap": 4e9, "pe_ttm": 20.0},
        "valuation": {"price_to_sales": 4.0},
        "dividends": {"annual_dividend": 1.0, "history": [{"ex_date": "Nov 1, 2026", "amount": 0.25, "pay_date": "Nov 20, 2026"}]},
    }
    for key, value in overrides.items():
        doc[key] = value
    return doc


def check(row=None, doc=None, quote=None, events=(), guard=True):
    return data_quality.check_stock(
        ticker="ABC",
        row=row if row is not None else {"price": 40.0, "pe": 20.0, "hi_52w": 50.0, "lo_52w": 30.0},
        facts=doc if doc is not None else facts(),
        latest={"quote": quote if quote is not None else {"current": 40.0, "captured_at": FRESH}},
        events=list(events),
        now=NOW,
        guard=guard,
    )


def rules(results):
    return sorted({rule for rule, _, _ in results})


def test_a_clean_stock_has_no_findings():
    assert check() == []


def test_honeywell_growth_is_flagged_raw_and_guarded_out():
    doc = facts(
        financials={"fiscal_year": "TTM", "revenue": 37_743e6, "revenue_growth_yoy_pct": 79.64, "eps_diluted": 22.1, "net_income": 7052e6},
        financial_history=[{"period": "TTM", "revenue": 37_743e6}, {"period": "FY 2025", "revenue": 37_442e6}, {"period": "FY 2024", "revenue": 34_717e6}],
        quick_stats={"market_cap": 69.8e9},
        valuation={"price_to_sales": 1.85},
    )
    raw = rules(check(row={"price": 223.45, "pe": 9.3}, doc=doc, quote={"current": 223.45, "captured_at": FRESH}, guard=False))
    assert "growth_outside_fiscal_years" in raw and "growth_far_from_fiscal" in raw
    guarded = rules(check(row={"price": 223.45, "pe": 9.3}, doc=doc, quote={"current": 223.45, "captured_at": FRESH}))
    assert "growth_outside_fiscal_years" not in guarded


def test_each_rule_fires_on_its_own_case():
    assert rules(check(row={"price": 40.0, "pe": 49.6})) == ["pe_vs_price_eps", "pe_vs_weekly"]
    assert rules(check(row={"price": 40.0, "pe": 20.0, "hi_52w": 38.0, "lo_52w": 30.0})) == ["price_outside_range"]
    assert rules(check(quote={"current": 40.0, "captured_at": "2026-07-17T00:00:00+00:00"})) == ["stale_quote"]
    assert rules(check(doc=facts(captured_at="2026-10-01T00:00:00+00:00"))) == ["stale_facts"]
    assert rules(check(doc=facts(dividends={"annual_dividend": 8.0, "history": []}))) == ["dividend_yield_high"]
    assert rules(check(doc=facts(dividends={"annual_dividend": 0.3, "history": [{"amount": 2.0}]}))) == ["annual_dividend_vs_payments"]
    bad_margin = facts(financial_history=[{"period": "TTM", "revenue": 1000e6, "gross_margin_pct": -260.0}, {"period": "FY 2025", "revenue": 950e6}, {"period": "FY 2024", "revenue": 870e6}])
    assert rules(check(doc=bad_margin)) == ["gross_margin_out_of_range"]
    assert rules(check(doc=facts(quick_stats={"market_cap": 9e9}))) == ["market_cap_vs_shares"]
    event = {"event_date": "2026-11-06", "reported_eps": 21.7, "estimated_eps": 9.08, "actuals_reported_date": "2026-11-05"}
    assert rules(check(events=[event])) == ["dates_out_of_order", "eps_far_from_forecast"]


def test_amounts_in_another_currency_are_flagged_until_guarded():
    doc = facts(financials={"revenue": 4.94e12, "revenue_growth_yoy_pct": 30.0}, quick_stats={"market_cap": 1.95e12}, valuation={"price_to_sales": 10.9})
    assert "amounts_other_currency" in rules(check(doc=doc, guard=False))
    assert "amounts_other_currency" not in rules(check(doc=doc))


def test_summary_counts_stocks_and_keeps_the_worst_first():
    results = [
        ("pe_vs_price_eps", {"ticker": "A", "field": "pe", "value": 30}, 0.5),
        ("pe_vs_price_eps", {"ticker": "B", "field": "pe", "value": 90}, 3.0),
        ("stale_facts", {"ticker": "A", "field": "captured_at", "value": None}, 20),
    ]
    summary = data_quality.summarize(results, Counter({"ttm_growth_vs_quarters:withheld": 6}), 779, NOW)
    pe = next(rule for rule in summary["rules"] if rule["id"] == "pe_vs_price_eps")
    assert pe["count"] == 2 and pe["worst"][0]["ticker"] == "B"
    assert summary["totals"] == {"error": 2, "warn": 1}
    assert summary["withheld"] == {"ttm_growth_vs_quarters:withheld": 6}
    assert summary["stocks"] == 779 and summary["as_of"].startswith("2026-11-13")


def test_a_growth_the_quarters_back_is_not_flagged_outside_its_years():
    # NuScale-like: lumpy revenue collapse, kept on purpose by the writer because its quarters back it.
    doc = facts(
        financials={"fiscal_year": "TTM", "revenue": 2.74e6, "revenue_growth_yoy_pct": -95.73, "currency": "USD", "revenue_growth_basis": "quarters"},
        financial_history=[{"period": "TTM", "revenue": 2.74e6}, {"period": "FY 2025", "revenue": 31.5e6}, {"period": "FY 2024", "revenue": 37e6}],
        quick_stats={"market_cap": 4e9},
        valuation={},
    )
    assert "growth_outside_fiscal_years" not in rules(check(doc=doc))
    unchecked = facts(**{**doc, "financials": {key: value for key, value in doc["financials"].items() if key != "revenue_growth_basis"}})
    assert "growth_outside_fiscal_years" in rules(check(doc=unchecked, guard=False))
