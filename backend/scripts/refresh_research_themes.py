"""Review and publish the five runtime investment-theme lists.

The checked-in seed is the safe fallback. A weekly run gathers bounded
Firecrawl evidence, asks the configured OpenAI model to review one theme at a
time, validates every returned ticker against the live instrument catalogue,
and replaces the full Firestore config only with validated data.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from typing import Any

from backend.llm_client import (
    json_response_format,
    llm_model,
    parse_json_content,
    post_chat_completion,
    schema_system_prompt,
)
from backend.storage import TraceMoneyStore
from backend.url_extractor import search_firecrawl


SEED_PATH = Path(__file__).resolve().parents[1] / "config" / "research_themes_seed.json"
THEME_SLUGS = ("ai-capex", "energy", "healthcare", "defense", "financials")
TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.-]{0,9}$")
DEFAULT_MIN_CANDIDATES = 8
DEFAULT_MAX_CANDIDATES = 12

THEME_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "review_summary": {"type": "string"},
        "theme": {
            "type": "object",
            "properties": {
                "slug": {"type": "string"},
                "name": {"type": "string"},
                "cardDescription": {"type": "string"},
                "description": {"type": "string"},
                "resilienceNote": {"type": "string"},
                "candidates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "company": {"type": "string"},
                            "ticker": {"type": "string"},
                            "role": {"type": "string"},
                            "benefitMechanism": {"type": "string"},
                            "catalyst": {"type": "string"},
                            "failureCase": {"type": "string"},
                            "stocksbrewLabel": {"type": "string"},
                            "stocksbrewScore": {"type": "number"},
                            "evidence": {"type": "string"},
                            "coverageNote": {"type": "string"},
                        },
                        "required": [
                            "company",
                            "ticker",
                            "role",
                            "benefitMechanism",
                            "failureCase",
                            "stocksbrewLabel",
                        ],
                        "additionalProperties": False,
                    },
                },
                "watchlist": {
                    "type": "array",
                    "items": {"type": "object"},
                },
                "resources": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string"},
                            "href": {"type": "string"},
                        },
                        "required": ["label", "href"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": [
                "slug",
                "name",
                "cardDescription",
                "description",
                "resilienceNote",
                "candidates",
                "watchlist",
                "resources",
            ],
            "additionalProperties": False,
        },
    },
    "required": ["review_summary", "theme"],
    "additionalProperties": False,
}


def load_seed() -> list[dict[str, Any]]:
    with SEED_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError("research theme seed must be an array")
    return payload


def _text(value: Any) -> str:
    return str(value or "").strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _theme_by_slug(themes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        _text(theme.get("slug")): theme
        for theme in themes
        if isinstance(theme, dict) and _text(theme.get("slug"))
    }


def _merge_candidate(
    candidate: dict[str, Any],
    prior_by_ticker: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    ticker = _text(candidate.get("ticker")).upper()
    merged = {key: value for key, value in candidate.items() if value not in (None, "")}
    previous = prior_by_ticker.get(ticker)
    if previous:
        # Scores and coverage labels are product data. Keep them stable when a
        # weekly narrative review leaves the company in the list.
        for key in ("stocksbrewLabel", "stocksbrewScore"):
            if key in previous:
                merged[key] = previous[key]
    else:
        merged["stocksbrewLabel"] = "Not covered"
        merged.pop("stocksbrewScore", None)
    return merged


def validate_theme(
    theme: Any,
    *,
    slug: str,
    known_tickers: set[str],
    prior_theme: dict[str, Any],
    min_candidates: int = DEFAULT_MIN_CANDIDATES,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
) -> tuple[dict[str, Any] | None, str | None]:
    """Validate and normalize one model result, returning a safe error reason."""
    if not isinstance(theme, dict) or _text(theme.get("slug")) != slug:
        return None, "wrong or missing theme slug"
    for key in ("name", "cardDescription", "description", "resilienceNote"):
        if not _text(theme.get(key)):
            return None, f"theme is missing {key}"
    candidates = theme.get("candidates")
    if not isinstance(candidates, list) or not min_candidates <= len(candidates) <= max_candidates:
        return None, f"candidate count must be between {min_candidates} and {max_candidates}"

    prior_candidates = prior_theme.get("candidates") if isinstance(prior_theme, dict) else []
    prior_by_ticker = {
        _text(row.get("ticker")).upper(): row
        for row in prior_candidates or []
        if isinstance(row, dict) and _text(row.get("ticker"))
    }
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    required = ("company", "ticker", "role", "benefitMechanism", "failureCase", "stocksbrewLabel")
    for raw in candidates:
        if not isinstance(raw, dict) or any(not _text(raw.get(key)) for key in required):
            return None, "candidate is missing a required field"
        ticker = _text(raw.get("ticker")).upper()
        if not TICKER_RE.fullmatch(ticker):
            return None, f"invalid ticker {ticker!r}"
        if ticker in seen:
            return None, f"duplicate ticker {ticker}"
        if ticker not in known_tickers:
            return None, f"ticker {ticker} is not in the live instrument catalogue"
        if "stocksbrewScore" in raw and (
            not isinstance(raw["stocksbrewScore"], (int, float))
            or isinstance(raw["stocksbrewScore"], bool)
            or not 0 <= float(raw["stocksbrewScore"]) <= 100
        ):
            return None, f"invalid Stocksbrew score for {ticker}"
        merged = _merge_candidate(raw, prior_by_ticker)
        seen.add(ticker)
        normalized.append(merged)

    normalized_theme = deepcopy(theme)
    normalized_theme["slug"] = slug
    normalized_theme["candidates"] = normalized
    watchlist = theme.get("watchlist")
    if not isinstance(watchlist, list):
        return None, "watchlist must be an array"
    prior_watchlist = prior_theme.get("watchlist") if isinstance(prior_theme, dict) else []
    prior_watchlist_by_ticker = {
        _text(row.get("ticker")).upper(): row
        for row in prior_watchlist or []
        if isinstance(row, dict) and _text(row.get("ticker"))
    }
    normalized_watchlist: list[dict[str, Any]] = []
    for raw in watchlist:
        if not isinstance(raw, dict) or any(not _text(raw.get(key)) for key in required):
            return None, "watchlist candidate is missing a required field"
        ticker = _text(raw.get("ticker")).upper()
        if not TICKER_RE.fullmatch(ticker) or ticker not in known_tickers:
            return None, f"invalid watchlist ticker {ticker!r}"
        normalized_watchlist.append(_merge_candidate(raw, prior_watchlist_by_ticker))
    normalized_theme["watchlist"] = normalized_watchlist
    normalized_theme["resources"] = [
        row
        for row in (theme.get("resources") or [])
        if isinstance(row, dict) and _text(row.get("label")) and _text(row.get("href"))
    ]
    return normalized_theme, None


def _evidence_rows(slug: str, name: str) -> list[dict[str, str]]:
    query = f"{name} public companies stock outlook infrastructure demand latest research"
    try:
        articles = search_firecrawl(query, limit=4, time_filter="qdr:w")
    except Exception as error:
        print({"theme": slug, "firecrawl_error": str(error)[:240]})
        return []
    rows: list[dict[str, str]] = []
    for article in articles:
        rows.append(
            {
                "title": _text(article.title),
                "url": _text(article.url),
                "publisher": _text(article.publisher),
                "published_at": _text(article.published_at),
                "summary": _text(article.summary or article.body_text)[:900],
            }
        )
    return rows


def _review_theme(
    theme: dict[str, Any],
    *,
    known_tickers: set[str],
    min_candidates: int,
    max_candidates: int,
) -> tuple[dict[str, Any] | None, str, list[dict[str, str]]]:
    slug = _text(theme.get("slug"))
    evidence = _evidence_rows(slug, _text(theme.get("name")))
    if not evidence:
        return None, "no fresh Firecrawl evidence", []
    prompt = f"""You are reviewing one Stocksbrew investment theme for a weekly research refresh.

Return a final candidate list of {min_candidates} to {max_candidates} real public US companies. You may add or remove names when the supplied evidence supports it. Use only tickers from the live catalogue below. Do not give investment advice.

Preserve the existing Stocksbrew label and score for names that remain in the list. For a new name use stocksbrewLabel=Not covered and omit stocksbrewScore. Never invent a numerical score. Keep the mechanism and failure case concrete. A catalyst is optional and should only be included when supported by the evidence. Web evidence is research context, not guaranteed truth.

Theme currently published:
{json.dumps(theme, ensure_ascii=True)}

Live US ticker catalogue:
{json.dumps(sorted(known_tickers), ensure_ascii=True)}

Firecrawl evidence from the last week:
{json.dumps(evidence, ensure_ascii=True)}
"""
    body = post_chat_completion(
        messages=[
            {"role": "system", "content": schema_system_prompt(prompt, THEME_SCHEMA)},
            {"role": "user", "content": "Review the theme and return the requested JSON object."},
        ],
        model=llm_model(),
        response_format=json_response_format(),
        stage=f"research_theme_{slug}",
        timeout=90,
        max_attempts=3,
    )
    content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    parsed = parse_json_content(str(content or ""))
    normalized, error = validate_theme(
        parsed.get("theme"),
        slug=slug,
        known_tickers=known_tickers,
        prior_theme=theme,
        min_candidates=min_candidates,
        max_candidates=max_candidates,
    )
    if error:
        return None, error, evidence
    return normalized, _text(parsed.get("review_summary")), evidence


def build_payload(
    store: TraceMoneyStore,
    *,
    market: str = "US",
    min_candidates: int = DEFAULT_MIN_CANDIDATES,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
) -> dict[str, Any]:
    seed = load_seed()
    current_doc = store.get_research_themes()
    current = current_doc.get("themes") if isinstance(current_doc, dict) else None
    current_by_slug = _theme_by_slug(current if isinstance(current, list) else seed)
    seed_by_slug = _theme_by_slug(seed)
    prior_by_slug = {
        slug: deepcopy(current_by_slug.get(slug) or seed_by_slug[slug])
        for slug in THEME_SLUGS
    }
    known_tickers = {
        _text(row.get("ticker")).upper()
        for row in store.list_instruments(market)
        if _text(row.get("ticker"))
    }
    # Existing seed/current names are allowed during a catalogue migration,
    # while genuinely new model suggestions still need live catalogue support.
    known_tickers.update(
        _text(row.get("ticker")).upper()
        for theme in prior_by_slug.values()
        for row in [*theme.get("candidates", []), *theme.get("watchlist", [])]
        if isinstance(row, dict) and _text(row.get("ticker"))
    )

    themes: list[dict[str, Any]] = []
    summaries: dict[str, str] = {}
    sources: list[dict[str, str]] = []
    for slug in THEME_SLUGS:
        prior = prior_by_slug[slug]
        try:
            reviewed, summary, evidence = _review_theme(
                prior,
                known_tickers=known_tickers,
                min_candidates=min_candidates,
                max_candidates=max_candidates,
            )
        except Exception as error:
            reviewed, summary, evidence = None, f"review failed: {error}", []
        if reviewed is None:
            print({"theme": slug, "status": "kept_previous", "reason": summary})
            reviewed = prior
        else:
            print({"theme": slug, "status": "updated", "candidates": len(reviewed["candidates"])})
        themes.append(reviewed)
        summaries[slug] = summary
        sources.extend({"theme": slug, **row} for row in evidence if row.get("url"))

    now = _now_iso()
    return {
        "version": 1,
        "market": market,
        "themes": themes,
        "review_summary": summaries,
        "reviewed_at": now,
        "updated_at": now,
        "sources": sources[:40],
        "model": llm_model(),
        "web_provider": "firecrawl",
    }


def seed_payload() -> dict[str, Any]:
    now = _now_iso()
    return {
        "version": 1,
        "market": "US",
        "themes": load_seed(),
        "review_summary": {slug: "Checked-in seed" for slug in THEME_SLUGS},
        "reviewed_at": now,
        "updated_at": now,
        "sources": [],
        "model": "seed",
        "web_provider": "none",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Weekly research-theme reviewer")
    parser.add_argument("--market", choices=["US"], default="US")
    parser.add_argument("--min-candidates", type=int, default=DEFAULT_MIN_CANDIDATES)
    parser.add_argument("--max-candidates", type=int, default=DEFAULT_MAX_CANDIDATES)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--seed-only", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.min_candidates <= args.max_candidates:
        raise ValueError("candidate bounds are invalid")

    store = TraceMoneyStore()
    payload = seed_payload() if args.seed_only else build_payload(
        store,
        market=args.market,
        min_candidates=args.min_candidates,
        max_candidates=args.max_candidates,
    )
    print(
        {
            "market": args.market,
            "themes": {theme["slug"]: len(theme["candidates"]) for theme in payload["themes"]},
            "dry_run": args.dry_run,
            "seed_only": args.seed_only,
        }
    )
    if not args.dry_run:
        store.save_research_themes(payload)


if __name__ == "__main__":
    main()
