"""Fetch Donald Trump's Truth Social posts for the trump-logic pipeline."""
from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

import requests

USER_AGENT = "tikrr-trump-logic/1.0"
TRUMP_HANDLE = "realDonaldTrump"
TRUMP_TRUTH_PROFILE = f"https://truthsocial.com/@{TRUMP_HANDLE}"

# Public archive with truth:originalUrl pointing at Truth Social posts.
DEFAULT_RSS_URL = "https://trumpstruth.org/feed"
TRUTH_NS = {"truth": "https://truthsocial.com/ns"}
RSS_PAGE_CAP = 100


def _strip_html(raw: str) -> str:
    text = str(raw or "")
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = (
        text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
    )
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _parse_pub_date(value: str) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None


def _truth_url_from_item(item: ET.Element) -> str:
    original = item.findtext("truth:originalUrl", default="", namespaces=TRUTH_NS).strip()
    if original:
        return original
    post_id = item.findtext("truth:originalId", default="", namespaces=TRUTH_NS).strip()
    if post_id:
        return f"{TRUMP_TRUTH_PROFILE}/{post_id}"
    return ""


def _rss_feed_url(base_url: str, start_date: str, end_date: str) -> str:
    query = urlencode({"start_date": start_date, "end_date": end_date})
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}{query}"


def _parse_rss_items(channel: ET.Element | None, *, cutoff: datetime) -> list[dict[str, Any]]:
    if channel is None:
        return []
    rows: list[dict[str, Any]] = []
    for item in channel.findall("item"):
        title = _strip_html(item.findtext("title", default=""))
        description = _strip_html(item.findtext("description", default=""))
        text = description or title
        if not text or text.lower().startswith("[no title]"):
            if title and not title.lower().startswith("[no title]"):
                text = title
            else:
                continue

        published_at = _parse_pub_date(item.findtext("pubDate", default=""))
        if published_at and published_at < cutoff:
            continue

        archive_url = str(item.findtext("link", default="") or "").strip()
        truth_url = _truth_url_from_item(item)
        post_id = item.findtext("truth:originalId", default="", namespaces=TRUTH_NS).strip()
        if not post_id and truth_url:
            post_id = truth_url.rstrip("/").split("/")[-1]

        rows.append(
            {
                "post_id": post_id or archive_url,
                "text": text[:4000],
                "title": title[:500] if title else "",
                "published_at": published_at.isoformat() if published_at else "",
                "truth_url": truth_url or TRUMP_TRUTH_PROFILE,
                "archive_url": archive_url,
                "source": "truth_social",
                "ingest_via": "trumpstruth_rss",
            }
        )
    return rows


def _fetch_rss_range(
    *,
    feed_url: str,
    start: date,
    end: date,
    cutoff: datetime,
    timeout_s: int,
) -> list[dict[str, Any]]:
    url = _rss_feed_url(feed_url, start.isoformat(), end.isoformat())
    resp = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml"},
        timeout=timeout_s,
    )
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    channel = root.find("channel")
    return _parse_rss_items(channel, cutoff=cutoff)


def _fetch_rss_range_adaptive(
    *,
    feed_url: str,
    start: date,
    end: date,
    cutoff: datetime,
    timeout_s: int,
) -> list[dict[str, Any]]:
    """
    trumpstruth.org caps RSS responses at 100 items. If we hit the cap, split the
    date window and merge so busy weeks still return the full archive slice.
    """
    if start > end:
        return []

    rows = _fetch_rss_range(
        feed_url=feed_url,
        start=start,
        end=end,
        cutoff=cutoff,
        timeout_s=timeout_s,
    )
    if len(rows) < RSS_PAGE_CAP or start >= end:
        return rows

    span_days = (end - start).days
    if span_days < 1:
        return rows

    mid = start + timedelta(days=span_days // 2)
    left = _fetch_rss_range_adaptive(
        feed_url=feed_url,
        start=start,
        end=mid,
        cutoff=cutoff,
        timeout_s=timeout_s,
    )
    right = _fetch_rss_range_adaptive(
        feed_url=feed_url,
        start=mid + timedelta(days=1),
        end=end,
        cutoff=cutoff,
        timeout_s=timeout_s,
    )
    return left + right


def _initial_date_ranges(lookback_days: int, chunk_days: int) -> list[tuple[date, date]]:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=max(1, lookback_days))
    chunk = max(1, chunk_days)
    ranges: list[tuple[date, date]] = []
    cursor = start
    while cursor <= end:
        chunk_end = min(cursor + timedelta(days=chunk - 1), end)
        ranges.append((cursor, chunk_end))
        cursor = chunk_end + timedelta(days=1)
    return ranges


def fetch_trump_posts_from_rss(
    *,
    feed_url: str = DEFAULT_RSS_URL,
    lookback_days: int = 90,
    max_posts: int = 5000,
    chunk_days: int = 7,
    timeout_s: int = 30,
) -> list[dict[str, Any]]:
    """
    Load posts from the Trump's Truth RSS archive (links to Truth Social).
    Uses adaptive weekly (by default) date windows so we do not miss posts when
    a single RSS response hits the archive's 100-item cap.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, lookback_days))
    by_id: dict[str, dict[str, Any]] = {}

    for start_date, end_date in _initial_date_ranges(lookback_days, chunk_days):
        try:
            chunk_rows = _fetch_rss_range_adaptive(
                feed_url=feed_url,
                start=start_date,
                end=end_date,
                cutoff=cutoff,
                timeout_s=timeout_s,
            )
            for row in chunk_rows:
                post_id = str(row.get("post_id") or "").strip()
                if not post_id:
                    continue
                by_id[post_id] = row
        except Exception as exc:
            print(
                {
                    "stage": "trumpstruth_rss_chunk_failed",
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                    "error": str(exc),
                }
            )

    rows = list(by_id.values())
    rows.sort(key=lambda row: str(row.get("published_at") or ""), reverse=True)
    cap = max(1, int(max_posts)) if max_posts else len(rows)
    return rows[:cap]


def fetch_trump_posts_from_scrapecreators(
    *,
    api_key: str,
    user_id: str | None = None,
    handle: str = TRUMP_HANDLE,
    max_posts: int = 500,
    timeout_s: int = 30,
) -> list[dict[str, Any]]:
    """Optional direct Truth Social fetch via ScrapeCreators (TRUTH_SOCIAL_API_KEY)."""
    params: dict[str, str] = {}
    if user_id:
        params["user_id"] = str(user_id)
    else:
        params["handle"] = handle

    resp = requests.get(
        "https://api.scrapecreators.com/v1/truthsocial/user/posts",
        headers={"x-api-key": api_key.strip(), "Accept": "application/json"},
        params=params,
        timeout=timeout_s,
    )
    resp.raise_for_status()
    payload = resp.json()
    items = payload.get("posts") or payload.get("data") or payload.get("items") or []
    if isinstance(payload, list):
        items = payload

    rows: list[dict[str, Any]] = []
    for item in items[: max(1, max_posts)]:
        if not isinstance(item, dict):
            continue
        text = _strip_html(
            str(
                item.get("text")
                or item.get("content")
                or item.get("body")
                or item.get("title")
                or ""
            )
        )
        if not text:
            continue
        post_id = str(item.get("id") or item.get("post_id") or "").strip()
        truth_url = str(item.get("url") or item.get("permalink") or "").strip()
        if not truth_url and post_id:
            truth_url = f"{TRUMP_TRUTH_PROFILE}/{post_id}"
        created = item.get("created_at") or item.get("published_at") or item.get("date")
        rows.append(
            {
                "post_id": post_id or truth_url,
                "text": text[:4000],
                "title": "",
                "published_at": str(created or ""),
                "truth_url": truth_url or TRUMP_TRUTH_PROFILE,
                "archive_url": "",
                "source": "truth_social",
                "ingest_via": "scrapecreators",
            }
        )
    return rows


def fetch_trump_truth_posts(
    *,
    lookback_days: int = 90,
    max_posts: int = 5000,
    chunk_days: int = 7,
    feed_url: str = DEFAULT_RSS_URL,
    timeout_s: int = 30,
) -> list[dict[str, Any]]:
    """
    Prefer direct Truth Social API when TRUTH_SOCIAL_API_KEY is set; otherwise RSS archive.
    RSS items always include truth:originalUrl for the canonical Truth Social post link.
    """
    api_key = os.getenv("TRUTH_SOCIAL_API_KEY", "").strip() or os.getenv("SCRAPECREATORS_API_KEY", "").strip()
    user_id = os.getenv("TRUTH_SOCIAL_USER_ID", "").strip() or None

    if api_key:
        try:
            direct = fetch_trump_posts_from_scrapecreators(
                api_key=api_key,
                user_id=user_id,
                max_posts=max_posts,
                timeout_s=timeout_s,
            )
            if direct:
                return direct
        except Exception as exc:
            print({"stage": "truth_social_api_failed", "error": str(exc)})

    return fetch_trump_posts_from_rss(
        feed_url=feed_url,
        lookback_days=lookback_days,
        max_posts=max_posts,
        chunk_days=chunk_days,
        timeout_s=timeout_s,
    )
