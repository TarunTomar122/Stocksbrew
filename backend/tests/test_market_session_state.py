from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.market_session_state import MarketSessionState


class _Snapshot:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.exists = bool(payload)

    def to_dict(self) -> dict:
        return self.payload


class _Ref:
    def __init__(self) -> None:
        self.payload: dict = {}

    def set(self, value: dict, merge: bool = False) -> None:
        if not merge:
            self.payload = dict(value)
        else:
            self.payload.update(value)

    def update(self, value: dict) -> None:
        for path, payload in value.items():
            parent, child = path.split(".", 1)
            self.payload.setdefault(parent, {})[child] = payload

    def get(self) -> _Snapshot:
        return _Snapshot(self.payload)


class _Collection:
    def __init__(self, ref: _Ref) -> None:
        self.ref = ref

    def document(self, _doc_id: str) -> _Ref:
        return self.ref


class _Db:
    def __init__(self, ref: _Ref) -> None:
        self.ref = ref

    def collection(self, _name: str) -> _Collection:
        return _Collection(self.ref)


class _Store:
    def __init__(self, ref: _Ref) -> None:
        self.db = _Db(ref)


def test_session_barrier_requires_same_session_stages() -> None:
    ref = _Ref()
    state = MarketSessionState(_Store(ref))
    for stage in ("price", "briefs", "anomalies"):
        state.record_stage(
            market="US",
            phase="open_check",
            stage=stage,
            run_id=f"run-{stage}",
        )

    payload = state.require_stages(
        market="US",
        phase="open_check",
        stages=["price", "briefs", "anomalies"],
    )
    assert payload["status"] == "complete"
    assert set(payload["stages"]) == {"price", "briefs", "anomalies"}


def test_session_barrier_fails_closed_on_missing_stage() -> None:
    ref = _Ref()
    state = MarketSessionState(_Store(ref))
    state.record_stage(
        market="US",
        phase="post_close",
        stage="price",
        run_id="run-price",
    )

    with pytest.raises(RuntimeError, match="missing=.*briefs"):
        state.require_stages(
            market="US",
            phase="post_close",
            stages=["price", "briefs"],
        )


def test_waiting_barrier_still_fails_closed_after_timeout() -> None:
    ref = _Ref()
    state = MarketSessionState(_Store(ref))
    state.record_stage(
        market="US",
        phase="open_check",
        stage="price",
        run_id="run-price",
    )

    with pytest.raises(RuntimeError, match="missing=.*briefs"):
        state.wait_for_stages(
            market="US",
            phase="open_check",
            stages=["price", "briefs"],
            timeout_seconds=0,
        )
