from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.localdb import LocalDocumentStore, canonical_json, normalise_value, stable_document_hash
from backend.localdb.firestore import LocalFirestoreClient
from backend.localdb.server import make_server
from backend.scripts.migrate_firestore_to_local import (
    _migrate_archive,
    _migrate_firestore,
    collection_group_matches_path,
    iter_firestore_collection_group,
)
from backend.scripts.verify_local_migration import _local_hashes


class _FakeSnapshot:
    def __init__(self, path: str, data: dict):
        self.reference = type("Reference", (), {"path": path})()
        self._data = data

    def to_dict(self) -> dict:
        return self._data


class _FakeQuery:
    def __init__(self, snapshots: list[_FakeSnapshot]):
        self.snapshots = snapshots

    def order_by(self, field: str) -> "_FakeQuery":
        return self

    def stream(self):
        return iter(self.snapshots)


class _FakeFirestoreClient:
    def __init__(self, snapshots: list[_FakeSnapshot]):
        self.snapshots = snapshots
        self.collection_group_calls: list[str] = []

    def collection_group(self, name: str) -> _FakeQuery:
        self.collection_group_calls.append(name)
        return _FakeQuery(self.snapshots)


class Increment:
    def __init__(self, value: int):
        self._value = value


class _ReadGate:
    def __init__(self, path: str):
        self.path = path
        self.barrier = threading.Barrier(2)
        self.lock = threading.Lock()
        self.remaining = 2

    def before_get(self, path: str) -> None:
        if path != self.path:
            return
        with self.lock:
            if self.remaining == 0:
                return
            self.remaining -= 1
        self.barrier.wait(timeout=5)


class _GatedStore(LocalDocumentStore):
    def __init__(self, db_path: Path, gate: _ReadGate):
        self.gate = gate
        super().__init__(db_path)

    def get(self, path: str) -> dict | None:
        self.gate.before_get(path)
        return super().get(path)


class LocalDBTest(unittest.TestCase):
    def test_collection_group_matching_and_selection_preserve_orphan_paths(self) -> None:
        self.assertTrue(collection_group_matches_path("watchlist", "users/deleted/watchlist/orphan"))
        self.assertFalse(collection_group_matches_path("watchlist", "users/deleted/other/document"))

        snapshots = [
            _FakeSnapshot("users/u1/watchlist/one", {"ticker": "AAPL"}),
            _FakeSnapshot("users/deleted/watchlist/orphan", {"ticker": "MSFT"}),
        ]
        client = _FakeFirestoreClient(snapshots)
        records = list(iter_firestore_collection_group(client, "watchlist"))

        self.assertEqual(client.collection_group_calls, ["watchlist"])
        self.assertEqual([record["path"] for record in records], [snapshot.reference.path for snapshot in snapshots])
        for record in records:
            self.assertEqual(record["hash"], stable_document_hash(record["path"], record["data"]))

    def test_collection_group_local_matching_scans_all_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store = LocalDocumentStore(Path(temporary) / "documents.sqlite3")
            orphan = store.upsert("users/deleted/watchlist/orphan", {"ticker": "MSFT"})
            store.upsert("accounts/a1/other/document", {"ticker": "AAPL"})

            actual = _local_hashes(store, [], ["watchlist"])

            self.assertEqual(actual, {orphan["path"]: orphan["hash"]})

    def test_export_then_archive_apply_uses_distinct_checkpoints(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            export_path = root / "firebase.jsonl"
            export_checkpoint = root / "firebase-export-checkpoint.json"
            import_checkpoint = root / "archive-import-checkpoint.json"
            snapshots = [_FakeSnapshot("users/deleted/watchlist/orphan", {"ticker": "MSFT"})]

            export_result = _migrate_firestore(
                _FakeFirestoreClient(snapshots),
                None,
                [],
                False,
                export_path,
                export_checkpoint,
                25,
                False,
                collection_groups=["watchlist"],
            )
            store = LocalDocumentStore(root / "documents.sqlite3")
            import_result = _migrate_archive(
                export_path,
                store,
                [],
                True,
                import_checkpoint,
                25,
                False,
                collection_groups=["watchlist"],
            )

            self.assertEqual(export_result, {"scanned": 1, "written": 0})
            self.assertEqual(import_result, {"scanned": 1, "written": 1})
            self.assertEqual(store.get("users/deleted/watchlist/orphan")["data"], {"ticker": "MSFT"})

    def test_non_finite_values_are_tagged_and_stable(self) -> None:
        value = {
            "nan": float("nan"),
            "positive": float("inf"),
            "negative": float("-inf"),
            "finite": 1.5,
        }
        expected = {
            "finite": 1.5,
            "nan": {"__localdb_type__": "nan"},
            "negative": {"__localdb_type__": "negative_infinity"},
            "positive": {"__localdb_type__": "positive_infinity"},
        }

        self.assertEqual(normalise_value(value), expected)
        self.assertEqual(json.loads(canonical_json(value)), expected)
        self.assertEqual(canonical_json(value), canonical_json(dict(reversed(list(value.items())))))
        self.assertEqual(stable_document_hash("users/u1", value), stable_document_hash("users/u1", expected))

    def test_store_and_authenticated_http_api(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            db_path = Path(temporary) / "documents.sqlite3"
            store = LocalDocumentStore(db_path)
            data = {"ticker": "AAPL", "nested": {"enabled": True}}
            stored = store.upsert("users/u1/watchlist/w1", data)
            self.assertEqual(stored["hash"], stable_document_hash(stored["path"], data))
            store.batch_upsert([{"path": "users/u1", "data": {"name": "test"}}])
            self.assertEqual(len(store.list_documents("users")), 2)
            with sqlite3.connect(db_path) as connection:
                self.assertEqual(connection.execute("PRAGMA journal_mode").fetchone()[0], "wal")

            server = make_server("127.0.0.1", 0, store, "test-token", {"users"})
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{server.server_port}"
            try:
                with urlopen(f"{base_url}/health") as response:
                    self.assertEqual(json.load(response)["ok"], True)
                try:
                    urlopen(f"{base_url}/documents/users/u1")
                except HTTPError as error:
                    self.assertEqual(error.code, 401)
                    error.close()
                else:
                    self.fail("unauthenticated request unexpectedly succeeded")

                request = Request(
                    f"{base_url}/documents/users/u1",
                    data=json.dumps({"data": {"name": "updated"}}).encode(),
                    method="PUT",
                    headers={"Authorization": "Bearer test-token", "Content-Type": "application/json"},
                )
                with urlopen(request) as response:
                    self.assertEqual(json.load(response)["document"]["data"]["name"], "updated")

                request = Request(
                    f"{base_url}/documents:batchUpsert",
                    data=json.dumps(
                        {"documents": [{"path": "users/u1/watchlist/w2", "data": {"ticker": "MSFT"}}]}
                    ).encode(),
                    method="POST",
                    headers={"Authorization": "Bearer test-token", "Content-Type": "application/json"},
                )
                with urlopen(request) as response:
                    self.assertEqual(json.load(response)["count"], 1)

                request = Request(
                    f"{base_url}/documents:batchGet",
                    data=json.dumps(
                        {
                            "paths": ["users/u1", "users/u1/watchlist/w2", "users/missing"],
                            "select": ["name", "ticker"],
                        }
                    ).encode(),
                    method="POST",
                    headers={"Authorization": "Bearer test-token", "Content-Type": "application/json"},
                )
                with urlopen(request) as response:
                    payload = json.load(response)
                    self.assertEqual(payload["count"], 2)
                    self.assertEqual(payload["documents"][0]["data"], {"name": "updated"})
                    self.assertEqual(payload["documents"][1]["data"], {"ticker": "MSFT"})

                request = Request(
                    f"{base_url}/documents?collection=users&limit=10",
                    headers={"Authorization": "Bearer test-token"},
                )
                with urlopen(request) as response:
                    self.assertEqual(json.load(response)["count"], 3)
            finally:
                server.shutdown()
                thread.join(timeout=2)
                server.server_close()

    def test_parallel_clients_merge_sections_and_transforms_atomically(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            db_path = Path(temporary) / "documents.sqlite3"
            view_path = "tm_stock_page_views/US__AAPL"
            LocalDocumentStore(db_path).upsert(
                view_path,
                {
                    "seed": True,
                    "facts": {"old": "remove"},
                    "technicals": {"old": "remove"},
                    "revision": 0,
                },
            )
            gate = _ReadGate(view_path)
            clients = [
                LocalFirestoreClient(_GatedStore(db_path, gate)),
                LocalFirestoreClient(_GatedStore(db_path, gate)),
            ]
            start = threading.Barrier(2)
            errors: list[BaseException] = []

            def writer(client: LocalFirestoreClient, data: dict) -> None:
                try:
                    start.wait(timeout=5)
                    client.collection("tm_stock_page_views").document("US__AAPL").set(data, merge=True)
                except BaseException as error:
                    errors.append(error)

            threads = [
                threading.Thread(
                    target=writer,
                    args=(clients[0], {"facts": {"fresh": "facts"}, "revision": Increment(1)}),
                ),
                threading.Thread(
                    target=writer,
                    args=(clients[1], {"technicals": {"fresh": "technicals"}, "revision": Increment(1)}),
                ),
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=10)

            self.assertFalse(any(thread.is_alive() for thread in threads))
            self.assertEqual(errors, [])
            data = LocalDocumentStore(db_path).get(view_path)["data"]
            self.assertEqual(
                data,
                {
                    "seed": True,
                    "facts": {"fresh": "facts"},
                    "technicals": {"fresh": "technicals"},
                    "revision": 2,
                },
            )

    def test_merge_replaces_map_fields_and_preserves_dotted_field_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            client = LocalFirestoreClient(Path(temporary) / "documents.sqlite3")
            reference = client.collection("tm_stock_page_views").document("US__AAPL")
            reference.set(
                {
                    "facts": {"old": "remove"},
                    "technicals": {"old": "keep"},
                    "revision": 1,
                }
            )
            reference.set(
                {
                    "facts": {"fresh": "replace"},
                    "technicals.current": 2,
                    "revision": Increment(1),
                },
                merge=True,
            )

            self.assertEqual(
                reference.get().to_dict(),
                {
                    "facts": {"fresh": "replace"},
                    "technicals": {"old": "keep", "current": 2},
                    "revision": 2,
                },
            )

    def test_parallel_http_writers_merge_sections_and_transforms_atomically(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            db_path = Path(temporary) / "documents.sqlite3"
            view_path = "tm_stock_page_views/US__AAPL"
            gate = _ReadGate(view_path)
            store = _GatedStore(db_path, gate)
            store.upsert(
                view_path,
                {
                    "seed": True,
                    "facts": {"old": "remove"},
                    "technicals": {"old": "remove"},
                    "revision": 0,
                },
            )
            server = make_server("127.0.0.1", 0, store, "test-token", {"tm_stock_page_views"})
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{server.server_port}"
            start = threading.Barrier(2)
            errors: list[BaseException] = []

            def writer(data: dict) -> None:
                try:
                    start.wait(timeout=5)
                    request = Request(
                        f"{base_url}/documents/{view_path}",
                        data=json.dumps({"data": data, "merge": True}).encode(),
                        method="PUT",
                        headers={"Authorization": "Bearer test-token", "Content-Type": "application/json"},
                    )
                    with urlopen(request, timeout=10) as response:
                        self.assertEqual(response.status, 200)
                        json.load(response)
                except BaseException as error:
                    errors.append(error)

            threads = [
                threading.Thread(
                    target=writer,
                    args=({
                        "facts": {"fresh": "facts"},
                        "revision": {"__localdb_transform__": "increment", "value": 1},
                    },),
                ),
                threading.Thread(
                    target=writer,
                    args=({
                        "technicals": {"fresh": "technicals"},
                        "revision": {"__localdb_transform__": "increment", "value": 1},
                    },),
                ),
            ]
            try:
                for worker in threads:
                    worker.start()
                for worker in threads:
                    worker.join(timeout=10)
            finally:
                server.shutdown()
                thread.join(timeout=2)
                server.server_close()

            self.assertFalse(any(worker.is_alive() for worker in threads))
            self.assertEqual(errors, [])
            data = LocalDocumentStore(db_path).get(view_path)["data"]
            self.assertEqual(
                data,
                {
                    "seed": True,
                    "facts": {"fresh": "facts"},
                    "technicals": {"fresh": "technicals"},
                    "revision": 2,
                },
            )


    def test_document_by_path_and_list_documents_complete_the_firestore_surface(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            client = LocalFirestoreClient(Path(temporary) / "documents.sqlite3")
            history = client.collection("tm_directive_history")
            history.document("AAPL").set({"directive": "buy"})
            history.document("MSFT").set({"directive": "hold"})

            # The radar outcome scorer enumerates directive history this way.
            self.assertEqual(
                sorted(reference.id for reference in history.list_documents()),
                ["AAPL", "MSFT"],
            )
            self.assertEqual(
                [reference.id for reference in history.list_documents(page_size=1)],
                ["AAPL"],
            )

            # data_health reaches for a document by full path, with no
            # collection() call in front of it.
            snapshot = client.document("tm_directive_history/AAPL").get()
            self.assertTrue(snapshot.exists)
            self.assertEqual(snapshot.to_dict(), {"directive": "buy"})
            self.assertFalse(client.document("tm_directive_history/ZZZ").get().exists)


if __name__ == "__main__":
    unittest.main()
