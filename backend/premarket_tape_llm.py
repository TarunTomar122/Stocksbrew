"""LLM polish for pre-market email tape lines (plain-English, not raw headlines)."""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

import requests

from backend.email_content import clean_optional_email_text
from backend.llm_client import (
    json_response_format,
    llm_api_key,
    llm_api_url,
    llm_headers,
    llm_model,
    parse_json_content,
    schema_system_prompt,
)
from backend.market_strategy import default_llm_model
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)

CACHE_VERSION = "premarket-tape-v2"
BATCH_SIZE = 40
MAX_TAPE_WORDS = 28

TAPE_PROMPT = (
    "You write pre-market tape lines for an investor morning email.\n"
    "Turn each raw headline/detail into one short plain-English sentence.\n"
    "Rules:\n"
    "- Max one sentence, about 25 words.\n"
    "- Say what happened and why it may matter for the stock pre-market.\n"
    "- No clickbait, no SEO phrasing, no 'here's why', no emojis.\n"
    "- Do not mention the publisher/source name.\n"
    "- If the input is vague, unrelated, or has no concrete event, return an empty tape_line for that ticker.\n"
    "- Use the gap direction only when it helps explain the move.\n"
)

TAPE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "lines": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string"},
                    "tape_line": {"type": "string"},
                },
                "required": ["ticker", "tape_line"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["lines"],
    "additionalProperties": False,
}


def _cache_key(market: str, ticker: str, raw_headline: str, raw_detail: str) -> str:
    digest = hashlib.sha256(f"{raw_headline}|{raw_detail}".encode("utf-8")).hexdigest()[:20]
    return f"{CACHE_VERSION}:{market.upper()}:{ticker.upper()}:{digest}"


def _clip_tape_line(value: str) -> str:
    text = " ".join(str(value or "").split()).strip()
    if not text:
        return ""
    words = text.split()
    if len(words) > MAX_TAPE_WORDS:
        text = " ".join(words[:MAX_TAPE_WORDS]).rstrip(".,;:") + "."
    if len(text) > 220:
        text = text[:217].rstrip() + "..."
    return text


def _fallback_tape_line(raw_headline: str, raw_detail: str) -> str:
    for candidate in (raw_detail, raw_headline):
        text = clean_optional_email_text(candidate)
        if text and len(text) > 24:
            return _clip_tape_line(text)
    return clean_optional_email_text(raw_headline or raw_detail, max_chars=220)


def _llm_batch_lines(items: list[dict[str, Any]]) -> dict[str, str]:
    api_key = llm_api_key()
    if not api_key or not items:
        return {}

    payload = {
        "items": [
            {
                "ticker": item["ticker"],
                "company": item.get("company") or item["ticker"],
                "gap_pct": item.get("gap_pct"),
                "raw_headline": item.get("raw_headline") or "",
                "raw_detail": item.get("raw_detail") or "",
            }
            for item in items
        ]
    }
    try:
        resp = requests.post(
            llm_api_url(),
            headers=llm_headers(api_key),
            json={
                "model": llm_model(default_llm_model()),
                "reasoning_effort": "low",
                "messages": [
                    {"role": "system", "content": schema_system_prompt(TAPE_PROMPT, TAPE_SCHEMA)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": json_response_format(),
            },
            timeout=45,
        )
        resp.raise_for_status()
        parsed = parse_json_content(resp.json()["choices"][0]["message"]["content"])
    except Exception as exc:
        logger.warning("premarket tape LLM batch failed: %s", exc)
        return {}

    out: dict[str, str] = {}
    for row in parsed.get("lines") or []:
        if not isinstance(row, dict):
            continue
        ticker = str(row.get("ticker") or "").strip().upper()
        line = clean_optional_email_text(row.get("tape_line"), max_chars=220)
        if ticker:
            out[ticker] = line
    return out


def enrich_context_with_tape_lines(
    store: TraceMoneyStore | None,
    *,
    market: str,
    by_ticker: dict[str, dict[str, Any]],
    company_by_ticker: dict[str, str] | None = None,
    gap_by_ticker: dict[str, float] | None = None,
    force: bool = False,
) -> None:
    """Add `tape_line` to each context row in-place (cached when store is provided)."""
    if not by_ticker:
        return

    company_by_ticker = company_by_ticker or {}
    gap_by_ticker = gap_by_ticker or {}
    pending: list[dict[str, Any]] = []
    cached: dict[str, str] = {}

    for ticker, row in by_ticker.items():
        sym = str(ticker or "").strip().upper()
        if not sym or not isinstance(row, dict):
            continue
        if row.get("tape_line") and not force:
            continue

        raw_headline = str(row.get("headline") or "").strip()
        raw_detail = str(row.get("why") or "").strip()
        if not raw_headline and not raw_detail:
            continue

        cache_key = _cache_key(market, sym, raw_headline, raw_detail)
        if store is not None:
            hit = store.get_llm_enrichment(cache_key)
            if hit and hit.get("tape_line") and not force:
                cached_line = clean_optional_email_text(hit["tape_line"], max_chars=220)
                if cached_line:
                    row["tape_line"] = cached_line
                    continue

        pending.append({
            "ticker": sym,
            "company": company_by_ticker.get(sym) or sym,
            "gap_pct": gap_by_ticker.get(sym),
            "raw_headline": raw_headline,
            "raw_detail": raw_detail,
            "cache_key": cache_key,
        })

    for start in range(0, len(pending), BATCH_SIZE):
        batch = pending[start:start + BATCH_SIZE]
        lines = _llm_batch_lines(batch)
        for item in batch:
            sym = item["ticker"]
            line = (
                lines[sym]
                if sym in lines
                else _fallback_tape_line(item["raw_headline"], item["raw_detail"])
            )
            if not line:
                by_ticker[sym].pop("tape_line", None)
                continue
            by_ticker[sym]["tape_line"] = line
            if store is not None:
                store.save_llm_enrichment(
                    item["cache_key"],
                    {
                        "kind": "premarket_tape",
                        "market": market.upper(),
                        "ticker": sym,
                        "tape_line": line,
                        "model": llm_model(default_llm_model()),
                    },
                )

    for ticker, row in by_ticker.items():
        sym = str(ticker or "").strip().upper()
        if not sym or not isinstance(row, dict) or row.get("tape_line"):
            continue
        raw_headline = str(row.get("headline") or "").strip()
        raw_detail = str(row.get("why") or "").strip()
        if raw_headline or raw_detail:
            line = _fallback_tape_line(raw_headline, raw_detail)
            if line:
                row["tape_line"] = line
