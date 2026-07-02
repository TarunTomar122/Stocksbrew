"""Fetch individual article URLs as a curated news source.

This complements the RSS path: instead of polling a feed, a curated source
points at a JSON list of article URLs the user has vetted. Each URL is fetched
with Firecrawl-first extraction (trafilatura fallback).

Downstream, curated articles flow through the same Article dataclass, the same
LLM enrichment, and the same coverage_mode routing as RSS articles. The
difference stops at the fetch boundary.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from backend.models import Article, SourceDefinition
from backend.url_extractor import ExtractedArticle, extract_url

CURATED_URLS_DIR = Path(__file__).resolve().parent / "config" / "curated_urls"

# Backwards-compatible re-export for existing imports.
__all__ = ["ExtractedArticle", "extract_url", "fetch_curated", "load_curated_urls"]


def load_curated_urls(urls_file: str) -> list[str]:
    path = CURATED_URLS_DIR / urls_file
    if not path.exists():
        raise FileNotFoundError(f"curated url file not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    urls = payload.get("urls") if isinstance(payload, dict) else payload
    if not isinstance(urls, list):
        raise ValueError(f"curated url file must contain a list under 'urls': {path}")
    return [str(u).strip() for u in urls if str(u).strip()]


def fetch_curated(
    source: SourceDefinition,
    *,
    fetcher: Callable[[str], str] | None = None,
) -> tuple[list[Article], list[ExtractedArticle]]:
    """Return (articles_ok, all_attempts). all_attempts is useful for diagnostics."""
    urls_file = getattr(source, "urls_file", "") or ""
    if not urls_file:
        return [], []
    urls = load_curated_urls(urls_file)
    now_iso = datetime.now(timezone.utc).isoformat()
    articles: list[Article] = []
    attempts: list[ExtractedArticle] = []
    for url in urls:
        extracted = extract_url(url, fetcher=fetcher)
        attempts.append(extracted)
        if extracted.status != "ok":
            continue
        article_id = hashlib.sha256(f"{source.id}:{url}".encode("utf-8")).hexdigest()[:24]
        articles.append(
            Article(
                id=article_id,
                source_id=source.id,
                source_name=extracted.publisher,
                source_kind="publisher",
                market=source.market_codes[0] if source.market_codes else "US",
                title=extracted.title,
                url=url,
                summary=extracted.summary,
                body_text=extracted.body_text,
                article_overview="",
                article_key_points=[],
                published_at=extracted.published_at or now_iso,
                topic_key="",
                topic_label="",
                topic_kind="",
                tags=[],
                sector_tags=list(source.sector_tags),
                stock_candidates=[],
                stock_tickers=[],
                signal_types=list(source.signal_types),
                bucket_keys=[],
                bucket_labels=[],
                bucket_kinds=[],
                entity_mentions=[],
                sentiment_score=0.0,
                sentiment_label="unscored",
                enrichment_source="raw",
                source_lane=source.lane,
                focus_ticker=source.focus_ticker,
                source_coverage_modes=list(source.coverage_modes),
            )
        )
    return articles, attempts
