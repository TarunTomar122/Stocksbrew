from __future__ import annotations

"""Build an earnings-only events feed: tm_market_events/{MARKET}__latest.

Reads post-earnings LLM reports from tm_earnings_intel/{MARKET}__*__latest and
writes a unified, urgency-ranked feed for /events and the homepage strip.

Price moves and Reddit buzz stay on the homepage (Anomalies + Reddit sections)
and /anomalies — this feed is earnings-only so those surfaces don't overlap.
"""

import argparse
from datetime import datetime, timezone
from typing import Any

from backend.storage import TraceMoneyStore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _parse_iso(value: str) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _latest_feed_fresh(store: TraceMoneyStore, market: str, max_age_hours: int) -> tuple[bool, dict[str, Any]]:
    if max_age_hours <= 0:
        return False, {}
    snap = store.db.collection("tm_market_events").document(f"{market}__latest").get()
    if not snap.exists:
        return False, {}
    data = snap.to_dict() or {}
    generated_at = _parse_iso(str(data.get("generated_at") or ""))
    if generated_at is None:
        return False, data
    age_hours = (datetime.now(timezone.utc) - generated_at).total_seconds() / 3600.0
    return age_hours < float(max_age_hours), {"age_hours": round(age_hours, 2), **data}


def _to_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _to_int(value: Any) -> int:
    f = _to_float(value)
    return int(round(f)) if f is not None else 0


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _clip(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _list_strings(value: Any, cap: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        s = _text(item)
        if s:
            out.append(s)
        if len(out) >= cap:
            break
    return out


# ── Source → normalized event mappers ────────────────────────────────────────


def _events_from_anomalies(market: str, doc: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not doc:
        return []
    events: list[dict[str, Any]] = []
    for row in doc.get("anomalies") or []:
        if not isinstance(row, dict):
            continue
        ticker = _text(row.get("ticker")).upper()
        if not ticker:
            continue
        instrument_id = _text(row.get("instrument_id")) or f"{market}_{ticker}"
        move = _to_float(row.get("day_change_pct"))
        if move is None:
            continue
        up = move >= 0
        direction = "positive" if up else "negative"
        sign = "+" if up else ""
        title = _text(row.get("headline")) or (
            f"{ticker} {'jumped' if up else 'fell'} {sign}{move:.1f}% today"
        )
        body = _text(row.get("today_brief")) or _text(row.get("thesis"))
        evidence: list[str] = [f"{sign}{move:.1f}% today"]
        catalyst = _text(row.get("catalyst"))
        if catalyst:
            evidence.append(catalyst)
        for kp in _list_strings(row.get("key_points"), 2):
            evidence.append(kp)
        # Bigger absolute move = more urgent. 4% ≈ 52, 10% ≈ 70, 20%+ ≈ 100.
        urgency = _clip(40 + abs(move) * 3, 40, 100)
        events.append(
            {
                "id": f"move__{instrument_id}",
                "kind": "large_move",
                "scope": "market",
                "market": market,
                "ticker": ticker,
                "instrument_id": instrument_id,
                "name": _text(row.get("name")),
                "sector": _text(row.get("sector")),
                "logo_url": _text(row.get("logo_url")) or None,
                "title": title,
                "body": body,
                "direction": direction,
                "urgency": round(urgency, 1),
                "evidence": evidence[:3],
                "day_change_pct": round(move, 2),
                "price": _to_float(row.get("price")),
                "score": _to_float(row.get("overall_score")),
                "source": "anomaly",
            }
        )
    return events


def _events_from_reddit(market: str, doc: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not doc:
        return []
    tickers_raw = doc.get("tickers")
    rows: list[dict[str, Any]] = []
    if isinstance(tickers_raw, list):
        rows = [r for r in tickers_raw if isinstance(r, dict)]
    elif isinstance(tickers_raw, dict):
        for ticker, payload in tickers_raw.items():
            if isinstance(payload, dict):
                merged = dict(payload)
                merged.setdefault("ticker", ticker)
                rows.append(merged)

    events: list[dict[str, Any]] = []
    for row in rows:
        ticker = _text(row.get("ticker")).upper()
        if not ticker:
            continue
        instrument_id = _text(row.get("instrument_id")) or f"{market}_{ticker}"
        mentions = _to_int(row.get("mention_count") or row.get("mentions"))
        if mentions <= 0:
            continue
        sentiment = _text(row.get("sentiment")).lower()
        if sentiment in {"bullish", "positive"}:
            direction = "positive"
        elif sentiment in {"bearish", "negative"}:
            direction = "negative"
        else:
            direction = "neutral"
        name = _text(row.get("company_name") or row.get("name"))
        summary = _text(row.get("summary") or row.get("context"))
        mood = {"positive": "bullish", "negative": "bearish"}.get(direction, "mixed")
        title = f"Reddit is {mood} on {ticker}" if name == "" else f"Reddit is {mood} on {name} ({ticker})"
        evidence = [f"{mentions} mentions"]
        for cat in _list_strings(row.get("catalysts"), 2):
            evidence.append(cat)
        # Buzz volume drives urgency, capped below price moves.
        urgency = _clip(28 + mentions * 2.5, 28, 90)
        events.append(
            {
                "id": f"buzz__{instrument_id}",
                "kind": "reddit_buzz",
                "scope": "market",
                "market": market,
                "ticker": ticker,
                "instrument_id": instrument_id,
                "name": name,
                "sector": _text(row.get("sector")),
                "logo_url": None,
                "title": title,
                "body": summary,
                "direction": direction,
                "urgency": round(urgency, 1),
                "evidence": evidence[:3],
                "reddit_mentions": mentions,
                "reddit_sentiment": sentiment,
                "source": "reddit",
            }
        )
    return events


def _events_from_earnings(market: str, store: TraceMoneyStore, max_events: int) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    by_ticker: dict[str, dict[str, Any]] = {}
    # Scan the per-ticker "__latest" pointers for this market.
    try:
        snaps = store.db.collection("tm_earnings_intel").stream()
    except Exception:  # noqa: BLE001 - feed must survive a missing collection
        return []
    for snap in snaps:
        doc_id = snap.id
        if not doc_id.endswith("__latest"):
            continue
        if not doc_id.startswith(f"{market}__"):
            continue
        data = snap.to_dict() or {}
        ticker = _text(data.get("ticker")).upper()
        instrument_id = _text(data.get("instrument_id"))
        if not ticker or not instrument_id:
            continue
        generated_at = _text(data.get("generated_at"))
        existing = by_ticker.get(ticker)
        if existing and _text(existing.get("generated_at")) >= generated_at:
            continue
        by_ticker[ticker] = data

    for data in by_ticker.values():
        ticker = _text(data.get("ticker")).upper()
        instrument_id = _text(data.get("instrument_id"))
        report = data.get("report") if isinstance(data.get("report"), dict) else {}
        title = _text(report.get("headline")) or f"{ticker} earnings update"
        body = _text(report.get("summary"))
        confidence = report.get("confidence") if isinstance(report.get("confidence"), dict) else {}
        conf_score = _to_float(confidence.get("score_0_100"))
        facts = report.get("facts") if isinstance(report.get("facts"), dict) else {}
        evidence: list[str] = []
        rve = _text(facts.get("reported_vs_expected"))
        if rve:
            evidence.append(rve)
        guidance = _text(facts.get("guidance_signal"))
        if guidance:
            evidence.append(guidance)
        reaction = _text(facts.get("price_reaction"))
        if reaction:
            evidence.append(reaction)
        # Lean on guidance/price-reaction wording for tone.
        blob = f"{guidance} {reaction} {body}".lower()
        if any(w in blob for w in ("beat", "raised", "above", "surge", "jump", "strong")):
            direction = "positive"
        elif any(w in blob for w in ("miss", "cut", "below", "drop", "fell", "weak")):
            direction = "negative"
        else:
            direction = "neutral"
        # Earnings reports are inherently high-signal; recency boosts further.
        urgency = _clip(60 + (conf_score or 50) * 0.2, 60, 96)
        events.append(
            {
                "id": f"earnings__{instrument_id}",
                "kind": "earnings",
                "scope": "market",
                "market": market,
                "ticker": ticker,
                "instrument_id": instrument_id,
                "name": "",
                "sector": "",
                "logo_url": None,
                "title": title,
                "body": body,
                "direction": direction,
                "urgency": round(urgency, 1),
                "evidence": evidence[:3],
                "event_date": _text(data.get("event_date")),
                "generated_at": _text(data.get("generated_at")),
                "source": "earnings",
            }
        )
    events.sort(key=lambda e: e.get("generated_at") or "", reverse=True)
    trimmed = events[: max(0, max_events)]
    _attach_latest_quotes(store, trimmed)
    return trimmed


def _attach_latest_quotes(store: TraceMoneyStore, events: list[dict[str, Any]]) -> None:
    ids = [str(e.get("instrument_id") or "") for e in events if e.get("instrument_id")]
    if not ids:
        return
    prices = store.get_latest_prices(ids)
    for event in events:
        latest = prices.get(str(event.get("instrument_id") or "")) or {}
        quote = latest.get("quote") if isinstance(latest.get("quote"), dict) else {}
        current = _to_float(quote.get("current"))
        day_chg = _to_float(quote.get("day_change_pct"))
        if current is not None:
            event["price"] = round(current, 2)
        if day_chg is not None:
            event["day_change_pct"] = round(day_chg, 2)


# ── Orchestration ─────────────────────────────────────────────────────────────


def build_for_market(store: TraceMoneyStore, market: str, limit: int, earnings_cap: int) -> dict[str, Any]:
    cap = max(max(0, earnings_cap or limit), max(0, limit))
    ranked = sorted(
        _events_from_earnings(market, store, cap),
        key=lambda e: (
            _text(e.get("event_date")),
            float(e.get("urgency") or 0),
        ),
        reverse=True,
    )[: max(0, limit)]

    up = sum(1 for e in ranked if e["direction"] == "positive")
    down = sum(1 for e in ranked if e["direction"] == "negative")
    summary = (
        f"{len(ranked)} fresh earnings report{'s' if len(ranked) != 1 else ''} "
        f"({up} positive tone, {down} negative tone)."
        if ranked
        else "No fresh earnings reports right now."
    )

    payload = {
        "market": market,
        "generated_at": _now_iso(),
        "date": _today_utc(),
        "event_count": len(ranked),
        "up_count": up,
        "down_count": down,
        "summary": summary,
        "events": ranked,
        "counts_by_kind": {
            "large_move": 0,
            "reddit_buzz": 0,
            "earnings": len(ranked),
        },
    }
    store.db.collection("tm_market_events").document(f"{market}__latest").set(payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build tm_market_events for a market")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--earnings-cap", type=int, default=12)
    parser.add_argument(
        "--skip-if-fresh-hours",
        type=int,
        default=0,
        help="No-op when tm_market_events/{MARKET}__latest is newer than this many hours.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    is_fresh, existing = _latest_feed_fresh(store, args.market, args.skip_if_fresh_hours)
    if is_fresh:
        payload = {
            "status": "skipped_fresh",
            "market": args.market,
            "max_age_hours": args.skip_if_fresh_hours,
            "existing_generated_at": existing.get("generated_at"),
            "existing_age_hours": existing.get("age_hours"),
            "existing_event_count": existing.get("event_count"),
        }
        print(payload)
        return

    if args.dry_run:
        payload = {
            "status": "dry_run",
            "market": args.market,
            "would_build": True,
            "max_age_hours": args.skip_if_fresh_hours,
            "existing_generated_at": existing.get("generated_at"),
            "existing_age_hours": existing.get("age_hours"),
        }
        print(payload)
        return

    payload = build_for_market(store, args.market, args.limit, args.earnings_cap)

    universe_id = store.get_active_price_universe(args.market) or ""
    store.save_stage_watermark(
        market=args.market,
        stage_key="build_market_events",
        universe_id=universe_id,
        expected_count=args.limit,
        success_count=int(payload.get("event_count") or 0),
        error_count=0,
        metadata={"counts_by_kind": payload.get("counts_by_kind") or {}},
    )
    print(
        {
            "status": "ok",
            "market": args.market,
            "event_count": payload.get("event_count"),
            "counts_by_kind": payload.get("counts_by_kind"),
        }
    )


if __name__ == "__main__":
    main()
