"""Aggregate enriched articles into per-stock intelligence docs."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import re
from typing import Any

import requests

from backend.llm_client import (
    MIMO_API_URL,
    json_response_format,
    llm_api_key,
    llm_headers,
    llm_model,
    parse_json_content,
    schema_system_prompt,
)
from backend.models import Article

logger = logging.getLogger(__name__)

LLM_API_URL = MIMO_API_URL
STOCK_BRIEF_CACHE_VERSION = "2026-04-21-stock-brief-v7-fundamentals"


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

STOCK_BRIEF_SYSTEM_PROMPT = """You write stock intelligence for a premium market app. Smart but easy to read.

The user sees the price chart already. Don't describe price moves. Tell them what it MEANS.

You receive evidence from news articles about a stock. Synthesize it.

Fields to write:

- **headline**: Under 12 words. An insight, not a price move. BAD: "NVDA rises on earnings." GOOD: "Data-center demand is outpacing bull-case estimates."

- **body**: 2-3 short sentences. Use \\n\\n for paragraph breaks if needed. What does this mean for someone holding the stock? What's the implication the headlines miss? Never open with "[Company] has seen..." — lead with the insight.

- **key_findings**: 2-4 short, punchy takeaways. Each one a different insight the user wouldn't get from the chart. Frame facts as implications: not "analyst set $200 target" but "Street consensus is 15% above current price — the market hasn't caught up to the upgrade cycle yet."

- **catalyst**: One sentence. The most important near-term trigger and what a surprise would mean. Not just "earnings coming" — what's priced in and what breaks if it misses.

- **risk**: One sentence. The biggest downside scenario — what specifically goes wrong and what's the consequence.

- **thesis**: One line, max 12 words. This is the primary "card title" insight.
- **setup_state**: one of ["accumulation", "breakout", "trend", "rotation", "exhaustion", "unclear"].
- **drivers**: 2-4 objects with keys:
  - label: short driver statement (3-6 words)
  - detail: ONE sentence explaining what the label means — concrete, tied to evidence. Example: label="Analyst upgrades on AI demand" → detail="Three analysts raised price targets this week citing data-center order growth."
  - direction: "up" | "down" | "mixed"
  - strength: integer 1-5
  - horizon: "today" | "week" | "quarter"
- **catalyst_cards**: 1-3 objects with keys:
  - event: short event name (3-6 words). Example: "Foxconn revenue report"
  - detail: ONE sentence explaining why this matters for the stock. Example: "Foxconn is a key Nvidia supplier — strong revenue hints at AI server demand holding up through Q2."
  - window, expected_impact (-2 to 2), priced_in ("low" | "med" | "high")
- **risk_cards**: 1-3 objects with keys:
  - risk: short risk name (3-6 words)
  - detail: ONE sentence explaining the downside scenario concretely.
  - trigger, severity (1-5), probability (1-5)

- **directive**: ONE actionable stance the user can take or watch for. Pick the single best fit based on evidence. Object with:
  - text: the directive as a short imperative (under 10 words). Examples: "Accumulate on dips below $198", "Trim into strength above $220", "Watch Q1 earnings Apr 27", "Re-evaluate if Azure growth softens", "Starter position only — evidence thin"
  - stance: one of ["accumulate", "trim", "watch", "avoid", "hold"]
  - trigger_type: one of ["price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"]
  - trigger_value: a STRING. PARITY IS MANDATORY:
      · If text mentions a price like "$198" → trigger_type MUST be "price_below" or "price_above" AND trigger_value MUST be "198" (just the numeric string, no $ sign).
      · If text mentions a date or event with a date → trigger_type MUST be "date" AND trigger_value MUST be a full ISO date in the FUTURE relative to TODAY'S DATE (which will be given in the user payload as `today`). Never use 2023 or past years. If no reliable future date is known, use trigger_type "none" instead.
      · For sentiment_flip/new_catalyst/none → trigger_value MUST be "".
      · Mismatches between text and trigger fields are NOT allowed. Every numeric price in text must appear as trigger_value.
  - rationale: ONE sentence explaining why this directive fits, grounded in the evidence.
  - confidence: "low" | "med" | "high"

STYLE:
- Conversational, sharp, zero filler
- Short sentences mixed with longer ones
- NO: "investors should monitor", "well-positioned", "could potentially", "it's worth noting"
- If evidence is thin, say what the silence means — not just "limited coverage"
- Do not repeat the same fact across headline/body/key_findings/thesis/drivers/catalyst/risk.
- If overlap exists, keep it in thesis and remove duplicates from other fields.

FUNDAMENTALS — USE THEM:
- The user payload includes a `fundamentals` block with four pillar scores (valuation, growth, quality, momentum — each 0-100), plus `standout_metrics` (score ≥ 75) and `weak_metrics` (score ≤ 25) and quant-driven `catalysts` (earnings dates, rank upgrades, short spikes). These are ground truth, not news.
- Let fundamentals shape the directive: a stock with weak valuation (PEG > 2, P/E > sector) trading up on news = "trim into strength" not "accumulate". A beaten-down name with strong growth and a Buy-tilted quant rank = "accumulate on dips".
- Use fundamentals to pick concrete trigger prices — e.g. if the stock is above its analyst target, a "trim above $X" directive is natural; if below, "accumulate below $Y".
- Drivers and risk_cards should weave fundamentals + news: "label: Margin expansion outpaces peers / detail: Operating margin sits in the sector's top quartile while revenue still compounds at 16% YoY."
- Do NOT restate raw metric numbers that the scorecard already renders. Instead, interpret them. BAD: "P/E is 28.5". GOOD: "Valuation is rich but growth is pricing it fairly — PEG under 1.2 keeps the setup constructive."
- If fundamentals contradict the news sentiment, surface the tension in the body/thesis — that's the insight the user can't get elsewhere.

EVIDENCE DISCIPLINE — THIS IS CRITICAL:
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
                "description": "2-4 distinct concrete takeaways. Each a different fact — no redundancy.",
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
                    "stance": {"type": "string", "enum": ["accumulate", "trim", "watch", "avoid", "hold"]},
                    "trigger_type": {"type": "string", "enum": ["price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"]},
                    "trigger_value": {"type": "string"},
                    "rationale": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["low", "med", "high"]},
                },
                "required": ["text", "stance", "trigger_type", "trigger_value", "rationale", "confidence"],
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
    store: Any | None = None,
) -> dict[str, str] | None:
    """Call MiMo to generate a synthesized stock brief. Returns None on failure."""
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
                return cached["payload"]
        except Exception:
            pass

    try:
        resp = requests.post(
            LLM_API_URL,
            headers=llm_headers(api_key),
            json={
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": schema_system_prompt(STOCK_BRIEF_SYSTEM_PROMPT, STOCK_BRIEF_SCHEMA)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": json_response_format(),
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        result = parse_json_content(content)

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


NO_NEWS_BRIEF_SYSTEM_PROMPT = """You write stock intelligence for a premium market app. This stock has NO recent news — make that silence meaningful.

The user sees the price chart. Don't describe the price. Tell them what the quiet means.

- **headline**: Under 12 words. Not "limited coverage for AMD." Something insightful about the silence: "AMD is quietly holding gains while the street looks elsewhere."
- **body**: 2-3 short sentences. What does the technical and analyst picture tell someone holding this stock? Is this stock coiled, exhausted, or just boring? Use \\n\\n for breaks.
- **key_findings**: 2-3 punchy insights from the numbers — analyst target gap, RSI, distance from highs, what these imply.
- **catalyst**: What could break the silence. Be specific.
- **risk**: What the lack of coverage might be hiding.
- **thesis**: One line, max 12 words.
- **setup_state**: one of ["accumulation", "breakout", "trend", "rotation", "exhaustion", "unclear"].
- **drivers**: 2-4 concise driver objects.
- **catalyst_cards**: 1-3 trigger cards.
- **risk_cards**: 1-3 downside cards.

STYLE: Conversational, sharp, zero filler. Short paragraphs.
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
        resp = requests.post(
            LLM_API_URL,
            headers=llm_headers(api_key),
            json={
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": schema_system_prompt(NO_NEWS_BRIEF_SYSTEM_PROMPT, STOCK_BRIEF_SCHEMA)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": json_response_format(),
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
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

    headline = str(brief.get("headline", "")).strip()
    body = str(brief.get("body", "")).strip()
    thesis = " ".join(str(brief.get("thesis", "")).split()).strip() or headline
    setup_state = str(brief.get("setup_state", "unclear")).strip() or "unclear"
    catalyst = str(brief.get("catalyst", "")).strip()
    risk = str(brief.get("risk", "")).strip()
    key_findings = [str(point).strip() for point in (brief.get("key_findings") or []) if str(point).strip()][:4]

    raw_drivers = brief.get("drivers", []) or []
    drivers = [item for item in raw_drivers if isinstance(item, dict)][:4]
    raw_catalyst_cards = brief.get("catalyst_cards", []) or []
    catalyst_cards = [
        item for item in raw_catalyst_cards
        if isinstance(item, dict) and str(item.get("detail", "")).strip()
    ][:3]
    raw_risk_cards = brief.get("risk_cards", []) or []
    risk_cards = [
        item for item in raw_risk_cards
        if isinstance(item, dict) and str(item.get("detail", "")).strip()
    ][:3]
    raw_directive = brief.get("directive")
    directive = None
    if isinstance(raw_directive, dict) and str(raw_directive.get("text", "")).strip():
        directive = _repair_directive(dict(raw_directive))

    return {
        "instrument_id": instrument_id,
        "market": market,
        "universe_id": universe_id,
        "generated_at": now_utc.isoformat(),
        "as_of": now_utc.isoformat(),
        "headline": headline,
        "body": body,
        "thesis": thesis,
        "setup_state": setup_state,
        "catalyst": catalyst,
        "risk": risk,
        "key_points": key_findings,
        "visual_summary": {
            "drivers": drivers,
            "catalyst_cards": catalyst_cards,
            "risk_cards": risk_cards,
        },
        "directive": directive,
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


PORTFOLIO_BRIEF_SYSTEM_PROMPT = """You produce structured intelligence cards for a premium market app dashboard. Think Bloomberg Terminal meets Morning Brew — each card is a discrete, punchy insight.

You get the user's watchlist with price moves, headlines, sentiment, catalysts, sectors, analyst data, and news. Your job is to generate content for FOUR distinct intelligence cards. Each card must be self-contained and cover different ground.

**narrative**: 2-3 sentences summarizing the single most important story across the entire portfolio today. Not "stocks are up/down" — the THEME. What's driving the market, what changed, what matters for THIS portfolio. Write like a sharp newsletter opener. Max 50 words. Don't mention specific prices or percentages — the user sees those on the tiles. Focus on the WHY.

Example: "The AI trade is fracturing. NVDA keeps pulling away from AMD on data-center wins, and your tech-heavy portfolio is riding that wave — but the gap is getting unsustainable. Watch for a rotation into value names if bond yields spike again this week."

**tiles**: An array with EXACTLY ONE entry for EACH stock in the watchlist. Each tile replaces a chart with actual intelligence. Each entry needs:
  - ticker: the stock symbol
  - micro: A 5-10 word insight — the single most important thing to know about THIS stock RIGHT NOW. Examples: "Riding AI spending wave", "Earnings Apr 27 — analysts bullish", "RSI overbought, pullback likely", "Defense budget boost incoming", "Revenue miss fears building". Be specific — include dates, events, numbers when you know them. If earnings are upcoming, ALWAYS mention the date.
  - vibe: "up" (momentum/opportunity), "down" (risk/weakness), or "wild" (volatile/uncertain)

**movers**: An array of up to 4 stocks from the watchlist that had the most dramatic or newsworthy action. Each entry needs:
  - ticker: the symbol
  - one_liner: A punchy 8-15 word insight (not "up 3% today" — more like "earnings whisper numbers just leaked and they're ugly")
  - vibe: "up", "down", or "wild"

**signals**: An array of exactly 3 external forces / macro events / geopolitical things that affect this specific portfolio. Each signal needs:
  - tag: A short category label, 1-2 words (e.g., "Fed", "Oil", "Tariffs", "Earnings", "China", "AI Spending", "Bonds", "Currency")
  - headline: A punchy 6-12 word insight headline
  - body: 1-2 sentences explaining the signal and how it connects to the user's holdings. Max 40 words.
  - detail: A longer 3-5 sentence deep-dive explanation of this signal. Include specific data points, historical context, or expert opinions that make the user smarter. Max 80 words. This is shown when the user clicks "read more".
  - vibe: "positive", "negative", or "neutral"

**blind_spot_title**: A 4-8 word intriguing headline about what the user is MISSING. Something they'd want to click on. Based on their portfolio composition — what sectors, themes, rotations are they not exposed to?

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

STYLE:
- Every field should be insight-first. Never narrate price moves.
- Only mention earnings/events if they appear in current_events or premium_signals. Never invent or reuse stale event dates.
- RSI language must be precise: RSI <=35 can be called oversold/washed out; RSI >=70 can be called overbought/stretched; 35-70 is neutral/normal.
- Write like you're texting a smart friend, not writing a research report
- Bold claims > hedged language. "That's a problem" > "this could potentially be concerning"
- Specific > vague. Name the stock, the event, the number
- Each card covers COMPLETELY different ground — zero repetition across cards
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
                            "description": "5-10 word insight — the single most important thing about this stock RIGHT NOW. Examples: 'Riding AI spending wave', 'Earnings Apr 27 — analysts bullish', 'RSI overbought, pullback likely'.",
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

PORTFOLIO_BRIEF_CACHE_VERSION = "2026-05-01-portfolio-brief-v13"


def generate_portfolio_brief(
    stock_payloads: list[dict[str, Any]],
    store: Any | None = None,
) -> dict[str, str] | None:
    """Generate a personalized portfolio brief from stock intelligence docs."""
    api_key = llm_api_key()
    if not api_key or not stock_payloads:
        return None

    model = llm_model()

    watchlist_data = []
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
        watchlist_data.append({
            "ticker": doc.get("symbol", ""),
            "name": doc.get("name", ""),
            "sector": doc.get("sector", ""),
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
            "current_events": (facts.get("events") or [])[:3],
            "news_velocity": doc.get("newsVelocity") or {},
            "key_metric_summaries": doc.get("keyMetricSummaries") or [],
            "article_count": len(doc.get("news", [])),
            "top_news": [n.get("title", "") for n in (doc.get("news") or [])[:3]],
            "earnings_date": (doc.get("earnings") or {}).get("date"),
            "earnings_eps_estimate": (doc.get("earnings") or {}).get("epsEstimate"),
            "streak_days": (doc.get("streak") or {}).get("days", 0),
            "streak_direction": (doc.get("streak") or {}).get("direction", "flat"),
        })

    payload = {"watchlist": watchlist_data, "stock_count": len(watchlist_data)}

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
        resp = requests.post(
            LLM_API_URL,
            headers=llm_headers(api_key),
            json={
                "model": model,
                "temperature": 0.3,
                "messages": [
                    {"role": "system", "content": schema_system_prompt(PORTFOLIO_BRIEF_SYSTEM_PROMPT, PORTFOLIO_BRIEF_SCHEMA)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": json_response_format(),
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
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


MARKET_BRIEF_SYSTEM_PROMPT = """You write the daily market brief for a premium market app. Think Morning Brew meets Goldman Sachs — smart but effortless to read.

The user sees index values, charts, and change% already. Don't narrate numbers back. Deliver insight.

You receive market-level data: index performance, global cues (oil, gold, DXY, VIX, 10-year yield), top movers, sentiment, and stock-level headlines.

Write THREE sections. Use SHORT paragraphs (2-3 sentences max each). Separate paragraphs with \\n\\n. Conversational but sharp.

**overview**: The story behind today's market. Why are things moving this way? What's the tension? What's the market telling us between the lines? 2-3 short paragraphs.

**global_forces**: The macro forces actually driving things. Not "oil dropped" — why it dropped and what that means for THIS market. Only cover what matters. Use \\n\\n between paragraphs. 1-2 short paragraphs.

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
                "description": "4-5 sentence market overview — the main narrative.",
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
        resp = requests.post(
            LLM_API_URL,
            headers=llm_headers(api_key),
            json={
                "model": model,
                "temperature": 0.3,
                "messages": [
                    {"role": "system", "content": schema_system_prompt(MARKET_BRIEF_SYSTEM_PROMPT, MARKET_BRIEF_SCHEMA)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": json_response_format(),
            },
            timeout=30,
        )
        resp.raise_for_status()
        result = parse_json_content(resp.json()["choices"][0]["message"]["content"])

        if store is not None and cache_key:
            try:
                store.save_llm_enrichment(cache_key, {"payload": result, "model": model, "cache_version": MARKET_BRIEF_CACHE_VERSION})
            except Exception:
                pass

        return result
    except Exception as exc:
        logger.warning("Market brief generation failed: %s", exc)
        return None


SECTOR_BRIEF_SYSTEM_PROMPT = """You write sector briefs for a premium market app. Morning Brew meets Goldman Sachs — smart but easy to read.

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
                "description": "4-5 sentence sector analysis — what's happening and why.",
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
        resp = requests.post(
            LLM_API_URL,
            headers=llm_headers(api_key),
            json={
                "model": model,
                "temperature": 0.3,
                "messages": [
                    {"role": "system", "content": schema_system_prompt(SECTOR_BRIEF_SYSTEM_PROMPT, SECTOR_BRIEF_SCHEMA)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": json_response_format(),
            },
            timeout=30,
        )
        resp.raise_for_status()
        result = parse_json_content(resp.json()["choices"][0]["message"]["content"])

        if store is not None and cache_key:
            try:
                store.save_llm_enrichment(cache_key, {"payload": result, "model": model, "cache_version": SECTOR_BRIEF_CACHE_VERSION})
            except Exception:
                pass

        return result
    except Exception as exc:
        logger.warning("Sector brief generation failed for %s: %s", sector_name, exc)
        return None


def _repair_directive(directive: dict[str, Any]) -> dict[str, Any]:
    """Enforce parity between directive.text and trigger fields.

    LLMs frequently put a price in the text but forget to echo it into
    trigger_value, or emit a past date. Fix both cases here so the UI can
    reliably wire an alert button.
    """
    text = str(directive.get("text", ""))
    trigger_type = str(directive.get("trigger_type", "none"))
    trigger_value = str(directive.get("trigger_value", "")).strip()

    price_match = re.search(r"\$(\d{1,7}(?:\.\d+)?)", text)
    if price_match:
        price_str = price_match.group(1)
        lowered = text.lower()
        if trigger_type not in ("price_below", "price_above"):
            trigger_type = "price_below" if any(
                word in lowered for word in ("below", "under", "dip", "pullback")
            ) else "price_above"
        trigger_value = price_str
    elif trigger_type == "date":
        today_iso = datetime.now(timezone.utc).date().isoformat()
        if not trigger_value or trigger_value < today_iso:
            trigger_type = "none"
            trigger_value = ""
    elif trigger_type in ("sentiment_flip", "new_catalyst", "none"):
        trigger_value = ""

    directive["trigger_type"] = trigger_type
    directive["trigger_value"] = trigger_value
    return directive


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
)


def _clean_sentence(value: str) -> str:
    cleaned = " ".join(str(value).split()).strip()
    cleaned = re.sub(r"\s*-\s*[A-Za-z0-9 .,&'/:-]+$", "", cleaned)
    for prefix in GENERIC_STARTS:
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix):].lstrip(" :,-")
            break
    return cleaned.strip().rstrip(".")


CLICKBAIT_POINT_TERMS = (
    "buy or sell",
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
)


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
    if any(term in lowered for term in CLICKBAIT_POINT_TERMS):
        return False
    if _is_vague(cleaned):
        return False
    if _looks_like_raw_title(cleaned):
        return False
    return True


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
    if top_fact and not _is_vague(top_fact):
        return top_fact
    if top_title and not _is_vague(top_title):
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

    # Nothing concrete — say so plainly
    lead = ""
    if top_fact and not _is_vague(top_fact):
        lead = top_fact
    elif top_title and not _is_vague(top_title):
        lead = top_title

    if not lead:
        if article_count == 1:
            return f"Coverage is thin for {ticker} — one article from {source_count} source, no concrete catalyst or event extracted."[:400]
        return f"Coverage for {ticker} is light — {article_count} articles across {source_count} sources, but nothing concrete on catalysts or earnings."[:400]

    # Build a synthesis that connects the dots instead of just listing facts
    parts: list[str] = []

    # Lead with the concrete fact
    parts.append(lead.rstrip("."))

    # Add second fact if it adds something different
    if second_fact and not _is_vague(second_fact) and second_fact.lower() != lead.lower():
        parts.append(second_fact.rstrip("."))

    body = ". ".join(parts)

    # Add source consensus context — this helps the reader gauge confidence
    if article_count >= 3 and source_count >= 2:
        if label in ("bullish", "constructive"):
            body += f". {source_count} sources are aligned on a {label} outlook"
        elif label in ("cautious", "bearish"):
            body += f". {source_count} sources point to a {label} tone"
    elif article_count == 1 and source_count == 1:
        body += ". Only one source is backing this right now — confidence is limited"

    # Add a forward-looking hook if we have catalyst or risk
    has_catalyst = catalyst and "nothing concrete" not in catalyst.lower()
    has_risk = risk and "nothing concrete" not in risk.lower() and "only one source" not in risk.lower()
    if has_catalyst and has_risk:
        body += f". Watch for {catalyst.lower()}, though {risk.lower()} remains a factor"
    elif has_catalyst:
        body += f". The near-term catalyst is {catalyst.lower()}"
    elif has_risk:
        body += f". Key risk to monitor: {risk.lower()}"

    return body[:500]


def build_stock_intelligence_docs(
    market: str,
    universe_id: str,
    instruments: list[dict[str, Any]],
    articles: list[Article],
    store: Any | None = None,
) -> list[dict[str, Any]]:
    articles_by_instrument: dict[str, list[Article]] = defaultdict(list)
    instruments_by_ticker = {instrument["ticker"].upper(): instrument for instrument in instruments}
    instruments_by_id = {instrument["instrument_id"]: instrument for instrument in instruments}
    now_utc = datetime.now(timezone.utc)

    latest_prices_by_id: dict[str, dict[str, Any]] = {}
    intel_pro_by_id: dict[str, dict[str, Any]] = {}
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
        # Drop articles the enricher flagged as unscored — these are landing
        # pages / listing URLs that the LLM couldn't extract substance from.
        # Using the LLM's own quality signal instead of hardcoded title regexes.
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
            if instrument and _article_quality_score(article, ticker) >= 25:
                matched_ids.add(instrument["instrument_id"])
        for instrument_id in matched_ids:
            articles_by_instrument[instrument_id].append(article)

    docs: list[dict[str, Any]] = []
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        matched_articles = sorted(articles_by_instrument.get(instrument_id, []), key=lambda item: item.published_at, reverse=True)
        if not matched_articles:
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
        latest_quote = (latest_prices_by_id.get(instrument_id, {}) or {}).get("quote", {})
        try:
            current_price = float((latest_quote or {}).get("current", 0.0)) or None
        except Exception:
            current_price = None

        # Try LLM synthesis first — falls back to deterministic if unavailable
        fundamentals_block = _summarize_intel_pro(intel_pro_by_id.get(instrument_id))
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
            analyst_target=None,
            fundamentals=fundamentals_block,
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
            drivers = [item for item in raw_drivers if isinstance(item, dict)][:4]
            # Drop catalyst/risk cards the LLM padded without a real detail or
            # with placeholder labels — empty beats generic.
            catalyst_cards = [
                item for item in raw_catalyst_cards
                if isinstance(item, dict)
                and str(item.get("detail", "")).strip()
                and "nothing concrete" not in str(item.get("event", "")).lower()
            ][:3]
            risk_cards = [
                item for item in raw_risk_cards
                if isinstance(item, dict)
                and str(item.get("detail", "")).strip()
                and "nothing concrete" not in str(item.get("risk", item.get("label", ""))).lower()
            ][:3]
            raw_directive = llm_brief.get("directive")
            if isinstance(raw_directive, dict) and str(raw_directive.get("text", "")).strip():
                directive = _repair_directive(dict(raw_directive))
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
            drivers = [
                {"label": point, "direction": "mixed", "strength": 3, "horizon": "week"}
                for point in final_key_points[:3]
            ]
            catalyst_cards = [{
                "event": catalyst,
                "window": "near-term",
                "expected_impact": 1 if label in ("bullish", "constructive") else -1 if label in ("bearish", "cautious") else 0,
                "priced_in": "med",
            }] if catalyst else []
            risk_cards = [{
                "risk": risk,
                "trigger": "headline deterioration",
                "severity": 3,
                "probability": 3,
            }] if risk else []

        if not drivers:
            drivers = [
                {"label": point, "direction": "mixed", "strength": 3, "horizon": "week"}
                for point in final_key_points[:3]
            ]
        generic_markers = (
            "nothing concrete",
            "no ticker-specific catalyst",
            "no specific catalyst",
            "only one source",
            "limited coverage",
        )

        def _is_generic(value: str) -> bool:
            lv = (value or "").lower()
            return any(m in lv for m in generic_markers)

        if not catalyst_cards and catalyst and not _is_generic(catalyst):
            catalyst_cards = [{
                "event": catalyst,
                "detail": f"Flagged in coverage with {label} tone; watch if follow-through materialises.",
                "window": "near-term",
                "expected_impact": 1 if label in ("bullish", "constructive") else -1 if label in ("bearish", "cautious") else 0,
                "priced_in": "med",
            }]

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

        prev_doc = store.get_stock_intelligence_doc(market, universe_id, instrument_id) if store else None
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
        self_day_change = 0.0
        quote = (latest_prices_by_id.get(instrument_id, {}) or {}).get("quote", {})
        try:
            self_day_change = float((quote or {}).get("day_change_pct", 0.0))
        except Exception:
            self_day_change = 0.0

        sector_values: list[float] = []
        for peer_id, payload in latest_prices_by_id.items():
            peer = instruments_by_id.get(peer_id)
            if not peer:
                continue
            if str(peer.get("sector", "")).strip().lower() != instrument_sector:
                continue
            peer_quote = (payload.get("quote") or {}) if isinstance(payload, dict) else {}
            try:
                sector_values.append(float(peer_quote.get("day_change_pct", 0.0)))
            except Exception:
                continue

        market_median = sum(market_day_change_values) / len(market_day_change_values) if market_day_change_values else 0.0
        sector_median = sum(sector_values) / len(sector_values) if sector_values else 0.0
        sorted_market = sorted(market_day_change_values) if market_day_change_values else []
        percentile = 50
        if sorted_market:
            below = sum(1 for value in sorted_market if value <= self_day_change)
            percentile = int(round((below / len(sorted_market)) * 100))

        docs.append({
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
            "visual_summary": {
                "drivers": drivers,
                "catalyst_cards": catalyst_cards,
                "risk_cards": risk_cards,
            },
            "directive": directive,
            "overall_label": label,
            "overall_score": score,
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
            "comparative_context": {
                "day_change_pct": round(self_day_change, 4),
                "vs_market_day_change_pct": round(self_day_change - market_median, 4),
                "vs_sector_day_change_pct": round(self_day_change - sector_median, 4),
                "market_percentile": percentile,
            },
            "run_context": {
                "run_at": now_utc.isoformat(),
                "lookback_hours": 24,
                "namespace": f"{market}__{universe_id}",
                "has_prior_run": bool(prev_doc),
            },
        })

    return docs
