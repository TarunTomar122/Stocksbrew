from __future__ import annotations

from dataclasses import dataclass
import html
import re
from typing import Iterable

import requests

from backend.tikrr_pipeline.searxng import SearchHit


BLOCKED_STATUS_CODES = {401, 403, 404}
GENERIC_PAGE_PATTERNS = (
    "/quote/",
    "/history/",
    "/forecast/",
    "/latest-news",
    "/symbol/",
    "/stocks/",
)
GENERIC_TITLE_PATTERNS = (
    "stock price",
    "quote and news",
    "quote & history",
    "stock overview",
    "latest stock news",
)


def _mentions_stock(hit: SearchHit, symbol: str, stock_name: str) -> bool:
    haystack = f"{hit.title} {hit.content}".lower()
    if symbol.lower() in haystack:
        return True
    for token in re.split(r"\W+", stock_name.lower()):
        if len(token) > 2 and token in haystack:
            return True
    return False


def _mentions_any_term(hit: SearchHit, required_terms: list[str]) -> bool:
    if not required_terms:
        return True
    haystack = f"{hit.title} {hit.content}".lower()
    for term in required_terms:
        normalized = term.strip().lower()
        if not normalized:
            continue
        if normalized in haystack:
            return True
    return False


@dataclass
class ArticleEvidence:
    title: str
    url: str
    content: str
    snippet: str
    engine: str
    published_date: str | None
    fetch_status: str


def is_article_like_hit(hit: SearchHit, label: str, symbol: str, stock_name: str) -> bool:
    title = hit.title.lower()
    url = hit.url.lower()
    if not _mentions_stock(hit, symbol, stock_name):
        return False
    if any(pattern in title for pattern in GENERIC_TITLE_PATTERNS):
        return False
    if label == "news":
        if any(pattern in url for pattern in GENERIC_PAGE_PATTERNS):
            return False
        return (
            "/article/" in url
            or "/news/" in url
            or re.search(r"/20[0-9]{2}/[0-9]{2}/[0-9]{2}/", url) is not None
            or bool(hit.published_date)
        )
    if label == "analyst":
        return (
            "analyst" in url
            or "analyst" in title
            or "price-target" in url
            or "target-price" in url
            or "ratings" in url
            or "recommendation" in url
            or "estimate" in url
        )
    return False


def is_topic_like_hit(hit: SearchHit, label: str, required_terms: list[str] | None = None) -> bool:
    title = hit.title.lower()
    url = hit.url.lower()
    if any(pattern in title for pattern in GENERIC_TITLE_PATTERNS):
        return False
    if not _mentions_any_term(hit, required_terms or []):
        return False
    if label in {"market", "sector", "news"}:
        if any(pattern in url for pattern in GENERIC_PAGE_PATTERNS):
            return False
        return (
            "/article/" in url
            or "/news/" in url
            or re.search(r"/20[0-9]{2}/[0-9]{2}/[0-9]{2}/", url) is not None
            or bool(hit.published_date)
        )
    if label == "analyst":
        return (
            "analyst" in url
            or "analyst" in title
            or "price-target" in url
            or "target-price" in url
            or "ratings" in url
            or "recommendation" in url
            or "estimate" in url
        )
    return False


def _strip_tags(raw_html: str) -> str:
    text = re.sub(r"(?is)<(script|style|noscript|svg|iframe|footer|header|nav|form|aside).*?>.*?</\1>", " ", raw_html)
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</p\s*>", "\n\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _candidate_blocks(raw_html: str) -> list[str]:
    candidates: list[str] = []
    for pattern in (
        r"(?is)<article[^>]*>(.*?)</article>",
        r"(?is)<main[^>]*>(.*?)</main>",
        r'(?is)<div[^>]+(?:class|id)=["\'][^"\']*(?:article|story|content|body|main)[^"\']*["\'][^>]*>(.*?)</div>',
    ):
        candidates.extend(match.group(1) for match in re.finditer(pattern, raw_html))
    if not candidates:
        candidates.append(raw_html)
    return candidates


def _extract_readable_text(raw_html: str, max_chars: int) -> str:
    best_text = ""
    best_score = -1
    for block in _candidate_blocks(raw_html):
        paragraphs = re.findall(r"(?is)<p[^>]*>(.*?)</p>", block)
        if not paragraphs:
            candidate = _strip_tags(block)
            score = len(candidate)
        else:
            pieces = []
            for paragraph in paragraphs:
                text = _strip_tags(paragraph)
                if len(text) >= 50:
                    pieces.append(text)
            candidate = "\n\n".join(pieces).strip()
            score = len(pieces) * 1000 + len(candidate)
        if score > best_score:
            best_score = score
            best_text = candidate
    best_text = re.sub(r"\n{3,}", "\n\n", best_text).strip()
    if len(best_text) > max_chars:
        return best_text[:max_chars].rsplit(" ", 1)[0].strip()
    return best_text


def fetch_article_evidence(
    hits: Iterable[SearchHit],
    *,
    label: str,
    symbol: str,
    stock_name: str,
    limit: int,
    timeout: int = 15,
    max_chars: int = 4000,
) -> list[ArticleEvidence]:
    documents: list[ArticleEvidence] = []
    session = requests.Session()
    session.headers.update({"user-agent": "Mozilla/5.0 (compatible; tikrr-pipeline/0.1)"})
    for hit in hits:
        if len(documents) >= limit:
            break
        if not is_article_like_hit(hit, label, symbol, stock_name):
            continue
        try:
            response = session.get(hit.url, timeout=timeout, allow_redirects=True)
            status_code = response.status_code
            if status_code in BLOCKED_STATUS_CODES:
                fetch_status = f"http_{status_code}"
                content = ""
            else:
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "html" not in content_type.lower():
                    fetch_status = "non_html"
                    content = ""
                else:
                    content = _extract_readable_text(response.text, max_chars=max_chars)
                    fetch_status = "ok" if content else "empty"
        except Exception:
            fetch_status = "error"
            content = ""

        if not content:
            content = hit.content.strip()

        documents.append(
            ArticleEvidence(
                title=hit.title,
                url=hit.url,
                content=content,
                snippet=hit.content,
                engine=hit.engine,
                published_date=hit.published_date,
                fetch_status=fetch_status,
            )
        )
    return documents


def fetch_topic_evidence(
    hits: Iterable[SearchHit],
    *,
    label: str,
    required_terms: list[str],
    limit: int,
    timeout: int = 15,
    max_chars: int = 4000,
) -> list[ArticleEvidence]:
    documents: list[ArticleEvidence] = []
    session = requests.Session()
    session.headers.update({"user-agent": "Mozilla/5.0 (compatible; tikrr-pipeline/0.1)"})
    for hit in hits:
        if len(documents) >= limit:
            break
        if not is_topic_like_hit(hit, label, required_terms):
            continue
        try:
            response = session.get(hit.url, timeout=timeout, allow_redirects=True)
            status_code = response.status_code
            if status_code in BLOCKED_STATUS_CODES:
                fetch_status = f"http_{status_code}"
                content = ""
            else:
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "html" not in content_type.lower():
                    fetch_status = "non_html"
                    content = ""
                else:
                    content = _extract_readable_text(response.text, max_chars=max_chars)
                    fetch_status = "ok" if content else "empty"
        except Exception:
            fetch_status = "error"
            content = ""

        if not content:
            content = hit.content.strip()

        documents.append(
            ArticleEvidence(
                title=hit.title,
                url=hit.url,
                content=content,
                snippet=hit.content,
                engine=hit.engine,
                published_date=hit.published_date,
                fetch_status=fetch_status,
            )
        )
    return documents
