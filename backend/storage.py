"""Firestore helpers for Trace Money."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from backend.env import load_backend_env, resolve_backend_path

load_backend_env()


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


class TraceMoneyStore:
    """Firestore persistence for config, market data, and derived views."""

    def __init__(self) -> None:
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
        docs = self.db.collection("tm_instruments").stream()
        rows = [_serialize(doc.to_dict()) for doc in docs]
        rows = [row for row in rows if row and row.get("market") == market]
        if instrument_ids is not None:
            allowed = set(instrument_ids)
            rows = [row for row in rows if row.get("instrument_id") in allowed]
        rows.sort(key=lambda row: row.get("instrument_id", ""))
        return rows

    def save_price_snapshot(self, payload: dict[str, Any]) -> None:
        instrument_id = payload["instrument_id"]
        captured_at = payload["captured_at"]
        point_id = (
            captured_at.replace("-", "")
            .replace(":", "")
            .replace(".", "")
            .replace("+", "_")
        )
        parent_ref = self.db.collection("tm_price_snapshots").document(instrument_id)
        parent_ref.set({
            "instrument_id": instrument_id,
            "market": payload["market"],
            "ticker": payload["ticker"],
            "latest_captured_at": captured_at,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)
        parent_ref.collection("points").document(point_id).set(payload, merge=True)
        self.db.collection("tm_latest_prices").document(instrument_id).set(payload, merge=True)

    def save_fundamental_snapshot(self, instrument_id: str, payload: dict[str, Any]) -> None:
        self.db.collection("tm_fundamental_snapshots").document(instrument_id).set({
            **payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def get_fundamental_snapshots(self, instrument_ids: list[str]) -> dict[str, dict[str, Any]]:
        rows: dict[str, dict[str, Any]] = {}
        for instrument_id in instrument_ids:
            doc = self.db.collection("tm_fundamental_snapshots").document(instrument_id).get()
            if doc.exists:
                rows[instrument_id] = _serialize(doc.to_dict()) or {}
        return rows

    def get_latest_prices(self, instrument_ids: list[str]) -> dict[str, dict[str, Any]]:
        rows: dict[str, dict[str, Any]] = {}
        for instrument_id in instrument_ids:
            doc = self.db.collection("tm_latest_prices").document(instrument_id).get()
            if doc.exists:
                rows[instrument_id] = _serialize(doc.to_dict()) or {}
        return rows

    def get_price_history(self, instrument_id: str, limit: int = 12) -> list[dict[str, Any]]:
        docs = (
            self.db.collection("tm_price_snapshots")
            .document(instrument_id)
            .collection("points")
            .order_by("captured_at")
            .limit_to_last(limit)
            .get()
        )
        return [_serialize(doc.to_dict()) or {} for doc in docs]

    def save_active_universe(self, market: str, universe_id: str) -> None:
        self.db.collection("tm_config").document("active_universes").set({
            market: universe_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    def get_active_universe(self, market: str) -> str | None:
        doc = self.db.collection("tm_config").document("active_universes").get()
        if not doc.exists:
            return None
        data = _serialize(doc.to_dict()) or {}
        value = data.get(market)
        return str(value) if value else None

    def save_dashboard_view(self, market: str, universe_id: str, payload: dict[str, Any]) -> None:
        doc_id = f"{market}__{universe_id}"
        self.db.collection("tm_views_dashboard").document(doc_id).set(payload)

    def save_instrument_view(self, instrument_id: str, universe_id: str, payload: dict[str, Any]) -> None:
        doc_id = f"{instrument_id}__{universe_id}"
        self.db.collection("tm_views_instrument").document(doc_id).set(payload)

    def get_dashboard_view(self, market: str, universe_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_views_dashboard").document(f"{market}__{universe_id}").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def get_instrument_view(self, instrument_id: str, universe_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("tm_views_instrument").document(f"{instrument_id}__{universe_id}").get()
        return _serialize(doc.to_dict()) if doc.exists else None

    def _news_namespace(self, market: str, universe_id: str):
        return self.db.collection("tm_news_runs").document(f"{market}__{universe_id}")

    def _replace_subcollection(self, parent_ref, name: str, docs_payload: list[dict[str, Any]], id_field: str) -> None:
        existing_docs = list(parent_ref.collection(name).stream())
        if existing_docs:
            delete_batch = self.db.batch()
            for doc in existing_docs:
                delete_batch.delete(doc.reference)
            delete_batch.commit()
        if not docs_payload:
            return
        batch = self.db.batch()
        for payload in docs_payload:
            batch.set(parent_ref.collection(name).document(str(payload[id_field])), payload)
        batch.commit()

    def save_news_articles(self, market: str, universe_id: str, articles: list[dict[str, Any]], source_health: list[dict[str, Any]] | None = None) -> None:
        namespace = self._news_namespace(market, universe_id)
        namespace.set({
            "market": market,
            "universe_id": universe_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "article_count": len(articles),
            "source_health": source_health or [],
        }, merge=True)
        self._replace_subcollection(namespace, "articles", articles, "id")

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
        }, merge=True)

    def list_article_enrichments(self, market: str, universe_id: str) -> list[dict[str, Any]]:
        docs = self._news_namespace(market, universe_id).collection("enrichments").stream()
        rows = [_serialize(doc.to_dict()) or {} for doc in docs]
        rows.sort(key=lambda row: row.get("published_at", ""), reverse=True)
        return rows

    def save_stock_intelligence_docs(self, market: str, universe_id: str, docs_payload: list[dict[str, Any]]) -> None:
        namespace = self._news_namespace(market, universe_id)
        self._replace_subcollection(namespace, "stock_intelligence", docs_payload, "instrument_id")
        namespace.set({
            "market": market,
            "universe_id": universe_id,
            "last_stock_intelligence_at": datetime.now(timezone.utc).isoformat(),
            "stock_intelligence_count": len(docs_payload),
        }, merge=True)

    def list_stock_intelligence_docs(self, market: str, universe_id: str) -> list[dict[str, Any]]:
        docs = self._news_namespace(market, universe_id).collection("stock_intelligence").stream()
        rows = [_serialize(doc.to_dict()) or {} for doc in docs]
        rows.sort(key=lambda row: row.get("instrument_id", ""))
        return rows

    def get_stock_intelligence_doc(self, market: str, universe_id: str, instrument_id: str) -> dict[str, Any] | None:
        doc = self._news_namespace(market, universe_id).collection("stock_intelligence").document(instrument_id).get()
        return _serialize(doc.to_dict()) if doc.exists else None

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
