"""Fetch individual article URLs as a curated news source.

This complements the RSS path: instead of polling a feed, a curated source
points at a JSON list of article URLs the user has vetted. Each URL is fetched
with trafilatura, which handles HTML cleanup, title, body, and published date
across most publisher layouts.

Downstream, curated articles flow through the same Article dataclass, the same
LLM enrichment, and the same coverage_mode routing as RSS articles. The
difference stops at the fetch boundary.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

import requests
import trafilatura

from backend.models import Article, SourceDefinition


CURATED_URLS_DIR = Path(__file__).resolve().parent / "config" / "curated_urls"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36 "
    "tikrr-curated/0.1"
)


@dataclass(slots=True)
class ExtractedArticle:
    """Raw fields extracted from a page before we wrap them in an Article."""
    url: str
    title: str
    body_text: str
    summary: str
    published_at: str  # ISO-8601, empty if not found
    publisher: str  # domain-derived source_name
    status: str  # ok | no_content | fetch_failed | too_short
    word_count: int
    note: str  # human-readable diagnostic, always set


def load_curated_urls(urls_file: str) -> list[str]:
    path = CURATED_URLS_DIR / urls_file
    if not path.exists():
        raise FileNotFoundError(f"curated url file not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    urls = payload.get("urls") if isinstance(payload, dict) else payload
    if not isinstance(urls, list):
        raise ValueError(f"curated url file must contain a list under 'urls': {path}")
    return [str(u).strip() for u in urls if str(u).strip()]


def _publisher_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host or "curated"


def _fetch_html(url: str, fetcher: Callable[[str], str] | None = None) -> str | None:
    if fetcher is not None:
        return fetcher(url)
    try:
        response = requests.get(
            url,
            headers={"user-agent": USER_AGENT, "accept": "text/html,application/xhtml+xml"},
            timeout=15,
        )
        response.raise_for_status()
        return response.text
    except Exception:
        return None


def extract_url(url: str, *, fetcher: Callable[[str], str] | None = None) -> ExtractedArticle:
    """Fetch + extract a single URL. Never raises — returns a diagnostic record."""
    publisher = _publisher_from_url(url)
    html = _fetch_html(url, fetcher=fetcher)
    if not html:
        return ExtractedArticle(
            url=url, title="", body_text="", summary="", published_at="",
            publisher=publisher, status="fetch_failed", word_count=0,
            note="HTTP fetch failed or returned no body",
        )

    metadata = trafilatura.extract_metadata(html, default_url=url)
    title = (metadata.title if metadata and metadata.title else "").strip()
    date = (metadata.date if metadata and metadata.date else "").strip()

    body = trafilatura.extract(
        html,
        url=url,
        output_format="txt",
        include_comments=False,
        include_tables=False,
        favor_precision=True,
    ) or ""
    body = body.strip()
    word_count = len(body.split())

    published_iso = _normalize_date(date)
    summary = _first_paragraph(body)

    if not body or word_count < 60:
        return ExtractedArticle(
            url=url, title=title, body_text=body, summary=summary, published_at=published_iso,
            publisher=publisher, status="too_short", word_count=word_count,
            note=f"extracted only {word_count} words — likely paywall, JS-rendered page, or blocked fetch",
        )

    if not title:
        return ExtractedArticle(
            url=url, title=title, body_text=body, summary=summary, published_at=published_iso,
            publisher=publisher, status="no_content", word_count=word_count,
            note="no title extracted; probably not an article page",
        )

    return ExtractedArticle(
        url=url, title=title, body_text=body, summary=summary, published_at=published_iso,
        publisher=publisher, status="ok", word_count=word_count,
        note=f"{word_count} words, {publisher}, date={published_iso or 'unknown'}",
    )


def _normalize_date(value: str) -> str:
    if not value:
        return ""
    candidates = (value, f"{value}T00:00:00+00:00")
    for candidate in candidates:
        try:
            dt = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).isoformat()
        except ValueError:
            continue
    return ""


def _first_paragraph(body: str, limit: int = 400) -> str:
    if not body:
        return ""
    paragraph = body.split("\n\n", 1)[0].strip()
    if len(paragraph) > limit:
        paragraph = paragraph[:limit].rsplit(" ", 1)[0] + "…"
    return paragraph


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
