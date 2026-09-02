"""SQLite-backed document storage with one transaction per write."""

from __future__ import annotations

import hmac
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

from .codec import canonical_json, stable_document_hash
from .paths import validate_collection_name, validate_document_path, validate_local_file_path, validate_path_prefix


class LocalDocumentStore:
    def __init__(self, db_path: str | Path):
        self.db_path = validate_local_file_path(db_path)
        if self.db_path.exists() and self.db_path.is_dir():
            raise ValueError("database path must be a file")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialise()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.db_path), timeout=30.0, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=30000")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def _initialise(self) -> None:
        connection = self._connect()
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=NORMAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
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
                "CREATE INDEX IF NOT EXISTS documents_collection_path ON documents(collection, path)"
            )
        finally:
            connection.close()

    @staticmethod
    def _prepare(path: str, data: dict[str, Any], document_hash: str | None = None) -> tuple[str, str, str, str]:
        valid_path = validate_document_path(path)
        if not isinstance(data, dict):
            raise ValueError("document data must be an object")
        data_json = canonical_json(data)
        computed_hash = stable_document_hash(valid_path, data)
        if document_hash is not None:
            if not isinstance(document_hash, str) or not hmac.compare_digest(document_hash, computed_hash):
                raise ValueError("document hash does not match document data")
        collection = valid_path.split("/", 1)[0]
        document_id = valid_path.rsplit("/", 1)[1]
        return valid_path, data_json, computed_hash, collection + "\x00" + document_id

    @staticmethod
    def _row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "path": row["path"],
            "data": json.loads(row["data_json"]),
            "hash": row["document_hash"],
            "updated_at": row["updated_at"],
        }

    def upsert(self, path: str, data: dict[str, Any], document_hash: str | None = None) -> dict[str, Any]:
        return self.batch_upsert([{"path": path, "data": data, "hash": document_hash}])[0]

    def batch_upsert(self, documents: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
        prepared = []
        for document in documents:
            if not isinstance(document, dict):
                raise ValueError("each document must be an object")
            path, data_json, computed_hash, identity = self._prepare(
                document.get("path"), document.get("data"), document.get("hash")
            )
            collection, document_id = identity.split("\x00", 1)
            prepared.append((path, collection, document_id, data_json, computed_hash))
        if not prepared:
            return []

        updated_at = datetime.now(timezone.utc).isoformat()
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.executemany(
                """
                INSERT INTO documents(path, collection, document_id, data_json, document_hash, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    collection=excluded.collection,
                    document_id=excluded.document_id,
                    data_json=excluded.data_json,
                    document_hash=excluded.document_hash,
                    updated_at=excluded.updated_at
                """,
                [(*item, updated_at) for item in prepared],
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

        return [
            {"path": path, "data": json.loads(data_json), "hash": document_hash, "updated_at": updated_at}
            for path, _, _, data_json, document_hash in prepared
        ]

    def get(self, path: str) -> dict[str, Any] | None:
        valid_path = validate_document_path(path)
        connection = self._connect()
        try:
            row = connection.execute(
                "SELECT path, data_json, document_hash, updated_at FROM documents WHERE path = ?",
                (valid_path,),
            ).fetchone()
            return self._row(row) if row else None
        finally:
            connection.close()

    def iter_documents(
        self,
        collection: str,
        prefix: str | None = None,
        limit: int | None = None,
    ) -> Iterator[dict[str, Any]]:
        valid_collection = validate_collection_name(collection)
        valid_prefix = validate_path_prefix(prefix) if prefix is not None else None
        if valid_prefix and valid_prefix != valid_collection and not valid_prefix.startswith(valid_collection + "/"):
            raise ValueError("prefix must be inside the requested collection")
        if limit is not None and (not isinstance(limit, int) or limit < 0):
            raise ValueError("limit must be a non-negative integer")

        connection = self._connect()
        try:
            if valid_prefix:
                escaped = valid_prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                query = (
                    "SELECT path, data_json, document_hash, updated_at FROM documents "
                    "WHERE collection = ? AND path LIKE ? ESCAPE '\\' ORDER BY path"
                )
                params: list[Any] = [valid_collection, escaped + "/%"]
            else:
                query = (
                    "SELECT path, data_json, document_hash, updated_at FROM documents "
                    "WHERE collection = ? ORDER BY path"
                )
                params = [valid_collection]
            if limit is not None:
                query += " LIMIT ?"
                params.append(limit)
            for row in connection.execute(query, params):
                yield self._row(row)
        finally:
            connection.close()

    def list_documents(
        self,
        collection: str,
        prefix: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        return list(self.iter_documents(collection, prefix=prefix, limit=limit))

    def health(self) -> bool:
        connection = self._connect()
        try:
            connection.execute("SELECT 1").fetchone()
            return True
        finally:
            connection.close()

    def backup_to(self, destination: str | Path) -> Path:
        target = validate_local_file_path(destination)
        if target.resolve() == self.db_path.resolve():
            raise ValueError("backup destination must differ from the live database")
        target.parent.mkdir(parents=True, exist_ok=True)
        source = self._connect()
        backup = sqlite3.connect(str(target), timeout=30.0)
        try:
            source.backup(backup)
            backup.commit()
        finally:
            backup.close()
            source.close()
        return target
