"""The after-close price write path: index diffs, batched SQLite writes, retries, split steps."""

from __future__ import annotations

import io
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from backend.agentdata import backtest_strategies, prices
from backend.agentdata import store as store_module
from backend.agentdata.store import DocStore
from backend.localdb.query import array_index_rows
from backend.localdb.store import LocalDocumentStore


def _series(symbol: str, dates: list[str], closes: list[float]) -> dict:
    return {
        "symbol": symbol,
        "first_date": dates[0],
        "last_date": dates[-1],
        "count": len(dates),
        "dates": dates,
        "closes": closes,
        "source": "yahoo_chart",
        "fetched_at": f"{dates[-1]}T22:40:00+00:00",
    }


class _TempDb(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self._dir.name) / "documents.sqlite3")
        self.store = DocStore(db_path=self.db_path)

    def tearDown(self) -> None:
        self._dir.cleanup()

    def index_rows(self, path: str) -> set[tuple[str, str, str]]:
        connection = sqlite3.connect(self.db_path)
        try:
            return set(connection.execute("SELECT path, field, value FROM document_array_values WHERE path = ?", (path,)))
        finally:
            connection.close()


class ArrayIndexDiffTest(_TempDb):
    def test_rewrites_leave_exactly_the_rows_a_full_rebuild_would(self) -> None:
        path = "tm_price_history_daily/AAPL"
        first = _series("AAPL", ["2026-11-06", "2026-11-09", "2026-11-10"], [10.0, 11.0, 12.0])
        self.store.set(path, first)
        self.assertEqual(self.index_rows(path), set(array_index_rows(path, first)))

        # A daily refresh: one more session; then a dividend adjustment rescales every close.
        appended = _series("AAPL", ["2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"], [10.0, 11.0, 12.0, 12.5])
        self.store.set(path, appended)
        self.assertEqual(self.index_rows(path), set(array_index_rows(path, appended)))
        adjusted = _series("AAPL", ["2026-11-09", "2026-11-10", "2026-11-11"], [10.9, 11.9, 12.4])
        self.store.set(path, adjusted)
        self.assertEqual(self.index_rows(path), set(array_index_rows(path, adjusted)))

        # Dropping an array field drops its rows; other documents keep theirs.
        other = "tm_price_history_daily/MSFT"
        self.store.set(other, _series("MSFT", ["2026-11-10"], [12.0]))
        self.store.set(path, {"symbol": "AAPL", "tags": ["a", "a", "b"]})
        self.assertEqual(self.index_rows(path), {(path, "tags", rows[2]) for rows in array_index_rows(path, {"tags": ["a", "b"]})})
        self.assertEqual(len(self.index_rows(other)), 2)

    def test_array_contains_queries_follow_the_diffed_index(self) -> None:
        local = LocalDocumentStore(self.db_path)
        local.upsert("tm_agent_x/one", {"tickers": ["AAPL", "MSFT"]})
        local.upsert("tm_agent_x/one", {"tickers": ["MSFT", "NVDA"]})
        from backend.localdb.firestore import LocalFirestoreClient

        client = LocalFirestoreClient(local)
        hits = lambda ticker: [s.id for s in client.collection("tm_agent_x").where("tickers", "array_contains", ticker).stream()]
        self.assertEqual(hits("AAPL"), [])
        self.assertEqual(hits("NVDA"), ["one"])
        self.assertEqual(hits("MSFT"), ["one"])


class SqliteBatchingTest(_TempDb):
    def test_a_batch_is_one_transaction(self) -> None:
        docs = [(f"tm_price_history_daily/S{i}", _series(f"S{i}", ["2026-11-10"], [1.0 + i])) for i in range(30)]
        real = LocalDocumentStore.apply_operations
        calls: list[int] = []

        def counting(self_store, operations, *args, **kwargs):
            operations = list(operations)
            calls.append(len(operations))
            return real(self_store, operations, *args, **kwargs)

        with mock.patch.object(LocalDocumentStore, "apply_operations", counting):
            self.assertEqual(self.store.set_many(docs), 30)
        self.assertEqual(calls, [30])
        self.assertEqual(self.store.get("tm_price_history_daily/S7")["closes"], [8.0])

    def test_sqlite_batches_stay_small_enough_not_to_hold_the_lock_for_long(self) -> None:
        big = {"blob": "x" * (store_module._MAX_SQLITE_BATCH_BYTES // 2 + 10)}
        with mock.patch.object(LocalDocumentStore, "apply_operations", autospec=True, return_value=[]) as apply:
            self.store.set_many([(f"tm_agent_test/{i}", big) for i in range(3)])
        self.assertEqual([len(list(call.args[1])) for call in apply.call_args_list], [1, 1, 1])

    def test_merge_still_merges(self) -> None:
        self.store.set("tm_agent_test/a", {"one": 1, "two": 2})
        self.store.set_many([("tm_agent_test/a", {"two": 3})], merge=True)
        self.assertEqual(self.store.get("tm_agent_test/a"), {"one": 1, "two": 3})

    def test_get_many_reads_in_one_query_and_keys_by_the_given_path(self) -> None:
        self.store.set_many([("tm_agent_test/a", {"v": 1}), ("tm_agent_test/b", {"v": 2})])
        found = self.store.get_many(["tm_agent_test/a", "tm_agent_test/missing", "tm_agent_test/b", "tm_agent_test/a"])
        self.assertEqual(found, {"tm_agent_test/a": {"v": 1}, "tm_agent_test/b": {"v": 2}})
        self.assertEqual(self.store.get_many([]), {})


class WriteRetryTest(unittest.TestCase):
    def test_a_broken_database_is_not_retried(self) -> None:
        store = mock.Mock()
        store.set_many.side_effect = sqlite3.OperationalError("database or disk is full")
        with mock.patch.object(backtest_strategies.time, "sleep") as sleep, self.assertRaises(sqlite3.OperationalError):
            backtest_strategies.write_with_retry(store, [("a/1", {})])
        sleep.assert_not_called()

    def test_a_locked_database_is_retried_not_fatal(self) -> None:
        store = mock.Mock()
        store.set_many.side_effect = [sqlite3.OperationalError("database is locked"), 2]
        with mock.patch.object(backtest_strategies.time, "sleep") as sleep, redirect_stdout(io.StringIO()) as out:
            written = backtest_strategies.write_with_retry(store, [("a/1", {}), ("a/2", {})], batch=30, progress="prices")
        self.assertEqual(written, 2)
        sleep.assert_called_once()
        self.assertIn("write retry 1 after: database is locked", out.getvalue())
        self.assertIn("prices: wrote 2 in", out.getvalue())

    def test_sync_prices_writes_only_newer_series_in_large_batches(self) -> None:
        store = mock.Mock()
        store.list.return_value = [
            ("tm_price_history_daily/OLD", {"last_date": "2026-11-09", "fetched_at": "2026-11-09T22:00:00+00:00"}),
            ("tm_price_history_daily/SAME", {"last_date": "2026-11-10", "fetched_at": "2026-11-10T22:00:00+00:00"}),
        ]
        store.set_many.side_effect = lambda chunk: len(chunk)
        series = {
            "OLD": _series("OLD", ["2026-11-10"], [1.0]),
            "SAME": _series("SAME", ["2026-11-10"], [1.0]),
            "NEW": _series("NEW", ["2026-11-10"], [1.0]),
        }
        with redirect_stdout(io.StringIO()):
            self.assertEqual(backtest_strategies.sync_prices(store, series), 2)
        (chunk,), _ = store.set_many.call_args
        # Each history goes out with its tail, in the same write.
        self.assertEqual(
            [path for path, _ in chunk],
            ["tm_price_history_daily/NEW", "tm_price_history_daily/OLD", "tm_price_tail/NEW", "tm_price_tail/OLD"],
        )
        self.assertGreaterEqual(backtest_strategies.PRICE_WRITE_BATCH, 25)


class SteadyClosesTest(unittest.TestCase):
    def test_jitter_keeps_stored_closes_and_real_moves_replace_them(self) -> None:
        stored = _series("A", ["2026-11-06", "2026-11-09", "2026-11-10"], [10.0, 11.0, 12.0])
        fresh = _series("A", ["2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"], [10.0001, 10.9998, 12.0, 12.5])
        steady, changes = backtest_strategies.steady_closes(fresh, stored)
        self.assertEqual(steady["closes"], [10.0, 11.0, 12.0, 12.5])
        self.assertEqual(fresh["closes"], [10.0001, 10.9998, 12.0, 12.5])  # the fetched copy is left alone
        self.assertEqual(changes, 2)  # one new date, one new close
        self.assertEqual({k: v for k, v in steady.items() if k != "closes"}, {k: v for k, v in fresh.items() if k != "closes"})

        rescaled = _series("A", ["2026-11-09", "2026-11-10", "2026-11-11"], [10.95, 11.95, 12.5])
        steady, changes = backtest_strategies.steady_closes(rescaled, stored)
        self.assertIs(steady, rescaled)
        self.assertEqual(steady["closes"], [10.95, 11.95, 12.5])
        self.assertEqual(changes, 2 + 6)  # dates: -11-06, +11-11; closes: three out, three in

    def test_a_series_the_store_lacks_is_written_whole(self) -> None:
        fresh = _series("NEW", ["2026-11-09", "2026-11-10"], [1.0, 2.0])
        steady, changes = backtest_strategies.steady_closes(fresh, None)
        self.assertIs(steady, fresh)
        self.assertEqual(changes, 4)

    def test_batches_end_at_the_doc_or_change_cap_and_a_big_one_goes_alone(self) -> None:
        docs = [(f"p/{i}", {}, cost) for i, cost in enumerate([2, 2, 2, 5000, 2, 2])]
        batches = backtest_strategies.batches_by_changes(docs, max_docs=2, max_changes=100)
        self.assertEqual([[path for path, _ in batch] for batch in batches], [["p/0", "p/1"], ["p/2"], ["p/3"], ["p/4", "p/5"]])
        self.assertEqual(backtest_strategies.batches_by_changes([], max_docs=2, max_changes=100), [])


class LoadManyTest(unittest.TestCase):
    def test_one_failed_fetch_does_not_cost_the_others(self) -> None:
        def fetch(symbol, years=12, **_):
            if symbol == "BAD":
                raise ConnectionResetError("peer reset")
            return {"symbol": symbol}

        with mock.patch.object(prices, "fetch_daily", side_effect=fetch), mock.patch.object(
            prices, "_has_fresh_cache", return_value=True
        ), redirect_stdout(io.StringIO()) as out:
            got = prices.load_many(["A", "BAD", "C"], log=False)
        self.assertEqual(list(got), ["A", "C"])
        self.assertIn("1 fetches failed ['BAD: ConnectionResetError']", out.getvalue())

    def test_dropped_connections_inside_a_fetch_are_retried(self) -> None:
        import http.client

        payload = io.BytesIO(b'{"chart":{"result":[{"timestamp":[1]}]}}')
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = payload.getvalue()
        with mock.patch.object(prices.urllib.request, "urlopen", side_effect=[http.client.RemoteDisconnected("gone"), http.client.IncompleteRead(b""), response]), mock.patch.object(prices.time, "sleep"):
            self.assertEqual(prices._fetch_chart("AAPL", 1), {"timestamp": [1]})

    def test_rate_limits_are_counted_and_reported(self) -> None:
        error = prices.urllib.error.HTTPError("u", 429, "slow down", {}, None)
        before = prices.rate_limited_count()
        with mock.patch.object(prices.urllib.request, "urlopen", side_effect=error), mock.patch.object(prices.time, "sleep"):
            self.assertIsNone(prices._fetch_chart("AAPL", 1))
        self.assertEqual(prices.rate_limited_count() - before, 4)

    def test_parallel_fetch_keeps_order_and_pauses_only_after_network_fetches(self) -> None:
        fresh = {"CACHED"}

        def fetch(symbol, years=12, **_):
            return None if symbol == "GONE" else {"symbol": symbol, "dates": ["2026-11-10"], "closes": [1.0]}

        with mock.patch.object(prices, "fetch_daily", side_effect=fetch), mock.patch.object(
            prices, "_has_fresh_cache", side_effect=lambda symbol, years: symbol in fresh
        ), mock.patch.object(prices.time, "sleep") as sleep:
            out = prices.load_many(["msft", "CACHED", "GONE", "AAPL", "MSFT"], log=False, pause=0.1)
        self.assertEqual(list(out), ["MSFT", "CACHED", "AAPL"])
        self.assertEqual(sleep.call_count, 3)  # MSFT, GONE, AAPL went to the network

    def test_store_writes_follow_the_given_order(self) -> None:
        store = mock.Mock()
        with mock.patch.object(prices, "fetch_daily", side_effect=lambda symbol, years=12, **_: {"symbol": symbol}), mock.patch.object(
            prices, "_has_fresh_cache", return_value=True
        ):
            prices.load_many(["B", "A", "C"], store=store, log=False)
        (written,), _ = store.set_many.call_args
        self.assertEqual([path for path, _ in written], ["tm_price_history_daily/B", "tm_price_history_daily/A", "tm_price_history_daily/C"])


class PricesOnlyStepTest(unittest.TestCase):
    def _run(self, *argv: str) -> tuple[int, mock.Mock, mock.Mock]:
        series = {"SPY": _series("SPY", ["2026-11-09", "2026-11-10"], [1.0, 1.1])}
        with mock.patch.object(backtest_strategies.DocStore, "from_env", return_value=mock.Mock()), mock.patch.object(
            backtest_strategies, "load_instruments", return_value=[]
        ), mock.patch.object(backtest_strategies.prices, "load_many", return_value=series), mock.patch.object(
            backtest_strategies, "sync_prices"
        ) as sync, mock.patch.object(backtest_strategies, "load_facts", side_effect=RuntimeError("stop")) as facts, redirect_stdout(io.StringIO()):
            try:
                code = backtest_strategies.main(list(argv))
            except RuntimeError:
                code = -1
        return code, sync, facts

    def test_prices_only_stores_prices_and_stops(self) -> None:
        code, sync, facts = self._run("--prices-only")
        self.assertEqual(code, 0)
        sync.assert_called_once()
        facts.assert_not_called()

    def test_strategies_step_never_writes_prices(self) -> None:
        code, sync, facts = self._run("--no-price-write")
        self.assertEqual(code, -1)  # went on to the strategies (stopped here by the stub)
        sync.assert_not_called()
        facts.assert_called_once()

    def _wanted(self, *argv: str, covered: list[object]) -> list[str]:
        series = {"SPY": _series("SPY", ["2026-11-09", "2026-11-10"], [1.0, 1.1])}
        patch_covered = mock.patch("backend.agentdata.feeds_common.load_universe", return_value=covered)
        with mock.patch.object(backtest_strategies.DocStore, "from_env", return_value=mock.Mock()), mock.patch.object(
            backtest_strategies, "load_instruments", return_value=[{"ticker": "AAPL"}]
        ), mock.patch.object(backtest_strategies.prices, "load_many", return_value=series) as load_many, mock.patch.object(
            backtest_strategies, "sync_prices"
        ), mock.patch.object(backtest_strategies, "load_facts", side_effect=RuntimeError("stop")), patch_covered, redirect_stdout(io.StringIO()):
            try:
                backtest_strategies.main(list(argv))
            except RuntimeError:
                pass
        return load_many.call_args.args[0]

    def test_prices_only_refreshes_every_covered_stock(self) -> None:
        covered = [mock.Mock(ticker="CBRS"), mock.Mock(ticker="AAPL"), mock.Mock(ticker="NBIS")]
        wanted = self._wanted("--prices-only", covered=covered)
        self.assertIn("CBRS", wanted)
        self.assertIn("NBIS", wanted)
        self.assertEqual(wanted.count("AAPL"), 1)

    def test_the_strategies_run_keeps_its_own_list(self) -> None:
        covered = [mock.Mock(ticker="CBRS")]
        wanted = self._wanted("--no-price-write", covered=covered)
        self.assertNotIn("CBRS", wanted)
        self.assertIn("AAPL", wanted)

    def test_a_failed_coverage_read_still_refreshes_the_strategies_list(self) -> None:
        def broken(*_args: object) -> list[object]:
            raise RuntimeError("store down")

        with mock.patch("backend.agentdata.feeds_common.load_universe", side_effect=broken), redirect_stdout(io.StringIO()):
            self.assertEqual(backtest_strategies.covered_tickers(mock.Mock()), [])

    def test_the_two_flags_together_are_refused(self) -> None:
        with redirect_stdout(io.StringIO()), mock.patch("sys.stderr", io.StringIO()), self.assertRaises(SystemExit):
            backtest_strategies.main(["--prices-only", "--no-price-write"])


if __name__ == "__main__":
    unittest.main()
