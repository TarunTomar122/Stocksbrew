from __future__ import annotations

import unittest

from backend.providers.tradingview_pivots import (
    PIVOT_COLUMNS,
    fetch_tradingview_pivots_batch,
    normalize_scanner_payload,
)


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class TradingViewPivotsTest(unittest.TestCase):
    def test_normalizes_nearest_named_levels_around_current_price(self) -> None:
        payload = {
            "data": [{
                "s": "NASDAQ:AAPL",
                "d": [305.0, 314.0, 284.0, 259.0, 203.0, 339.0, 370.0, 425.0],
            }],
        }
        result = normalize_scanner_payload(payload, {"AAPL": 305.0}, as_of="2026-08-04")
        self.assertEqual(result["AAPL"]["support"], 284.0)
        self.assertEqual(result["AAPL"]["support_label"], "S1")
        self.assertEqual(result["AAPL"]["resistance"], 314.0)
        self.assertEqual(result["AAPL"]["resistance_label"], "Pivot")
        self.assertEqual(result["AAPL"]["source"], "TradingView monthly pivots")

    def test_batch_tries_each_us_exchange_in_one_request(self) -> None:
        captured = {}

        def requester(url, **kwargs):
            captured.update(kwargs)
            return _Response({"data": []})

        result = fetch_tradingview_pivots_batch(
            ["AAPL"],
            {"AAPL": 305.0},
            requester=requester,
            as_of="2026-08-04",
        )
        self.assertEqual(result, {})
        self.assertEqual(captured["json"]["columns"], list(PIVOT_COLUMNS))
        self.assertEqual(
            captured["json"]["symbols"]["tickers"],
            ["NASDAQ:AAPL", "NYSE:AAPL", "AMEX:AAPL", "CBOE:AAPL"],
        )


if __name__ == "__main__":
    unittest.main()
