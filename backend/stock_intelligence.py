"""Aggregate enriched articles into per-stock intelligence docs."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import os
import re
from typing import Any

import requests

from backend.models import Article

logger = logging.getLogger(__name__)

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
STOCK_BRIEF_CACHE_VERSION = "2026-04-12-stock-brief-v4"

STOCK_BRIEF_SYSTEM_PROMPT = """You write stock intelligence for a premium market app. Smart but easy to read.

The user sees the price chart already. Don't describe price moves. Tell them what it MEANS.

You receive evidence from news articles about a stock. Synthesize it.

Fields to write:

- **headline**: Under 12 words. An insight, not a price move. BAD: "NVDA rises on earnings." GOOD: "Data-center demand is outpacing bull-case estimates."

- **body**: 2-3 short sentences. Use \\n\\n for paragraph breaks if needed. What does this mean for someone holding the stock? What's the implication the headlines miss? Never open with "[Company] has seen..." — lead with the insight.

- **key_findings**: 2-4 short, punchy takeaways. Each one a different insight the user wouldn't get from the chart. Frame facts as implications: not "analyst set $200 target" but "Street consensus is 15% above current price — the market hasn't caught up to the upgrade cycle yet."

- **catalyst**: One sentence. The most important near-term trigger and what a surprise would mean. Not just "earnings coming" — what's priced in and what breaks if it misses.

- **risk**: One sentence. The biggest downside scenario — what specifically goes wrong and what's the consequence.

STYLE:
- Conversational, sharp, zero filler
- Short sentences mixed with longer ones
- NO: "investors should monitor", "well-positioned", "could potentially", "it's worth noting"
- If evidence is thin, say what the silence means — not just "limited coverage"
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
        },
        "required": ["headline", "body", "key_findings", "catalyst", "risk"],
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
    store: Any | None = None,
) -> dict[str, str] | None:
    """Call OpenAI to generate a synthesized stock brief. Returns None on failure."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.getenv("TRACE_MONEY_LLM_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

    payload = {
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
            OPENAI_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": STOCK_BRIEF_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": STOCK_BRIEF_SCHEMA,
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        result = json.loads(content)

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

STYLE: Conversational, sharp, zero filler. Short paragraphs.
"""

NO_NEWS_BRIEF_CACHE_VERSION = "2026-04-12-no-news-brief-v3"


def generate_no_news_brief(
    ticker: str,
    name: str,
    price_data: dict[str, Any],
    technicals: dict[str, Any],
    analyst: dict[str, Any],
    store: Any | None = None,
) -> dict[str, str] | None:
    """Generate an LLM brief for stocks with no news coverage, using market data only."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.getenv("TRACE_MONEY_LLM_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

    payload = {
        "ticker": ticker,
        "company_name": name,
        "price_current": price_data.get("current", 0),
        "price_change_pct": price_data.get("changePct", 0),
        "volume_vs_avg": round(price_data.get("volume", 0) / max(price_data.get("avgVolume", 1), 1), 2),
        "rsi14": technicals.get("rsi14", 50),
        "from_52w_high": technicals.get("fromHigh", ""),
        "trend": technicals.get("trend", "neutral"),
        "analyst_rating": analyst.get("rating", "N/A"),
        "analyst_target_price": analyst.get("targetPrice", 0),
        "analyst_upside": analyst.get("upside", 0),
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
            OPENAI_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": NO_NEWS_BRIEF_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": STOCK_BRIEF_SCHEMA,
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        result = json.loads(content)

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

STYLE:
- Every field should be insight-first. Never narrate price moves.
- Write like you're texting a smart friend, not writing a research report
- Bold claims > hedged language. "That's a problem" > "this could potentially be concerning"
- Specific > vague. Name the stock, the event, the number
- Each card covers COMPLETELY different ground — zero repetition across cards
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
        },
        "required": ["narrative", "movers", "signals", "blind_spot_title", "blind_spot_body", "tiles"],
        "additionalProperties": False,
    },
}

PORTFOLIO_BRIEF_CACHE_VERSION = "2026-04-16-portfolio-brief-v10"


def generate_portfolio_brief(
    stock_payloads: list[dict[str, Any]],
    store: Any | None = None,
) -> dict[str, str] | None:
    """Generate a personalized portfolio brief from stock intelligence docs."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or not stock_payloads:
        return None

    model = os.getenv("TRACE_MONEY_LLM_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

    watchlist_data = []
    for doc in stock_payloads:
        price = doc.get("price", {})
        technicals = doc.get("technicals", {})
        analyst = doc.get("analystConsensus", {})
        watchlist_data.append({
            "ticker": doc.get("symbol", ""),
            "name": doc.get("name", ""),
            "sector": doc.get("sector", ""),
            "price_current": price.get("current", 0),
            "price_change_pct": price.get("changePct", 0),
            "volume_vs_avg": round(price.get("volume", 0) / max(price.get("avgVolume", 1), 1), 2),
            "headline": doc.get("bottomLine", "")[:300],
            "sentiment_score": doc.get("sentiment", {}).get("overall", 0),
            "sentiment_trend": doc.get("sentiment", {}).get("trend", "stable"),
            "key_drivers": (doc.get("sentiment", {}).get("drivers") or [])[:3],
            "catalysts": (doc.get("catalysts") or [])[:2],
            "rsi14": technicals.get("rsi14", 0),
            "from_52w_high": technicals.get("fromHigh", ""),
            "technical_trend": technicals.get("trend", "neutral"),
            "analyst_rating": analyst.get("rating", ""),
            "analyst_target_upside": analyst.get("upside", 0),
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
            OPENAI_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "temperature": 0.3,
                "messages": [
                    {"role": "system", "content": PORTFOLIO_BRIEF_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": PORTFOLIO_BRIEF_SCHEMA,
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        result = json.loads(content)

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
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.getenv("TRACE_MONEY_LLM_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

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
            OPENAI_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "temperature": 0.3,
                "messages": [
                    {"role": "system", "content": MARKET_BRIEF_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": {"type": "json_schema", "json_schema": MARKET_BRIEF_SCHEMA},
            },
            timeout=30,
        )
        resp.raise_for_status()
        result = json.loads(resp.json()["choices"][0]["message"]["content"])

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
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.getenv("TRACE_MONEY_LLM_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

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
            OPENAI_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "temperature": 0.3,
                "messages": [
                    {"role": "system", "content": SECTOR_BRIEF_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": {"type": "json_schema", "json_schema": SECTOR_BRIEF_SCHEMA},
            },
            timeout=30,
        )
        resp.raise_for_status()
        result = json.loads(resp.json()["choices"][0]["message"]["content"])

        if store is not None and cache_key:
            try:
                store.save_llm_enrichment(cache_key, {"payload": result, "model": model, "cache_version": SECTOR_BRIEF_CACHE_VERSION})
            except Exception:
                pass

        return result
    except Exception as exc:
        logger.warning("Sector brief generation failed for %s: %s", sector_name, exc)
        return None


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
    "top stocks to buy",
    "stocks to watch",
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

    for article in articles:
        matched_ids: set[str] = set()
        for mention in article.entity_mentions:
            if mention.get("type") != "stock":
                continue
            if str(mention.get("mention_role", "secondary")).lower() == "incidental":
                continue
            ticker = str(mention.get("ticker", "")).upper().strip()
            instrument = instruments_by_ticker.get(ticker)
            if instrument:
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
        latest_article_at = ranked_articles[0].published_at
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

        # Try LLM synthesis first — falls back to deterministic if unavailable
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
            store=store,
        )

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
        else:
            headline = _build_headline(instrument, label, top_fact, top_title)
            body = _build_body(
                instrument, source_count, len(matched_articles),
                top_title, top_fact, second_fact,
                label=label, catalyst=catalyst, risk=risk,
            )
            final_key_points = key_points

        docs.append({
            "instrument_id": instrument_id,
            "market": market,
            "universe_id": universe_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "headline": headline,
            "body": body,
            "catalyst": catalyst,
            "risk": risk,
            "key_points": final_key_points,
            "overall_label": label,
            "overall_score": score,
            "lanes": [
                {"label": "News Articles", "positive_pct": positive_pct},
                {"label": "Source Consensus", "positive_pct": score},
            ],
            "news_count": len(evidence_articles),
            "source_count": source_count,
            "latest_article_at": latest_article_at,
            "mention_volume_series": _mention_series(evidence_articles),
            "related_instrument_ids": [instrument_id for instrument_id, _ in co_mentions.most_common(3)],
            "timeline": timeline,
        })

    return docs
