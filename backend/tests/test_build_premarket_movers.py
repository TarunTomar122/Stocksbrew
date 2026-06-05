from __future__ import annotations

import unittest

from backend.scripts.build_premarket_movers import _canonicalize_row


class BuildPremarketMoversTest(unittest.TestCase):
    def test_canonicalize_row_prefers_current_universe_ticker_mapping(self) -> None:
        candidates = {
            "US_WRONG": {
                "instrument_id": "US_WRONG",
                "ticker": "CBRS",
                "name": "Airbnb, Inc.",
                "sector": "Consumer Cyclical",
                "logo_url": "",
            }
        }
        by_ticker = {
            "SMCI": {
                "instrument_id": "US_SMCI",
                "ticker": "SMCI",
                "name": "Super Micro Computer Inc.",
                "sector": "Technology",
                "logo_url": "",
            }
        }
        by_id = {row["instrument_id"]: row for row in by_ticker.values()}
        quote = {
            "ticker": "SMCI",
            "pre_market_price": 49.63,
            "previous_close": 47.27,
            "pre_market_change_pct": 5.0,
        }

        row = _canonicalize_row(
            instrument_id="US_WRONG",
            quote=quote,
            candidates=candidates,
            by_ticker=by_ticker,
            by_id=by_id,
        )

        assert row is not None
        self.assertEqual(row["instrument_id"], "US_SMCI")
        self.assertEqual(row["name"], "Super Micro Computer Inc.")
        self.assertEqual(row["ticker"], "SMCI")

    def test_canonicalize_row_drops_unsupported_ticker(self) -> None:
        row = _canonicalize_row(
            instrument_id="US_CBRS",
            quote={
                "ticker": "CBRS",
                "pre_market_price": 232.54,
                "previous_close": 218.55,
                "pre_market_change_pct": 6.4,
            },
            candidates={},
            by_ticker={},
            by_id={},
        )
        self.assertIsNone(row)


if __name__ == "__main__":
    unittest.main()
