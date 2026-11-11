"""The LocalDB HTTP server's connection handling: keep-alive, the accept backlog, unread bodies."""

from __future__ import annotations

import http.client
import json
import socket
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.localdb import LocalDocumentStore
from backend.localdb.server import ACCEPT_BACKLOG, LocalDBRequestHandler, make_server

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


class LocalDBHttpConnectionTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        store = LocalDocumentStore(Path(self._temporary.name) / "documents.sqlite3")
        store.upsert("users/u1", {"name": "one"})
        store.upsert("users/u2", {"name": "two"})
        self.server = make_server("127.0.0.1", 0, store, TOKEN, {"users"})
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_port

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=2)
        self.server.server_close()
        self._temporary.cleanup()

    def _connection(self) -> http.client.HTTPConnection:
        return http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)

    def test_server_queues_connections_and_speaks_http_1_1(self) -> None:
        self.assertEqual(self.server.request_queue_size, ACCEPT_BACKLOG)
        self.assertGreaterEqual(ACCEPT_BACKLOG, 64)
        self.assertEqual(LocalDBRequestHandler.protocol_version, "HTTP/1.1")

    def test_one_connection_carries_many_requests(self) -> None:
        connection = self._connection()
        try:
            sockets = set()
            for _ in range(3):
                body = json.dumps({"paths": ["users/u1", "users/u2"]})
                connection.request("POST", "/documents:batchGet", body=body, headers=AUTH)
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(response.version, 11)
                self.assertIsNotNone(response.getheader("Content-Length"))
                self.assertEqual(response.getheader("X-LocalDB-Backlog"), str(ACCEPT_BACKLOG))
                self.assertEqual(json.loads(response.read())["count"], 2)
                sockets.add(id(connection.sock))
            # A GET and a 404 on the same connection too.
            connection.request("GET", "/documents/users/u1", headers=AUTH)
            response = connection.getresponse()
            self.assertEqual(json.loads(response.read())["document"]["data"], {"name": "one"})
            connection.request("GET", "/documents/users/missing", headers=AUTH)
            response = connection.getresponse()
            self.assertEqual(response.status, 404)
            response.read()
            self.assertIsNone(response.getheader("Connection"))
            sockets.add(id(connection.sock))
            self.assertEqual(len(sockets), 1, "the client had to reconnect")
        finally:
            connection.close()

    def test_refused_request_with_unread_body_closes_the_connection(self) -> None:
        # Refused before its body is read: the body bytes must not be parsed as the next request.
        connection = self._connection()
        try:
            body = json.dumps({"paths": ["users/u1"]})
            connection.request("POST", "/documents:batchGet", body=body, headers={"Content-Type": "application/json"})
            response = connection.getresponse()
            self.assertEqual(response.status, 401)
            self.assertEqual(response.getheader("Connection"), "close")
            response.read()
        finally:
            connection.close()
        # The server is still healthy afterwards.
        connection = self._connection()
        try:
            connection.request("GET", "/health")
            self.assertEqual(json.loads(connection.getresponse().read())["ok"], True)
        finally:
            connection.close()

    def test_bad_body_after_reading_keeps_the_connection(self) -> None:
        connection = self._connection()
        try:
            connection.request("POST", "/documents:batchGet", body="{not json", headers=AUTH)
            response = connection.getresponse()
            self.assertEqual(response.status, 400)
            self.assertIsNone(response.getheader("Connection"))
            response.read()
            connection.request("POST", "/documents:batchGet", body=json.dumps({"paths": ["users/u2"]}), headers=AUTH)
            response = connection.getresponse()
            self.assertEqual(json.loads(response.read())["documents"][0]["data"], {"name": "two"})
        finally:
            connection.close()

    def test_pipelined_requests_on_raw_socket(self) -> None:
        # Two requests written back to back on one socket get two complete responses, in order.
        body = json.dumps({"paths": ["users/u1"]}).encode()
        one = (
            b"POST /documents:batchGet HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer " + TOKEN.encode()
            + b"\r\nContent-Type: application/json\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
        )
        two = b"GET /documents/users/u2 HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer " + TOKEN.encode() + b"\r\nConnection: close\r\n\r\n"
        with socket.create_connection(("127.0.0.1", self.port), timeout=10) as raw:
            raw.sendall(one + two)
            received = b""
            while True:
                chunk = raw.recv(65536)
                if not chunk:
                    break
                received += chunk
        self.assertEqual(received.count(b"HTTP/1.1 200"), 2)
        self.assertIn(b'"name":"one"', received)
        self.assertIn(b'"name":"two"', received)

    def test_many_parallel_connections_are_all_served_quickly(self) -> None:
        # With the old backlog of 5, a burst like this left some connections
        # waiting about a second for a SYN retry.
        def fetch(_index: int) -> float:
            started = time.monotonic()
            connection = self._connection()
            try:
                connection.request("POST", "/documents:batchGet", body=json.dumps({"paths": ["users/u1"]}), headers=AUTH)
                response = connection.getresponse()
                response.read()
                self.assertEqual(response.status, 200)
            finally:
                connection.close()
            return time.monotonic() - started

        with ThreadPoolExecutor(max_workers=48) as pool:
            durations = list(pool.map(fetch, range(96)))
        self.assertEqual(len(durations), 96)
        self.assertLess(max(durations), 0.9)


if __name__ == "__main__":
    unittest.main()
