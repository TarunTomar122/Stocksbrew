from __future__ import annotations

import math
import unittest
from unittest.mock import patch

from backend.scripts.sync_price_snapshots import sync_price_snapshots


class FakeStore:
    def __init__(self) -> None:
        self.saved_rows: list[dict] = []
        self.fundamental_rows: list[tuple[str, dict]] = []

    def save_price_snapshots_bulk(self, rows: list[dict]) -> int:
        self.saved_rows = rows
        return len(rows)

    def save_fundamental_snapshots_bulk(self, rows: list[tuple[str, dict]]) -> int:
        self.fundamental_rows = rows
        return len(rows)

    def save_active_price_universe(self, *_args, **_kwargs) -> None:
        pass

    def save_market_price_snapshot(self, *_args, **_kwargs) -> None:
        pass

    def merge_market_price_snapshot(self, *_args, **_kwargs) -> None:
        pass

    def save_stage_watermark(self, *_args, **_kwargs) -> None:
        pass


class SyncPriceSnapshotsTests(unittest.TestCase):
    def test_intraday_snapshot_does_not_write_empty_enrichment(self) -> None:
        store = FakeStore()
        instrument = {
            "instrument_id": "US_NVDA",
            "market": "US",
            "ticker": "NVDA",
            "sector": "Technology",
            "currency": "USD",
        }

        class FakeClient:
            def __init__(self, **_kwargs) -> None:
                pass

            def fetch_quotes(self, _instruments, *, include_fundamentals: bool = True):
                self.__class__.include_fundamentals = include_fundamentals
                return {
                    "US_NVDA": {
                        "captured_at": "2026-07-02T14:30:00+00:00",
                        "currency": "USD",
                        "quote": {
                            "current": 106.0,
                            "previous_close": 100.0,
                            "day_change_abs": 6.0,
                            "day_change_pct": 6.0,
                        },
                    }
                }

        with (
            patch("backend.scripts.sync_price_snapshots.list_instruments", return_value=[instrument]),
            patch("backend.scripts.sync_price_snapshots.YFinanceClient", FakeClient),
        ):
            sync_price_snapshots(
                market="US",
                universe_id="test",
                session_phase="open_check",
                store=store,
            )

        self.assertFalse(FakeClient.include_fundamentals)
        self.assertNotIn("fundamentals", store.saved_rows[0])
        self.assertNotIn("analyst_consensus", store.saved_rows[0])
        self.assertEqual(store.fundamental_rows, [])

    def test_snapshot_recomputes_change_from_current_and_previous_close(self) -> None:
        store = FakeStore()
        instrument = {
            "instrument_id": "US_NVDA",
            "market": "US",
            "ticker": "NVDA",
            "sector": "Technology",
            "currency": "USD",
        }

        class FakeClient:
            def __init__(self, **_kwargs) -> None:
                pass

            def fetch_quotes(self, _instruments, *, include_fundamentals: bool = True):
                return {
                    "US_NVDA": {
                        "captured_at": "2026-07-06T14:30:00+00:00",
                        "currency": "USD",
                        "quote": {
                            "current": 107.0,
                            "previous_close": 105.0,
                            "day_change_abs": 7.0,
                            "day_change_pct": 7.0,
                        },
                    }
                }

        with (
            patch("backend.scripts.sync_price_snapshots.list_instruments", return_value=[instrument]),
            patch("backend.scripts.sync_price_snapshots.YFinanceClient", FakeClient),
        ):
            sync_price_snapshots(
                market="US",
                universe_id="test",
                session_phase="open_check",
                store=store,
            )

        quote = store.saved_rows[0]["quote"]
        self.assertEqual(quote["day_change_abs"], 2.0)
        self.assertEqual(quote["day_change_pct"], 1.9)

    def test_snapshot_rejects_non_finite_quote_instead_of_writing_it(self) -> None:
        store = FakeStore()
        instrument = {
            "instrument_id": "US_AAPL",
            "market": "US",
            "ticker": "AAPL",
            "sector": "Technology",
            "currency": "USD",
        }

        class FakeClient:
            def __init__(self, **_kwargs) -> None:
                pass

            def fetch_quotes(self, _instruments, *, include_fundamentals: bool = True):
                return {
                    "US_AAPL": {
                        "captured_at": "2026-07-15T14:30:00+00:00",
                        "currency": "USD",
                        "quote": {
                            "current": 322.0,
                            "previous_close": math.nan,
                            "day_change_abs": math.nan,
                            "day_change_pct": math.nan,
                        },
                    }
                }

        with (
            patch("backend.scripts.sync_price_snapshots.list_instruments", return_value=[instrument]),
            patch("backend.scripts.sync_price_snapshots.YFinanceClient", FakeClient),
        ):
            result = sync_price_snapshots(
                market="US",
                universe_id="test",
                session_phase="open_check",
                store=store,
            )

        self.assertEqual(store.saved_rows, [])
        self.assertEqual(result["invalid_quote_count"], 1)
        self.assertEqual(result["invalid_instrument_ids"], ["US_AAPL"])


if __name__ == "__main__":
    unittest.main()
