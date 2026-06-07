"""Build the Week in the Markets report from live app data."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.storage import TraceMoneyStore

INDEX_IDS = {
    "US": {
        "US_IDX_SPX": "S&P 500",
        "US_IDX_NDX": "Nasdaq",
    },
    "IN": {
        "IN_IDX_NIFTY50": "Nifty 50",
        "IN_IDX_BANKNIFTY": "Bank Nifty",
    },
}

PHASE_LABELS = {
    "trending_up": "trending up",
    "distribution": "in distribution",
    "correction": "in a correction",
    "recovery": "recovering",
    "range": "range-bound",
}

RISK_LABELS = {
    "on": "risk-on",
    "off": "risk-off",
    "mixed": "mixed",
}

REGIME_LABELS = {
    "expanding": "expanding",
    "momentum": "momentum",
    "topping": "topping",
    "choppy": "choppy",
    "breaking_down": "breaking down",
    "recovering": "recovering",
}


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _is_equity_instrument(instrument_id: str) -> bool:
    iid = str(instrument_id or "").upper()
    if "_IDX_" in iid or "_MAC_" in iid:
        return False
    return True


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        out = float(value)
        if out != out:  # NaN
            return None
        return out
    except (TypeError, ValueError):
        return None


def _close_series(history_window: list[dict[str, Any]] | None, latest_price: dict[str, Any] | None = None) -> list[tuple[str, float]]:
    """Extract oldest→newest (timestamp, close) pairs from price snapshots."""
    pairs: list[tuple[str, float]] = []
    for point in list(history_window or []):
        quote = point.get("quote") or {}
        close = _to_float(quote.get("current") or point.get("close"))
        ts = str(point.get("captured_at") or point.get("date") or point.get("timestamp") or "")
        if close is None or close <= 0:
            continue
        pairs.append((ts, close))
    latest = latest_price or {}
    latest_quote = latest.get("quote") or {}
    latest_close = _to_float(latest_quote.get("current") or latest.get("close") or latest.get("price"))
    latest_ts = str(latest.get("captured_at") or "")
    if latest_close is not None and latest_close > 0:
        pairs.append((latest_ts, latest_close))
    pairs.sort(key=lambda item: item[0])
    dedup: dict[str, float] = {}
    for ts, close in pairs:
        key = ts[:10] if ts else ts
        if key:
            dedup[key] = close
    return sorted(dedup.items(), key=lambda item: item[0])


def week_return_from_window(
    history_window: list[dict[str, Any]] | None,
    *,
    latest_price: dict[str, Any] | None = None,
    sessions_back: int = 5,
) -> float | None:
    """Return % change from ~one trading week ago using embedded daily history."""
    series = _close_series(history_window, latest_price)
    if len(series) < 2:
        return None
    latest = series[-1][1]
    idx = max(0, len(series) - 1 - max(1, sessions_back))
    if idx >= len(series) - 1:
        idx = 0
    base = series[idx][1]
    if base <= 0:
        return None
    return ((latest - base) / base) * 100.0


def _week_range_label(
    history_window: list[dict[str, Any]] | None,
    *,
    latest_price: dict[str, Any] | None = None,
    sessions_back: int = 5,
) -> str:
    series = _close_series(history_window, latest_price)
    if not series:
        return _today().isoformat()
    dates = [day for day, _close in series]
    if len(dates) < 2:
        return dates[-1][:10] if dates else _today().isoformat()
    start_idx = max(0, len(dates) - 1 - max(1, sessions_back))
    start = dates[start_idx][:10]
    end = dates[-1][:10]
    if start == end:
        return end
    return f"{start} – {end}"


def _sector_title(doc: dict[str, Any], slug: str) -> str:
    sector = str(doc.get("sector") or "").strip()
    if sector:
        return sector
    return slug.replace("_", " ").replace("-", " ").title()


def _compact(text: str, limit: int = 180) -> str:
    s = " ".join(str(text or "").split())
    if len(s) <= limit:
        return s
    head = s[: limit - 1]
    last_space = head.rfind(" ")
    trimmed = (head[:last_space] if last_space > 20 else head).strip()
    return f"{trimmed}…" if trimmed else s[:limit]


def _first_sentence(text: str, limit: int = 100) -> str:
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        return ""
    for sep in (". ", "! ", "? "):
        idx = cleaned.find(sep)
        if idx > 0:
            return _compact(cleaned[: idx + 1].strip(), limit)
    return _compact(cleaned, limit)


def _dedupe_sector_names(names: list[str], *, limit: int = 3) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in names:
        label = str(raw or "").strip()
        if not label or label.lower() == "macro":
            continue
        key = label.lower().replace("_", " ").replace("-", " ")
        if key in seen:
            continue
        seen.add(key)
        out.append(label)
        if len(out) >= limit:
            break
    return out


def _as_date(value: str) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _fetch_upcoming_earnings(store: TraceMoneyStore, market: str, *, days: int = 7, limit: int = 8) -> list[dict[str, Any]]:
    today = _today()
    end = today + timedelta(days=max(1, days))
    valid_tickers = {
        str(row.get("ticker") or "").strip().upper()
        for row in list_instruments(market)
        if str(row.get("ticker") or "").strip()
    }
    rows: list[dict[str, Any]] = []
    try:
        query = store.db.collection("tm_earnings_events").where("market", "==", market.upper()).stream()
        for doc in query:
            data = doc.to_dict() or {}
            ticker = str(data.get("ticker") or "").strip().upper()
            event_date = _as_date(str(data.get("event_date") or ""))
            if not ticker or ticker not in valid_tickers or not event_date:
                continue
            if not (today < event_date <= end):
                continue
            rows.append(
                {
                    "ticker": ticker,
                    "event_date": event_date.isoformat(),
                    "timing": str(data.get("timing") or data.get("report_time") or "").strip(),
                }
            )
    except Exception:
        return []
    rows.sort(key=lambda row: (row.get("event_date") or "", row.get("ticker") or ""))
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        ticker = str(row.get("ticker") or "")
        if ticker in seen:
            continue
        seen.add(ticker)
        deduped.append(row)
        if len(deduped) >= limit:
            break
    return deduped


def _intel_note(intel: dict[str, Any] | None) -> str:
    if not intel:
        return ""
    for key in ("headline", "thesis", "overview", "summary"):
        text = str(intel.get(key) or "").strip()
        if text:
            return _first_sentence(text, 72)
    return ""


def build_weekly_report(
    store: TraceMoneyStore,
    *,
    market: str = "US",
    sessions_back: int = 5,
    mover_limit: int = 5,
) -> dict[str, Any]:
    market = str(market or "US").upper()
    universe_id = store.get_active_price_universe(market) or store.get_active_universe(market)
    if not universe_id:
        raise ValueError(f"No active universe configured for {market}")

    instruments = [row for row in list_instruments(market, universe_id) if _is_equity_instrument(row["instrument_id"])]
    instrument_ids = [row["instrument_id"] for row in instruments]
    ticker_by_id = {row["instrument_id"]: str(row.get("ticker") or "").upper() for row in instruments}
    name_by_id = {row["instrument_id"]: str(row.get("name") or row.get("company_name") or "").strip() for row in instruments}

    latest_prices = store.get_latest_prices(instrument_ids + list(INDEX_IDS.get(market, {}).keys()))

    index_rows: list[dict[str, Any]] = []
    range_label = ""
    for iid, label in INDEX_IDS.get(market, {}).items():
        price_doc = latest_prices.get(iid) or {}
        window = list(price_doc.get("history_window") or [])
        if not range_label and window:
            range_label = _week_range_label(window, latest_price=price_doc, sessions_back=sessions_back)
        week_pct = week_return_from_window(window, latest_price=price_doc, sessions_back=sessions_back)
        if week_pct is None:
            continue
        quote = price_doc.get("quote") or {}
        index_rows.append(
            {
                "instrument_id": iid,
                "label": label,
                "week_change_pct": round(week_pct, 2),
                "current_price": _to_float(quote.get("current") or price_doc.get("close") or price_doc.get("price")),
            }
        )

    movers: list[dict[str, Any]] = []
    for iid in instrument_ids:
        price_doc = latest_prices.get(iid) or {}
        week_pct = week_return_from_window(
            price_doc.get("history_window"),
            latest_price=price_doc,
            sessions_back=sessions_back,
        )
        if week_pct is None:
            continue
        movers.append(
            {
                "instrument_id": iid,
                "ticker": ticker_by_id.get(iid, ""),
                "name": name_by_id.get(iid, ""),
                "week_change_pct": round(week_pct, 2),
                "logo_url": price_doc.get("logo_url"),
            }
        )

    gainers = sorted(movers, key=lambda row: row["week_change_pct"], reverse=True)[:mover_limit]
    losers = sorted(movers, key=lambda row: row["week_change_pct"])[:mover_limit]

    mover_ids = [row["instrument_id"] for row in (gainers + losers)]
    intel_by_id = store.get_stock_intelligence_docs_batch(market, universe_id, mover_ids)
    for bucket in (gainers, losers):
        for row in bucket:
            row["note"] = _intel_note(intel_by_id.get(row["instrument_id"]))

    sector_regimes = store.get_sector_regimes(market)
    macro = sector_regimes.get("macro") or {}
    macro_line = ""
    phase = str(macro.get("market_phase") or "")
    risk = str(macro.get("risk_appetite") or "")
    phase_label = PHASE_LABELS.get(phase, "")
    risk_label = RISK_LABELS.get(risk, "")
    if phase_label:
        macro_line = f"The market is {phase_label}"
        if risk_label:
            macro_line += f", {risk_label}"
        macro_line += "."

    sector_rows: list[dict[str, Any]] = []
    for slug, doc in sector_regimes.items():
        if slug == "macro":
            continue
        regime = str(doc.get("regime") or "").strip()
        if not regime:
            continue
        sector_rows.append(
            {
                "slug": slug,
                "title": _sector_title(doc, slug),
                "regime": regime,
                "regime_label": REGIME_LABELS.get(regime, regime.replace("_", " ")),
                "conviction": _to_float(doc.get("conviction")) or 0.0,
                "narrative": " ".join(str(doc.get("narrative") or "").split()),
                "leadership_stocks": list(doc.get("leadership_stocks") or [])[:3],
                "invalidators": list(doc.get("invalidators") or [])[:3],
            }
        )
    sector_rows.sort(key=lambda row: (-row["conviction"], row["title"]))
    sector_insights = sector_rows[:3]

    leadership = _dedupe_sector_names([str(item) for item in (macro.get("leadership") or [])])
    laggards = _dedupe_sector_names([str(item) for item in (macro.get("laggards") or [])])

    watch_items: list[str] = []
    rotation = " ".join(str(macro.get("rotation_signal") or "").split())
    if rotation:
        watch_items.append(rotation)
    if leadership or laggards:
        parts = []
        if leadership:
            parts.append(f"Leading: {', '.join(leadership)}")
        if laggards:
            parts.append(f"Soft: {', '.join(laggards)}")
        watch_items.append(" · ".join(parts))

    for sector in sector_rows[:1]:
        for invalidator in list(sector.get("invalidators") or [])[:1]:
            text = " ".join(str(invalidator or "").split())
            if text:
                watch_items.append(text)

    upcoming = _fetch_upcoming_earnings(store, market)
    for event in upcoming[:3]:
        ticker = str(event.get("ticker") or "").upper()
        event_date = str(event.get("event_date") or "")
        watch_items.append(f"{ticker} earnings · {event_date}")

    macro_narrative = str(macro.get("narrative") or "").strip()

    if not range_label:
        range_label = _today().isoformat()

    return {
        "market": market,
        "universe_id": universe_id,
        "week_label": range_label,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "macro_line": macro_line,
        "macro": {
            "market_phase": phase,
            "risk_appetite": risk,
            "narrative": macro_narrative,
            "leadership": leadership,
            "laggards": laggards,
            "rotation_signal": rotation,
        },
        "indices": index_rows,
        "gainers": gainers,
        "losers": losers,
        "sector_insights": sector_insights,
        "watch_items": watch_items[:4],
        "upcoming_earnings": upcoming,
    }
