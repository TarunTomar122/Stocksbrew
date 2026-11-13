"""LocalDB read metrics: per-collection counts, docs, bytes and latency, and the authenticated GET /metrics."""

from __future__ import annotations

import http.client
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.localdb import LocalDocumentStore
from backend.localdb.metrics import StoreMetrics, collection_label, per_collection_sizes
from backend.localdb.server import make_server

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


class CollectionLabelTest(unittest.TestCase):
    def test_document_ids_never_show(self) -> None:
        self.assertEqual(collection_label("users/uid-123"), "users")
        self.assertEqual(collection_label("users/uid-123/watchlist/AAPL"), "users/*/watchlist")
        self.assertEqual(collection_label("tm_stock_intel_pro/AAPL/stocks"), "tm_stock_intel_pro/*/stocks")
        self.assertEqual(collection_label("tm_latest_prices"), "tm_latest_prices")
        self.assertEqual(collection_label(""), "?")


class StoreMetricsTest(unittest.TestCase):
    def test_window_rolls_and_percentiles(self) -> None:
        now = [1000.0]
        metrics = StoreMetrics(window_seconds=60, clock=lambda: now[0])
        for ms in range(1, 101):
            metrics.record("batchGet", {"tm_latest_prices": (2, 100)}, float(ms))
        snap = metrics.snapshot()
        row = snap["collections"]["tm_latest_prices"]
        self.assertEqual(row["count"], 100)
        self.assertEqual(row["docs"], 200)
        self.assertEqual(row["bytes"], 10_000)
        self.assertEqual(row["p50_ms"], 50.0)
        self.assertEqual(row["p95_ms"], 95.0)
        self.assertEqual(row["endpoints"]["batchGet"]["count"], 100)
        self.assertEqual(snap["endpoints"]["batchGet"]["docs"], 200)
        # Older than the window: gone.
        now[0] += 61
        metrics.record("get", {"users": (1, 10)}, 1.0)
        snap = metrics.snapshot()
        self.assertNotIn("tm_latest_prices", snap["collections"])
        self.assertEqual(snap["totals"]["count"], 1)

    def test_narrower_window_and_summary_line(self) -> None:
        now = [0.0]
        metrics = StoreMetrics(window_seconds=900, clock=lambda: now[0])
        metrics.record("query", {"tm_news": (10, 5_000_000)}, 40.0)
        now[0] = 600.0
        metrics.record("get", {"users": (1, 200)}, 2.0)
        self.assertEqual(metrics.snapshot(300)["totals"]["count"], 1)
        self.assertEqual(metrics.snapshot()["totals"]["count"], 2)
        line = metrics.summary_line()
        self.assertIn("reqs=2", line)
        # Largest by bytes first.
        self.assertLess(line.index("tm_news"), line.index("users"))

    def test_sample_cap(self) -> None:
        metrics = StoreMetrics(window_seconds=900, max_samples=3)
        for _ in range(5):
            metrics.record("get", {"users": (1, 1)}, 1.0)
        snap = metrics.snapshot()
        self.assertEqual(snap["samples"], 3)
        self.assertEqual(snap["dropped"], 2)

    def test_per_collection_sizes(self) -> None:
        sizes = per_collection_sizes(
            [{"path": "a/1"}, {"path": "a/2"}, {"path": "b/1/c/2"}],
            [10, 20, 5],
        )
        self.assertEqual(sizes, {"a": (2, 30), "b/*/c": (1, 5)})


class MetricsEndpointTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        store = LocalDocumentStore(Path(self._temporary.name) / "documents.sqlite3")
        store.upsert("users/u1", {"name": "one"})
        store.upsert("tm_latest_prices/AAPL", {"price": 1.5, "history_window": [1, 2, 3]})
        self.server = make_server("127.0.0.1", 0, store, TOKEN)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=2)
        self.server.server_close()
        self._temporary.cleanup()

    def _request(self, method: str, path: str, body: object | None = None, headers: dict[str, str] | None = None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=10)
        try:
            connection.request(method, path, body=json.dumps(body) if body is not None else None, headers=AUTH if headers is None else headers)
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def test_metrics_need_the_token(self) -> None:
        status, _ = self._request("GET", "/metrics", headers={})
        self.assertEqual(status, 401)

    def test_reads_are_counted_per_collection_and_endpoint(self) -> None:
        status, raw = self._request("POST", "/documents:batchGet", {"paths": ["users/u1", "tm_latest_prices/AAPL"]})
        self.assertEqual(status, 200)
        # The body is still exactly what json.dumps gives.
        payload = json.loads(raw)
        self.assertEqual(raw, json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode())
        self.assertEqual(payload["count"], 2)
        self._request("GET", "/documents/users/u1")
        self._request("POST", "/query", {"collection": "tm_latest_prices", "filters": [], "limit": 5})
        self._request("POST", "/query", {"collection": "nothing_here", "filters": [], "limit": 5})
        self._request("POST", "/documents:batchWrite", {"operations": [{"op": "set", "path": "users/u2", "data": {"a": 1}}]})
        status, raw = self._request("GET", "/metrics")
        self.assertEqual(status, 200)
        snap = json.loads(raw)
        users = snap["collections"]["users"]
        self.assertEqual(users["endpoints"]["batchGet"]["docs"], 1)
        self.assertEqual(users["endpoints"]["get"]["docs"], 1)
        self.assertEqual(users["endpoints"]["batchWrite"]["docs"], 1)
        prices = snap["collections"]["tm_latest_prices"]
        self.assertEqual(prices["endpoints"]["query"]["docs"], 1)
        self.assertGreater(prices["bytes"], 0)
        self.assertEqual(snap["collections"]["nothing_here"]["docs"], 0)
        self.assertIn("p95_ms", snap["endpoints"]["batchGet"])
        # No document id anywhere in the report.
        self.assertNotIn("u1", raw.decode())
        self.assertNotIn("AAPL", raw.decode())

    def test_bad_window_is_refused(self) -> None:
        status, _ = self._request("GET", "/metrics?window=-1")
        self.assertEqual(status, 400)
        status, raw = self._request("GET", "/metrics?window=60")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["window_seconds"], 60.0)


if __name__ == "__main__":
    unittest.main()
