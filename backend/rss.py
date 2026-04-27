"""Fetch and parse RSS feeds."""
from __future__ import annotations

import hashlib
import html
from datetime import datetime, timezone
from typing import Callable
from xml.etree import ElementTree as ET

import requests

from backend.models import Article, SourceDefinition


def _strip_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(html.unescape(value).split())


def _coerce_iso_date(value: str | None) -> str:
    if not value:
        return ""
    formats = [
        ("%a, %d %b %Y %H:%M:%S %z", True),
        ("%a, %d %b %Y %H:%M:%S GMT", False),
        ("%Y-%m-%d %H:%M:%S", False),
    ]
    for pattern, has_timezone in formats:
        try:
            parsed = datetime.strptime(value, pattern)
            if has_timezone:
                return parsed.astimezone(timezone.utc).isoformat()
            return parsed.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except ValueError:
        return ""


def parse_rss(source: SourceDefinition, xml_text: str) -> list[Article]:
    sanitized_xml = xml_text.lstrip("\ufeff").lstrip("ï»¿").strip()
    root = ET.fromstring(sanitized_xml)
    items = root.findall(".//item")
    articles: list[Article] = []
    for item in items:
        title = _strip_text(item.findtext("title"))
        link = _strip_text(item.findtext("link") or item.findtext("guid"))
        if not title or not link:
            continue
        publisher = _strip_text(item.findtext("source")) or source.name
        summary = _strip_text(item.findtext("description"))
        published_at = _coerce_iso_date(item.findtext("pubDate"))
        if not published_at:
            continue
        article_id = hashlib.sha256(f"{source.id}:{link}".encode("utf-8")).hexdigest()[:24]
        articles.append(
            Article(
                id=article_id,
                source_id=source.id,
                source_name=publisher,
                source_kind=source.kind,
                market=source.market_codes[0],
                title=title,
                url=link,
                summary=summary,
                body_text="",
                article_overview="",
                article_key_points=[],
                published_at=published_at,
                topic_key="",
                topic_label="",
                topic_kind="",
                tags=[],
                sector_tags=[],
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
    return articles


def default_fetcher(url: str) -> str:
    response = requests.get(
        url,
        headers={"user-agent": "trace-money-backend/0.1"},
        timeout=12,
    )
    response.raise_for_status()
    return response.text


def fetch_feed(source: SourceDefinition, fetcher: Callable[[str], str] | None = None) -> list[Article]:
    active_fetcher = fetcher or default_fetcher
    articles = parse_rss(source, active_fetcher(source.feed_url))
    now = datetime.now(timezone.utc)
    filtered: list[Article] = []
    for article in articles:
        try:
            published_at = datetime.fromisoformat(article.published_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        age_hours = (now - published_at).total_seconds() / 3600
        if age_hours <= source.max_age_hours:
            filtered.append(article)
    filtered.sort(key=lambda item: item.published_at, reverse=True)
    return filtered[: source.max_items]
