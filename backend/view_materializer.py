"""Materialize low-fidelity dashboard and instrument views."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _round(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def _series_from_points(points: list[dict[str, Any]], *, desired: int = 6) -> list[float]:
    values = [
        float(point.get("quote", {}).get("current", 0.0))
        for point in sorted(points, key=lambda item: str(item.get("captured_at", "")))
        if float(point.get("quote", {}).get("current", 0.0)) > 0
    ]
    if not values:
        values = [0.0]
    while len(values) < desired:
        values.insert(0, values[0])
    return [_round(value) for value in values[-desired:]]


def _provider_fundamentals(latest_price: dict[str, Any]) -> dict[str, Any]:
    fundamentals = latest_price.get("fundamentals", {})
    if not isinstance(fundamentals, dict):
        return {
            "market_cap": 0,
            "pe_ttm": 0,
            "dividend_yield": 0,
            "annual_dividend": 0,
            "week_52_low": 0,
            "week_52_high": 0,
        }
    return {
        "market_cap": _round(float(fundamentals.get("market_cap", 0.0)), 2),
        "pe_ttm": _round(float(fundamentals.get("pe_ttm", 0.0)), 2),
        "dividend_yield": float(fundamentals.get("dividend_yield", 0.0) or 0.0),
        "annual_dividend": _round(float(fundamentals.get("annual_dividend", 0.0)), 2),
        "week_52_low": _round(float(fundamentals.get("week_52_low", 0.0)), 2),
        "week_52_high": _round(float(fundamentals.get("week_52_high", 0.0)), 2),
    }


def _sentiment_score_from_change(day_change_pct: float) -> int:
    score = 50 + (day_change_pct * 8)
    return max(5, min(95, int(round(score))))


def _sentiment_label(score: int) -> str:
    if score >= 75:
        return "bullish"
    if score >= 60:
        return "constructive"
    if score >= 45:
        return "mixed"
    if score >= 30:
        return "cautious"
    return "bearish"


def _momentum_label(day_change_pct: float) -> str:
    if day_change_pct >= 1.5:
        return "Bullish Momentum"
    if day_change_pct <= -1.5:
        return "Weak Momentum"
    return "Balanced Momentum"


def _rsi_from_change(day_change_pct: float) -> float:
    return max(20.0, min(85.0, 50.0 + (day_change_pct * 10.0)))


def _normalize_text(value: str) -> str:
    return " ".join(str(value).lower().split()).strip().rstrip(".")


def _dedupe_points(*values: str, limit: int = 4) -> list[str]:
    kept: list[str] = []
    normalized_kept: list[str] = []
    for raw in values:
        value = " ".join(str(raw).split()).strip()
        if not value:
            continue
        normalized = _normalize_text(value)
        if not normalized:
            continue
        if any(
            normalized == prior
            or normalized in prior
            or prior in normalized
            for prior in normalized_kept
        ):
            continue
        kept.append(value)
        normalized_kept.append(normalized)
        if len(kept) >= limit:
            break
    return kept


def _is_compact_point(value: str) -> bool:
    words = [part for part in str(value).split() if part]
    if len(words) <= 14:
        return True
    if any(char.isdigit() for char in str(value)) and len(words) <= 18:
        return True
    return False


def _dashboard_row(instrument: dict[str, Any], latest_price: dict[str, Any]) -> dict[str, Any]:
    quote = latest_price.get("quote", {})
    day_change_pct = float(quote.get("day_change_pct", 0.0))
    return {
        "instrument_id": instrument["instrument_id"],
        "ticker": instrument["ticker"],
        "name": instrument["name"],
        "sector": instrument.get("sector", ""),
        "price": _round(float(quote.get("current", 0.0))),
        "day_change_pct": _round(day_change_pct),
        "ai_sentiment_score": _sentiment_score_from_change(day_change_pct),
        "news_count": 0,
        "source_count": 0,
        "sector_score": 50,
        "sector_brief": "",
    }


def _synthesize_hero_from_intelligence(
    intelligence_rows: list[dict[str, Any]],
    sector_context: list[dict[str, Any]],
    market_label: str,
    market_score: int,
) -> str:
    """Build a market-level hero from stock intelligence + sector context.

    Instead of dumping a single stock doc's debug text, synthesize across
    all available signals to produce a brief that reads like a market note.
    """
    # Sector-level synthesis
    sector_parts: list[str] = []
    leading: list[str] = []
    lagging: list[str] = []
    for doc in (sector_context or [])[:5]:
        score = int(doc.get("today_score", 50))
        label = str(doc.get("sector_label", "")).strip()
        brief = str(doc.get("today_brief", "")).strip()
        if not label:
            continue
        if score >= 60:
            leading.append(label)
        elif score <= 40:
            lagging.append(label)
        if brief and len(sector_parts) < 2:
            sector_parts.append(brief)

    # Stock-level top movers
    bullish_count = sum(1 for doc in intelligence_rows if str(doc.get("overall_label", "")) in ("bullish", "constructive"))
    bearish_count = sum(1 for doc in intelligence_rows if str(doc.get("overall_label", "")) in ("bearish", "cautious"))
    total = len(intelligence_rows)

    # Build the brief
    tone = market_label.lower()
    parts: list[str] = []
    if leading and lagging:
        parts.append(
            f"Market tone is {tone} today, led by {', '.join(leading[:2])}."
            f" {', '.join(lagging[:2])} {'are' if len(lagging) > 1 else 'is'} softer."
        )
    elif leading:
        parts.append(f"Market tone is {tone} today, led by {', '.join(leading[:2])}.")
    elif lagging:
        parts.append(f"Market tone is {tone} today. {', '.join(lagging[:2])} {'are' if len(lagging) > 1 else 'is'} under pressure.")
    else:
        parts.append(f"Market tone is {tone} today.")

    if sector_parts:
        parts.append(sector_parts[0])
    elif total > 0:
        parts.append(f"News coverage is active across {total} tracked names, with {bullish_count} leaning positive and {bearish_count} cautious.")

    return " ".join(parts).strip()


_MACRO_TILE_ORDER_US = (
    "US_IDX_SPX", "US_IDX_NDX", "US_MAC_GOLD",
    "US_MAC_SILVER", "US_MAC_OIL", "US_MAC_VIX",
)
_MACRO_TILE_ORDER_IN = (
    "IN_IDX_NIFTY50", "IN_IDX_BANKNIFTY", "IN_MAC_GOLD",
    "IN_MAC_SILVER", "IN_MAC_OIL", "IN_IDX_VIX",
)
_MACRO_TILE_ORDER = _MACRO_TILE_ORDER_US  # kept for any external callers

_MACRO_TILE_SUBLABELS = {
    "US_IDX_SPX":    "^GSPC",
    "US_IDX_NDX":    "^IXIC",
    "US_MAC_GOLD":   "GC=F",
    "US_MAC_SILVER": "SI=F",
    "US_MAC_OIL":    "CL=F",
    "US_MAC_VIX":    "^VIX",
    # India
    "IN_IDX_NIFTY50":  "^NSEI",
    "IN_IDX_BANKNIFTY": "^NSEBANK",
    "IN_MAC_GOLD":   "GC=F",
    "IN_MAC_SILVER": "SI=F",
    "IN_MAC_OIL":    "CL=F",
    "IN_IDX_VIX":   "^INDIAVIX",
}


def _directional_series(current: float, previous_close: float, length: int = 6) -> list[float]:
    """Synthesize a monotonic sparkline from previous_close → current so the
    tile's trend line reflects today's direction when we don't yet have enough
    intraday history points. Adds a tiny zig-zag to keep the line readable."""
    if length < 2:
        return [_round(current)]
    start = previous_close if previous_close and previous_close > 0 else current
    if start <= 0:
        start = current if current > 0 else 1.0
    step = (current - start) / (length - 1)
    wobble = abs(step) * 0.12
    points: list[float] = []
    for i in range(length):
        base = start + step * i
        offset = wobble if i % 2 else -wobble
        # don't wobble the endpoints
        if i == 0 or i == length - 1:
            offset = 0.0
        points.append(_round(base + offset, 4))
    return points


def _build_market_tiles(
    instruments: list[dict[str, Any]],
    latest_prices: dict[str, dict[str, Any]],
    price_history: dict[str, list[dict[str, Any]]],
    macro_instruments: list[dict[str, Any]],
    macro_prices: dict[str, dict[str, Any]],
    macro_history: dict[str, list[dict[str, Any]]],
    rows: list[dict[str, Any]],
    sector_tiles_input: list[dict[str, Any]] | None = None,
    market: str = "US",
) -> list[dict[str, Any]]:
    """Compose the Market & Sectors strip: indices + macro cues + scraped sector tiles.

    Indices and macros come from the dedicated macro universe (real yfinance
    prices). Sector tiles are pre-computed by the caller (e.g. scraped from
    Finviz or NSE) - this function just renders them with a directional sparkline.
    """
    tiles: list[dict[str, Any]] = []
    tile_order = _MACRO_TILE_ORDER_IN if market.upper() == "IN" else _MACRO_TILE_ORDER_US

    # Macro tiles in deterministic order
    for instrument_id in tile_order:
        price = macro_prices.get(instrument_id)
        if not price:
            continue
        instrument = next(
            (inst for inst in macro_instruments if inst["instrument_id"] == instrument_id),
            None,
        )
        if instrument is None:
            continue
        quote = price.get("quote", {})
        current = float(quote.get("current", 0.0))
        previous_close = float(quote.get("previous_close", 0.0) or 0.0)
        change_pct = float(quote.get("day_change_pct", 0.0))
        series = _series_from_points(macro_history.get(instrument_id, []))
        if len(set(series)) <= 1:
            series = _directional_series(current, previous_close)
        tile_kind = "index" if "_IDX_" in instrument_id else "macro"
        tiles.append({
            "id": instrument_id,
            "type": tile_kind,
            "label": instrument.get("name", instrument.get("ticker", "")),
            "sublabel": _MACRO_TILE_SUBLABELS.get(instrument_id, instrument.get("ticker", "")),
            "value": _round(current),
            "change_pct": _round(change_pct),
            "series": series,
        })

    for sector_tile in sector_tiles_input or []:
        label = str(sector_tile.get("label", "")).strip()
        if not label:
            continue
        change_pct = float(sector_tile.get("change_pct", 0.0))
        series = _directional_series(100.0 + change_pct, 100.0)
        tiles.append({
            "id": f"sector_{label.lower()}",
            "type": "sector",
            "label": label,
            "sublabel": "",
            "value": _round(100.0 + change_pct, 2),
            "change_pct": _round(change_pct),
            "series": series,
        })

    return tiles


def build_dashboard_view(
    market: str,
    universe_id: str,
    instruments: list[dict[str, Any]],
    latest_prices: dict[str, dict[str, Any]],
    price_history: dict[str, list[dict[str, Any]]],
    stock_intelligence: dict[str, dict[str, Any]] | None = None,
    market_context: dict[str, Any] | None = None,
    sector_context_docs: list[dict[str, Any]] | None = None,
    macro_instruments: list[dict[str, Any]] | None = None,
    macro_prices: dict[str, dict[str, Any]] | None = None,
    macro_history: dict[str, list[dict[str, Any]]] | None = None,
    sector_tiles_input: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    stock_intelligence = stock_intelligence or {}
    market_context = market_context or {}
    sector_context_docs = sector_context_docs or []
    market_context_payload = market_context if str(market_context.get("today_brief", "")).strip() else None
    sector_context_payload = [
        doc for doc in sector_context_docs
        if str(doc.get("today_brief", "")).strip()
    ]
    sector_context_by_label = {
        str(doc.get("sector_label", "")).strip().lower(): doc
        for doc in sector_context_payload
        if str(doc.get("sector_label", "")).strip()
    }
    rows = [
        _dashboard_row(instrument, latest_prices[instrument["instrument_id"]])
        for instrument in instruments
        if instrument["instrument_id"] in latest_prices
    ]
    for row in rows:
        intelligence = stock_intelligence.get(row["instrument_id"])
        sector_doc = sector_context_by_label.get(str(row.get("sector", "")).strip().lower())
        if intelligence:
            row["ai_sentiment_score"] = int(intelligence.get("overall_score", row["ai_sentiment_score"]))
            row["news_count"] = int(intelligence.get("news_count", row["news_count"]))
            row["source_count"] = int(intelligence.get("source_count", row["source_count"]))
        if sector_doc:
            row["sector_score"] = int(sector_doc.get("today_score", row["sector_score"]))
            row["sector_brief"] = str(sector_doc.get("today_brief", "")).strip()

    average_score = int(round(sum(row["ai_sentiment_score"] for row in rows) / len(rows))) if rows else 50
    market_label = (
        "Strong Bullish" if average_score >= 80
        else "Bullish" if average_score >= 65
        else "Balanced" if average_score >= 45
        else "Cautious"
    )

    sector_map: dict[str, list[float]] = {}
    instrument_by_id = {instrument["instrument_id"]: instrument for instrument in instruments}
    for row in rows:
        sector = instrument_by_id[row["instrument_id"]]["sector"]
        sector_map.setdefault(sector, []).append(float(row["day_change_pct"]))

    sector_flows = []
    if sector_context_payload:
        for doc in sector_context_payload[:3]:
            score = int(doc.get("today_score", 50))
            flow_pct = _round((score - 50) / 10, 2)
            sector_flows.append({
                "sector": doc.get("sector_label", doc.get("sector_id", "")),
                "flow_pct": flow_pct,
                "direction": "up" if flow_pct > 0 else "down" if flow_pct < 0 else "flat",
            })
    else:
        for sector, changes in sector_map.items():
            flow_pct = _round(sum(changes) / len(changes), 2)
            direction = "up" if flow_pct > 0 else "down" if flow_pct < 0 else "flat"
            sector_flows.append({
                "sector": sector,
                "flow_pct": flow_pct,
                "direction": direction,
            })
        sector_flows.sort(key=lambda item: abs(float(item["flow_pct"])), reverse=True)

    sorted_rows = sorted(rows, key=lambda row: row["day_change_pct"], reverse=True)
    leader = sorted_rows[0] if sorted_rows else None
    laggard = sorted(sorted_rows, key=lambda row: row["day_change_pct"])[0] if sorted_rows else None
    intelligence_rows = sorted(
        [doc for doc in stock_intelligence.values() if int(doc.get("news_count", 0)) > 0],
        key=lambda item: (int(item.get("news_count", 0)), int(item.get("overall_score", 0))),
        reverse=True,
    )
    if market_context_payload:
        hero_title = "Market Context Briefing"
        hero_body = str(market_context_payload.get("today_brief", "")).strip()
        if market_context_payload.get("week_brief"):
            hero_body = f"{hero_body} {str(market_context_payload.get('week_brief', '')).strip()}".strip()
        verified_source_count = int(market_context_payload.get("article_count", len(rows)))
    elif intelligence_rows:
        hero_title = "Market Intelligence Briefing"
        hero_body = _synthesize_hero_from_intelligence(intelligence_rows, sector_context_payload, market_label, average_score)
        verified_source_count = sum(int(doc.get("source_count", 0)) for doc in intelligence_rows[:3])
    else:
        hero_title = "Price Snapshot Briefing"
        hero_body = f"Low-fidelity dashboard preview for {universe_id}. Prices are coming from scheduled Yahoo Finance snapshots."
        if leader and laggard:
            hero_body += (
                f" {leader['ticker']} is leading the current move at "
                f"{leader['day_change_pct']:+.2f}%, while {laggard['ticker']} is the softest name at "
                f"{laggard['day_change_pct']:+.2f}%."
            )
        verified_source_count = len(rows)

    market_tiles = _build_market_tiles(
        instruments,
        latest_prices,
        price_history,
        macro_instruments or [],
        macro_prices or {},
        macro_history or {},
        rows,
        sector_tiles_input=sector_tiles_input,
        market=market,
    )

    # Back-compat: keep `macro_cards` populated from the first few index/macro
    # tiles so older consumers still work. New consumers should read
    # `market_tiles` instead - it carries type + sublabel + sector rollups.
    macro_cards = [
        {
            "id": tile["id"],
            "label": tile["label"],
            "value": tile["value"],
            "day_change_pct": tile["change_pct"],
            "series": tile["series"],
        }
        for tile in market_tiles
        if tile["type"] in ("index", "macro")
    ][:3]

    return {
        "market": market,
        "generated_at": _utc_now(),
        "universe_id": universe_id,
        "macro_cards": macro_cards,
        "market_tiles": market_tiles,
        "market_sentiment": {
            "label": market_label,
            "score": average_score,
        },
        "hero_brief": {
            "title": hero_title,
            "body": hero_body.strip(),
            "verified_source_count": verified_source_count,
            "updated_at": _utc_now(),
        },
        "market_context": market_context_payload,
        "sector_context": sector_context_payload,
        "sector_flows": sector_flows[:3],
        "watchlist_rows": rows,
        "gainers": [row for row in sorted_rows if row["day_change_pct"] >= 0][:3],
        "losers": [row for row in sorted(rows, key=lambda row: row["day_change_pct"]) if row["day_change_pct"] < 0][:3],
    }


def build_instrument_view(
    instrument: dict[str, Any],
    latest_price: dict[str, Any],
    related_rows: list[dict[str, Any]],
    price_points: list[dict[str, Any]],
    stock_intelligence: dict[str, Any] | None = None,
    market_context: dict[str, Any] | None = None,
    sector_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    stock_intelligence = stock_intelligence or {}
    market_context = market_context or {}
    sector_context = sector_context or {}
    market_context_payload = market_context if str(market_context.get("today_brief", "")).strip() else None
    sector_context_payload = sector_context if str(sector_context.get("today_brief", "")).strip() else None
    quote = latest_price.get("quote", {})
    day_change_pct = float(quote.get("day_change_pct", 0.0))
    score = _sentiment_score_from_change(day_change_pct)
    label = _sentiment_label(score)
    generated_at = _utc_now()

    timeline = []
    for point in sorted(price_points, key=lambda item: str(item.get("captured_at", "")), reverse=True)[:6]:
        point_quote = point.get("quote", {})
        captured_at = str(point.get("captured_at") or generated_at)
        point_change = float(point_quote.get("day_change_pct", 0.0))
        point_label = _sentiment_label(_sentiment_score_from_change(point_change))
        session_phase = str(point.get("session_phase", "manual")).replace("_", " ")
        timeline.append({
            "timestamp": captured_at,
            "title": f"{session_phase.title()} price snapshot captured",
            "summary": (
                f"{instrument['ticker']} was recorded at {float(point_quote.get('current', 0.0)):.2f} "
                f"with a day change of {point_change:+.2f}%."
            ),
            "sentiment_label": point_label,
            "source_name": "Scheduled market snapshot",
            "article_url": "#",
        })

    related_tickers = []
    for row in related_rows[:3]:
        related_tickers.append({
            "instrument_id": row["instrument_id"],
            "ticker": row["ticker"],
            "name": row["name"],
            "price": row["price"],
            "day_change_pct": row["day_change_pct"],
        })

    price_series = _series_from_points(price_points)
    mention_volume_series = list(stock_intelligence.get("mention_volume_series", [0 for _ in price_series]))
    while len(mention_volume_series) < len(price_series):
        mention_volume_series.insert(0, 0)
    mention_volume_series = mention_volume_series[-len(price_series):]

    intelligence_summary = {
        "headline": f"{instrument['ticker']} is in a price-only preview state.",
        "body": (
            "This view is currently backed by scheduled quote snapshots and the instrument master only. "
            "Article ingestion, enrichment, and stock intelligence will replace this placeholder summary."
        ),
        "catalyst": "Scheduled price snapshot",
        "risk": "News intelligence not wired yet",
        "key_points": [
            f"Latest captured move is {day_change_pct:+.2f}%.",
            "Timeline entries below are generated from stored snapshot history.",
            "Fundamental cards are placeholders until the fundamentals sync lands.",
        ],
    }
    sentiment_breakdown = {
        "overall_label": label,
        "overall_score": score,
        "lanes": [
            {
                "label": "Price Signal",
                "positive_pct": score,
            }
        ],
    }
    if stock_intelligence:
        stock_key_points = [
            str(point).strip()
            for point in stock_intelligence.get("key_points", [])
            if str(point).strip()
        ]
        intelligence_summary = {
            "headline": str(stock_intelligence.get("headline", intelligence_summary["headline"])),
            "body": str(stock_intelligence.get("today_brief", stock_intelligence.get("body", intelligence_summary["body"]))),
            "catalyst": str(stock_intelligence.get("catalyst", "")) or intelligence_summary["catalyst"],
            "risk": str(stock_intelligence.get("risk", "")) or intelligence_summary["risk"],
            "key_points": _dedupe_points(
                *stock_key_points,
                limit=4,
            ) or intelligence_summary["key_points"],
        }
        sentiment_breakdown = {
            "overall_label": str(stock_intelligence.get("overall_label", label)),
            "overall_score": int(stock_intelligence.get("overall_score", score)),
            "lanes": list(stock_intelligence.get("lanes", sentiment_breakdown["lanes"])),
            "sources_breakdown": list(stock_intelligence.get("sources_breakdown", [])),
        }
        if stock_intelligence.get("timeline"):
            timeline = list(stock_intelligence["timeline"])
        if stock_intelligence.get("related_instrument_ids"):
            related_order = [item for item in stock_intelligence["related_instrument_ids"] if isinstance(item, str)]
            related_map = {row["instrument_id"]: row for row in related_tickers}
            ordered = [related_map[instrument_id] for instrument_id in related_order if instrument_id in related_map]
            ordered.extend([row for row in related_tickers if row["instrument_id"] not in related_order])
            related_tickers = ordered[:3]
        intelligence_summary["key_points"] = _dedupe_points(
            *intelligence_summary["key_points"],
            limit=4,
        )
        body_norm = _normalize_text(intelligence_summary["body"])
        headline_norm = _normalize_text(intelligence_summary["headline"])
        intelligence_summary["key_points"] = [
            point
            for point in intelligence_summary["key_points"]
            if _normalize_text(point) not in {body_norm, headline_norm}
            and _normalize_text(point) not in body_norm
            and _is_compact_point(point)
        ][:4]

    return {
        "instrument_id": instrument["instrument_id"],
        "market": instrument["market"],
        "generated_at": generated_at,
        "instrument": {
            "ticker": instrument["ticker"],
            "name": instrument["name"],
            "exchange": instrument["exchange"],
            "sector": instrument["sector"],
            "industry": instrument["industry"],
            "logo_url": instrument.get("logo_url", ""),
            "index_memberships": instrument.get("index_memberships", []),
        },
        "price_snapshot": {
            "current": _round(float(quote.get("current", 0.0))),
            "day_change_abs": _round(float(quote.get("day_change_abs", 0.0))),
            "day_change_pct": _round(day_change_pct),
            "captured_at": latest_price.get("captured_at", generated_at),
        },
        "fundamentals": _provider_fundamentals(latest_price),
        "intelligence_summary": intelligence_summary,
        "market_context": market_context_payload,
        "sector_context": sector_context_payload,
        "sentiment_breakdown": sentiment_breakdown,
        "trend_convergence": {
            "range": "1W",
            "price_series": price_series,
            "mention_volume_series": mention_volume_series,
        },
        "momentum_signal": {
            "label": _momentum_label(day_change_pct),
            "rsi_14": _round(_rsi_from_change(day_change_pct), 1),
            "score": score,
        },
        "analyst_consensus": latest_price.get("analyst_consensus") or None,
        "related_tickers": related_tickers,
        "timeline": timeline,
    }
