"""Read-only document access for the mail builders.

On the VPS the jobs run against `TraceMoneyStore().db` (the SQLite-backed
Firestore shape). Locally, previews read the same production store over the
LocalDB HTTP API so they show real data without a Firebase detour. Both
expose the same four calls, and neither can write.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any, Iterable, Protocol


class Source(Protocol):
    def get(self, path: str) -> dict[str, Any] | None: ...

    def get_many(self, paths: list[str]) -> dict[str, dict[str, Any]]: ...

    def query(
        self,
        collection: str,
        filters: list[tuple[str, str, Any]] | None = None,
        *,
        limit: int | None = None,
        select: list[str] | None = None,
    ) -> list[tuple[str, dict[str, Any]]]: ...

    def children(self, parent_path: str, collection: str, *, limit: int = 200) -> list[tuple[str, dict[str, Any]]]: ...


class HttpSource:
    """LocalDB over HTTPS. Needs LOCALDB_URL and LOCALDB_API_TOKEN; never logs the token."""

    def __init__(self, url: str | None = None, token: str | None = None, timeout: int = 90):
        self.url = (url or os.environ.get("LOCALDB_URL", "")).rstrip("/")
        self._token = token or os.environ.get("LOCALDB_API_TOKEN", "")
        if not self.url or not self._token:
            raise RuntimeError("LOCALDB_URL and LOCALDB_API_TOKEN are required for HttpSource")
        self.timeout = timeout

    def _call(self, path: str, body: dict | None = None) -> dict:
        req = urllib.request.Request(
            self.url + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"},
            method="POST" if body is not None else "GET",
        )
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.load(resp)
            except urllib.error.HTTPError as err:
                # 502/503/504 are the proxy or a busy worker; back off and retry
                if err.code not in (502, 503, 504) or attempt == 2:
                    raise
                time.sleep(2 * (attempt + 1))
            except urllib.error.URLError:
                # a dropped TLS handshake through the proxy; the same read usually works a moment later
                if attempt == 2:
                    raise
                time.sleep(5 * (attempt + 1))
        raise RuntimeError("unreachable")

    def get(self, path: str) -> dict[str, Any] | None:
        return self.get_many([path]).get(path)

    def get_many(self, paths: list[str]) -> dict[str, dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {}
        for i in range(0, len(paths), 200):
            chunk = paths[i : i + 200]
            if not chunk:
                continue
            body = self._call("/documents:batchGet", {"paths": chunk})
            for doc in body.get("documents") or []:
                if doc.get("data") is not None:
                    out[doc["path"]] = doc["data"]
        return out

    def query(self, collection, filters=None, *, limit=None, select=None):
        body = {
            "collection": collection,
            "filters": [{"field": f, "op": op, "value": v} for f, op, v in (filters or [])],
            "limit": limit,
            "select": select,
        }
        docs = self._call("/query", body).get("documents") or []
        return [(d["path"], d.get("data") or {}) for d in docs]

    def children(self, parent_path, collection, *, limit=200):
        prefix = f"{parent_path}/{collection}"
        top = parent_path.split("/", 1)[0]
        body = self._call(f"/documents?collection={top}&prefix={prefix}&limit={int(limit)}")
        docs = body.get("documents") or []
        return [(d["path"], d.get("data") or {}) for d in docs if d.get("path", "").count("/") == prefix.count("/") + 1]


class StoreSource:
    """Wraps a Firestore-shaped client (`TraceMoneyStore().db`)."""

    def __init__(self, db: Any):
        self.db = db

    def _ref(self, path: str):
        return self.db.document(path)

    def get(self, path: str) -> dict[str, Any] | None:
        snap = self._ref(path).get()
        return (snap.to_dict() or {}) if snap.exists else None

    def get_many(self, paths: list[str]) -> dict[str, dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {}
        refs = [self._ref(p) for p in paths]
        if not refs:
            return out
        getter: Iterable = self.db.get_all(refs) if hasattr(self.db, "get_all") else (r.get() for r in refs)
        for snap in getter:
            if snap.exists:
                out[snap.reference.path] = snap.to_dict() or {}
        return out

    def query(self, collection, filters=None, *, limit=None, select=None):
        q = self.db.collection(collection)
        for f, op, v in filters or []:
            q = q.where(f, op, v)
        if select:
            q = q.select(select)
        if limit:
            q = q.limit(limit)
        return [(snap.reference.path, snap.to_dict() or {}) for snap in q.stream()]

    def children(self, parent_path, collection, *, limit=200):
        q = self._ref(parent_path).collection(collection).limit(limit)
        return [(snap.reference.path, snap.to_dict() or {}) for snap in q.stream()]


class SnapshotSource:
    """Records every read of another source to a JSON file, or replays one.

    For previews only: render the same data before and after a template change
    (`python -m backend.mail.preview --snapshot file.json --now <iso>`). Replay never
    touches the network; a read the snapshot doesn't have returns nothing.
    """

    def __init__(self, path: str, inner: Source | None = None):
        self.path = path
        self.inner = inner
        self.data: dict[str, Any] = {}
        # replay mode reads the file; record mode with a file already there keeps it and adds what's missing
        if inner is None or os.path.exists(path):
            with open(path) as fh:
                self.data = json.load(fh)

    def _key(self, *parts: Any) -> str:
        return json.dumps(parts, sort_keys=True, default=str)

    def _through(self, key: str, fn):
        if self.inner is None or key in self.data:
            return self.data.get(key)
        value = fn()
        self.data[key] = value
        return value

    def get(self, path):
        return self._through(self._key("get", path), lambda: self.inner.get(path))

    def get_many(self, paths):
        return self._through(self._key("get_many", paths), lambda: self.inner.get_many(paths)) or {}

    def query(self, collection, filters=None, *, limit=None, select=None):
        key = self._key("query", collection, filters or [], limit, select)
        rows = self._through(key, lambda: self.inner.query(collection, filters, limit=limit, select=select)) or []
        return [tuple(r) for r in rows]

    def children(self, parent_path, collection, *, limit=200):
        rows = self._through(self._key("children", parent_path, collection, limit),
                             lambda: self.inner.children(parent_path, collection, limit=limit)) or []
        return [tuple(r) for r in rows]

    def save(self) -> None:
        if self.inner is not None:
            with open(self.path, "w") as fh:
                json.dump(self.data, fh, default=str)
