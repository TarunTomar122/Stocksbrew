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
    lowered = raw.lower()
    junk_phrases = (
        "your privacy choices",
        "your privacy is important to us",
        "we use cookies",
        "accept all cookies",
        "reject all cookies",
        "manage privacy settings",
    )
    if any(phrase in lowered for phrase in junk_phrases):
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


def firecrawl_poll_seconds() -> float:
    return max(0.25, float(os.getenv("FIRECRAWL_BATCH_POLL_SECONDS", "1") or 1))


def firecrawl_batch_timeout_seconds() -> float:
    return max(5.0, float(os.getenv("FIRECRAWL_BATCH_TIMEOUT_SECONDS", "60") or 60))


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

    if is_junk_text(body):
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
            note="junk or consent-page content extracted",
        )
        _log_extract_call(provider="trafilatura", url=url, status=result.status, word_count=word_count, elapsed_ms=elapsed_ms)
        return result

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


def _firecrawl_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    api_key = os.getenv("FIRECRAWL_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _extract_firecrawl_data(url: str, data: dict, *, elapsed_ms: int) -> ExtractedArticle:
    publisher = _publisher_from_url(url)
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    markdown = str(data.get("markdown") or "")
    body = _markdown_to_text(markdown)
    title = strip_html(str(metadata.get("title") or metadata.get("ogTitle") or ""))
    summary = strip_html(str(metadata.get("description") or metadata.get("ogDescription") or "")) or _first_paragraph(body)
    published_iso = _normalize_date(str(metadata.get("publishedTime") or metadata.get("date") or ""))
    word_count = len(body.split())

    if is_junk_text(body):
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
            note="junk or consent-page content extracted",
        )
        _log_extract_call(provider="firecrawl", url=url, status=result.status, word_count=word_count, elapsed_ms=elapsed_ms)
        return result

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


def _extract_firecrawl(url: str) -> ExtractedArticle:
    publisher = _publisher_from_url(url)
    started = time.time()
    api_url = f"{firecrawl_api_url()}/scrape"

    try:
        response = requests.post(
            api_url,
            headers=_firecrawl_headers(),
            json={"url": url, "formats": ["markdown"], "onlyMainContent": True},
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
    elapsed_ms = int((time.time() - started) * 1000)
    return _extract_firecrawl_data(url, data, elapsed_ms=elapsed_ms)


def _extract_firecrawl_batch(urls: list[str]) -> list[ExtractedArticle | None]:
    if not urls:
        return []

    started = time.time()
    try:
        response = requests.post(
            f"{firecrawl_api_url()}/batch/scrape",
            headers=_firecrawl_headers(),
            json={"urls": urls, "formats": ["markdown"], "onlyMainContent": True},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        status_url = str(payload.get("url") or "")
        if not status_url:
            return [None] * len(urls)

        deadline = time.time() + firecrawl_batch_timeout_seconds()
        while time.time() < deadline:
            status_response = requests.get(status_url, headers=_firecrawl_headers(), timeout=30)
            status_response.raise_for_status()
            status_payload = status_response.json()
            status = str(status_payload.get("status") or "").lower()
            if status == "completed":
                rows = status_payload.get("data")
                if not isinstance(rows, list):
                    return [None] * len(urls)
                elapsed_ms = int((time.time() - started) * 1000)
                rows_by_url: dict[str, dict] = {}
                rows_without_url: list[dict] = []
                for raw_row in rows:
                    if not isinstance(raw_row, dict):
                        continue
                    metadata = (
                        raw_row.get("metadata")
                        if isinstance(raw_row.get("metadata"), dict)
                        else {}
                    )
                    source_url = str(
                        raw_row.get("url")
                        or metadata.get("sourceURL")
                        or metadata.get("sourceUrl")
                        or metadata.get("url")
                        or ""
                    ).strip()
                    if source_url:
                        rows_by_url[source_url.rstrip("/")] = raw_row
                    else:
                        rows_without_url.append(raw_row)
                results: list[ExtractedArticle | None] = []
                for url in urls:
                    row = rows_by_url.get(url.rstrip("/"))
                    # Some older/self-hosted Firecrawl builds omit sourceURL
                    # but preserve input order. Use order only for those
                    # unmapped rows, never for a row belonging to another URL.
                    if row is None:
                        row = rows_without_url.pop(0) if rows_without_url else {}
                    results.append(_extract_firecrawl_data(url, row, elapsed_ms=elapsed_ms))
                return results
            if status in {"failed", "cancelled"}:
                return [None] * len(urls)
            time.sleep(firecrawl_poll_seconds())
    except Exception as exc:
        logger.info("firecrawl_batch_failed urls=%s error=%s", len(urls), exc)
    return [None] * len(urls)


def search_firecrawl(
    query: str,
    *,
    limit: int = 4,
    time_filter: str = "qdr:d",
) -> list[ExtractedArticle]:
    """Search and scrape results in one Firecrawl request."""
    if not firecrawl_enabled() or not str(query or "").strip():
        return []
    started = time.time()
    response = requests.post(
        f"{firecrawl_api_url()}/search",
        headers=_firecrawl_headers(),
        json={
            "query": str(query).strip(),
            "limit": max(1, min(10, int(limit))),
            "tbs": time_filter,
            "ignoreInvalidURLs": True,
            "scrapeOptions": {
                "formats": ["markdown"],
                "onlyMainContent": True,
            },
        },
        timeout=70,
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []
    elapsed_ms = int((time.time() - started) * 1000)
    extracted: list[ExtractedArticle] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        url = str(
            row.get("url")
            or metadata.get("sourceURL")
            or metadata.get("sourceUrl")
            or metadata.get("url")
            or ""
        ).strip()
        if not url:
            continue
        result = _extract_firecrawl_data(url, row, elapsed_ms=elapsed_ms)
        if result.status == "ok":
            extracted.append(result)
    return extracted


def extract_urls(urls: list[str]) -> list[ExtractedArticle]:
    """Batch Firecrawl where available; preserve extract_url fallback semantics."""
    if not urls:
        return []
    provider = extract_provider()
    if provider == "trafilatura" or not firecrawl_enabled():
        return [_extract_trafilatura(url) for url in urls]

    firecrawl_results = _extract_firecrawl_batch(urls)
    results: list[ExtractedArticle] = []
    for url, firecrawl_result in zip(urls, firecrawl_results, strict=False):
        if firecrawl_result and firecrawl_result.status == "ok" and not is_junk_text(firecrawl_result.body_text):
            results.append(firecrawl_result)
            continue
        trafilatura_result = _extract_trafilatura(url)
        if trafilatura_result.status == "ok" and not is_junk_text(trafilatura_result.body_text):
            results.append(trafilatura_result)
            continue
        if (
            firecrawl_result is not None
            and not is_junk_text(firecrawl_result.body_text)
            and firecrawl_result.word_count >= trafilatura_result.word_count
        ):
            results.append(firecrawl_result)
        else:
            results.append(trafilatura_result)
    return results


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

    if (
        firecrawl_result is not None
        and not is_junk_text(firecrawl_result.body_text)
        and firecrawl_result.word_count >= trafilatura_result.word_count
    ):
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
