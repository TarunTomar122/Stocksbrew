from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pandas as pd

from backend.providers.yfinance_provider import (
    YFinanceClient,
    fetch_yfinance_scorecard_metrics_batch,
    yahoo_symbol_for,
)


class YFinanceProviderTest(unittest.TestCase):
    @staticmethod
    def _current_us_session_timestamp() -> str:
        local = datetime.now(ZoneInfo("America/New_York")).replace(
            hour=10,
            minute=0,
            second=0,
            microsecond=0,
        )
        return local.astimezone(timezone.utc).isoformat()

    def test_quote_only_missing_symbols_are_retried_as_a_batch_not_info(self) -> None:
        instruments = [
            {
                "instrument_id": "US_AAPL",
                "market": "US",
                "ticker": "AAPL",
                "quote_symbol": "AAPL",
            },
            {
                "instrument_id": "US_MSFT",
                "market": "US",
                "ticker": "MSFT",
                "quote_symbol": "MSFT",
            },
        ]

        def quote(price: float) -> dict:
            return {
                "current": price,
                "day_change_abs": 1.0,
                "day_change_pct": 1.0,
                "open": price - 1,
                "high": price,
                "low": price - 2,
                "previous_close": price - 1,
                "volume": 100,
                "captured_at": self._current_us_session_timestamp(),
            }

        with patch(
            "backend.providers.yfinance_provider._batch_download_quote_only",
            side_effect=[
                {"AAPL": quote(200)},
                {"MSFT": quote(500)},
            ],
        ) as batched, patch.object(
            YFinanceClient,
            "_fetch_one_with_retry",
            side_effect=AssertionError("price lane must not call .info"),
        ):
            rows = YFinanceClient(max_retries=1, retry_backoff_s=0).fetch_quotes(
                instruments,
                include_fundamentals=False,
            )

        self.assertEqual(set(rows), {"US_AAPL", "US_MSFT"})
        self.assertEqual(batched.call_count, 2)
        self.assertEqual(batched.call_args_list[1].args[0], ["MSFT"])

    def test_quote_only_retries_stale_session_rows_not_just_missing_rows(self) -> None:
        instruments = [
            {
                "instrument_id": "US_AAPL",
                "market": "US",
                "ticker": "AAPL",
                "quote_symbol": "AAPL",
            }
        ]

        def quote(price: float, captured_at: str) -> dict:
            return {
                "current": price,
                "day_change_abs": 1.0,
                "day_change_pct": 1.0,
                "open": price - 1,
                "high": price,
                "low": price - 2,
                "previous_close": price - 1,
                "volume": 100,
                "captured_at": captured_at,
            }

        with patch(
            "backend.providers.yfinance_provider._batch_download_quote_only",
            side_effect=[
                {"AAPL": quote(199, "2020-01-02T14:00:00+00:00")},
                {"AAPL": quote(200, self._current_us_session_timestamp())},
            ],
        ) as batched:
            rows = YFinanceClient(max_retries=1, retry_backoff_s=0).fetch_quotes(
                instruments,
                include_fundamentals=False,
            )

        self.assertEqual(rows["US_AAPL"]["quote"]["current"], 200)
        self.assertEqual(batched.call_count, 2)
        self.assertEqual(batched.call_args_list[1].args[0], ["AAPL"])

    def test_quote_only_reuses_one_symbol_quote_for_duplicate_instrument_ids(self) -> None:
        instruments = [
            {
                "instrument_id": "US_GOOG",
                "market": "US",
                "ticker": "GOOG",
                "quote_symbol_yahoo": "GOOG",
            },
            {
                "instrument_id": "US_GOOG_LEGACY",
                "market": "US",
                "ticker": "GOOG",
                "quote_symbol_yahoo": "GOOG",
            },
        ]
        quote = {
            "current": 200.0,
            "day_change_abs": 2.0,
            "day_change_pct": 1.0,
            "open": 198.0,
            "high": 201.0,
            "low": 197.0,
            "previous_close": 198.0,
            "volume": 100,
            "captured_at": "2026-07-30T14:00:00+00:00",
        }
        with patch(
            "backend.providers.yfinance_provider._batch_download_quote_only",
            return_value={"GOOG": quote},
        ) as batched:
            rows = YFinanceClient(max_retries=0).fetch_quotes(
                instruments,
                include_fundamentals=False,
            )

        self.assertEqual(set(rows), {"US_GOOG", "US_GOOG_LEGACY"})
        self.assertEqual(batched.call_args.args[0], ["GOOG"])

    def test_yahoo_symbol_for_us(self) -> None:
        instrument = {
            "market": "US",
            "ticker": "NVDA",
            "quote_symbol": "NVDA",
            "exchange": "NASDAQ",
        }
        self.assertEqual(yahoo_symbol_for(instrument), "NVDA")

    def test_yahoo_symbol_for_us_dot_class_uses_dash(self) -> None:
        instrument = {
            "market": "US",
            "ticker": "BF.B",
            "quote_symbol": "BF.B",
            "exchange": "NYSE",
        }
        self.assertEqual(yahoo_symbol_for(instrument), "BF-B")

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
        self.assertEqual(
            row["recent_sessions"],
            [
                {"date": "2026-07-01", "close": 100.0, "volume": 10.0, "change_pct": None},
                {"date": "2026-07-02", "close": 106.0, "change_pct": 6.0, "volume": 20.0},
            ],
        )
        self.assertNotIn("fundamentals", row)
        self.assertNotIn("analyst_consensus", row)

    def test_quote_only_fetch_uses_latest_daily_close_when_intraday_is_newer(self) -> None:
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
            [{"Open": 106.0, "High": 108.0, "Low": 105.0, "Close": 107.0, "Volume": 5}],
            index=[datetime(2026, 7, 6, 14, 30, tzinfo=timezone.utc)],
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
        class FakeTicker:
            history_metadata = {"previousClose": 105.0}

        with (
            patch("backend.providers.yfinance_provider.yf.download", side_effect=fake_download),
            patch("backend.providers.yfinance_provider.yf.Ticker", return_value=FakeTicker()),
        ):
            row = YFinanceClient(max_workers=1).fetch_quotes(
                [instrument],
                include_fundamentals=False,
            )["US_NVDA"]

        self.assertEqual(row["quote"]["current"], 107.0)
        self.assertEqual(row["quote"]["previous_close"], 105.0)
        self.assertEqual(row["quote"]["day_change_pct"], 1.9)

    def test_quote_only_fetch_repairs_missing_previous_session_from_metadata(self) -> None:
        daily = pd.DataFrame(
            [
                {"Open": 99.0, "High": 101.0, "Low": 98.0, "Close": 100.0, "Volume": 10},
                {"Open": float("nan"), "High": float("nan"), "Low": float("nan"), "Close": float("nan"), "Volume": float("nan")},
                {"Open": 104.0, "High": 107.0, "Low": 103.0, "Close": 105.0, "Volume": 20},
            ],
            index=[
                datetime(2026, 7, 13, tzinfo=timezone.utc),
                datetime(2026, 7, 14, tzinfo=timezone.utc),
                datetime(2026, 7, 15, tzinfo=timezone.utc),
            ],
        )
        intraday = pd.DataFrame(
            [{"Open": 105.0, "High": 107.0, "Low": 104.0, "Close": 106.0, "Volume": 5}],
            index=[datetime(2026, 7, 15, 14, 30, tzinfo=timezone.utc)],
        )

        def fake_download(*_args, **kwargs):
            return intraday if kwargs["interval"] == "1m" else daily

        instrument = {
            "instrument_id": "US_AAPL",
            "market": "US",
            "ticker": "AAPL",
            "quote_symbol": "AAPL",
            "exchange": "NASDAQ",
            "currency": "USD",
        }
        class FakeTicker:
            history_metadata = {"previousClose": 104.0}

        with (
            patch("backend.providers.yfinance_provider.yf.download", side_effect=fake_download),
            patch("backend.providers.yfinance_provider.yf.Ticker", return_value=FakeTicker()),
        ):
            row = YFinanceClient(max_workers=1).fetch_quotes(
                [instrument],
                include_fundamentals=False,
            )["US_AAPL"]

        self.assertEqual(row["quote"]["current"], 106.0)
        self.assertEqual(row["quote"]["previous_close"], 104.0)
        self.assertEqual(row["quote"]["day_change_pct"], 1.92)
        self.assertEqual(
            row["recent_sessions"][-1],
            {"date": "2026-07-15", "close": 106.0, "change_pct": 1.92, "volume": 20.0},
        )

    def test_quote_only_fetch_flattens_single_symbol_multiindex_download(self) -> None:
        index = [
            datetime(2026, 7, 1, tzinfo=timezone.utc),
            datetime(2026, 7, 2, tzinfo=timezone.utc),
        ]
        daily = pd.DataFrame(
            {
                ("Close", "RDDT"): [100.0, 105.0],
                ("Open", "RDDT"): [99.0, 102.0],
                ("High", "RDDT"): [101.0, 106.0],
                ("Low", "RDDT"): [98.0, 101.0],
                ("Volume", "RDDT"): [10, 20],
            },
            index=index,
        )
        daily.columns = pd.MultiIndex.from_tuples(daily.columns, names=["Price", "Ticker"])
        intraday = daily.iloc[[-1]].copy()

        def fake_download(*_args, **kwargs):
            return intraday if kwargs["interval"] == "1m" else daily

        instrument = {
            "instrument_id": "US_RDDT",
            "market": "US",
            "ticker": "RDDT",
            "quote_symbol": "RDDT",
            "exchange": "NYSE",
            "currency": "USD",
        }
        with patch("backend.providers.yfinance_provider.yf.download", side_effect=fake_download):
            row = YFinanceClient(max_workers=1).fetch_quotes(
                [instrument],
                include_fundamentals=False,
            )["US_RDDT"]

        self.assertEqual(row["quote"]["current"], 105.0)
        self.assertEqual(row["quote"]["previous_close"], 100.0)
        self.assertEqual(row["quote"]["day_change_pct"], 5.0)

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
        self.assertEqual(rows["US_NVDA"]["previous_close"], 101.0)
        self.assertEqual(rows["US_NVDA"]["pre_market_change_pct"], 2.97)


if __name__ == "__main__":
    unittest.main()
