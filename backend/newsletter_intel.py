"""Assemble the free daily market newsletter from post-close snapshots."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from backend.email_content import clean_optional_email_text
from backend.instrument_universe import get_default_universe_id
from backend.open_email_intel import anomaly_tape_line, load_daily_anomalies, sector_summary_from_anomalies
from backend.premarket_email import macro_phase_line
from backend.stock_intelligence import generate_market_brief
from backend.storage import HOME_MACRO_IDS, TraceMoneyStore

INDEX_LABELS = {
    "US_IDX_SPX": "S&P 500",
    "US_IDX_NDX": "Nasdaq",
}
MACRO_LABELS = {
    "US_MAC_GOLD": "Gold",
    "US_MAC_SILVER": "Silver",
    "US_MAC_OIL": "Oil",
    "US_MAC_VIX": "VIX",
}
NEWSLETTER_SOURCES = frozenset({"homepage_modal", "homepage"})

_MARKET_TZ = {"US": "America/New_York", "IN": "Asia/Kolkata"}


def market_today_key(market: str) -> str:
    tz_name = _MARKET_TZ.get(str(market or "US").upper(), "America/New_York")
    return datetime.now(ZoneInfo(tz_name)).date().isoformat()


def previous_trading_date_key(market: str) -> str:
    tz_name = _MARKET_TZ.get(str(market or "US").upper(), "America/New_York")
    day = datetime.now(ZoneInfo(tz_name)).date() - timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day.isoformat()


def _quote_change_pct(doc: dict[str, Any] | None) -> float | None:
    quote = (doc or {}).get("quote") or {}
    try:
        value = float(quote.get("day_change_pct"))
    except (TypeError, ValueError):
        return None
    return value


def _quote_price(doc: dict[str, Any] | None) -> float | None:
    quote = (doc or {}).get("quote") or {}
    try:
        value = float(quote.get("current"))
    except (TypeError, ValueError):
        return None
    return value


def _split_movers(anomalies: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    gainers = sorted(
        [row for row in anomalies if float(row.get("day_change_pct") or 0) >= 0],
        key=lambda row: float(row.get("day_change_pct") or 0),
        reverse=True,
    )[:5]
    losers = sorted(
        [row for row in anomalies if float(row.get("day_change_pct") or 0) < 0],
        key=lambda row: float(row.get("day_change_pct") or 0),
    )[:5]
    return gainers, losers


def _stock_headlines(anomalies: list[dict[str, Any]], *, limit: int = 8) -> list[str]:
    out: list[str] = []
    for row in anomalies:
        line = anomaly_tape_line(row).strip()
        ticker = str(row.get("ticker") or "").strip().upper()
        if not line or not ticker:
            continue
        out.append(f"{ticker}: {line}")
        if len(out) >= limit:
            break
    return out


def _fallback_brief(
    *,
    market_phase_line: str | None,
    market_context: dict[str, Any] | None,
    gainers: list[dict[str, Any]],
    losers: list[dict[str, Any]],
) -> dict[str, str]:
    today_brief = clean_optional_email_text((market_context or {}).get("today_brief"))
    week_brief = clean_optional_email_text((market_context or {}).get("week_brief"))
    top = gainers[0] if gainers else (losers[0] if losers else None)
    top_line = ""
    if top:
        ticker = str(top.get("ticker") or "").strip().upper()
        move = float(top.get("day_change_pct") or 0)
        story = anomaly_tape_line(top).strip()
        top_line = f"{ticker} led the tape ({move:+.1f}%)."
        if story:
            top_line += f" {story}"

    overview_parts = [part for part in (today_brief, top_line) if part]
    overview = "\n\n".join(overview_parts)
    global_forces = clean_optional_email_text(market_phase_line) or week_brief
    outlook = clean_optional_email_text((market_context or {}).get("what_to_watch"))
    return {
        "overview": overview,
        "global_forces": global_forces,
        "outlook": outlook,
    }


def has_sendable_newsletter_snapshot(
    anomalies_doc: dict[str, Any] | None,
    *,
    market: str,
    mode: str = "morning",
) -> bool:
    if not anomalies_doc:
        return False
    anomalies = [row for row in list(anomalies_doc.get("anomalies") or []) if isinstance(row, dict)]
    if not anomalies:
        return False

    session_date = str(anomalies_doc.get("date") or "").strip()
    if not session_date:
        return False

    today = market_today_key(market)
    if mode == "close":
        return session_date == today

    expected = previous_trading_date_key(market)
    return session_date == expected or (session_date < today and session_date <= expected)


def build_newsletter_snapshot(
    store: TraceMoneyStore,
    *,
    market: str = "US",
    as_of_date: str | None = None,
    allow_stale: bool = False,
) -> dict[str, Any] | None:
    market = str(market or "US").upper()
    anomalies_doc = load_daily_anomalies(store, market)
    if not anomalies_doc:
        return None

    session_date = str(anomalies_doc.get("date") or "").strip() or market_today_key(market)
    target_date = str(as_of_date or session_date).strip()
    if target_date != session_date and not allow_stale:
        return {
            "error": f"latest anomalies are for {session_date}, not {target_date}",
            "session_date": session_date,
            "requested_date": target_date,
        }

    anomalies = [row for row in list(anomalies_doc.get("anomalies") or []) if isinstance(row, dict)]
    gainers, losers = _split_movers(anomalies)
    sector_summary = sector_summary_from_anomalies(anomalies)

    index_ids = [iid for iid in INDEX_LABELS if market == "US" or iid.startswith(f"{market}_")]
    macro_ids = [iid for iid in MACRO_LABELS if iid in HOME_MACRO_IDS]
    price_docs = store.get_latest_prices(index_ids + macro_ids)

    indices: list[dict[str, Any]] = []
    for iid, label in INDEX_LABELS.items():
        doc = price_docs.get(iid) or {}
        change = _quote_change_pct(doc)
        if change is None:
            continue
        indices.append({
            "label": label,
            "ticker": iid,
            "day_change_pct": round(change, 2),
            "price": _quote_price(doc),
        })

    global_cues: dict[str, Any] = {}
    for iid, label in MACRO_LABELS.items():
        doc = price_docs.get(iid) or {}
        change = _quote_change_pct(doc)
        if change is None:
            continue
        global_cues[label.lower()] = {
            "day_change_pct": round(change, 2),
            "price": _quote_price(doc),
        }

    universe_id = get_default_universe_id(market) or ""
    market_context = store.get_market_context_doc(market, universe_id) if universe_id else None
    phase_line = macro_phase_line(store, market)

    up_count = int(anomalies_doc.get("up_count") or 0)
    down_count = int(anomalies_doc.get("down_count") or 0)
    sentiment = {
        "market_phase": phase_line,
        "breadth": f"{up_count} advancers vs {down_count} decliners among top movers",
        "tone": str((market_context or {}).get("today_label") or "").strip() or None,
    }

    top_movers = {
        "gainers": [
            {
                "ticker": str(row.get("ticker") or "").upper(),
                "day_change_pct": float(row.get("day_change_pct") or 0),
                "sector": str(row.get("sector") or "").strip() or None,
            }
            for row in gainers
        ],
        "losers": [
            {
                "ticker": str(row.get("ticker") or "").upper(),
                "day_change_pct": float(row.get("day_change_pct") or 0),
                "sector": str(row.get("sector") or "").strip() or None,
            }
            for row in losers
        ],
    }

    brief = generate_market_brief(
        market,
        indices,
        global_cues,
        top_movers,
        sentiment,
        _stock_headlines(anomalies),
        store=store,
    ) or _fallback_brief(
        market_phase_line=phase_line,
        market_context=market_context,
        gainers=gainers,
        losers=losers,
    )

    return {
        "market": market,
        "session_date": session_date,
        "generated_at": str(anomalies_doc.get("generated_at") or datetime.now(timezone.utc).isoformat()),
        "phase_line": phase_line,
        "indices": indices,
        "global_cues": global_cues,
        "gainers": gainers,
        "losers": losers,
        "sector_summary": sector_summary,
        "brief": brief,
        "anomaly_count": len(anomalies),
    }


def load_newsletter_subscribers(store: TraceMoneyStore) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for doc in store.db.collection("newsletter_signups").stream():
        data = doc.to_dict() or {}
        source = str(data.get("source") or "").strip()
        if source not in NEWSLETTER_SOURCES:
            continue
        email = str(data.get("email") or doc.id).strip().lower()
        if not email:
            continue
        rows.append({
            "email": email,
            "uid": str(data.get("uid") or "").strip() or None,
            "source": source,
            "created_at": str(data.get("created_at") or "").strip() or None,
        })
    rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    return rows
