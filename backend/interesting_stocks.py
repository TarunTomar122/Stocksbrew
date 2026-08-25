"""Rank tradeable stock setups for Pulse — separate from the /heat scanner.

Scores names across the full priced universe (not core-100 only) using:
  - directive / risk-reward quality (tradeable stance, not trim/avoid)
  - recent session moves (bonus for ±10% jumps)
  - daily anomaly flag
  - reddit mention persistence
  - intel quality + RSI context

Output: top 10 rows with transparent reason chips for the Pulse tab.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.directive_v2 import build_directive_v2
from backend.storage import TraceMoneyStore

TOP_ROW_COUNT = 10
MAX_PER_SECTOR = 2
MIN_INTERESTING_SCORE = 32.0
SESSION_LOOKBACK = 5
BIG_SESSION_MOVE_PCT = 10.0
MID_SESSION_MOVE_PCT = 5.0


def _num(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out else None


def _quote_field(price_doc: dict[str, Any] | None, field: str) -> float | None:
    if not price_doc:
        return None
    quote = price_doc.get("quote") or {}
    return _num(quote.get(field))


def _ticker_from_id(instrument_id: str) -> str:
    return instrument_id.split("_", 1)[-1] if "_" in instrument_id else instrument_id


def _resolve_rsi(
    technicals_doc: dict[str, Any] | None,
    price_doc: dict[str, Any] | None,
) -> tuple[float | None, str | None]:
    if technicals_doc:
        rsi = _num(technicals_doc.get("rsi_14"))
        if rsi is not None:
            state = str(technicals_doc.get("rsi_14_state") or "").strip() or None
            return rsi, state
    if price_doc:
        rsi = _num(price_doc.get("rsi_14"))
        if rsi is not None:
            return rsi, None
    return None, None


def session_move_stats(
    price_doc: dict[str, Any] | None,
    *,
    lookback: int = SESSION_LOOKBACK,
) -> dict[str, float | int | bool]:
    """Max absolute day-over-day move across recent history_window closes."""
    if not price_doc:
        return {
            "max_abs_pct": 0.0,
            "latest_abs_pct": 0.0,
            "big_jump": False,
            "sessions_used": 0,
        }

    window = list(price_doc.get("history_window") or [])
    closes: list[float] = []
    for point in window[-(lookback + 1) :]:
        if not isinstance(point, dict):
            continue
        quote = point.get("quote") if isinstance(point.get("quote"), dict) else point
        close = _num((quote or {}).get("current") or (quote or {}).get("close"))
        if close and close > 0:
            closes.append(close)

    if len(closes) < 2:
        day_change = _quote_field(price_doc, "day_change_pct") or 0.0
        abs_day = abs(day_change)
        return {
            "max_abs_pct": abs_day,
            "latest_abs_pct": abs_day,
            "big_jump": abs_day >= BIG_SESSION_MOVE_PCT,
            "sessions_used": 1,
        }

    moves: list[float] = []
    for prev, curr in zip(closes, closes[1:]):
        if prev > 0:
            moves.append(((curr - prev) / prev) * 100.0)

    max_abs = max((abs(m) for m in moves), default=0.0)
    latest_abs = abs(moves[-1]) if moves else 0.0
    return {
        "max_abs_pct": max_abs,
        "latest_abs_pct": latest_abs,
        "big_jump": max_abs >= BIG_SESSION_MOVE_PCT,
        "sessions_used": len(moves),
    }


def risk_reward_ratio(intel_doc: dict[str, Any] | None, price: float | None) -> float | None:
    """Upside to the v2 trim target vs downside to the v2 pullback zone."""
    if not intel_doc or not price or price <= 0:
        return None

    directive = intel_doc.get("directive_v2") if isinstance(intel_doc.get("directive_v2"), dict) else {}
    zones = directive.get("zones") if isinstance(directive.get("zones"), dict) else {}
    target = _num(zones.get("trim_above"))
    pullback = _num(zones.get("accumulate_below"))

    if target and target > price:
        upside_pct = ((target - price) / price) * 100.0
    else:
        upside_pct = None

    if pullback and pullback < price:
        risk_pct = ((price - pullback) / price) * 100.0
    else:
        risk_pct = None

    if upside_pct and risk_pct and risk_pct > 0 and upside_pct > 0:
        return upside_pct / risk_pct
    return None


def _reddit_map(reddit_doc: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    if not reddit_doc:
        return out
    tickers = reddit_doc.get("tickers")
    if isinstance(tickers, list):
        for item in tickers:
            if not isinstance(item, dict):
                continue
            ticker = str(item.get("ticker") or "").strip().upper()
            if ticker:
                out[ticker] = item
    elif isinstance(tickers, dict):
        for ticker, value in tickers.items():
            if isinstance(value, dict):
                out[str(ticker).strip().upper()] = value
    return out


def _anomaly_map(anomalies_doc: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    if not anomalies_doc:
        return out
    for row in anomalies_doc.get("anomalies") or []:
        if not isinstance(row, dict):
            continue
        ticker = str(row.get("ticker") or "").strip().upper()
        if ticker:
            out[ticker] = row
    return out


def collect_candidate_instrument_ids(
    store: TraceMoneyStore,
    market: str,
) -> tuple[set[str], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """Union priced snapshot + anomaly + reddit tickers (any name, not core-100 only)."""
    market_key = market.upper()
    ids: set[str] = set()

    for row in store.get_market_price_snapshot(market_key):
        iid = str(row.get("instrument_id") or row.get("instrumentId") or "").strip().upper()
        if iid.startswith(f"{market_key}_"):
            ids.add(iid)

    anomalies_doc = store.db.collection("tm_daily_anomalies").document(f"{market_key}__latest").get()
    anomalies_payload = anomalies_doc.to_dict() if anomalies_doc.exists else None
    anomaly_by_ticker = _anomaly_map(anomalies_payload if isinstance(anomalies_payload, dict) else None)

    reddit_doc = store.db.collection("reddit_snapshots").document(f"{market_key}__latest").get()
    reddit_payload = reddit_doc.to_dict() if reddit_doc.exists else None
    reddit_by_ticker = _reddit_map(reddit_payload if isinstance(reddit_payload, dict) else None)

    for ticker in anomaly_by_ticker:
        ids.add(f"{market_key}_{ticker}")
    for ticker in reddit_by_ticker:
        ids.add(f"{market_key}_{ticker}")

    return ids, anomaly_by_ticker, reddit_by_ticker


def _intel_overall(intel_pro: dict[str, Any] | None) -> float | None:
    if not intel_pro:
        return None
    return _num(intel_pro.get("overall_score") or intel_pro.get("score"))


def score_interesting_row(
    *,
    instrument_id: str,
    intel_doc: dict[str, Any] | None,
    intel_pro: dict[str, Any] | None,
    price_doc: dict[str, Any] | None,
    rsi_14: float | None,
    anomaly: dict[str, Any] | None,
    reddit: dict[str, Any] | None,
    instrument_meta: dict[str, Any] | None,
) -> tuple[float, list[str], str, str, bool]:
    """Return score, tags, setup_type, headline, eligible."""
    tags: list[str] = []
    score = 0.0

    price = _quote_field(price_doc, "current")
    day_change_pct = _quote_field(price_doc, "day_change_pct")
    sessions = session_move_stats(price_doc)
    rr = risk_reward_ratio(intel_doc, price)

    directive_v2 = None
    stance = "hold"
    risk_reward_label = "balanced"
    action_label = "Review setup"

    if intel_doc:
        stored_directive_v2 = intel_doc.get("directive_v2")
        directive_v2 = (
            stored_directive_v2
            if isinstance(stored_directive_v2, dict)
            else build_directive_v2(intel_doc)
        )
        stance = str(directive_v2.get("stance") or "hold").lower()
        setup = directive_v2.get("setup") if isinstance(directive_v2.get("setup"), dict) else {}
        risk_reward_label = str(setup.get("risk_reward") or "balanced").lower()
        action = directive_v2.get("action") if isinstance(directive_v2.get("action"), dict) else {}
        action_label = str(action.get("label") or action_label).strip() or action_label

    if stance in {"avoid", "trim"}:
        return 0.0, tags, "avoid", action_label, False
    if risk_reward_label == "unfavorable":
        return 0.0, tags, "avoid", action_label, False

    if risk_reward_label == "favorable":
        score += 24.0
        tags.append("R/R favorable")
    elif risk_reward_label == "balanced":
        score += 8.0

    if rr is not None:
        if rr >= 2.0:
            score += 12.0
            tags.append(f"{rr:.1f}:1 R/R")
        elif rr >= 1.5:
            score += 8.0
            tags.append(f"{rr:.1f}:1 R/R")

    if stance == "accumulate":
        score += 18.0
        tags.append("Accumulate setup")
    elif stance == "watch":
        execution = str((directive_v2 or {}).get("execution") or "").lower()
        if execution == "breakout":
            score += 14.0
            tags.append("Breakout watch")
        else:
            score += 10.0
            tags.append("Watch setup")
    elif stance == "hold":
        score += 4.0

    overall = _intel_overall(intel_pro)
    if overall is not None:
        if overall >= 70:
            score += 10.0
            tags.append(f"Score {overall:.0f}")
        elif overall >= 55:
            score += 5.0

    max_abs = float(sessions.get("max_abs_pct") or 0.0)
    if max_abs >= BIG_SESSION_MOVE_PCT:
        sign = "+" if (day_change_pct or 0) >= 0 else "−"
        score += 18.0
        tags.append(f"{sign}{max_abs:.0f}% session swing")
    elif max_abs >= MID_SESSION_MOVE_PCT:
        sign = "+" if (day_change_pct or 0) >= 0 else "−"
        score += 10.0
        tags.append(f"{sign}{max_abs:.1f}% move")

    if anomaly:
        score += 14.0
        move = _num(anomaly.get("day_change_pct"))
        if move is not None:
            tags.append(f"Anomaly {move:+.1f}%")
        else:
            tags.append("Anomaly move")

    reddit_mentions = int(
        (reddit or {}).get("mention_count")
        or (reddit or {}).get("mentions")
        or 0
    )
    if reddit_mentions >= 5:
        score += 12.0
        tags.append(f"Reddit ×{reddit_mentions}")
    elif reddit_mentions >= 2:
        score += 7.0
        tags.append(f"Reddit buzz")

    if rsi_14 is not None:
        if rsi_14 <= 35 and (overall or 0) >= 55:
            score += 12.0
            tags.append(f"RSI {rsi_14:.0f} dip")
            setup_type = "dip_setup"
        elif 55 <= rsi_14 <= 68 and (day_change_pct or 0) >= 1.5:
            score += 8.0
            tags.append(f"RSI {rsi_14:.0f}")
            setup_type = "breakout_watch"
        elif rsi_14 >= 78 and (day_change_pct or 0) > 3:
            score -= 18.0
            tags.append("Stretched RSI")
            setup_type = "overheated"
        else:
            setup_type = "momentum_setup"
    else:
        setup_type = "momentum_setup"

    if stance == "watch" and str((directive_v2 or {}).get("execution") or "").lower() == "breakout":
        setup_type = "breakout_watch"
    if risk_reward_label == "favorable" and stance == "accumulate":
        setup_type = "accumulate_setup"

    if day_change_pct is not None and abs(day_change_pct) >= 3:
        sign = "+" if day_change_pct >= 0 else "−"
        if f"{sign}{abs(day_change_pct):.1f}%" not in " ".join(tags):
            tags.append(f"{sign}{abs(day_change_pct):.1f}% today")

    headline = action_label
    if intel_doc:
        visual = intel_doc.get("visual_summary") if isinstance(intel_doc.get("visual_summary"), dict) else {}
        for candidate in (visual.get("why_it_matters"), intel_doc.get("today_brief"), visual.get("what_changed")):
            text = str(candidate or "").strip()
            if text:
                headline = text
                break

    eligible = (
        intel_doc is not None
        and score >= MIN_INTERESTING_SCORE
        and stance in {"accumulate", "watch", "hold"}
    )
    if setup_type == "overheated" and score < MIN_INTERESTING_SCORE + 8:
        eligible = False

    return max(0.0, min(100.0, score)), tags[:4], setup_type, headline, eligible


def _sector_bucket(sector: Any) -> str | None:
    """Sector key for diversity cap — skip empty/unknown buckets so they don't share one slot."""
    label = str(sector or "").strip()
    if not label:
        return None
    if label.lower() in {"unknown", "n/a", "na", "—", "-", "other"}:
        return None
    return label


def _apply_sector_cap(rows: list[dict[str, Any]], limit: int = TOP_ROW_COUNT) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    sector_counts: dict[str, int] = {}
    used_keys: set[str] = set()

    def row_key(row: dict[str, Any]) -> str:
        return str(row.get("instrument_id") or row.get("ticker") or "").strip().upper()

    for row in rows:
        sector_key = _sector_bucket(row.get("sector"))
        if sector_key and sector_counts.get(sector_key, 0) >= MAX_PER_SECTOR:
            continue
        key = row_key(row)
        if not key or key in used_keys:
            continue
        selected.append(row)
        used_keys.add(key)
        if sector_key:
            sector_counts[sector_key] = sector_counts.get(sector_key, 0) + 1
        if len(selected) >= limit:
            return selected

    # Backfill to `limit` when sector cap leaves empty slots.
    for row in rows:
        key = row_key(row)
        if not key or key in used_keys:
            continue
        selected.append(row)
        used_keys.add(key)
        if len(selected) >= limit:
            break

    return selected


def build_interesting_stocks(
    store: TraceMoneyStore,
    market: str,
    *,
    ai_universe_id: str | None = None,
) -> dict[str, Any]:
    market_key = market.upper()
    universe_id = ai_universe_id or store.get_active_ai_universe(market_key)
    if not universe_id:
        raise ValueError(f"No active AI universe configured for {market_key}")

    print(f"  [1/5] Collecting candidate instrument ids ...")
    candidate_ids, anomaly_by_ticker, reddit_by_ticker = collect_candidate_instrument_ids(store, market_key)
    print(f"        {len(candidate_ids)} candidates from snapshot + anomalies + reddit")

    print(f"  [2/5] Loading stock_intelligence from {market_key}__{universe_id} ...")
    intel_by_id: dict[str, dict[str, Any]] = {}
    for doc in store.list_stock_intelligence_docs(market_key, universe_id):
        iid = str(doc.get("instrument_id") or "").strip().upper()
        if iid:
            intel_by_id[iid] = doc
    print(f"        {len(intel_by_id)} intelligence docs")

    extra_intel_ids = [
        iid for iid in sorted(candidate_ids)
        if iid not in intel_by_id
        and (_ticker_from_id(iid) in anomaly_by_ticker or _ticker_from_id(iid) in reddit_by_ticker)
    ]
    if extra_intel_ids:
        fetched = store.get_stock_intelligence_docs_batch(market_key, universe_id, extra_intel_ids)
        intel_by_id.update(fetched)
        print(f"        +{len(fetched)} extra intel docs for anomaly/reddit names")

    intel_pro_map: dict[str, dict[str, Any]] = {}
    for doc in store.list_stock_intel_pro(market_key, universe_id):
        iid = str(doc.get("instrument_id") or "").strip().upper()
        if iid:
            intel_pro_map[iid] = doc

    prefilter_ids: set[str] = set(intel_by_id.keys())
    for iid in candidate_ids:
        ticker = _ticker_from_id(iid)
        if ticker in anomaly_by_ticker or ticker in reddit_by_ticker:
            prefilter_ids.add(iid)

    for row in store.get_market_price_snapshot(market_key):
        iid = str(row.get("instrument_id") or row.get("instrumentId") or "").strip().upper()
        if not iid or iid in prefilter_ids:
            continue
        change_pct = _num(row.get("changePct"))
        if change_pct is None:
            quote = row.get("quote") if isinstance(row.get("quote"), dict) else {}
            change_pct = _num(quote.get("day_change_pct") or quote.get("changePct"))
        if change_pct is not None and abs(change_pct) >= 1.5:
            prefilter_ids.add(iid)

    print(f"  [3/5] Batch-fetching prices + technicals for {len(prefilter_ids)} names ...")
    instrument_ids = sorted(prefilter_ids)
    price_map = store.get_latest_prices(instrument_ids)
    technicals_map = store.get_latest_stock_technicals_batch(instrument_ids, lookback_days=7)
    instrument_meta_map = {
        str(row.get("instrument_id") or "").strip().upper(): row
        for row in store.list_instruments(market_key, instrument_ids)
    }

    print(f"  [4/5] Scoring {len(instrument_ids)} instruments ...")
    rows: list[dict[str, Any]] = []
    skipped = 0
    for instrument_id in instrument_ids:
        ticker = _ticker_from_id(instrument_id)
        intel_doc = intel_by_id.get(instrument_id)
        intel_pro = intel_pro_map.get(instrument_id)
        price_doc = price_map.get(instrument_id)
        rsi_14, rsi_state = _resolve_rsi(technicals_map.get(instrument_id), price_doc)
        anomaly = anomaly_by_ticker.get(ticker)
        reddit = reddit_by_ticker.get(ticker)
        meta = instrument_meta_map.get(instrument_id) or {}

        score, tags, setup_type, headline, eligible = score_interesting_row(
            instrument_id=instrument_id,
            intel_doc=intel_doc,
            intel_pro=intel_pro,
            price_doc=price_doc,
            rsi_14=rsi_14,
            anomaly=anomaly,
            reddit=reddit,
            instrument_meta=meta,
        )
        if not eligible:
            skipped += 1
            continue

        current_price = _quote_field(price_doc, "current")
        rr_value = risk_reward_ratio(intel_doc, current_price)
        rows.append({
            "instrument_id": instrument_id,
            "ticker": ticker,
            "name": meta.get("name") or (intel_doc or {}).get("name") or ticker,
            "sector": meta.get("sector_label") or (intel_doc or {}).get("sector_label"),
            "industry": meta.get("industry_label") or (intel_doc or {}).get("industry_label"),
            "logo_url": meta.get("logo_url") or (intel_doc or {}).get("logo_url"),
            "interesting_score": round(score, 1),
            "reasons": tags,
            "setup_type": setup_type,
            "headline": headline,
            "risk_reward_ratio": round(rr_value, 2) if rr_value is not None else None,
            "overall_score": _intel_overall(intel_pro),
            "price": current_price,
            "day_change_pct": _quote_field(price_doc, "day_change_pct"),
            "rsi_14": rsi_14,
            "rsi_14_state": rsi_state,
            "reddit_mentions": int((reddit or {}).get("mention_count") or (reddit or {}).get("mentions") or 0),
            "is_anomaly": bool(anomaly),
            "session_max_move_pct": round(float(session_move_stats(price_doc).get("max_abs_pct") or 0.0), 2),
        })

    rows.sort(key=lambda row: float(row.get("interesting_score") or 0), reverse=True)
    top_rows = _apply_sector_cap(rows, TOP_ROW_COUNT)

    print(f"        {len(rows)} eligible, {skipped} filtered out, {len(top_rows)} selected")

    return {
        "market": market_key,
        "universe_id": universe_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate_count": len(candidate_ids),
        "scored_count": len(instrument_ids),
        "eligible_count": len(rows),
        "row_count": len(top_rows),
        "rows": top_rows,
    }
