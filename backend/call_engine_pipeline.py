"""Wiring between the brief pipeline and the call engine.

One environment flag decides everything:

  CALL_ENGINE_MODE=off     (default) nothing in here runs; briefs are unchanged.
  CALL_ENGINE_MODE=shadow  the old directive is still stored and shown. The
                           engine's call for the stock is attached to the brief
                           as ``call_engine`` so the two can be compared.
  CALL_ENGINE_MODE=on      the engine decides. The model is handed the call and
                           only explains it; ``directive_v2`` is filled from
                           the engine so existing readers keep working.

The brief pipeline never computes a call. The call compares the stock with its
peers, so it is produced once per close by ``backend/agentdata/call_scores.py``
and stored in ``tm_call_engine_state/{SYMBOL}``; this module only reads that
document. If it is missing, from another engine version, or older than
``MAX_AGE_DAYS``, the brief falls back to the old directive.

US only: the engine's inputs are keyed by US ticker.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from typing import Any

from backend import call_engine as ce

logger = logging.getLogger(__name__)

MODE_ENV = "CALL_ENGINE_MODE"
MODES = ("off", "shadow", "on")
MAX_AGE_DAYS = 6  # a long weekend plus one missed run


def call_engine_mode() -> str:
    """off | shadow | on. Anything unset or unrecognised is off."""
    value = os.getenv(MODE_ENV, "").strip().lower()
    return value if value in MODES else "off"


class EngineContext:
    """The mode for this run and the store to read calls from."""

    def __init__(self, store: Any | None, market: str, mode: str | None = None) -> None:
        self.store = store
        self.market = str(market or "").strip().upper()
        self.mode = mode if mode in MODES else call_engine_mode()

    @property
    def active(self) -> bool:
        return self.mode != "off" and self.store is not None and self.market == "US"


def engine_context_for(store: Any | None, market: str) -> EngineContext:
    return EngineContext(store, market)


def compute_engine_call(context: EngineContext, instrument: dict[str, Any], *, today: date | None = None) -> dict[str, Any] | None:
    """The stored engine call for one instrument, or None when there is no
    usable one. Never raises."""
    if not context.active:
        return None
    ticker = str(instrument.get("ticker") or "").strip().upper()
    reader = getattr(context.store, "get_call_engine_state", None)
    if not ticker or not callable(reader):
        return None
    try:
        call = reader(ticker)
    except Exception as exc:
        logger.info("call engine state read failed for %s: %s", ticker, exc)
        return None
    if not isinstance(call, dict) or call.get("version") != ce.ENGINE_VERSION or call.get("call") not in (ce.ADD, ce.HOLD, ce.TRIM):
        return None
    try:
        age = ((today or datetime.now(timezone.utc).date()) - date.fromisoformat(str(call.get("as_of"))[:10])).days
    except ValueError:
        return None
    if age > MAX_AGE_DAYS or age < -1:
        return None
    return call


def engine_brief_for_prompt(call: dict[str, Any]) -> dict[str, Any]:
    """What the model is told in ``on`` mode: the decided call and the scorecard behind it."""
    zones = call.get("zones") or {}
    change = call.get("change") or {}
    families = [row for row in call.get("families") or [] if isinstance(row, dict)]
    return {
        "call": str(call.get("call") or "").upper(),
        "decided_by": "rules",
        "what_it_is": ce.BASIS,
        "rule": call.get("rule") or ce.RULE_TEXT,
        "since": call.get("since"),
        "peer_group": call.get("peer_group"),
        "votes": call.get("votes"),
        "trend": (call.get("trend") or {}).get("text"),
        "horizon": call.get("horizon_label"),
        "review_on": call.get("review_on"),
        "add_below": zones.get("accumulate_below"),
        "add_level_is": zones.get("add_anchor"),
        "trim_above": zones.get("trim_above"),
        "trim_level_is": zones.get("trim_anchor"),
        "reasons": [{"factor": item.get("label"), "sector_percentile": item.get("rank_pct"), "text": item.get("text")} for item in call.get("reasons") or []],
        "scorecard": [row.get("text") for row in families if row.get("status") == "scored"],
        # families that do not apply to this company or have no data: say so, never fill them in
        "not_in_the_call": [row.get("text") for row in families if row.get("status") != "scored"],
        "what_would_change_it": [item.get("text") for item in call.get("what_would_change") or []],
        "changed_today": bool(call.get("changed")),
        "change_reason": change.get("reason") if call.get("changed") else None,
        "confidence": (call.get("confidence") or {}).get("label"),
        "confidence_means": (call.get("confidence") or {}).get("text"),
        "limits": (call.get("evidence") or {}).get("limits"),
    }


def resolve_directive(
    mode: str,
    *,
    legacy_directive: dict[str, Any],
    engine_call: dict[str, Any] | None,
    live_price: float | None,
) -> dict[str, Any]:
    """Fields to put on the brief for this mode.

    off: exactly ``{"directive_v2": legacy_directive}``.
    shadow: the same directive, plus the engine object when there is one.
    on: the directive is the engine's call in the legacy shape. The model's
        driver and risk sentences stay as the evidence text. Without an engine
        call the old directive is used and the fallback is recorded.
    """
    if mode not in ("shadow", "on"):
        return {"directive_v2": legacy_directive}
    out: dict[str, Any] = {"directive_v2": legacy_directive, "call_engine_mode": mode}
    if engine_call is not None:
        out["call_engine"] = engine_call
    if mode == "on":
        if engine_call is not None:
            directive = ce.to_directive_v2(engine_call, live_price)
            if legacy_directive.get("evidence"):
                directive["evidence"] = legacy_directive["evidence"]
            # trend stays the engine's own (its 200-day gate), so the label never contradicts the call
            for key in ("sector_state", "catalyst_state"):
                value = (legacy_directive.get("setup") or {}).get(key)
                if value:
                    directive["setup"][key] = value
            out["directive_v2"] = directive
        else:
            out["call_engine_fallback"] = "no current engine call for this stock; old directive used"
    return out
