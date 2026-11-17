from __future__ import annotations

import math
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from backend.scripts.sync_price_snapshots import coverage_exemptions, sync_price_snapshots


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

    def get_latest_prices(self, _instrument_ids: list[str]) -> dict[str, dict]:
        return {}


class SyncPriceSnapshotsTests(unittest.TestCase):
    def test_postclose_price_phase_never_requests_fundamentals(self) -> None:
        store = FakeStore()
        instrument = {
            "instrument_id": "US_MSFT",
            "market": "US",
            "ticker": "MSFT",
            "currency": "USD",
        }

        class FakeClient:
            def __init__(self, **_kwargs) -> None:
                pass

            def fetch_quotes(self, _instruments, *, include_fundamentals: bool = True):
                self.__class__.include_fundamentals = include_fundamentals
                return {}

        with (
            patch("backend.scripts.sync_price_snapshots.list_instruments", return_value=[instrument]),
            patch("backend.scripts.sync_price_snapshots.YFinanceClient", FakeClient),
        ):
            sync_price_snapshots(
                market="US",
                universe_id="test",
                session_phase="post_close",
                store=store,
            )
        self.assertFalse(FakeClient.include_fundamentals)

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
                        "recent_sessions": [
                            {"date": "2026-07-01", "close": 100.0, "change_pct": None},
                            {"date": "2026-07-02", "close": 106.0, "change_pct": 6.0},
                        ],
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
                now=datetime(2026, 7, 2, 15, 0, tzinfo=timezone.utc),
            )

        self.assertFalse(FakeClient.include_fundamentals)
        self.assertNotIn("fundamentals", store.saved_rows[0])
        self.assertNotIn("analyst_consensus", store.saved_rows[0])
        self.assertEqual(len(store.saved_rows[0]["recent_sessions"]), 2)
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
                now=datetime(2026, 7, 6, 15, 0, tzinfo=timezone.utc),
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
                now=datetime(2026, 7, 15, 15, 0, tzinfo=timezone.utc),
            )

        self.assertEqual(store.saved_rows, [])
        self.assertEqual(result["invalid_quote_count"], 1)
        self.assertEqual(result["invalid_instrument_ids"], ["US_AAPL"])

    def test_scheduled_snapshot_rejects_a_prior_session_even_when_fetched_now(self) -> None:
        store = FakeStore()
        instrument = {
            "instrument_id": "US_AAPL",
            "market": "US",
            "ticker": "AAPL",
            "currency": "USD",
        }

        class FakeClient:
            def __init__(self, **_kwargs) -> None:
                pass

            def fetch_quotes(self, _instruments, *, include_fundamentals: bool = True):
                return {
                    "US_AAPL": {
                        "captured_at": "2026-07-29T20:00:00+00:00",
                        "currency": "USD",
                        "quote": {
                            "current": 200.0,
                            "previous_close": 198.0,
                            "day_change_abs": 2.0,
                            "day_change_pct": 1.01,
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
                now=datetime(2026, 7, 30, 14, 0, tzinfo=timezone.utc),
            )

        self.assertEqual(store.saved_rows, [])
        self.assertEqual(result["stale_session_quote_count"], 1)
        self.assertEqual(result["stale_session_instrument_ids"], ["US_AAPL"])



class CoverageExemptionTests(unittest.TestCase):
    NOW = datetime(2026, 11, 16, 21, 10, tzinfo=timezone.utc)
    INSTRUMENTS = [
        {"instrument_id": "US_AAPL"},
        {"instrument_id": "US_MSFT"},
        {"instrument_id": "US_BARIX", "asset_type": "fund", "fund_kind": "mutual_fund"},
        {"instrument_id": "US_QDF", "asset_type": "fund", "fund_kind": "etf"},
        {"instrument_id": "US_EA"},
        {"instrument_id": "US_NEW"},
    ]
    # A healthy batch: these price, so the two dead listings above are a handful, not an outage.
    PRICED = [{"instrument_id": f"US_OK{i}"} for i in range(6)]
    PRICED_IDS = {"US_AAPL", *(item["instrument_id"] for item in PRICED)}
    LATEST = {
        "US_MSFT": {"captured_at": "2026-11-13T20:59:00+00:00"},
        "US_BARIX": {"captured_at": "2026-11-14T08:10:45.412851+00:00"},
        "US_QDF": {"captured_at": "2026-11-13T20:22:00Z"},
        "US_EA": {"captured_at": "2026-08-04T19:59:00+00:00"},
    }

    def test_funds_in_session_and_dead_listings_are_exempt_but_a_recent_miss_is_not(self) -> None:
        out = coverage_exemptions(self.INSTRUMENTS + self.PRICED, self.PRICED_IDS, self.LATEST, require_current_session=True, now=self.NOW)
        # MSFT and the ETF priced three days ago: missing them today is an outage and counts.
        self.assertEqual(out, {"mutual_fund": ["US_BARIX"], "dead_listing": ["US_EA", "US_NEW"]})

    def test_a_mutual_fund_counts_outside_market_hours(self) -> None:
        out = coverage_exemptions(self.INSTRUMENTS + self.PRICED, self.PRICED_IDS, self.LATEST, require_current_session=False, now=self.NOW)
        self.assertEqual(out["dead_listing"], ["US_EA", "US_NEW"])
        self.assertEqual(out["mutual_fund"], [])
        self.assertNotIn("US_BARIX", out["dead_listing"])

    def test_saved_instruments_are_never_exempt(self) -> None:
        saved = {item["instrument_id"] for item in self.INSTRUMENTS}
        out = coverage_exemptions(self.INSTRUMENTS, saved, self.LATEST, require_current_session=True, now=self.NOW)
        self.assertEqual(out, {"mutual_fund": [], "dead_listing": []})

    def test_a_feed_outage_never_reads_as_dead_listings(self) -> None:
        # Nothing priced (a Yahoo block over a week old leaves every symbol "unpriced for 7 days"): all count.
        out = coverage_exemptions(self.INSTRUMENTS + self.PRICED, set(), self.LATEST, require_current_session=True, now=self.NOW)
        self.assertEqual(out, {"mutual_fund": ["US_BARIX"], "dead_listing": []})
        # Some priced, but far more than a handful look dead: still the feed.
        instruments = [{"instrument_id": f"US_X{i}"} for i in range(10)]
        out = coverage_exemptions(instruments, {"US_X0", "US_X1"}, {}, require_current_session=True, now=self.NOW)
        self.assertEqual(out["dead_listing"], [])
        # A handful in a healthy batch are exempt.
        out = coverage_exemptions(instruments, {f"US_X{i}" for i in range(8)}, {}, require_current_session=True, now=self.NOW)
        self.assertEqual(out["dead_listing"], ["US_X8", "US_X9"])

    def test_dead_listing_age_reads_every_stored_timestamp_shape(self) -> None:
        instruments = [{"instrument_id": "US_A"}, {"instrument_id": "US_B"}, {"instrument_id": "US_C"}, {"instrument_id": "US_D"}]
        latest = {
            "US_A": {"captured_at": "2026-11-13"},  # date only: midnight UTC, 3 days old
            "US_B": {"captured_at": "2026-11-09T20:00:00"},  # naive: read as UTC, 7 days 1 hour old
            "US_C": {"captured_at": "not a date"},
            "US_D": {"captured_at": "2026-11-16T15:00:00-05:00"},  # offset: 20:00 UTC today
        }
        priced = [{"instrument_id": f"US_S{i}"} for i in range(20)]
        saved = {item["instrument_id"] for item in priced}
        out = coverage_exemptions(instruments + priced, saved, latest, require_current_session=True, now=self.NOW)
        self.assertEqual(out["dead_listing"], ["US_B", "US_C"])

    def _run_sync(self, store: FakeStore) -> dict:
        class FakeClient:
            def __init__(self, **_kwargs) -> None:
                pass

            def fetch_quotes(self, instruments, *, include_fundamentals: bool = True):
                return {
                    item["instrument_id"]: {
                        "captured_at": "2026-11-16T20:59:00+00:00",
                        "quote": {"current": 101.0, "previous_close": 100.0, "day_change_abs": 1.0, "day_change_pct": 1.0},
                    }
                    for item in instruments
                    if item["instrument_id"] in priced_ids
                }

        priced_ids = self.PRICED_IDS
        instruments = [
            {**item, "market": "US", "ticker": item["instrument_id"][3:], "currency": "USD"}
            for item in self.INSTRUMENTS + self.PRICED
        ]
        with (
            patch("backend.scripts.sync_price_snapshots.list_instruments", return_value=instruments),
            patch("backend.scripts.sync_price_snapshots.YFinanceClient", FakeClient),
        ):
            return sync_price_snapshots(market="US", universe_id="test", session_phase="post_close", store=store, now=self.NOW)

    def test_sync_reports_the_coverage_count(self) -> None:
        store = FakeStore()
        calls: list[tuple[str, list[str]]] = []

        def latest(ids):
            calls.append(("read", list(ids)))
            return {iid: row for iid, row in self.LATEST.items() if iid in ids}

        save = store.save_price_snapshots_bulk

        def saving(rows):
            calls.append(("save", [row["instrument_id"] for row in rows]))
            return save(rows)

        store.get_latest_prices = latest  # type: ignore[method-assign]
        store.save_price_snapshots_bulk = saving  # type: ignore[method-assign]
        result = self._run_sync(store)
        # Last prices are read for the failures only, and before this run's rows land.
        self.assertEqual(
            calls,
            [("read", ["US_MSFT", "US_BARIX", "US_QDF", "US_EA", "US_NEW"]), ("save", sorted(self.PRICED_IDS))],
        )
        self.assertEqual(result["input_count"], 12)
        self.assertEqual(result["saved_count"], 7)
        # BARIX (fund before its NAV), EA (last priced Aug 4) and NEW (never priced) are left out; MSFT and QDF count.
        self.assertEqual(result["coverage_input_count"], 9)
        self.assertEqual(
            result["coverage_exempt_instrument_ids"],
            {"mutual_fund": ["US_BARIX"], "dead_listing": ["US_EA", "US_NEW"]},
        )

    def test_sync_counts_every_failure_when_last_prices_cannot_be_read(self) -> None:
        store = FakeStore()

        def broken(_ids):
            raise RuntimeError("db down")

        store.get_latest_prices = broken  # type: ignore[method-assign]
        result = self._run_sync(store)
        self.assertEqual(result["coverage_input_count"], 12)
        self.assertEqual(result["coverage_exempt_instrument_ids"], {"mutual_fund": [], "dead_listing": []})


if __name__ == "__main__":
    unittest.main()
