from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import pandas as pd

from backend.providers.yfinance_provider import (
    YFinanceClient,
    fetch_yfinance_scorecard_metrics_batch,
    yahoo_symbol_for,
)


class YFinanceProviderTest(unittest.TestCase):
    def test_yahoo_symbol_for_us(self) -> None:
        instrument = {
            "market": "US",
            "ticker": "NVDA",
            "quote_symbol": "NVDA",
            "exchange": "NASDAQ",
        }
        self.assertEqual(yahoo_symbol_for(instrument), "NVDA")

    def test_yahoo_symbol_for_india_nse(self) -> None:
        instrument = {
            "market": "IN",
            "ticker": "RELIANCE",
            "quote_symbol": "RELIANCE",
            "quote_exchange": "NSE",
        }
        self.assertEqual(yahoo_symbol_for(instrument), "RELIANCE.NS")

    def test_yahoo_symbol_for_india_bse(self) -> None:
        instrument = {
            "market": "IN",
            "ticker": "TCS",
            "quote_symbol": "TCS",
            "quote_exchange": "BSE",
        }
        self.assertEqual(yahoo_symbol_for(instrument), "TCS.BO")

    def test_quote_only_fetch_uses_intraday_price_without_enrichment_keys(self) -> None:
        daily = pd.DataFrame(
            [
                {"Open": 99.0, "High": 101.0, "Low": 98.0, "Close": 100.0, "Volume": 10},
                {"Open": 102.0, "High": 106.0, "Low": 101.0, "Close": 105.0, "Volume": 20},
            ],
            index=[
                datetime(2026, 7, 1, tzinfo=timezone.utc),
                datetime(2026, 7, 2, tzinfo=timezone.utc),
            ],
        )
        intraday = pd.DataFrame(
            [{"Open": 105.0, "High": 107.0, "Low": 104.0, "Close": 106.0, "Volume": 5}],
            index=[datetime(2026, 7, 2, 14, 30, tzinfo=timezone.utc)],
        )

        def fake_download(*_args, **kwargs):
            return intraday if kwargs["interval"] == "1m" else daily

        instrument = {
            "instrument_id": "US_NVDA",
            "market": "US",
            "ticker": "NVDA",
            "quote_symbol": "NVDA",
            "exchange": "NASDAQ",
            "currency": "USD",
        }
        with patch("backend.providers.yfinance_provider.yf.download", side_effect=fake_download):
            row = YFinanceClient(max_workers=1).fetch_quotes(
                [instrument],
                include_fundamentals=False,
            )["US_NVDA"]

        self.assertEqual(row["quote"]["current"], 106.0)
        self.assertEqual(row["quote"]["previous_close"], 100.0)
        self.assertNotIn("fundamentals", row)
        self.assertNotIn("analyst_consensus", row)

    def test_scorecard_metrics_batch_reuses_info_parser(self) -> None:
        class FakeTicker:
            info = {
                "forwardPE": 22,
                "targetMeanPrice": 150,
                "recommendationMean": 1.8,
            }

            def __init__(self, _symbol: str) -> None:
                pass

        instrument = {
            "instrument_id": "US_NVDA",
            "market": "US",
            "ticker": "NVDA",
            "quote_symbol": "NVDA",
        }
        with patch("backend.providers.yfinance_provider.yf.Ticker", FakeTicker):
            rows = fetch_yfinance_scorecard_metrics_batch([instrument], max_workers=1)

        self.assertEqual(rows["US_NVDA"]["fwd_pe"], 22)
        self.assertEqual(rows["US_NVDA"]["target_price"], 150)
        self.assertEqual(rows["US_NVDA"]["analyst_buy_pct"], 80.0)

    def test_full_quote_fetch_batches_history_but_keeps_info_fundamentals(self) -> None:
        history = pd.DataFrame(
            [
                {"Open": 99.0, "High": 101.0, "Low": 98.0, "Close": 100.0, "Volume": 10},
                {"Open": 104.0, "High": 107.0, "Low": 103.0, "Close": 106.0, "Volume": 20},
            ],
            index=[
                datetime(2026, 7, 1, tzinfo=timezone.utc),
                datetime(2026, 7, 2, tzinfo=timezone.utc),
            ],
        )

        class FakeTicker:
            fast_info = {}
            info = {
                "shortName": "Nvidia",
                "currency": "USD",
                "regularMarketPrice": 106,
                "regularMarketPreviousClose": 100,
                "marketCap": 1000,
                "trailingPE": 30,
                "targetMeanPrice": 120,
            }

            def __init__(self, _symbol: str) -> None:
                pass

            def history(self, *_args, **_kwargs):
                raise AssertionError("full fetch should use batched download history")

        instrument = {
            "instrument_id": "US_NVDA",
            "market": "US",
            "ticker": "NVDA",
            "quote_symbol": "NVDA",
            "exchange": "NASDAQ",
            "currency": "USD",
        }
        with (
            patch("backend.providers.yfinance_provider.yf.download", return_value=history) as download,
            patch("backend.providers.yfinance_provider.yf.Ticker", FakeTicker),
        ):
            row = YFinanceClient(max_workers=1).fetch_quotes([instrument])["US_NVDA"]

        self.assertEqual(download.call_count, 1)
        self.assertEqual(row["quote"]["current"], 106)
        self.assertEqual(row["fundamentals"]["market_cap"], 1000)
        self.assertEqual(row["analyst_consensus"]["target_price"], 120)

    def test_weekly_quotes_use_batched_download(self) -> None:
        history = pd.DataFrame(
            [{"Close": value} for value in [100, 101, 102, 103, 110]],
            index=pd.date_range("2026-06-26", periods=5, tz=timezone.utc),
        )

        calls = []

        def fake_download(*_args, **kwargs):
            calls.append(kwargs)
            return history

        instrument = {
            "instrument_id": "US_NVDA",
            "market": "US",
            "ticker": "NVDA",
            "quote_symbol": "NVDA",
        }
        with patch("backend.providers.yfinance_provider.yf.download", side_effect=fake_download):
            from backend.providers.yfinance_provider import fetch_weekly_quotes

            rows = fetch_weekly_quotes([instrument])

        self.assertEqual(len(calls), 1)
        self.assertEqual(rows["US_NVDA"]["week_change_pct"], 10.0)

    def test_premarket_quotes_use_batched_prepost_download(self) -> None:
        daily = pd.DataFrame(
            [
                {"Open": 99.0, "High": 101.0, "Low": 98.0, "Close": 100.0, "Volume": 10},
                {"Open": 100.0, "High": 102.0, "Low": 99.0, "Close": 101.0, "Volume": 20},
            ],
            index=[
                datetime(2026, 7, 1, tzinfo=timezone.utc),
                datetime(2026, 7, 2, tzinfo=timezone.utc),
            ],
        )
        intraday = pd.DataFrame(
            [{"Open": 104.0, "High": 105.0, "Low": 103.0, "Close": 104.0, "Volume": 5}],
            index=[datetime.now(timezone.utc)],
        )
        calls = []

        def fake_download(*_args, **kwargs):
            calls.append(kwargs)
            return intraday if kwargs["interval"] == "1m" else daily

        instrument = {
            "instrument_id": "US_NVDA",
            "market": "US",
            "ticker": "NVDA",
            "quote_symbol": "NVDA",
        }
        with patch("backend.providers.yfinance_provider.yf.download", side_effect=fake_download):
            from backend.providers.yfinance_provider import fetch_premarket_quotes

            rows = fetch_premarket_quotes([instrument])

        self.assertEqual(len(calls), 2)
        self.assertTrue(calls[1]["prepost"])
        self.assertEqual(rows["US_NVDA"]["pre_market_price"], 104.0)
        self.assertEqual(rows["US_NVDA"]["previous_close"], 100.0)


if __name__ == "__main__":
    unittest.main()
