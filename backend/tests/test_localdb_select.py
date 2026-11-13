"""Field masks (`select`) on document reads: applied in SQLite, same shape as a whole read projected in Python."""

from __future__ import annotations

import datetime as dt
import http.client
import json
import sqlite3
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.localdb import LocalDocumentStore
from backend.localdb.firestore import _select_data
from backend.localdb.server import FEATURES, make_server

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

PRICE = {
    "ticker": "AAPL",
    "currency": "USD",
    "market": "US",
    "captured_at": "2026-11-12T20:59:00+00:00",
    "updated_at": dt.datetime(2026, 11, 12, 21, 0, tzinfo=dt.timezone.utc),
    "session_phase": None,
    "is_live": True,
    "is_stale": False,
    "history_window_size": 252,
    "quote": {"current": 173.03, "day_change_pct": -2.22, "volume": 1296560, "flags": {"halted": False}},
    "fundamentals": {"pe_ttm": 28.4, "tags": ["large", "tech"]},
    "history_window": {"dates": [f"2025-{i:04d}" for i in range(400)], "closes": [float(i) for i in range(400)]},
    "empty_map": {},
    "empty_list": [],
}

MASKS = [
    ["ticker", "currency", "captured_at", "updated_at", "quote"],
    ["quote.current", "quote.day_change_pct", "fundamentals.pe_ttm"],
    ["quote.flags.halted", "is_live", "is_stale", "session_phase", "history_window_size"],
    ["fundamentals", "empty_map", "empty_list", "missing", "quote.missing", "ticker.nested"],
    ["quote", "quote.current"],
    ["quote.current", "quote"],
    [],
]


class StoreSelectTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.store = LocalDocumentStore(Path(self._temporary.name) / "documents.sqlite3")
        self.store.upsert("tm_latest_prices/US_AAPL", PRICE)
        self.store.upsert("tm_latest_prices/US_MSFT", {"ticker": "MSFT", "quote": {"current": 410}})

    def tearDown(self) -> None:
        self._temporary.cleanup()

    def test_every_mask_matches_a_whole_read_projected_in_python(self) -> None:
        paths = ["tm_latest_prices/US_AAPL", "tm_latest_prices/US_MSFT"]
        whole = self.store.get_many(paths)
        for mask in MASKS:
            with self.subTest(mask=mask):
                selected = self.store.get_many(paths, select=mask)
                self.assertEqual([doc["data"] for doc in selected], [_select_data(doc["data"], mask) for doc in whole])
                self.assertEqual([doc["hash"] for doc in selected], [doc["hash"] for doc in whole])
                self.assertEqual([doc["updated_at"] for doc in selected], [doc["updated_at"] for doc in whole])

    def test_values_keep_their_types(self) -> None:
        data = self.store.get("tm_latest_prices/US_AAPL", select=MASKS[0] + MASKS[2])["data"]
        self.assertIs(data["is_live"], True)
        self.assertIs(data["is_stale"], False)
        self.assertIsNone(data["session_phase"])
        self.assertIn("session_phase", data)
        self.assertEqual(data["history_window_size"], 252)
        self.assertIsInstance(data["history_window_size"], int)
        self.assertEqual(data["quote"]["volume"], 1296560)
        self.assertEqual(data["quote"]["flags"], {"halted": False})
        # Stored as a tagged timestamp, returned as the same ISO string a whole read gives.
        self.assertEqual(data["updated_at"], "2026-11-12T21:00:00+00:00")

    def test_order_duplicates_and_missing_documents(self) -> None:
        documents = self.store.get_many(
            ["tm_latest_prices/US_MSFT", "tm_latest_prices/NOPE", "tm_latest_prices/US_AAPL", "tm_latest_prices/US_MSFT"],
            select=["ticker"],
        )
        self.assertEqual([doc["path"] for doc in documents], ["tm_latest_prices/US_MSFT", "tm_latest_prices/US_AAPL"])
        self.assertIsNone(self.store.get("tm_latest_prices/NOPE", select=["ticker"]))

    def test_the_big_field_never_reaches_python(self) -> None:
        with mock.patch("backend.localdb.store.json.loads", side_effect=AssertionError("whole document decoded")):
            data = self.store.get("tm_latest_prices/US_AAPL", select=["quote.current", "ticker"])["data"]
        self.assertEqual(data, {"quote": {"current": 173.03}, "ticker": "AAPL"})

    def test_a_string_holding_half_an_emoji_reads_back_as_stored(self) -> None:
        # A JS slice can cut a surrogate pair; json_extract hands those bytes back unescaped.
        self.store.upsert("tm_latest_prices/US_HALF", {"headline": "AAPL: great \ud83d", "nested": {"h": "\ud83d\ude00 ok"}})
        whole = self.store.get("tm_latest_prices/US_HALF")["data"]
        selected = self.store.get("tm_latest_prices/US_HALF", select=["headline", "nested.h"])["data"]
        self.assertEqual(selected, whole)
        self.assertEqual(selected["headline"], "AAPL: great \ud83d")

    def test_too_many_fields_for_sql_are_refused_here_and_projected_by_the_server(self) -> None:
        from backend.localdb.query import MAX_SQL_SELECT_FIELDS

        many = [f"f{index}" for index in range(MAX_SQL_SELECT_FIELDS + 1)]
        with self.assertRaises(ValueError):
            self.store.get_many(["tm_latest_prices/US_AAPL"], select=many)

    def test_rejects_field_paths_sqlite_cannot_address(self) -> None:
        for bad in (["bad-field"], ["a..b"], [""], ["$.x"], ["x'); DROP TABLE documents; --"], "ticker"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.store.get_many(["tm_latest_prices/US_AAPL"], select=bad)  # type: ignore[arg-type]
        self.assertIsNotNone(self.store.get("tm_latest_prices/US_AAPL"))


class HttpSelectTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.store = LocalDocumentStore(Path(self._temporary.name) / "documents.sqlite3")
        self.store.upsert("tm_latest_prices/US_AAPL", {**PRICE, "odd-key": 1})
        self.server = make_server("127.0.0.1", 0, self.store, TOKEN, {"tm_latest_prices"})
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=2)
        self.server.server_close()
        self._temporary.cleanup()

    def _request(self, method: str, path: str, body: object | None = None, auth: bool = True) -> tuple[int, dict]:
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=10)
        try:
            connection.request(method, path, body=json.dumps(body) if body is not None else None, headers=AUTH if auth else {})
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_health_lists_the_feature(self) -> None:
        status, body = self._request("GET", "/health", auth=False)
        self.assertEqual(status, 200)
        self.assertIn("select_sql", body["features"])
        self.assertEqual(body["features"], list(FEATURES))

    def test_batch_get_with_and_without_select(self) -> None:
        status, body = self._request("POST", "/documents:batchGet", {"paths": ["tm_latest_prices/US_AAPL"], "select": ["quote.current", "ticker"]})
        self.assertEqual(status, 200)
        document = body["documents"][0]
        self.assertEqual(document["data"], {"quote": {"current": 173.03}, "ticker": "AAPL"})
        self.assertEqual(set(document), {"path", "data", "hash", "updated_at"})
        status, body = self._request("POST", "/documents:batchGet", {"paths": ["tm_latest_prices/US_AAPL"]})
        self.assertEqual(status, 200)
        self.assertEqual(len(body["documents"][0]["data"]["history_window"]["dates"]), 400)
        self.assertEqual(document["hash"], body["documents"][0]["hash"])

    def test_batch_get_falls_back_for_field_names_sqlite_cannot_address(self) -> None:
        status, body = self._request("POST", "/documents:batchGet", {"paths": ["tm_latest_prices/US_AAPL"], "select": ["odd-key", "ticker"]})
        self.assertEqual(status, 200)
        self.assertEqual(body["documents"][0]["data"], {"odd-key": 1, "ticker": "AAPL"})

    def test_batch_get_with_more_fields_than_sql_takes_still_answers(self) -> None:
        select = ["ticker"] + [f"f{index}" for index in range(1200)]
        status, body = self._request("POST", "/documents:batchGet", {"paths": ["tm_latest_prices/US_AAPL"], "select": select})
        self.assertEqual(status, 200)
        self.assertEqual(body["documents"][0]["data"], {"ticker": "AAPL"})

    def test_batch_get_rejects_a_select_that_is_not_a_list_of_strings(self) -> None:
        status, _ = self._request("POST", "/documents:batchGet", {"paths": ["tm_latest_prices/US_AAPL"], "select": "ticker"})
        self.assertEqual(status, 400)

    def test_single_get_with_select(self) -> None:
        status, body = self._request("GET", "/documents/tm_latest_prices%2FUS_AAPL?select=quote.current&select=currency")
        self.assertEqual(status, 200)
        self.assertEqual(body["document"]["data"], {"quote": {"current": 173.03}, "currency": "USD"})
        status, body = self._request("GET", "/documents/tm_latest_prices%2FUS_AAPL")
        self.assertIn("history_window", body["document"]["data"])
        status, _ = self._request("GET", "/documents/tm_latest_prices%2FNOPE?select=ticker")
        self.assertEqual(status, 404)

    def test_query_select_still_runs_in_sql(self) -> None:
        status, body = self._request("POST", "/query", {"collection": "tm_latest_prices", "select": ["quote.day_change_pct"]})
        self.assertEqual(status, 200)
        self.assertEqual(body["documents"][0]["data"], {"quote": {"day_change_pct": -2.22}})


class SqliteJsonTest(unittest.TestCase):
    def test_sqlite_has_json1(self) -> None:
        self.assertEqual(sqlite3.connect(":memory:").execute("SELECT json_extract('{\"a\":1}', '$.a')").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
