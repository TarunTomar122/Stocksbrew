from __future__ import annotations

import json
from datetime import datetime, timezone

from backend.tikrr_pipeline.article_fetcher import ArticleEvidence
from backend.tikrr_pipeline.facts import extract_facts
from backend.tikrr_pipeline.searxng import SearchHit


SYSTEM_PROMPT = """You generate one rich stock briefing payload for stocksbrew.

Rules:
- Return only facts supported by the supplied search results.
- Do not invent numbers.
- Use null when a numeric field is unavailable.
- Prefer concrete facts, dates, percentages, analyst targets, and reasons over generic finance language.
- Keep the tone concise and investor-useful.
- Write bottomLine as one short paragraph, 2-3 sentences max.
- First sentence: what changed or what matters now, with at least one concrete number if available.
- Second sentence: why it matters or what investors should watch next.
- Sentiment overall should be between -1 and 1.
- News items should be the most relevant recent items only.
- Use article-like items for news. Avoid quote pages, generic overview pages, and generic company descriptions.
- Prefer FULL ARTICLE EVIDENCE over short search snippets whenever it is available.
- Categories should be short labels like: market-move, analyst, earnings, product, regulation, macro, sector, partnership.
- Technical fields can be null if not supported by evidence.
- If evidence is thin, still produce a useful but conservative payload.
- Do not repeat the same point across highlights, catalysts, and bottomLine.
- Keep sentiment drivers and catalysts short, concrete, and non-generic.
- If extracted hard facts are supplied, prefer them over weaker paraphrases from snippets.
"""

MARKET_SYSTEM_PROMPT = """You generate one market overview payload for stocksbrew.

Rules:
- Use only facts supported by the supplied market articles and factual context.
- Do not invent numbers, events, or sources.
- Market briefing must be based on market-level evidence, not stitched stock copy.
- bottomLine should be 2-4 sentences, concrete and current.
- First sentence: what the market did or what defined the last 24 hours.
- Then explain the key drivers, sectors in focus, and what investors should watch next.
- keyHeadlines should be the most important recent market headlines only.
- drivers should be short, concrete takeaways from the evidence, not generic labels.
- Sentiment overall should be between -1 and 1.
"""

SECTOR_SYSTEM_PROMPT = """You generate one sector overview payload for stocksbrew.

Rules:
- Use only facts supported by the supplied sector articles and factual context.
- Do not invent numbers, events, or sources.
- Sector briefing must be based on sector-level evidence, not stock-level filler.
- bottomLine should be 2-4 sentences, concrete and current.
- Explain what is driving the sector today, where strength/weakness is showing up, and what to watch next.
- drivers should be short, concrete takeaways from the evidence.
- Sentiment overall should be between -1 and 1.
"""


def _serialize_hits(hits: list[SearchHit]) -> list[dict[str, str | None]]:
    return [
        {
            "title": hit.title,
            "url": hit.url,
            "content": hit.content,
            "engine": hit.engine,
            "published_date": hit.published_date,
        }
        for hit in hits
    ]


def _serialize_articles(items: list[ArticleEvidence]) -> list[dict[str, str | None]]:
    return [
        {
            "title": item.title,
            "url": item.url,
            "content": item.content,
            "snippet": item.snippet,
            "engine": item.engine,
            "published_date": item.published_date,
            "fetch_status": item.fetch_status,
        }
        for item in items
    ]


def build_user_prompt(
    *,
    symbol: str,
    market: str,
    stock_name: str | None,
    run_type: str,
    price_hits: list[SearchHit],
    news_hits: list[SearchHit],
    analyst_hits: list[SearchHit],
    full_news_articles: list[ArticleEvidence],
    full_analyst_articles: list[ArticleEvidence],
) -> str:
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    extracted_facts = extract_facts(
        symbol=symbol,
        stock_name=stock_name or symbol,
        price_hits=price_hits,
        news_hits=news_hits,
        analyst_hits=analyst_hits,
    )
    return f"""Generate a stocksbrew stock payload for:

symbol: {symbol}
market: {market}
stock_name: {stock_name or symbol}
runType: {run_type}
lastUpdated: {now_iso}

Search evidence:

EXTRACTED HARD FACTS
{json.dumps(extracted_facts, indent=2)}

FULL ARTICLE EVIDENCE
RECENT NEWS ARTICLES
{json.dumps(_serialize_articles(full_news_articles), indent=2)}

ANALYST / ESTIMATE ARTICLES
{json.dumps(_serialize_articles(full_analyst_articles), indent=2)}

SEARCH SNIPPETS
PRICE SEARCH RESULTS
{json.dumps(_serialize_hits(price_hits), indent=2)}

NEWS SEARCH RESULTS
{json.dumps(_serialize_hits(news_hits), indent=2)}

ANALYST SEARCH RESULTS
{json.dumps(_serialize_hits(analyst_hits), indent=2)}

Return the JSON payload for the `data` object only, not the outer API wrapper.

Quality bar:
- price.current, previousClose, change, changePct, fiftyTwoWeekHigh, fiftyTwoWeekLow, targetPrice, upside, and numAnalysts should be filled when clearly supported by the evidence.
- Treat a year in a title or URL as insufficient evidence for targetPrice.
- news summaries should explain the event, not restate the headline.
- bottomLine should read like a useful investor brief, not a generic company description.
"""


def build_market_prompt(
    *,
    market: str,
    run_type: str,
    articles: list[ArticleEvidence],
    indices: list[dict[str, object]],
    global_cues: dict[str, dict[str, object]],
    top_gainers: list[dict[str, object]],
    top_losers: list[dict[str, object]],
    breadth: dict[str, object],
) -> str:
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return f"""Generate a stocksbrew market overview payload for:

market: {market}
runType: {run_type}
lastUpdated: {now_iso}

FACTUAL CONTEXT
indices:
{json.dumps(indices, indent=2)}

global_cues:
{json.dumps(global_cues, indent=2)}

top_gainers:
{json.dumps(top_gainers, indent=2)}

top_losers:
{json.dumps(top_losers, indent=2)}

breadth:
{json.dumps(breadth, indent=2)}

FULL ARTICLE EVIDENCE
{json.dumps(_serialize_articles(articles), indent=2)}

Return only this JSON shape:
{{
  "sentiment": {{
    "overall": number,
    "label": string,
    "drivers": [string]
  }},
  "keyHeadlines": [string],
  "bottomLine": string
}}
"""


def build_sector_prompt(
    *,
    market: str,
    sector_id: str,
    sector_name: str,
    run_type: str,
    articles: list[ArticleEvidence],
    sector_symbols: list[str],
    performance: dict[str, object],
    top_gainers: list[dict[str, object]],
    top_losers: list[dict[str, object]],
) -> str:
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return f"""Generate a stocksbrew sector overview payload for:

market: {market}
sectorId: {sector_id}
sectorName: {sector_name}
runType: {run_type}
lastUpdated: {now_iso}

FACTUAL CONTEXT
stocks:
{json.dumps(sector_symbols, indent=2)}

performance:
{json.dumps(performance, indent=2)}

top_gainers:
{json.dumps(top_gainers, indent=2)}

top_losers:
{json.dumps(top_losers, indent=2)}

FULL ARTICLE EVIDENCE
{json.dumps(_serialize_articles(articles), indent=2)}

Return only this JSON shape:
{{
  "sentiment": {{
    "overall": number,
    "label": string,
    "drivers": [string]
  }},
  "drivers": [string],
  "bottomLine": string
}}
"""
