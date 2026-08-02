from __future__ import annotations

from unittest.mock import patch

from backend.providers.stock_facts_provider import (
    _parse_stockanalysis_dividends,
    _parse_stockanalysis_financials,
    _parse_stockanalysis_forecast,
    _parse_stockanalysis_metrics,
    _parse_stockanalysis_statistics,
    fetch_stock_facts,
)


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

    with patch("backend.providers.stock_facts_provider._get_text", return_value=html):
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

    with patch("backend.providers.stock_facts_provider._get_text", return_value=statistics_html):
        statistics = _parse_stockanalysis_statistics("AAPL")
    with patch("backend.providers.stock_facts_provider._get_text", return_value=dividend_html):
        dividends = _parse_stockanalysis_dividends("AAPL")
    with patch("backend.providers.stock_facts_provider._get_text", return_value=metrics_html):
        metrics = _parse_stockanalysis_metrics("AAPL")
    with patch("backend.providers.stock_facts_provider._get_text", return_value=forecast_html):
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
