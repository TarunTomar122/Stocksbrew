"""Compile Firestore-shaped queries into SQLite JSON1 SQL.

The store never materializes a collection in Python. sqlite applies
collection scope, filters, order, and limit, then this module decodes
only the surviving rows (or a selected projection).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from .codec import denormalise_value
from .paths import validate_collection_name, validate_path_prefix


_FIELD_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$")
_OPERATOR_ALIASES = {
    "==": "==",
    "=": "==",
    "eq": "==",
    "equal": "==",
    "!=": "!=",
    "ne": "!=",
    "not_equal": "!=",
    "not-equal": "!=",
    "<": "<",
    "lt": "<",
    "less_than": "<",
    "<=": "<=",
    "lte": "<=",
    "le": "<=",
    "less_than_or_equal": "<=",
    ">": ">",
    "gt": ">",
    "greater_than": ">",
    ">=": ">=",
    "gte": ">=",
    "ge": ">=",
    "greater_than_or_equal": ">=",
    "in": "in",
    "not-in": "not-in",
    "not_in": "not-in",
    "array-contains": "array-contains",
    "array_contains": "array-contains",
    "array-contains-any": "array-contains-any",
    "array_contains_any": "array-contains-any",
}


@dataclass(frozen=True)
class QuerySpec:
    collection_path: str
    collection_group: bool = False
    filters: list[tuple[str, str, Any]] = field(default_factory=list)
    orders: list[tuple[str, str]] = field(default_factory=list)
    limit_count: int | None = None
    offset_count: int = 0
    selected: list[str] | None = None


@dataclass(frozen=True)
class CompiledQuery:
    sql: str
    params: list[Any]
    selected: list[str] | None


def normalize_operator(operator: Any) -> str:
    if not isinstance(operator, str):
        operator = getattr(operator, "value", None) or str(operator)
    raw = operator.strip()
    mapped = (
        _OPERATOR_ALIASES.get(raw)
        or _OPERATOR_ALIASES.get(raw.lower())
        or _OPERATOR_ALIASES.get(raw.lower().replace("_", "-"))
        or _OPERATOR_ALIASES.get(raw.lower().replace("-", "_"))
    )
    if mapped is None:
        raise ValueError(f"unsupported query operator: {operator}")
    return mapped


def encode_array_value(value: Any) -> str | None:
    """Stable side-table encoding for scalar array membership."""

    if isinstance(value, (dict, list, tuple)):
        return None
    try:
        return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return None


def array_index_rows(path: str, data: dict[str, Any]) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for key, value in data.items():
        if not isinstance(key, str) or not isinstance(value, list):
            continue
        seen: set[str] = set()
        for item in value:
            encoded = encode_array_value(item)
            if encoded is None or encoded in seen:
                continue
            seen.add(encoded)
            rows.append((path, key, encoded))
    return rows


def document_path_meta(path: str) -> tuple[str, str, str, str, int]:
    """Return collection, parent_collection, collection_id, document_id, depth."""

    parts = path.split("/")
    return parts[0], "/".join(parts[:-1]), parts[-2], parts[-1], len(parts)


def _json_path(field_path: str) -> str:
    if not _FIELD_RE.match(field_path):
        raise ValueError(f"invalid query field: {field_path}")
    return "$." + field_path


def _type_sql(field_path: str) -> str:
    return f"json_type(data_json, '{_json_path(field_path)}')"


def _unwrap_sql(field_path: str) -> str:
    path = _json_path(field_path)
    tagged = _json_path(field_path) + ".__localdb_type__"
    value_path = _json_path(field_path) + ".value"
    return (
        "CASE json_extract(data_json, "
        f"'{tagged}') "
        f"WHEN 'timestamp' THEN json_extract(data_json, '{value_path}') "
        f"WHEN 'date' THEN json_extract(data_json, '{value_path}') "
        f"ELSE json_extract(data_json, '{path}') END"
    )


def _bind_scalar(value: Any) -> Any:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float, str)) or value is None:
        return value
    if isinstance(value, (list, dict)):
        raise ValueError("query value must be a scalar")
    return str(value)


def _present_sql(field_path: str) -> str:
    type_sql = _type_sql(field_path)
    return f"({type_sql} IS NOT NULL AND {type_sql} != 'null')"


def compile_query(spec: QuerySpec) -> CompiledQuery:
    collection_path = validate_path_prefix(spec.collection_path)
    params: list[Any] = []
    where_parts: list[str] = []

    if spec.collection_group:
        where_parts.append("collection_id = ?")
        params.append(validate_collection_name(collection_path))
    else:
        where_parts.append("parent_collection = ?")
        params.append(collection_path)

    for field_path, operator, expected in spec.filters:
        if not isinstance(field_path, str):
            raise ValueError("where requires field, operator, and value")
        clause, extra = _filter_sql(field_path, operator, expected)
        where_parts.append(clause)
        params.extend(extra)

    selected = list(spec.selected) if spec.selected is not None else None
    if selected is not None:
        if not selected or not all(isinstance(item, str) and item for item in selected):
            raise ValueError("select must be a list of field paths")
        columns = ["path", "document_hash", "updated_at"]
        for index, field_path in enumerate(selected):
            path = _json_path(field_path)
            columns.append(f"json_type(data_json, '{path}') AS t{index}")
            columns.append(f"json_extract(data_json, '{path}') AS s{index}")
        select_sql = ", ".join(columns)
    else:
        select_sql = "path, data_json, document_hash, updated_at"

    order_sql = _order_sql(spec.orders)
    sql = f"SELECT {select_sql} FROM documents WHERE " + " AND ".join(where_parts)
    if order_sql:
        sql += " ORDER BY " + order_sql
    else:
        sql += " ORDER BY path"

    if spec.offset_count:
        if not isinstance(spec.offset_count, int) or spec.offset_count < 0:
            raise ValueError("offset must be a non-negative integer")
    if spec.limit_count is not None:
        if not isinstance(spec.limit_count, int) or spec.limit_count < 0:
            raise ValueError("limit must be a non-negative integer")
        sql += " LIMIT ?"
        params.append(spec.limit_count)
        if spec.offset_count:
            sql += " OFFSET ?"
            params.append(spec.offset_count)
    elif spec.offset_count:
        sql += " LIMIT -1 OFFSET ?"
        params.append(spec.offset_count)

    return CompiledQuery(sql=sql, params=params, selected=selected)


def _filter_sql(field_path: str, operator: str, expected: Any) -> tuple[str, list[Any]]:
    op = normalize_operator(operator)
    if field_path == "__name__":
        return _name_filter_sql(op, expected)

    if op == "array-contains":
        return _array_contains_sql(field_path, [expected])
    if op == "array-contains-any":
        if not isinstance(expected, (list, tuple)) or not expected:
            raise ValueError("array-contains-any requires a non-empty list")
        return _array_contains_sql(field_path, list(expected))
    if op == "in":
        if not isinstance(expected, (list, tuple)) or not expected:
            raise ValueError("in requires a non-empty list")
        return _in_sql(field_path, list(expected), negate=False)
    if op == "not-in":
        if not isinstance(expected, (list, tuple)) or not expected:
            raise ValueError("not-in requires a non-empty list")
        return _in_sql(field_path, list(expected), negate=True)

    unwrap = _unwrap_sql(field_path)
    present = _present_sql(field_path)
    if op == "==":
        if expected is None:
            return f"{_type_sql(field_path)} = 'null'", []
        return f"{present} AND {unwrap} = ?", [_bind_scalar(expected)]
    if op == "!=":
        if expected is None:
            return f"{_type_sql(field_path)} IS NOT NULL AND {_type_sql(field_path)} != 'null'", []
        return f"(NOT {present} OR {unwrap} != ?)", [_bind_scalar(expected)]
    if op in {"<", "<=", ">", ">="}:
        return f"{present} AND {unwrap} {op} ?", [_bind_scalar(expected)]
    raise ValueError(f"unsupported query operator: {operator}")


def _name_filter_sql(op: str, expected: Any) -> tuple[str, list[Any]]:
    if op == "==":
        return "document_id = ?", [str(expected)]
    if op == "!=":
        return "document_id != ?", [str(expected)]
    if op in {"<", "<=", ">", ">="}:
        return f"document_id {op} ?", [str(expected)]
    if op == "in":
        if not isinstance(expected, (list, tuple)) or not expected:
            raise ValueError("in requires a non-empty list")
        placeholders = ", ".join("?" for _ in expected)
        return f"document_id IN ({placeholders})", [str(item) for item in expected]
    if op == "not-in":
        if not isinstance(expected, (list, tuple)) or not expected:
            raise ValueError("not-in requires a non-empty list")
        placeholders = ", ".join("?" for _ in expected)
        return f"document_id NOT IN ({placeholders})", [str(item) for item in expected]
    raise ValueError(f"unsupported query operator for __name__: {op}")


def _in_sql(field_path: str, expected: list[Any], *, negate: bool) -> tuple[str, list[Any]]:
    unwrap = _unwrap_sql(field_path)
    present = _present_sql(field_path)
    placeholders = ", ".join("?" for _ in expected)
    params = [_bind_scalar(item) for item in expected]
    if negate:
        return f"(NOT {present} OR {unwrap} NOT IN ({placeholders}))", params
    return f"{present} AND {unwrap} IN ({placeholders})", params


def _array_contains_sql(field_path: str, values: list[Any]) -> tuple[str, list[Any]]:
    encoded = []
    for item in values:
        value = encode_array_value(item)
        if value is None:
            raise ValueError("array membership queries only support scalar values")
        encoded.append(value)
    path = _json_path(field_path)
    if "." in field_path:
        placeholders = ", ".join("?" for _ in values)
        type_sql = _type_sql(field_path)
        clause = (
            f"{type_sql} = 'array' AND EXISTS (SELECT 1 FROM json_each(documents.data_json, "
            f"'{path}') WHERE json_each.value IN ({placeholders}))"
        )
        return clause, [_bind_scalar(item) for item in values]
    placeholders = ", ".join("?" for _ in encoded)
    clause = (
        "EXISTS (SELECT 1 FROM document_array_values AS array_values "
        "WHERE array_values.path = documents.path AND array_values.field = ? "
        f"AND array_values.value IN ({placeholders}))"
    )
    return clause, [field_path, *encoded]


def _order_sql(orders: list[tuple[str, str]]) -> str:
    if not orders:
        return ""
    parts: list[str] = []
    for field_path, direction in orders:
        if not isinstance(field_path, str):
            raise ValueError("order field must be a string")
        reverse = str(direction).upper() in {"DESC", "DESCENDING"}
        suffix = "DESC" if reverse else "ASC"
        if field_path == "__name__":
            parts.append(f"document_id {suffix}")
            continue
        present = _present_sql(field_path)
        unwrap = _unwrap_sql(field_path)
        parts.append(f"{present} {suffix}")
        parts.append(f"CAST({unwrap} AS TEXT) {suffix}")
    return ", ".join(parts)


def decode_query_row(row: Any, selected: list[str] | None) -> dict[str, Any]:
    path = row["path"]
    document_id = path.rsplit("/", 1)[-1]
    if selected is None:
        data = denormalise_value(json.loads(row["data_json"]))
    else:
        data = _decode_selected(row, selected)
    return {
        "path": path,
        "id": document_id,
        "data": data,
        "hash": row["document_hash"],
        "updated_at": row["updated_at"],
    }


def _decode_selected(row: Any, selected: list[str]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for index, field_path in enumerate(selected):
        json_type = row[f"t{index}"]
        if json_type is None:
            continue
        value = _decode_extracted(json_type, row[f"s{index}"])
        _assign_field(data, field_path, value)
    return data


def _decode_extracted(json_type: str, value: Any) -> Any:
    if json_type == "null":
        return None
    if json_type == "true":
        return True
    if json_type == "false":
        return False
    if json_type in {"object", "array"}:
        if isinstance(value, (bytes, bytearray)):
            value = value.decode("utf-8")
        if isinstance(value, str):
            return denormalise_value(json.loads(value))
        return denormalise_value(value)
    if json_type == "integer":
        return int(value)
    if json_type == "real":
        return float(value)
    if isinstance(value, dict):
        return denormalise_value(value)
    return value


def _assign_field(data: dict[str, Any], field_path: str, value: Any) -> None:
    target = data
    parts = field_path.split(".")
    for part in parts[:-1]:
        child = target.get(part)
        if not isinstance(child, dict):
            child = {}
            target[part] = child
        target = child
    target[parts[-1]] = value
