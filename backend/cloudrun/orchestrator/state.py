from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from backend.storage import TraceMoneyStore


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class ShardRef:
    run_id: str
    lane: str
    stage: str
    shard_id: str


class PipelineStateStore:
    def __init__(self, store: TraceMoneyStore | None = None) -> None:
        self.store = store or TraceMoneyStore()
        self.db = self.store.db

    def run_ref(self, run_id: str):
        return self.db.collection("tm_pipeline_runs").document(run_id)

    def shard_ref(self, ref: ShardRef):
        return (
            self.run_ref(ref.run_id)
            .collection("stages")
            .document(f"{ref.lane}__{ref.stage}")
            .collection("shards")
            .document(ref.shard_id)
        )

    def create_run(
        self,
        *,
        run_id: str,
        lane: str,
        market: str,
        universe_id: str,
        metadata: dict[str, Any],
    ) -> None:
        self.run_ref(run_id).set(
            {
                "run_id": run_id,
                "lane": lane,
                "market": market.upper(),
                "universe_id": universe_id,
                "status": "running",
                "created_at": utc_now_iso(),
                "updated_at": utc_now_iso(),
                "metadata": metadata,
            },
            merge=True,
        )

    def upsert_shard_plan(
        self,
        *,
        ref: ShardRef,
        instrument_ids: list[str],
        task_args: list[str],
    ) -> None:
        self.shard_ref(ref).set(
            {
                "run_id": ref.run_id,
                "lane": ref.lane,
                "stage": ref.stage,
                "shard_id": ref.shard_id,
                "instrument_ids": instrument_ids,
                "instrument_count": len(instrument_ids),
                "task_args": task_args,
                "status": "planned",
                "attempts": 0,
                "updated_at": utc_now_iso(),
            },
            merge=True,
        )

    def mark_shard_started(self, ref: ShardRef, execution_name: str) -> None:
        self.shard_ref(ref).set(
            {
                "status": "running",
                "execution_name": execution_name,
                "started_at": utc_now_iso(),
                "updated_at": utc_now_iso(),
                "attempts": self._next_attempt_count(ref),
            },
            merge=True,
        )

    def mark_shard_finished(
        self,
        ref: ShardRef,
        *,
        status: str,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "status": status,
            "updated_at": utc_now_iso(),
        }
        if status == "success":
            payload["completed_at"] = utc_now_iso()
        if result is not None:
            payload["result"] = result
        if error:
            payload["error"] = error
        self.shard_ref(ref).set(payload, merge=True)

    def list_stage_shards(self, *, run_id: str, lane: str, stage: str) -> list[dict[str, Any]]:
        docs = (
            self.run_ref(run_id)
            .collection("stages")
            .document(f"{lane}__{stage}")
            .collection("shards")
            .stream()
        )
        out: list[dict[str, Any]] = []
        for doc in docs:
            row = doc.to_dict() or {}
            row["id"] = doc.id
            out.append(row)
        return out

    def mark_run_finished(self, *, run_id: str, status: str, summary: dict[str, Any]) -> None:
        self.run_ref(run_id).set(
            {
                "status": status,
                "summary": summary,
                "updated_at": utc_now_iso(),
                "completed_at": utc_now_iso(),
            },
            merge=True,
        )

    def _next_attempt_count(self, ref: ShardRef) -> int:
        snap = self.shard_ref(ref).get()
        if not snap.exists:
            return 1
        row = snap.to_dict() or {}
        return int(row.get("attempts") or 0) + 1
