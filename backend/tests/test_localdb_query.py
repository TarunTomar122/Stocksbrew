from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.localdb.firestore import LocalFirestoreClient
from backend.localdb.query import QuerySpec, compile_query, normalize_operator
from backend.localdb.server import MAX_QUERY_DOCUMENTS, make_server
from backend.localdb.store import LocalDocumentStore


class LocalDBQueryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temporary.name) / "documents.sqlite3"
        self.store = LocalDocumentStore(self.db_path)
        self.client = LocalFirestoreClient(self.store)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _seed_articles(self) -> None:
        articles = self.client.collection("tm_news_runs").document("US__core").collection("articles")
        articles.document("old").set({
            "title": "old",
            "published_at": "2024-01-01T00:00:00Z",
            "stock_tickers": ["MSFT"],
            "body_text": "x" * 1000,
        })
        articles.document("mid").set({
            "title": "mid",
            "published_at": "2024-06-01T00:00:00Z",
            "stock_tickers": ["AAPL", "MSFT"],
            "body_text": "y" * 1000,
        })
        articles.document("new").set({
            "title": "new",
            "published_at": "2024-12-01T00:00:00Z",
            "stock_tickers": ["AAPL"],
            "body_text": "z" * 1000,
        })
        self.client.collection("tm_news_runs").document("US__core").set({"market": "US"})
        self.client.collection("tm_news_runs").document("US__core").collection("articles").document("new").collection("notes").document("n1").set({"text": "child"})

    def test_nested_collection_skips_siblings_and_grandchildren(self) -> None:
        self._seed_articles()
        root = [doc.id for doc in self.client.collection("tm_news_runs").stream()]
        articles = [doc.id for doc in self.client.collection("tm_news_runs/US__core/articles").stream()]
        self.assertEqual(sorted(root), ["US__core"])
        self.assertEqual(sorted(articles), ["mid", "new", "old"])

    def test_order_and_limit_are_sql_top_n_not_first_path_slice(self) -> None:
        self._seed_articles()
        compiled = compile_query(QuerySpec(
            collection_path="tm_news_runs/US__core/articles",
            orders=[("published_at", "DESCENDING")],
            limit_count=1,
        ))
        self.assertIn("LIMIT ?", compiled.sql)
        self.assertIn("parent_collection = ?", compiled.sql)
        self.assertLess(compiled.sql.index("ORDER BY"), compiled.sql.index("LIMIT ?"))
        self.assertEqual(compiled.params[0], "tm_news_runs/US__core/articles")
        self.assertEqual(compiled.params[-1], 1)

        rows = list(
            self.client.collection("tm_news_runs/US__core/articles")
            .order_by("published_at", "DESCENDING")
            .limit(1)
            .stream()
        )
        self.assertEqual([doc.id for doc in rows], ["new"])
        self.assertEqual(rows[0].to_dict()["title"], "new")

    def test_array_contains_aliases_and_any(self) -> None:
        self._seed_articles()
        hyphen = list(
            self.client.collection("tm_news_runs/US__core/articles")
            .where("stock_tickers", "array-contains", "AAPL")
            .stream()
        )
        underscore = list(
            self.client.collection("tm_news_runs/US__core/articles")
            .where("stock_tickers", "array_contains", "AAPL")
            .stream()
        )
        any_rows = list(
            self.client.collection("tm_news_runs/US__core/articles")
            .where("stock_tickers", "array-contains-any", ["NOPE", "MSFT"])
            .stream()
        )
        self.assertEqual(sorted(doc.id for doc in hyphen), ["mid", "new"])
        self.assertEqual(sorted(doc.id for doc in underscore), ["mid", "new"])
        self.assertEqual(sorted(doc.id for doc in any_rows), ["mid", "old"])

    def test_missing_fields_and_empty_results(self) -> None:
        self.client.collection("tm_alerts").document("a1").set({"uid": "u1", "active": True})
        self.client.collection("tm_alerts").document("a2").set({"uid": "u2"})
        self.client.collection("tm_alerts").document("a3").set({"uid": "u3", "active": None})
        equals_missing = list(self.client.collection("tm_alerts").where("active", "==", True).stream())
        not_equals = list(self.client.collection("tm_alerts").where("active", "!=", True).stream())
        nobody = list(self.client.collection("tm_alerts").where("uid", "==", "missing").stream())
        equals_null = list(self.client.collection("tm_alerts").where("active", "==", None).stream())
        self.assertEqual([doc.id for doc in equals_missing], ["a1"])
        self.assertEqual([doc.id for doc in not_equals], ["a2", "a3"])
        self.assertEqual(nobody, [])
        self.assertEqual([doc.id for doc in equals_null], ["a3"])

    def test_in_not_in_range_and_name(self) -> None:
        events = self.client.collection("tm_earnings_events")
        events.document("a").set({"market": "US", "ticker": "AAPL", "event_date": "2024-01-10"})
        events.document("b").set({"market": "US", "ticker": "MSFT", "event_date": "2024-02-10"})
        events.document("c").set({"market": "IN", "ticker": "INFY", "event_date": "2024-01-20"})
        ranged = list(
            events.where("market", "==", "US")
            .where("event_date", ">=", "2024-01-01")
            .where("event_date", "<=", "2024-01-31")
            .stream()
        )
        named = list(events.where("__name__", "==", "b").stream())
        excluded = list(events.where("ticker", "not-in", ["AAPL", "INFY"]).stream())
        included = list(events.where("ticker", "in", ["MSFT", "INFY"]).stream())
        self.assertEqual([doc.id for doc in ranged], ["a"])
        self.assertEqual([doc.id for doc in named], ["b"])
        self.assertEqual([doc.id for doc in excluded], ["b"])
        self.assertEqual(sorted(doc.id for doc in included), ["b", "c"])

    def test_select_projects_without_other_fields(self) -> None:
        self._seed_articles()
        rows = list(
            self.client.collection("tm_news_runs/US__core/articles")
            .select(["title", "published_at"])
            .where("title", "==", "new")
            .stream()
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].to_dict(), {"title": "new", "published_at": "2024-12-01T00:00:00Z"})

    def test_collection_group_and_offset(self) -> None:
        self._seed_articles()
        self.client.collection("users").document("u1").collection("articles").document("other").set({
            "title": "user-article",
            "published_at": "2023-01-01T00:00:00Z",
            "stock_tickers": [],
        })
        grouped = list(self.client.collection_group("articles").order_by("published_at").stream())
        self.assertEqual([doc.id for doc in grouped], ["other", "old", "mid", "new"])
        offset = list(
            self.client.collection("tm_news_runs/US__core/articles")
            .order_by("published_at")
            .offset(1)
            .limit(1)
            .stream()
        )
        self.assertEqual([doc.id for doc in offset], ["mid"])

    def test_tagged_timestamp_compares_as_iso_string(self) -> None:
        stamp = datetime(2024, 1, 2, tzinfo=timezone.utc)
        self.store.upsert("tm_events/e1", {"event_date": stamp, "market": "US"})
        rows = list(
            self.client.collection("tm_events")
            .where("event_date", "==", stamp.isoformat())
            .stream()
        )
        self.assertEqual([doc.id for doc in rows], ["e1"])
        self.assertEqual(rows[0].to_dict()["event_date"], stamp.isoformat())

    def test_delete_collection_drops_direct_docs_only(self) -> None:
        self._seed_articles()
        deleted = self.client.delete_collection("tm_news_runs/US__core/articles")
        self.assertEqual(deleted, 3)
        remaining = list(self.client.collection("tm_news_runs/US__core/articles").stream())
        self.assertEqual(remaining, [])
        self.assertTrue(self.client.collection("tm_news_runs").document("US__core").get().exists)
        note = self.client.collection("tm_news_runs/US__core/articles/new/notes").document("n1").get()
        self.assertTrue(note.exists)

    def test_array_index_follows_overwrites(self) -> None:
        ref = self.client.collection("tm_radar_evidence").document("e1")
        ref.set({"instrument_ids": ["US_AAPL"]})
        ref.set({"instrument_ids": ["US_MSFT"]})
        old = list(self.client.collection("tm_radar_evidence").where("instrument_ids", "array-contains", "US_AAPL").stream())
        new = list(self.client.collection("tm_radar_evidence").where("instrument_ids", "array-contains", "US_MSFT").stream())
        self.assertEqual(old, [])
        self.assertEqual([doc.id for doc in new], ["e1"])
        ref.delete()
        after_delete = list(
            self.client.collection("tm_radar_evidence").where("instrument_ids", "array-contains", "US_MSFT").stream()
        )
        self.assertEqual(after_delete, [])

    def test_nested_array_contains_ignores_non_arrays(self) -> None:
        items = self.client.collection("tm_nested")
        items.document("str").set({"meta": {"ticker": "AAPL"}})
        items.document("obj").set({"meta": {"ticker": {"x": "AAPL"}}})
        items.document("arr").set({"meta": {"ticker": ["AAPL"]}})
        compiled = compile_query(QuerySpec(
            collection_path="tm_nested",
            filters=[("meta.ticker", "array-contains", "AAPL")],
        ))
        self.assertIn("json_type(data_json, '$.meta.ticker') = 'array'", compiled.sql)
        rows = list(items.where("meta.ticker", "array-contains", "AAPL").stream())
        self.assertEqual([doc.id for doc in rows], ["arr"])

    def test_http_default_cap_does_not_limit_in_process_streams(self) -> None:
        unbounded = compile_query(QuerySpec(collection_path="tm_news_runs/US__core/articles"))
        self.assertNotIn("LIMIT", unbounded.sql)
        self.assertIn("ORDER BY path", unbounded.sql)

        self._seed_articles()
        in_process = list(self.client.collection("tm_news_runs/US__core/articles").stream())
        self.assertEqual(sorted(doc.id for doc in in_process), ["mid", "new", "old"])

        server = make_server("127.0.0.1", 0, self.store, "test-token")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{server.server_port}"
        try:
            request = Request(
                f"{base_url}/query",
                data=json.dumps({"collection": "tm_news_runs/US__core/articles"}).encode(),
                method="POST",
                headers={"Authorization": "Bearer test-token", "Content-Type": "application/json"},
            )
            with urlopen(request) as response:
                payload = json.load(response)
            self.assertEqual(payload["count"], 3)
            self.assertEqual(MAX_QUERY_DOCUMENTS, 10_000)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_migrates_legacy_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            db_path = Path(temporary) / "legacy.sqlite3"
            connection = sqlite3.connect(db_path)
            connection.execute(
                """
                CREATE TABLE documents (
                    path TEXT PRIMARY KEY,
                    collection TEXT NOT NULL,
                    document_id TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    document_hash TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)",
                (
                    "tm_news_runs/US__core/articles/a1",
                    "tm_news_runs",
                    "a1",
                    json.dumps({"title": "hello", "stock_tickers": ["AAPL"], "published_at": "2024-01-02"}),
                    "hash",
                    "now",
                ),
            )
            connection.commit()
            connection.close()
            client = LocalFirestoreClient(LocalDocumentStore(db_path))
            rows = list(
                client.collection("tm_news_runs/US__core/articles")
                .where("stock_tickers", "array-contains", "AAPL")
                .stream()
            )
            self.assertEqual([doc.id for doc in rows], ["a1"])

    def test_invalid_operator_and_field_do_not_run(self) -> None:
        self.client.collection("users").document("u1").set({"name": "ada"})
        with self.assertRaises(ValueError):
            list(self.client.collection("users").where("name", "like", "ada").stream())
        with self.assertRaises(ValueError):
            compile_query(QuerySpec(collection_path="users", filters=[("name;drop", "==", "ada")]))
        with self.assertRaises(ValueError):
            list(self.client.collection("users").where("name", "array-contains-any", "ada").stream())
        self.assertEqual(normalize_operator("array_contains"), "array-contains")

    def test_limit_zero_and_boolean_filters(self) -> None:
        alerts = self.client.collection("tm_alerts")
        alerts.document("on").set({"active": True, "triggered": False})
        alerts.document("off").set({"active": False, "triggered": False})
        self.assertEqual(list(alerts.where("active", "==", True).limit(0).stream()), [])
        rows = list(alerts.where("active", "==", True).where("triggered", "==", False).stream())
        self.assertEqual([doc.id for doc in rows], ["on"])

    def test_http_query_works_and_rejects_bad_requests(self) -> None:
        self._seed_articles()
        server = make_server("127.0.0.1", 0, self.store, "test-token")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{server.server_port}"
        try:
            request = Request(
                f"{base_url}/query",
                data=json.dumps({
                    "collection": "tm_news_runs/US__core/articles",
                    "filters": [{"field": "stock_tickers", "op": "array-contains", "value": "AAPL"}],
                    "orders": [{"field": "published_at", "direction": "DESCENDING"}],
                    "limit": 1,
                    "select": ["title"],
                }).encode(),
                method="POST",
                headers={"Authorization": "Bearer test-token", "Content-Type": "application/json"},
            )
            with urlopen(request) as response:
                payload = json.load(response)
            self.assertEqual(payload["count"], 1)
            self.assertEqual(payload["documents"][0]["data"], {"title": "new"})

            bad_limit = Request(
                f"{base_url}/query",
                data=json.dumps({
                    "collection": "tm_news_runs/US__core/articles",
                    "limit": MAX_QUERY_DOCUMENTS + 1,
                }).encode(),
                method="POST",
                headers={"Authorization": "Bearer test-token", "Content-Type": "application/json"},
            )
            with self.assertRaises(HTTPError) as error:
                urlopen(bad_limit)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()

            bad_op = Request(
                f"{base_url}/query",
                data=json.dumps({
                    "collection": "tm_news_runs/US__core/articles",
                    "filters": [{"field": "title", "op": "regex", "value": "new"}],
                }).encode(),
                method="POST",
                headers={"Authorization": "Bearer test-token", "Content-Type": "application/json"},
            )
            with self.assertRaises(HTTPError) as error:
                urlopen(bad_op)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()


if __name__ == "__main__":
    unittest.main()
