"""Aggregate enriched articles into per-stock intelligence docs."""
from __future__ import annotations

from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import re
from typing import Any

from backend.directive_v2 import build_directive_v2
from backend.llm_client import (
    LLM_BRIEF_SOURCE,
    json_response_format,
    llm_api_key,
    llm_model,
    parse_json_content,
    post_chat_completion,
    schema_system_prompt,
)
from backend.landing_metrics import _extract_series, _to_float, build_stock_technical_doc
from backend.models import Article
from backend.providers.options_scrape import fetch_alphaquery_options_digest

logger = logging.getLogger(__name__)

STOCK_BRIEF_CACHE_VERSION = "2026-07-02-stock-brief-v17-anomaly-alignment"


def _summarize_intel_pro(intel: dict[str, Any] | None) -> dict[str, Any] | None:
    """Compact a stock_intel_pro doc into a prompt-friendly fundamentals block.

    Keeps pillar scores, standout metrics (strong or weak), and catalysts so the
    LLM can reason about valuation/growth/quality/momentum alongside the news.
    """
    if not intel:
        return None
    pillars = intel.get("pillars") or {}
    overall = intel.get("overall") or {}
    block: dict[str, Any] = {
        "overall_score": overall.get("score"),
        "overall_verdict": overall.get("verdict"),
        "pillars": {},
        "standout_metrics": [],
        "weak_metrics": [],
        "catalysts": [
            {"title": c.get("title"), "urgency": c.get("urgency")}
            for c in (intel.get("catalysts") or [])[:4]
        ],
        "sector": intel.get("sector_label"),
        "industry": intel.get("industry_label"),
    }
    for pillar_name, pillar in pillars.items():
        if not isinstance(pillar, dict):
            continue
        block["pillars"][pillar_name] = {
            "score": pillar.get("score"),
            "verdict": pillar.get("verdict"),
        }
        for metric in pillar.get("metrics") or []:
            score = metric.get("score")
            if not isinstance(score, (int, float)):
                continue
            entry = {
                "pillar": pillar_name,
                "label": metric.get("label"),
                "value": metric.get("value"),
                "summary": metric.get("summary"),
            }
            if score >= 75:
                block["standout_metrics"].append(entry)
            elif score <= 25:
                block["weak_metrics"].append(entry)
    block["standout_metrics"] = block["standout_metrics"][:6]
    block["weak_metrics"] = block["weak_metrics"][:6]
    return block


def _avg_volume_from_history(history_points: list[dict[str, Any]]) -> float | None:
    volumes: list[float] = []
    for row in history_points:
        quote = row.get("quote") or {}
        value = _to_float(quote.get("volume"))
        if value is not None and value > 0:
            volumes.append(value)
    if not volumes:
        return None
    return sum(volumes) / len(volumes)


def _return_over_sessions(closes: list[float], sessions: int) -> float | None:
    if len(closes) < sessions + 1:
        return None
    start = closes[-(sessions + 1)]
    end = closes[-1]
    if start <= 0:
        return None
    return round((end - start) / start * 100.0, 2)


def _recent_session_prices(
    history_points: list[dict[str, Any]],
    latest_price_doc: dict[str, Any] | None,
    *,
    limit: int = 5,
) -> list[dict[str, Any]]:
    rows: list[tuple[str, float, float | None]] = []
    for row in history_points:
        quote = row.get("quote") or {}
        close = _to_float(quote.get("current"))
        if close is None:
            continue
        ts = str(row.get("captured_at") or row.get("timestamp") or row.get("as_of_date") or "")
        day_change = _to_float(quote.get("day_change_pct"))
        rows.append((ts, close, day_change))

    if latest_price_doc:
        quote = latest_price_doc.get("quote") or {}
        close = _to_float(quote.get("current"))
        if close is not None:
            ts = str(latest_price_doc.get("captured_at") or latest_price_doc.get("as_of_date") or "")
            day_change = _to_float(quote.get("day_change_pct"))
            rows.append((ts, close, day_change))

    rows.sort(key=lambda item: item[0])
    dedup: dict[str, tuple[float, float | None]] = {}
    for ts, close, day_change in rows:
        key = ts[:10] if ts else str(close)
        dedup[key] = (close, day_change)

    recent: list[dict[str, Any]] = []
    for date_key, (close, day_change) in list(dedup.items())[-limit:]:
        entry: dict[str, Any] = {"date": date_key, "close": round(close, 4)}
        if day_change is not None:
            entry["day_change_pct"] = round(day_change, 2)
        recent.append(entry)
    return recent


def _comparative_day_change_context(
    instrument: dict[str, Any],
    instrument_id: str,
    latest_prices_by_id: dict[str, dict[str, Any]],
    instruments_by_id: dict[str, dict[str, Any]],
    market_day_change_values: list[float],
) -> tuple[float, float | None, float | None]:
    quote = (latest_prices_by_id.get(instrument_id, {}) or {}).get("quote", {})
    self_day_change = _to_float((quote or {}).get("day_change_pct")) or 0.0

    market_median = (
        sum(market_day_change_values) / len(market_day_change_values)
        if market_day_change_values
        else None
    )
    vs_market = round(self_day_change - market_median, 4) if market_median is not None else None

    instrument_sector = str(instrument.get("sector", "")).strip().lower()
    sector_values: list[float] = []
    for peer_id, payload in latest_prices_by_id.items():
        peer = instruments_by_id.get(peer_id)
        if not peer:
            continue
        if str(peer.get("sector", "")).strip().lower() != instrument_sector:
            continue
        peer_quote = (payload.get("quote") or {}) if isinstance(payload, dict) else {}
        peer_change = _to_float(peer_quote.get("day_change_pct"))
        if peer_change is not None:
            sector_values.append(peer_change)
    sector_median = sum(sector_values) / len(sector_values) if sector_values else None
    vs_sector = round(self_day_change - sector_median, 4) if sector_median is not None else None
    return self_day_change, vs_market, vs_sector


def _summarize_price_context(
    latest_price_doc: dict[str, Any] | None,
    technical_doc: dict[str, Any] | None,
    history_points: list[dict[str, Any]] | None,
    *,
    vs_market_day_change_pct: float | None = None,
    vs_sector_day_change_pct: float | None = None,
) -> dict[str, Any] | None:
    if not latest_price_doc:
        return None

    quote = latest_price_doc.get("quote") or {}
    current = _to_float(quote.get("current"))
    day_change = _to_float(quote.get("day_change_pct"))
    volume = _to_float(quote.get("volume"))
    history = list(history_points or [])
    avg_volume = _avg_volume_from_history(history)
    volume_vs_avg: float | str = "unknown"
    if volume is not None and avg_volume and avg_volume > 0:
        volume_vs_avg = round(volume / avg_volume, 2)

    closes, _ = _extract_series(history, latest_price_doc)
    returns: dict[str, float | None] = {
        "week_1_pct": _return_over_sessions(closes, 5),
        "month_1_pct": _return_over_sessions(closes, 21),
        "month_3_pct": _return_over_sessions(closes, 63),
    }

    rsi_block = (technical_doc or {}).get("rsi_14") or {}
    distance = (technical_doc or {}).get("distance") or {}
    moving_averages = (technical_doc or {}).get("moving_averages") or {}

    block: dict[str, Any] = {
        "current_price": current,
        "day_change_pct": day_change,
        "vs_market_day_change_pct": vs_market_day_change_pct,
        "vs_sector_day_change_pct": vs_sector_day_change_pct,
        "volume_vs_avg": volume_vs_avg,
        "rsi_14": {
            "value": rsi_block.get("value"),
            "state": rsi_block.get("state"),
        },
        "from_52w_high_pct": distance.get("from_52w_high_pct"),
        "from_52w_low_pct": distance.get("from_52w_low_pct"),
        "ma_position": {
            "sma_20": moving_averages.get("price_vs_sma_20"),
            "sma_50": moving_averages.get("price_vs_sma_50"),
            "sma_200": moving_averages.get("price_vs_sma_200"),
        },
        "trend": _derive_trend(technical_doc),
        "returns": returns,
        "recent_sessions": _recent_session_prices(history, latest_price_doc, limit=14),
    }
    if not any(value is not None for value in (current, day_change)):
        return None
    return block


def _build_news_digest(
    *,
    recent_news: list[dict[str, Any]],
    timeline: list[dict[str, Any]],
    visual_summary: dict[str, Any],
    freshness_hours: float,
) -> dict[str, Any]:
    directions: list[str] = []
    for item in (visual_summary.get("drivers") or []):
        if isinstance(item, dict):
            direction = str(item.get("direction") or "").strip().lower()
            if direction in {"up", "down", "mixed"}:
                directions.append(direction)
    up = directions.count("up")
    down = directions.count("down")
    direction = "positive" if up > down else "negative" if down > up else "mixed" if directions else "neutral"
    hard_hints = (
        "earnings", "guidance", "contract", "deal", "approval", "probe", "investigation",
        "downgrade", "upgrade", "price target", "partnership", "acquisition", "filing",
    )
    joined = " ".join(
        str(item.get("title") or item.get("summary") or "")
        for item in list(recent_news[:4]) + list(timeline[:4])
        if isinstance(item, dict)
    ).lower()
    catalyst_type = next((hint for hint in hard_hints if hint in joined), "none")
    return {
        "freshness_hours": round(freshness_hours, 2),
        "hard_catalyst": catalyst_type != "none",
        "catalyst_type": catalyst_type,
        "direction": direction,
        "changed_setup": bool(catalyst_type != "none" or freshness_hours <= 24),
        "top_items": [
            {
                "date": str(item.get("date") or item.get("timestamp") or "")[:10],
                "title": str(item.get("title") or "").strip()[:160],
                "source": str(item.get("source_name") or "").strip()[:80],
                "direction": direction,
                "relevance": "company",
            }
            for item in list(recent_news[:3]) + list(timeline[:2])
            if isinstance(item, dict) and str(item.get("title") or "").strip()
        ][:4],
    }


def _build_anomaly_digest(anomaly_doc: dict[str, Any] | None) -> dict[str, Any] | None:
    row = (anomaly_doc or {}).get("anomaly") if isinstance(anomaly_doc, dict) else None
    if not isinstance(row, dict):
        return None
    move = row.get("move_explanation") if isinstance(row.get("move_explanation"), dict) else {}
    return {
        "date": anomaly_doc.get("date"),
        "direction": row.get("direction"),
        "day_change_pct": row.get("day_change_pct"),
        "headline": move.get("headline") or row.get("headline"),
        "why_it_matters": move.get("why_it_matters") or row.get("why_it_matters") or row.get("summary"),
        "confidence": move.get("confidence") or row.get("confidence"),
        "dominant_angle": move.get("dominant_angle") or row.get("dominant_angle") or row.get("angle"),
    }


def _visual_cards(
    *,
    drivers: list[dict[str, Any]] | None = None,
    catalyst_cards: list[dict[str, Any]] | None = None,
    risk_cards: list[dict[str, Any]] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    return {
        "drivers": [item for item in (drivers or []) if isinstance(item, dict)],
        "catalyst_cards": [item for item in (catalyst_cards or []) if isinstance(item, dict)],
        "risk_cards": [item for item in (risk_cards or []) if isinstance(item, dict)],
    }


def _load_options_digests(
    instruments: list[dict[str, Any]],
    *,
    market: str,
    store: Any | None = None,
    max_workers: int = 4,
) -> dict[str, dict[str, Any]]:
    if market.upper() != "US":
        return {}

    tickers_by_id = {
        str(inst.get("instrument_id") or "").strip(): str(inst.get("ticker") or "").strip().upper()
        for inst in instruments
        if str(inst.get("instrument_id") or "").strip() and str(inst.get("ticker") or "").strip()
    }
    if not tickers_by_id:
        return {}

    today = datetime.now(timezone.utc).date().isoformat()
    out: dict[str, dict[str, Any]] = {}
    missing: dict[str, str] = dict(tickers_by_id)

    if store is not None:
        try:
            cached = store.get_options_context_docs_batch(market, list(tickers_by_id.values()))
        except Exception as exc:
            logger.info("options digest cache read failed market=%s: %s", market, exc)
            cached = {}
        for instrument_id, ticker in tickers_by_id.items():
            row = cached.get(f"{market.upper()}__{ticker}") or {}
            if str(row.get("updated_at") or "")[:10] == today and row.get("ok"):
                out[instrument_id] = row
                missing.pop(instrument_id, None)

    if not missing:
        return out

    def _fetch(item: tuple[str, str]) -> tuple[str, dict[str, Any] | None]:
        instrument_id, ticker = item
        try:
            digest = fetch_alphaquery_options_digest(ticker, timeout=20)
        except Exception as exc:
            logger.info("options digest fetch failed %s: %s", ticker, exc)
            return instrument_id, None
        return instrument_id, digest if digest.get("ok") else None

    fetched_rows: list[dict[str, Any]] = []
    worker_count = max(1, min(max_workers, len(missing)))
    with ThreadPoolExecutor(max_workers=worker_count) as pool:
        futures = [pool.submit(_fetch, item) for item in missing.items()]
        for future in as_completed(futures):
            instrument_id, digest = future.result()
            if digest:
                out[instrument_id] = digest
                fetched_rows.append(digest)
    if fetched_rows and store is not None:
        try:
            store.upsert_options_context_docs(market, fetched_rows)
        except Exception as exc:
            logger.info("options digest cache write failed market=%s: %s", market, exc)
    return out


STOCK_BRIEF_SYSTEM_PROMPT = """You write stock intelligence for a premium market app. Smart but easy to read.

The user sees the price chart already. Don't describe price moves. Tell them what it MEANS.

You receive evidence from news articles about a stock. Synthesize it.

Fields to write:

- **headline**: Under 12 words. An insight, not a price move. BAD: "NVDA rises on earnings." GOOD: "Data-center demand is outpacing bull-case estimates."

- **body**: A simple, factual NEWS OVERVIEW of what is actually happening with this stock RIGHT NOW. Write 1-2 complete sentences, 35-55 words total. Ground every sentence in the dated `recent_news` items (and `reddit_buzz` if present). Plain English, current, no jargon. If `recent_news` is empty or every item is more than ~4 days older than `today`, say coverage has gone quiet and briefly note the last real development. Do NOT narrate the price. Never open with "[Company] has seen..." - lead with the actual development. End on a complete sentence.

- **key_findings**: 2-4 short, punchy takeaways. Each one a different insight the user wouldn't get from the chart. Frame facts as implications: not "analyst set $200 target" but "Street consensus is 15% above current price - the market hasn't caught up to the upgrade cycle yet."

- **catalyst**: One sentence. The most important near-term trigger and what a surprise would mean. Not just "earnings coming" - what's priced in and what breaks if it misses.

- **risk**: One sentence. The biggest downside scenario - what specifically goes wrong and what's the consequence.

- **thesis**: One line, max 12 words. This is the primary "card title" insight.
- **setup_state**: one of ["accumulation", "breakout", "trend", "rotation", "exhaustion", "unclear"].
- **drivers**: 2-4 objects with keys:
  - label: short driver statement (3-6 words)
  - detail: ONE complete English sentence (12-25 words) for a retail investor. Explain the implication in plain language — not a metric dump. NEVER output scorecard shorthand like "2 - Buy signal", "3.5% - moderate short interest", or "41% vs target". BAD detail: "2 - Buy signal (2.0)." GOOD detail: "Quant models rate this a Buy, supporting constructive momentum even after the recent pullback."
  - direction: "up" | "down" | "mixed"
  - strength: integer 1-5
  - horizon: "today" | "week" | "quarter"
- **catalyst_cards**: 1-3 objects with keys:
  - event: short event name (3-6 words). Example: "Foxconn revenue report"
  - detail: ONE sentence explaining why this matters for the stock. Example: "Foxconn is a key Nvidia supplier - strong revenue hints at AI server demand holding up through Q2."
  - window, expected_impact (-2 to 2), priced_in ("low" | "med" | "high")
  - If a catalyst card is earnings-based, the only allowed date source is `earnings.event_date` from the payload, and only when `earnings.status` is "upcoming". In that case `window` must copy that exact future ISO date or a short label derived from it. Do not invent a different date, and do not use a reported/past earnings date as if it were upcoming.
  - If earnings are reported or missing, do not put a date in the catalyst card. Use a non-date window like "near-term", "week", or "quarter" instead.
- **risk_cards**: 1-3 objects with keys:
  - risk: short risk name (3-6 words)
  - detail: ONE complete English sentence (12-25 words) explaining the downside scenario concretely. Same rule as drivers: full sentences only, never metric shorthand or scorecard fragments.
  - trigger, severity (1-5), probability (1-5)

- **directive**: ONE present-tense call plus optional future zones. Do not hide the main call behind a nearby price. Object with:
  - text: the current call as a short imperative (under 8 words). Examples: "Accumulate now", "Hold here", "Watch for reclaim", "Trim strength", "Avoid for now". Do NOT put a price in `text`; prices belong in add_on/trim_on/breaks_if.
  - action_now: same current call in plain English. It should answer "what do I do at the current price?" Write a complete useful sentence, 10-22 words. BAD: "Buy on dips", "Accumulate now". GOOD: "Hold at current price and add only if it pulls back near support."
  - stance: one of ["accumulate", "trim", "watch", "avoid", "hold"]
  - add_on: optional object for the buy/add zone. Use {"text":"", "trigger_type":"none", "trigger_value":""} if not useful.
  - trim_on: optional object for the sell/trim zone. Use {"text":"", "trigger_type":"none", "trigger_value":""} if not useful.
  - breaks_if: optional object for the invalidation/risk zone. Use {"text":"", "trigger_type":"none", "trigger_value":""} only when there is no real invalidation anchor. If price_context has recent closes below current price, a nearby support/reclaim level, a negative anomaly, or a clear risk_card trigger, provide a real breaks_if.
  - trigger_type and trigger_value: backward-compatible PRIMARY smart trigger chosen from add_on/trim_on/breaks_if. Pick the most useful alert for the stance: accumulate -> add_on, trim -> trim_on, hold/watch -> breaks_if or add_on. If no useful alert exists, use "none" and "".
  - Zone objects have keys: text, trigger_type, trigger_value. trigger_type is one of ["price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"]. For price triggers, trigger_value is the numeric string only, no $ sign.
  - rationale: ONE sentence connecting the current setup to the trigger - mention where price sits relative to the level when a price trigger is used.
  - confidence: "low" | "med" | "high"

STYLE:
- Conversational, sharp, zero filler
- Short sentences mixed with longer ones
- Keep user-facing fields naturally short through writing, not truncation: body 35-55 words, catalyst/risk/rationale one complete sentence each.
- NO: "investors should monitor", "well-positioned", "could potentially", "it's worth noting"
- If evidence is thin, say what the silence means - not just "limited coverage"
- Do not repeat the same fact across headline/body/key_findings/thesis/drivers/catalyst/risk.
- If overlap exists, keep it in thesis and remove duplicates from other fields.

FUNDAMENTALS - USE THEM:
- The user payload includes a `fundamentals` block with four pillar scores (valuation, growth, quality, momentum - each 0-100), plus `standout_metrics` (score ≥ 75) and `weak_metrics` (score ≤ 25) and quant-driven `catalysts` (earnings dates, rank upgrades, short spikes). These are ground truth, not news.
- Let fundamentals shape the directive, but do NOT treat rich valuation by itself as a sell signal. Expensive leaders can stay attractive when growth, revisions, narrative strength, and price structure all support the move.
- A beaten-down name with strong growth and a Buy-tilted quant rank can be "accumulate on dips". A high-multiple winner with strong evidence can still be "accumulate" or "watch for breakout" if the setup remains constructive.
- Use fundamentals to pick concrete trigger prices. If price is already above analyst target AND still showing strength, a conditional trim on further extension above $X can work. If price is below target or selling off, prefer watch/accumulate at support instead.
- Drivers and risk_cards should weave fundamentals + news into full sentences a human would say aloud. BAD detail: "16% - strong pace, ahead of sector". GOOD detail: "Revenue is compounding 16% YoY, ahead of the sector, which keeps the growth story intact."
- Do NOT restate raw metric numbers that the scorecard already renders. Instead, interpret them. BAD: "P/E is 28.5". GOOD: "Valuation is rich but growth is pricing it fairly - PEG under 1.2 keeps the setup constructive."
- If fundamentals contradict the news sentiment, surface the tension in the body/thesis - that's the insight the user can't get elsewhere.

RISK APPETITE - OFFENSIVE, NOT TIMID:
- Write like a sharp growth-oriented investor who is willing to lean in when the setup is asymmetric.
- Do not default to caution just because valuation looks rich. Expensive stocks can still be buys if growth, estimate revisions, narrative strength, sector leadership, and price structure support it.
- Prefer identifying the highest-upside actionable setup, not the most defensible neutral take.
- When evidence is bullish but imperfect, it is acceptable to give an "accumulate" or "watch for breakout" stance rather than collapsing to "hold".
- Momentum, narrative acceleration, estimate revisions, leadership within sector, and strong post-earnings reactions are valid reasons to stay constructive even when valuation is stretched.
- "Trim" should be reserved for genuinely crowded or exhausted setups where upside looks capped relative to risk, not simply because a stock has already run.
- Avoid sounding like a compliance officer or textbook value investor. Sound like a sharp operator deciding where capital should go next.
- Still stay evidence-bound: no hype, no invented catalysts, no fake certainty.

DIRECTIVE vs CURRENT PRICE - READ THIS FIRST:
- The payload always includes `current_price`. It may also include `price_context` with `day_change_pct`, `recent_sessions`, MAs, RSI, and returns.
- Before choosing stance or trigger, read where the stock trades NOW and what happened in `recent_sessions`.
- The directive must make sense to someone looking at the live quote. If they would think "but it's already below/above that" - rewrite it.
- Never describe a level as "support", "recent low", "resistance", "SMA", "moving average", or "52-week" unless that exact anchor is present in `price_context`. If only `ma_position.sma_20 = "below"` is present, you may say "below the 20-day average"; do not invent the average's dollar value.
- Do not round a trigger into a different thesis. If `recent_sessions` supports $192.53, use 192.53 or a clearly rounded 193; do not turn it into an invented $195 support level unless $195 appears in the payload.
- Decide the current call first, then the zones:
  · If the setup is attractive at current price, write "Accumulate now" / "Hold here" and put better-entry prices in add_on.
  · If price must reclaim or break a level first, write "Watch for reclaim" and put the level in add_on or breaks_if.
  · If risk/reward is stretched, write "Trim strength" or "Do not add here" and put the sale zone in trim_on.
- Never use "trim into strength" when the stock is not in strength today (negative `day_change_pct`, breaking recent highs, underperforming market/sector) unless the directive explicitly frames a future reclaim/bounce.

DIRECTIVE STABILITY:
- The payload may include `previous_directive`. Treat it as the default answer.
- Keep the previous directive exactly unless new evidence changes the setup.
- Do NOT move add/trim/break zones just because current_price moved.
- Change the directive only if there is fresh company news, sector news, market news, competitor read-through, earnings/results/guidance, or price has crossed the prior add/trim/break zone.
- If you keep the previous directive, keep `text`, `action_now`, `stance`, `add_on`, `trim_on`, `breaks_if`, `trigger_type`, and `trigger_value` unchanged. You may refresh rationale only if it still says the same thing more clearly.
- If you change the directive, the rationale must name the evidence that changed.
- If `previous_directive` already has usable `add_on`, `trim_on`, or `breaks_if` zones and no change trigger occurred, copy those zones rather than simplifying them away.

BRIEF STABILITY:
- The payload may include `previous_brief_summary`. Treat it as continuity context, not as fresh evidence.
- Keep prior thesis/setup/drivers/risks when the new evidence says the same thing.
- Change them only when fresh news, price action, sector/market regime, earnings, or anomaly context changes the setup.
- Do not copy stale facts blindly; if prior content conflicts with dated `recent_news` or `price_context`, trust the fresh payload.

DIRECTIVE SELECTION PRIORITY:
- First ask: is there a credible upside path with real evidence behind it?
- If yes, prefer "accumulate" or "watch" over "hold".
- Use "hold" only when upside and downside are genuinely balanced.
- Use "avoid" only when the evidence is clearly deteriorating or the thesis is breaking.
- Use "trim" when the stock looks overheated, consensus is too euphoric, or the next catalyst has poor risk/reward.
- Do NOT default to "accumulate on dips" for every bullish setup. Choose the directive style that best matches the actual setup.
- Prefer directives that contain a concrete price level when the payload supports one. Support, resistance, recent closes, moving averages, analyst targets, or well-supported trigger levels are all valid anchors.
- "Hold" should usually still be actionable with a level, for example "Hold above $205" or "Hold unless $690 breaks".
- "Watch" should usually still be actionable with a level, for example "Watch breakout above $230" or "Watch for support at $140".

DIRECTIVE STYLE BY SETUP:
- If `setup_state` is "accumulation": "accumulate on dips below X" is natural when support is clear.
- If `setup_state` is "breakout": prefer "watch/add above X" or "watch for breakout above X" rather than a dip-buy directive.
- If `setup_state` is "trend": prefer "hold", "stay long", "add on continuation", or "hold while X holds" when momentum is healthy, and include the level when possible.
- If `setup_state` is "rotation": prefer directives that acknowledge leadership shifts, relative strength, or capital rotating into the group.
- If `setup_state` is "exhaustion": prefer "trim", "avoid chasing", or "re-evaluate if X breaks" over fresh accumulation.
- setup_state and directive must agree on the tape: do not pair a sharp down day or "exhaustion" with "trim into strength above" unless framing a bounce trade; for "rotation", say whether this name is leading or lagging.
- If you choose a bullish stance, vary the directive wording so it reflects the setup instead of repeating the same template.
- Avoid vague directives with no usable trigger when a concrete level is available in the payload.

PRICE CONTEXT - USE IT FOR THE DIRECTIVE:
- Read `price_context.current_price` and `recent_sessions` before writing the directive.
- Pick trigger levels from real anchors: recent session highs/lows, nearby MAs, analyst target, obvious support/resistance from the last 5 closes.
- Match stance to today's tape: big down day + breaking recent lows → prefer watch/accumulate below support, not trim into strength above resistance; strong up day + extended RSI → trim or watch exhaustion can be valid; coiled near support after pullback → accumulate below X or watch hold at X.
- You may still avoid narrating price in `body`/`headline`. The directive is where the price level must be actionable and coherent with `current_price`.
- Every price trigger must be directionally valid: `price_below` must be below current_price; `price_above` must be above current_price. If current_price has already crossed the level, rewrite the directive around reclaim/reset instead of keeping a stale trigger.
- Prefer one primary add/hold/trim level and one risk/invalidation level over a naked "accumulate" call. Users set alerts from these zones.

MARKET REGIME - USE IT:
- The payload may include a `market_regime` block with a macro read (market_phase, risk_appetite, narrative, leadership, laggards, rotation_signal) and one relevant sector regime for the stock.
- Use market regime to size conviction, not to override stock evidence blindly.
- In risk-on tapes or leadership sectors, it is acceptable to lean more constructive when the stock evidence is already supportive.
- In defensive tapes or a sector that is breaking down, require cleaner evidence before giving an aggressive bullish directive.
- If stock evidence and regime disagree, surface the tension explicitly. That tension is often the real insight.
- Do NOT repeat regime labels verbatim. Interpret what they mean for this stock's setup and directive.

RECENCY - THIS IS CRITICAL:
- Today's date is in the payload as `today`. The payload includes `recent_news`: an array of the freshest articles, each with its own `date`, `title`, and `summary`.
- The `body` overview must describe what is happening NOW, anchored to `recent_news`. Only treat something as "recent"/"this week" if its `date` is within ~4 days of `today`.
- NEVER reference a date that is not present in `recent_news`. NEVER invent "as of <month>" phrasing. If the freshest item is old, say coverage has quieted rather than implying fresh activity.

ANOMALY ALIGNMENT:
- The payload may include `anomaly_digest` when this stock is one of today's unusual movers.
- If `anomaly_digest.confidence` is "high" or "medium", treat its headline and why_it_matters as the primary explanation for today's move. Your headline/body should not contradict it.
- Use `recent_news` to add detail, but do not replace a high-confidence anomaly explanation with a different weaker angle.
- If `anomaly_digest` says earnings/guidance/deal/approval drove the move, the body should lead with that event unless `recent_news` clearly disproves it.

REDDIT BUZZ - USE AS A SENTIMENT SIGNAL, NOT FACT:
- The payload may include `reddit_buzz` with retail `sentiment`, a `context` blurb, `mentions` count, and `catalysts`. This is crowd chatter, not verified reporting.
- You may use it to color the overview ("retail buzz is spiking, leaning bullish") and to inform the directive's confidence. NEVER quote a Reddit claim as fact and NEVER invent a number or event from it. If it conflicts with the news, trust the news.

EARNINGS - RESPECT THE TIMING:
- The payload may include an `earnings` block. Read its `status` and act accordingly. If there is NO `earnings` block, this stock is between prints - do NOT mention earnings at all, and do NOT write any "watch earnings" directive.
- status == "reported": earnings ALREADY happened on `event_date` (`days_since_report` days ago). NEVER frame earnings as upcoming or say "watch for earnings". If `reported_eps` is present it is the ACTUAL reported number - cite it (and `surprise_label`/`eps_surprise_pct` for the beat/miss vs estimate). If only `eps_estimate` is present, the actual result is not captured yet, so do NOT state a beat/miss or present the estimate as the result. If `reported_highlights` is present, ground your overview in those actuals (`reported_vs_expected`, `guidance_signal`, `price_reaction`, `what_changed`) - they are real reported results, not speculation.
  - If `lead` is true (just reported, within ~5 days): the print is THE story. Lead the `body` overview with the result + guidance, and the `directive` must reflect a POST-earnings stance (e.g. "Hold through guidance digestion", "Trim into post-earnings strength", "Re-rate on raised guidance") - never a pre-earnings watch.
  - If `lead` is false (reported but older): mention the result only as backdrop ("since its <month> beat...") and let current news lead the overview.
- status == "upcoming": earnings reports in `days_until` days on `event_date`. You MAY frame it as a near-term catalyst and the directive may be a watch (e.g. "Watch earnings <date>"). Use the `event_date` exactly - never invent a different date.
- Only the `earnings` block (and `recent_news`) may anchor an earnings reference. Never reuse an earnings date from anywhere else.
- For catalyst_cards, earnings dates are even stricter: only an upcoming earnings block may supply a date, and the date must be copied exactly from `earnings.event_date`. If the payload does not have an upcoming earnings block, do not include an earnings date in any catalyst card.

EVIDENCE DISCIPLINE - THIS IS CRITICAL:
- Every driver, catalyst_card, and risk_card MUST be grounded in a specific fact from the evidence OR fundamentals block. If neither supports it, don't write it.
- Do NOT pad with generic filler like "Market sentiment remains constructive", "Negative economic news", "Macroeconomic factors", "Market sentiment shifts". These are worthless.
- If there are only 1-2 articles, return FEWER cards (1-2 drivers max, 0-1 catalyst, 0-1 risk) rather than inventing generic ones to hit a quota. An empty array is better than a padded one.
- Never invent specific numbers (price targets, percentages, dates) that aren't in the evidence. If you don't see it, don't fabricate it.
- NEVER output a risk_card whose risk is "Nothing concrete yet" or whose detail is empty. If you can't name a specific risk, return an empty risk_cards array.
- NEVER output a catalyst_card with empty detail. If you can't explain why it matters in one sentence, drop the card.
"""

STOCK_BRIEF_SCHEMA = {
    "name": "stock_brief",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "headline": {
                "type": "string",
                "description": "Under 12 words. The single most important event or signal.",
            },
            "body": {
                "type": "string",
                "description": "2-3 sentences synthesizing what happened, why it matters, what to watch.",
            },
            "key_findings": {
                "type": "array",
                "items": {"type": "string"},
                "description": "2-4 distinct concrete takeaways. Each a different fact - no redundancy.",
            },
            "catalyst": {
                "type": "string",
                "description": "The single most important near-term catalyst or trigger to watch.",
            },
            "risk": {
                "type": "string",
                "description": "The single biggest downside risk or concern right now.",
            },
            "thesis": {
                "type": "string",
                "description": "One-line primary insight, max 12 words.",
            },
            "setup_state": {
                "type": "string",
                "enum": ["accumulation", "breakout", "trend", "rotation", "exhaustion", "unclear"],
            },
            "drivers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "label": {"type": "string"},
                        "detail": {"type": "string"},
                        "direction": {"type": "string", "enum": ["up", "down", "mixed"]},
                        "strength": {"type": "integer", "minimum": 1, "maximum": 5},
                        "horizon": {"type": "string", "enum": ["today", "week", "quarter"]},
                    },
                    "required": ["label", "detail", "direction", "strength", "horizon"],
                },
            },
            "catalyst_cards": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "event": {"type": "string"},
                        "detail": {"type": "string"},
                        "window": {"type": "string"},
                        "expected_impact": {"type": "number", "minimum": -2, "maximum": 2},
                        "priced_in": {"type": "string", "enum": ["low", "med", "high"]},
                    },
                    "required": ["event", "detail", "window", "expected_impact", "priced_in"],
                },
            },
            "risk_cards": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "risk": {"type": "string"},
                        "detail": {"type": "string"},
                        "trigger": {"type": "string"},
                        "severity": {"type": "integer", "minimum": 1, "maximum": 5},
                        "probability": {"type": "integer", "minimum": 1, "maximum": 5},
                    },
                    "required": ["risk", "detail", "trigger", "severity", "probability"],
                },
            },
            "directive": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "text": {"type": "string"},
                    "action_now": {"type": "string"},
                    "stance": {"type": "string", "enum": ["accumulate", "trim", "watch", "avoid", "hold"]},
                    "trigger_type": {"type": "string", "enum": ["price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"]},
                    "trigger_value": {"type": "string"},
                    "add_on": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "text": {"type": "string"},
                            "trigger_type": {"type": "string", "enum": ["price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"]},
                            "trigger_value": {"type": "string"},
                        },
                        "required": ["text", "trigger_type", "trigger_value"],
                    },
                    "trim_on": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "text": {"type": "string"},
                            "trigger_type": {"type": "string", "enum": ["price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"]},
                            "trigger_value": {"type": "string"},
                        },
                        "required": ["text", "trigger_type", "trigger_value"],
                    },
                    "breaks_if": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "text": {"type": "string"},
                            "trigger_type": {"type": "string", "enum": ["price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"]},
                            "trigger_value": {"type": "string"},
                        },
                        "required": ["text", "trigger_type", "trigger_value"],
                    },
                    "rationale": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["low", "med", "high"]},
                },
                "required": [
                    "text",
                    "action_now",
                    "stance",
                    "trigger_type",
                    "trigger_value",
                    "add_on",
                    "trim_on",
                    "breaks_if",
                    "rationale",
                    "confidence",
                ],
            },
        },
        "required": [
            "headline",
            "body",
            "key_findings",
            "catalyst",
            "risk",
            "thesis",
            "setup_state",
            "drivers",
            "catalyst_cards",
            "risk_cards",
            "directive",
        ],
        "additionalProperties": False,
    },
}


def _json_schema_errors(value: Any, schema: dict[str, Any], *, path: str = "$") -> list[str]:
    """Validate the JSON-schema subset used by stock briefs without extra deps."""
    errors: list[str] = []
    expected = schema.get("type")

    type_matches = True
    if expected == "object":
        type_matches = isinstance(value, dict)
    elif expected == "array":
        type_matches = isinstance(value, list)
    elif expected == "string":
        type_matches = isinstance(value, str)
    elif expected == "integer":
        type_matches = isinstance(value, int) and not isinstance(value, bool)
    elif expected == "number":
        type_matches = isinstance(value, (int, float)) and not isinstance(value, bool)

    if not type_matches:
        errors.append(f"{path} must be {expected}")
        return errors

    allowed = schema.get("enum")
    if isinstance(allowed, list) and value not in allowed:
        errors.append(f"{path} must be one of {allowed}")

    if expected == "object":
        properties = schema.get("properties") or {}
        required = schema.get("required") or []
        for key in required:
            if key not in value:
                errors.append(f"{path}.{key} is required")
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in properties:
                    errors.append(f"{path}.{key} is not allowed")
        for key, child_schema in properties.items():
            if key in value and isinstance(child_schema, dict):
                errors.extend(_json_schema_errors(value[key], child_schema, path=f"{path}.{key}"))
    elif expected == "array":
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                errors.extend(_json_schema_errors(item, item_schema, path=f"{path}[{index}]"))
    elif expected in {"integer", "number"}:
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if minimum is not None and value < minimum:
            errors.append(f"{path} must be >= {minimum}")
        if maximum is not None and value > maximum:
            errors.append(f"{path} must be <= {maximum}")

    return errors


def _validate_stock_brief_payload(payload: Any) -> dict[str, Any]:
    """Reject schema echoes and incomplete stock briefs before use or caching."""
    if not isinstance(payload, dict):
        raise ValueError("stock brief must be a JSON object")
    if "schema" in payload and "name" in payload:
        raise ValueError("stock brief response echoed the schema envelope")

    errors = _json_schema_errors(payload, STOCK_BRIEF_SCHEMA["schema"])
    for field in ("headline", "body", "thesis"):
        if isinstance(payload.get(field), str) and not payload[field].strip():
            errors.append(f"$.{field} must not be empty")
    directive = payload.get("directive")
    if isinstance(directive, dict):
        for field in ("text", "action_now", "rationale"):
            if isinstance(directive.get(field), str) and not directive[field].strip():
                errors.append(f"$.directive.{field} must not be empty")

    if errors:
        preview = "; ".join(errors[:8])
        if len(errors) > 8:
            preview += f"; and {len(errors) - 8} more"
        raise ValueError(preview)
    return payload


def _llm_synthesize_brief(
    ticker: str,
    name: str,
    key_points: list[str],
    article_titles: list[str],
    sentiment_label: str,
    sentiment_score: int,
    article_count: int,
    source_count: int,
    catalyst: str,
    risk: str,
    current_price: float | None = None,
    analyst_target: float | None = None,
    fundamentals: dict[str, Any] | None = None,
    price_context: dict[str, Any] | None = None,
    market_regime: dict[str, Any] | None = None,
    recent_news: list[dict[str, Any]] | None = None,
    reddit: dict[str, Any] | None = None,
    earnings: dict[str, Any] | None = None,
    anomaly_digest: dict[str, Any] | None = None,
    previous_directive: dict[str, Any] | None = None,
    previous_brief_summary: dict[str, Any] | None = None,
    store: Any | None = None,
) -> dict[str, Any] | None:
    """Call OpenAI to generate a synthesized stock brief. Returns None on failure."""
    api_key = llm_api_key()
    if not api_key:
        return None

    model = llm_model()

    payload = {
        "today": datetime.now(timezone.utc).date().isoformat(),
        "ticker": ticker,
        "company_name": name,
        "sentiment_label": sentiment_label,
        "sentiment_score": sentiment_score,
        "article_count": article_count,
        "source_count": source_count,
        "key_evidence": key_points[:5],
        "top_article_titles": article_titles[:4],
        "catalyst": catalyst,
        "risk": risk,
        "current_price": current_price,
        "analyst_target": analyst_target,
        "fundamentals": fundamentals,
    }
    if recent_news:
        payload["recent_news"] = recent_news
    if reddit:
        payload["reddit_buzz"] = reddit
    if earnings:
        payload["earnings"] = earnings
    if anomaly_digest:
        payload["anomaly_digest"] = anomaly_digest
    if previous_directive:
        payload["previous_directive"] = previous_directive
    if previous_brief_summary:
        payload["previous_brief_summary"] = previous_brief_summary
    if price_context:
        payload["price_context"] = price_context
    if market_regime:
        payload["market_regime"] = market_regime

    # Check cache
    cache_key = None
    if store is not None:
        digest = hashlib.sha256(
            json.dumps([STOCK_BRIEF_CACHE_VERSION, model, payload], sort_keys=True).encode()
        ).hexdigest()
        cache_key = f"stock_brief_{digest}"
        try:
            cached = store.get_llm_enrichment(cache_key)
            if cached and isinstance(cached.get("payload"), dict):
                try:
                    return _validate_stock_brief_payload(cached["payload"])
                except ValueError as exc:
                    logger.warning(
                        "Ignoring invalid cached LLM brief for %s cache_key=%s: %s",
                        ticker,
                        cache_key,
                        exc,
                    )
        except Exception:
            pass

    try:
        messages = [
            {"role": "system", "content": schema_system_prompt(STOCK_BRIEF_SYSTEM_PROMPT, STOCK_BRIEF_SCHEMA)},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
        ]
        result: dict[str, Any] | None = None
        for semantic_attempt in range(1, 3):
            body = post_chat_completion(
                messages=messages,
                model=model,
                temperature=0.2,
                response_format=json_response_format(),
                timeout=30,
                stage="stock_brief",
            )
            content = body["choices"][0]["message"]["content"]
            try:
                result = _validate_stock_brief_payload(parse_json_content(content))
                break
            except (KeyError, TypeError, ValueError) as exc:
                if semantic_attempt >= 2:
                    raise ValueError(f"invalid stock brief after {semantic_attempt} attempts: {exc}") from exc
                logger.warning(
                    "Invalid LLM brief for %s; retrying semantic_attempt=%s/2: %s",
                    ticker,
                    semantic_attempt,
                    exc,
                )
                messages.append({
                    "role": "user",
                    "content": (
                        "The prior response was invalid. Return the completed stock brief data object, "
                        "not the schema or response-format envelope. Include every required field and "
                        f"match all field types. Validation error: {str(exc)[:500]}"
                    ),
                })

        if result is None:
            raise ValueError("LLM returned no valid stock brief")

        # Cache the result
        if store is not None and cache_key:
            try:
                store.save_llm_enrichment(cache_key, {
                    "payload": result,
                    "model": model,
                    "cache_version": STOCK_BRIEF_CACHE_VERSION,
                })
            except Exception:
                pass

        return result
    except Exception as exc:
        logger.warning("LLM brief generation failed for %s: %s", ticker, exc)
        return None


def _previous_brief_summary(prev_doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(prev_doc, dict):
        return None
    cards = prev_doc.get("visual_cards") or prev_doc.get("visual_summary") or {}
    if not isinstance(cards, dict):
        cards = {}
    drivers = cards.get("drivers") or []
    risks = cards.get("risk_cards") or []
    out = {
        "headline": str(prev_doc.get("headline") or "")[:160],
        "thesis": str(prev_doc.get("thesis") or "")[:160],
        "setup_state": str(prev_doc.get("setup_state") or "")[:40],
        "updated_at": str(prev_doc.get("updated_at") or prev_doc.get("generated_at") or "")[:40],
        "drivers": [
            {
                "driver": str(card.get("driver") or card.get("title") or "")[:120],
                "detail": str(card.get("detail") or "")[:180],
            }
            for card in drivers[:2]
            if isinstance(card, dict)
        ],
        "risks": [
            {
                "risk": str(card.get("risk") or card.get("title") or "")[:120],
                "detail": str(card.get("detail") or "")[:180],
            }
            for card in risks[:1]
            if isinstance(card, dict)
        ],
    }
    if any(out.get(key) for key in ("headline", "thesis", "setup_state")) or out["drivers"] or out["risks"]:
        return out
    return None


NO_NEWS_BRIEF_SYSTEM_PROMPT = """You write stock intelligence for a premium market app. This stock has NO recent news - make that silence meaningful.

The user sees the price chart. Don't describe the price. Tell them what the quiet means.

- **headline**: Under 12 words. Not "limited coverage for AMD." Something insightful about the silence: "AMD is quietly holding gains while the street looks elsewhere."
- **body**: 1-2 complete sentences, 35-55 words total. What does the technical and analyst picture tell someone holding this stock? Is this stock coiled, exhausted, or just boring? End on a complete sentence.
- **key_findings**: 2-3 punchy insights from the numbers - analyst target gap, RSI, distance from highs, what these imply.
- **catalyst**: What could break the silence. Be specific.
- **risk**: What the lack of coverage might be hiding.
- **thesis**: One line, max 12 words.
- **setup_state**: one of ["accumulation", "breakout", "trend", "rotation", "exhaustion", "unclear"].
- **drivers**: 2-4 concise driver objects. Each `detail` must be one complete English sentence (12-25 words), never metric shorthand.
- **catalyst_cards**: 1-3 trigger cards.
- **risk_cards**: 1-3 downside cards. Each `detail` must be one complete English sentence (12-25 words), never metric shorthand.

STYLE: Conversational, sharp, zero filler. Keep user-facing fields naturally short through writing, not truncation.
Do not repeat the same fact across body/key_findings/thesis/drivers/catalyst/risk.
"""

NO_NEWS_BRIEF_CACHE_VERSION = "2026-04-21-no-news-brief-v4-native"


def _nn_to_float(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _derive_trend(technical_doc: dict[str, Any] | None) -> str:
    if not technical_doc:
        return "neutral"
    ma = technical_doc.get("moving_averages") or {}
    above_50 = ma.get("price_vs_sma_50") == "above"
    above_200 = ma.get("price_vs_sma_200") == "above"
    slope = ma.get("ema_20_slope_state")
    if above_50 and above_200 and slope == "rising":
        return "uptrend"
    if (not above_50) and (not above_200) and slope == "falling":
        return "downtrend"
    if above_200 and not above_50:
        return "pullback-in-uptrend"
    if above_50 and not above_200:
        return "bounce-in-downtrend"
    return "neutral"


def _extract_analyst_from_intel_pro(
    intel_pro_doc: dict[str, Any] | None,
    current_price: float | None,
) -> tuple[str, float | None, float | None]:
    """Pull analyst rating label, target price, and upside % from the scored
    four-pillar doc. Handles both US (Finviz recom 1-5, valuation 'Analyst target')
    and IN (analyst_buy_pct) metric shapes without a separate adapter."""
    if not intel_pro_doc:
        return ("N/A", None, None)
    rating_label = "N/A"
    target_price: float | None = None
    upside_pct: float | None = None
    for pillar in (intel_pro_doc.get("pillars") or {}).values():
        if not isinstance(pillar, dict):
            continue
        for metric in pillar.get("metrics") or []:
            label = str(metric.get("label", "")).strip().lower()
            if label == "analyst target":
                target_price = _nn_to_float(metric.get("value"))
                price_ref = _nn_to_float(metric.get("benchmark")) or current_price
                if target_price and price_ref:
                    upside_pct = round((target_price - price_ref) / price_ref * 100, 2)
            elif label == "analyst rating":
                value = _nn_to_float(metric.get("value"))
                if value is not None:
                    # Finviz recom: 1=strong buy, 5=strong sell
                    rating_label = (
                        "strong buy" if value <= 1.5
                        else "buy" if value <= 2.5
                        else "hold" if value <= 3.5
                        else "sell" if value <= 4.5
                        else "strong sell"
                    )
            elif label == "analyst consensus":
                value = _nn_to_float(metric.get("value"))
                if value is not None:
                    # IN Screener: % of analysts saying buy
                    rating_label = (
                        "strong buy" if value >= 80
                        else "buy" if value >= 55
                        else "hold" if value >= 35
                        else "sell"
                    )
    return (rating_label, target_price, upside_pct)


def generate_no_news_brief(
    instrument: dict[str, Any],
    latest_price_doc: dict[str, Any] | None,
    technical_doc: dict[str, Any] | None,
    intel_pro_doc: dict[str, Any] | None,
    avg_volume: float | None = None,
    store: Any | None = None,
    history_points: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Generate an LLM brief for stocks with no news coverage.

    Accepts the native main-pipeline document shapes:
      - `latest_price_doc`: a `tm_latest_prices` row (snake_case `quote.*`)
      - `technical_doc`: a `build_stock_technical_doc()` output
      - `intel_pro_doc`: a `tm_stock_intel_pro` row (scored four-pillar doc)

    `avg_volume` is derived from `tm_price_snapshots` history in the caller so
    this function stays pure and testable.
    """
    api_key = llm_api_key()
    if not api_key:
        return None

    model = llm_model()
    ticker = str(instrument.get("ticker", "")).strip()
    name = str(instrument.get("name", ticker))

    quote = (latest_price_doc or {}).get("quote") or {}
    current = _nn_to_float(quote.get("current"))
    change_pct = _nn_to_float(quote.get("day_change_pct"))
    volume = _nn_to_float(quote.get("volume"))
    vol_vs_avg: float | str = "unknown"
    if volume is not None and avg_volume and avg_volume > 0:
        vol_vs_avg = round(volume / avg_volume, 2)

    rsi14: float | str = "unknown"
    from_high_pct: float | str = "unknown"
    if technical_doc:
        rsi_value = _nn_to_float((technical_doc.get("rsi_14") or {}).get("value"))
        if rsi_value is not None:
            rsi14 = rsi_value
        distance_value = _nn_to_float((technical_doc.get("distance") or {}).get("from_52w_high_pct"))
        if distance_value is not None:
            from_high_pct = distance_value
    trend = _derive_trend(technical_doc)

    rating_label, target_price, upside_pct = _extract_analyst_from_intel_pro(intel_pro_doc, current)

    payload = {
        "ticker": ticker,
        "company_name": name,
        "price_current": current if current is not None else 0,
        "price_change_pct": change_pct if change_pct is not None else 0,
        "volume_vs_avg": vol_vs_avg,
        "rsi14": rsi14,
        "from_52w_high_pct": from_high_pct,
        "trend": trend,
        "analyst_rating": rating_label,
        "analyst_target_price": target_price if target_price is not None else "unknown",
        "analyst_upside_pct": upside_pct if upside_pct is not None else "unknown",
    }

    cache_key = None
    if store is not None:
        digest = hashlib.sha256(
            json.dumps([NO_NEWS_BRIEF_CACHE_VERSION, model, payload], sort_keys=True).encode()
        ).hexdigest()
        cache_key = f"no_news_brief_{digest}"
        try:
            cached = store.get_llm_enrichment(cache_key)
            if cached and isinstance(cached.get("payload"), dict):
                return cached["payload"]
        except Exception:
            pass

    try:
        body = post_chat_completion(
            messages=[
                {"role": "system", "content": schema_system_prompt(NO_NEWS_BRIEF_SYSTEM_PROMPT, STOCK_BRIEF_SCHEMA)},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            model=model,
            temperature=0.2,
            response_format=json_response_format(),
            timeout=30,
            stage="no_news_brief",
        )
        content = body["choices"][0]["message"]["content"]
        result = parse_json_content(content)

        if store is not None and cache_key:
            try:
                store.save_llm_enrichment(cache_key, {
                    "payload": result,
                    "model": model,
                    "cache_version": NO_NEWS_BRIEF_CACHE_VERSION,
                })
            except Exception:
                pass

        return result
    except Exception as exc:
        logger.warning("No-news brief generation failed for %s: %s", ticker, exc)
        return None


def build_no_news_intelligence_doc(
    instrument: dict[str, Any],
    market: str,
    universe_id: str,
    latest_price_doc: dict[str, Any] | None,
    technical_doc: dict[str, Any] | None,
    intel_pro_doc: dict[str, Any] | None,
    avg_volume: float | None = None,
    store: Any | None = None,
    history_points: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Package a no-news LLM brief into the same shape as
    `build_stock_intelligence_docs` produces, so it can be saved to
    `tm_stock_intelligence` alongside news-backed briefs."""
    brief = generate_no_news_brief(
        instrument=instrument,
        latest_price_doc=latest_price_doc,
        technical_doc=technical_doc,
        intel_pro_doc=intel_pro_doc,
        avg_volume=avg_volume,
        store=store,
    )
    if not brief:
        return None

    now_utc = datetime.now(timezone.utc)
    instrument_id = instrument["instrument_id"]
    quote = (latest_price_doc or {}).get("quote") or {}
    day_change = _nn_to_float(quote.get("day_change_pct")) or 0.0
    current_price = _nn_to_float(quote.get("current"))
    ticker = str(instrument.get("ticker") or "").strip().upper()

    headline = str(brief.get("headline", "")).strip()
    body = str(brief.get("body", "")).strip()
    thesis = " ".join(str(brief.get("thesis", "")).split()).strip() or headline
    setup_state = str(brief.get("setup_state", "unclear")).strip() or "unclear"
    catalyst = str(brief.get("catalyst", "")).strip()
    risk = str(brief.get("risk", "")).strip()
    key_findings = [str(point).strip() for point in (brief.get("key_findings") or []) if str(point).strip()][:4]

    raw_drivers = brief.get("drivers", []) or []
    drivers = _normalize_driver_cards(raw_drivers, key_findings, limit=4)
    if not drivers:
        drivers = _fundamental_driver_cards(_summarize_intel_pro(intel_pro_doc), limit=3)
    raw_catalyst_cards = brief.get("catalyst_cards", []) or []
    catalyst_cards = _normalize_raw_catalyst_cards(raw_catalyst_cards, limit=3)
    raw_risk_cards = brief.get("risk_cards", []) or []
    risk_cards = _normalize_risk_cards(raw_risk_cards, limit=3)
    if not risk_cards:
        risk_cards = _fundamental_risk_cards(_summarize_intel_pro(intel_pro_doc), limit=2)
    raw_directive = brief.get("directive")
    directive = None
    if isinstance(raw_directive, dict) and str(raw_directive.get("text", "")).strip():
        directive = _repair_directive(dict(raw_directive), current_price=current_price)

    def _mentions_wrong_ticker(value: str) -> bool:
        symbols = set(re.findall(r"\b[A-Z]{2,5}\b", str(value or "")))
        allowed = {ticker, "AI", "CEO", "CFO", "EPS", "ETF", "IPO", "Q1", "Q2", "Q3", "Q4", "TTM", "YoY"}
        return bool(symbols - allowed)

    if _mentions_wrong_ticker(" ".join([headline, body, thesis])):
        headline = f"{ticker} coverage is quiet"
        body = (
            f"Recent company-specific coverage is thin for {ticker}. "
            "Use the current fundamentals, analyst target, and technical context rather than treating stale headlines as a fresh catalyst."
        )
        thesis = headline
        catalyst = ""
        catalyst_cards = []
    if not headline:
        headline = f"{ticker} coverage is quiet"
    if not body:
        body = (
            f"Recent company-specific coverage is thin for {ticker}. "
            "Use price, fundamentals, and analyst context until fresh stock-specific news appears."
        )
    if not thesis:
        thesis = headline
    if not drivers:
        drivers = [{
            "label": "Quiet tape",
            "detail": f"Recent company-specific coverage is thin for {ticker}, so the setup depends more on price and fundamentals.",
            "direction": "mixed",
            "strength": 2,
            "horizon": "week",
        }]

    previous_v2 = None
    anomaly_doc = None
    if store is not None:
        try:
            prev_doc = store.get_stock_intelligence_doc(market, universe_id, instrument_id)
            previous_v2 = (prev_doc or {}).get("directive_v2")
            if not isinstance(previous_v2, dict):
                previous_v2 = None
        except Exception:
            previous_v2 = None
        try:
            ticker = str(instrument.get("ticker") or "").strip().upper()
            anomaly_doc = store.get_daily_anomaly_ticker_docs_batch(market, [ticker]).get(f"{market.upper()}__{ticker}")
        except Exception:
            anomaly_doc = None

    visual_cards = _visual_cards(
        drivers=drivers,
        catalyst_cards=catalyst_cards,
        risk_cards=risk_cards,
    )
    doc = {
        "instrument_id": instrument_id,
        "market": market,
        "universe_id": universe_id,
        "source": LLM_BRIEF_SOURCE,
        "coverage_type": "on_demand_no_news",
        "generated_at": now_utc.isoformat(),
        "as_of": now_utc.isoformat(),
        "headline": headline,
        "body": body,
        "thesis": thesis,
        "setup_state": setup_state,
        "catalyst": catalyst,
        "risk": risk,
        "key_points": key_findings,
        "visual_summary": visual_cards,
        "visual_cards": visual_cards,
        "directive": directive,
        "current_price": current_price,
        "fundamentals": _summarize_intel_pro(intel_pro_doc),
        "price_context": _summarize_price_context(latest_price_doc, technical_doc, history_points),
        "news_digest": {},
        "anomaly_digest": _build_anomaly_digest(anomaly_doc),
        "overall_label": "neutral",
        "overall_score": 50,
        "lanes": [
            {"label": "Positive Mentions", "positive_pct": 50},
            {"label": "Source Agreement", "positive_pct": 50},
        ],
        "sources_breakdown": [],
        "news_count": 0,
        "source_count": 0,
        "latest_article_at": None,
        "mention_volume_series": [],
        "related_instrument_ids": [],
        "timeline": [],
        "data_quality": {
            "confidence_score": 25,
            "freshness_status": "no_news",
            "freshness_hours": None,
            "evidence_count": 0,
            "source_tier_mix": {},
        },
        "comparative_context": {
            "day_change_pct": round(day_change, 4),
            "vs_market_day_change_pct": 0.0,
            "vs_sector_day_change_pct": 0.0,
            "market_percentile": 50,
        },
        "run_context": {
            "run_at": now_utc.isoformat(),
            "lookback_hours": 24,
            "namespace": f"{market}__{universe_id}",
            "has_prior_run": False,
            "no_news_fallback": True,
        },
    }
    doc["directive_v2"] = build_directive_v2(doc, previous_v2=previous_v2)
    return doc


PORTFOLIO_BRIEF_SYSTEM_PROMPT = """You produce structured intelligence cards for a premium market app dashboard. Think Bloomberg Terminal meets Morning Brew - each card is a discrete, punchy insight.

You get the user's watchlist with price moves, headlines, sentiment, catalysts, sectors, analyst data, and news. Each stock has a `position_type` ("holding" = real money in it, "watchlist" = tracking only) and optionally a `portfolio_weight_pct` (% of the user's entered portfolio value). When portfolio_weight_pct is present for all holdings, use it to weight your risk assessment — a 30% holding with bad news is 10× more urgent than a 3% one. Prioritize movers, signals, and risk language based on actual dollar exposure, not equal weight. If portfolio weights are absent, treat all stocks equally.

Your job is to generate content for FOUR distinct intelligence cards. Each card must be self-contained and cover different ground.

**narrative**: 2-3 sentences summarizing the single most important story across the entire portfolio today. Not "stocks are up/down" - the THEME. What's driving the market, what changed, what matters for THIS portfolio. Write like a sharp newsletter opener. Max 50 words. Don't mention specific prices or percentages - the user sees those on the tiles. Focus on the WHY.

Example: "The AI trade is fracturing. NVDA keeps pulling away from AMD on data-center wins, and your tech-heavy portfolio is riding that wave - but the gap is getting unsustainable. Watch for a rotation into value names if bond yields spike again this week."

**tiles**: An array with EXACTLY ONE entry for EACH stock in the watchlist. Each tile replaces a chart with actual intelligence. Each entry needs:
  - ticker: the stock symbol
  - micro: A 5-10 word insight - the single most important thing to know about THIS stock RIGHT NOW. Examples: "Riding AI spending wave", "Earnings Apr 27 - analysts bullish", "RSI overbought, pullback likely", "Defense budget boost incoming", "Revenue miss fears building". Be specific - include dates, events, numbers when you know them. If earnings are upcoming, ALWAYS mention the date.
  - vibe: "up" (momentum/opportunity), "down" (risk/weakness), or "wild" (volatile/uncertain)

**movers**: An array of up to 4 stocks from the watchlist that had the most dramatic or newsworthy action. Each entry needs:
  - ticker: the symbol
  - one_liner: A punchy 8-15 word insight (not "up 3% today" - more like "earnings whisper numbers just leaked and they're ugly")
  - vibe: "up", "down", or "wild"

**signals**: An array of exactly 3 external forces / macro events / geopolitical things that affect this specific portfolio. Each signal needs:
  - tag: A short category label, 1-2 words (e.g., "Fed", "Oil", "Tariffs", "Earnings", "China", "AI Spending", "Bonds", "Currency")
  - headline: A punchy 6-12 word insight headline
  - body: 1-2 sentences explaining the signal and how it connects to the user's holdings. Max 40 words.
  - detail: A longer 3-5 sentence deep-dive explanation of this signal. Include specific data points, historical context, or expert opinions that make the user smarter. Max 80 words. This is shown when the user clicks "read more".
  - vibe: "positive", "negative", or "neutral"

**blind_spot_title**: A 4-8 word intriguing headline about what the user is MISSING. Something they'd want to click on. Based on their portfolio composition - what sectors, themes, rotations are they not exposed to?

**blind_spot_body**: 2-3 sentences about what they're missing and why it matters. Be specific about sectors, themes, or trends they have zero exposure to. Max 50 words.

**essential_events**: Return 3 to 5 most important events max. Each event MUST be one sentence and highly scannable. Keep language punchy but professional.
Each entry needs:
  - sentence: max 18 words, one sentence only.
  - event_type: one of ["macro", "earnings", "guidance", "policy", "flow", "technical", "sentiment"]
  - scope: "market" | "sector" | "stock"
  - direction: "up" | "down" | "mixed"
  - confidence: "low" | "med" | "high"
  - impact_score: 0-100, where 100 is highest urgency.
  - evidence: 1-3 short tokens (examples: "oil +4.1%", "EPS miss", "3 sources")
  - symbol: stock symbol when scope is stock, else empty
  - sector_id: sector id when scope is sector, else empty

MARKET REGIME - USE IT:
- The payload may include a `market_regime` block with a `macro` read (market_phase, risk_appetite, narrative, leadership sectors, laggards, rotation_signal) and a `sectors` array with per-sector regime data (regime, conviction, narrative, invalidators, leadership_stocks).
- Let the regime shape your narrative and signals. A stock in a "breaking_down" sector with a bullish directive should have lower conviction and acknowledge the sector headwind. A stock in a "momentum" or "expanding" sector can be leaned into more confidently.
- If rotation_signal is non-empty, surface it in the narrative or blind_spot — it's the kind of macro context users can't get from a stock screener.
- Laggard sectors = blind spot candidates if the user has no exposure.
- Do NOT just repeat the regime label verbatim. Interpret it. "Semis are in a confirmed momentum regime with 80% breadth" beats "regime: momentum".
- If market_regime is absent, proceed without it.

STYLE:
- Every field should be insight-first. Never narrate price moves.
- Only mention earnings/events if they appear in current_events or premium_signals. Never invent or reuse stale event dates.
- RSI language must be precise: RSI <=35 can be called oversold/washed out; RSI >=70 can be called overbought/stretched; 35-70 is neutral/normal.
- Write like you're texting a smart friend, not writing a research report
- Bold claims > hedged language. "That's a problem" > "this could potentially be concerning"
- Specific > vague. Name the stock, the event, the number
- Each card covers COMPLETELY different ground - zero repetition across cards
- essential_events must be mixed across market and watchlist if possible
- avoid slang; keep tone sharp and professional
"""

PORTFOLIO_BRIEF_SCHEMA = {
    "name": "portfolio_brief",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "narrative": {
                "type": "string",
                "description": "2-3 sentence portfolio story. The theme, not the numbers. Max 50 words.",
            },
            "movers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ticker": {"type": "string"},
                        "one_liner": {"type": "string", "description": "8-15 word insight, not a price narration."},
                        "vibe": {"type": "string", "enum": ["up", "down", "wild"]},
                    },
                    "required": ["ticker", "one_liner", "vibe"],
                    "additionalProperties": False,
                },
                "description": "Up to 4 stocks with dramatic or newsworthy action.",
            },
            "signals": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "tag": {"type": "string", "description": "1-2 word category label."},
                        "headline": {"type": "string", "description": "6-12 word insight headline."},
                        "body": {"type": "string", "description": "1-2 sentences, max 40 words."},
                        "detail": {"type": "string", "description": "3-5 sentence deep-dive. Max 80 words."},
                        "vibe": {"type": "string", "enum": ["positive", "negative", "neutral"]},
                    },
                    "required": ["tag", "headline", "body", "detail", "vibe"],
                    "additionalProperties": False,
                },
                "description": "Exactly 3 external forces / macro signals.",
            },
            "blind_spot_title": {
                "type": "string",
                "description": "4-8 word intriguing headline about what the user is missing.",
            },
            "blind_spot_body": {
                "type": "string",
                "description": "2-3 sentences about what they're missing. Max 50 words.",
            },
            "tiles": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ticker": {"type": "string"},
                        "micro": {
                            "type": "string",
                            "description": "5-10 word insight - the single most important thing about this stock RIGHT NOW. Examples: 'Riding AI spending wave', 'Earnings Apr 27 - analysts bullish', 'RSI overbought, pullback likely'.",
                        },
                        "vibe": {"type": "string", "enum": ["up", "down", "wild"]},
                    },
                    "required": ["ticker", "micro", "vibe"],
                    "additionalProperties": False,
                },
                "description": "EXACTLY one entry per stock in the watchlist. Replaces charts with actual intelligence.",
            },
            "essential_events": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "sentence": {"type": "string"},
                        "event_type": {"type": "string", "enum": ["macro", "earnings", "guidance", "policy", "flow", "technical", "sentiment"]},
                        "scope": {"type": "string", "enum": ["market", "sector", "stock"]},
                        "direction": {"type": "string", "enum": ["up", "down", "mixed"]},
                        "confidence": {"type": "string", "enum": ["low", "med", "high"]},
                        "impact_score": {"type": "number"},
                        "evidence": {"type": "array", "items": {"type": "string"}},
                        "symbol": {"type": "string"},
                        "sector_id": {"type": "string"},
                    },
                    "required": ["sentence", "event_type", "scope", "direction", "confidence", "impact_score", "evidence", "symbol", "sector_id"],
                    "additionalProperties": False,
                },
                "description": "3-5 one-sentence cards for the dashboard's essential events feed.",
            },
        },
        "required": ["narrative", "movers", "signals", "blind_spot_title", "blind_spot_body", "tiles", "essential_events"],
        "additionalProperties": False,
    },
}

PORTFOLIO_BRIEF_CACHE_VERSION = "2026-05-27-portfolio-brief-v14"


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")


def _stock_market_regime(
    instrument: dict[str, Any],
    fundamentals: dict[str, Any] | None,
    sector_regimes: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not sector_regimes:
        return None

    regime_context: dict[str, Any] = {}
    macro = sector_regimes.get("macro") or {}
    if macro:
        regime_context["macro"] = {
            "market_phase": macro.get("market_phase"),
            "risk_appetite": macro.get("risk_appetite"),
            "narrative": macro.get("narrative"),
            "leadership": macro.get("leadership") or [],
            "laggards": macro.get("laggards") or [],
            "rotation_signal": macro.get("rotation_signal") or "",
        }

    sector_candidates = [
        str(instrument.get("sector") or "").strip(),
        str((fundamentals or {}).get("sector") or "").strip(),
    ]
    seen_sector_slugs: set[str] = set()
    sector_slug_candidates: list[str] = []
    for value in sector_candidates:
        if not value:
            continue
        slug = _slugify(value)
        if slug in seen_sector_slugs:
            continue
        seen_sector_slugs.add(slug)
        sector_slug_candidates.append(slug)
    for slug in sector_slug_candidates:
        regime = sector_regimes.get(slug) or {}
        if not regime:
            continue
        regime_context["sector"] = {
            "sector": regime.get("sector"),
            "regime": regime.get("regime"),
            "conviction": regime.get("conviction"),
            "narrative": regime.get("narrative"),
            "invalidators": regime.get("invalidators") or [],
            "leadership_stocks": regime.get("leadership_stocks") or [],
        }
        break

    return regime_context or None


def generate_portfolio_brief(
    stock_payloads: list[dict[str, Any]],
    store: Any | None = None,
    sector_regimes: dict[str, Any] | None = None,
) -> dict[str, str] | None:
    """Generate a personalized portfolio brief from stock intelligence docs."""
    api_key = llm_api_key()
    if not api_key or not stock_payloads:
        return None

    model = llm_model()

    watchlist_data = []
    today_utc = datetime.now(timezone.utc).date()
    for doc in stock_payloads:
        price = doc.get("price", {})
        technicals = doc.get("technicals", {})
        analyst = doc.get("analystConsensus", {})
        facts = doc.get("facts", {})
        volume = price.get("volume", 0) or 0
        avg_volume = price.get("avgVolume", 0) or 0
        try:
            volume_vs_avg = round(float(volume) / max(float(avg_volume), 1.0), 2)
        except (TypeError, ValueError):
            volume_vs_avg = 0.0
        raw_events = (facts.get("events") or [])[:3]
        filtered_events = _filter_current_events(raw_events, today=today_utc)
        earnings_date_raw = (doc.get("earnings") or {}).get("date")
        earnings_date = earnings_date_raw if _is_future_or_today(earnings_date_raw, today=today_utc) else None
        watchlist_data.append({
            "ticker": doc.get("symbol", ""),
            "name": doc.get("name", ""),
            "sector": doc.get("sector", ""),
            "position_type": doc.get("position_type", "watchlist"),
            "portfolio_weight_pct": doc.get("portfolio_weight_pct"),
            "price_current": price.get("current", 0),
            "price_change_pct": price.get("changePct", 0),
            "volume_vs_avg": volume_vs_avg,
            "headline": doc.get("bottomLine", "")[:300],
            "sentiment_score": doc.get("sentiment", {}).get("overall", 0),
            "sentiment_trend": doc.get("sentiment", {}).get("trend", "stable"),
            "key_drivers": (doc.get("sentiment", {}).get("drivers") or [])[:3],
            "catalysts": (doc.get("catalysts") or [])[:2],
            "rsi14": technicals.get("rsi14", 0),
            "from_52w_high": technicals.get("fromHigh", ""),
            "technical_trend": technicals.get("trend", "neutral"),
            "analyst_rating": analyst.get("rating", ""),
            "analyst_target_upside": doc.get("targetUpsidePct") or analyst.get("upside", 0),
            "analyst_count": (facts.get("analyst") or {}).get("analyst_count"),
            "returns": doc.get("returns") or {},
            "ownership": doc.get("ownership") or {},
            "financials": doc.get("financials") or {},
            "premium_signals": (doc.get("premiumSignals") or [])[:6],
            "current_events": filtered_events,
            "news_velocity": doc.get("newsVelocity") or {},
            "key_metric_summaries": doc.get("keyMetricSummaries") or [],
            "article_count": len(doc.get("news", [])),
            "top_news": [n.get("title", "") for n in (doc.get("news") or [])[:3]],
            "earnings_date": earnings_date,
            "earnings_eps_estimate": (doc.get("earnings") or {}).get("epsEstimate"),
            "streak_days": (doc.get("streak") or {}).get("days", 0),
            "streak_direction": (doc.get("streak") or {}).get("direction", "flat"),
        })

    # Build a slim regime context — only sectors the user actually holds/watches,
    # plus the macro read. This keeps the prompt tight and directly relevant.
    regime_context: dict[str, Any] = {}
    if sector_regimes:
        macro = sector_regimes.get("macro") or {}
        if macro:
            regime_context["macro"] = {
                "market_phase": macro.get("market_phase"),
                "risk_appetite": macro.get("risk_appetite"),
                "narrative": macro.get("narrative"),
                "leadership": macro.get("leadership") or [],
                "laggards": macro.get("laggards") or [],
                "rotation_signal": macro.get("rotation_signal") or "",
            }
        # Find which sectors appear in the user's watchlist
        user_sectors = {
            _slugify(str(s.get("sector") or ""))
            for s in stock_payloads
            if s.get("sector")
        }
        relevant_sector_regimes = []
        for slug, regime in sector_regimes.items():
            if slug == "macro":
                continue
            if slug in user_sectors or str(regime.get("sector") or "").lower().replace(" ", "_") in user_sectors:
                relevant_sector_regimes.append({
                    "sector": regime.get("sector"),
                    "regime": regime.get("regime"),
                    "conviction": regime.get("conviction"),
                    "narrative": regime.get("narrative"),
                    "invalidators": regime.get("invalidators") or [],
                    "leadership_stocks": regime.get("leadership_stocks") or [],
                })
        if relevant_sector_regimes:
            regime_context["sectors"] = relevant_sector_regimes

    payload = {
        "watchlist": watchlist_data,
        "stock_count": len(watchlist_data),
        **({"market_regime": regime_context} if regime_context else {}),
    }

    # Check cache
    cache_key = None
    if store is not None:
        digest = hashlib.sha256(
            json.dumps([PORTFOLIO_BRIEF_CACHE_VERSION, model, payload], sort_keys=True).encode()
        ).hexdigest()
        cache_key = f"portfolio_brief_{digest}"
        try:
            cached = store.get_llm_enrichment(cache_key)
            if cached and isinstance(cached.get("payload"), dict):
                return cached["payload"]
        except Exception:
            pass

    try:
        body = post_chat_completion(
            messages=[
                {"role": "system", "content": schema_system_prompt(PORTFOLIO_BRIEF_SYSTEM_PROMPT, PORTFOLIO_BRIEF_SCHEMA)},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            model=model,
            temperature=0.3,
            response_format=json_response_format(),
            timeout=30,
            stage="portfolio_brief",
        )
        content = body["choices"][0]["message"]["content"]
        result = parse_json_content(content)

        if store is not None and cache_key:
            try:
                store.save_llm_enrichment(cache_key, {
                    "payload": result,
                    "model": model,
                    "cache_version": PORTFOLIO_BRIEF_CACHE_VERSION,
                })
            except Exception:
                pass

        return result
    except Exception as exc:
        logger.warning("Portfolio brief generation failed: %s", exc)
        return None


MARKET_BRIEF_SYSTEM_PROMPT = """You write the daily market brief for a premium market app. Think Morning Brew meets Goldman Sachs - smart but effortless to read.

The user sees index values, charts, and change% already. Don't narrate numbers back. Deliver insight.

You receive market-level data: index performance, global cues (oil, gold, DXY, VIX, 10-year yield), top movers, sentiment, and stock-level headlines.

Write THREE sections. Use SHORT paragraphs (2-3 sentences max each). Separate paragraphs with \\n\\n. Conversational but sharp.

**overview**: The story behind today's market. Why are things moving this way? What's the tension? What's the market telling us between the lines? 2-3 short paragraphs.

**global_forces**: The macro forces actually driving things. Not "oil dropped" - why it dropped and what that means for THIS market. Only cover what matters. Use \\n\\n between paragraphs. 1-2 short paragraphs.

**outlook**: The one thing to watch next. What's priced in, what would surprise, what breaks if expectations are wrong. 1 paragraph.

STYLE:
- Short paragraphs. Never more than 3 sentences without a \\n\\n break
- Mix punchy sentences with explanation
- NEVER narrate price moves as the point. Numbers support insights, they're not insights
- No filler: "investors should monitor", "markets are volatile"
- Write like you're texting a smart friend their morning update
"""

MARKET_BRIEF_SCHEMA = {
    "name": "market_brief",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "overview": {
                "type": "string",
                "description": "4-5 sentence market overview - the main narrative.",
            },
            "global_forces": {
                "type": "string",
                "description": "3-4 sentences on global/macro forces shaping the market.",
            },
            "outlook": {
                "type": "string",
                "description": "2-3 sentences on what to watch next.",
            },
        },
        "required": ["overview", "global_forces", "outlook"],
        "additionalProperties": False,
    },
}

MARKET_BRIEF_CACHE_VERSION = "2026-04-12-market-brief-v3"


def generate_market_brief(
    market: str,
    indices: list[dict[str, Any]],
    global_cues: dict[str, Any],
    top_movers: dict[str, Any],
    sentiment: dict[str, Any],
    stock_headlines: list[str],
    store: Any | None = None,
) -> dict[str, str] | None:
    """Generate a rich LLM-powered market brief."""
    api_key = llm_api_key()
    if not api_key:
        return None

    model = llm_model()

    payload = {
        "market": market,
        "indices": indices,
        "global_cues": global_cues,
        "top_movers": top_movers,
        "sentiment": sentiment,
        "stock_headlines": stock_headlines[:8],
    }

    cache_key = None
    if store is not None:
        digest = hashlib.sha256(
            json.dumps([MARKET_BRIEF_CACHE_VERSION, model, payload], sort_keys=True).encode()
        ).hexdigest()
        cache_key = f"market_brief_{digest}"
        try:
            cached = store.get_llm_enrichment(cache_key)
            if cached and isinstance(cached.get("payload"), dict):
                return cached["payload"]
        except Exception:
            pass

    try:
        body = post_chat_completion(
            messages=[
                {"role": "system", "content": schema_system_prompt(MARKET_BRIEF_SYSTEM_PROMPT, MARKET_BRIEF_SCHEMA)},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            model=model,
            temperature=0.3,
            response_format=json_response_format(),
            timeout=30,
            stage="market_brief",
        )
        result = parse_json_content(body["choices"][0]["message"]["content"])

        if store is not None and cache_key:
            try:
                store.save_llm_enrichment(cache_key, {"payload": result, "model": model, "cache_version": MARKET_BRIEF_CACHE_VERSION})
            except Exception:
                pass

        return result
    except Exception as exc:
        logger.warning("Market brief generation failed: %s", exc)
        return None


SECTOR_BRIEF_SYSTEM_PROMPT = """You write sector briefs for a premium market app. Morning Brew meets Goldman Sachs - smart but easy to read.

The user sees stock prices and charts already. Don't narrate numbers. Deliver insight.

You receive sector data: stocks with price moves and headlines, overall sentiment, performance vs market, top movers.

Write TWO sections. Use SHORT paragraphs (2-3 sentences max each). Separate paragraphs with \\n\\n.

**analysis**: The story behind this sector. Why are things moving? What's the tension within the sector? Are stocks diverging and why? What does it mean? 2-3 short paragraphs.

**outlook**: The one catalyst to watch for this sector. What's priced in and what would surprise. 1 paragraph.

STYLE:
- Short paragraphs, never more than 3 sentences without a \\n\\n break
- Mix punchy short sentences with explanation
- NEVER narrate price moves as the point
- No filler phrases
- Write like a sharp friend texting, not a report
"""

SECTOR_BRIEF_SCHEMA = {
    "name": "sector_brief",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "analysis": {
                "type": "string",
                "description": "4-5 sentence sector analysis - what's happening and why.",
            },
            "outlook": {
                "type": "string",
                "description": "2-3 sentences on what to watch for this sector.",
            },
        },
        "required": ["analysis", "outlook"],
        "additionalProperties": False,
    },
}

SECTOR_BRIEF_CACHE_VERSION = "2026-04-12-sector-brief-v3"


def generate_sector_brief(
    sector_name: str,
    sector_data: dict[str, Any],
    stock_details: list[dict[str, Any]],
    store: Any | None = None,
) -> dict[str, str] | None:
    """Generate a rich LLM-powered sector brief."""
    api_key = llm_api_key()
    if not api_key:
        return None

    model = llm_model()

    payload = {
        "sector_name": sector_name,
        "performance_change_pct": sector_data.get("performance", {}).get("changePct", 0),
        "vs_market": sector_data.get("performance", {}).get("vsMarket", "flat"),
        "sentiment_overall": sector_data.get("sentiment", {}).get("overall", 0),
        "sentiment_label": sector_data.get("sentiment", {}).get("label", "mixed"),
        "top_movers": sector_data.get("topMovers", {}),
        "stocks": stock_details[:10],
    }

    cache_key = None
    if store is not None:
        digest = hashlib.sha256(
            json.dumps([SECTOR_BRIEF_CACHE_VERSION, model, payload], sort_keys=True).encode()
        ).hexdigest()
        cache_key = f"sector_brief_{digest}"
        try:
            cached = store.get_llm_enrichment(cache_key)
            if cached and isinstance(cached.get("payload"), dict):
                return cached["payload"]
        except Exception:
            pass

    try:
        body = post_chat_completion(
            messages=[
                {"role": "system", "content": schema_system_prompt(SECTOR_BRIEF_SYSTEM_PROMPT, SECTOR_BRIEF_SCHEMA)},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            model=model,
            temperature=0.3,
            response_format=json_response_format(),
            timeout=30,
            stage="sector_brief",
        )
        result = parse_json_content(body["choices"][0]["message"]["content"])

        if store is not None and cache_key:
            try:
                store.save_llm_enrichment(cache_key, {"payload": result, "model": model, "cache_version": SECTOR_BRIEF_CACHE_VERSION})
            except Exception:
                pass

        return result
    except Exception as exc:
        logger.warning("Sector brief generation failed for %s: %s", sector_name, exc)
        return None


def _repair_directive(directive: dict[str, Any], current_price: float | None = None) -> dict[str, Any]:
    """Normalize directive copy and pick one primary smart-trigger zone."""
    text = str(directive.get("text", ""))
    trigger_type = str(directive.get("trigger_type", "none"))
    trigger_value = str(directive.get("trigger_value", "")).strip()
    zone_trigger_types = {"price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"}

    def _has_past_date_hint(value: str) -> bool:
        # Handles inline month-day hints like "Apr 29 earnings" and explicit
        # ISO date mentions. If a date is in the past, the directive text
        # should not keep implying it's upcoming.
        today = datetime.now(timezone.utc).date()
        iso_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", value)
        if iso_match:
            try:
                return datetime.fromisoformat(iso_match.group(1)).date() < today
            except Exception:
                pass
        month_day = re.search(
            r"\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s\-]+(\d{1,2})\b",
            value.upper(),
        )
        if month_day:
            month_map = {
                "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
                "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
            }
            try:
                parsed = datetime(today.year, month_map[month_day.group(1)], int(month_day.group(2)), tzinfo=timezone.utc).date()
                return parsed < today
            except Exception:
                return False
        return False

    def _repair_zone(raw: Any) -> dict[str, str]:
        zone = raw if isinstance(raw, dict) else {}
        zone_text = str(zone.get("text", "")).strip()
        zone_type = str(zone.get("trigger_type", "none")).strip()
        zone_value = str(zone.get("trigger_value", "")).strip()
        if zone_type not in zone_trigger_types:
            zone_type = "none"
        price_match = re.search(r"\$(\d{1,7}(?:\.\d+)?)", zone_text)
        if price_match:
            lowered = zone_text.lower()
            zone_type = "price_below" if any(
                word in lowered for word in ("below", "under", "dip", "pullback", "support", "break", "lose", "lost")
            ) else "price_above"
            zone_value = price_match.group(1)
        elif zone_type == "date":
            today_iso = datetime.now(timezone.utc).date().isoformat()
            if not zone_value or zone_value < today_iso:
                zone_type = "none"
                zone_value = ""
        elif zone_type in ("sentiment_flip", "new_catalyst", "none"):
            zone_value = ""
        return {
            "text": zone_text,
            "trigger_type": zone_type,
            "trigger_value": zone_value,
        }

    def _zone_price(zone: dict[str, str]) -> float | None:
        if zone.get("trigger_type") not in ("price_below", "price_above"):
            return None
        try:
            price = float(str(zone.get("trigger_value") or "").strip())
        except Exception:
            return None
        return price if price > 0 else None

    if _has_past_date_hint(text):
        lower = text.lower()
        if "earnings" in lower:
            text = "Re-evaluate on next earnings guidance"
        else:
            text = re.sub(r"\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s\-]+\d{1,2}\b", "", text, flags=re.IGNORECASE).strip(" ,.-")
            if not text:
                text = "Re-evaluate on next catalyst"
        directive["text"] = text

    action_now = str(directive.get("action_now", "")).strip() or text.strip()
    if not text.strip() and action_now:
        text = action_now
    if not action_now:
        action_now = text.strip()

    add_on = _repair_zone(directive.get("add_on"))
    trim_on = _repair_zone(directive.get("trim_on"))
    breaks_if = _repair_zone(directive.get("breaks_if"))

    break_price = _zone_price(breaks_if)
    if current_price and break_price:
        break_type = breaks_if["trigger_type"]
        if break_type == "price_below" and current_price <= break_price:
            text = "Watch for reclaim"
            action_now = f"Price is below the prior support at ${break_price:g}; wait for a reclaim before adding."
            directive["rationale"] = action_now
            directive["stance"] = "watch"
            add_on = {
                "text": f"Add only after reclaiming ${break_price:g}",
                "trigger_type": "price_above",
                "trigger_value": f"{break_price:g}",
            }
            breaks_if = {"text": "", "trigger_type": "none", "trigger_value": ""}
            trigger_type = "price_above"
            trigger_value = f"{break_price:g}"
        elif break_type == "price_above" and current_price >= break_price:
            text = "Watch for reset"
            action_now = f"Price is above the prior risk level at ${break_price:g}; wait for a reset before acting."
            directive["rationale"] = action_now
            directive["stance"] = "watch"
            add_on = {
                "text": f"Act only after resetting below ${break_price:g}",
                "trigger_type": "price_below",
                "trigger_value": f"{break_price:g}",
            }
            breaks_if = {"text": "", "trigger_type": "none", "trigger_value": ""}
            trigger_type = "price_below"
            trigger_value = f"{break_price:g}"

    price_match = re.search(r"\$(\d{1,7}(?:\.\d+)?)", text)
    if not price_match:
        price_match = re.search(r"\b(?:below|above|under|over)\s+(\d{1,7}(?:\.\d+)?)\b", text, re.IGNORECASE)
    if price_match:
        price_str = price_match.group(1)
        lowered = text.lower()
        if trigger_type not in ("price_below", "price_above"):
            trigger_type = "price_below" if any(
                word in lowered for word in ("below", "under", "dip", "pullback")
            ) else "price_above"
        trigger_value = price_str
        stance = str(directive.get("stance", "")).strip().lower()
        text = {
            "accumulate": "Accumulate now",
            "hold": "Hold here",
            "watch": "Watch setup",
            "trim": "Trim strength",
            "avoid": "Avoid for now",
        }.get(stance, text.strip())
    elif trigger_type == "date":
        today_iso = datetime.now(timezone.utc).date().isoformat()
        if not trigger_value or trigger_value < today_iso:
            trigger_type = "none"
            trigger_value = ""
    elif trigger_type in ("sentiment_flip", "new_catalyst", "none"):
        trigger_value = ""

    if trigger_type not in ("price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"):
        trigger_type = "none"
        trigger_value = ""

    if trigger_type == "none":
        stance = str(directive.get("stance", "")).strip().lower()
        candidates = (
            [add_on, breaks_if, trim_on]
            if stance == "accumulate"
            else [trim_on, breaks_if, add_on]
            if stance == "trim"
            else [breaks_if, add_on, trim_on]
        )
        primary = next(
            (
                zone for zone in candidates
                if zone["trigger_type"] in ("price_below", "price_above", "date")
                and zone["trigger_value"]
            ),
            None,
        )
        if primary:
            trigger_type = primary["trigger_type"]
            trigger_value = primary["trigger_value"]

    directive["text"] = text.strip()
    directive["action_now"] = action_now
    directive["trigger_type"] = trigger_type
    directive["trigger_value"] = trigger_value
    directive["add_on"] = add_on
    directive["trim_on"] = trim_on
    directive["breaks_if"] = breaks_if
    return directive


def _deterministic_directive(
    *,
    sentiment_label: str,
    current_price: float | None,
    analyst_target: float | None,
    price_context: dict[str, Any] | None,
) -> dict[str, Any]:
    if not current_price or current_price <= 0:
        return {
            "text": "Watch setup",
            "action_now": "Keep this on watch until price and fresh evidence give a cleaner setup.",
            "stance": "watch",
            "trigger_type": "new_catalyst",
            "trigger_value": "",
            "add_on": {"text": "", "trigger_type": "none", "trigger_value": ""},
            "trim_on": {"text": "", "trigger_type": "none", "trigger_value": ""},
            "breaks_if": {"text": "", "trigger_type": "none", "trigger_value": ""},
            "rationale": "No reliable live price was available for a price-based call.",
            "confidence": "low",
        }

    label = str(sentiment_label or "").lower()
    day_change = _nn_to_float((price_context or {}).get("day_change_pct")) or 0.0
    upside = ((analyst_target - current_price) / current_price * 100) if analyst_target else None
    constructive = label in {"bullish", "constructive"} or (upside is not None and upside >= 15)
    add_price = round(current_price * (0.98 if day_change >= 0 else 0.97), 2)
    break_price = round(current_price * 0.9, 2)

    if constructive:
        directive = {
            "text": "Accumulate now",
            "action_now": f"Current setup is constructive; add here and prefer pullbacks below ${add_price:g}.",
            "stance": "accumulate",
            "trigger_type": "price_below",
            "trigger_value": f"{add_price:g}",
            "add_on": {
                "text": f"Add on pullbacks below ${add_price:g}",
                "trigger_type": "price_below",
                "trigger_value": f"{add_price:g}",
            },
            "trim_on": {
                "text": f"Trim near analyst target ${analyst_target:g}" if analyst_target else "",
                "trigger_type": "price_above" if analyst_target else "none",
                "trigger_value": f"{analyst_target:g}" if analyst_target else "",
            },
            "breaks_if": {
                "text": f"Reassess if price falls below ${break_price:g}",
                "trigger_type": "price_below",
                "trigger_value": f"{break_price:g}",
            },
            "rationale": "Constructive evidence and target upside support a starter/add call while keeping a clear risk level.",
            "confidence": "med",
        }
    else:
        reclaim_price = round(current_price * 1.03, 2)
        directive = {
            "text": "Watch for reclaim",
            "action_now": f"Wait for strength above ${reclaim_price:g} before adding.",
            "stance": "watch",
            "trigger_type": "price_above",
            "trigger_value": f"{reclaim_price:g}",
            "add_on": {
                "text": f"Add only after reclaiming ${reclaim_price:g}",
                "trigger_type": "price_above",
                "trigger_value": f"{reclaim_price:g}",
            },
            "trim_on": {"text": "", "trigger_type": "none", "trigger_value": ""},
            "breaks_if": {
                "text": f"Reassess if price falls below ${break_price:g}",
                "trigger_type": "price_below",
                "trigger_value": f"{break_price:g}",
            },
            "rationale": "Evidence is not strong enough for an add-now call, so the setup needs price confirmation.",
            "confidence": "low",
        }

    return _repair_directive(directive, current_price=current_price)


def _parse_window_date_iso(raw_window: str) -> str | None:
    text = " ".join(str(raw_window or "").strip().split())
    if not text:
        return None
    iso_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    if iso_match:
        return iso_match.group(1)
    month_day = re.search(
        r"\b(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)[\s\-]+(\d{1,2})\b",
        text.upper(),
    )
    if not month_day:
        return None
    month_map = {
        "JAN": 1, "JANUARY": 1,
        "FEB": 2, "FEBRUARY": 2,
        "MAR": 3, "MARCH": 3,
        "APR": 4, "APRIL": 4,
        "MAY": 5,
        "JUN": 6, "JUNE": 6,
        "JUL": 7, "JULY": 7,
        "AUG": 8, "AUGUST": 8,
        "SEP": 9, "SEPT": 9, "SEPTEMBER": 9,
        "OCT": 10, "OCTOBER": 10,
        "NOV": 11, "NOVEMBER": 11,
        "DEC": 12, "DECEMBER": 12,
    }
    try:
        month = month_map[month_day.group(1)]
        day = int(month_day.group(2))
        year = datetime.now(timezone.utc).year
        parsed = datetime(year, month, day, tzinfo=timezone.utc).date()
        return parsed.isoformat()
    except Exception:
        return None


_MONTH_DATE_RE = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|"
    r"dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b",
    re.IGNORECASE,
)


def _has_calendar_date_phrase(value: str) -> bool:
    cleaned = " ".join(str(value or "").split()).strip()
    if not cleaned:
        return False
    return bool(_parse_window_date_iso(cleaned) or _MONTH_DATE_RE.search(cleaned))


def _drop_stale_catalysts(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    today_iso = datetime.now(timezone.utc).date().isoformat()
    kept: list[dict[str, Any]] = []
    for card in cards:
        window_iso = _parse_window_date_iso(str(card.get("window", "")))
        if window_iso and window_iso < today_iso:
            continue
        kept.append(card)
    return kept


def _earnings_event_date(earnings: dict[str, Any] | None) -> str | None:
    if not isinstance(earnings, dict):
        return None
    if str(earnings.get("status") or "").strip().lower() != "upcoming":
        return None
    event_date = str(earnings.get("event_date") or "").strip()[:10]
    if not event_date:
        return None
    try:
        parsed = datetime.fromisoformat(event_date).date()
    except Exception:
        return None
    today = datetime.now(timezone.utc).date()
    if parsed < today:
        return None
    return parsed.isoformat()


def _looks_like_earnings_card(card: dict[str, Any]) -> bool:
    text = " ".join(
        str(card.get(field) or "").strip()
        for field in ("event", "detail", "window")
    ).lower()
    return "earnings" in text


def _normalize_catalyst_cards(
    cards: list[dict[str, Any]],
    *,
    earnings: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Keep catalyst cards grounded in the payload's actual earnings timing.

    The model may talk about earnings as a catalyst, but it is only allowed to
    attach a concrete date when the payload has a future earnings block. We
    normalize those cards to the canonical payload date here so the rendered
    brief never shows an invented or stale print.
    """
    upcoming_earnings_date = _earnings_event_date(earnings)
    upcoming_earnings_label = ""
    if upcoming_earnings_date:
        try:
            upcoming_earnings_label = datetime.fromisoformat(upcoming_earnings_date).strftime("%b %d")
        except Exception:
            upcoming_earnings_label = upcoming_earnings_date

    normalized: list[dict[str, Any]] = []
    for raw_card in cards:
        if not isinstance(raw_card, dict):
            continue
        card = dict(raw_card)
        event = " ".join(str(card.get("event") or "").split()).strip()
        detail = " ".join(str(card.get("detail") or "").split()).strip()
        window = " ".join(str(card.get("window") or "").split()).strip()
        text = " ".join(part for part in [event, detail, window] if part).lower()
        earnings_like = "earnings" in text
        date_hint = (
            _parse_window_date_iso(event)
            or _parse_window_date_iso(detail)
            or _parse_window_date_iso(window)
        )
        has_date_phrase = (
            _has_calendar_date_phrase(event)
            or _has_calendar_date_phrase(detail)
            or _has_calendar_date_phrase(window)
        )

        if earnings_like:
            if upcoming_earnings_date:
                card["window"] = upcoming_earnings_date
                if date_hint and date_hint != upcoming_earnings_date:
                    card["event"] = f"Earnings {upcoming_earnings_label}".strip()
                elif not event:
                    card["event"] = f"Earnings {upcoming_earnings_label}".strip()
                normalized.append(card)
                continue

            # Reported or missing earnings should not surface a concrete date.
            is_reported = isinstance(earnings, dict) and str(earnings.get("status") or "").strip().lower() == "reported"
            if has_date_phrase and not is_reported:
                continue
            card["window"] = "post-earnings" if is_reported else "near-term"
            if event and _has_calendar_date_phrase(event):
                card["event"] = "Earnings setup"
            elif not event:
                card["event"] = "Earnings setup"
            if detail and _has_calendar_date_phrase(detail):
                card["detail"] = re.sub(
                    r"\b(\d{4}-\d{2}-\d{2})\b|"
                    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
                    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|"
                    r"dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b",
                    "",
                    detail,
                    flags=re.IGNORECASE,
                ).strip(" ,.-")
            normalized.append(card)
            continue

        normalized.append(card)

    return _drop_stale_catalysts(normalized)


def _has_invalid_earnings_timing(text: str, earnings: dict[str, Any] | None) -> bool:
    cleaned = " ".join(str(text or "").split()).strip()
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if "earnings" not in lowered:
        return False
    upcoming_earnings_date = _earnings_event_date(earnings)
    hinted_date = _parse_window_date_iso(cleaned)
    if upcoming_earnings_date:
        return bool(hinted_date and hinted_date != upcoming_earnings_date)
    if hinted_date or _has_calendar_date_phrase(cleaned):
        return True
    return "upcoming earnings" in lowered or "earnings report" in lowered


def _score_from_sentiment(value: float) -> int:
    score = 50 + (value * 50)
    return max(5, min(95, int(round(score))))


def _label_from_score(score: int) -> str:
    if score >= 75:
        return "bullish"
    if score >= 60:
        return "constructive"
    if score >= 45:
        return "mixed"
    if score >= 30:
        return "cautious"
    return "bearish"


def _clean_points(values: list[str], limit: int = 4) -> list[str]:
    seen: list[str] = []
    for value in values:
        cleaned = " ".join(str(value).split()).strip()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
        if len(seen) >= limit:
            break
    return seen


def _normalize_text(value: str) -> str:
    return " ".join(str(value).lower().split()).strip().rstrip(".")


def _stable_digest(*parts: str, size: int = 12) -> str:
    payload = "||".join(parts).encode("utf-8")
    return hashlib.sha1(payload).hexdigest()[:size]


def _event_type_from_article(article: Article) -> str:
    tags = [str(tag).lower() for tag in (article.tags or [])]
    signal_types = [str(tag).lower() for tag in (article.signal_types or [])]
    source_kind = str(article.source_kind or "").lower()
    merged = tags + signal_types

    if any(tag in merged for tag in ("earnings", "guidance", "eps", "results")):
        return "earnings"
    if any(tag in merged for tag in ("analyst", "rating", "price-target")):
        return "analyst"
    if any(tag in merged for tag in ("policy", "regulation", "regulatory", "legal")):
        return "policy"
    if any(tag in merged for tag in ("macro", "rates", "inflation", "fed")):
        return "macro"
    if any(tag in merged for tag in ("product", "launch", "partnership", "deal", "contract", "m&a")):
        return "business"
    if source_kind == "social":
        return "social"
    return "news"


def _event_id(article: Article, ticker: str, summary: str) -> str:
    date_key = ""
    try:
        date_key = _parse_iso(article.published_at).date().isoformat()
    except Exception:
        date_key = str(article.published_at)[:10]
    body = _normalize_text(summary)[:160]
    title = _normalize_text(article.title)[:120]
    if article.url:
        return f"evt_{_stable_digest(article.url, ticker, date_key)}"
    return f"evt_{_stable_digest(ticker, date_key, title, body)}"


def _confidence_score(
    *,
    article_count: int,
    source_count: int,
    recency_hours: float,
    evidence_count: int,
) -> int:
    # Weighted confidence based on breadth + recency + extracted evidence.
    score = (
        min(article_count, 10) * 4
        + min(source_count, 6) * 8
        + min(evidence_count, 8) * 3
        + max(0.0, 24.0 - min(recency_hours, 72.0)) * 0.9
    )
    return max(5, min(95, int(round(score))))


def _impact_score(
    *,
    article: Article,
    quality_score: int,
    recency_hours: float,
    summary: str,
) -> int:
    sentiment_component = min(35.0, abs(float(article.sentiment_score)) * 35.0)
    quality_component = max(0.0, min(35.0, (quality_score + 120) * 0.18))
    recency_component = max(0.0, 25.0 - min(recency_hours, 48.0) * 0.5)
    numeric_boost = 8.0 if any(ch.isdigit() for ch in summary) else 0.0
    score = sentiment_component + quality_component + recency_component + numeric_boost
    return max(5, min(95, int(round(score))))


def _freshness_status(latest_dt: datetime | None, now_utc: datetime) -> str:
    if latest_dt is None:
        return "missing"
    age_hours = (now_utc - latest_dt).total_seconds() / 3600.0
    if age_hours <= 6:
        return "fresh"
    if age_hours <= 24:
        return "aging"
    return "stale"


def _dedupe_timeline_events(events: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for event in sorted(events, key=lambda item: str(item.get("timestamp", "")), reverse=True):
        event_id = str(event.get("event_id", "")).strip()
        if not event_id or event_id in seen:
            continue
        deduped.append(event)
        seen.add(event_id)
        if len(deduped) >= limit:
            break
    return deduped


def _source_tier_mix(articles: list[Article]) -> dict[str, int]:
    counts = {"broad": 0, "core": 0, "promoted": 0}
    for article in articles:
        lane = str(article.source_lane or "broad").lower()
        if lane in counts:
            counts[lane] += 1
        else:
            counts["broad"] += 1
    return counts


GENERIC_STARTS = (
    "the article discusses",
    "recent coverage centers on",
    "coverage centers on",
    "this article discusses",
    "the story discusses",
)

LOW_SIGNAL_TITLE_TERMS = (
    "feature highlights",
    "investment ideas",
    "stock price prediction",
    "better buy",
    "what q1 earnings could mean",
    "looks alarmingly like",
    "warning for big tech",
    "about to soar",
    "could send",
    "could soar",
    "could skyrocket",
    "should you buy",
    "is it time to buy",
    "is it time to watch",
    "top stocks to buy",
    "stock to watch",
    "stocks to watch",
    "should watch",
    "worth watching",
    "investors should watch",
    "watch this week",
    "potential factors",
    "reasons to buy",
    "here's why",
    "here's what",
    "must-buy",
    "stock alert",
    "covered in the report",
    "includes new research",
    "reports cover",
    "major stocks",
    "new catalyst as",
)


def _clean_sentence(value: str) -> str:
    cleaned = " ".join(str(value).split()).strip()
    # Strip title-style source attributions ("Headline - Reuters") without
    # treating hyphenated words such as "re-rating" or "risk-off" as a
    # separator and deleting the rest of the sentence.
    cleaned = re.sub(r"\s+-\s+[A-Za-z0-9 .,&'/:-]+$", "", cleaned)
    for prefix in GENERIC_STARTS:
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix):].lstrip(" :,-")
            break
    return cleaned.strip().rstrip(".")


CLICKBAIT_POINT_TERMS = (
    "buy or sell",
    "stock price prediction",
    "should you buy",
    "what comes next",
    "what to watch",
    "what investors should",
    "what you need to know",
    "here's why",
    "here's what",
    "could send",
    "could soar",
    "could skyrocket",
    "must-buy",
    "hot stock",
    "top stocks",
    "best stocks",
    "about to soar",
    "millionaire maker",
    "stock alert",
    "is it time to",
    "is it too late",
    "covered in the report",
    "includes new research",
    "reports cover",
    "major stocks",
    "new catalyst as",
    "stock price near",
    "one of the most",
    "above its 200",
)

INCOMPLETE_TAIL_WORDS = {
    "a", "an", "the", "to", "for", "from", "with", "without", "near",
    "above", "below", "next", "last", "this", "that", "its", "their",
}


def _looks_incomplete_fragment(value: str) -> bool:
    cleaned = _clean_sentence(value)
    if not cleaned:
        return True
    words = re.findall(r"[A-Za-z0-9]+", cleaned)
    if not words:
        return True
    if words[-1].lower() in INCOMPLETE_TAIL_WORDS:
        return True
    lowered = cleaned.lower()
    return any(marker in lowered for marker in (
        "stock price near",
        "above its 200",
        "below its 200",
        "one of the most",
    ))


def _looks_like_raw_title(value: str) -> bool:
    """Detect raw article titles that leaked through as key points."""
    cleaned = _clean_sentence(value)
    if not cleaned:
        return False
    # Titles tend to be Title Case with no period
    words = cleaned.split()
    if len(words) >= 6:
        capitalized = sum(1 for w in words if w[0:1].isupper())
        if capitalized >= len(words) * 0.6:
            return True
    return False


def _is_informative_point(value: str) -> bool:
    cleaned = _clean_sentence(value)
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if lowered.startswith("the article"):
        return False
    if len(cleaned.split()) < 4:
        return False
    if cleaned[0:1].islower():
        return False
    if _looks_incomplete_fragment(cleaned):
        return False
    if " is mentioned" in lowered or " are mentioned" in lowered:
        return False
    if any(term in lowered for term in CLICKBAIT_POINT_TERMS):
        return False
    if _is_vague(cleaned):
        return False
    if _looks_like_raw_title(cleaned):
        return False
    return True


def _too_long_headline(value: str) -> bool:
    return len(str(value or "").split()) > 14


def _is_circular_brief_body(body: str, headline: str, catalyst: str) -> bool:
    cleaned = _normalize_text(body)
    if not cleaned:
        return False
    if "the near-term catalyst is" in cleaned:
        return True
    headline_norm = _normalize_text(headline)
    catalyst_norm = _normalize_text(catalyst)
    repeated = 0
    for part in (headline_norm, catalyst_norm):
        if part and len(part.split()) >= 6 and cleaned.count(part) >= 2:
            repeated += 1
    return repeated > 0


def _is_low_quality_catalyst(value: str) -> bool:
    cleaned = _normalize_text(value)
    if not cleaned:
        return True
    if str(value or "").strip()[0:1].islower():
        return True
    if _looks_incomplete_fragment(value):
        return True
    if _too_long_headline(value):
        return True
    return any(marker in cleaned for marker in (
        " is mentioned",
        " are mentioned",
        "new catalyst as",
        "covered in the report",
        "includes new research",
        "reports cover",
        "major stocks",
        "target cuts",
    ))


def _is_low_quality_brief_text(value: str) -> bool:
    cleaned = _normalize_text(value)
    if not cleaned:
        return True
    if str(value or "").strip()[0:1].islower():
        return True
    if _looks_incomplete_fragment(value):
        return True
    return any(marker in cleaned for marker in (
        " is mentioned",
        " are mentioned",
        "covered in the report",
        "includes new research",
        "reports cover",
        "major stocks",
        "new catalyst as",
    ))


def _complete_sentence(value: str) -> str:
    cleaned = " ".join(str(value or "").split()).strip()
    if not cleaned:
        return ""
    if cleaned[-1] not in ".!?":
        cleaned = f"{cleaned}."
    return cleaned


def _short_card_label(value: str, fallback: str = "Setup driver") -> str:
    cleaned = _clean_sentence(value)
    if not cleaned:
        return fallback
    first_clause = re.split(r"[.;:,-]\s+", cleaned, maxsplit=1)[0].strip()
    words = first_clause.split()
    if len(words) > 6:
        first_clause = " ".join(words[:6])
    return first_clause or fallback


def _same_card_text(left: str, right: str) -> bool:
    return _normalize_text(left) == _normalize_text(right)


_METRIC_SHORTHAND_RE = re.compile(r"^[+-]?\d+(?:\.\d+)?%?\s*-\s+", re.IGNORECASE)


def _float_metric_value(raw: Any) -> float | None:
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _looks_like_metric_shorthand(value: str) -> bool:
    cleaned = " ".join(str(value or "").split()).strip().rstrip(".")
    if not cleaned:
        return False
    if _METRIC_SHORTHAND_RE.match(cleaned):
        return True
    if re.search(r"\(\d+(?:\.\d+)?\)\.?$", cleaned) and len(cleaned.split()) <= 10:
        return True
    if re.fullmatch(r"[+-]?\d+(?:\.\d+)?%?\s+vs\s+target", cleaned, re.IGNORECASE):
        return True
    return False


def _is_informative_card_detail(value: str) -> bool:
    cleaned = _clean_sentence(value)
    if not _is_informative_point(cleaned):
        return False
    if _looks_like_metric_shorthand(cleaned):
        return False
    return len(cleaned.split()) >= 8


def _metric_to_prose_sentence(metric: dict[str, Any], *, negative: bool = False) -> str:
    label = str(metric.get("label") or "").strip()
    value = _float_metric_value(metric.get("value"))
    benchmark = _float_metric_value(metric.get("benchmark"))
    summary = str(metric.get("summary") or "").strip()
    tailwind = "a tailwind for the setup"
    headwind = "a headwind for the setup"
    stance = headwind if negative else tailwind

    if label == "Quant rank" and value is not None:
        tiers = {1: "Strong Buy", 2: "Buy", 3: "Hold", 4: "Sell", 5: "Strong Sell"}
        tier = tiers.get(int(round(value)), "neutral")
        return (
            f"Quant ranking models classify this as {tier} (rank {int(round(value))} of 5), "
            f"which is {stance}."
        )
    if label == "Analyst rating" and value is not None:
        if value <= 2:
            read = "buy-tilted"
        elif value >= 4:
            read = "sell-tilted"
        else:
            read = "hold-tilted"
        return f"Street consensus is {read} (rating {value:.2f}), which is {stance}."
    if label == "Beat likelihood" and value is not None:
        if value > 1:
            read = "earnings are more likely to beat consensus this quarter"
        elif value < -1:
            read = "earnings are more likely to miss consensus this quarter"
        else:
            read = "earnings look roughly in line with consensus"
        return f"The beat-likelihood read ({value:+.1f}%) suggests {read}, which is {stance}."
    if label == "Short float" and value is not None:
        if value < 3:
            read = f"Short interest is low at {value:.1f}% of float, so bears are not heavily positioned against the name."
        elif value < 8:
            read = (
                f"Short interest is {value:.1f}% of float, a moderate level that can add fuel "
                "if sentiment improves."
            )
        else:
            read = (
                f"Short interest is {value:.1f}% of float, an elevated level that raises "
                "squeeze and volatility risk."
            )
        return read if not negative else read.replace("can add fuel", "can amplify downside moves")
    if label == "Insider activity" and value is not None:
        if abs(value) < 0.1:
            read = "Insider buying and selling have been quiet over the last six months."
        else:
            direction = "buying" if value > 0 else "selling"
            read = f"Insiders have been net {direction} over the last six months ({value:+.2f}%)."
        return f"{read} That is {stance}."
    if label == "RSI (14)" and value is not None:
        if value >= 70:
            read = "RSI is in overbought territory, so the move may be stretched near term."
        elif value <= 30:
            read = "RSI is oversold, which can set up a bounce if selling pressure eases."
        elif 50 <= value < 70:
            read = "RSI sits in a healthy uptrend zone, suggesting momentum is still constructive."
        else:
            read = "RSI is neutral, so price action rather than momentum extremes is driving the tape."
        return read
    if label == "Analyst consensus" and value is not None:
        if value >= 80:
            read = f"{value:.0f}% of analysts rate the stock a buy, signaling strong Street conviction."
        elif value >= 60:
            read = f"{value:.0f}% of analysts rate the stock a buy, a constructive but not unanimous tilt."
        elif value >= 40:
            read = f"Only {value:.0f}% of analysts rate the stock a buy, so the Street view is split."
        else:
            read = f"Just {value:.0f}% of analysts rate the stock a buy, reflecting bearish consensus."
        return read
    if label in {"1-month performance", "1-week performance", "1-year performance"} and value is not None:
        window = {"1-month performance": "last month", "1-week performance": "last week", "1-year performance": "the past year"}[label]
        direction = "outperformed" if value > 2 else "lagged" if value < -2 else "tracked the market"
        return f"The stock {direction} over the {window} ({value:+.1f}%), which is {stance}."
    if label == "5-year CAGR" and value is not None:
        if value >= 20:
            read = f"The stock has compounded at {value:+.1f}% annualized over five years, a multibagger pace."
        elif value >= 10:
            read = f"The stock has delivered a solid {value:+.1f}% annualized return over five years."
        elif value >= 0:
            read = f"Long-run returns are muted at {value:+.1f}% annualized over five years."
        else:
            read = f"The stock has destroyed value with a {value:+.1f}% annualized return over five years."
        return read
    if label == "Analyst target" and value is not None and benchmark is not None and benchmark > 0:
        upside = (value - benchmark) / benchmark * 100
        if upside > 0:
            return (
                f"The consensus price target is {upside:+.1f}% above the current price, "
                f"leaving meaningful upside if the Street is right."
            )
        return (
            f"The consensus price target is {abs(upside):.1f}% below the current price, "
            f"so the stock already trades ahead of analyst expectations."
        )
    if label in {"P/E TTM", "Forward P/E"} and value is not None and benchmark is not None and benchmark > 0:
        diff = (value - benchmark) / benchmark * 100
        multiple = "trailing" if label == "P/E TTM" else "forward"
        if abs(diff) < 5:
            return f"The {multiple} P/E ({value:.1f}) is roughly in line with the sector average ({benchmark:.1f})."
        tag = "cheaper" if diff < 0 else "richer"
        return (
            f"The stock trades about {abs(diff):.0f}% {tag} than its sector on {multiple} P/E "
            f"({value:.1f} vs {benchmark:.1f}), which is {stance}."
        )
    if label == "PEG" and value is not None:
        if value < 1:
            return f"The PEG ratio of {value:.2f} suggests growth-adjusted valuation still looks reasonable."
        if value < 2:
            return f"The PEG ratio of {value:.2f} looks fairly priced relative to expected growth."
        return f"The PEG ratio of {value:.2f} prices in aggressive growth, leaving less room for disappointment."
    if "growth" in label.lower() and value is not None:
        tier = "strong" if not negative else "weak"
        if benchmark is not None:
            direction = "ahead of" if value > benchmark + 1 else "below" if value < benchmark - 1 else "in line with"
            return (
                f"{label} is running at {value:+.1f}%, {direction} the sector benchmark "
                f"({benchmark:+.1f}%), which is {stance}."
            )
        return f"{label} is running at {value:+.1f}%, a {tier} growth signal that is {stance}."
    if label in {"ROE", "Operating margin", "Payout ratio", "Debt / Equity", "Institutional ownership"} and value is not None:
        descriptors = {
            "ROE": "return on equity",
            "Operating margin": "operating margin",
            "Payout ratio": "payout ratio",
            "Debt / Equity": "debt-to-equity",
            "Institutional ownership": "institutional ownership",
        }
        thing = descriptors.get(label, label.lower())
        unit = "%" if label != "Debt / Equity" else ""
        quality = "strong" if not negative else "weak"
        return (
            f"{thing.title()} at {value:.2f}{unit} screens as {quality} versus peers, "
            f"which is {stance}."
        )
    if summary and not _looks_like_metric_shorthand(summary) and len(summary.split()) >= 8:
        return _complete_sentence(summary)
    if label and value is not None:
        return _complete_sentence(
            f"{label} at {value:g} stands out in the scorecard and is {stance}."
        )
    return ""


def _expand_card_detail(detail: str, label: str = "") -> str:
    cleaned = " ".join(str(detail or "").split()).strip().rstrip(".")
    cleaned = re.sub(r"\s*\(\d+(?:\.\d+)?\)\.?$", "", cleaned).strip()
    match = _METRIC_SHORTHAND_RE.match(cleaned)
    if not match:
        return _complete_sentence(cleaned)
    rest = cleaned[match.end():].strip()
    num = match.group(0).strip().rstrip("-").strip()
    lowered = rest.lower()
    if "buy signal" in lowered or "sell signal" in lowered or "strong buy" in lowered:
        return _complete_sentence(
            f"Quant models show a {rest}, which supports the constructive side of the setup."
        )
    if "short interest" in lowered:
        return _complete_sentence(
            f"Short interest at {num} is {rest}, which can shape how sharply the stock reacts to news."
        )
    if label:
        return _complete_sentence(
            f"{label}: {rest} — worth watching because it shapes the risk/reward from here."
        )
    return _complete_sentence(
        f"The scorecard flags {rest} ({num}), which matters for how much upside is still on the table."
    )


def _drivers_from_points(points: list[str], *, limit: int = 3) -> list[dict[str, Any]]:
    drivers: list[dict[str, Any]] = []
    for point in points:
        detail = _complete_sentence(_clean_sentence(point))
        if not _is_informative_card_detail(detail):
            continue
        label = _short_card_label(detail)
        if _same_card_text(label, detail) and len(detail.split()) < 8:
            continue
        if _normalize_text(detail).startswith(_normalize_text(label)) and len(detail.split()) < 10:
            continue
        drivers.append({
            "label": label,
            "detail": detail,
            "direction": "mixed",
            "strength": 3,
            "horizon": "week",
        })
        if len(drivers) >= limit:
            break
    return drivers


def _fundamental_driver_cards(fundamentals: dict[str, Any] | None, *, limit: int = 2) -> list[dict[str, Any]]:
    if not isinstance(fundamentals, dict):
        return []
    drivers: list[dict[str, Any]] = []
    for metric in fundamentals.get("standout_metrics") or []:
        if not isinstance(metric, dict):
            continue
        label = str(metric.get("label") or "").strip()
        detail = _complete_sentence(_metric_to_prose_sentence(metric, negative=False))
        if not label or not _is_informative_card_detail(detail):
            continue
        drivers.append({
            "label": _short_card_label(label or detail),
            "detail": detail,
            "direction": "up",
            "strength": 4,
            "horizon": "quarter",
        })
        if len(drivers) >= limit:
            break
    return drivers


def _fundamental_risk_cards(fundamentals: dict[str, Any] | None, *, limit: int = 2) -> list[dict[str, Any]]:
    if not isinstance(fundamentals, dict):
        return []
    risks: list[dict[str, Any]] = []
    for metric in fundamentals.get("weak_metrics") or []:
        if not isinstance(metric, dict):
            continue
        label = str(metric.get("label") or "").strip()
        detail = _complete_sentence(_metric_to_prose_sentence(metric, negative=True))
        if not label or not _is_informative_card_detail(detail):
            continue
        risks.append({
            "risk": _short_card_label(label or detail, fallback="Key risk"),
            "detail": detail,
            "trigger": "fundamental deterioration",
            "severity": 4,
            "probability": 3,
        })
        if len(risks) >= limit:
            break
    return risks


def _normalize_driver_cards(
    raw_cards: list[Any],
    fallback_points: list[str],
    *,
    limit: int = 4,
) -> list[dict[str, Any]]:
    fallback_details = [
        _complete_sentence(_clean_sentence(point))
        for point in fallback_points
        if _is_informative_card_detail(_complete_sentence(_clean_sentence(point)))
    ]
    fallback_index = 0
    normalized: list[dict[str, Any]] = []
    for raw in raw_cards:
        if not isinstance(raw, dict):
            continue
        label = str(raw.get("label") or raw.get("driver") or raw.get("title") or "").strip()
        detail = str(
            raw.get("detail")
            or raw.get("description")
            or raw.get("why_it_matters")
            or raw.get("rationale")
            or ""
        ).strip()
        if not detail or _same_card_text(label, detail):
            while fallback_index < len(fallback_details):
                candidate = fallback_details[fallback_index]
                fallback_index += 1
                if not _same_card_text(label, candidate):
                    detail = candidate
                    break
        if _looks_like_metric_shorthand(detail):
            detail = _expand_card_detail(detail, label)
        detail = _complete_sentence(_clean_sentence(detail))
        if not _is_informative_card_detail(detail):
            continue
        label = _short_card_label(label or detail)
        if _same_card_text(label, detail) and len(detail.split()) < 8:
            continue
        if _normalize_text(detail).startswith(_normalize_text(label)) and len(detail.split()) < 10:
            continue
        normalized.append({
            "label": label,
            "detail": detail,
            "direction": str(raw.get("direction") or "mixed").lower()
            if str(raw.get("direction") or "").lower() in {"up", "down", "mixed"}
            else "mixed",
            "strength": max(1, min(5, int(_to_float(raw.get("strength")) or 3))),
            "horizon": str(raw.get("horizon") or "week").lower()
            if str(raw.get("horizon") or "").lower() in {"today", "week", "quarter"}
            else "week",
        })
        if len(normalized) >= limit:
            break
    return normalized


def _normalize_risk_cards(raw_cards: list[Any], *, limit: int = 3) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for raw in raw_cards:
        if not isinstance(raw, dict):
            continue
        risk = str(raw.get("risk") or raw.get("label") or raw.get("title") or "").strip()
        detail = str(raw.get("detail") or raw.get("description") or raw.get("why_it_matters") or "").strip()
        if _looks_like_metric_shorthand(detail):
            detail = _expand_card_detail(detail, risk)
        detail = _complete_sentence(_clean_sentence(detail))
        if not risk or not _is_informative_card_detail(detail):
            continue
        if "nothing concrete" in risk.lower() or "nothing concrete" in detail.lower():
            continue
        normalized.append({
            "risk": _short_card_label(risk, fallback="Key risk"),
            "detail": detail,
            "trigger": str(raw.get("trigger") or "headline deterioration").strip() or "headline deterioration",
            "severity": max(1, min(5, int(_to_float(raw.get("severity")) or 3))),
            "probability": max(1, min(5, int(_to_float(raw.get("probability")) or 3))),
        })
        if len(normalized) >= limit:
            break
    return normalized


def _normalize_raw_catalyst_cards(raw_cards: list[Any], *, limit: int = 3) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for raw in raw_cards:
        if not isinstance(raw, dict):
            continue
        event = str(raw.get("event") or raw.get("label") or raw.get("title") or "").strip()
        detail = str(raw.get("detail") or raw.get("description") or raw.get("why_it_matters") or "").strip()
        detail = _complete_sentence(_clean_sentence(detail))
        if not event or _is_low_quality_catalyst(event) or not _is_informative_point(detail):
            continue
        if "nothing concrete" in event.lower() or "nothing concrete" in detail.lower():
            continue
        normalized.append({
            "event": _short_card_label(event, fallback="Near-term catalyst"),
            "detail": detail,
            "window": str(raw.get("window") or "near-term").strip() or "near-term",
            "expected_impact": max(-2, min(2, _to_float(raw.get("expected_impact")) or 0)),
            "priced_in": str(raw.get("priced_in") or "med").lower()
            if str(raw.get("priced_in") or "").lower() in {"low", "med", "high"}
            else "med",
        })
        if len(normalized) >= limit:
            break
    return normalized


def _clean_title(value: str) -> str:
    cleaned = _clean_sentence(value)
    return cleaned.rstrip("?").strip()


def _article_quality_score(article: Article, ticker: str) -> int:
    title = _clean_title(article.title).lower()
    mentions = _target_mentions(article, ticker)
    score = 0
    if any(str(mention.get("mention_role", "")).lower() == "primary" for mention in mentions):
        score += 120
    elif any(str(mention.get("mention_role", "")).lower() == "secondary" for mention in mentions):
        score += 50
    score += 12 * sum(1 for mention in mentions if mention.get("what_happened") and str(mention.get("what_happened")).lower() != "unknown")
    score += 10 * sum(
        1
        for mention in mentions
        if any(char.isdigit() for char in " ".join(
            [str(mention.get("what_happened", "")), str(mention.get("why_it_matters", "")), *mention.get("entity_key_points", [])]
        ))
    )
    if any(term in title for term in LOW_SIGNAL_TITLE_TERMS):
        score -= 120
    if " vs " in title or " versus " in title:
        score -= 40
    if article.source_name in {"MSN", "CoinCentral", "Rock Paper Shotgun"}:
        score -= 100
    return score


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _parse_iso_date(value: str | None) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if len(raw) >= 10:
            return datetime.fromisoformat(raw[:10]).date()
    except Exception:
        return None
    return None


def _is_future_or_today(value: str | None, *, today: date | None = None) -> bool:
    parsed = _parse_iso_date(value)
    if parsed is None:
        return False
    baseline = today or datetime.now(timezone.utc).date()
    return parsed >= baseline


def _filter_current_events(events: list[dict[str, Any]] | None, *, today: date | None = None) -> list[dict[str, Any]]:
    if not events:
        return []
    out: list[dict[str, Any]] = []
    baseline = today or datetime.now(timezone.utc).date()
    for event in events:
        if not isinstance(event, dict):
            continue
        kind = str(event.get("kind", "")).strip().lower()
        if kind != "earnings":
            out.append(event)
            continue
        iso_date = str(event.get("date", "")).strip()
        if iso_date and _is_future_or_today(iso_date, today=baseline):
            out.append(event)
            continue
        # If no parseable ISO date exists, drop earnings events to avoid
        # leaking stale date labels into the AI prompt path.
    return out


def _mention_series(articles: list[Article], buckets: int = 6) -> list[int]:
    if not articles:
        return [0] * buckets
    timestamps = sorted(_parse_iso(article.published_at) for article in articles)
    start = timestamps[0]
    end = timestamps[-1]
    if start == end:
        counts = [0] * (buckets - 1) + [len(articles)]
        return counts
    total_seconds = (end - start).total_seconds()
    step = total_seconds / buckets
    counts = [0] * buckets
    for timestamp in timestamps:
        delta = (timestamp - start).total_seconds()
        index = min(buckets - 1, int(delta / step)) if step else buckets - 1
        counts[index] += 1
    return counts


CATALYST_HINTS = (
    "upgrade",
    "target",
    "demand",
    "contract",
    "deal",
    "launch",
    "earnings beat",
    "ramp",
    "partnership",
    "growth",
)

RISK_HINTS = (
    "downgrade",
    "miss",
    "pressure",
    "controls",
    "delivery",
    "investigation",
    "decline",
    "weakness",
    "lawsuit",
    "cut",
)


def _pick_catalyst(points: list[str]) -> str:
    for point in points:
        if _is_vague(point):
            continue
        lowered = point.lower()
        if any(term in lowered for term in CATALYST_HINTS):
            return _clean_sentence(point)
    for point in points:
        if not _is_vague(point):
            return _clean_sentence(point)
    return "Nothing concrete yet"


def _pick_risk(points: list[str], label: str) -> str:
    for point in points:
        if _is_vague(point):
            continue
        lowered = point.lower()
        if any(term in lowered for term in RISK_HINTS):
            return _clean_sentence(point)
    if label in {"cautious", "bearish"}:
        for point in points:
            if not _is_vague(point):
                return _clean_sentence(point)
    return "Nothing concrete yet"


def _target_mentions(article: Article, ticker: str) -> list[dict[str, Any]]:
    target = ticker.upper()
    return [
        mention
        for mention in article.entity_mentions
        if str(mention.get("type", "")).lower() == "stock"
        and str(mention.get("ticker", "")).upper() == target
        and str(mention.get("mention_role", "secondary")).lower() != "incidental"
    ]


def _best_evidence(article: Article, ticker: str) -> tuple[str, list[str]]:
    mentions = _target_mentions(article, ticker)
    mention_points = [
        _clean_sentence(point)
        for mention in mentions
        for point in mention.get("entity_key_points", [])
        if _is_informative_point(point)
    ]
    if mention_points:
        overview = next(
            (
                _clean_sentence(mention.get("entity_overview", ""))
                for mention in mentions
                if _is_informative_point(mention.get("entity_overview", ""))
            ),
            "",
        )
        return overview, _clean_points(mention_points, limit=4)

    article_points = [
        _clean_sentence(point)
        for point in article.article_key_points
        if _is_informative_point(point)
    ]
    overview = _clean_sentence(article.article_overview)
    if not _is_informative_point(overview):
        overview = _clean_title(article.title)
    return overview, _clean_points(article_points, limit=4)


VAGUE_PHRASES = (
    "various potential factors",
    "potential factors",
    "factors are discussed",
    "factors being discussed",
    "may see stock increases",
    "may see increases",
    "is being discussed",
    "are being discussed",
    "is active in the current news set",
    "is active in the news",
    "could potentially",
    "various reasons",
)


def _is_vague(text: str) -> bool:
    lowered = text.lower()
    return any(phrase in lowered for phrase in VAGUE_PHRASES)


def _build_headline(instrument: dict[str, Any], label: str, top_fact: str, top_title: str) -> str:
    if top_fact and _is_informative_point(top_fact):
        return top_fact
    if top_title and _is_informative_point(top_title):
        return top_title
    return f"{instrument['ticker']} coverage is {label}, but nothing concrete yet"


def _build_body(
    instrument: dict[str, Any],
    source_count: int,
    article_count: int,
    top_title: str,
    top_fact: str,
    second_fact: str,
    label: str = "",
    catalyst: str = "",
    risk: str = "",
) -> str:
    ticker = instrument["ticker"]

    # Nothing concrete - say so plainly
    lead = ""
    if top_fact and _is_informative_point(top_fact):
        lead = top_fact
    elif top_title and _is_informative_point(top_title):
        lead = top_title

    if not lead:
        if article_count == 1:
            return f"Coverage is thin for {ticker} - one article from {source_count} source, no concrete catalyst or event extracted."[:400]
        return f"Coverage for {ticker} is light - {article_count} articles across {source_count} sources, but nothing concrete on catalysts or earnings."[:400]

    # Build a synthesis that connects the dots instead of just listing facts
    parts: list[str] = []

    # Lead with the concrete fact
    parts.append(lead.rstrip("."))

    # Add second fact if it adds something different
    if second_fact and _is_informative_point(second_fact) and second_fact.lower() != lead.lower():
        parts.append(second_fact.rstrip("."))

    body = ". ".join(parts)

    # Add source consensus context - this helps the reader gauge confidence
    if article_count >= 3 and source_count >= 2:
        if label in ("bullish", "constructive"):
            body += f". {source_count} sources are aligned on a {label} outlook"
        elif label in ("cautious", "bearish"):
            body += f". {source_count} sources point to a {label} tone"
    elif article_count == 1 and source_count == 1:
        body += ". Only one source is backing this right now - confidence is limited"

    # Add a forward-looking hook if we have catalyst or risk
    has_catalyst = catalyst and not _is_low_quality_catalyst(catalyst) and "nothing concrete" not in catalyst.lower()
    has_risk = risk and "nothing concrete" not in risk.lower() and "only one source" not in risk.lower()
    if has_catalyst and has_risk:
        body += f". Watch for {catalyst.lower()}, though {risk.lower()} remains a factor"
    elif has_catalyst:
        body += f". Catalyst watch: {catalyst.lower()}"
    elif has_risk:
        body += f". Key risk to monitor: {risk.lower()}"

    return body[:500]


def _load_reddit_by_ticker(store: Any, market: str) -> dict[str, dict[str, Any]]:
    """Read reddit_snapshots/{market}__latest once, keyed by upper ticker.

    Handles both the dict-keyed and list shapes the snapshot has used. Returns a
    compact per-ticker payload (sentiment / context / mentions / catalysts) so
    the brief can fold in retail chatter without re-reading Firestore per stock.
    """
    doc = store.db.collection("reddit_snapshots").document(f"{market}__latest").get()
    if not doc.exists:
        return {}
    data = doc.to_dict() or {}
    tickers = data.get("tickers")
    out: dict[str, dict[str, Any]] = {}

    def _norm(raw: dict[str, Any]) -> dict[str, Any] | None:
        context = str(raw.get("context") or raw.get("summary") or "").strip()[:240]
        sentiment = raw.get("sentiment")
        mentions = raw.get("mention_count")
        if mentions is None:
            mentions = raw.get("mentions")
        catalysts = [str(v).strip() for v in (raw.get("catalysts") or [])[:4] if str(v).strip()]
        if not (context or sentiment or catalysts):
            return None
        payload: dict[str, Any] = {}
        if sentiment:
            payload["sentiment"] = sentiment
        if mentions is not None:
            try:
                payload["mentions"] = int(float(mentions))
            except Exception:
                pass
        if context:
            payload["context"] = context
        if catalysts:
            payload["catalysts"] = catalysts
        return payload

    if isinstance(tickers, dict):
        for key, entry in tickers.items():
            if isinstance(entry, dict):
                norm = _norm(entry)
                if norm:
                    out[str(key).upper()] = norm
    elif isinstance(tickers, list):
        for row in tickers:
            if not isinstance(row, dict):
                continue
            ticker = str(row.get("ticker") or "").upper().strip()
            if not ticker:
                continue
            norm = _norm(row)
            if norm:
                out[ticker] = norm
    return out


# Earnings relevance windows (calendar days), tuned with product input:
# - LEAD: the print is THE story; overview + directive driven by results.
# - CONTEXT: earnings stays as backdrop context but news leads.
# - PRE: start framing the next earnings as an upcoming catalyst.
EARNINGS_LEAD_DAYS = 5
EARNINGS_CONTEXT_DAYS = 14
EARNINGS_PRE_DAYS = 14


def _load_earnings_by_instrument(
    store: Any,
    market: str,
    instruments: list[dict[str, Any]],
    now_utc: datetime,
) -> dict[str, dict[str, Any]]:
    """Build a per-instrument earnings-context block for the brief.

    Combines two sources we already maintain:
    - tm_earnings_events  -> the calendar (last reported date, next date, EPS est.)
    - tm_earnings_intel/{__latest} -> compact post-earnings highlights, if built

    Returns {instrument_id: earnings_block}. Only instruments where earnings is
    currently relevant (within the pre/lead/context windows) get an entry, so a
    stock in the "dead zone" between prints contributes nothing and the brief
    won't manufacture an earnings angle. Status priority: a fresh print (<=LEAD)
    always leads; otherwise an imminent earnings (<=PRE) takes precedence;
    otherwise a still-recent print (<=CONTEXT) is backdrop.
    """
    if store is None or not instruments:
        return {}

    today = now_utc.date()
    ticker_to_id = {
        str(inst.get("ticker") or "").upper().strip(): inst.get("instrument_id")
        for inst in instruments
        if str(inst.get("ticker") or "").strip() and inst.get("instrument_id")
    }
    if not ticker_to_id:
        return {}

    # Bounded calendar scan: only events that could matter for the windows.
    lo = (today - timedelta(days=EARNINGS_CONTEXT_DAYS + 2)).isoformat()
    hi = (today + timedelta(days=EARNINGS_PRE_DAYS + 2)).isoformat()
    by_ticker: dict[str, dict[str, Any]] = {}
    try:
        query = (
            store.db.collection("tm_earnings_events")
            .where("market", "==", market.upper())
            .where("event_date", ">=", lo)
            .where("event_date", "<=", hi)
            .stream()
        )
        for doc in query:
            payload = doc.to_dict() or {}
            ticker = str(payload.get("ticker") or "").upper().strip()
            if ticker not in ticker_to_id:
                continue
            ev_iso = str(payload.get("event_date") or "")[:10]
            try:
                ev_date = datetime.strptime(ev_iso, "%Y-%m-%d").date()
            except ValueError:
                continue
            row = by_ticker.setdefault(ticker, {"past": None, "future": None})
            if ev_date <= today:
                if row["past"] is None or ev_date > row["past"][0]:
                    row["past"] = (ev_date, payload)
            else:
                if row["future"] is None or ev_date < row["future"][0]:
                    row["future"] = (ev_date, payload)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("earnings calendar scan failed market=%s: %s", market, exc)
        return {}

    # Decide status/window per ticker first, so we only fetch intel for the
    # subset that actually reported recently.
    blocks: dict[str, dict[str, Any]] = {}
    reported_ids: list[str] = []
    for ticker, instrument_id in ticker_to_id.items():
        row = by_ticker.get(ticker)
        if not row:
            continue
        past = row.get("past")
        future = row.get("future")
        days_since = (today - past[0]).days if past else None
        days_until = (future[0] - today).days if future else None

        if days_since is not None and days_since <= EARNINGS_LEAD_DAYS:
            status, lead = "reported", True
        elif days_until is not None and days_until <= EARNINGS_PRE_DAYS:
            status, lead = "upcoming", False
        elif days_since is not None and days_since <= EARNINGS_CONTEXT_DAYS:
            status, lead = "reported", False
        else:
            continue

        block: dict[str, Any] = {"status": status, "lead": lead}
        if status == "reported":
            event_payload = past[1] or {}
            block["event_date"] = past[0].isoformat()
            block["days_since_report"] = days_since
            est = event_payload.get("eps_estimate")
            if est is not None:
                block["eps_estimate"] = est
            # Real reported numbers, if sync_earnings_actuals enriched the event.
            # Without these the brief would fall back to repeating the estimate
            # as if it were the result. Surface them so the overview cites the
            # actual beat/miss instead of fabricating one.
            reported_eps = event_payload.get("reported_eps")
            if reported_eps is not None:
                block["reported_eps"] = reported_eps
                surprise_pct = event_payload.get("eps_surprise_pct")
                if surprise_pct is not None:
                    block["eps_surprise_pct"] = surprise_pct
                label = event_payload.get("surprise_label")
                if label:
                    block["surprise_label"] = label
            reported_ids.append(instrument_id)
        else:
            block["event_date"] = future[0].isoformat()
            block["days_until"] = days_until
            est = (future[1] or {}).get("eps_estimate")
            if est is not None:
                block["eps_estimate"] = est
        blocks[instrument_id] = block

    # Attach compact post-earnings highlights for reported stocks that have an
    # earnings-intel doc, so the overview can cite actual results/guidance.
    if reported_ids:
        try:
            refs = [
                store.db.collection("tm_earnings_intel").document(
                    f"{market.upper()}__{instrument_id}__latest"
                )
                for instrument_id in reported_ids
            ]
            for snap in store.db.get_all(refs):
                if not snap.exists:
                    continue
                data = snap.to_dict() or {}
                instrument_id = str(data.get("instrument_id") or "").strip()
                block = blocks.get(instrument_id)
                if not block:
                    continue
                report = data.get("report") or {}
                facts = report.get("facts") or {}
                interp = report.get("interpretation") or {}
                highlights = {
                    "reported_vs_expected": str(facts.get("reported_vs_expected") or "")[:240],
                    "guidance_signal": str(facts.get("guidance_signal") or "")[:240],
                    "price_reaction": str(facts.get("price_reaction") or "")[:240],
                    "what_changed": str(interp.get("what_changed") or "")[:240],
                }
                highlights = {k: v for k, v in highlights.items() if v}
                if highlights:
                    block["reported_highlights"] = highlights
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("earnings intel highlights load failed market=%s: %s", market, exc)

    return blocks


def build_stock_intelligence_docs(
    market: str,
    universe_id: str,
    instruments: list[dict[str, Any]],
    articles: list[Article],
    store: Any | None = None,
    *,
    include_options_digest: bool = False,
) -> list[dict[str, Any]]:
    articles_by_instrument: dict[str, list[Article]] = defaultdict(list)
    raw_articles_by_instrument: dict[str, list[Article]] = defaultdict(list)
    instruments_by_ticker = {instrument["ticker"].upper(): instrument for instrument in instruments}
    instruments_by_id = {instrument["instrument_id"]: instrument for instrument in instruments}
    now_utc = datetime.now(timezone.utc)

    latest_prices_by_id: dict[str, dict[str, Any]] = {}
    intel_pro_by_id: dict[str, dict[str, Any]] = {}
    technicals_by_id: dict[str, dict[str, Any]] = {}
    if store is not None:
        try:
            latest_prices_by_id = store.get_latest_prices(list(instruments_by_id.keys()))
        except Exception:
            latest_prices_by_id = {}
        try:
            for doc in store.list_stock_intel_pro(market, universe_id):
                if isinstance(doc, dict) and doc.get("instrument_id"):
                    intel_pro_by_id[doc["instrument_id"]] = doc
        except Exception:
            intel_pro_by_id = {}
        try:
            technicals_by_id = store.get_latest_stock_technicals_batch(list(instruments_by_id.keys()))
        except Exception:
            technicals_by_id = {}

    sector_regimes: dict[str, Any] = {}
    if store is not None:
        try:
            sector_regimes = store.get_sector_regimes(market)
        except Exception:
            sector_regimes = {}

    # Reddit buzz, loaded once per run and keyed by upper-cased ticker. Used to
    # give the brief retail-sentiment context alongside the news evidence.
    reddit_by_ticker: dict[str, dict[str, Any]] = {}
    if store is not None:
        try:
            reddit_by_ticker = _load_reddit_by_ticker(store, market)
        except Exception:
            reddit_by_ticker = {}

    anomaly_by_doc_id: dict[str, dict[str, Any]] = {}
    if store is not None:
        try:
            anomaly_by_doc_id = store.get_daily_anomaly_ticker_docs_batch(
                market,
                [str(inst.get("ticker") or "").strip().upper() for inst in instruments],
            )
        except Exception:
            anomaly_by_doc_id = {}

    # Earnings context (calendar + post-earnings intel), keyed by instrument_id.
    # Only stocks currently inside the pre/lead/context windows appear here.
    earnings_by_id: dict[str, dict[str, Any]] = {}
    if store is not None:
        try:
            earnings_by_id = _load_earnings_by_instrument(store, market, instruments, now_utc)
        except Exception:
            earnings_by_id = {}

    options_by_id: dict[str, dict[str, Any]] = {}
    if include_options_digest:
        try:
            options_by_id = _load_options_digests(instruments, market=market, store=store)
        except Exception as exc:
            logger.warning("options digests load failed market=%s: %s", market, exc)
            options_by_id = {}

    market_day_change_values: list[float] = []
    for instrument_id, payload in latest_prices_by_id.items():
        quote = (payload.get("quote") or {}) if isinstance(payload, dict) else {}
        day_change = quote.get("day_change_pct")
        try:
            market_day_change_values.append(float(day_change))
        except Exception:
            continue

    # Thin-coverage title patterns: educational explainers, dividend/returns
    # calculators, "history of" posts, "how to invest" pieces. These enrich to
    # near-zero sentiment with no concrete event, so they pollute the brief.
    thin_title_patterns = (
        "dividend history", "dividend payout history", "share price history",
        "stock price history", "how to invest", "how to buy", "beginner's guide",
        "explained", "explainer", "everything you need to know",
        "what is ", "investment calculator", "returns calculator",
    )

    for article in articles:
        # Keep a raw per-instrument map before quality gating so we can avoid
        # false "no news" states when fresh but lower-confidence coverage exists.
        for mention in article.entity_mentions:
            if mention.get("type") != "stock":
                continue
            if str(mention.get("mention_role", "secondary")).lower() == "incidental":
                continue
            ticker = str(mention.get("ticker", "")).upper().strip()
            instrument = instruments_by_ticker.get(ticker)
            if instrument:
                raw_articles_by_instrument[instrument["instrument_id"]].append(article)

        if str(article.sentiment_label or "").lower() == "unscored":
            continue
        title_lower = str(getattr(article, "title", "") or "").lower()
        if any(pattern in title_lower for pattern in thin_title_patterns):
            continue
        matched_ids: set[str] = set()
        for mention in article.entity_mentions:
            if mention.get("type") != "stock":
                continue
            if str(mention.get("mention_role", "secondary")).lower() == "incidental":
                continue
            ticker = str(mention.get("ticker", "")).upper().strip()
            instrument = instruments_by_ticker.get(ticker)
            quality_score = _article_quality_score(article, ticker)
            if instrument and quality_score >= 25:
                matched_ids.add(instrument["instrument_id"])
        for instrument_id in matched_ids:
            articles_by_instrument[instrument_id].append(article)

    docs: list[dict[str, Any]] = []
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        matched_articles = sorted(articles_by_instrument.get(instrument_id, []), key=lambda item: item.published_at, reverse=True)
        if not matched_articles:
            raw_matched_articles = sorted(
                raw_articles_by_instrument.get(instrument_id, []),
                key=lambda item: item.published_at,
                reverse=True,
            )
            if raw_matched_articles:
                logger.info(
                    "stock_intel weak evidence fallback for %s - using %s raw matched articles",
                    instrument_id,
                    len(raw_matched_articles),
                )
                matched_articles = raw_matched_articles

        if not matched_articles:
            # Per-ticker articles (on-demand jobs) may not map cleanly
            # through the LLM entity-mention matching logic, especially for
            # stocks outside the current AI universe. Use all available
            # articles only for true single-stock jobs so multi-stock paid
            # refreshes do not cross-contaminate one ticker with another's news.
            if articles and len(instruments) == 1:
                logger.info(
                    "stock_intel no entity matches for %s - falling back to all %s articles",
                    instrument_id,
                    len(articles),
                )
                matched_articles = sorted(articles, key=lambda item: item.published_at, reverse=True)
            else:
                no_news_doc = build_no_news_intelligence_doc(
                    instrument=instrument,
                    market=market,
                    universe_id=universe_id,
                    latest_price_doc=latest_prices_by_id.get(instrument_id),
                    technical_doc=None,
                    intel_pro_doc=intel_pro_by_id.get(instrument_id),
                    store=store,
                )
                if no_news_doc:
                    no_news_doc["coverage_type"] = "on_demand_no_news"
                    no_news_doc["source"] = LLM_BRIEF_SOURCE
                    docs.append(no_news_doc)
                continue
        primary_articles = [
            article
            for article in matched_articles
            if any(str(mention.get("mention_role", "")).lower() == "primary" for mention in _target_mentions(article, instrument["ticker"]))
        ]
        evidence_articles = primary_articles or matched_articles

        sentiment_values: list[float] = []
        co_mentions: Counter[str] = Counter()
        for article in evidence_articles:
            for mention in article.entity_mentions:
                if mention.get("type") != "stock":
                    continue
                if str(mention.get("mention_role", "secondary")).lower() == "incidental":
                    continue
                ticker = str(mention.get("ticker", "")).upper().strip()
                if ticker == instrument["ticker"].upper():
                    sentiment_values.append(float(mention.get("sentiment_score", article.sentiment_score)))
                elif ticker in instruments_by_ticker:
                    co_mentions[instruments_by_ticker[ticker]["instrument_id"]] += 1

        if not sentiment_values:
            sentiment_values = [article.sentiment_score for article in evidence_articles]

        avg_sentiment = sum(sentiment_values) / len(sentiment_values)
        score = _score_from_sentiment(avg_sentiment)
        label = _label_from_score(score)
        ranked_articles = sorted(
            evidence_articles,
            key=lambda article: (_article_quality_score(article, instrument["ticker"]), article.published_at),
            reverse=True,
        )
        top_article = ranked_articles[0]
        evidence_points: list[str] = []
        top_overviews: list[str] = []
        for article in ranked_articles:
            overview, points = _best_evidence(article, instrument["ticker"])
            if overview and _is_informative_point(overview):
                top_overviews.append(overview)
            evidence_points.extend(points)
        key_points = _clean_points(
            [point for point in evidence_points if _is_informative_point(point)]
            + [
                _clean_title(article.title)
                for article in ranked_articles
                if _is_informative_point(article.title) and _article_quality_score(article, instrument["ticker"]) > -20
            ],
            limit=4,
        )
        if not key_points:
            continue
        timeline = [
            {
                "timestamp": article.published_at,
                "title": article.title,
                "summary": (_best_evidence(article, instrument["ticker"])[0] or _clean_title(article.title)),
                "sentiment_label": article.sentiment_label,
                "source_name": article.source_name,
                "article_url": article.url,
            }
            for article in ranked_articles[:6]
        ]
        positive_mentions = sum(1 for value in sentiment_values if value > 0.1)
        positive_pct = int(round((positive_mentions / len(sentiment_values)) * 100)) if sentiment_values else score
        source_count = len({article.source_name for article in matched_articles})

        # Real source-agreement: share of distinct sources whose articles lean
        # positive on average (mean article sentiment > 0.1). Previously this
        # lane just echoed overall_score, which was misleading.
        source_sentiments: dict[str, list[float]] = defaultdict(list)
        for article in evidence_articles:
            src = (article.source_name or "").strip()
            if src:
                source_sentiments[src].append(float(article.sentiment_score))
        if source_sentiments:
            source_means = {
                src: (sum(vals) / len(vals)) for src, vals in source_sentiments.items()
            }
            bullish_sources = sum(1 for mean in source_means.values() if mean > 0.1)
            source_agreement_pct = int(round((bullish_sources / len(source_means)) * 100))
        else:
            source_agreement_pct = score

        # Per-source breakdown surfaced on the sentiment card so the user can
        # see which feeds contributed and how many articles from each.
        sources_breakdown: list[dict[str, Any]] = []
        for src, vals in sorted(source_sentiments.items(), key=lambda kv: -len(kv[1])):
            mean_val = sum(vals) / len(vals)
            sources_breakdown.append({
                "source_name": src,
                "article_count": len(vals),
                "mean_sentiment": round(mean_val, 3),
                "lean": "bullish" if mean_val > 0.1 else "bearish" if mean_val < -0.1 else "neutral",
            })
        latest_article_at = ranked_articles[0].published_at
        latest_article_dt = _parse_iso(latest_article_at)
        top_title = _clean_title(top_article.title)
        top_fact = next((value for value in key_points if _is_informative_point(value)), "")
        second_fact = next((value for value in key_points[1:] if _is_informative_point(value)), "")
        negative_points = [
            point for point in key_points
            if any(term in point.lower() for term in RISK_HINTS)
        ]
        catalyst = _pick_catalyst(key_points)
        risk = (
            _pick_risk(negative_points or key_points, label)
            if len(matched_articles) > 1
            else "Only one source is backing this signal right now."
        )

        # Get current price for directive generation
        latest_price_doc = latest_prices_by_id.get(instrument_id)
        latest_quote = (latest_price_doc or {}).get("quote", {})
        try:
            current_price = float((latest_quote or {}).get("current", 0.0)) or None
        except Exception:
            current_price = None

        history_points: list[dict[str, Any]] = []
        if store is not None:
            try:
                history_points = store.get_price_history(instrument_id, limit=65)
            except Exception:
                history_points = []

        technical_doc = technicals_by_id.get(instrument_id)
        if not technical_doc and latest_price_doc and history_points:
            technical_doc = build_stock_technical_doc(
                instrument=instrument,
                latest_price=latest_price_doc,
                history_points=history_points,
                as_of_date=now_utc.date().isoformat(),
            )

        self_day_change, vs_market, vs_sector = _comparative_day_change_context(
            instrument,
            instrument_id,
            latest_prices_by_id,
            instruments_by_id,
            market_day_change_values,
        )
        price_context = _summarize_price_context(
            latest_price_doc,
            technical_doc,
            history_points,
            vs_market_day_change_pct=vs_market,
            vs_sector_day_change_pct=vs_sector,
        )

        _, analyst_target, _ = _extract_analyst_from_intel_pro(
            intel_pro_by_id.get(instrument_id),
            current_price,
        )

        # Dated, freshest-first news the model anchors the overview to. Keeping
        # the publish date on each item is what kills the "stale date" problem -
        # the LLM can no longer mistake an 8-day-old story for today's news.
        recent_news: list[dict[str, Any]] = []
        for article in ranked_articles:
            published_dt = _parse_iso(article.published_at)
            age_days = (now_utc - published_dt).total_seconds() / 86400.0
            if age_days > 5:
                continue
            summary = _best_evidence(article, instrument["ticker"])[0] or _clean_title(article.title)
            recent_news.append({
                "date": published_dt.date().isoformat(),
                "title": _clean_title(article.title),
                "summary": str(summary)[:240],
            })
            if len(recent_news) >= 6:
                break

        reddit_ctx = reddit_by_ticker.get(str(instrument["ticker"]).upper())
        earnings_ctx = earnings_by_id.get(instrument_id)
        anomaly_digest = _build_anomaly_digest(
            anomaly_by_doc_id.get(f"{market.upper()}__{str(instrument['ticker']).upper()}")
        )
        prev_doc = store.get_stock_intelligence_doc(market, universe_id, instrument_id) if store else None
        previous_directive = (prev_doc or {}).get("directive")
        if not isinstance(previous_directive, dict) or not str(previous_directive.get("text", "")).strip():
            previous_directive = None
        previous_brief_summary = _previous_brief_summary(prev_doc)

        # Try LLM synthesis first - falls back to deterministic if unavailable
        fundamentals_block = _summarize_intel_pro(intel_pro_by_id.get(instrument_id))
        market_regime = _stock_market_regime(instrument, fundamentals_block, sector_regimes)
        llm_brief = _llm_synthesize_brief(
            ticker=instrument["ticker"],
            name=instrument.get("name", instrument["ticker"]),
            key_points=key_points,
            article_titles=[_clean_title(a.title) for a in ranked_articles[:4]],
            sentiment_label=label,
            sentiment_score=score,
            article_count=len(matched_articles),
            source_count=source_count,
            catalyst=catalyst,
            risk=risk,
            current_price=current_price,
            analyst_target=analyst_target,
            fundamentals=fundamentals_block,
            price_context=price_context,
            market_regime=market_regime,
            recent_news=recent_news,
            reddit=reddit_ctx,
            earnings=earnings_ctx,
            anomaly_digest=anomaly_digest,
            previous_directive=previous_directive,
            previous_brief_summary=previous_brief_summary,
            store=store,
        )

        thesis = ""
        setup_state = "unclear"
        drivers: list[dict[str, Any]] = []
        catalyst_cards: list[dict[str, Any]] = []
        risk_cards: list[dict[str, Any]] = []
        directive: dict[str, Any] | None = None
        if llm_brief:
            headline = llm_brief.get("headline") or _build_headline(instrument, label, top_fact, top_title)
            body = llm_brief.get("body") or _build_body(
                instrument, source_count, len(matched_articles),
                top_title, top_fact, second_fact,
                label=label, catalyst=catalyst, risk=risk,
            )
            final_key_points = llm_brief.get("key_findings") or key_points
            catalyst = llm_brief.get("catalyst") or catalyst
            risk = llm_brief.get("risk") or risk
            thesis = " ".join(str(llm_brief.get("thesis", "")).split()).strip()
            setup_state = str(llm_brief.get("setup_state", "unclear")).strip() or "unclear"
            raw_drivers = llm_brief.get("drivers", [])
            raw_catalyst_cards = llm_brief.get("catalyst_cards", [])
            raw_risk_cards = llm_brief.get("risk_cards", [])
            drivers = _normalize_driver_cards(raw_drivers, final_key_points, limit=4)
            catalyst_cards = _normalize_raw_catalyst_cards(raw_catalyst_cards, limit=3)
            risk_cards = _normalize_risk_cards(raw_risk_cards, limit=3)
            raw_directive = llm_brief.get("directive")
            if isinstance(raw_directive, dict) and str(raw_directive.get("text", "")).strip():
                directive = _repair_directive(dict(raw_directive), current_price=current_price)
        else:
            headline = _build_headline(instrument, label, top_fact, top_title)
            body = _build_body(
                instrument, source_count, len(matched_articles),
                top_title, top_fact, second_fact,
                label=label, catalyst=catalyst, risk=risk,
            )
            final_key_points = key_points
            thesis = headline
            setup_state = "unclear"
            drivers = _drivers_from_points(final_key_points[:3])
            catalyst_cards = [{
                "event": catalyst,
                "detail": f"Flagged in coverage with {label} tone; watch if follow-through materialises.",
                "window": "near-term",
                "expected_impact": 1 if label in ("bullish", "constructive") else -1 if label in ("bearish", "cautious") else 0,
                "priced_in": "med",
            }] if catalyst else []
            risk_cards = [{
                "risk": risk,
                "detail": "Watch for confirming or disconfirming signals in upcoming coverage.",
                "trigger": "headline deterioration",
                "severity": 3,
                "probability": 3,
            }] if risk else []

        if not drivers:
            drivers = _drivers_from_points(final_key_points[:3])
        if not drivers:
            drivers = _fundamental_driver_cards(fundamentals_block)
        generic_markers = (
            "nothing concrete",
            "no ticker-specific catalyst",
            "no specific catalyst",
            "only one source",
            "limited coverage",
            " is mentioned",
            " are mentioned",
            "near-term catalyst is",
        )

        def _is_generic(value: str) -> bool:
            lv = (value or "").lower()
            return _is_low_quality_catalyst(value) or any(m in lv for m in generic_markers)

        if not catalyst_cards and catalyst and not _is_generic(catalyst):
            catalyst_cards = [{
                "event": catalyst,
                "detail": f"Flagged in coverage with {label} tone; watch if follow-through materialises.",
                "window": "near-term",
                "expected_impact": 1 if label in ("bullish", "constructive") else -1 if label in ("bearish", "cautious") else 0,
                "priced_in": "med",
            }]
        catalyst_cards = _normalize_catalyst_cards(catalyst_cards, earnings=earnings_ctx)

        # If the plain catalyst string is a generic fallback but we have a
        # real structured catalyst card, surface the card's event instead so
        # the header doesn't contradict the card below it.
        if catalyst_cards and _is_generic(catalyst):
            event = str(catalyst_cards[0].get("event", "")).strip()
            if event:
                catalyst = event
        if not risk_cards and risk and not _is_generic(risk):
            risk_cards = [{
                "risk": risk,
                "detail": "Watch for confirming or disconfirming signals in upcoming coverage.",
                "trigger": "headline deterioration",
                "severity": 3,
                "probability": 3,
            }]
        if not risk_cards:
            risk_cards = _fundamental_risk_cards(fundamentals_block, limit=2)

        if _has_invalid_earnings_timing(catalyst, earnings_ctx):
            catalyst = str(catalyst_cards[0].get("event", "")).strip() if catalyst_cards else ""
        if _is_low_quality_catalyst(catalyst):
            catalyst = str(catalyst_cards[0].get("event", "")).strip() if catalyst_cards else ""
        if (
            _has_invalid_earnings_timing(headline, earnings_ctx)
            or _too_long_headline(headline)
            or _is_low_quality_brief_text(headline)
        ):
            headline = _build_headline(instrument, label, top_fact, top_title)
        if (
            _has_invalid_earnings_timing(body, earnings_ctx)
            or _is_circular_brief_body(body, headline, catalyst)
            or _is_low_quality_brief_text(body)
        ):
            body = _build_body(
                instrument, source_count, len(matched_articles),
                top_title, top_fact, second_fact,
                label=label, catalyst=catalyst, risk=risk,
            )
        if thesis and _has_invalid_earnings_timing(thesis, earnings_ctx):
            thesis = headline

        if directive is None:
            directive = _deterministic_directive(
                sentiment_label=label,
                current_price=current_price,
                analyst_target=analyst_target,
                price_context=price_context,
            )

        # Keep key points non-repetitive versus thesis/headline/body.
        dedupe_base = " ".join([thesis, headline, body]).lower()
        filtered_points: list[str] = []
        for point in final_key_points:
            p = " ".join(str(point).split()).strip()
            if not p:
                continue
            lower = p.lower()
            if lower in dedupe_base:
                continue
            if p not in filtered_points:
                filtered_points.append(p)
        if filtered_points:
            final_key_points = filtered_points[:4]

        # Event-oriented timeline with deterministic IDs and scoring.
        timeline_events: list[dict[str, Any]] = []
        for article in ranked_articles[:10]:
            summary = (_best_evidence(article, instrument["ticker"])[0] or _clean_title(article.title))
            quality_score = _article_quality_score(article, instrument["ticker"])
            event_ts = _parse_iso(article.published_at)
            recency_hours = max(0.0, (now_utc - event_ts).total_seconds() / 3600.0)
            timeline_events.append({
                "event_id": _event_id(article, instrument["ticker"], summary),
                "timestamp": article.published_at,
                "title": article.title,
                "summary": summary,
                "sentiment_label": article.sentiment_label,
                "source_name": article.source_name,
                "article_url": article.url,
                "event_type": _event_type_from_article(article),
                "confidence_score": _confidence_score(
                    article_count=len(matched_articles),
                    source_count=source_count,
                    recency_hours=recency_hours,
                    evidence_count=len(key_points),
                ),
                "impact_score": _impact_score(
                    article=article,
                    quality_score=quality_score,
                    recency_hours=recency_hours,
                    summary=summary,
                ),
            })
        timeline = _dedupe_timeline_events(timeline_events, limit=6)

        prev_event_ids = {
            str(item.get("event_id", "")).strip()
            for item in (prev_doc or {}).get("timeline", [])
            if isinstance(item, dict) and str(item.get("event_id", "")).strip()
        }
        for event in timeline:
            event["is_new_since_last_run"] = str(event.get("event_id", "")) not in prev_event_ids

        freshness = _freshness_status(latest_article_dt, now_utc)
        freshness_hours = max(0.0, (now_utc - latest_article_dt).total_seconds() / 3600.0)
        confidence_score = _confidence_score(
            article_count=len(matched_articles),
            source_count=source_count,
            recency_hours=freshness_hours,
            evidence_count=len(key_points),
        )

        # Comparative context against market and sector peers.
        instrument_sector = str(instrument.get("sector", "")).strip().lower()
        sorted_market = sorted(market_day_change_values) if market_day_change_values else []
        percentile = 50
        if sorted_market:
            below = sum(1 for value in sorted_market if value <= self_day_change)
            percentile = int(round((below / len(sorted_market)) * 100))
        market_median = (
            sum(market_day_change_values) / len(market_day_change_values)
            if market_day_change_values
            else 0.0
        )
        sector_values: list[float] = []
        for peer_id, payload in latest_prices_by_id.items():
            peer = instruments_by_id.get(peer_id)
            if not peer:
                continue
            if str(peer.get("sector", "")).strip().lower() != instrument_sector:
                continue
            peer_quote = (payload.get("quote") or {}) if isinstance(payload, dict) else {}
            peer_change = _to_float(peer_quote.get("day_change_pct"))
            if peer_change is not None:
                sector_values.append(peer_change)
        sector_median = sum(sector_values) / len(sector_values) if sector_values else 0.0

        comparative_context = {
            "day_change_pct": round(self_day_change, 4),
            "vs_market_day_change_pct": round(self_day_change - market_median, 4),
            "vs_sector_day_change_pct": round(self_day_change - sector_median, 4),
            "market_percentile": percentile,
        }
        previous_v2 = (prev_doc or {}).get("directive_v2")
        if not isinstance(previous_v2, dict):
            previous_v2 = None
        visual_cards = _visual_cards(
            drivers=drivers,
            catalyst_cards=catalyst_cards,
            risk_cards=risk_cards,
        )
        directive_v2_input = {
            "instrument_id": instrument_id,
            "market": market,
            "universe_id": universe_id,
            "generated_at": now_utc.isoformat(),
            "as_of": now_utc.isoformat(),
            "headline": headline,
            "body": body,
            "thesis": thesis or headline,
            "setup_state": setup_state,
            "catalyst": catalyst,
            "risk": risk,
            "key_points": final_key_points,
            "visual_summary": visual_cards,
            "visual_cards": visual_cards,
            "directive": directive,
            "current_price": current_price,
            "analyst_target": analyst_target,
            "fundamentals": fundamentals_block,
            "price_context": price_context,
            "news_digest": _build_news_digest(
                recent_news=recent_news,
                timeline=timeline,
                visual_summary={
                    "drivers": drivers,
                    "catalyst_cards": catalyst_cards,
                    "risk_cards": risk_cards,
                },
                freshness_hours=freshness_hours,
            ),
            "anomaly_digest": anomaly_digest,
            "options_digest": options_by_id.get(instrument_id),
            "overall_label": label,
            "overall_score": score,
            "market_regime": market_regime,
            "comparative_context": comparative_context,
        }

        docs.append({
            **directive_v2_input,
            "source": LLM_BRIEF_SOURCE,
            "coverage_type": "on_demand_news",
            "directive_v2": build_directive_v2(directive_v2_input, previous_v2=previous_v2),
            "lanes": [
                {"label": "Positive Mentions", "positive_pct": positive_pct},
                {"label": "Source Agreement", "positive_pct": source_agreement_pct},
            ],
            "sources_breakdown": sources_breakdown,
            "news_count": len(evidence_articles),
            "source_count": source_count,
            "latest_article_at": latest_article_at,
            "mention_volume_series": _mention_series(evidence_articles),
            "related_instrument_ids": [instrument_id for instrument_id, _ in co_mentions.most_common(3)],
            "timeline": timeline,
            "data_quality": {
                "confidence_score": confidence_score,
                "freshness_status": freshness,
                "freshness_hours": round(freshness_hours, 2),
                "evidence_count": len(key_points),
                "source_tier_mix": _source_tier_mix(evidence_articles),
            },
            "comparative_context": comparative_context,
            "run_context": {
                "run_at": now_utc.isoformat(),
                "lookback_hours": 24,
                "namespace": f"{market}__{universe_id}",
                "has_prior_run": bool(prev_doc),
            },
        })

    return docs
