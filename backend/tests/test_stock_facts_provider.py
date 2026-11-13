from __future__ import annotations

from unittest.mock import Mock, patch

from backend.providers.stock_facts_provider import (
    _build_yahoo_financial_depth,
    _parse_stockanalysis_dividends,
    _parse_stockanalysis_financials,
    _parse_stockanalysis_forecast,
    _parse_stockanalysis_metrics,
    _parse_stockanalysis_quarters,
    _parse_stockanalysis_statistics,
    _parse_finviz_snapshot,
    _get_stockanalysis_text,
    _stockanalysis_soup,
    fetch_stock_facts,
)

import pandas as pd


def test_stockanalysis_request_retries_429_after_shared_cooldown() -> None:
    limited = Mock(status_code=429, headers={"Retry-After": "2"})
    limited.raise_for_status.side_effect = RuntimeError("rate limited")
    success = Mock(status_code=200, text="ok")

    with (
        patch(
            "backend.providers.stock_facts_provider.requests.get",
            side_effect=[limited, success],
        ) as request,
        patch(
            "backend.providers.stock_facts_provider._reserve_stockanalysis_request"
        ) as reserve,
    ):
        assert _get_stockanalysis_text("https://stockanalysis.com/stocks/aapl/") == "ok"

    assert request.call_count == 2
    reserve.assert_any_call(cooldown_seconds=2.0)


def _table(heading: str, rows: list[list[str]]) -> str:
    body = "".join(
        "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>"
        for row in rows
    )
    return f"<h2>{heading}</h2><table>{body}</table>"


def test_financial_history_and_balance_are_parsed_from_named_tables() -> None:
    html = "".join([
        _table("Revenue & Profits", [
            ["Fiscal Year", "TTM", "FY 2025"],
            ["Revenue Revenue Growth", "466,823", "416,161"],
            ["Revenue Growth", "14.24%", "6.43%"],
            ["Gross Profit Gross Profit Growth", "227,123", "195,201"],
            ["Operating Income Operating Income Growth", "154,859", "133,050"],
            ["Net Income Net Income Growth", "128,930", "112,010"],
            ["Earnings Per Share EPS Growth", "8.72", "7.46"],
        ]),
        _table("Cash & Debt", [
            ["Fiscal Year", "Current", "FY 2025"],
            ["Cash & Investments Cash & Investments Growth", "146,517", "132,420"],
            ["Total Debt Total Debt Growth", "84,344", "98,657"],
            ["Net Cash (Debt) Net Cash Growth", "62,173", "33,763"],
        ]),
        _table("Cash Flow & CapEx", [
            ["Fiscal Year", "TTM", "FY 2025"],
            ["Free Cash Flow Free Cash Flow Growth", "136,683", "98,767"],
        ]),
        _table("Margins", [
            ["Fiscal Year", "TTM", "FY 2025"],
            ["Gross Margin", "48.65%", "46.91%"],
            ["Operating Margin", "33.17%", "31.97%"],
            ["Profit Margin", "27.62%", "26.92%"],
        ]),
        _table("Valuation", [
            ["Fiscal Year", "Current", "FY 2025"],
            ["Forward PE", "33.76", "32.97"],
            ["P/FCF Ratio", "32.98", "38.21"],
            ["PS Ratio", "9.66", "9.07"],
        ]),
    ])

    with patch("backend.providers.stock_facts_provider._get_stockanalysis_text", return_value=html):
        result = _parse_stockanalysis_financials("AAPL")

    assert result["financials"]["revenue"] == 466_823_000_000
    assert result["financials"]["free_cash_flow"] == 136_683_000_000
    assert result["financial_history"][1]["gross_margin_pct"] == 46.91
    assert result["balance"]["net_cash"] == 62_173_000_000
    assert result["valuation"] == {
        "forward_pe": 33.76,
        "price_to_sales": 9.66,
        "price_to_fcf": 32.98,
    }


def test_statistics_dividends_mix_and_forecast_are_nullable_and_structured() -> None:
    statistics_html = "".join([
        _table("Important Dates", [["Ex-Dividend Date", "Aug 10, 2026"]]),
        _table("Valuation Ratios", [["Forward PE", "33.76"], ["PS Ratio", "9.66"], ["P/FCF Ratio", "32.98"]]),
        _table("Enterprise Valuation", [["EV / EBITDA", "26.47"]]),
        _table("Financial Position", [["Current Ratio", "1.00"], ["Debt / Equity", "0.78"]]),
        _table("Financial Efficiency", [["Return on Equity (ROE)", "148.75%"], ["Return on Invested Capital (ROIC)", "101.57%"]]),
        _table("Dividends & Yields", [["Dividend Per Share", "$1.08"], ["Dividend Yield", "0.35%"], ["Payout Ratio", "12.39%"], ["Dividend Growth (YoY)", "3.96%"], ["Years of Dividend Growth", "14"]]),
    ])
    dividend_html = _table("Dividend History", [
        ["Ex-Dividend Date", "Cash Amount", "Record Date", "Pay Date"],
        ["May 11, 2026", "$0.270", "May 11, 2026", "May 14, 2026"],
    ])
    metrics_html = "".join([
        _table("Revenue by Segment", [["Period Ending", "Jun 30, 2026"], ["iPhone", "245.54B"], ["iPhone Growth", "18.74%"], ["Services", "120.48B"]]),
        _table("Revenue by Geography", [["Period Ending", "Jun 30, 2026"], ["Americas", "193.60B"], ["Europe", "124.30B"]]),
    ])
    forecast_html = "".join([
        _table("Price Target", [["Target", "Low", "Average", "Median", "High"], ["Price", "$215", "$323.28", "$330", "$400"]]),
        _table("Recommendation Trends", [["Rating", "Jun '26", "Jul '26"], ["Strong Buy", "22", "22"], ["Buy", "6", "6"], ["Hold", "16", "14"], ["Sell", "2", "2"], ["Strong Sell", "1", "2"]]),
    ])

    with patch("backend.providers.stock_facts_provider._get_stockanalysis_text", return_value=statistics_html):
        statistics = _parse_stockanalysis_statistics("AAPL")
    with patch("backend.providers.stock_facts_provider._get_stockanalysis_text", return_value=dividend_html):
        dividends = _parse_stockanalysis_dividends("AAPL")
    with patch("backend.providers.stock_facts_provider._get_stockanalysis_text", return_value=metrics_html):
        metrics = _parse_stockanalysis_metrics("AAPL")
    with patch("backend.providers.stock_facts_provider._get_stockanalysis_text", return_value=forecast_html):
        forecast = _parse_stockanalysis_forecast("AAPL")

    assert statistics["valuation"]["ev_to_ebitda"] == 26.47
    assert statistics["quality"]["roic_pct"] == 101.57
    assert statistics["dividends"]["payout_ratio_pct"] == 12.39
    assert dividends["history"][0]["amount"] == 0.27
    assert metrics["business_segments"]["items"][0]["name"] == "iPhone"
    assert round(sum(item["share_pct"] for item in metrics["geographic_mix"]["items"]), 1) == 100.0
    assert forecast["target"]["median"] == 330
    assert forecast["recommendation_trend"][-1]["strong_sell"] == 2


def test_fetch_stock_facts_keeps_each_extended_source_independent() -> None:
    instrument = {"instrument_id": "US_AAPL", "market": "US", "ticker": "AAPL"}
    financial_result = {
        "financials": {"revenue": 100, "source": "stockanalysis"},
        "financial_history": [{"period": "TTM", "revenue": 100}],
        "balance": {"net_cash": 25},
        "valuation": {"forward_pe": 20},
    }
    statistics_result = {
        "valuation": {"forward_pe": 21, "ev_to_ebitda": 15},
        "quality": {"roic_pct": 30},
        "dividends": {"yield_pct": 0.5},
    }

    with (
        patch("backend.providers.stock_facts_provider._parse_finviz_snapshot", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_nasdaq_analyst", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_nasdaq_institutions", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_financials", return_value=financial_result),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_quarters", return_value={"quarters": []}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_statistics", return_value=statistics_result),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_dividends", return_value={"history": [{"ex_date": "May 1", "amount": 0.25}]}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_metrics", side_effect=RuntimeError("temporarily unavailable")),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_forecast", return_value={"target": {"average": 125}, "recommendation_trend": []}),
    ):
        result = fetch_stock_facts(instrument)

    assert result["financial_history"][0]["revenue"] == 100
    assert result["valuation"] == {"forward_pe": 21, "ev_to_ebitda": 15}
    assert result["dividends"]["history"][0]["amount"] == 0.25
    assert result["analyst_trend"]["target"]["average"] == 125
    assert result["business_segments"] is None
    assert result["source_status"]["errors"] == [
        "stockanalysis_metrics: temporarily unavailable"
    ]


def test_share_class_symbols_use_each_providers_expected_slug() -> None:
    with patch(
        "backend.providers.stock_facts_provider._get_stockanalysis_text",
        return_value="<html></html>",
    ) as get_text:
        _stockanalysis_soup("BF.B", "financials/")
        assert get_text.call_args.args[0] == "https://stockanalysis.com/stocks/bf.b/financials/"

    with patch(
        "backend.providers.stock_facts_provider._get_text",
        return_value="<html></html>",
    ) as get_text:
        _parse_finviz_snapshot("BF.B")
        assert get_text.call_args.args[0] == "https://finviz.com/quote.ashx?t=BF-B&p=d"


def test_yahoo_depth_fallback_normalizes_financials_and_ratios() -> None:
    periods = [pd.Timestamp("2025-12-31"), pd.Timestamp("2024-12-31")]
    income = pd.DataFrame(
        {
            periods[0]: [120.0, 60.0, 30.0, 24.0, 2.4],
            periods[1]: [100.0, 45.0, 20.0, 15.0, 1.5],
        },
        index=["Total Revenue", "Gross Profit", "Operating Income", "Net Income", "Diluted EPS"],
    )
    cashflow = pd.DataFrame(
        {periods[0]: [18.0], periods[1]: [12.0]},
        index=["Free Cash Flow"],
    )
    balance = pd.DataFrame(
        {periods[0]: [50.0, 30.0]},
        index=["Cash And Cash Equivalents", "Total Debt"],
    )

    result = _build_yahoo_financial_depth(
        info={
            "marketCap": 360.0,
            "freeCashflow": 18.0,
            "forwardPE": 18.0,
            "priceToSalesTrailing12Months": 3.0,
            "enterpriseToEbitda": 12.0,
            "returnOnEquity": 0.24,
            "debtToEquity": 78.0,
            "currentRatio": 1.4,
        },
        income=income,
        cashflow=cashflow,
        balance_sheet=balance,
        price_targets={"low": 80, "mean": 100, "median": 102, "high": 125},
    )

    assert [row["period"] for row in result["financial_history"]] == ["2024", "2025"]
    assert result["financial_history"][-1]["gross_margin_pct"] == 50.0
    assert result["balance"]["net_cash"] == 20.0
    assert result["valuation"]["price_to_fcf"] == 20.0
    assert result["quality"]["roe_pct"] == 24.0
    assert result["quality"]["debt_to_equity"] == 0.78
    assert result["analyst_trend"]["target"]["average"] == 100.0


def test_fetch_stock_facts_uses_yahoo_only_for_missing_depth_sections() -> None:
    instrument = {"instrument_id": "US_NOK", "market": "US", "ticker": "NOK"}
    yahoo = {
        "financials": {"revenue": 90, "source": "yfinance"},
        "financial_history": [{"period": "2025", "revenue": 90}],
        "balance": {"net_cash": 10},
        "valuation": {"forward_pe": 14},
        "quality": {"roe_pct": 12},
        "analyst_trend": {"target": {"average": 8}, "recommendation_trend": []},
    }
    with (
        patch("backend.providers.stock_facts_provider._parse_finviz_snapshot", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_nasdaq_analyst", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_nasdaq_institutions", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_financials", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_quarters", return_value={"quarters": []}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_statistics", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_dividends", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_metrics", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_forecast", return_value={}),
        patch("backend.providers.stock_facts_provider._fetch_yahoo_financial_depth", return_value=yahoo),
    ):
        result = fetch_stock_facts(instrument)

    assert result["financial_history"] == yahoo["financial_history"]
    assert result["balance"]["net_cash"] == 10
    assert result["source_status"]["sources"][-1] == "yfinance"


def test_financials_read_the_tables_currency_and_scale() -> None:
    html = "<div>Financials in thousands TWD. Fiscal year is January - December.</div>" + _table("Revenue & Profits", [
        ["Fiscal Year", "TTM", "FY 2025"],
        ["Revenue Revenue Growth", "4,000", "3,000"],
        ["Revenue Growth", "33.33%", "10.00%"],
        ["Earnings Per Share EPS Growth", "8.72", "7.46"],
    ])
    with patch("backend.providers.stock_facts_provider._get_stockanalysis_text", return_value=html):
        result = _parse_stockanalysis_financials("TSM")

    assert result["financials"]["currency"] == "TWD"
    assert result["financials"]["revenue"] == 4_000_000
    assert result["financial_history"][1]["revenue"] == 3_000_000
    assert result["financials"]["eps_diluted"] == 8.72


def test_quarterly_sales_come_newest_first_with_their_period_ends() -> None:
    html = "<div>Financials in millions USD.</div>" + _table("Revenue & Profits", [
        ["Fiscal Quarter", "Q3 2026", "Q2 2026", "Q1 2026"],
        ["Period Ending", "Sep '26 Sep 30, 2026", "Jun '26 Jun 30, 2026", "Mar '26 Mar 31, 2026"],
        ["Revenue Revenue Growth", "4,994", "-", "9,143"],
        ["Revenue Growth", "1.32%", "-", "2.44%"],
    ])
    with patch("backend.providers.stock_facts_provider._get_stockanalysis_text", return_value=html) as get_text:
        result = _parse_stockanalysis_quarters("HON")

    assert get_text.call_args.args[0] == "https://stockanalysis.com/stocks/hon/financials/?p=quarterly"
    assert result["currency"] == "USD"
    assert result["quarters"] == [
        {"period": "Q3 2026", "end": "2026-09-30", "revenue": 4_994_000_000},
        {"period": "Q2 2026", "end": "2026-06-30", "revenue": None},
        {"period": "Q1 2026", "end": "2026-03-31", "revenue": 9_143_000_000},
    ]


def _quarters(values: list[float], last_end: str = "2026-09-30") -> list[dict]:
    ends = ["2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31", "2024-12-31"]
    return [{"period": f"Q{index}", "end": end, "revenue": value} for index, (end, value) in enumerate(zip(ends, values))]


def _with_sources(financial_result: dict, quarters: dict, fx: float | None = None):
    return (
        patch("backend.providers.stock_facts_provider._parse_finviz_snapshot", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_nasdaq_analyst", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_nasdaq_institutions", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_financials", return_value=financial_result),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_quarters", return_value=quarters),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_statistics", return_value={"quality": {"roe_pct": 1}, "valuation": {"forward_pe": 1}}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_dividends", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_metrics", return_value={}),
        patch("backend.providers.stock_facts_provider._parse_stockanalysis_forecast", return_value={}),
        patch("backend.providers.stock_facts_provider._fx_to_usd", return_value=fx),
    )


def test_fetch_withholds_a_growth_its_own_quarters_cannot_back() -> None:
    # Honeywell, Nov 2026: +79.64% "TTM" growth on $37.7B, while fiscal 2025 grew 7.85% and a quarter is missing.
    financial_result = {
        "financials": {"fiscal_year": "TTM", "revenue": 37_743e6, "revenue_growth_yoy_pct": 79.64, "currency": "USD", "source": "stockanalysis"},
        "financial_history": [
            {"period": "TTM", "revenue": 37_743e6},
            {"period": "FY 2025", "revenue": 37_442e6},
            {"period": "FY 2024", "revenue": 34_717e6},
        ],
        "balance": {"net_cash": 1},
    }
    quarters = {"currency": "USD", "quarters": _quarters([4_994e6, None, 9_143e6, 9_758e6, 4_929e6, 849e6, 8_925e6, None])}
    patches = _with_sources(financial_result, quarters)
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8], patches[9]:
        result = fetch_stock_facts({"instrument_id": "US_HON", "market": "US", "ticker": "HON"})

    assert result["financials"]["revenue_growth_yoy_pct"] is None
    assert result["financials"]["revenue_growth_basis"] == "withheld"
    [record] = result["withheld"]
    assert record["field"] == "financials.revenue_growth_yoy_pct"
    assert record["value"] == 79.64
    assert record["action"] == "withheld"
    assert record["rule"] == "ttm_growth_vs_fiscal_years"
    assert "Q1, Q7" in record["reason"]


def test_fetch_converts_a_foreign_filers_amounts_and_withholds_its_per_share_figures() -> None:
    financial_result = {
        "financials": {"fiscal_year": "TTM", "revenue": 4_000e9, "revenue_growth_yoy_pct": 25.0, "eps_diluted": 97.48, "currency": "TWD", "source": "stockanalysis"},
        "financial_history": [{"period": "TTM", "revenue": 4_000e9, "eps_diluted": 97.48}, {"period": "FY 2025", "revenue": 3_800e9}, {"period": "FY 2024", "revenue": 2_900e9}],
        "balance": {"net_cash": 100e9},
    }
    quarters = {"currency": "TWD", "quarters": _quarters([1_100e9, 1_000e9, 950e9, 950e9, 880e9, 800e9, 770e9, 750e9])}
    patches = _with_sources(financial_result, quarters, fx=0.03)
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8], patches[9]:
        result = fetch_stock_facts({"instrument_id": "US_TSM", "market": "US", "ticker": "TSM"})

    financials = result["financials"]
    assert financials["revenue"] == 120e9
    assert financials["currency"] == "USD"
    assert financials["reported_currency"] == "TWD"
    assert financials["eps_diluted"] is None
    assert financials["revenue_growth_yoy_pct"] == 25.0
    assert financials["revenue_growth_basis"] == "quarters"
    assert result["balance"]["net_cash"] == 3e9
    assert {record["field"]: record["rule"] for record in result["withheld"]}["financials.eps_diluted"] == "reporting_currency"
