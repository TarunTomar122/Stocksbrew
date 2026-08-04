from datetime import datetime, timezone

from backend.scripts.audit_stock_page_coverage import summarize_stock_page_coverage


def test_stock_page_coverage_reports_missing_and_excludes_macro_rows() -> None:
    instruments = [
        {"instrument_id": "US_AAPL", "ticker": "AAPL", "market": "US", "status": "active"},
        {"instrument_id": "US_NOK", "ticker": "NOK", "market": "US", "status": "active"},
        {"instrument_id": "US_IDX_SPX", "ticker": "SPX", "market": "US", "status": "active", "type": "macro"},
    ]
    prices = {"US_AAPL": {"quote": {"current": 200.0}}}
    facts = {
        "US_AAPL": {
            "quick_stats": {"market_cap": 1},
            "financial_history": [{"period": "2024"}, {"period": "2025"}],
            "valuation": {"forward_pe": 20},
            "quality": {"roe_pct": 30},
            "analyst": {"target_price": 220},
            "captured_at": "2026-08-03T00:00:00+00:00",
        }
    }
    summary = summarize_stock_page_coverage(
        instruments,
        prices,
        facts,
        now=datetime(2026, 8, 4, tzinfo=timezone.utc),
    )

    assert summary["company_count"] == 2
    assert summary["price_coverage"] == 0.5
    assert summary["financial_depth_coverage"] == 0.5
    assert summary["missing_price"] == ["NOK"]
    assert summary["missing_baseline_facts"] == ["NOK"]
