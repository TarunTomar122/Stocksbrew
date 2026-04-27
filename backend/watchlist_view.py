"""Assemble a materialized watchlist view for a user.

Join pattern: for each instrument_id in `tracked_stocks`, pull the already-
computed intel_pro doc (scores, verdict, catalysts) + the latest price doc
(price, day change, history_window) + the user's alert flags, then fold into
one self-contained doc at `tm_watchlist_views/{uid}`.

Consumers read that one doc on `/watchlist` page load — no per-entity
Firestore round trips at render time.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.storage import TraceMoneyStore

WATCHLIST_ROW_CAP = 20  # safety cap; UI limit is 10


def _market_from_instrument_id(instrument_id: str) -> str:
    prefix = instrument_id.split("_", 1)[0] if "_" in instrument_id else ""
    return prefix if prefix in {"US", "IN"} else ""


def _active_universe_cache(store: TraceMoneyStore) -> dict[str, str]:
    """Return {market: active_ai_universe_id}. Cached per build run."""
    return {
        "US": store.get_active_ai_universe("US") or "",
        "IN": store.get_active_ai_universe("IN") or "",
    }


def _safe_float(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v


def _row_for_instrument(
    store: TraceMoneyStore,
    instrument_id: str,
    active_universes: dict[str, str],
    alerts_by_instrument: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    market = _market_from_instrument_id(instrument_id)
    if not market:
        return None

    latest_doc = store.db.collection("tm_latest_prices").document(instrument_id).get()
    if not latest_doc.exists:
        return None
    latest = latest_doc.to_dict() or {}
    quote = latest.get("quote") or {}

    intel_pro: dict[str, Any] = {}
    universe_id = active_universes.get(market, "")
    if universe_id:
        intel_pro = store.get_stock_intel_pro(market, universe_id, instrument_id) or {}
    pillars = intel_pro.get("pillars") or {}
    overall = intel_pro.get("overall") or {}

    return {
        "instrument_id": instrument_id,
        "ticker": latest.get("ticker") or intel_pro.get("ticker", ""),
        "market": market,
        "sector_label": intel_pro.get("sector_label", ""),
        "industry_label": intel_pro.get("industry_label", ""),
        "currency": latest.get("currency", "USD" if market == "US" else "INR"),
        "price": _safe_float(quote.get("current")),
        "day_change_pct": _safe_float(quote.get("day_change_pct")),
        "day_change_abs": _safe_float(quote.get("day_change_abs")),
        "scores": {
            "overall": _safe_float((overall or {}).get("score")),
            "verdict": (overall or {}).get("verdict"),
            "valuation": _safe_float((pillars.get("valuation") or {}).get("score")),
            "growth": _safe_float((pillars.get("growth") or {}).get("score")),
            "quality": _safe_float((pillars.get("quality") or {}).get("score")),
            "momentum": _safe_float((pillars.get("momentum") or {}).get("score")),
        },
        "alerts": alerts_by_instrument.get(instrument_id, []),
        "has_intel_pro": bool(intel_pro),
    }


def _load_user_alerts(store: TraceMoneyStore, uid: str) -> dict[str, list[dict[str, Any]]]:
    docs = (
        store.db.collection("tm_user_alert_flags")
        .where("user_id", "==", uid)
        .stream()
    )
    by_instrument: dict[str, list[dict[str, Any]]] = {}
    for doc in docs:
        data = doc.to_dict() or {}
        instrument_id = str(data.get("instrument_id", "")).strip()
        flags = data.get("flags") or []
        if not instrument_id or not flags:
            continue
        by_instrument.setdefault(instrument_id, []).extend(flags)
    return by_instrument


def _pulse_headline(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Heuristic pulse summary — no LLM needed for v1."""
    if not rows:
        return {
            "headline": "Your watchlist is empty",
            "subtitle": "Track a stock from any detail page to start getting daily briefs.",
            "stats": {},
        }
    movers_up = [r for r in rows if (r.get("day_change_pct") or 0) > 0]
    movers_down = [r for r in rows if (r.get("day_change_pct") or 0) < 0]
    scored = [r for r in rows if r.get("scores", {}).get("overall") is not None]
    avg_overall = (
        round(sum(r["scores"]["overall"] for r in scored) / len(scored), 1)
        if scored else None
    )
    alert_count = sum(len(r.get("alerts", [])) for r in rows)

    if movers_up and not movers_down:
        mood = "Green across the board"
    elif movers_down and not movers_up:
        mood = "Red across the board"
    elif len(movers_up) > len(movers_down):
        mood = "Mostly green"
    elif len(movers_down) > len(movers_up):
        mood = "Mostly red"
    else:
        mood = "Mixed tape"

    pieces = []
    if alert_count:
        pieces.append(f"{alert_count} alert{'s' if alert_count != 1 else ''} active")
    if avg_overall is not None:
        pieces.append(f"avg overall score {avg_overall}")
    pieces.append(f"{len(movers_up)} up, {len(movers_down)} down")
    subtitle = " · ".join(pieces)

    return {
        "headline": mood,
        "subtitle": subtitle,
        "stats": {
            "count": len(rows),
            "movers_up": len(movers_up),
            "movers_down": len(movers_down),
            "avg_overall_score": avg_overall,
            "alert_count": alert_count,
        },
    }


def build_watchlist_view(
    store: TraceMoneyStore,
    uid: str,
    tracked_stocks: list[str],
    *,
    active_universes: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Produce the materialized payload for `tm_watchlist_views/{uid}`.

    Does not write — caller is responsible for calling
    `store.save_watchlist_view(uid, payload)`.
    """
    active_universes = active_universes or _active_universe_cache(store)
    alerts_by_instrument = _load_user_alerts(store, uid)

    rows: list[dict[str, Any]] = []
    for instrument_id in (tracked_stocks or [])[:WATCHLIST_ROW_CAP]:
        row = _row_for_instrument(store, instrument_id, active_universes, alerts_by_instrument)
        if row:
            rows.append(row)

    # Deterministic default order: biggest absolute day-change first.
    rows.sort(key=lambda r: abs(r.get("day_change_pct") or 0), reverse=True)

    return {
        "uid": uid,
        "tracked_count": len(rows),
        "tracked_ids": [r["instrument_id"] for r in rows],
        "rows": rows,
        "pulse": _pulse_headline(rows),
        "built_at": datetime.now(timezone.utc).isoformat(),
    }
