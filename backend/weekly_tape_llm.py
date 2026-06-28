"""LLM weekly story cards for the weekly market email."""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

import requests

from backend.llm_client import (
    json_response_format,
    llm_api_key,
    llm_headers,
    llm_model,
    parse_json_content,
    schema_system_prompt,
)
from backend.market_strategy import default_llm_model
from backend.open_email_intel import anomaly_tape_line, is_weak_move_explanation
from backend.storage import TraceMoneyStore
from backend.weekly_intel import intel_tape_line, resolve_weekly_book_tape

logger = logging.getLogger(__name__)

CACHE_VERSION = "weekly-stories-v1"
MAX_STORIES = 5
MIN_STORIES = 3


STORIES_PROMPT = (
    "You write the 'stories of the week' section for a weekly US stock market email.\n"
    "You receive candidate movers with weekly % change and raw catalyst notes.\n"
    "Pick 3 to 5 names that tell the clearest, most informative story of the week.\n"
    "Rules:\n"
    "- Prefer names with concrete catalysts over vague momentum.\n"
    "- Prefer variety (mix gainers and losers) when both have strong stories.\n"
    "- Give mild priority to on_book=true names when their catalyst is strong.\n"
    "- headline: max 8 words, specific, no clickbait.\n"
    "- story: exactly 2 sentences, plain English, ~35-55 words total.\n"
    "- Explain what happened this week and why it mattered for the stock.\n"
    "- No buy/sell/hold advice, no price targets, no emojis.\n"
    "- Do not mention publishers or 'according to reports'.\n"
    "- week_lede: one sentence summarizing the week's tone (optional).\n"
)

STORIES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "week_lede": {"type": "string"},
        "stories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string"},
                    "headline": {"type": "string"},
                    "story": {"type": "string"},
                },
                "required": ["ticker", "headline", "story"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["week_lede", "stories"],
    "additionalProperties": False,
}


def _cache_key(market: str, week_key: str, tickers: list[str]) -> str:
    digest = hashlib.sha256(",".join(sorted(tickers)).encode("utf-8")).hexdigest()[:16]
    return f"{CACHE_VERSION}:{market.upper()}:{week_key}:{digest}"


def _clip_story(value: str, *, max_len: int = 320) -> str:
    text = " ".join(str(value or "").split()).strip()
    if len(text) > max_len:
        text = text[: max_len - 3].rstrip() + "..."
    return text


def _clip_headline(value: str) -> str:
    text = " ".join(str(value or "").split()).strip()
    words = text.split()
    if len(words) > 10:
        text = " ".join(words[:10])
    return text[:90]


def _raw_material_for_mover(
    *,
    mover_row: dict[str, Any],
    intel_doc: dict[str, Any] | None,
    anomaly_item: dict[str, Any] | None,
) -> tuple[str, str]:
    headline = ""
    detail = ""

    if anomaly_item and not is_weak_move_explanation(anomaly_item):
        move = anomaly_item.get("move_explanation")
        if isinstance(move, dict):
            headline = str(move.get("headline") or "").strip()
            detail = str(move.get("why_it_matters") or "").strip()

    if not detail:
        detail = intel_tape_line(intel_doc)
    if not headline:
        headline = str((intel_doc or {}).get("headline") or mover_row.get("name") or "").strip()

    if not detail:
        detail = resolve_weekly_book_tape(row=mover_row, intel_doc=intel_doc, anomaly_item=anomaly_item)
    if not headline and anomaly_item:
        headline = str(anomaly_tape_line(anomaly_item) or "").strip()

    return headline[:220], detail[:320]


def collect_weekly_story_candidates(
    store: TraceMoneyStore,
    *,
    market: str,
    weekly: dict[str, Any] | None,
    book_tickers: set[str] | None = None,
    limit: int = 12,
) -> list[dict[str, Any]]:
    weekly = weekly or {}
    book_tickers = {str(t or "").upper() for t in (book_tickers or set()) if str(t or "").strip()}

    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in list(weekly.get("movers_up") or []) + list(weekly.get("movers_down") or []):
        if not isinstance(row, dict):
            continue
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        try:
            move = float(row.get("week_change_pct") or 0)
        except (TypeError, ValueError):
            continue
        candidates.append({
            **row,
            "ticker": ticker,
            "week_change_pct": move,
            "on_book": ticker in book_tickers,
        })

    candidates.sort(key=lambda row: abs(float(row.get("week_change_pct") or 0)), reverse=True)
    candidates = candidates[: max(MIN_STORIES, limit)]

    tickers = [str(row.get("ticker") or "").upper() for row in candidates]
    anomaly_docs = store.get_daily_anomaly_ticker_docs_batch(market, tickers)
    universe_id = str(store.get_active_ai_universe(market) or "").strip()
    instrument_ids = [
        str(row.get("instrument_id") or "").strip().upper()
        for row in candidates
        if str(row.get("instrument_id") or "").strip()
    ]
    intel_by_id: dict[str, dict[str, Any]] = {}
    if universe_id and instrument_ids:
        intel_by_id = store.get_stock_intelligence_docs_batch(market, universe_id, instrument_ids)

    enriched: list[dict[str, Any]] = []
    for row in candidates:
        ticker = str(row.get("ticker") or "").upper()
        iid = str(row.get("instrument_id") or "").strip().upper()
        anomaly_doc = anomaly_docs.get(f"{market.upper()}__{ticker}") or {}
        anomaly_item = anomaly_doc.get("anomaly") if isinstance(anomaly_doc.get("anomaly"), dict) else None
        raw_headline, raw_detail = _raw_material_for_mover(
            mover_row=row,
            intel_doc=intel_by_id.get(iid),
            anomaly_item=anomaly_item,
        )
        enriched.append({
            "ticker": ticker,
            "company": str(row.get("name") or ticker).strip(),
            "sector": str(row.get("sector") or "").strip(),
            "week_change_pct": float(row.get("week_change_pct") or 0),
            "on_book": bool(row.get("on_book")),
            "raw_headline": raw_headline,
            "raw_detail": raw_detail,
        })
    return enriched


def _llm_weekly_stories(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    api_key = llm_api_key()
    if not api_key or not candidates:
        return {}

    payload = {
        "week_label": "this week",
        "candidates": [
            {
                "ticker": item["ticker"],
                "company": item.get("company") or item["ticker"],
                "sector": item.get("sector") or "",
                "week_change_pct": item.get("week_change_pct"),
                "on_book": bool(item.get("on_book")),
                "raw_headline": item.get("raw_headline") or "",
                "raw_detail": item.get("raw_detail") or "",
            }
            for item in candidates
        ],
    }
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=llm_headers(api_key),
            json={
                "model": llm_model(default_llm_model()),
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": schema_system_prompt(STORIES_PROMPT, STORIES_SCHEMA)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": json_response_format(),
            },
            timeout=60,
        )
        resp.raise_for_status()
        return parse_json_content(resp.json()["choices"][0]["message"]["content"])
    except Exception as exc:
        logger.warning("weekly stories LLM failed: %s", exc)
        return {}


def _fallback_stories(candidates: list[dict[str, Any]], *, max_stories: int = MAX_STORIES) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in candidates[:max_stories]:
        ticker = str(item.get("ticker") or "").upper()
        detail = str(item.get("raw_detail") or item.get("raw_headline") or "").strip()
        if not detail:
            move = float(item.get("week_change_pct") or 0)
            direction = "rallied" if move >= 0 else "sold off"
            detail = f"{ticker} {direction} {abs(move):.1f}% on the week with no clear single catalyst in our feed."
        out.append({
            "ticker": ticker,
            "headline": _clip_headline(str(item.get("raw_headline") or f"{ticker} had a big week")),
            "story": _clip_story(detail),
            "week_change_pct": float(item.get("week_change_pct") or 0),
            "on_book": bool(item.get("on_book")),
        })
    return out


def generate_weekly_stories(
    store: TraceMoneyStore | None,
    *,
    market: str,
    week_key: str,
    candidates: list[dict[str, Any]],
    force: bool = False,
) -> dict[str, Any]:
    """Return {week_lede, stories} with 3-5 LLM-polished weekly story cards."""
    market = market.upper()
    if not candidates:
        return {"week_lede": "", "stories": []}

    tickers = [str(c.get("ticker") or "").upper() for c in candidates if str(c.get("ticker") or "").strip()]
    cache_key = _cache_key(market, week_key, tickers)
    if store is not None and not force:
        hit = store.get_llm_enrichment(cache_key)
        if hit and isinstance(hit.get("stories"), list):
            return {
                "week_lede": str(hit.get("week_lede") or ""),
                "stories": hit.get("stories") or [],
            }

    parsed = _llm_weekly_stories(candidates)
    move_by_ticker = {
        str(c.get("ticker") or "").upper(): float(c.get("week_change_pct") or 0)
        for c in candidates
    }
    on_book_by_ticker = {
        str(c.get("ticker") or "").upper(): bool(c.get("on_book"))
        for c in candidates
    }

    stories: list[dict[str, Any]] = []
    for row in parsed.get("stories") or []:
        if not isinstance(row, dict):
            continue
        ticker = str(row.get("ticker") or "").strip().upper()
        headline = _clip_headline(str(row.get("headline") or ""))
        story = _clip_story(str(row.get("story") or ""))
        if not ticker or not story:
            continue
        stories.append({
            "ticker": ticker,
            "headline": headline or f"{ticker} moved sharply",
            "story": story,
            "week_change_pct": move_by_ticker.get(ticker, 0.0),
            "on_book": on_book_by_ticker.get(ticker, False),
        })
        if len(stories) >= MAX_STORIES:
            break

    if len(stories) < MIN_STORIES:
        seen = {s["ticker"] for s in stories}
        for fallback in _fallback_stories(candidates):
            if fallback["ticker"] in seen:
                continue
            stories.append(fallback)
            seen.add(fallback["ticker"])
            if len(stories) >= MIN_STORIES:
                break

    week_lede = _clip_story(str(parsed.get("week_lede") or ""), max_len=180)
    result = {"week_lede": week_lede, "stories": stories[:MAX_STORIES]}

    if store is not None and stories:
        store.save_llm_enrichment(
            cache_key,
            {
                "kind": "weekly_stories",
                "market": market,
                "week_key": week_key,
                "week_lede": week_lede,
                "stories": stories,
                "model": llm_model(default_llm_model()),
            },
        )
    return result


def load_weekly_stories_for_email(
    store: TraceMoneyStore,
    *,
    market: str,
    weekly: dict[str, Any] | None,
    book_tickers: set[str] | None = None,
    force: bool = False,
) -> dict[str, Any]:
    weekly = weekly or {}
    week_key = str(weekly.get("week_key") or "").strip() or "unknown"
    candidates = collect_weekly_story_candidates(
        store,
        market=market,
        weekly=weekly,
        book_tickers=book_tickers,
    )
    return generate_weekly_stories(
        store,
        market=market,
        week_key=week_key,
        candidates=candidates,
        force=force,
    )
