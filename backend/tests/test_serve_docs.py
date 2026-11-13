"""The writers' half of the stock page's serving docs (backend/serve_docs.py)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from typing import Any

from backend import serve_docs
from backend.localdb.firestore import LocalFirestoreClient
from backend.storage import TraceMoneyStore


def _store(db: LocalFirestoreClient) -> TraceMoneyStore:
    store = TraceMoneyStore.__new__(TraceMoneyStore)
    store.db = db
    return store


def _doc(db: LocalFirestoreClient, path: str) -> dict[str, Any] | None:
    snapshot = db.document(path).get()
    return snapshot.to_dict() if snapshot.exists else None


class _FailingDb:
    def batch(self) -> Any:
        raise RuntimeError("store down")

    def collection(self, _name: str) -> Any:
        raise RuntimeError("store down")


class _RecordingStore:
    def __init__(self) -> None:
        self.writes: list[tuple[list[tuple[str, dict[str, Any]]], bool]] = []

    def set_many(self, docs: list[tuple[str, dict[str, Any]]], *, merge: bool = False) -> int:
        self.writes.append((list(docs), merge))
        return len(docs)


class ServeDocsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.db = LocalFirestoreClient(str(Path(self._tmp.name) / "docs.sqlite3"))
        serve_docs._STAMPED_PAGES.clear()

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_ids_are_us_tickers_only(self) -> None:
        self.assertEqual(serve_docs.us_ticker("US_aapl"), "AAPL")
        self.assertIsNone(serve_docs.us_ticker("IN_RELIANCE"))
        self.assertIsNone(serve_docs.serve_doc_id("a/b"))
        self.assertIsNone(serve_docs.serve_doc_id(""))
        self.assertIsNone(serve_docs.serve_doc_id("_all"))

    def test_snapshot_rows_match_the_web_shape(self) -> None:
        rows = serve_docs.snapshot_rows([
            {"captured_at": "2026-11-12T20:00:00+00:00", "quote": {"current": 101.5}, "fundamentals": {"pe_ttm": 30.2}},
            {"captured_at": 5, "quote": {"current": True}, "fundamentals": None},
            "junk",
        ])
        self.assertEqual(rows, [["2026-11-12T20:00:00+00:00", 101.5, 30.2], [None, None, None], [None, None, None]])
        self.assertEqual(serve_docs.snapshot_rows(None), [])

    def test_dirty_stamps_merge_without_touching_parts(self) -> None:
        self.db.document("tm_serve_stock/AAPL").set({"schema": 1, "p_calls": {"v": 1, "data": {"records": []}}})
        written = serve_docs.mark_dirty(self.db, ["aapl", "MSFT", None, "x/y"], ["calls"], stamp="2026-11-13T10:00:00+00:00")
        self.assertEqual(written, 2)
        doc = _doc(self.db, "tm_serve_stock/AAPL")
        self.assertEqual(doc["dirty_calls"], "2026-11-13T10:00:00+00:00")
        self.assertEqual(doc["p_calls"], {"v": 1, "data": {"records": []}})
        self.assertEqual(_doc(self.db, "tm_serve_stock/MSFT"), {"dirty_calls": "2026-11-13T10:00:00+00:00"})

    def test_unknown_part_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            serve_docs.dirty_writes(["AAPL"], ["series"])

    def test_stamps_never_fail_the_writer(self) -> None:
        self.assertEqual(serve_docs.mark_dirty(_FailingDb(), ["AAPL"], ["news"]), 0)
        self.assertFalse(serve_docs.mark_all_dirty(_FailingDb(), ["news"]))
        self.assertEqual(serve_docs.write_merges(_FailingDb(), [("tm_serve_stock/AAPL", {"a": 1})]), 0)

    def test_news_tickers_include_retag_sources(self) -> None:
        tickers = serve_docs.news_tickers([
            {"stock_tickers": ["aapl", "MSFT"], "stock_tickers_previous": ["NVDA"]},
            {"stock_tickers": None},
            "junk",
        ])
        self.assertEqual(tickers, {"AAPL", "MSFT", "NVDA"})

    def test_headline_stamp_covers_tags_a_write_drops(self) -> None:
        class Store(_RecordingStore):
            def get_many(self, paths: list[str]) -> dict[str, dict[str, Any]]:
                return {"tm_agent_news/h1": {"stock_tickers": ["AMD"]}}

        store = Store()
        serve_docs.headline_stamp(store, [("tm_agent_news/h1", {"stock_tickers": ["NVDA"]})])
        stamped = {path for path, _ in store.writes[0][0]}
        self.assertEqual(stamped, {"tm_serve_stock/AMD", "tm_serve_stock/NVDA"})

    def test_hooks_do_nothing_on_a_firebase_client(self) -> None:
        class Client:
            pass

        Client.__module__ = "google.cloud.firestore_v1.client"
        self.assertFalse(serve_docs.serving(Client()))
        self.assertEqual(serve_docs.mark_dirty(Client(), ["AAPL"], ["news"]), 0)
        self.assertFalse(serve_docs.mark_all_dirty(Client(), ["news"]))
        self.assertTrue(serve_docs.serving(self.db))

    def test_dot_tickers_stamp_the_instrument_id_doc(self) -> None:
        self.assertEqual(serve_docs.dirty_writes(["brk.b"], ["news"], "t"), [("tm_serve_stock/BRK_B", {"dirty_news": "t"})])
        self.assertEqual(serve_docs.us_ticker("US_BRK_B"), "BRK_B")

    def test_stamped_pages_are_refreshed_once_by_ticker(self) -> None:
        sent: list[tuple[list[str], list[str]]] = []
        import backend.scripts.trigger_web_revalidate as trigger

        original = trigger.revalidate_after_write
        trigger.revalidate_after_write = lambda kinds, symbols=None, **_: sent.append((list(kinds), list(symbols or []))) or True  # type: ignore[assignment]
        try:
            self.assertFalse(serve_docs.refresh_stamped_pages())
            serve_docs.mark_dirty_in_store(_RecordingStore(), ["brk.b", "NVDA"], ["news"])
            serve_docs.mark_dirty_in_store(_RecordingStore(), ["NVDA"], ["news"])
            self.assertTrue(serve_docs.refresh_stamped_pages())
            self.assertFalse(serve_docs.refresh_stamped_pages())
        finally:
            trigger.revalidate_after_write = original  # type: ignore[assignment]
        self.assertEqual(sent, [([], ["BRK.B", "NVDA"])])

    def test_store_stamp_goes_through_set_many_merge(self) -> None:
        store = _RecordingStore()
        self.assertEqual(serve_docs.mark_dirty_in_store(store, ["AAPL"], ["news"], stamp="t"), 1)
        self.assertEqual(store.writes, [([("tm_serve_stock/AAPL", {"dirty_news": "t"})], True)])
        self.assertEqual(serve_docs.mark_dirty_in_store(store, [], ["news"]), 0)

    def test_price_write_refreshes_the_snapshot_part_when_the_window_changes(self) -> None:
        store = _store(self.db)
        store._refresh_near_52_week_view = lambda *_args, **_kwargs: None  # type: ignore[method-assign]
        point = {
            "instrument_id": "US_AAPL",
            "ticker": "AAPL",
            "market": "US",
            "captured_at": "2026-11-12T14:30:00+00:00",
            "session_phase": "open_check",
            "quote": {"current": 200.0},
            "fundamentals": {"pe_ttm": 31.0},
        }
        store.save_price_snapshots_bulk([point])
        doc = _doc(self.db, "tm_serve_stock/AAPL")
        self.assertEqual(doc["instrument_id"], "US_AAPL")
        self.assertEqual(doc["p_snapshot"]["data"]["rows"], [["2026-11-12T14:30:00+00:00", 200.0, 31.0]])
        self.assertEqual(doc["p_snapshot"]["built_at"], doc["dirty_snapshot"])
        built = doc["p_snapshot"]["built_at"]

        # An intraday quote leaves the window alone, so the part is not rewritten.
        store.save_price_snapshots_bulk([{**point, "captured_at": "2026-11-12T16:00:00+00:00", "session_phase": "mid_check", "quote": {"current": 205.0}}])
        self.assertEqual(_doc(self.db, "tm_serve_stock/AAPL")["p_snapshot"]["built_at"], built)

        # The next day's first quote appends to the window: the part follows.
        store.save_price_snapshot({**point, "captured_at": "2026-11-13T14:30:00+00:00", "quote": {"current": 210.0}})
        rows = _doc(self.db, "tm_serve_stock/AAPL")["p_snapshot"]["data"]["rows"]
        self.assertEqual([row[1] for row in rows], [200.0, 210.0])

    def test_an_indian_price_write_leaves_serving_docs_alone(self) -> None:
        store = _store(self.db)
        store._refresh_near_52_week_view = lambda *_args, **_kwargs: None  # type: ignore[method-assign]
        store.save_price_snapshots_bulk([{
            "instrument_id": "IN_RELIANCE",
            "market": "IN",
            "captured_at": "2026-11-12T04:00:00+00:00",
            "quote": {"current": 2900.0},
        }])
        self.assertEqual(list(self.db.collection("tm_serve_stock").stream()), [])

    def test_call_history_write_stamps_calls_dirty(self) -> None:
        store = _store(self.db)
        store.append_directive_history("US", [{
            "instrument_id": "US_AMD",
            "current_price": 150.0,
            "generated_at": "2026-11-12T21:00:00+00:00",
            "directive_v2": {"stance": "hold", "action": {"label": "Hold"}},
        }])
        self.assertIsNotNone(_doc(self.db, "tm_directive_history/US_AMD/calls/2026-11-12"))
        self.assertIn("dirty_calls", _doc(self.db, "tm_serve_stock/AMD"))

    def test_news_writes_stamp_named_stocks_or_every_stock(self) -> None:
        store = _store(self.db)
        store.upsert_article_enrichments("US", "us_core_155", [{"id": "a1", "stock_tickers": ["NVDA"], "title": "t"}])
        self.assertIn("dirty_news", _doc(self.db, "tm_serve_stock/NVDA"))
        self.assertIsNone(_doc(self.db, "tm_serve_stock/_all"))
        store.save_article_enrichments("US", "us_core_155", [{"id": "a2", "stock_tickers": ["KO"], "title": "t"}])
        self.assertIn("dirty_news", _doc(self.db, "tm_serve_stock/_all"))
        # Indian headlines never touch the US pages' serving docs.
        before = _doc(self.db, "tm_serve_stock/_all")
        store.upsert_article_enrichments("IN", "in_core", [{"id": "a3", "stock_tickers": ["TCS"], "title": "t"}])
        self.assertIsNone(_doc(self.db, "tm_serve_stock/TCS"))
        self.assertEqual(_doc(self.db, "tm_serve_stock/_all"), before)


if __name__ == "__main__":
    unittest.main()
