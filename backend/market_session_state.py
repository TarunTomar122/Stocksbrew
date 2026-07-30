from __future__ import annotations

from datetime import datetime, timedelta, timezone
import time
from typing import Any
from zoneinfo import ZoneInfo

from backend.storage import TraceMoneyStore


MARKET_TIMEZONES = {
    "US": ZoneInfo("America/New_York"),
    "IN": ZoneInfo("Asia/Kolkata"),
}


def market_session_date(market: str) -> str:
    zone = MARKET_TIMEZONES.get(market.upper(), timezone.utc)
    return datetime.now(zone).date().isoformat()


def session_doc_id(market: str, phase: str, session_date: str | None = None) -> str:
    return f"{market.upper()}__{phase}__{session_date or market_session_date(market)}"


class MarketSessionState:
    def __init__(self, store: TraceMoneyStore | None = None) -> None:
        self.store = store or TraceMoneyStore()
        self.db = self.store.db

    def _ref(self, market: str, phase: str):
        return self.db.collection("tm_market_session_runs").document(
            session_doc_id(market, phase)
        )

    def record_stage(
        self,
        *,
        market: str,
        phase: str,
        stage: str,
        run_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        ref = self._ref(market, phase)
        ref.set(
            {
                "market": market.upper(),
                "phase": phase,
                "session_date": market_session_date(market),
                "status": "running" if stage != "anomalies" else "complete",
                "updated_at": now,
            },
            merge=True,
        )
        ref.update(
            {
                f"stages.{stage}": {
                    "status": "success",
                    "run_id": run_id,
                    "completed_at": now,
                    "metadata": metadata or {},
                }
            }
        )

    def require_stages(
        self,
        *,
        market: str,
        phase: str,
        stages: list[str],
        max_age_hours: int = 3,
    ) -> dict[str, Any]:
        snap = self._ref(market, phase).get()
        if not snap.exists:
            raise RuntimeError(
                f"No market-session record for {market.upper()} {phase} "
                f"{market_session_date(market)}"
            )
        payload = snap.to_dict() or {}
        stage_payloads = payload.get("stages") if isinstance(payload.get("stages"), dict) else {}
        missing: list[str] = []
        stale: list[str] = []
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, max_age_hours))
        for stage in stages:
            row = stage_payloads.get(stage) if isinstance(stage_payloads.get(stage), dict) else {}
            if row.get("status") != "success":
                missing.append(stage)
                continue
            raw = str(row.get("completed_at") or "")
            try:
                completed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                if completed.tzinfo is None:
                    completed = completed.replace(tzinfo=timezone.utc)
            except ValueError:
                stale.append(stage)
                continue
            if completed.astimezone(timezone.utc) < cutoff:
                stale.append(stage)
        if missing or stale:
            raise RuntimeError(
                f"Market-session barrier failed for {market.upper()} {phase}: "
                f"missing={missing} stale={stale}"
            )
        return payload

    def wait_for_stages(
        self,
        *,
        market: str,
        phase: str,
        stages: list[str],
        timeout_seconds: int = 0,
        poll_seconds: float = 5.0,
        max_age_hours: int = 3,
    ) -> dict[str, Any]:
        """Wait for dependency stages without weakening the fail-closed check.

        The opening mover price batch is timer-driven at 09:50 ET while the
        09:30 brief synthesis is dependency-driven. Usually briefs finish
        first, but a slow source/model provider must not turn that harmless
        overlap into a missing-stage failure or, worse, bypass the barrier.
        """
        deadline = time.monotonic() + max(0, timeout_seconds)
        while True:
            try:
                return self.require_stages(
                    market=market,
                    phase=phase,
                    stages=stages,
                    max_age_hours=max_age_hours,
                )
            except RuntimeError:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise
                time.sleep(min(max(0.1, poll_seconds), remaining))
