from __future__ import annotations

import unittest

from backend.view_materializer import build_dashboard_view, build_instrument_view


class ViewMaterializerTest(unittest.TestCase):
    def test_build_dashboard_view(self) -> None:
        instruments = [
            {
                "instrument_id": "US_NVDA",
                "market": "US",
                "ticker": "NVDA",
                "name": "NVIDIA Corporation",
                "exchange": "NASDAQ",
                "sector": "Technology",
                "industry": "Semiconductors",
                "peer_ids": ["US_AMD"],
                "index_memberships": ["S&P 500"],
                "logo_url": "",
            },
            {
                "instrument_id": "US_AMD",
                "market": "US",
                "ticker": "AMD",
                "name": "Advanced Micro Devices",
                "exchange": "NASDAQ",
                "sector": "Technology",
                "industry": "Semiconductors",
                "peer_ids": ["US_NVDA"],
                "index_memberships": ["NASDAQ 100"],
                "logo_url": "",
            },
        ]
        latest_prices = {
            "US_NVDA": {
                "captured_at": "2026-03-25T15:00:00Z",
                "quote": {
                    "current": 942.89,
                    "day_change_pct": 3.42,
                },
            },
            "US_AMD": {
                "captured_at": "2026-03-25T15:00:00Z",
                "quote": {
                    "current": 164.20,
                    "day_change_pct": 1.81,
                },
            },
        }
        price_history = {
            "US_NVDA": [{"captured_at": "2026-03-25T15:00:00Z", "quote": {"current": 942.89}}],
            "US_AMD": [{"captured_at": "2026-03-25T15:00:00Z", "quote": {"current": 164.20}}],
        }

        view = build_dashboard_view("US", "us_test_5", instruments, latest_prices, price_history)
        self.assertEqual(view["market"], "US")
        self.assertEqual(len(view["watchlist_rows"]), 2)
        self.assertEqual(view["watchlist_rows"][0]["ticker"], "NVDA")

    def test_build_instrument_view(self) -> None:
        instrument = {
            "instrument_id": "US_NVDA",
            "market": "US",
            "ticker": "NVDA",
            "name": "NVIDIA Corporation",
            "exchange": "NASDAQ",
            "sector": "Technology",
            "industry": "Semiconductors",
            "logo_url": "",
            "index_memberships": ["S&P 500"],
        }
        latest_price = {
            "captured_at": "2026-03-25T15:00:00Z",
            "quote": {
                "current": 942.89,
                "day_change_abs": 31.05,
                "day_change_pct": 3.42,
            },
            "fundamentals": {
                "market_cap": 2360000000000,
                "pe_ttm": 75.42,
                "dividend_yield": 0.0002,
                "annual_dividend": 0.04,
                "week_52_low": 380.2,
                "week_52_high": 974.0,
            },
            "analyst_consensus": {
                "label": "Strong Buy",
                "target_price": 1150.0,
                "buy": 42,
                "hold": 6,
                "sell": 1,
            },
        }
        related_rows = [{
            "instrument_id": "US_AMD",
            "ticker": "AMD",
            "name": "Advanced Micro Devices",
            "price": 164.20,
            "day_change_pct": 1.81,
        }]
        points = [
            {
                "captured_at": "2026-03-25T09:45:00Z",
                "session_phase": "open_check",
                "quote": {"current": 912.40, "day_change_pct": 1.10},
            },
            {
                "captured_at": "2026-03-25T15:00:00Z",
                "session_phase": "mid_check",
                "quote": {"current": 942.89, "day_change_pct": 3.42},
            },
        ]

        view = build_instrument_view(instrument, latest_price, related_rows, points)
        self.assertEqual(view["instrument"]["ticker"], "NVDA")
        self.assertEqual(view["momentum_signal"]["label"], "Bullish Momentum")
        self.assertEqual(len(view["timeline"]), 2)
        self.assertEqual(view["fundamentals"]["market_cap"], 2360000000000.0)
        self.assertEqual(view["analyst_consensus"]["label"], "Strong Buy")


if __name__ == "__main__":
    unittest.main()
