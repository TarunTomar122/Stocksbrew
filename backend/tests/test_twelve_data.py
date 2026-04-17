from __future__ import annotations

import unittest

from backend.providers.twelve_data import TwelveDataClient, normalize_batch_quote_payload


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self.payload


class TwelveDataTest(unittest.TestCase):
    def test_normalize_single_quote_payload(self) -> None:
        payload = {
            "symbol": "NVDA",
            "close": "942.89",
            "change": "31.05",
            "percent_change": "3.42",
        }
        normalized = normalize_batch_quote_payload(payload, ["NVDA"])
        self.assertEqual(set(normalized.keys()), {"NVDA"})

    def test_fetch_quotes_handles_batch_payload(self) -> None:
        def requester(*args, **kwargs):
            return FakeResponse({
                "NVDA": {
                    "symbol": "NVDA",
                    "currency": "USD",
                    "last_update_at": "2026-03-25T15:00:00Z",
                    "close": "942.89",
                    "change": "31.05",
                    "percent_change": "3.42",
                    "open": "910.00",
                    "high": "945.00",
                    "low": "905.11",
                    "previous_close": "911.84",
                    "volume": "1234567",
                },
                "AMD": {
                    "symbol": "AMD",
                    "currency": "USD",
                    "last_update_at": "2026-03-25T15:00:00Z",
                    "close": "164.20",
                    "change": "2.92",
                    "percent_change": "1.81",
                    "open": "161.00",
                    "high": "165.00",
                    "low": "160.25",
                    "previous_close": "161.28",
                    "volume": "7654321",
                },
            })

        client = TwelveDataClient(api_key="test-key", requester=requester)
        quotes = client.fetch_quotes(["NVDA", "AMD"])
        self.assertEqual(quotes["NVDA"]["quote"]["current"], 942.89)
        self.assertEqual(quotes["AMD"]["quote"]["day_change_pct"], 1.81)


if __name__ == "__main__":
    unittest.main()
