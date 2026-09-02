"""Minimal authenticated HTTP API for the local document store."""

from __future__ import annotations

import argparse
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from .paths import validate_collection_name, validate_document_path, validate_path_prefix
from .store import LocalDocumentStore

MAX_BODY_BYTES = 16 * 1024 * 1024
MAX_BATCH_DOCUMENTS = 500
MAX_LIST_DOCUMENTS = 5_000


class _HTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class LocalDBRequestHandler(BaseHTTPRequestHandler):
    server: _HTTPServer

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, message: str, status: int) -> None:
        self._send_json({"error": message}, status)

    def _authorised(self) -> bool:
        header = self.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else self.headers.get("X-LocalDB-Token", "")
        return bool(token) and hmac.compare_digest(token, self.server.api_token)

    def _require_auth(self) -> bool:
        if self._authorised():
            return True
        self._error("authentication required", 401)
        return False

    def _read_json(self) -> Any:
        raw_length = self.headers.get("Content-Length")
        try:
            length = int(raw_length or "-1")
        except ValueError as error:
            raise ValueError("invalid request body") from error
        if length < 0 or length > MAX_BODY_BYTES:
            raise ValueError("request body is too large or missing")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("request body must be valid JSON") from error

    def _allowed(self, path: str) -> bool:
        allowed = self.server.allowed_collections
        return isinstance(path, str) and (not allowed or path.split("/", 1)[0] in allowed)

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path == "/health":
            try:
                self._send_json({"ok": self.server.store.health(), "service": "localdb"})
            except Exception:
                self._send_json({"ok": False, "service": "localdb"}, 503)
            return
        if not self._require_auth():
            return
        try:
            if parsed.path == "/documents":
                query = parse_qs(parsed.query, strict_parsing=True)
                collection = validate_collection_name(query.get("collection", [""])[0])
                if not self._allowed(collection):
                    self._error("collection is not allowed", 403)
                    return
                prefix_value = query.get("prefix", [None])[0]
                prefix = validate_path_prefix(prefix_value) if prefix_value else None
                raw_limit = query.get("limit", ["1000"])[0]
                limit = int(raw_limit)
                if limit < 0 or limit > MAX_LIST_DOCUMENTS:
                    raise ValueError("limit is out of range")
                documents = self.server.store.list_documents(collection, prefix=prefix, limit=limit)
                self._send_json({"documents": documents, "count": len(documents)})
                return
            if parsed.path.startswith("/documents/"):
                path = validate_document_path(unquote(parsed.path[len("/documents/") :]))
                if not self._allowed(path):
                    self._error("collection is not allowed", 403)
                    return
                document = self.server.store.get(path)
                if document is None:
                    self._error("document not found", 404)
                else:
                    self._send_json({"document": document})
                return
            self._error("not found", 404)
        except ValueError as error:
            self._error(str(error), 400)
        except Exception:
            self._error("internal error", 500)

    def do_PUT(self) -> None:
        if not self._require_auth():
            return
        parsed = urlsplit(self.path)
        try:
            if not parsed.path.startswith("/documents/"):
                self._error("not found", 404)
                return
            path = validate_document_path(unquote(parsed.path[len("/documents/") :]))
            if not self._allowed(path):
                self._error("collection is not allowed", 403)
                return
            body = self._read_json()
            if not isinstance(body, dict) or "data" not in body:
                raise ValueError("body must contain data")
            document = self.server.store.upsert(path, body["data"], body.get("hash"))
            self._send_json({"document": document})
        except ValueError as error:
            self._error(str(error), 400)
        except Exception:
            self._error("internal error", 500)

    def do_POST(self) -> None:
        if not self._require_auth():
            return
        if urlsplit(self.path).path != "/documents:batchUpsert":
            self._error("not found", 404)
            return
        try:
            body = self._read_json()
            documents = body.get("documents") if isinstance(body, dict) else None
            if not isinstance(documents, list) or len(documents) > MAX_BATCH_DOCUMENTS:
                raise ValueError("documents must be a list of at most 500 items")
            for document in documents:
                if not isinstance(document, dict):
                    raise ValueError("each document must be an object")
                path = validate_document_path(document.get("path", ""))
                if not self._allowed(path):
                    self._error("collection is not allowed", 403)
                    return
            result = self.server.store.batch_upsert(documents)
            self._send_json({"documents": result, "count": len(result)})
        except ValueError as error:
            self._error(str(error), 400)
        except Exception:
            self._error("internal error", 500)


def make_server(
    host: str,
    port: int,
    store: LocalDocumentStore,
    token: str,
    allowed_collections: set[str] | None = None,
) -> _HTTPServer:
    if not token:
        raise ValueError("API token is required")
    server = _HTTPServer((host, port), LocalDBRequestHandler)
    server.store = store
    server.api_token = token
    server.allowed_collections = allowed_collections or set()
    return server


def _env_collections() -> set[str] | None:
    raw = os.getenv("LOCALDB_ALLOWED_COLLECTIONS", "")
    if not raw.strip():
        return None
    return {validate_collection_name(item.strip()) for item in raw.split(",") if item.strip()}


def main() -> None:
    parser = argparse.ArgumentParser(description="serve the local document store")
    parser.add_argument("--db", default=os.getenv("LOCALDB_PATH", "localdb.sqlite3"))
    parser.add_argument("--host", default=os.getenv("LOCALDB_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("LOCALDB_PORT", "8500")))
    args = parser.parse_args()
    store = LocalDocumentStore(args.db)
    server = make_server(args.host, args.port, store, os.getenv("LOCALDB_API_TOKEN", ""), _env_collections())
    print(f"localdb listening on {args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
