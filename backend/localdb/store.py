"""SQLite-backed document storage with one transaction per write."""

from __future__ import annotations

import copy
import hmac
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator, NamedTuple

from .codec import canonical_json, denormalise_value, stable_document_hash
from .paths import validate_collection_name, validate_document_path, validate_local_file_path, validate_path_prefix
from .query import (
    QuerySpec,
    array_index_rows,
    compile_query,
    decode_query_row,
    document_path_meta,
)


SCHEMA_VERSION = 2


class PreparedDocument(NamedTuple):
    path: str
    collection: str
    parent_collection: str
    collection_id: str
    document_id: str
    depth: int
    data_json: str
    document_hash: str


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
        connection.execute("PRAGMA cache_size=-65536")
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
                    updated_at TEXT NOT NULL,
                    parent_collection TEXT NOT NULL DEFAULT '',
                    collection_id TEXT NOT NULL DEFAULT '',
                    depth INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            self._ensure_document_columns(connection)
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS document_array_values (
                    path TEXT NOT NULL,
                    field TEXT NOT NULL,
                    value TEXT NOT NULL,
                    PRIMARY KEY (field, value, path)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS localdb_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            connection.execute("BEGIN IMMEDIATE")
            current = self._schema_version(connection)
            if current < SCHEMA_VERSION:
                self._backfill_path_meta(connection)
                self._rebuild_array_index(connection)
                self._create_indexes(connection)
                connection.execute(
                    "INSERT INTO localdb_meta(key, value) VALUES ('schema_version', ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (str(SCHEMA_VERSION),),
                )
            else:
                self._create_indexes(connection)
            connection.commit()
        except Exception:
            try:
                connection.rollback()
            except sqlite3.Error:
                pass
            raise
        finally:
            connection.close()

    @staticmethod
    def _schema_version(connection: sqlite3.Connection) -> int:
        row = connection.execute(
            "SELECT value FROM localdb_meta WHERE key = 'schema_version'"
        ).fetchone()
        if row is None:
            return 1
        try:
            return int(row["value"])
        except (TypeError, ValueError):
            return 1

    @staticmethod
    def _ensure_document_columns(connection: sqlite3.Connection) -> None:
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(documents)")}
        required = {
            "parent_collection": "TEXT NOT NULL DEFAULT ''",
            "collection_id": "TEXT NOT NULL DEFAULT ''",
            "depth": "INTEGER NOT NULL DEFAULT 0",
        }
        for name, definition in required.items():
            if name not in columns:
                connection.execute(f"ALTER TABLE documents ADD COLUMN {name} {definition}")

    @staticmethod
    def _backfill_path_meta(connection: sqlite3.Connection) -> None:
        updates: list[tuple[Any, ...]] = []
        for row in connection.execute("SELECT path FROM documents"):
            collection, parent_collection, collection_id, document_id, depth = document_path_meta(row["path"])
            updates.append((collection, document_id, parent_collection, collection_id, depth, row["path"]))
            if len(updates) >= 500:
                connection.executemany(
                    "UPDATE documents SET collection=?, document_id=?, parent_collection=?, "
                    "collection_id=?, depth=? WHERE path=?",
                    updates,
                )
                updates = []
        if updates:
            connection.executemany(
                "UPDATE documents SET collection=?, document_id=?, parent_collection=?, "
                "collection_id=?, depth=? WHERE path=?",
                updates,
            )

    @staticmethod
    def _rebuild_array_index(connection: sqlite3.Connection) -> None:
        connection.execute("DELETE FROM document_array_values")
        pending: list[tuple[str, str, str]] = []
        for row in connection.execute("SELECT path, data_json FROM documents"):
            pending.extend(array_index_rows(row["path"], json.loads(row["data_json"])))
            if len(pending) >= 500:
                connection.executemany(
                    "INSERT OR IGNORE INTO document_array_values(path, field, value) VALUES (?, ?, ?)",
                    pending,
                )
                pending = []
        if pending:
            connection.executemany(
                "INSERT OR IGNORE INTO document_array_values(path, field, value) VALUES (?, ?, ?)",
                pending,
            )

    @staticmethod
    def _create_indexes(connection: sqlite3.Connection) -> None:
        statements = (
            "CREATE INDEX IF NOT EXISTS documents_collection_path ON documents(collection, path)",
            "CREATE INDEX IF NOT EXISTS documents_parent_path ON documents(parent_collection, path)",
            "CREATE INDEX IF NOT EXISTS documents_group ON documents(collection_id, path)",
            "CREATE INDEX IF NOT EXISTS documents_parent_market_ticker ON documents("
            "parent_collection, json_extract(data_json, '$.market'), json_extract(data_json, '$.ticker'))",
            "CREATE INDEX IF NOT EXISTS documents_parent_market_symbol ON documents("
            "parent_collection, json_extract(data_json, '$.market'), json_extract(data_json, '$.symbol'))",
            "CREATE INDEX IF NOT EXISTS documents_parent_market_event ON documents("
            "parent_collection, json_extract(data_json, '$.market'), json_extract(data_json, '$.event_date'))",
            "CREATE INDEX IF NOT EXISTS documents_parent_published ON documents("
            "parent_collection, json_extract(data_json, '$.published_at'))",
            "CREATE INDEX IF NOT EXISTS documents_parent_uid ON documents("
            "parent_collection, json_extract(data_json, '$.uid'))",
            "CREATE INDEX IF NOT EXISTS documents_parent_user_id ON documents("
            "parent_collection, json_extract(data_json, '$.user_id'))",
            "CREATE INDEX IF NOT EXISTS documents_parent_status ON documents("
            "parent_collection, json_extract(data_json, '$.status'))",
            "CREATE INDEX IF NOT EXISTS documents_parent_instrument ON documents("
            "parent_collection, json_extract(data_json, '$.instrument_id'))",
            "CREATE INDEX IF NOT EXISTS documents_parent_email ON documents("
            "parent_collection, json_extract(data_json, '$.email_lower'))",
            "CREATE INDEX IF NOT EXISTS document_array_values_path ON document_array_values(path)",
        )
        for statement in statements:
            connection.execute(statement)

    @staticmethod
    def _prepare(path: str, data: dict[str, Any], document_hash: str | None = None) -> PreparedDocument:
        valid_path = validate_document_path(path)
        if not isinstance(data, dict):
            raise ValueError("document data must be an object")
        data_json = canonical_json(data)
        computed_hash = stable_document_hash(valid_path, data)
        if document_hash is not None:
            if not isinstance(document_hash, str) or not hmac.compare_digest(document_hash, computed_hash):
                raise ValueError("document hash does not match document data")
        collection, parent_collection, collection_id, document_id, depth = document_path_meta(valid_path)
        return PreparedDocument(
            path=valid_path,
            collection=collection,
            parent_collection=parent_collection,
            collection_id=collection_id,
            document_id=document_id,
            depth=depth,
            data_json=data_json,
            document_hash=computed_hash,
        )

    @staticmethod
    def _row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "path": row["path"],
            "data": denormalise_value(json.loads(row["data_json"])),
            "hash": row["document_hash"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _replace_array_index(connection: sqlite3.Connection, path: str, data_json: str) -> None:
        connection.execute("DELETE FROM document_array_values WHERE path = ?", (path,))
        rows = array_index_rows(path, json.loads(data_json))
        if rows:
            connection.executemany(
                "INSERT OR IGNORE INTO document_array_values(path, field, value) VALUES (?, ?, ?)",
                rows,
            )

    @staticmethod
    def _insert_sql() -> str:
        return """
            INSERT INTO documents(
                path, collection, document_id, data_json, document_hash, updated_at,
                parent_collection, collection_id, depth
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                collection=excluded.collection,
                document_id=excluded.document_id,
                data_json=excluded.data_json,
                document_hash=excluded.document_hash,
                updated_at=excluded.updated_at,
                parent_collection=excluded.parent_collection,
                collection_id=excluded.collection_id,
                depth=excluded.depth
        """

    @staticmethod
    def _insert_params(item: PreparedDocument, updated_at: str) -> tuple[Any, ...]:
        return (
            item.path,
            item.collection,
            item.document_id,
            item.data_json,
            item.document_hash,
            updated_at,
            item.parent_collection,
            item.collection_id,
            item.depth,
        )

    def upsert(self, path: str, data: dict[str, Any], document_hash: str | None = None) -> dict[str, Any]:
        return self.batch_upsert([{"path": path, "data": data, "hash": document_hash}])[0]

    def batch_upsert(self, documents: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
        prepared = []
        for document in documents:
            if not isinstance(document, dict):
                raise ValueError("each document must be an object")
            prepared.append(self._prepare(document.get("path"), document.get("data"), document.get("hash")))
        if not prepared:
            return []

        updated_at = datetime.now(timezone.utc).isoformat()
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.executemany(self._insert_sql(), [self._insert_params(item, updated_at) for item in prepared])
            for item in prepared:
                self._replace_array_index(connection, item.path, item.data_json)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

        return [
            {"path": item.path, "data": json.loads(item.data_json), "hash": item.document_hash, "updated_at": updated_at}
            for item in prepared
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

    def get_many(self, paths: Iterable[str]) -> list[dict[str, Any]]:
        valid_paths = list(dict.fromkeys(validate_document_path(path) for path in paths))
        if not valid_paths:
            return []
        placeholders = ",".join("?" for _ in valid_paths)
        connection = self._connect()
        try:
            rows = connection.execute(
                f"SELECT path, data_json, document_hash, updated_at FROM documents WHERE path IN ({placeholders})",
                valid_paths,
            ).fetchall()
            by_path = {row["path"]: self._row(row) for row in rows}
            return [by_path[path] for path in valid_paths if path in by_path]
        finally:
            connection.close()

    def execute_query(self, spec: QuerySpec) -> Iterator[dict[str, Any]]:
        compiled = compile_query(spec)
        connection = self._connect()
        try:
            for row in connection.execute(compiled.sql, compiled.params):
                yield decode_query_row(row, compiled.selected)
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

    def list_collection_documents(
        self,
        collection_path: str,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """List direct children of a root or nested Firestore collection."""

        valid_path = validate_path_prefix(collection_path)
        parts = valid_path.split("/")
        if len(parts) % 2 == 0:
            raise ValueError("collection path must end at a collection")
        if limit is not None and (not isinstance(limit, int) or limit < 0):
            raise ValueError("limit must be a non-negative integer")
        connection = self._connect()
        try:
            query = (
                "SELECT path, data_json, document_hash, updated_at FROM documents "
                "WHERE parent_collection = ? ORDER BY path"
            )
            params: list[Any] = [valid_path]
            if limit is not None:
                query += " LIMIT ?"
                params.append(limit)
            return [self._row(row) for row in connection.execute(query, params)]
        finally:
            connection.close()

    def iter_all_documents(self) -> Iterator[dict[str, Any]]:
        connection = self._connect()
        try:
            for row in connection.execute(
                "SELECT path, data_json, document_hash, updated_at FROM documents ORDER BY path"
            ):
                yield self._row(row)
        finally:
            connection.close()

    def iter_collection_group_documents(self, collection: str) -> Iterator[dict[str, Any]]:
        valid_collection = validate_collection_name(collection)
        connection = self._connect()
        try:
            for row in connection.execute(
                "SELECT path, data_json, document_hash, updated_at FROM documents "
                "WHERE collection_id = ? ORDER BY path",
                (valid_collection,),
            ):
                yield self._row(row)
        finally:
            connection.close()

    def delete_collection(self, collection_path: str) -> int:
        """Delete every direct document in a collection without loading JSON."""

        valid_path = validate_path_prefix(collection_path)
        parts = valid_path.split("/")
        if len(parts) % 2 == 0:
            raise ValueError("collection path must end at a collection")
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM document_array_values WHERE path IN "
                "(SELECT path FROM documents WHERE parent_collection = ?)",
                (valid_path,),
            )
            cursor = connection.execute(
                "DELETE FROM documents WHERE parent_collection = ?",
                (valid_path,),
            )
            connection.commit()
            return int(cursor.rowcount or 0)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _apply_fields(existing: dict[str, Any], data: dict[str, Any], merge: bool) -> dict[str, Any]:
        """Apply field-path assignments without recursively merging map values."""

        result = copy.deepcopy(existing) if merge else {}
        for field_path, value in data.items():
            if not isinstance(field_path, str):
                raise ValueError("document field paths must be strings")
            target = result
            pieces = field_path.split(".")
            for piece in pieces[:-1]:
                child = target.get(piece)
                if not isinstance(child, dict):
                    child = {}
                    target[piece] = child
                target = child
            target[pieces[-1]] = copy.deepcopy(value)
        return result

    def apply_operations(
        self,
        operations: Iterable[dict[str, Any]],
        expected_hashes: dict[str, str | None] | None = None,
        resolve_operation: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]] | None = None,
    ) -> list[dict[str, Any] | None]:
        """Apply writes atomically, resolving each operation after its lock is held."""

        prepared = list(operations)
        if not prepared:
            return []
        connection = self._connect()
        results: list[dict[str, Any] | None] = []
        try:
            connection.execute("BEGIN IMMEDIATE")
            for path, expected in (expected_hashes or {}).items():
                valid_path = validate_document_path(path)
                row = connection.execute(
                    "SELECT document_hash FROM documents WHERE path = ?", (valid_path,)
                ).fetchone()
                actual = row["document_hash"] if row else None
                if actual != expected:
                    raise RuntimeError(f"transaction conflict for {valid_path}")

            updated_at = datetime.now(timezone.utc).isoformat()
            for operation in prepared:
                path = validate_document_path(operation.get("path"))
                kind = operation.get("op", "set")
                if kind == "delete":
                    connection.execute("DELETE FROM document_array_values WHERE path = ?", (path,))
                    connection.execute("DELETE FROM documents WHERE path = ?", (path,))
                    results.append(None)
                    continue
                if kind == "create" and connection.execute(
                    "SELECT 1 FROM documents WHERE path = ?", (path,)
                ).fetchone():
                    raise ValueError(f"document already exists: {path}")
                existing_row = connection.execute(
                    "SELECT data_json FROM documents WHERE path = ?", (path,)
                ).fetchone()
                existing = denormalise_value(json.loads(existing_row["data_json"])) if existing_row else {}
                if resolve_operation is None:
                    data = operation.get("data")
                    if not isinstance(data, dict):
                        raise ValueError("document data must be an object")
                    merged = self._apply_fields(existing, data, bool(operation.get("merge")))
                else:
                    merged = resolve_operation(existing, operation)
                    if not isinstance(merged, dict):
                        raise ValueError("resolved document data must be an object")
                item = self._prepare(path, merged)
                connection.execute(self._insert_sql(), self._insert_params(item, updated_at))
                self._replace_array_index(connection, item.path, item.data_json)
                results.append({
                    "path": path,
                    "data": denormalise_value(json.loads(item.data_json)),
                    "hash": item.document_hash,
                    "updated_at": updated_at,
                })
            connection.commit()
            return results
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def delete(self, path: str) -> None:
        self.apply_operations([{"op": "delete", "path": path}])

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
