from __future__ import annotations

from backend.facts_quality import (
    annual_bracket_problem,
    check_revenue_growth,
    convert_to_usd,
    foreign_amounts_problem,
    guard_facts,
    parse_units,
    quarters_growth,
)

ENDS = ["2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31", "2024-12-31"]


def quarters(values: list[float | None], ends: list[str] = ENDS) -> list[dict]:
    return [{"period": f"Q{index}", "end": end, "revenue": value} for index, (end, value) in enumerate(zip(ends, values))]


def history(ttm: float, *years: tuple[int, float]) -> list[dict]:
    return [{"period": "TTM", "revenue": ttm}, *({"period": f"FY {year}", "revenue": value} for year, value in years)]


HON_HISTORY = history(37_743e6, (2025, 37_442e6), (2024, 34_717e6))


def test_parse_units_reads_scale_and_currency() -> None:
    assert parse_units("Financials in millions USD. Fiscal year is January - December.") == ("USD", 1e6)
    assert parse_units("Financials in thousands TWD.") == ("TWD", 1e3)
    assert parse_units("Millions KRW. Fiscal year") == ("KRW", 1e6)
    assert parse_units("no units here") == (None, None)
    # Ordinary words never read as a currency, and the anchor comes first.
    assert parse_units("Revenue grew by billions and more. Financials in millions USD.") == ("USD", 1e6)
    assert parse_units("thousands the world over") == (None, None)


def test_bracket_rules_out_honeywells_eighty_percent() -> None:
    problem = annual_bracket_problem(37_743e6, 79.64, HON_HISTORY)
    assert problem and "21.01B" in problem and "+7.8%" in problem
    # The same table's own pace fits.
    assert annual_bracket_problem(37_743e6, 1.5, HON_HISTORY) is None


def test_bracket_needs_two_consecutive_years() -> None:
    assert annual_bracket_problem(100.0, 500.0, history(100.0, (2025, 90.0))) is None
    assert annual_bracket_problem(100.0, 500.0, history(100.0, (2025, 90.0), (2023, 80.0))) is None


def test_quarters_growth_cases() -> None:
    dana = quarters_growth(quarters([2038, 2010, 1868, 1867, 1917, 1935, 1781, 1774]), 7783)
    assert dana["problem"] is None and round(dana["growth"], 1) == 5.1 and dana["prior"] == 7407 and dana["sum_off"] == 0
    short = quarters_growth(quarters([1] * 7), None)
    assert short["growth"] is None and short["kind"] == "gap" and short["problem"] == "only 7 quarters in the quarterly table"
    assert "Q1" in quarters_growth(quarters([1, None, 1, 1, 1, 1, 1, 1]), None)["problem"]
    broken = quarters_growth(quarters([1868, 1819, 1681, -1871, 1795, 1749, 1612, 1544]), None)
    assert broken["kind"] == "contradiction" and "negative" in broken["problem"]
    # The last four quarters must add up to the TTM revenue (Aptiv: restated quarters, unrestated TTM).
    aptiv = quarters_growth(quarters([3199, 3274, 3032, 5153, 3127, 3199, 2987, 4907]), 20590)
    assert "not the" in aptiv["problem"] and aptiv["sum_off"] > 0.25 and aptiv["growth"] is not None
    gaps = ["2026-09-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31", "2024-12-31", "2024-09-30"]
    assert quarters_growth(quarters([1] * 8, gaps), None)["kind"] == "gap"
    # A zero quarter (milestone revenue) is a gap, not a broken table.
    assert quarters_growth(quarters([5, 0, 3, 2, 1, 1, 0, 1]), None)["kind"] == "gap"


def test_check_withholds_quarters_that_add_up_to_another_company() -> None:
    # Aptiv after the EDS spin-off: +44.8% on a TTM revenue its own quarters do not add up to.
    result = check_revenue_growth(
        {"revenue": 20_590e6, "revenue_growth_yoy_pct": 44.8},
        history(20_590e6, (2025, 20_400e6), (2024, 19_710e6)),
        quarters([3199e6, 3274e6, 3032e6, 5153e6, 3127e6, 3199e6, 2987e6, 4907e6]),
    )
    assert result["value"] is None and result["withheld"]["rule"] == "ttm_growth_vs_quarters"
    assert result["withheld"]["value"] == 44.8 and "not the" in result["withheld"]["reason"]


def test_check_keeps_a_figure_its_quarters_roughly_back() -> None:
    # A bank whose quarterly revenue line differs a little from the TTM column: 6.1% against 8.7%, inside the years.
    result = check_revenue_growth(
        {"revenue": 104e9, "revenue_growth_yoy_pct": 6.1},
        history(104e9, (2025, 101e9), (2024, 96e9)),
        quarters([27e9, 26.5e9, 25.8e9, 25.4e9, 24.6e9, 24.2e9, 23.8e9, 23.1e9]),
    )
    assert result == {"value": 6.1, "basis": "fiscal_years", "withheld": None}


def test_check_keeps_a_source_its_quarters_agree_with_even_when_lumpy() -> None:
    # NuScale-like: revenue collapsed after one huge quarter, outside the fiscal-years bracket but backed by quarters.
    financials = {"revenue": 2.74e6, "revenue_growth_yoy_pct": -95.73}
    result = check_revenue_growth(financials, history(2.74e6, (2025, 31.5e6), (2024, 37e6)), quarters([0.28e6, 0.08e6, 0.57e6, 1.81e6, 8.24e6, 8.05e6, 13.38e6, 34.22e6]))
    assert result == {"value": -95.73, "basis": "quarters", "withheld": None}


def test_check_corrects_a_source_that_disagrees_with_clean_quarters() -> None:
    # Dana after selling Off-Highway: -21.8% against its continuing quarters' +5.1%.
    financials = {"revenue": 7783e6, "revenue_growth_yoy_pct": -21.83}
    result = check_revenue_growth(
        financials,
        history(7783e6, (2025, 7500e6), (2024, 7730e6)),
        quarters([2038e6, 2010e6, 1868e6, 1867e6, 1917e6, 1935e6, 1781e6, 1774e6]),
    )
    assert result["value"] == 5.08
    assert result["basis"] == "quarters"
    assert result["withheld"]["action"] == "corrected" and result["withheld"]["value"] == -21.83


def test_check_withholds_honeywell_when_a_gap_leaves_it_to_the_fiscal_years() -> None:
    result = check_revenue_growth({"revenue": 37_743e6, "revenue_growth_yoy_pct": 79.64}, HON_HISTORY, quarters([4994e6, None, 9143e6, 9758e6, 4929e6, 849e6, 8925e6, None]))
    assert result["value"] is None and result["basis"] == "withheld"
    assert result["withheld"]["rule"] == "ttm_growth_vs_fiscal_years"
    assert result["withheld"]["field"] == "financials.revenue_growth_yoy_pct"
    assert "no sales for Q1, Q7" in result["withheld"]["reason"]
    # The same gap beside a figure that fits the years (Capital One after buying Discover) keeps it.
    cof = check_revenue_growth({"revenue": 48.89e9, "revenue_growth_yoy_pct": 69.3}, history(48.89e9, (2025, 32.78e9), (2024, 27.4e9)), quarters([1e9, None, 1e9, 1e9, 1e9, 1e9, 1e9, 1e9]))
    assert cof == {"value": 69.3, "basis": "fiscal_years", "withheld": None}
    # A broken table (a negative quarter) withholds even a figure that fits.
    dd = check_revenue_growth({"revenue": 7061e6, "revenue_growth_yoy_pct": 3.0}, history(7061e6, (2025, 6850e6), (2024, 6720e6)), quarters([1868e6, 1819e6, 1681e6, -1871e6, 1795e6, 1749e6, 1612e6, 1544e6]))
    assert dd["value"] is None and "negative" in dd["withheld"]["reason"]


def test_check_falls_back_to_the_fiscal_years_without_a_quarterly_table() -> None:
    assert check_revenue_growth({"revenue": 37_743e6, "revenue_growth_yoy_pct": 79.64}, HON_HISTORY, None)["basis"] == "withheld"
    assert check_revenue_growth({"revenue": 37_743e6, "revenue_growth_yoy_pct": 1.2}, HON_HISTORY, None) == {"value": 1.2, "basis": "fiscal_years", "withheld": None}
    # A recent listing with a short quarterly table keeps a figure that fits its years.
    assert check_revenue_growth({"revenue": 37_743e6, "revenue_growth_yoy_pct": 1.2}, HON_HISTORY, quarters([1] * 5))["basis"] == "fiscal_years"
    assert check_revenue_growth({"revenue": None, "revenue_growth_yoy_pct": None}, [], None) == {"value": None, "basis": None, "withheld": None}


def test_convert_to_usd_scales_amounts_and_withholds_per_share() -> None:
    doc = {
        "financials": {"revenue": 1000.0, "eps_diluted": 10.0, "net_income": 100.0},
        "financial_history": [{"period": "TTM", "revenue": 1000.0, "eps_diluted": 10.0}],
        "balance": {"net_cash": 50.0},
        "business_segments": {"items": [{"name": "A", "value": 400.0, "share_pct": 40.0}]},
    }
    withheld = convert_to_usd(doc, "TWD", 0.03, as_of="2026-11-13")
    assert doc["financials"]["revenue"] == 30.0 and doc["financials"]["eps_diluted"] is None
    assert doc["financials"]["currency"] == "USD" and doc["financials"]["reported_currency"] == "TWD"
    assert doc["financial_history"][0]["revenue"] == 30.0
    assert doc["balance"]["net_cash"] == 1.5
    assert doc["business_segments"]["items"][0]["value"] == 12.0
    assert {record["field"] for record in withheld} == {"financials.eps_diluted", "financial_history[TTM].eps_diluted"}


def test_convert_without_a_rate_withholds_the_amounts() -> None:
    doc = {"financials": {"revenue": 1000.0}, "balance": {"net_cash": 5.0}, "geographic_mix": {"period": "FY", "items": [{"name": "A", "value": 1.0}]}}
    withheld = convert_to_usd(doc, "KRW", None, as_of="2026-11-13")
    assert doc["financials"]["revenue"] is None and doc["financials"]["currency"] is None
    # Each section says so itself, so the writer stores it over the old amounts instead of keeping those.
    from backend.storage import _stock_facts_write_payload
    written = _stock_facts_write_payload(doc, updated_at="2026-11-13T00:00:00+00:00")
    assert written["balance"] == {"net_cash": None, "reported_currency": "KRW"}
    assert written["geographic_mix"]["items"] == []
    assert {record["field"]: record["reason"] for record in withheld}["balance.net_cash"] == "in KRW and no KRW/USD rate today"


def test_guard_strips_withheld_and_checks_only_unchecked_docs() -> None:
    old = {"financials": {"revenue": 37_743e6, "revenue_growth_yoy_pct": 79.64}, "financial_history": HON_HISTORY, "withheld": [{"field": "x"}]}
    guarded = guard_facts(old)
    assert guarded["financials"]["revenue_growth_yoy_pct"] is None and "withheld" not in guarded
    assert old["financials"]["revenue_growth_yoy_pct"] == 79.64 and "withheld" in old
    checked = {"financials": {"revenue": 2.74e6, "revenue_growth_yoy_pct": -95.73, "revenue_growth_basis": "quarters"}, "financial_history": history(2.74e6, (2025, 31.5e6), (2024, 37e6))}
    assert guard_facts(checked)["financials"]["revenue_growth_yoy_pct"] == -95.73
    assert guard_facts(None) is None


def test_guard_takes_out_amounts_in_another_currency_on_unchecked_docs() -> None:
    tsmc = {
        "financials": {"revenue": 4.94e12, "revenue_growth_yoy_pct": 30.0, "eps_diluted": 97.48},
        "financial_history": [{"period": "TTM", "revenue": 4.94e12, "gross_margin_pct": 60.0}],
        "quick_stats": {"market_cap": 1.95e12},
        "valuation": {"price_to_sales": 10.9},
    }
    assert foreign_amounts_problem(tsmc)
    guarded = guard_facts(tsmc)
    assert guarded["financials"]["revenue"] is None and guarded["financials"]["eps_diluted"] is None
    assert guarded["financials"]["revenue_growth_yoy_pct"] == 30.0
    assert guarded["financial_history"][0]["gross_margin_pct"] == 60.0
    apple = {"financials": {"revenue": 4.67e11}, "quick_stats": {"market_cap": 4.97e12}, "valuation": {"price_to_sales": 10.6}}
    assert foreign_amounts_problem(apple) is None


def test_check_withholds_rather_than_picks_when_both_figures_fit_the_years() -> None:
    # +10% from the TTM column, +25% from quarters that add up exactly: both fit the years, so neither is shown.
    result = check_revenue_growth(
        {"revenue": 1250.0, "revenue_growth_yoy_pct": 10.0},
        history(1250.0, (2025, 1150.0), (2024, 950.0)),
        quarters([320.0, 315.0, 310.0, 305.0, 255.0, 250.0, 248.0, 247.0]),
    )
    assert result["value"] is None and result["withheld"]["action"] == "withheld"
