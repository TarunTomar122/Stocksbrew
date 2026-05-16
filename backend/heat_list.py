"""Heat list: surface stocks worth paying attention to today.

Primary signals (work from day one with existing data):
  - Momentum pillar score from tm_stock_intel_pro (market momentum on this name)
  - RSI-14 breakout / oversold recovery from tm_stock_technicals
  - Intraday price move (size and direction) from tm_latest_prices
  - Catalyst urgency from intel_pro.catalysts
  - Growth pillar quality from intel_pro

Bonus signal (builds up over time - adds to the score but does not gate):
  - Mention velocity: 7-day article mention count vs. 30-day rolling baseline

The scorer is intentionally transparent. Each signal contributes a short
reason string that the /heat page surfaces directly ("RSI 74 breakout",
"big move today", "catalyst flagged", "3.2× news chatter").
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend import landing_metrics
from backend.storage import TraceMoneyStore


BASELINE_DAYS = 30
RECENT_DAYS = 7
MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

# Minimum overall heat score for a row to appear in the output.
MIN_HEAT_SCORE = 20.0


# ─── Mention velocity helpers (bonus signal, builds over time) ────────────────

def _parse_date(value: Any) -> str:
    if not value:
        return ""
    s = str(value)
    return s[:10] if len(s) >= 10 else ""


def bucket_enrichments_by_day(
    enrichments: list[dict[str, Any]],
) -> dict[str, dict[str, dict[str, float]]]:
    """Group article enrichments into:
      {instrument_id: {YYYY-MM-DD: {count, primary_count, sentiment_sum, sentiment_n}}}
    One article can mention many stocks; each stock/day pair is counted once
    per article to avoid over-weighting multi-mention pieces."""
    out: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    for article in enrichments:
        date_key = _parse_date(article.get("published_at"))
        if not date_key:
            continue
        seen: set[str] = set()
        for mention in (article.get("entity_mentions") or []):
            if str(mention.get("type", "")).lower() != "stock":
                continue
            ticker = str(mention.get("ticker", "")).strip().upper()
            if not ticker:
                continue
            market = str(article.get("market", "")).upper() or "US"
            iid = f"{market}_{ticker}"
            if iid in seen:
                continue
            seen.add(iid)
            role = str(mention.get("mention_role", "")).lower()
            sent = float(article.get("sentiment_score", 0.0) or 0.0)
            bucket = out[iid].setdefault(date_key, {
                "count": 0.0, "primary_count": 0.0,
                "sentiment_sum": 0.0, "sentiment_n": 0.0,
            })
            bucket["count"] += 1.0
            if role == "primary":
                bucket["primary_count"] += 1.0
            bucket["sentiment_sum"] += sent
            bucket["sentiment_n"] += 1.0
    return {iid: dict(days) for iid, days in out.items()}


def _trim_to_window(
    days: dict[str, dict[str, float]], window: int
) -> dict[str, dict[str, float]]:
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=window)).isoformat()
    return {k: v for k, v in days.items() if k >= cutoff}


def _velocity_metrics(days: dict[str, dict[str, float]]) -> dict[str, float]:
    """Compute recent-vs-baseline velocity stats from a day map."""
    today = datetime.now(timezone.utc).date()
    recent_cutoff = (today - timedelta(days=RECENT_DAYS)).isoformat()
    baseline_cutoff = (today - timedelta(days=BASELINE_DAYS)).isoformat()

    recent_count = 0.0
    recent_primary = 0.0
    recent_sent_sum = 0.0
    recent_sent_n = 0.0
    baseline_count = 0.0

    for date_key, b in days.items():
        if date_key < baseline_cutoff:
            continue
        c = float(b.get("count", 0.0))
        if date_key >= recent_cutoff:
            recent_count += c
            recent_primary += float(b.get("primary_count", 0.0))
            recent_sent_sum += float(b.get("sentiment_sum", 0.0))
            recent_sent_n += float(b.get("sentiment_n", 0.0))
        else:
            baseline_count += c

    baseline_per_day = baseline_count / max(1, BASELINE_DAYS - RECENT_DAYS)
    recent_per_day = recent_count / max(1, RECENT_DAYS)
    multiplier = recent_per_day / max(0.05, baseline_per_day)
    sentiment_mean = recent_sent_sum / recent_sent_n if recent_sent_n > 0 else 0.0
    primary_ratio = recent_primary / recent_count if recent_count > 0 else 0.0

    return {
        "recent_count": recent_count,
        "recent_primary": recent_primary,
        "baseline_total": baseline_count,
        "baseline_per_day": round(baseline_per_day, 2),
        "recent_per_day": round(recent_per_day, 2),
        "multiplier": multiplier,
        "sentiment_mean": sentiment_mean,
        "primary_ratio": primary_ratio,
        "first_appearance": baseline_count == 0 and recent_count > 0,
    }


# ─── Core scorer ─────────────────────────────────────────────────────────────

def _sentiment_label(score: float) -> str:
    if score >= 0.2:
        return "bullish"
    if score <= -0.2:
        return "bearish"
    return "neutral"


def _pillar(intel: dict[str, Any], name: str) -> float | None:
    try:
        return float(intel["pillars"][name]["score"])
    except (KeyError, TypeError, ValueError):
        return None


def _overall_score(intel: dict[str, Any]) -> float | None:
    try:
        return float(intel["overall"]["score"])
    except (KeyError, TypeError, ValueError):
        return None


def _rsi_from_technical(technical: dict[str, Any] | None) -> float | None:
    if not technical:
        return None
    # build_stock_technicals stores RSI as {"rsi_14": {"value": 72.5, "state": "overbought"}}
    rsi_field = technical.get("rsi_14")
    if isinstance(rsi_field, dict):
        val = rsi_field.get("value")
    else:
        # Flat format or nested under "indicators"
        indicators = technical.get("indicators") or {}
        val = indicators.get("rsi_14") or rsi_field
        if isinstance(val, dict):
            val = val.get("value")
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _rsi_state_from_technical(technical: dict[str, Any] | None) -> str | None:
    if not technical:
        return None
    rsi_field = technical.get("rsi_14")
    if isinstance(rsi_field, dict):
        state = rsi_field.get("state")
        return str(state).strip().lower() if state else None
    return None


def _rsi_from_price_history(price_doc: dict[str, Any] | None) -> float | None:
    """Compute RSI(14) from embedded `history_window` on `tm_latest_prices`.

    Mirrors `build_stock_technical_doc` so Heat can still show RSI even when
    `tm_stock_technicals` is missing for a ticker.
    """
    if not price_doc:
        return None
    history = list(price_doc.get("history_window") or [])
    if not history:
        return None
    closes, _volumes = landing_metrics._extract_series(history, price_doc)
    return landing_metrics._rsi(closes, 14)


def _resolve_rsi(
    technical: dict[str, Any] | None,
    price_doc: dict[str, Any] | None,
) -> tuple[float | None, str]:
    """Return (rsi_value, rsi_state) with sensible fallbacks."""
    rsi_value = _rsi_from_technical(technical)
    state = _rsi_state_from_technical(technical)

    if rsi_value is None:
        rsi_value = _rsi_from_price_history(price_doc)

    if state:
        return rsi_value, state

    mapped = landing_metrics._rsi_state(rsi_value)
    return rsi_value, mapped


def _event_is_current(date_label: str) -> bool:
    parts = date_label.lower().replace(",", " ").split()
    if len(parts) < 2:
        return True
    month = MONTHS.get(parts[0][:3])
    if not month:
        return True
    try:
        day = int(parts[1])
    except (TypeError, ValueError):
        return True
    today = datetime.now(timezone.utc).date()
    try:
        event_date = today.replace(month=month, day=day)
    except ValueError:
        return True
    delta = (event_date - today).days
    return -1 <= delta <= 45


def _catalyst_is_current(catalyst: dict[str, Any]) -> bool:
    if str(catalyst.get("kind") or "").lower() != "earnings":
        return True
    title = str(catalyst.get("title") or "")
    parts = title.split()
    if len(parts) >= 3:
        return _event_is_current(" ".join(parts[1:3]))
    return True


def _quote_field(price_doc: dict[str, Any] | None, field: str) -> float | None:
    if not price_doc:
        return None
    quote = price_doc.get("quote") or {}
    val = quote.get(field)
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _score_and_reasons(
    intel: dict[str, Any] | None,
    rsi_14: float | None,
    day_change_pct: float | None,
    velocity: dict[str, float] | None,
) -> tuple[float, list[str]]:
    """Compute a 0-100 heat score and a list of short signal tags.

    Tags are specific and numeric - never vague adjectives. The frontend
    renders them as chips directly, so "RSI 74 ↑" beats "strong momentum".

    Score tiers:
      Tier 1 – momentum pillar   (0-40 pts)  primary driver; shown as metric bar
      Tier 2 – RSI + price move  (0-30 pts)  discrete "something is happening"
      Tier 3 – quality gate      (±10 pts)   reward/penalise overall quality
      Bonus  – velocity          (0-15 pts)  scales with news spike
    """
    score = 0.0
    tags: list[str] = []

    momentum = _pillar(intel, "momentum") if intel else None
    overall = _overall_score(intel) if intel else None
    growth = _pillar(intel, "growth") if intel else None
    catalysts = [
        catalyst for catalyst in (intel or {}).get("catalysts") or []
        if isinstance(catalyst, dict) and _catalyst_is_current(catalyst)
    ]

    # ── Tier 1: momentum pillar (0-40 pts) ───────────────────────────────────
    # The score drives ranking; the label appears in the metric bar on the card,
    # not as a chip - so we only emit a tag when the number is noteworthy.
    if momentum is not None:
        score += momentum * 0.4

    # ── Tier 2: RSI (0-15 pts) ───────────────────────────────────────────────
    if rsi_14 is not None:
        if rsi_14 >= 70:
            score += 15.0
            tags.append(f"RSI {rsi_14:.0f} ↑")
        elif rsi_14 >= 65:
            score += 8.0
            tags.append(f"RSI {rsi_14:.0f}")
        elif rsi_14 <= 30:
            if overall is not None and overall >= 60:
                score += 5.0
                tags.append(f"RSI {rsi_14:.0f} oversold")
            else:
                score -= 5.0

    # ── Tier 2: price move (0-15 pts) ────────────────────────────────────────
    # Show the actual number - "+4.2% today" is infinitely more useful than
    # "big move today".
    if day_change_pct is not None:
        sign = "+" if day_change_pct >= 0 else ""
        abs_move = abs(day_change_pct)
        if abs_move >= 5.0:
            score += 15.0
            tags.append(f"{sign}{day_change_pct:.1f}% today")
        elif abs_move >= 3.0:
            score += 8.0
            tags.append(f"{sign}{day_change_pct:.1f}% today")
        elif abs_move >= 1.5:
            score += 3.0
            tags.append(f"{sign}{day_change_pct:.1f}% today")

    # ── Tier 3: quality gate (±10 pts) ───────────────────────────────────────
    if overall is not None:
        if overall >= 70:
            score += 10.0
        elif overall >= 55:
            score += 5.0
        elif overall < 30:
            score -= 10.0

    # ── Tier 3: catalysts ────────────────────────────────────────────────────
    high_catalysts = [c for c in catalysts if c.get("urgency") == "high"]
    med_catalysts = [c for c in catalysts if c.get("urgency") == "med"]
    if high_catalysts:
        score += 10.0
        # Use the catalyst title if short enough, otherwise generic label
        title = str(high_catalysts[0].get("title", "")).strip()
        tags.append(f"⚡ {title[:28]}" if title else "⚡ catalyst")
    elif med_catalysts:
        score += 5.0
        title = str(med_catalysts[0].get("title", "")).strip()
        tags.append(f"⚡ {title[:28]}" if title else "⚡ catalyst")

    # ── Tier 3: growth quality bonus (0-5 pts) ───────────────────────────────
    if growth is not None and growth >= 70:
        score += 5.0

    # ── Bonus: mention velocity (0-15 pts) ───────────────────────────────────
    if velocity and velocity.get("recent_count", 0) >= 2:
        multiplier = velocity.get("multiplier", 1.0)
        if velocity.get("first_appearance"):
            score += 12.0
            tags.append("📰 first seen in 30d")
        elif multiplier >= 3.0:
            vel_pts = min(15.0, 10.0 * math.log2(max(1.0, multiplier)))
            score += vel_pts
            tags.append(f"📰 {multiplier:.1f}× mentions")
        elif multiplier >= 2.0:
            score += 5.0
            tags.append(f"📰 {multiplier:.1f}× mentions")

        # News sentiment tag when we have enough coverage to trust it
        sent = velocity.get("sentiment_mean", 0.0)
        if velocity.get("recent_count", 0) >= 3 and abs(sent) >= 0.25:
            if sent > 0:
                tags.append("news ↑")
            else:
                score -= 3.0
                tags.append("news ↓")

    return max(0.0, min(100.0, score)), tags


def _row_meta(
    ticker: str,
    intel: dict[str, Any] | None,
    heat_score: float,
    rsi_14: float | None,
    day_change_pct: float | None,
    velocity: dict[str, float] | None,
    reasons: list[str],
) -> dict[str, Any]:
    momentum = _pillar(intel or {}, "momentum")
    overall = _overall_score(intel or {})
    catalysts = [
        catalyst for catalyst in (intel or {}).get("catalysts") or []
        if isinstance(catalyst, dict) and _catalyst_is_current(catalyst)
    ]
    abs_move = abs(day_change_pct or 0.0)
    news_count = (velocity or {}).get("recent_count", 0.0)
    multiplier = (velocity or {}).get("multiplier", 0.0)
    first_seen = bool((velocity or {}).get("first_appearance"))

    setup_type = "momentum_watch"
    primary_driver = "Momentum score"
    if catalysts:
        setup_type = "catalyst_watch"
        primary_driver = "Upcoming catalyst"
    if first_seen or multiplier >= 3:
        setup_type = "news_spike"
        primary_driver = "News velocity"
    if rsi_14 is not None and rsi_14 >= 70:
        setup_type = "overheated"
        primary_driver = "Stretched RSI"
    elif rsi_14 is not None and rsi_14 <= 35 and (overall or 0) >= 60:
        setup_type = "dip_setup"
        primary_driver = "Washed-out quality"
    elif abs_move >= 3 and (momentum or 0) >= 65:
        setup_type = "breakout"
        primary_driver = "Price breakout"

    heat_direction = "mixed"
    if setup_type in {"overheated"} or (rsi_14 is not None and rsi_14 >= 78):
        heat_direction = "caution"
    elif setup_type in {"breakout", "dip_setup", "news_spike", "catalyst_watch"}:
        heat_direction = "bullish" if (overall or 0) >= 50 else "mixed"

    risk_level = "low"
    if rsi_14 is not None and rsi_14 >= 78:
        risk_level = "high"
    elif rsi_14 is not None and rsi_14 >= 70:
        risk_level = "medium"
    elif abs_move >= 5 and heat_direction != "bullish":
        risk_level = "medium"

    suggested_action = "Review setup"
    if setup_type == "overheated":
        suggested_action = "Watch, do not chase"
    elif setup_type == "dip_setup":
        suggested_action = "Investigate entry"
    elif setup_type == "breakout":
        suggested_action = "Check follow-through"
    elif setup_type == "news_spike":
        suggested_action = "Read latest context"
    elif setup_type == "catalyst_watch":
        suggested_action = "Track catalyst reaction"

    setup_label = setup_type.replace("_", " ")
    article = "an" if setup_label[0].lower() in {"a", "e", "i", "o", "u"} else "a"
    rsi_text = f"RSI {rsi_14:.1f}" if rsi_14 is not None else "RSI unavailable"
    move_text = (
        f"{day_change_pct:+.1f}% today"
        if day_change_pct is not None
        else "price move unavailable"
    )
    score_text = f"heat {heat_score:.0f}"
    reason_sentence = (
        f"{ticker} is {article} {setup_label} setup: "
        f"{move_text}, {rsi_text}, {score_text}."
    )
    if setup_type == "news_spike" and news_count:
        reason_sentence = (
            f"{ticker} news activity is elevated with {news_count:.0f} "
            f"mentions in 7 days; {move_text}, {score_text}."
        )
    elif setup_type == "catalyst_watch" and catalysts:
        title = str(catalysts[0].get("title") or "catalyst").strip()
        reason_sentence = f"{ticker} has {title}; {move_text}, {score_text}."

    def is_duplicate_driver(reason: str) -> bool:
        lower = reason.lower()
        if primary_driver == "Stretched RSI" and lower.startswith("rsi"):
            return True
        if primary_driver == "Price breakout" and "today" in lower:
            return True
        if primary_driver == "News velocity" and "mention" in lower:
            return True
        if primary_driver == "Upcoming catalyst" and lower.startswith("⚡"):
            return True
        return primary_driver.lower() in lower

    secondary_drivers = [reason for reason in reasons if not is_duplicate_driver(reason)][:3]

    return {
        "setup_type": setup_type,
        "heat_direction": heat_direction,
        "risk_level": risk_level,
        "primary_driver": primary_driver,
        "secondary_drivers": secondary_drivers,
        "reason_sentence": reason_sentence,
        "suggested_action": suggested_action,
    }


def _summary_from_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {
            "headline": "No hot setups yet",
            "body": "The scorer did not find enough momentum, news, catalyst, or technical heat.",
            "counts": {},
        }
    counts: dict[str, int] = {}
    for row in rows:
        setup = str(row.get("setup_type") or "unknown")
        counts[setup] = counts.get(setup, 0) + 1
    caution = len([row for row in rows if row.get("heat_direction") == "caution"])
    bullish = len([row for row in rows if row.get("heat_direction") == "bullish"])
    top = rows[0]
    dominant = max(counts.items(), key=lambda item: item[1])[0].replace("_", " ")
    body_parts = [
        f"{bullish} bullish setup(s)",
        f"{caution} caution setup(s)",
        f"dominant theme: {dominant}",
    ]
    return {
        "headline": f"{top.get('ticker')} leads today's heat list",
        "body": "; ".join(body_parts) + ".",
        "counts": counts,
        "bullish_count": bullish,
        "caution_count": caution,
        "top_ticker": top.get("ticker"),
    }


# ─── Main builder ─────────────────────────────────────────────────────────────

def build_heat_list(
    store: TraceMoneyStore,
    market: str,
    *,
    ai_universe_id: str | None = None,
    price_universe_id: str | None = None,
    limit: int = 0,
) -> dict[str, Any]:
    """Score every stock in the price universe and return qualifying rows.

    `limit=0` means no row cap; rows are still threshold-gated by
    MIN_HEAT_SCORE to avoid dumping weak/noisy names.

    Steps:
      1. Update mention_stats from today's enrichment run (velocity bonus).
      2. Stream all intel_pro scores for the price universe.
      3. Batch-fetch latest prices.
      4. Fetch RSI for each instrument (serial - no batch endpoint).
      5. Score, sort, persist.
    """

    # 1. Update rolling mention stats from today's enrichments (velocity bonus).
    if ai_universe_id:
        print(f"  [1/4] Loading enrichments from {market}__{ai_universe_id} ...")
        enrichments = store.list_article_enrichments(market, ai_universe_id)
        print(f"        {len(enrichments)} enriched articles found")
    else:
        enrichments = []
        print(f"  [1/4] No ai_universe_id - skipping velocity update")

    per_instrument_days = bucket_enrichments_by_day(enrichments)
    if per_instrument_days:
        print(f"        Updating mention_stats for {len(per_instrument_days)} instruments ...")
        for instrument_id, days in per_instrument_days.items():
            ticker = instrument_id.split("_", 1)[1] if "_" in instrument_id else ""
            existing = store.get_mention_stats(instrument_id) or {}
            existing_days = dict(existing.get("days", {}) or {})
            for date_key, bucket in days.items():
                existing_days[date_key] = bucket  # overwrite same-day key - no double-count
            store.reset_mention_stats_window(
                instrument_id,
                _trim_to_window(existing_days, BASELINE_DAYS),
                ticker=ticker,
                market=market,
            )
        print(f"        mention_stats updated ✓")
    else:
        print(f"        No entity mentions found in enrichments - velocity data unchanged")

    # 2. Pull intel_pro for the price universe. This is a single streaming
    # read of the entire collection (one Firestore roundtrip).
    universe_id = price_universe_id or ai_universe_id
    if not universe_id:
        raise ValueError(f"No universe configured for {market} heat list")

    print(f"  [2/4] Loading intel_pro scores from {market}__{universe_id} ...")
    intel_map: dict[str, dict[str, Any]] = {}
    for doc in store.list_stock_intel_pro(market, universe_id):
        iid = str(doc.get("instrument_id", "")).strip()
        if iid:
            intel_map[iid] = doc
    print(f"        {len(intel_map)} scored stocks loaded")

    if not intel_map:
        # Fallback: try AI universe if price universe has nothing.
        if ai_universe_id and ai_universe_id != universe_id:
            print(f"        No docs found - trying fallback ai universe {ai_universe_id} ...")
            for doc in store.list_stock_intel_pro(market, ai_universe_id):
                iid = str(doc.get("instrument_id", "")).strip()
                if iid:
                    intel_map.setdefault(iid, doc)
            print(f"        {len(intel_map)} stocks from fallback universe")

    if not intel_map:
        print(f"  ✗ No intel_pro data found. Run build_stock_intel_pro first.")
        return {
            "universe_id": universe_id,
            "ai_universe_id": ai_universe_id,
            "window_days": RECENT_DAYS,
            "baseline_window_days": BASELINE_DAYS,
            "rows": [],
            "row_count": 0,
        }

    # 3. Batch-fetch prices, technicals, and mention stats in parallel passes
    # so step 4 is pure in-memory computation with no Firestore reads.
    instrument_ids = list(intel_map.keys())
    print(f"  [3/4] Batch-fetching prices + technicals + mention stats ...")
    price_map = store.get_latest_prices(instrument_ids)
    print(f"        prices: {len(price_map)} docs")
    technicals_map = store.get_latest_stock_technicals_batch(instrument_ids, lookback_days=7)
    print(f"        technicals: {len(technicals_map)} docs")
    mention_map = store.get_mention_stats_batch(instrument_ids)
    print(f"        mention stats: {len(mention_map)} docs")

    # 4. Score each instrument - pure in-memory, no Firestore reads.
    print(f"  [4/4] Scoring {len(intel_map)} instruments ...")
    rows: list[dict[str, Any]] = []
    skipped_low = 0
    for instrument_id, intel in intel_map.items():
        price_doc = price_map.get(instrument_id)
        rsi_14, rsi_state = _resolve_rsi(technicals_map.get(instrument_id), price_doc)

        day_change_pct = _quote_field(price_doc, "day_change_pct")

        # Velocity bonus (None if we have no mention stats yet).
        stats = mention_map.get(instrument_id) or {}
        days = _trim_to_window(dict(stats.get("days", {}) or {}), BASELINE_DAYS)
        velocity = _velocity_metrics(days) if days else None

        score, reasons = _score_and_reasons(intel, rsi_14, day_change_pct, velocity)
        if score < MIN_HEAT_SCORE:
            skipped_low += 1
            continue

        vel = velocity or {}
        ticker = str(intel.get("ticker") or instrument_id.split("_", 1)[-1])
        meta = _row_meta(
            ticker,
            intel,
            score,
            rsi_14,
            day_change_pct,
            velocity,
            reasons,
        )
        rows.append({
            "instrument_id": instrument_id,
            "ticker": ticker,
            "name": intel.get("name") or intel.get("ticker"),
            "sector": intel.get("sector_label"),
            "industry": intel.get("industry_label"),
            "logo_url": intel.get("logo_url"),
            "heat_score": round(score, 1),
            "reasons": reasons,
            **meta,
            # Scores for UI context
            "overall_score": _overall_score(intel),
            "momentum_score": _pillar(intel, "momentum"),
            # Velocity fields (zero-filled when no data yet)
            "mention_count_7d": int(vel.get("recent_count", 0)),
            "primary_mention_7d": int(vel.get("recent_primary", 0)),
            "baseline_per_day": float(vel.get("baseline_per_day", 0.0)),
            "recent_per_day": float(vel.get("recent_per_day", 0.0)),
            "multiplier": round(vel.get("multiplier", 0.0), 2),
            "first_appearance": bool(vel.get("first_appearance", False)),
            "sentiment_mean_7d": round(float(vel.get("sentiment_mean", 0.0)), 3),
            "sentiment_label": _sentiment_label(vel.get("sentiment_mean", 0.0)),
            # Technical + price
            "rsi_14": rsi_14,
            "rsi_14_state": rsi_state,
            "price": _quote_field(price_doc, "current"),
            "day_change_pct": day_change_pct,
            "day_change_abs": _quote_field(price_doc, "day_change_abs"),
            "previous_close": _quote_field(price_doc, "previous_close"),
        })

    rows.sort(key=lambda r: r["heat_score"], reverse=True)
    qualified_count = len(rows)
    if limit and limit > 0:
        rows = rows[:limit]
    print(
        f"        {qualified_count} rows above threshold "
        f"(min {MIN_HEAT_SCORE}), {skipped_low} below"
    )

    return {
        "universe_id": universe_id,
        "ai_universe_id": ai_universe_id,
        "window_days": RECENT_DAYS,
        "baseline_window_days": BASELINE_DAYS,
        "rows": rows,
        "row_count": len(rows),
        "summary": _summary_from_rows(rows),
    }
