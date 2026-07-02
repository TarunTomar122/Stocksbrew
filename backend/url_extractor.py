"""URL extraction: Firecrawl-first on VPS, trafilatura fallback for local/dev."""
from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass
from html import unescape
from typing import Callable
from urllib.parse import urlparse

import requests
import trafilatura

from backend.env import load_backend_env

load_backend_env()

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36 "
    "tikrr-extract/0.1"
)

HTML_TAG_RE = re.compile(r"<[^>]+>")


@dataclass(slots=True)
class ExtractedArticle:
    url: str
    title: str
    body_text: str
    summary: str
    published_at: str
    publisher: str
    status: str  # ok | no_content | fetch_failed | too_short
    word_count: int
    provider: str  # firecrawl | trafilatura | none
    note: str


def strip_html(text: str) -> str:
    if not text:
        return ""
    cleaned = HTML_TAG_RE.sub(" ", str(text))
    return unescape(" ".join(cleaned.split())).strip()


def is_junk_text(text: str) -> bool:
    raw = str(text or "").strip()
    if not raw:
        return True
    if HTML_TAG_RE.search(raw):
        return True
    if raw.startswith("http://") or raw.startswith("https://"):
        return True
    return False


def extract_provider() -> str:
    return os.getenv("EXTRACT_PROVIDER", "auto").strip().lower() or "auto"


def firecrawl_api_url() -> str:
    base = os.getenv("FIRECRAWL_API_URL", "http://127.0.0.1:3002/v1").strip().rstrip("/")
    return base


def firecrawl_enabled() -> bool:
    provider = extract_provider()
    if provider == "trafilatura":
        return False
    return provider in {"firecrawl", "auto"}


def _publisher_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host or "unknown"


def _normalize_date(value: str) -> str:
    if not value:
        return ""
    from datetime import datetime, timezone

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


def _markdown_to_text(markdown: str) -> str:
    text = str(markdown or "")
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[#>*_`~-]", " ", text)
    return " ".join(text.split())


def _log_extract_call(
    *,
    provider: str,
    url: str,
    status: str,
    word_count: int,
    elapsed_ms: int,
    cache_hit: bool = False,
) -> None:
    logger.info(
        "extract_call provider=%s url=%s status=%s word_count=%s elapsed_ms=%s cache_hit=%s",
        provider,
        url,
        status,
        word_count,
        elapsed_ms,
        cache_hit,
    )


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


def _extract_trafilatura(url: str, *, fetcher: Callable[[str], str] | None = None) -> ExtractedArticle:
    publisher = _publisher_from_url(url)
    started = time.time()
    html = _fetch_html(url, fetcher=fetcher)
    if not html:
        elapsed_ms = int((time.time() - started) * 1000)
        result = ExtractedArticle(
            url=url,
            title="",
            body_text="",
            summary="",
            published_at="",
            publisher=publisher,
            status="fetch_failed",
            word_count=0,
            provider="trafilatura",
            note="HTTP fetch failed or returned no body",
        )
        _log_extract_call(provider="trafilatura", url=url, status=result.status, word_count=0, elapsed_ms=elapsed_ms)
        return result

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
    elapsed_ms = int((time.time() - started) * 1000)

    if not body or word_count < 60:
        result = ExtractedArticle(
            url=url,
            title=title,
            body_text=body,
            summary=summary,
            published_at=published_iso,
            publisher=publisher,
            status="too_short",
            word_count=word_count,
            provider="trafilatura",
            note=f"extracted only {word_count} words",
        )
        _log_extract_call(provider="trafilatura", url=url, status=result.status, word_count=word_count, elapsed_ms=elapsed_ms)
        return result

    if not title:
        result = ExtractedArticle(
            url=url,
            title=title,
            body_text=body,
            summary=summary,
            published_at=published_iso,
            publisher=publisher,
            status="no_content",
            word_count=word_count,
            provider="trafilatura",
            note="no title extracted",
        )
        _log_extract_call(provider="trafilatura", url=url, status=result.status, word_count=word_count, elapsed_ms=elapsed_ms)
        return result

    result = ExtractedArticle(
        url=url,
        title=title,
        body_text=body,
        summary=summary,
        published_at=published_iso,
        publisher=publisher,
        status="ok",
        word_count=word_count,
        provider="trafilatura",
        note=f"{word_count} words via trafilatura",
    )
    _log_extract_call(provider="trafilatura", url=url, status=result.status, word_count=word_count, elapsed_ms=elapsed_ms)
    return result


def _extract_firecrawl(url: str) -> ExtractedArticle:
    publisher = _publisher_from_url(url)
    started = time.time()
    api_url = f"{firecrawl_api_url()}/scrape"
    headers = {"Content-Type": "application/json"}
    api_key = os.getenv("FIRECRAWL_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = requests.post(
            api_url,
            headers=headers,
            json={"url": url, "formats": ["markdown"]},
            timeout=45,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        elapsed_ms = int((time.time() - started) * 1000)
        result = ExtractedArticle(
            url=url,
            title="",
            body_text="",
            summary="",
            published_at="",
            publisher=publisher,
            status="fetch_failed",
            word_count=0,
            provider="firecrawl",
            note=f"firecrawl request failed: {exc}",
        )
        _log_extract_call(provider="firecrawl", url=url, status=result.status, word_count=0, elapsed_ms=elapsed_ms)
        return result

    data = payload.get("data") if isinstance(payload, dict) else {}
    if not isinstance(data, dict):
        data = {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    markdown = str(data.get("markdown") or "")
    body = _markdown_to_text(markdown)
    title = strip_html(str(metadata.get("title") or metadata.get("ogTitle") or ""))
    summary = strip_html(str(metadata.get("description") or metadata.get("ogDescription") or "")) or _first_paragraph(body)
    published_iso = _normalize_date(str(metadata.get("publishedTime") or metadata.get("date") or ""))
    word_count = len(body.split())
    elapsed_ms = int((time.time() - started) * 1000)

    if not body or word_count < 60:
        result = ExtractedArticle(
            url=url,
            title=title,
            body_text=body,
            summary=summary,
            published_at=published_iso,
            publisher=publisher,
            status="too_short",
            word_count=word_count,
            provider="firecrawl",
            note=f"firecrawl returned only {word_count} words",
        )
        _log_extract_call(provider="firecrawl", url=url, status=result.status, word_count=word_count, elapsed_ms=elapsed_ms)
        return result

    if not title:
        result = ExtractedArticle(
            url=url,
            title=title,
            body_text=body,
            summary=summary,
            published_at=published_iso,
            publisher=publisher,
            status="no_content",
            word_count=word_count,
            provider="firecrawl",
            note="firecrawl returned no title",
        )
        _log_extract_call(provider="firecrawl", url=url, status=result.status, word_count=word_count, elapsed_ms=elapsed_ms)
        return result

    result = ExtractedArticle(
        url=url,
        title=title,
        body_text=body,
        summary=summary,
        published_at=published_iso,
        publisher=publisher,
        status="ok",
        word_count=word_count,
        provider="firecrawl",
        note=f"{word_count} words via firecrawl",
    )
    _log_extract_call(provider="firecrawl", url=url, status=result.status, word_count=word_count, elapsed_ms=elapsed_ms)
    return result


def extract_url(url: str, *, fetcher: Callable[[str], str] | None = None) -> ExtractedArticle:
    """Firecrawl-first when enabled; trafilatura fallback on failure or junk."""
    provider = extract_provider()
    if provider == "trafilatura":
        return _extract_trafilatura(url, fetcher=fetcher)

    firecrawl_result: ExtractedArticle | None = None
    if firecrawl_enabled():
        firecrawl_result = _extract_firecrawl(url)
        if firecrawl_result.status == "ok" and not is_junk_text(firecrawl_result.body_text):
            return firecrawl_result

    trafilatura_result = _extract_trafilatura(url, fetcher=fetcher)
    if trafilatura_result.status == "ok" and not is_junk_text(trafilatura_result.body_text):
        return trafilatura_result

    if firecrawl_result is not None and firecrawl_result.word_count >= trafilatura_result.word_count:
        return firecrawl_result
    return trafilatura_result


def article_needs_url_extract(*, title: str, summary: str, body_text: str) -> bool:
    summary_clean = strip_html(summary)
    body_clean = strip_html(body_text)
    if is_junk_text(summary) or is_junk_text(body_text):
        return True
    if len(body_clean.split()) < 60 and len(summary_clean.split()) < 40:
        return True
    if summary_clean.strip() == strip_html(title).strip() and len(summary_clean.split()) < 20:
        return True
    return False
