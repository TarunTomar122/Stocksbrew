"""Price tails: the last entries of each price history, stamped with the store hash of the history they came from."""

from __future__ import annotations

import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from backend.agentdata import backtest_strategies, prices
from backend.agentdata.store import DocStore


def _history(symbol: str, count: int, *, start_close: float = 10.0) -> dict:
    dates = [f"{2010 + index // 300}-{1 + (index % 300) // 25:02d}-{1 + index % 25:02d}" for index in range(count)]
    closes = [round(start_close + index * 0.01, 4) for index in range(count)]
    return {
        "symbol": symbol,
        "first_date": dates[0],
        "last_date": dates[-1],
        "count": count,
        "dates": dates,
        "closes": closes,
        "source": "yahoo_chart",
        "fetched_at": "2026-11-12T22:40:00+00:00",
    }


class TailDocTest(unittest.TestCase):
    def test_cuts_the_last_entries_by_index_and_names_the_source(self) -> None:
        history = _history("AAPL", 1000)
        path, tail = prices.tail_doc("tm_price_history_daily/AAPL", history)
        self.assertEqual(path, "tm_price_tail/AAPL")
        self.assertEqual(tail["pt_v"], prices.TAIL_VERSION)
        self.assertEqual((tail["pt_n"], tail["pt_from"]), (1000, 1000 - prices.TAIL_POINTS))
        self.assertEqual(tail["pt_data"]["dates"], history["dates"][-prices.TAIL_POINTS:])
        self.assertEqual(tail["pt_data"]["closes"], history["closes"][-prices.TAIL_POINTS:])
        self.assertTrue(tail["pt_ordered"])
        self.assertEqual((tail["pt_source"], tail["pt_fetched_at"]), ("yahoo_chart", "2026-11-12T22:40:00+00:00"))

    def test_short_and_uneven_histories_keep_entries_aligned(self) -> None:
        history = _history("NEW", 30)
        history["closes"] = history["closes"][:25]
        _, tail = prices.tail_doc("tm_price_history_daily/NEW", history)
        self.assertEqual((tail["pt_n"], tail["pt_from"]), (25, 0))
        self.assertEqual(tail["pt_data"]["dates"], history["dates"][:25])

    def test_out_of_order_or_odd_dates_are_flagged(self) -> None:
        history = _history("ODD", 5)
        history["dates"][2] = history["dates"][1]
        self.assertFalse(prices.tail_doc("tm_price_history_daily/ODD", history)[1]["pt_ordered"])
        history = _history("ODD", 5)
        history["dates"][4] = None
        self.assertFalse(prices.tail_doc("tm_price_history_daily/ODD", history)[1]["pt_ordered"])

    def test_no_arrays_no_tail(self) -> None:
        self.assertIsNone(prices.tail_doc("tm_price_history_daily/X", {"symbol": "X"}))

    def test_with_tails_puts_each_tail_after_the_histories(self) -> None:
        docs = [("tm_price_history_daily/A", _history("A", 3)), ("tm_other/B", {"dates": ["2026-01-01"], "closes": [1.0]})]
        paths = [path for path, _ in prices.with_tails(docs)]
        self.assertEqual(paths, ["tm_price_history_daily/A", "tm_other/B", "tm_price_tail/A"])


class TailHashTest(unittest.TestCase):
    """The tail's pt_src must be the hash the store records for the history, or the page never uses the tail."""

    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.store = DocStore(db_path=str(Path(self._dir.name) / "documents.sqlite3"))

    def tearDown(self) -> None:
        self._dir.cleanup()

    def test_tail_names_the_hash_the_store_records(self) -> None:
        history = _history("AAPL", 600)
        history["closes"][5] = 12.0  # an integral float
        history["closes"][6] = 1e-07
        self.store.set_many(prices.with_tails([("tm_price_history_daily/AAPL", history)]))
        rows = self.store.read_with_hashes(["tm_price_history_daily/AAPL", "tm_price_tail/AAPL"], ["pt_src"])
        self.assertEqual(rows["tm_price_tail/AAPL"]["data"]["pt_src"], rows["tm_price_history_daily/AAPL"]["hash"])
        # The hash-only read returns no body.
        self.assertEqual(rows["tm_price_history_daily/AAPL"]["data"], {})

    def test_load_many_writes_tails(self) -> None:
        with mock.patch.object(prices, "fetch_daily", side_effect=lambda symbol, years=12: _history(symbol, 50)), mock.patch.object(
            prices, "_has_fresh_cache", return_value=True
        ):
            prices.load_many(["AAA", "BBB"], store=self.store, log=False)
        rows = self.store.read_with_hashes(
            ["tm_price_history_daily/AAA", "tm_price_tail/AAA", "tm_price_history_daily/BBB", "tm_price_tail/BBB"], ["pt_src"]
        )
        for symbol in ("AAA", "BBB"):
            self.assertEqual(rows[f"tm_price_tail/{symbol}"]["data"]["pt_src"], rows[f"tm_price_history_daily/{symbol}"]["hash"])

    def test_stale_tails_finds_missing_and_old_tails_only(self) -> None:
        current = _history("CUR", 40)
        old = _history("OLD", 40)
        self.store.set_many(prices.with_tails([("tm_price_history_daily/CUR", current), ("tm_price_history_daily/OLD", old)]))
        changed = _history("OLD", 41)
        self.store.set("tm_price_history_daily/OLD", changed)
        missing = _history("MIS", 40)
        self.store.set("tm_price_history_daily/MIS", missing)
        stored = {"tm_price_history_daily/CUR": current, "tm_price_history_daily/OLD": changed, "tm_price_history_daily/MIS": missing}
        self.assertEqual(sorted(path for path, _ in prices.stale_tails(self.store, stored)), ["tm_price_tail/MIS", "tm_price_tail/OLD"])

    def test_stale_tails_leaves_histories_written_since_the_read(self) -> None:
        read = _history("RACE", 40)
        self.store.set("tm_price_history_daily/RACE", read)
        newer = _history("RACE", 41)
        self.store.set_many(prices.with_tails([("tm_price_history_daily/RACE", newer)]))  # another job, after our read
        self.assertEqual(prices.stale_tails(self.store, {"tm_price_history_daily/RACE": read}), [])

    def test_sync_prices_survives_a_failed_repair(self) -> None:
        fresh = _history("NEW", 40)
        with mock.patch.object(prices, "stale_tails", side_effect=RuntimeError("store busy")), redirect_stdout(io.StringIO()) as out:
            self.assertEqual(backtest_strategies.sync_prices(self.store, {"NEW": fresh}), 1)
        self.assertIn("tail repair skipped", out.getvalue())

    def test_sync_prices_writes_tails_with_histories_and_repairs_the_rest(self) -> None:
        unchanged = _history("SAME", 40)
        self.store.set("tm_price_history_daily/SAME", unchanged)  # written before tails existed
        fresh = _history("NEW", 40)
        with redirect_stdout(io.StringIO()):
            self.assertEqual(backtest_strategies.sync_prices(self.store, {"NEW": fresh, "SAME": unchanged}), 1)
        rows = self.store.read_with_hashes(
            ["tm_price_history_daily/NEW", "tm_price_tail/NEW", "tm_price_history_daily/SAME", "tm_price_tail/SAME"], ["pt_src"]
        )
        self.assertEqual(rows["tm_price_tail/NEW"]["data"]["pt_src"], rows["tm_price_history_daily/NEW"]["hash"])
        self.assertEqual(rows["tm_price_tail/SAME"]["data"]["pt_src"], rows["tm_price_history_daily/SAME"]["hash"])



class BackfillTest(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.store = DocStore(db_path=str(Path(self._dir.name) / "documents.sqlite3"))

    def tearDown(self) -> None:
        self._dir.cleanup()

    def test_writes_missing_and_old_tails_once(self) -> None:
        from backend.agentdata import price_tails

        self.store.set_many(prices.with_tails([("tm_price_history_daily/CUR", _history("CUR", 30))]))
        self.store.set("tm_price_history_daily/MIS", _history("MIS", 30))
        self.store.set_many(prices.with_tails([("tm_price_history_daily/OLD", _history("OLD", 30))]))
        self.store.set("tm_price_history_daily/OLD", _history("OLD", 31))
        self.store.set("tm_price_history_daily/BAD", {"symbol": "BAD"})
        self.assertEqual(price_tails.backfill(self.store, dry_run=True)["written"], 0)
        result = price_tails.backfill(self.store)
        self.assertEqual((result["histories"], result["stale"], result["written"], result["no_arrays"]), (4, 3, 2, 1))
        self.assertEqual(result["local_hash_differs"], 0)
        rows = self.store.read_with_hashes([f"tm_price_history_daily/{s}" for s in ("CUR", "MIS", "OLD")], [])
        tails = self.store.read_with_hashes([f"tm_price_tail/{s}" for s in ("CUR", "MIS", "OLD")], ["pt_src"])
        for symbol in ("CUR", "MIS", "OLD"):
            self.assertEqual(tails[f"tm_price_tail/{symbol}"]["data"]["pt_src"], rows[f"tm_price_history_daily/{symbol}"]["hash"])
        self.assertEqual(price_tails.backfill(self.store)["stale"], 1)  # only the doc with no arrays, never written


if __name__ == "__main__":
    unittest.main()
