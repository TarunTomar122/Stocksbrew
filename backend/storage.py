"""Firestore helpers for Trace Money."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.env import load_backend_env, resolve_backend_path
from backend.localdb.firestore import LocalFirestoreClient
from backend.price_history import latest_price_history

load_backend_env()


def _day_key(captured_at: Any) -> str:
    """Extract the trading-day key (YYYY-MM-DD) from a captured_at value.
    Returns '' if the value can't be parsed."""
    if not captured_at:
        return ""
    s = str(captured_at)
    # ISO-8601 always has 'YYYY-MM-DD' as its first 10 chars.
    return s[:10] if len(s) >= 10 else ""


def _serialize(obj: Any) -> Any:
    if obj is None:
        return obj
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    return obj


_STOCK_FACTS_KEEP_ON_EMPTY = {
    "financials",
    "financial_history",
    "balance",
    "valuation",
    "quality",
    "dividends",
    "business_segments",
    "geographic_mix",
    "analyst_trend",
    "institutions",
}
_STOCK_FACTS_METADATA_KEYS = {
    "source",
    "provider",
    "captured_at",
    "updated_at",
    "period",
    "fiscal_year",
    "label",
}


def _has_material_stock_fact(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, dict):
        return any(
            key not in _STOCK_FACTS_METADATA_KEYS and _has_material_stock_fact(item)
            for key, item in value.items()
        )
    if isinstance(value, (list, tuple, set)):
        return any(_has_material_stock_fact(item) for item in value)
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _stock_facts_write_payload(payload: dict[str, Any], *, updated_at: str) -> dict[str, Any]:
    """Keep a partial source outage from blanking previously good research data.

    Firestore writes use merge semantics, so omitting an empty extended section
    preserves the last successful value. Fresh non-empty sections still replace
    their previous value normally.
    """
    serialized = _serialize(payload)
    write_payload = {
        key: value
        for key, value in serialized.items()
        if key not in _STOCK_FACTS_KEEP_ON_EMPTY or _has_material_stock_fact(value)
    }
    if _has_material_stock_fact(serialized.get("financial_history")):
        write_payload["financial_depth_updated_at"] = updated_at
    write_payload["updated_at"] = updated_at
    return write_payload


def _firestore_write_batches(
    writes: list[tuple[Any, dict[str, Any]]],
    *,
    max_operations: int = 400,
    max_payload_bytes: int = 7_500_000,
) -> list[list[tuple[Any, dict[str, Any]]]]:
    """Chunk writes by both Firestore operation count and request bytes.

    Rolling price documents can be tens of KB each. A 450-operation commit may
    therefore exceed Firestore's 10 MiB RPC limit even though it is under the
    500-write count limit. Keep a conservative byte ceiling for protobuf
    overhead and credentials/field-path metadata.
    """
    batches: list[list[tuple[Any, dict[str, Any]]]] = []
    current: list[tuple[Any, dict[str, Any]]] = []
    current_bytes = 0
    for ref, payload in writes:
        encoded_bytes = len(
            json.dumps(payload, ensure_ascii=True, separators=(",", ":"), default=str).encode(
                "utf-8"
            )
        )
        estimated_bytes = encoded_bytes + len(str(getattr(ref, "path", ""))) + 512
        if estimated_bytes > max_payload_bytes:
            raise ValueError(
                f"Firestore document payload is too large for a safe batch: {estimated_bytes} bytes"
            )
        if current and (
            len(current) >= max_operations
            or current_bytes + estimated_bytes > max_payload_bytes
        ):
            batches.append(current)
            current = []
            current_bytes = 0
        current.append((ref, payload))
        current_bytes += estimated_bytes
    if current:
        batches.append(current)
    return batches


FINAL_HISTORY_PHASES = {"close_check", "post_close", "manual", "historical"}


def _latest_price_write_payload(
    existing_data: dict[str, Any],
    new_point: dict[str, Any],
    *,
    updated_at: str,
    history_limit: int,
) -> dict[str, Any]:
    """Build a merge payload without rewriting rolling history every hour.

    The first quote on a new trading day appends one history point. Later
    intraday writes update only the top-level latest quote; the final close
    replaces that day's history point with the settled value. Because callers
    use Firestore ``merge=True``, omitting ``history_window`` preserves the
    existing array and turns the common intraday write into a small document.
    """
    window = list(existing_data.get("history_window") or [])
    new_day = _day_key(new_point.get("captured_at"))
    same_day = bool(
        window
        and new_day
        and _day_key(window[-1].get("captured_at")) == new_day
    )
    session_phase = str(new_point.get("session_phase") or "").strip()
    write_history = not same_day or session_phase in FINAL_HISTORY_PHASES

    latest_payload = {
        **new_point,
        "updated_at": updated_at,
    }
    if write_history:
        if same_day:
            window[-1] = new_point
        else:
            window.append(new_point)
        if len(window) > history_limit:
            window = window[-history_limit:]
        latest_payload["history_window"] = window
        latest_payload["history_window_size"] = len(window)

    for key in ("fundamentals", "analyst_consensus"):
        if latest_payload.get(key) in (None, {}) and key in existing_data:
            latest_payload[key] = existing_data[key]
    return latest_payload


def _compact_heat_list(payload: dict[str, Any]) -> dict[str, Any]:
    rows_raw = payload.get("rows") or []
    rows = [row for row in rows_raw if isinstance(row, dict)]
    rows.sort(key=lambda row: float(row.get("heat_score") or 0), reverse=True)
    setup_counts: dict[str, int] = {}
    selected: dict[str, dict[str, Any]] = {}

    for row in rows:
        setup = str(row.get("setup_type") or "momentum_watch")
        setup_counts[setup] = setup_counts.get(setup, 0) + 1

    for row in rows[:6]:
        instrument_id = str(row.get("instrument_id") or "")
        if instrument_id:
            selected[instrument_id] = row

    for setup in setup_counts:
        kept = 0
        for row in rows:
            if str(row.get("setup_type") or "momentum_watch") != setup:
                continue
            instrument_id = str(row.get("instrument_id") or "")
            if instrument_id:
                selected[instrument_id] = row
            kept += 1
            if kept >= 10:
                break

    return {
        **{k: v for k, v in payload.items() if k != "rows"},
        "row_count": int(payload.get("row_count") or len(rows)),
        "setup_counts": setup_counts,
        "rows": [row for row in rows if str(row.get("instrument_id") or "") in selected],
    }


HOME_MACRO_IDS = {
    "US_IDX_SPX",
    "US_IDX_NDX",
    "US_MAC_GOLD",
    "US_MAC_SILVER",
    "US_MAC_OIL",
    "US_MAC_VIX",
    "IN_IDX_NIFTY50",
    "IN_IDX_BANKNIFTY",
    "IN_MAC_GOLD",
    "IN_MAC_SILVER",
    "IN_MAC_OIL",
    "IN_IDX_VIX",
}

HOME_SECTOR_SYMBOLS = {
    # Keep in sync with components/sector-spotlights.tsx.
    "AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NFLX", "ADBE", "CRM",
    "ORCL", "NOW", "SHOP", "CRWD", "SNOW", "DDOG", "NET", "ZS", "TEAM", "MDB",
    "OKTA", "PANW", "FTNT", "INTU", "WDAY", "IBM", "SAP", "UBER", "ABNB",
    "DOCU", "ROKU", "SPOT", "PINS", "SNAP", "SQ", "PYPL", "TSLA",
    "NVDA", "AMD", "INTC", "TSM", "AVGO", "MU", "QCOM", "ASML", "LRCX", "AMAT",
    "ADI", "MRVL", "ON", "KLAC", "MCHP", "TXN", "NXPI", "MPWR", "STM", "SWKS",
    "QRVO", "ARM", "AMKR", "SMCI",
    "CAT", "DE", "HON", "UNP", "UPS", "FDX", "GE", "EMR", "MMM", "ROK",
    "ETN", "PH", "PCAR", "URI", "NSC", "CSX", "ITW", "JCI", "PWR", "FAST",
    "GWW", "CMI", "WM", "RSG",
    "LMT", "RTX", "NOC", "GD", "LHX", "HII", "TDG", "AXON", "BA", "HEI",
    "KTOS", "LDOS", "PLTR",
}


def _compact_home_snapshot_rows(rows_raw: Any, mover_limit: int = 12) -> list[dict[str, Any]]:
    rows = [row for row in (rows_raw or []) if isinstance(row, dict)]
    selected: dict[str, dict[str, Any]] = {}

    def key_for(row: dict[str, Any]) -> str:
        return str(row.get("instrumentId") or row.get("instrument_id") or row.get("symbol") or "")

    for row in rows:
        instrument_id = str(row.get("instrumentId") or row.get("instrument_id") or "")
        symbol = str(row.get("symbol") or "").upper()
        if instrument_id in HOME_MACRO_IDS or symbol in HOME_SECTOR_SYMBOLS:
            key = key_for(row)
            if key:
                selected[key] = row

    def change_pct(row: dict[str, Any]) -> float:
        price = row.get("price") if isinstance(row.get("price"), dict) else {}
        value = price.get("changePct")
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    stock_rows = [
        row
        for row in rows
        if "_MAC_" not in str(row.get("instrumentId") or row.get("instrument_id") or "")
        and "_IDX_" not in str(row.get("instrumentId") or row.get("instrument_id") or "")
    ]
    ordered = sorted(stock_rows, key=change_pct, reverse=True)
    for row in ordered[:mover_limit] + list(reversed(ordered[-mover_limit:])):
        key = key_for(row)
        if key:
            selected[key] = row

    return [row for row in rows if key_for(row) in selected]


def _compact_home_dashboard(dashboard: Any) -> dict[str, Any] | None:
    if not isinstance(dashboard, dict):
        return None
    keep = {
        "market",
        "generated_at",
        "universe_id",
        "macro_cards",
        "market_tiles",
        "market_sentiment",
        "hero_brief",
        "sector_flows",
        "gainers",
        "losers",
    }
    return {key: value for key, value in dashboard.items() if key in keep}


def _home_core_view(payload: dict[str, Any]) -> dict[str, Any]:
    """Homepage core read-model without bulky news/thematic embeds."""
    core = {
        key: value
        for key, value in payload.items()
        if key not in {"news", "thematic_screens"}
    }
    core["dashboard"] = _compact_home_dashboard(payload.get("dashboard"))
    core["market_snapshot_rows"] = _compact_home_snapshot_rows(payload.get("market_snapshot_rows"))
    core["market_snapshot_row_count"] = len(payload.get("market_snapshot_rows") or [])
    return core


def _home_news_view(payload: dict[str, Any], limit: int = 8) -> dict[str, Any]:
    """Latest-news read-model for the homepage right rail."""
    news_raw = payload.get("news") or []
    news = [item for item in news_raw if isinstance(item, dict)]
    return {
        "market": payload.get("market"),
        "universe_id": payload.get("universe_id"),
        "ai_universe_id": payload.get("ai_universe_id"),
        "updated_at": payload.get("updated_at"),
        "news": news[:limit],
        "news_count": len(news),
    }


class TraceMoneyStore:
    """Firestore-shaped persistence for config, market data, and derived views."""

    def __init__(self) -> None:
        localdb_path = os.getenv("LOCALDB_PATH", "").strip()
        if localdb_path:
            self.db = LocalFirestoreClient(localdb_path)
            return

        from firebase_admin import credentials, firestore, initialize_app
        import firebase_admin

        if not firebase_admin._apps:
            service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
            service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()
            if service_account_json:
                cred = credentials.Certificate(json.loads(service_account_json))
                initialize_app(cred)
            elif service_account_path:
                cred = credentials.Certificate(resolve_backend_path(service_account_path))
                initialize_app(cred)
            else:
                raise ValueError("Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH")

        self.db = firestore.client()

    def save_source_registry(self, registry_payload: dict[str, Any]) -> None:
        batch = self.db.batch()
        metadata_ref = self.db.collection("tm_config").document("source_registry")
        batch.set(metadata_ref, {
            "version": registry_payload.get("version"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "source_count": len(registry_payload.get("sources", [])),
        })
        for source in registry_payload.get("sources", []):
            batch.set(self.db.collection("tm_sources").document(source["id"]), source)
        batch.commit()

    def save_preferences_schema(self, schema_payload: dict[str, Any]) -> None:
        self.db.collection("tm_config").document("preferences_schema").set({
            **schema_payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    def save_market_strategy(self, strategy_payload: dict[str, Any]) -> None:
        self.db.collection("tm_config").document("market_strategy").set({
            **strategy_payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    def save_instrument_universe_manifest(self, payload: dict[str, Any]) -> None:
        self.db.collection("tm_config").document("instrument_universe").set({
            **payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    def save_instruments(self, market: str, universe_id: str, instruments: list[dict[str, Any]]) -> None:
        batch = self.db.batch()
        saved_at = datetime.now(timezone.utc).isoformat()
        for instrument in instruments:
            batch.set(self.db.collection("tm_instruments").document(instrument["instrument_id"]), {
                **instrument,
                "saved_at": saved_at,
            }, merge=True)
        batch.commit()
        self.db.collection("tm_config").document("instrument_universe_state").set({
            market: {
                "universe_id": universe_id,
                "instrument_count": len(instruments),
                "saved_at": saved_at,
            }
        }, merge=True)

    def list_instruments(self, market: str, instrument_ids: list[str] | None = None) -> list[dict[str, Any]]:
        if instrument_ids is not None:
            allowed = set(instrument_ids)
            refs = [
                self.db.collection("tm_instruments").document(instrument_id)
                for instrument_id in sorted(allowed)
            ]
            rows = [
                _serialize(doc.to_dict()) or {}
                for doc in self.db.get_all(refs)
                if doc.exists
            ]
            rows = [row for row in rows if row.get("market") == market]
        else:
            docs = (
                self.db.collection("tm_instruments")
                .where("market", "==", market)
                .stream()
            )
            rows = [_serialize(doc.to_dict()) for doc in docs]
            rows = [row for row in rows if row]
        rows.sort(key=lambda row: row.get("instrument_id", ""))
        return rows

    # Max number of daily OHLCV points to keep embedded on tm_latest_prices.
    # ~260 trading days = 1 year. ~200 bytes/point => ~52KB per doc, well under
    # Firestore's 1MB per-document cap.
    PRICE_HISTORY_WINDOW_MAX = 300

    def save_price_snapshot(self, payload: dict[str, Any]) -> None:
        """Update `tm_latest_prices/{id}` with latest quote + a rolling
        `history_window` array of recent OHLCV points.

        The history_window holds at most PRICE_HISTORY_WINDOW_MAX entries
        sorted oldest→newest. The first point of a trading day is appended,
        intermediate intraday writes update only the top-level quote, and a
        close/manual point replaces the current day's history value.

        Replaces the old `tm_price_snapshots/{id}/points/{date}` subcollection
        design, which incurred one Firestore write per point and blew through
        free-tier quotas on backfill. The new shape is O(1) writes per
        ingestion call regardless of how much history is retained.
        """
        instrument_id = payload["instrument_id"]
        latest_ref = self.db.collection("tm_latest_prices").document(instrument_id)
        existing = latest_ref.get()
        existing_data = existing.to_dict() if existing.exists else {}
        new_point = _serialize(payload) or {}
        latest_payload = _latest_price_write_payload(
            existing_data,
            new_point,
            updated_at=datetime.now(timezone.utc).isoformat(),
            history_limit=self.PRICE_HISTORY_WINDOW_MAX,
        )

        latest_ref.set(latest_payload, merge=True)

    def save_price_snapshots_bulk(self, payloads: list[dict[str, Any]]) -> int:
        """Bulk variant of save_price_snapshot.

        Firestore batches cannot compute the rolling history window server-side,
        so this method still reads existing docs first. It saves the resulting
        latest docs in batch commits instead of one write RPC per instrument.
        """
        if not payloads:
            return 0
        latest_collection = self.db.collection("tm_latest_prices")
        refs = [latest_collection.document(payload["instrument_id"]) for payload in payloads]
        existing_by_id: dict[str, dict[str, Any]] = {}
        for start in range(0, len(refs), 500):
            for doc in self.db.get_all(refs[start:start + 500]):
                if doc.exists:
                    existing_by_id[doc.id] = _serialize(doc.to_dict()) or {}

        pending: list[tuple[Any, dict[str, Any]]] = []
        updated_at = datetime.now(timezone.utc).isoformat()
        for payload in payloads:
            instrument_id = payload["instrument_id"]
            existing_data = existing_by_id.get(instrument_id, {})
            new_point = _serialize(payload) or {}
            latest_payload = _latest_price_write_payload(
                existing_data,
                new_point,
                updated_at=updated_at,
                history_limit=self.PRICE_HISTORY_WINDOW_MAX,
            )
            pending.append((latest_collection.document(instrument_id), latest_payload))

        saved = 0
        write_batches = _firestore_write_batches(pending)
        for write_batch in write_batches:
            batch = self.db.batch()
            for ref, payload in write_batch:
                batch.set(ref, payload, merge=True)
                saved += 1
            batch.commit()
        if len(write_batches) > 1:
            print(
                f"[price storage] committed {saved} rolling price docs "
                f"in {len(write_batches)} size-bounded batches"
            )
        return saved

    def save_price_history_bulk(
        self,
        instrument_id: str,
        rows: list[dict[str, Any]],
    ) -> None:
        """One-shot write of a full price-history window for an instrument.

        Used by the backfill script. `rows` must be sorted oldest→newest.
        This replaces the per-day subcollection write pattern so backfilling
        N days is a single Firestore write instead of N."""
        if not rows:
            return
        serialized = [_serialize(row) or {} for row in rows]
        capped = serialized[-self.PRICE_HISTORY_WINDOW_MAX:]
        latest = capped[-1]
        self.db.collection("tm_latest_prices").document(instrument_id).set({
            **latest,
            "history_window": capped,
            "history_window_size": len(capped),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def save_market_price_snapshot(self, market: str, rows: list[dict[str, Any]], shard_size: int = 64) -> None:
        market_key = str(market).upper()
        snapshot_ref = self.db.collection("market_price_snapshots").document(market_key)
        shards_ref = snapshot_ref.collection("shards")
        updated_at = datetime.now(timezone.utc).isoformat()

        normalized_rows = [_serialize(row) or {} for row in rows]
        shard_docs: list[tuple[str, list[dict[str, Any]]]] = []
        for start in range(0, len(normalized_rows), max(1, shard_size)):
            index = start // max(1, shard_size)
            shard_id = f"{index:02d}"
            shard_docs.append((shard_id, normalized_rows[start:start + max(1, shard_size)]))

        existing_ids = [doc.id for doc in shards_ref.stream()]
        stale_ids = [doc_id for doc_id in existing_ids if doc_id not in {shard_id for shard_id, _rows in shard_docs}]

        snapshot_ref.set({
            "market": market_key,
            "schemaVersion": 1,
            "snapshotType": "latest_prices",
            "rowCount": len(normalized_rows),
            "shardCount": len(shard_docs),
            "updatedAt": updated_at,
        }, merge=True)

        if stale_ids:
            delete_batch = self.db.batch()
            for shard_id in stale_ids:
                delete_batch.delete(shards_ref.document(shard_id))
            delete_batch.commit()

        if shard_docs:
            batch = self.db.batch()
            for shard_id, shard_rows in shard_docs:
                batch.set(shards_ref.document(shard_id), {
                    "market": market_key,
                    "shardId": shard_id,
                    "rowCount": len(shard_rows),
                    "updatedAt": updated_at,
                    "rows": shard_rows,
                })
            batch.commit()

    def merge_market_price_snapshot(self, market: str, rows: list[dict[str, Any]], shard_size: int = 64) -> None:
        """Merge refreshed rows into the current market snapshot.

        Cohort refreshes only touch a subset of instruments. This preserves
        long-tail rows from earlier runs while replacing the refreshed cohort.
        """
        existing = self.get_market_price_snapshot(market)
        by_id = {
            str(row.get("instrumentId") or row.get("instrument_id") or ""): row
            for row in existing
            if isinstance(row, dict) and (row.get("instrumentId") or row.get("instrument_id"))
        }
        for row in rows:
            instrument_id = str(row.get("instrumentId") or row.get("instrument_id") or "")
            if instrument_id:
                by_id[instrument_id] = row
        merged_rows = list(by_id.values())
        merged_rows.sort(key=lambda row: str(row.get("symbol") or row.get("ticker") or row.get("instrumentId") or ""))
        self.save_market_price_snapshot(market, merged_rows, shard_size=shard_size)

    def get_market_price_snapshot(self, market: str) -> list[dict[str, Any]]:
        market_key = str(market).upper()
        docs = (
            self.db.collection("market_price_snapshots")
            .document(market_key)
            .collection("shards")
            .stream()
        )
        rows: list[dict[str, Any]] = []
        for doc in sorted(docs, key=lambda item: item.id):
            payload = _serialize(doc.to_dict()) or {}
            shard_rows = payload.get("rows") or []
            if isinstance(shard_rows, list):
                rows.extend(item for item in shard_rows if isinstance(item, dict))
        if rows:
            return rows
        # Backward compatibility: legacy snapshots stored all rows on parent doc.
        latest_doc = self.db.collection("market_price_snapshots").document(market_key).get()
        if latest_doc.exists:
            latest_payload = _serialize(latest_doc.to_dict()) or {}
            latest_rows = latest_payload.get("rows")
            if isinstance(latest_rows, list):
                return [row for row in latest_rows if isinstance(row, dict)]
        return rows

    def save_market_movers(self, market: str, payload: dict[str, Any]) -> None:
        market_key = str(market).upper()
        self.db.collection("tm_market_movers").document(market_key).set({
            **(_serialize(payload) or {}),
            "market": market_key,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def get_market_movers(self, market: str) -> dict[str, Any] | None:
        market_key = str(market).upper()
        doc = self.db.collection("tm_market_movers").document(market_key).get()
        if not doc.exists:
            return None
        return _serialize(doc.to_dict()) or None

    def save_fundamental_snapshot(self, instrument_id: str, payload: dict[str, Any]) -> None:
        self.db.collection("tm_fundamental_snapshots").document(instrument_id).set({
            **payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def save_fundamental_snapshots_bulk(self, rows: list[tuple[str, dict[str, Any]]]) -> int:
        if not rows:
            return 0
        collection = self.db.collection("tm_fundamental_snapshots")
        saved = 0
        for start in range(0, len(rows), 450):
            batch = self.db.batch()
            for instrument_id, payload in rows[start:start + 450]:
                batch.set(collection.document(instrument_id), {
                    **payload,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }, merge=True)
                saved += 1
            batch.commit()
        return saved

    def save_stock_facts(self, payload: dict[str, Any]) -> None:
        instrument_id = payload["instrument_id"]
        updated_at = datetime.now(timezone.utc).isoformat()
        self.db.collection("tm_stock_facts").document(instrument_id).set(
            _stock_facts_write_payload(payload, updated_at=updated_at),
            merge=True,
        )

    def get_stock_facts_batch(self, instrument_ids: list[str]) -> dict[str, dict[str, Any]]:
        rows: dict[str, dict[str, Any]] = {}
        collection = self.db.collection("tm_stock_facts")
        for start in range(0, len(instrument_ids), 500):
            refs = [
                collection.document(instrument_id)
                for instrument_id in instrument_ids[start : start + 500]
            ]
            for doc in self.db.get_all(refs):
                if doc.exists:
                    rows[doc.id] = _serialize(doc.to_dict()) or {}
        return rows

    def get_fundamental_snapshots(self, instrument_ids: list[str]) -> dict[str, dict[str, Any]]:
        rows: dict[str, dict[str, Any]] = {}
        for instrument_id in instrument_ids:
            doc = self.db.collection("tm_fundamental_snapshots").document(instrument_id).get()
            if doc.exists:
                rows[instrument_id] = _serialize(doc.to_dict()) or {}
        return rows

    def get_latest_prices(self, instrument_ids: list[str]) -> dict[str, dict[str, Any]]:
        """Batch-fetch latest price docs. Firestore's get_all() accepts up to
        500 refs per call, so we chunk - one round trip per 500 instruments
        instead of N serial round trips."""
        rows: dict[str, dict[str, Any]] = {}
        collection = self.db.collection("tm_latest_prices")
        for start in range(0, len(instrument_ids), 500):
            chunk = instrument_ids[start : start + 500]
            refs = [collection.document(iid) for iid in chunk]
            for doc in self.db.get_all(refs):
                if doc.exists:
                    rows[doc.id] = _serialize(doc.to_dict()) or {}
        return rows

    def get_price_history(self, instrument_id: str, limit: int = 12) -> list[dict[str, Any]]:
        """Return the last `limit` OHLCV points for an instrument, oldest→newest.

        Reads from the `history_window` array embedded on
        `tm_latest_prices/{instrument_id}`. One Firestore read per call,
        regardless of how many days are requested.
        """
        doc = self.db.collection("tm_latest_prices").document(instrument_id).get()
        if not doc.exists:
            return []
        data = doc.to_dict() or {}
        return [
            _serialize(row) or {}
            for row in latest_price_history(data, limit=limit)
        ]

    def save_active_price_universe(self, market: str, universe_id: str) -> None:
        market_key = str(market).upper()
        if market_key == "US":
            self.save_active_universe(market_key, universe_id)
            return
        self.db.collection("tm_config").document("active_universes").set({
            f"{market_key}_price_universe": universe_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def save_active_ai_universe(self, market: str, universe_id: str) -> None:
        market_key = str(market).upper()
        if market_key == "US":
            self.save_active_universe(market_key, universe_id)
            return
        self.db.collection("tm_config").document("active_universes").set({
            f"{market_key}_ai_universe": universe_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def save_active_universe(self, market: str, universe_id: str) -> None:
        market_key = str(market).upper()
        self.db.collection("tm_config").document("active_universes").set({
            f"{market_key}_universe": universe_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def get_active_price_universe(self, market: str) -> str | None:
        market_key = str(market).upper()
        if market_key == "US":
            return self.get_active_universe(market_key)
        doc = self.db.collection("tm_config").document("active_universes").get()
        if not doc.exists:
            return None
        data = _serialize(doc.to_dict()) or {}
        value = data.get(f"{market_key}_price_universe")
        return str(value) if value else None

    def get_active_ai_universe(self, market: str) -> str | None:
        market_key = str(market).upper()
        if market_key == "US":
            return self.get_active_universe(market_key)
        doc = self.db.collection("tm_config").document("active_universes").get()
        if not doc.exists:
            return None
        data = _serialize(doc.to_dict()) or {}
        value = data.get(f"{market_key}_ai_universe")
        return str(value) if value else None

    def get_active_universe(self, market: str) -> str | None:
        market_key = str(market).upper()
        doc = self.db.collection("tm_config").document("active_universes").get()
        if not doc.exists:
            return None
        data = _serialize(doc.to_dict()) or {}
        if market_key == "US":
            value = data.get("US_universe")
        else:
            value = data.get(f"{market_key}_universe")
        return str(value) if value else None

    def save_stage_watermark(
        self,
        *,
        market: str,
        stage_key: str,
        universe_id: str,
        expected_count: int,
        success_count: int,
        error_count: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        payload: dict[str, Any] = {
            "market": str(market).upper(),
            "stage_key": stage_key,
            "universe_id": universe_id,
            "expected_count": int(expected_count),
            "success_count": int(success_count),
            "error_count": int(error_count),
            "coverage_ratio": (float(success_count) / float(expected_count)) if expected_count > 0 else 0.0,
            "updated_at": now_iso,
            "completed_at": now_iso,
        }
        if metadata:
            payload["metadata"] = _serialize(metadata) or {}
        self.db.collection("tm_stage_watermarks").document(f"{str(market).upper()}__{stage_key}").set(payload, merge=True)

    def get_stage_watermark(self, market: str, stage_key: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_stage_watermarks").document(f"{str(market).upper()}__{stage_key}").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_dashboard_view(self, market: str, universe_id: str, payload: dict[str, Any]) -> None:
        doc_id = f"{market}__{universe_id}"
        self.db.collection("tm_views_dashboard").document(doc_id).set(payload)

    def save_home_view(self, market: str, payload: dict[str, Any]) -> None:
        market_key = str(market).upper()
        serialized = _serialize(payload) or {}
        full_payload = {
            **serialized,
            "market": market_key,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.db.collection("tm_home_view").document(market_key).set(full_payload, merge=True)
        self.db.collection("tm_home_view_core").document(market_key).set(_home_core_view(full_payload))
        self.db.collection("tm_home_news").document(market_key).set(_home_news_view(full_payload))

    def replace_search_index(self, market: str, entries: list[dict[str, Any]]) -> None:
        market_key = str(market).upper()
        entries_map: dict[str, dict[str, Any]] = {}
        for raw in entries:
            row = _serialize(raw) or {}
            instrument_id = str(row.get("instrument_id") or "").strip().upper()
            ticker = str(row.get("ticker") or "").strip().upper()
            if not instrument_id or not ticker:
                continue
            entries_map[instrument_id] = row
        self.db.collection("tm_search_index").document(market_key).set(
            {
                "market": market_key,
                "entries": entries_map,
                "size": len(entries_map),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    def save_search_index_entries(self, market: str, entries: list[dict[str, Any]]) -> int:
        market_key = str(market).upper()
        entries_map: dict[str, dict[str, Any]] = {}
        updates: dict[str, Any] = {
            "market": market_key,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        for raw in entries:
            row = _serialize(raw) or {}
            instrument_id = str(row.get("instrument_id") or "").strip().upper()
            ticker = str(row.get("ticker") or "").strip().upper()
            if not instrument_id or not ticker:
                continue
            entries_map[instrument_id] = row
        if not entries_map:
            return 0
        # `DocumentReference.set(..., merge=True)` does not interpret dotted
        # dictionary keys as nested field paths. The old shape created literal
        # top-level fields such as `entries.US_NVDA`, leaving the real
        # `entries.US_NVDA` map value stale. Merge a nested map instead.
        updates["entries"] = entries_map
        self.db.collection("tm_search_index").document(market_key).set(updates, merge=True)
        return len(entries_map)

    def get_news_home_feed(self, market: str, universe_id: str, limit: int = 30) -> list[dict[str, Any]]:
        namespace = self._news_namespace(market, universe_id).get()
        if not namespace.exists:
            return []
        data = _serialize(namespace.to_dict()) or {}
        rows = data.get("home_feed_enrichments") or data.get("home_feed_articles") or []
        if not isinstance(rows, list):
            return []
        return [row for row in rows if isinstance(row, dict)][:limit]

    def save_stock_intel_pro(
        self, market: str, universe_id: str, instrument_id: str, payload: dict[str, Any]
    ) -> None:
        """Write the scored four-pillar doc for a stock."""
        self.db.collection("tm_stock_intel_pro").document(f"{market}__{universe_id}") \
            .collection("stocks").document(instrument_id).set(payload)

    def get_stock_intel_pro(
        self, market: str, universe_id: str, instrument_id: str
    ) -> dict[str, Any] | None:
        doc = self.db.collection("tm_stock_intel_pro").document(f"{market}__{universe_id}") \
            .collection("stocks").document(instrument_id).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_stock_intel_pro_batch(
        self, market: str, universe_id: str, instrument_ids: list[str]
    ) -> dict[str, dict[str, Any]]:
        rows: dict[str, dict[str, Any]] = {}
        collection = self.db.collection("tm_stock_intel_pro").document(f"{market}__{universe_id}") \
            .collection("stocks")
        for start in range(0, len(instrument_ids), 500):
            refs = [
                collection.document(instrument_id)
                for instrument_id in instrument_ids[start : start + 500]
            ]
            for doc in self.db.get_all(refs):
                if doc.exists:
                    rows[doc.id] = _serialize(doc.to_dict()) or {}
        return rows

    def list_stock_intel_pro(self, market: str, universe_id: str) -> list[dict[str, Any]]:
        snap = self.db.collection("tm_stock_intel_pro").document(f"{market}__{universe_id}") \
            .collection("stocks").stream()
        return [_serialize(d.to_dict()) for d in snap]

    def save_thematic_screens(self, market: str, payload: dict[str, Any]) -> None:
        self.db.collection("tm_thematic_screens").document(market).set(payload)

    def get_thematic_screens(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_thematic_screens").document(market).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_stock_metrics_snapshot(
        self, instrument_id: str, snapshot_date: str, payload: dict[str, Any]
    ) -> None:
        """Write one snapshot doc per instrument per day.

        Path: tm_stock_metrics_history/{instrument_id}/snapshots/{YYYY-MM-DD}.
        Callers are expected to include `captured_at`, sector/industry slugs,
        and a `metrics` sub-dict of numeric fields so that delta catalysts can
        be derived downstream.
        """
        self.db.collection("tm_stock_metrics_history").document(instrument_id) \
            .collection("snapshots").document(snapshot_date).set(payload)
        self.db.collection("tm_stock_metrics_latest").document(instrument_id).set(payload)

    def get_stock_metrics_snapshots_batch(
        self, instrument_ids: list[str], snapshot_date: str | None = None
    ) -> dict[str, dict[str, Any]]:
        rows: dict[str, dict[str, Any]] = {}
        if snapshot_date:
            refs = [
                self.db.collection("tm_stock_metrics_history").document(instrument_id)
                .collection("snapshots").document(snapshot_date)
                for instrument_id in instrument_ids
            ]
        else:
            refs = [
                self.db.collection("tm_stock_metrics_latest").document(instrument_id)
                for instrument_id in instrument_ids
            ]
        for start in range(0, len(refs), 500):
            for doc in self.db.get_all(refs[start:start + 500]):
                if doc.exists:
                    data = _serialize(doc.to_dict()) or {}
                    instrument_id = str(data.get("instrument_id") or doc.id)
                    rows[instrument_id] = data
        return rows

    def get_stock_metrics_snapshot(
        self, instrument_id: str, snapshot_date: str
    ) -> dict[str, Any] | None:
        doc = self.db.collection("tm_stock_metrics_history").document(instrument_id) \
            .collection("snapshots").document(snapshot_date).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_latest_stock_metrics_snapshot(
        self, instrument_id: str
    ) -> dict[str, Any] | None:
        query = (
            self.db.collection("tm_stock_metrics_history").document(instrument_id)
            .collection("snapshots")
            .order_by("snapshot_date", direction="DESCENDING")
            .limit(1)
            .stream()
        )
        for doc in query:
            return _serialize(doc.to_dict())
        return None

    def save_sector_benchmarks(
        self, market: str, snapshot_date: str, benchmarks: dict[str, dict[str, float]]
    ) -> None:
        """Write one doc per market+date capturing per-sector valuation medians."""
        doc_id = f"{market}__{snapshot_date}"
        payload = {
            "market": market,
            "snapshot_date": snapshot_date,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "benchmarks": benchmarks,
        }
        self.db.collection("tm_sector_benchmarks").document(doc_id).set(payload)
        self.db.collection("tm_sector_benchmarks").document(f"latest__{market}").set(payload)

    def save_contrarian_calls(self, market: str, payload: dict[str, Any]) -> None:
        """Write the latest crowd-vs-us contrarian calls for a market."""
        self.db.collection("tm_contrarian_calls").document(f"{market.upper()}__latest").set(payload)

    def get_contrarian_calls(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_contrarian_calls").document(f"{market.upper()}__latest").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_premarket_movers(self, market: str, payload: dict[str, Any]) -> None:
        """Write the latest pre-market movers snapshot for a market."""
        self.db.collection("tm_premarket_movers").document(f"{market.upper()}__latest").set(payload)

    def get_premarket_movers(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_premarket_movers").document(f"{market.upper()}__latest").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_weekly_movers(self, market: str, payload: dict[str, Any]) -> None:
        """Write the latest weekly movers snapshot for a market."""
        self.db.collection("tm_weekly_movers").document(f"{market.upper()}__latest").set(payload)

    def get_weekly_movers(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_weekly_movers").document(f"{market.upper()}__latest").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_premarket_context(self, market: str, payload: dict[str, Any]) -> None:
        self.db.collection("tm_premarket_context").document(f"{market.upper()}__latest").set(payload)

    def get_premarket_context(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_premarket_context").document(f"{market.upper()}__latest").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_premarket_opening_report(self, market: str, payload: dict[str, Any]) -> None:
        """Write the public opening-sentiment read model for the frontend."""
        self.db.collection("tm_premarket_opening").document(f"{market.upper()}__latest").set(payload)

    def get_premarket_opening_report(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_premarket_opening").document(f"{market.upper()}__latest").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_market_daily(self, payload: dict[str, Any]) -> None:
        """Publish one immutable-date Market Daily edition plus the latest pointer."""
        market = str(payload.get("market") or "US").strip().upper()
        edition_date = str(payload.get("edition_date") or "").strip()
        if not edition_date:
            raise ValueError("Market Daily edition_date is required")
        doc_id = f"{market}__{edition_date}"
        batch = self.db.batch()
        collection = self.db.collection("tm_market_daily")
        batch.set(collection.document(doc_id), payload)
        batch.set(collection.document(f"{market}__latest"), payload)
        batch.commit()

    def get_market_daily(self, market: str, edition_date: str = "latest") -> dict[str, Any] | None:
        suffix = "latest" if edition_date == "latest" else str(edition_date).strip()
        doc = self.db.collection("tm_market_daily").document(f"{market.upper()}__{suffix}").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_market_daily_draft(self, payload: dict[str, Any]) -> None:
        """Save an approval candidate without changing the public edition."""
        market = str(payload.get("market") or "US").strip().upper()
        edition_date = str(payload.get("edition_date") or "").strip()
        if not edition_date:
            raise ValueError("Market Daily draft edition_date is required")
        self.db.collection("tm_market_daily_drafts").document(
            f"{market}__{edition_date}"
        ).set(payload)

    def get_market_daily_draft(self, market: str, edition_date: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_market_daily_drafts").document(
            f"{market.upper()}__{str(edition_date).strip()}"
        ).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_sector_regimes(self, market: str) -> dict[str, dict[str, Any]]:
        """Return all live sector regime docs for a market, keyed by sector_slug.
        Includes the macro doc under key 'macro'."""
        prefix = f"{market.upper()}__"
        docs = self.db.collection("tm_sector_regimes").stream()
        result: dict[str, dict[str, Any]] = {}
        for doc in docs:
            doc_id = doc.id
            if not doc_id.startswith(prefix):
                continue
            if "__bt_" in doc_id:
                continue  # skip backtest docs
            slug = doc_id[len(prefix):]
            data = _serialize(doc.to_dict()) or {}
            if data:
                result[slug] = data
        return result

    def get_sector_benchmarks(
        self, market: str, snapshot_date: str | None = None
    ) -> dict[str, Any] | None:
        """Return the benchmarks doc for a date, or walk back up to 14 days."""
        collection = self.db.collection("tm_sector_benchmarks")
        if snapshot_date:
            doc = collection.document(f"{market}__{snapshot_date}").get()
            return _serialize(doc.to_dict()) if doc.exists else None
        latest = collection.document(f"latest__{market}").get()
        if latest.exists:
            return _serialize(latest.to_dict())
        from datetime import datetime, timedelta, timezone
        today = datetime.now(timezone.utc).date()
        for offset in range(0, 14):
            probe = (today - timedelta(days=offset)).strftime("%Y-%m-%d")
            doc = collection.document(f"{market}__{probe}").get()
            if doc.exists:
                return _serialize(doc.to_dict())
        return None

    def save_instrument_view(self, instrument_id: str, universe_id: str, payload: dict[str, Any]) -> None:
        doc_id = f"{instrument_id}__{universe_id}"
        self.db.collection("tm_views_instrument").document(doc_id).set(payload)

    def save_instrument_views_bulk(self, universe_id: str, payloads: list[dict[str, Any]]) -> int:
        if not payloads:
            return 0
        collection = self.db.collection("tm_views_instrument")
        saved = 0
        for start in range(0, len(payloads), 450):
            batch = self.db.batch()
            for payload in payloads[start:start + 450]:
                instrument_id = str(payload.get("instrument_id") or "").strip()
                if not instrument_id:
                    continue
                batch.set(collection.document(f"{instrument_id}__{universe_id}"), payload)
                saved += 1
            batch.commit()
        return saved

    def get_dashboard_view(self, market: str, universe_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_views_dashboard").document(f"{market}__{universe_id}").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_instrument_view(self, instrument_id: str, universe_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_views_instrument").document(f"{instrument_id}__{universe_id}").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def _news_namespace(self, market: str, universe_id: str):
        return self.db.collection("tm_news_runs").document(f"{market}__{universe_id}")

    def _news_freshness_collection(self):
        return self.db.collection("tm_news_freshness")

    def _replace_subcollection(self, parent_ref, name: str, docs_payload: list[dict[str, Any]], id_field: str) -> None:
        def commit_batch(ops: list[tuple[str, Any, dict[str, Any] | None]]) -> None:
            if not ops:
                return
            batch = self.db.batch()
            for op, ref, payload in ops:
                if op == "delete":
                    batch.delete(ref)
                else:
                    batch.set(ref, payload or {})
            batch.commit()

        pending: list[tuple[str, Any, dict[str, Any] | None]] = []
        for doc in parent_ref.collection(name).stream():
            pending.append(("delete", doc.reference, None))
            if len(pending) >= 450:
                commit_batch(pending)
                pending = []
        commit_batch(pending)

        if not docs_payload:
            return
        pending = []
        for payload in docs_payload:
            ref = parent_ref.collection(name).document(str(payload[id_field]))
            pending.append(("set", ref, payload))
            if len(pending) >= 450:
                commit_batch(pending)
                pending = []
        commit_batch(pending)

    def save_news_articles(self, market: str, universe_id: str, articles: list[dict[str, Any]], source_health: list[dict[str, Any]] | None = None) -> None:
        namespace = self._news_namespace(market, universe_id)
        namespace.set({
            "market": market,
            "universe_id": universe_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "article_count": len(articles),
            "source_health": source_health or [],
            "home_feed_articles": sorted(
                [_serialize(article) or {} for article in articles],
                key=lambda row: row.get("published_at", ""),
                reverse=True,
            )[:30],
        }, merge=True)
        self._replace_subcollection(namespace, "articles", articles, "id")

    def upsert_news_articles(self, market: str, universe_id: str, articles: list[dict[str, Any]], source_health: list[dict[str, Any]] | None = None) -> None:
        namespace = self._news_namespace(market, universe_id)
        namespace.set({
            "market": market,
            "universe_id": universe_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "last_on_demand_article_count": len(articles),
            "last_on_demand_source_health": source_health or [],
        }, merge=True)
        for article in articles:
            article_id = str(article.get("id") or "")
            if article_id:
                # Firestore field limit is 1 MiB (1,048,576 bytes).  Truncate
                # body_text to 900 KB so we stay safely under the ceiling.
                if "body_text" in article:
                    bt = article["body_text"]
                    max_bytes = 900_000
                    if len(bt.encode("utf-8")) > max_bytes:
                        article["body_text"] = bt.encode("utf-8")[:max_bytes].decode("utf-8", errors="ignore")
                        article["body_text_truncated"] = True
                namespace.collection("articles").document(article_id).set(article, merge=True)

    def list_news_articles(self, market: str, universe_id: str) -> list[dict[str, Any]]:
        docs = self._news_namespace(market, universe_id).collection("articles").stream()
        rows = [_serialize(doc.to_dict()) or {} for doc in docs]
        rows.sort(key=lambda row: row.get("published_at", ""), reverse=True)
        return rows

    def save_article_enrichments(self, market: str, universe_id: str, articles: list[dict[str, Any]]) -> None:
        namespace = self._news_namespace(market, universe_id)
        self._replace_subcollection(namespace, "enrichments", articles, "id")
        namespace.set({
            "market": market,
            "universe_id": universe_id,
            "last_enriched_at": datetime.now(timezone.utc).isoformat(),
            "enrichment_count": len(articles),
            "home_feed_enrichments": sorted(
                [_serialize(article) or {} for article in articles],
                key=lambda row: row.get("published_at", ""),
                reverse=True,
            )[:30],
        }, merge=True)

    def upsert_article_enrichments(self, market: str, universe_id: str, articles: list[dict[str, Any]]) -> None:
        namespace = self._news_namespace(market, universe_id)
        for article in articles:
            article_id = str(article.get("id") or "")
            if article_id:
                namespace.collection("enrichments").document(article_id).set(article, merge=True)
        namespace.set({
            "market": market,
            "universe_id": universe_id,
            "last_on_demand_enriched_at": datetime.now(timezone.utc).isoformat(),
            "last_on_demand_enrichment_count": len(articles),
        }, merge=True)

    def list_article_enrichments(self, market: str, universe_id: str, limit: int | None = None) -> list[dict[str, Any]]:
        query = self._news_namespace(market, universe_id).collection("enrichments")
        if limit and limit > 0:
            docs = query.order_by("published_at", direction="DESCENDING").limit(limit).stream()
        else:
            docs = query.stream()
        rows = [_serialize(doc.to_dict()) or {} for doc in docs]
        rows.sort(key=lambda row: row.get("published_at", ""), reverse=True)
        return rows

    def list_article_enrichments_for_tickers(
        self,
        market: str,
        universe_id: str,
        tickers: list[str],
    ) -> list[dict[str, Any]]:
        """Read evidence for the requested stocks, not a global latest-N slice."""
        normalized = sorted(
            {
                str(ticker or "").strip().upper()
                for ticker in tickers
                if str(ticker or "").strip()
            }
        )
        if not normalized:
            return []
        collection = self._news_namespace(market, universe_id).collection("enrichments")
        rows_by_id: dict[str, dict[str, Any]] = {}
        for offset in range(0, len(normalized), 30):
            batch = normalized[offset:offset + 30]
            queries = (
                collection.where("focus_ticker", "in", batch),
                collection.where("stock_tickers", "array_contains_any", batch),
            )
            for query in queries:
                for doc in query.stream():
                    payload = _serialize(doc.to_dict()) or {}
                    row_id = str(payload.get("id") or doc.id)
                    rows_by_id[row_id] = payload
        rows = list(rows_by_id.values())
        rows.sort(key=lambda row: row.get("published_at", ""), reverse=True)
        return rows

    def get_news_freshness_docs(
        self,
        market: str,
        instrument_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        rows: dict[str, dict[str, Any]] = {}
        if not instrument_ids:
            return rows
        refs = [
            self._news_freshness_collection().document(f"{market.upper()}__{instrument_id.strip().upper()}")
            for instrument_id in instrument_ids
            if str(instrument_id or "").strip()
        ]
        for doc in self.db.get_all(refs):
            if not doc.exists:
                continue
            payload = _serialize(doc.to_dict()) or {}
            instrument_id = str(payload.get("instrument_id") or "").strip().upper()
            if instrument_id:
                rows[instrument_id] = payload
        return rows

    def save_news_freshness_docs(self, payloads: list[dict[str, Any]]) -> None:
        if not payloads:
            return
        collection = self._news_freshness_collection()
        for start in range(0, len(payloads), 450):
            batch = self.db.batch()
            for payload in payloads[start:start + 450]:
                market = str(payload.get("market") or "").strip().upper()
                instrument_id = str(payload.get("instrument_id") or "").strip().upper()
                if not market or not instrument_id:
                    continue
                batch.set(collection.document(f"{market}__{instrument_id}"), payload, merge=True)
            batch.commit()

    def append_directive_history(self, market: str, docs_payload: list[dict[str, Any]]) -> None:
        """Append each directive_v2 + the price it was issued at to an append-only
        history, so we can later score "stocksbrew said ACCUMULATE @ $X, now +Y%".
        Keyed by trading date so a same-day re-run is idempotent (one call/day/stock)."""
        market_up = str(market or "").strip().upper()
        for payload in docs_payload:
            directive = payload.get("directive_v2")
            instrument_id = str(payload.get("instrument_id") or "").strip().upper()
            price_at_call = payload.get("current_price")
            if not (isinstance(directive, dict) and instrument_id and isinstance(price_at_call, (int, float))):
                continue
            stance = str(directive.get("stance") or "").strip().lower()
            if not stance:
                continue
            action = directive.get("action") if isinstance(directive.get("action"), dict) else {}
            zones = directive.get("zones") if isinstance(directive.get("zones"), dict) else {}
            trigger_type = "none"
            trigger_value: Any = None
            if stance in {"trim", "avoid"} and isinstance(zones.get("trim_above"), (int, float)):
                trigger_type, trigger_value = "price_above", zones["trim_above"]
            elif isinstance(zones.get("accumulate_below"), (int, float)):
                trigger_type, trigger_value = "price_below", zones["accumulate_below"]
            elif isinstance(zones.get("breakout_above"), (int, float)):
                trigger_type, trigger_value = "price_above", zones["breakout_above"]
            elif isinstance(zones.get("trim_above"), (int, float)):
                trigger_type, trigger_value = "price_above", zones["trim_above"]
            generated_at = str(payload.get("generated_at") or datetime.now(timezone.utc).isoformat())
            date_key = generated_at[:10]  # YYYY-MM-DD
            self.db.collection("tm_directive_history").document(instrument_id).collection("calls").document(date_key).set({
                "instrument_id": instrument_id,
                "market": market_up,
                "stance": stance,
                "text": str(action.get("label") or "").strip(),
                "rationale": str(action.get("summary") or directive.get("watch_out") or "").strip(),
                "confidence": str(directive.get("confidence") or "").strip(),
                "trigger_type": trigger_type,
                "trigger_value": trigger_value,
                "directive_version": str(directive.get("version") or "v2"),
                "price_at_call": float(price_at_call),
                "generated_at": generated_at,
            }, merge=True)

    def save_stock_intelligence_docs(self, market: str, universe_id: str, docs_payload: list[dict[str, Any]]) -> None:
        namespace = self._news_namespace(market, universe_id)
        self._replace_subcollection(namespace, "stock_intelligence", docs_payload, "instrument_id")
        self.append_directive_history(market, docs_payload)
        namespace.set({
            "market": market,
            "universe_id": universe_id,
            "last_stock_intelligence_at": datetime.now(timezone.utc).isoformat(),
            "stock_intelligence_count": len(docs_payload),
        }, merge=True)

    def upsert_stock_intelligence_docs(self, market: str, universe_id: str, docs_payload: list[dict[str, Any]]) -> None:
        namespace = self._news_namespace(market, universe_id)
        for payload in docs_payload:
            instrument_id = str(payload.get("instrument_id") or "")
            if instrument_id:
                namespace.collection("stock_intelligence").document(instrument_id).set(payload, merge=True)
        self.append_directive_history(market, docs_payload)
        namespace.set({
            "market": market,
            "universe_id": universe_id,
            "last_on_demand_stock_intelligence_at": datetime.now(timezone.utc).isoformat(),
            "last_on_demand_stock_intelligence_count": len(docs_payload),
        }, merge=True)

    def list_stock_intelligence_docs(self, market: str, universe_id: str) -> list[dict[str, Any]]:
        docs = self._news_namespace(market, universe_id).collection("stock_intelligence").stream()
        rows = [_serialize(doc.to_dict()) or {} for doc in docs]
        rows.sort(key=lambda row: row.get("instrument_id", ""))
        return rows

    def get_stock_intelligence_doc(self, market: str, universe_id: str, instrument_id: str) -> dict[str, Any] | None:
        doc = self._news_namespace(market, universe_id).collection("stock_intelligence").document(instrument_id).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_stock_intelligence_docs_batch(
        self, market: str, universe_id: str, instrument_ids: list[str]
    ) -> dict[str, dict[str, Any]]:
        collection = self._news_namespace(market, universe_id).collection("stock_intelligence")
        rows: dict[str, dict[str, Any]] = {}
        for start in range(0, len(instrument_ids), 500):
            refs = [
                collection.document(instrument_id)
                for instrument_id in instrument_ids[start : start + 500]
            ]
            for doc in self.db.get_all(refs):
                if doc.exists:
                    rows[doc.id] = _serialize(doc.to_dict()) or {}
        return rows

    def get_daily_anomaly_ticker_docs_batch(self, market: str, tickers: list[str]) -> dict[str, dict[str, Any]]:
        collection = self.db.collection("tm_daily_anomaly_tickers")
        market_key = str(market or "").strip().upper()
        ids = [f"{market_key}__{str(ticker or '').strip().upper()}" for ticker in tickers if str(ticker or "").strip()]
        rows: dict[str, dict[str, Any]] = {}
        for start in range(0, len(ids), 500):
            refs = [collection.document(doc_id) for doc_id in ids[start:start + 500]]
            for doc in self.db.get_all(refs):
                if doc.exists:
                    rows[doc.id] = _serialize(doc.to_dict()) or {}
        return rows

    def get_options_context_docs_batch(self, market: str, tickers: list[str]) -> dict[str, dict[str, Any]]:
        collection = self.db.collection("tm_options_context_latest")
        market_key = str(market or "").strip().upper()
        ids = [f"{market_key}__{str(ticker or '').strip().upper()}" for ticker in tickers if str(ticker or "").strip()]
        rows: dict[str, dict[str, Any]] = {}
        for start in range(0, len(ids), 500):
            refs = [collection.document(doc_id) for doc_id in ids[start:start + 500]]
            for doc in self.db.get_all(refs):
                if doc.exists:
                    rows[doc.id] = _serialize(doc.to_dict()) or {}
        return rows

    def upsert_options_context_docs(self, market: str, docs_payload: list[dict[str, Any]]) -> None:
        if not docs_payload:
            return
        market_key = str(market or "").strip().upper()
        batch = self.db.batch()
        count = 0
        for payload in docs_payload:
            ticker = str(payload.get("ticker") or "").strip().upper()
            if not ticker:
                continue
            doc_id = f"{market_key}__{ticker}"
            batch.set(
                self.db.collection("tm_options_context_latest").document(doc_id),
                {
                    **payload,
                    "doc_id": doc_id,
                    "market": market_key,
                    "ticker": ticker,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                merge=True,
            )
            count += 1
            if count % 400 == 0:
                batch.commit()
                batch = self.db.batch()
        if count % 400 != 0:
            batch.commit()

    def save_market_context_doc(self, market: str, universe_id: str, payload: dict[str, Any]) -> None:
        self._news_namespace(market, universe_id).collection("market_context").document("overview").set(payload)

    def get_market_context_doc(self, market: str, universe_id: str) -> dict[str, Any] | None:
        doc = self._news_namespace(market, universe_id).collection("market_context").document("overview").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_sector_context_docs(self, market: str, universe_id: str, docs_payload: list[dict[str, Any]]) -> None:
        namespace = self._news_namespace(market, universe_id)
        self._replace_subcollection(namespace, "sector_context", docs_payload, "sector_id")
        namespace.set({
            "last_sector_context_at": datetime.now(timezone.utc).isoformat(),
            "sector_context_count": len(docs_payload),
        }, merge=True)

    def list_sector_context_docs(self, market: str, universe_id: str) -> list[dict[str, Any]]:
        docs = self._news_namespace(market, universe_id).collection("sector_context").stream()
        rows = [_serialize(doc.to_dict()) or {} for doc in docs]
        rows.sort(key=lambda row: row.get("sector_id", ""))
        return rows

    def save_market_run_summary(self, market: str, universe_id: str, summary: dict[str, Any]) -> None:
        date_str = summary.get("date", datetime.now(timezone.utc).date().isoformat())
        self._news_namespace(market, universe_id).collection("market_run_summaries").document(date_str).set(summary, merge=True)

    def list_market_run_summaries(self, market: str, universe_id: str, limit: int = 5) -> list[dict[str, Any]]:
        docs = (
            self._news_namespace(market, universe_id)
            .collection("market_run_summaries")
            .order_by("date")
            .limit_to_last(limit)
            .get()
        )
        return [_serialize(doc.to_dict()) or {} for doc in docs]

    def save_market_breadth_doc(self, market: str, date_str: str, payload: dict[str, Any]) -> None:
        doc_id = f"{market.upper()}_{date_str}"
        self.db.collection("tm_market_breadth").document(doc_id).set(payload, merge=True)
        self.db.collection("tm_market_breadth").document(f"latest__{market.upper()}").set(payload, merge=True)

    def get_market_breadth_doc(self, market: str, date_str: str) -> dict[str, Any] | None:
        doc_id = f"{market.upper()}_{date_str}"
        doc = self.db.collection("tm_market_breadth").document(doc_id).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_stock_technical_docs(self, docs_payload: list[dict[str, Any]]) -> None:
        if not docs_payload:
            return
        batch = self.db.batch()
        for payload in docs_payload:
            instrument_id = str(payload.get("instrument_id", "")).strip()
            as_of_date = str(payload.get("as_of_date", "")).strip()
            if not instrument_id or not as_of_date:
                continue
            doc_id = f"{instrument_id}_{as_of_date}"
            batch.set(self.db.collection("tm_stock_technicals").document(doc_id), payload, merge=True)
            batch.set(self.db.collection("tm_stock_technicals_latest").document(instrument_id), payload, merge=True)
        batch.commit()

    def get_latest_stock_technical_doc(
        self, instrument_id: str, lookback_days: int = 14
    ) -> dict[str, Any] | None:
        """Walk back up to `lookback_days` daily doc IDs and return the newest
        existing one. Avoids the composite index required by a where+order_by
        query, and mirrors the pattern used on the frontend reader."""
        latest = self.db.collection("tm_stock_technicals_latest").document(instrument_id).get()
        if latest.exists:
            return _serialize(latest.to_dict()) or None
        today = datetime.now(timezone.utc).date()
        collection = self.db.collection("tm_stock_technicals")
        refs = [
            collection.document(f"{instrument_id}_{(today - timedelta(days=i)).isoformat()}")
            for i in range(lookback_days)
        ]
        snaps = list(self.db.get_all(refs))
        # Reorder to strict newest-first (get_all does not guarantee order).
        by_id = {snap.id: snap for snap in snaps if snap.exists}
        for ref in refs:
            snap = by_id.get(ref.id)
            if snap is not None:
                return _serialize(snap.to_dict()) or None
        return None

    def get_stock_technical_doc(self, instrument_id: str, date_str: str) -> dict[str, Any] | None:
        doc_id = f"{instrument_id}_{date_str}"
        doc = self.db.collection("tm_stock_technicals").document(doc_id).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_user_watchlist(self, user_id: str, payload: dict[str, Any]) -> None:
        self.db.collection("tm_user_watchlists").document(user_id).set({
            **payload,
            "user_id": user_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def get_user_watchlist(self, user_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_user_watchlists").document(user_id).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_watchlist_view(self, uid: str, payload: dict[str, Any], *, archive_previous: bool = False) -> None:
        """Write a materialized watchlist view for a user.

        One doc per user under `tm_watchlist_views/{uid}`. Holds the fully
        joined per-stock rows, alert digest, and pulse headline needed by the
        `/watchlist` page, so a page load is a single Firestore read instead
        of N per-entity lookups."""
        ref = self.db.collection("tm_watchlist_views").document(uid)
        previous = ref.get() if archive_previous else None
        if previous and previous.exists:
            previous_payload = _serialize(previous.to_dict()) or {}
            history_id = str(
                previous_payload.get("built_at")
                or previous_payload.get("updated_at")
                or datetime.now(timezone.utc).isoformat()
            ).replace(":", "-").replace(".", "-")
            ref.collection("history").document(history_id).set(previous_payload)
        ref.set({
            **payload,
            "uid": uid,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=False)

    def get_watchlist_view(self, uid: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_watchlist_views").document(uid).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    # ─── Radar evidence / events / personalized read model ──────────────

    def save_radar_evidence(self, payloads: list[dict[str, Any]]) -> int:
        """Upsert normalized source evidence by stable evidence_id."""
        collection = self.db.collection("tm_radar_evidence")
        saved = 0
        for start in range(0, len(payloads), 450):
            batch = self.db.batch()
            for payload in payloads[start:start + 450]:
                evidence_id = str(payload.get("evidence_id") or "").strip()
                if not evidence_id:
                    continue
                batch.set(collection.document(evidence_id), _serialize(payload) or {}, merge=True)
                saved += 1
            batch.commit()
        return saved

    def list_radar_evidence(
        self,
        instrument_ids: list[str],
        *,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        """Read recent normalized evidence for at most 30 instruments per query."""
        wanted = sorted({
            str(instrument_id or "").strip().upper()
            for instrument_id in instrument_ids
            if str(instrument_id or "").strip()
        })
        if not wanted:
            return []
        rows_by_id: dict[str, dict[str, Any]] = {}
        collection = self.db.collection("tm_radar_evidence")
        for start in range(0, len(wanted), 30):
            chunk = wanted[start:start + 30]
            docs = collection.where("instrument_ids", "array_contains_any", chunk).stream()
            for doc in docs:
                rows_by_id[doc.id] = _serialize(doc.to_dict()) or {}
        rows = list(rows_by_id.values())
        rows.sort(
            key=lambda row: str(row.get("published_at") or row.get("detected_at") or ""),
            reverse=True,
        )
        return rows[: max(0, limit)]

    def save_radar_events(self, payloads: list[dict[str, Any]]) -> int:
        """Store idempotent event records. Stable IDs make reruns safe."""
        collection = self.db.collection("tm_radar_events")
        saved = 0
        for start in range(0, len(payloads), 450):
            batch = self.db.batch()
            for payload in payloads[start:start + 450]:
                event_id = str(payload.get("event_id") or "").strip()
                if not event_id:
                    continue
                batch.set(collection.document(event_id), _serialize(payload) or {}, merge=False)
                saved += 1
            batch.commit()
        return saved

    def list_radar_events(
        self,
        instrument_ids: list[str],
        *,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Read recent candidate events for at most 30 tracked instruments."""
        wanted = sorted({
            str(instrument_id or "").strip().upper()
            for instrument_id in instrument_ids
            if str(instrument_id or "").strip()
        })
        if not wanted:
            return []
        rows: list[dict[str, Any]] = []
        collection = self.db.collection("tm_radar_events")
        for start in range(0, len(wanted), 30):
            chunk = wanted[start:start + 30]
            docs = collection.where("instrument_id", "in", chunk).stream()
            rows.extend(_serialize(doc.to_dict()) or {} for doc in docs)
        rows.sort(
            key=lambda row: str(row.get("detected_at") or row.get("occurred_at") or ""),
            reverse=True,
        )
        return rows[: max(0, limit)]

    def get_radar_stock_states(self, instrument_ids: list[str]) -> dict[str, dict[str, Any]]:
        collection = self.db.collection("tm_radar_stock_state")
        refs = [
            collection.document(str(instrument_id).strip().upper())
            for instrument_id in instrument_ids
            if str(instrument_id or "").strip()
        ]
        rows: dict[str, dict[str, Any]] = {}
        for doc in self.db.get_all(refs):
            if doc.exists:
                rows[doc.id] = _serialize(doc.to_dict()) or {}
        return rows

    def save_radar_source_registry(self, instrument_id: str, urls: list[str]) -> None:
        instrument_id = str(instrument_id or "").strip().upper()
        if not instrument_id.startswith("US_"):
            raise ValueError("Radar source registry currently supports US instruments only")
        self.db.collection("tm_radar_source_registry").document(instrument_id).set(
            {
                "instrument_id": instrument_id,
                "investor_relations_urls": list(dict.fromkeys(urls))[:5],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            merge=False,
        )

    def save_radar_stock_state(
        self,
        instrument_id: str,
        payload: dict[str, Any],
        *,
        archive: bool = True,
    ) -> None:
        instrument_id = str(instrument_id or "").strip().upper()
        if not instrument_id:
            raise ValueError("instrument_id is required")
        ref = self.db.collection("tm_radar_stock_state").document(instrument_id)
        serialized = _serialize(payload) or {}
        as_of = str(serialized.get("as_of") or datetime.now(timezone.utc).isoformat())
        if archive:
            history_id = as_of[:19].replace(":", "") + "Z"
            ref.collection("history").document(history_id).set(serialized, merge=False)
        ref.set(serialized, merge=False)

    def save_radar_inbox_items(self, uid: str, items: list[dict[str, Any]]) -> int:
        """Upsert ranked items while preserving user lifecycle state."""
        collection = self.db.collection("tm_radar_inbox").document(uid).collection("items")
        saved = 0
        for item in items:
            item_id = str(item.get("item_id") or item.get("event_id") or "").strip()
            if not item_id:
                continue
            ref = collection.document(item_id)
            existing = ref.get()
            current = _serialize(existing.to_dict()) or {} if existing.exists else {}
            lifecycle = {
                key: current.get(key)
                for key in ("status", "seen_at", "snoozed_until", "resolved_at")
                if current.get(key) is not None
            }
            ref.set(
                {
                    **(_serialize(item) or {}),
                    **lifecycle,
                    "status": lifecycle.get("status") or "new",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                merge=False,
            )
            saved += 1
        return saved

    def save_radar_user_view(self, uid: str, payload: dict[str, Any]) -> None:
        """Save the latest Radar view and an immutable timestamped snapshot."""
        ref = self.db.collection("tm_radar_user_views").document(uid)
        serialized = {
            **(_serialize(payload) or {}),
            "uid": uid,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        snapshot_at = str(serialized.get("as_of") or serialized["updated_at"])
        snapshot_id = snapshot_at[:19].replace(":", "") + "Z"
        ref.collection("history").document(snapshot_id).set(serialized, merge=False)
        ref.set(serialized, merge=False)

    def get_radar_user_view(self, uid: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_radar_user_views").document(uid).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_directive_outcome(
        self,
        instrument_id: str,
        call_date: str,
        horizon: str,
        payload: dict[str, Any],
    ) -> None:
        """Attach measured outcomes without changing the original call fields."""
        ref = (
            self.db.collection("tm_directive_history")
            .document(str(instrument_id).strip().upper())
            .collection("calls")
            .document(str(call_date)[:10])
        )
        ref.set(
            {
                "outcomes": {
                    str(horizon): {
                        **(_serialize(payload) or {}),
                        "evaluated_at": datetime.now(timezone.utc).isoformat(),
                    }
                }
            },
            merge=True,
        )

    def list_subscribed_users(self) -> list[dict[str, Any]]:
        """Return all user docs with tracked_stocks set (for batched view-build jobs)."""
        docs = (
            self.db.collection("users")
            .where("tracked_stocks", "!=", [])
            .select([
                "tracked_stocks",
                "watchlist_positions",
                "watchlist_version",
                "alert_thresholds",
                "thresholds",
                "email",
                "email_lower",
                "email_alerts_enabled",
                "email_digest_enabled",
                "is_subscribed",
                "subscriptionId",
                "subscriptionStatus",
                "cancelAtPeriodEnd",
            ])
            .stream()
        )
        rows = []
        for doc in docs:
            data = _serialize(doc.to_dict()) or {}
            data["uid"] = doc.id
            rows.append(data)
        return rows

    def list_users_by_ids(self, uids: list[str]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        if not uids:
            return rows
        collection = self.db.collection("users")
        refs = [collection.document(str(uid).strip()) for uid in uids if str(uid).strip()]
        for doc in self.db.get_all(refs):
            if not doc.exists:
                continue
            data = _serialize(doc.to_dict()) or {}
            tracked = data.get("tracked_stocks") or []
            if not isinstance(tracked, list) or not tracked:
                continue
            data["uid"] = doc.id
            rows.append(data)
        rows.sort(key=lambda row: str(row.get("uid") or ""))
        return rows

    def list_user_ids_tracking_any(
        self,
        instrument_ids: list[str],
        *,
        subscribed_only: bool = False,
    ) -> list[str]:
        wanted = {
            str(instrument_id or "").strip().upper()
            for instrument_id in instrument_ids
            if str(instrument_id or "").strip()
        }
        if not wanted:
            return []
        matched: list[str] = []
        for user in self.list_subscribed_users():
            if subscribed_only and not bool(user.get("is_subscribed")):
                continue
            tracked = user.get("tracked_stocks") or []
            if not isinstance(tracked, list):
                continue
            tracked_ids = {
                str(instrument_id or "").strip().upper()
                for instrument_id in tracked
                if str(instrument_id or "").strip()
            }
            if tracked_ids.intersection(wanted):
                uid = str(user.get("uid") or "").strip()
                if uid:
                    matched.append(uid)
        return matched

    def list_user_watchlists(self, market: str | None = None) -> list[dict[str, Any]]:
        docs = self.db.collection("tm_user_watchlists").stream()
        rows = [_serialize(doc.to_dict()) or {} for doc in docs]
        if market:
            rows = [row for row in rows if str(row.get("market", "")).upper() == str(market).upper()]
        rows.sort(key=lambda row: str(row.get("user_id", "")))
        return rows

    def save_user_alert_flags(self, user_id: str, flags: list[dict[str, Any]]) -> None:
        existing = (
            self.db.collection("tm_user_alert_flags")
            .where("user_id", "==", user_id)
            .stream()
        )
        collection = self.db.collection("tm_user_alert_flags")
        existing_by_id = {
            doc.id: (_serialize(doc.to_dict()) or {})
            for doc in existing
        }
        next_by_id: dict[str, dict[str, Any]] = {}
        for payload in flags:
            instrument_id = str(payload.get("instrument_id", "")).strip()
            if not instrument_id:
                continue
            doc_id = f"{user_id}_{instrument_id}"
            next_by_id[doc_id] = payload

        pending: list[tuple[str, str, dict[str, Any] | None]] = []
        for doc_id, payload in next_by_id.items():
            if existing_by_id.get(doc_id) != payload:
                pending.append(("set", doc_id, payload))
        for doc_id in existing_by_id:
            if doc_id not in next_by_id:
                pending.append(("delete", doc_id, None))

        for start in range(0, len(pending), 450):
            batch = self.db.batch()
            for op, doc_id, payload in pending[start:start + 450]:
                ref = collection.document(doc_id)
                if op == "delete":
                    batch.delete(ref)
                elif payload is not None:
                    batch.set(ref, payload, merge=False)
            batch.commit()

    # ─── Mention stats / heat list ────────────────────────────────────────
    # `tm_mention_stats/{instrument_id}` holds a rolling 30-day map of daily
    # mention counts per stock. Each run (build_heat_list) re-buckets the
    # fresh enrichments by article.published_at date and merges them in,
    # trimming anything older than 30 days. This gives the heat-list scorer
    # a baseline it can compare the last 7 days against, without us needing
    # a new long-lived time-series store - one doc, one read, one write.

    def upsert_mention_stats(
        self,
        instrument_id: str,
        daily_buckets: dict[str, dict[str, float]],
        *,
        ticker: str = "",
        market: str = "",
        window_days: int = 30,
    ) -> None:
        """Merge `daily_buckets` ({YYYY-MM-DD: {count, primary_count,
        sentiment_sum, sentiment_n}}) into the rolling stats doc and trim
        anything older than `window_days`."""
        if not instrument_id:
            return
        ref = self.db.collection("tm_mention_stats").document(instrument_id)
        snap = ref.get()
        existing = _serialize(snap.to_dict()) if snap.exists else {}
        days: dict[str, dict[str, float]] = dict(existing.get("days", {}) or {})
        for date_key, payload in daily_buckets.items():
            if not date_key:
                continue
            merged = dict(days.get(date_key, {}))
            for field in ("count", "primary_count", "sentiment_sum", "sentiment_n"):
                merged[field] = float(merged.get(field, 0.0)) + float(payload.get(field, 0.0))
            days[date_key] = merged

        # Trim to trailing window.
        cutoff = (datetime.now(timezone.utc).date() - timedelta(days=window_days)).isoformat()
        days = {k: v for k, v in days.items() if k >= cutoff}

        ref.set({
            "instrument_id": instrument_id,
            "ticker": ticker or existing.get("ticker", ""),
            "market": market or existing.get("market", ""),
            "days": days,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def reset_mention_stats_window(
        self,
        instrument_id: str,
        daily_buckets: dict[str, dict[str, float]],
        *,
        ticker: str = "",
        market: str = "",
    ) -> None:
        """Replace the rolling stats for `instrument_id` with exactly the
        provided buckets. Used when we want to recompute from scratch instead
        of merging (e.g. fresh daily rebuild from a full 30-day enrichment
        archive, or an initial bootstrap)."""
        if not instrument_id:
            return
        self.db.collection("tm_mention_stats").document(instrument_id).set({
            "instrument_id": instrument_id,
            "ticker": ticker,
            "market": market,
            "days": daily_buckets,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        })

    def get_mention_stats(self, instrument_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_mention_stats").document(instrument_id).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_mention_stats_batch(
        self, instrument_ids: list[str]
    ) -> dict[str, dict[str, Any]]:
        """Batch-fetch mention stats for many instruments in one roundtrip
        (uses the same get_all() pattern as get_latest_prices)."""
        result: dict[str, dict[str, Any]] = {}
        collection = self.db.collection("tm_mention_stats")
        for start in range(0, len(instrument_ids), 500):
            chunk = instrument_ids[start : start + 500]
            refs = [collection.document(iid) for iid in chunk]
            for doc in self.db.get_all(refs):
                if doc.exists:
                    result[doc.id] = _serialize(doc.to_dict()) or {}
        return result

    def get_latest_stock_technicals_batch(
        self, instrument_ids: list[str], lookback_days: int = 7
    ) -> dict[str, dict[str, Any]]:
        """Batch-fetch the most recent technical doc for each instrument.

        Tries today first, then walks back up to `lookback_days` days. Each
        pass is a single get_all() call (at most 500 refs per batch), so the
        worst case is `lookback_days` roundtrips instead of
        `len(instrument_ids) * lookback_days` serial reads."""
        result: dict[str, dict[str, Any]] = {}
        latest_collection = self.db.collection("tm_stock_technicals_latest")
        for start in range(0, len(instrument_ids), 500):
            refs = [latest_collection.document(iid) for iid in instrument_ids[start : start + 500]]
            for doc in self.db.get_all(refs):
                if doc.exists:
                    result[doc.id] = _serialize(doc.to_dict()) or {}

        remaining: list[str] = [iid for iid in instrument_ids if iid not in result]
        if not remaining:
            return result
        today = datetime.now(timezone.utc).date()
        collection = self.db.collection("tm_stock_technicals")

        for offset in range(lookback_days):
            if not remaining:
                break
            date_str = (today - timedelta(days=offset)).isoformat()
            refs = [collection.document(f"{iid}_{date_str}") for iid in remaining]
            found_this_pass: set[str] = set()
            for start in range(0, len(refs), 500):
                chunk_refs = refs[start : start + 500]
                for doc in self.db.get_all(chunk_refs):
                    if not doc.exists:
                        continue
                    # Doc id is "{instrument_id}_{date}" - strip the date suffix.
                    raw_id = doc.id
                    iid = raw_id[: -(len(date_str) + 1)]  # remove trailing _YYYY-MM-DD
                    result[iid] = _serialize(doc.to_dict()) or {}
                    found_this_pass.add(iid)
            remaining = [iid for iid in remaining if iid not in found_this_pass]

        return result

    def list_mention_stats(self, market: str | None = None) -> list[dict[str, Any]]:
        query = self.db.collection("tm_mention_stats")
        if market:
            query = query.where("market", "==", market)
        rows = [_serialize(doc.to_dict()) or {} for doc in query.stream()]
        rows.sort(key=lambda row: str(row.get("instrument_id", "")))
        return rows

    def save_heat_list(self, market: str, payload: dict[str, Any]) -> None:
        """Write the ranked heat-list doc for a market.

        `tm_heat_list/{market}` keeps the full analytical artifact.
        `tm_heat_list_view/{market}` is the compact frontend read model.
        Keep `/heat` on the compact doc so request payload does not scale with
        the full ranked universe."""
        full_payload = {
            **payload,
            "market": market,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.db.collection("tm_heat_list").document(market).set(full_payload)
        # Compact read-model for `/heat`: keep top rows per setup plus counts.
        # The full analytical artifact above remains available for debugging.
        self.db.collection("tm_heat_list_view").document(market).set(_compact_heat_list(full_payload))

    def save_interesting_stocks(self, market: str, payload: dict[str, Any]) -> None:
        """Write ranked interesting setups for Pulse (`tm_interesting_stocks/{market}`)."""
        full_payload = {
            **payload,
            "market": market,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.db.collection("tm_interesting_stocks").document(market).set(full_payload)

    def get_interesting_stocks(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_interesting_stocks").document(market).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_heat_list(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_heat_list").document(market).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_divergence_list(self, market: str, payload: dict[str, Any]) -> None:
        """Write the ranked price-news divergence doc for a market."""
        self.db.collection("tm_divergence").document(market).set({
            **payload,
            "market": market,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })

    def get_divergence_list(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_divergence").document(market).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_sentiment_flip_list(self, market: str, payload: dict[str, Any]) -> None:
        """Write the ranked sentiment-flip doc for a market."""
        self.db.collection("tm_sentiment_flip").document(market).set({
            **payload,
            "market": market,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })

    def get_sentiment_flip_list(self, market: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_sentiment_flip").document(market).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_preferences_schema(self) -> dict[str, Any] | None:
        doc = self.db.collection("tm_config").document("preferences_schema").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_user_preferences(self, user_id: str, preferences: dict[str, Any]) -> None:
        self.db.collection("tm_user_preferences").document(user_id).set({
            **preferences,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def get_user_preferences(self, user_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_user_preferences").document(user_id).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_promoted_tickers(self, market: str) -> list[dict[str, Any]]:
        doc = self.db.collection("tm_config").document("promoted_tickers").get()
        if not doc.exists:
            return []
        data = _serialize(doc.to_dict()) or {}
        rows = data.get(market, [])
        return rows if isinstance(rows, list) else []

    def save_promoted_tickers(self, market: str, tickers: list[dict[str, Any]]) -> None:
        self.db.collection("tm_config").document("promoted_tickers").set({
            market: tickers,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def get_price_core_overrides(self, market: str) -> list[str]:
        doc = self.db.collection("tm_config").document("price_core_overrides").get()
        if not doc.exists:
            return []
        data = _serialize(doc.to_dict()) or {}
        rows = data.get(str(market).upper(), [])
        if not isinstance(rows, list):
            return []
        out: list[str] = []
        seen: set[str] = set()
        for raw in rows:
            iid = str(raw or "").strip().upper()
            if not iid or iid in seen:
                continue
            seen.add(iid)
            out.append(iid)
        return out

    def save_search_heat_cohort(self, market: str, rows: list[dict[str, Any]]) -> None:
        market_key = str(market).upper()
        now = datetime.now(timezone.utc)
        self.db.collection("tm_config").document("search_heat_cohort").set(
            {
                market_key: _serialize(rows),
                f"{market_key}_instrument_ids": [
                    str(row.get("instrument_id") or "").strip().upper()
                    for row in rows
                    if str(row.get("instrument_id") or "").strip()
                ],
                "updated_at": now.isoformat(),
                "expires_at": (now + timedelta(hours=30)).isoformat(),
            },
            merge=True,
        )

    def save_price_refresh_status(self, market: str, payload: dict[str, Any]) -> None:
        market_key = str(market).upper()
        self.db.collection("tm_price_refresh_status").document(market_key).set({
            **_serialize(payload),
            "market": market_key,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def save_snapshot(self, snapshot: dict[str, Any]) -> None:
        snapshot_id = snapshot["snapshot_id"]
        buckets = snapshot.pop("buckets", None)
        topics = snapshot.pop("topics", [])
        if buckets is None:
            buckets = topics
        snapshot_ref = self.db.collection("tm_snapshots").document(snapshot_id)
        snapshot_ref.set(snapshot)

        existing_bucket_docs = list(snapshot_ref.collection("buckets").stream())
        if existing_bucket_docs:
            delete_batch = self.db.batch()
            for doc in existing_bucket_docs:
                delete_batch.delete(doc.reference)
            delete_batch.commit()

        batch = self.db.batch()
        for bucket in buckets:
            batch.set(snapshot_ref.collection("buckets").document(bucket["slug"]), bucket)
        batch.commit()

        self.db.collection("tm_config").document("latest_snapshots").set({
            snapshot["market"]: {
                "snapshot_id": snapshot_id,
                "as_of_date": snapshot["as_of_date"],
                "generated_at": snapshot["generated_at"],
            }
        }, merge=True)

    def get_llm_enrichment(self, cache_key: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_llm_cache").document(cache_key).get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def save_llm_enrichment(self, cache_key: str, payload: dict[str, Any]) -> None:
        self.db.collection("tm_llm_cache").document(cache_key).set({
            **payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def get_latest_snapshot(self, market: str) -> dict[str, Any] | None:
        latest_doc = self.db.collection("tm_config").document("latest_snapshots").get()
        if not latest_doc.exists:
            return None
        latest_data = latest_doc.to_dict() or {}
        latest = latest_data.get(market)
        if not latest:
            return None
        return self.get_snapshot(latest["snapshot_id"])

    def get_snapshot(self, snapshot_id: str) -> dict[str, Any] | None:
        snapshot_doc = self.db.collection("tm_snapshots").document(snapshot_id).get()
        if not snapshot_doc.exists:
            return None
        snapshot_data = _serialize(snapshot_doc.to_dict()) or {}
        bucket_docs = self.db.collection("tm_snapshots").document(snapshot_id).collection("buckets").stream()
        buckets = [_serialize(doc.to_dict()) for doc in bucket_docs]
        if not buckets:
            topic_docs = self.db.collection("tm_snapshots").document(snapshot_id).collection("topics").stream()
            buckets = [_serialize(doc.to_dict()) for doc in topic_docs]
        snapshot_data["buckets"] = sorted(
            buckets,
            key=lambda item: (-int(item.get("article_count", 0)), item.get("name", "")),
        )
        snapshot_data["topics"] = list(snapshot_data["buckets"])
        return snapshot_data

    def list_sources(self, market: str | None = None) -> list[dict[str, Any]]:
        docs = self.db.collection("tm_sources").stream()
        rows = [_serialize({"id": doc.id, **(doc.to_dict() or {})}) for doc in docs]
        if market:
            rows = [row for row in rows if market in row.get("market_codes", [])]
        rows.sort(key=lambda row: row["name"])
        return rows
