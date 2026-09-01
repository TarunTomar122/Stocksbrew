from __future__ import annotations

import unittest

from backend.scripts.build_stock_intel_pro import _enrich_snapshot_from_facts
from backend.stock_scoring import score_stock


class StockIntelFactsFallbackTests(unittest.TestCase):
    def test_rich_stock_facts_make_a_sparse_scrape_scoreable(self) -> None:
        snapshot = {
            "metrics": {"payout_ratio": 40.0},
            "sector_slug": "industrials",
            "sector_label": "Industrials",
        }
        facts = {
            "quick_stats": {
                "pe_ttm": 31.9,
                "eps_next_year_growth_pct": 9.5,
                "institutional_ownership_pct": 82.5,
                "recommendation_score": 2.6,
            },
            "financials": {"revenue_growth_yoy_pct": 17.1},
            "financial_history": [
                {"period": "TTM", "eps_diluted": 11.45, "operating_margin_pct": 19.5},
                {"period": "FY 2025", "eps_diluted": 10.17},
            ],
            "quality": {"roe_pct": 18.8, "debt_to_equity": 0.1},
            "valuation": {"forward_pe": 27.4},
            "analyst": {"target_price": 398.3, "buy": 3, "analyst_count": 7},
            "returns": {"one_month_pct": 5.8, "one_year_pct": 32.1},
        }
        enriched = _enrich_snapshot_from_facts(
            snapshot,
            facts,
            {"quote": {"current": 366.0}},
        )

        result = score_stock(
            {"instrument_id": "US_WTS", "ticker": "WTS", "sector": "Industrials"},
            enriched,
            None,
            {"benchmarks": {"industrials": {"pe": 28.0, "fwd_pe": 24.0}}},
        )

        self.assertGreaterEqual(result["overall"]["coverage"], 0.5)
        self.assertTrue(all(pillar["coverage"] >= 0.5 for pillar in result["pillars"].values()))


if __name__ == "__main__":
    unittest.main()
