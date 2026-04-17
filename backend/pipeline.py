"""Market snapshot pipeline."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import os
from typing import Callable

from backend.llm_enrichment import OpenAIArticleEnricher
from backend.market_strategy import build_ticker_sources, core_tickers_for, lane_budgets_for
from backend.models import Bucket, Snapshot
from backend.rss import fetch_feed
from backend.sentiment import summarize_sentiment
from backend.storage import TraceMoneyStore


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _top_key_points(bucket_articles: list, limit: int = 4) -> list[str]:
    points = []
    for article in bucket_articles:
        for point in article.article_key_points:
            cleaned = " ".join(str(point).split()).strip()
            if cleaned and cleaned not in points:
                points.append(cleaned)
            if len(points) >= limit:
                return points
    return points


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _count_within_hours(items: list, hours: int) -> int:
    cutoff = datetime.now(timezone.utc).timestamp() - (hours * 3600)
    count = 0
    for item in items:
        try:
            ts = _parse_iso(item.published_at).timestamp()
        except ValueError:
            continue
        if ts >= cutoff:
            count += 1
    return count


COMPANY_SIGNAL_TERMS = (
    "earnings",
    "results",
    "revenue",
    "guidance",
    "analyst",
    "price target",
    "upgrade",
    "downgrade",
    "contract",
    "deal",
    "dividend",
    "outlook",
    "forecast",
    "shares",
    "stock",
    "profit",
    "quarterly",
    "beats",
    "misses",
)

MACRO_NOISE_TERMS = (
    "futures",
    "crude",
    "coffee",
    "sugar",
    "gold",
    "silver",
    "oil prices",
    "iran",
    "war",
    "currencies",
    "forex",
    "treasury",
    "fed",
    "fomc",
)


def article_priority(article) -> tuple[int, str]:
    text = f"{article.title} {article.summary}".lower()
    score = 0
    if article.source_lane == "promoted":
        score += 320
    elif article.source_lane == "core":
        score += 240
    else:
        score += 80
    if article.focus_ticker:
        score += 120
    if article.source_kind == "regulator":
        score -= 120
    if article.source_kind == "exchange":
        score -= 80
    score += 18 * sum(1 for term in COMPANY_SIGNAL_TERMS if term in text)
    if not article.focus_ticker:
        score -= 16 * sum(1 for term in MACRO_NOISE_TERMS if term in text)
    if any(signal in (article.signal_types or []) for signal in ["earnings", "corporate_results", "ratings"]):
        score += 28
    if any(signal in (article.signal_types or []) for signal in ["macro", "rates", "policy"]):
        score -= 18
    return score, article.published_at


def _select_articles_for_enrichment(articles: list, lane_budgets: dict[str, int], max_articles: int | None = None) -> list:
    lane_groups: dict[str, list] = defaultdict(list)
    for article in articles:
        lane_groups[article.source_lane or "broad"].append(article)

    selected: list = []
    seen_urls: set[str] = set()
    for lane in ["promoted", "core", "broad"]:
        lane_articles = sorted(lane_groups.get(lane, []), key=article_priority, reverse=True)
        lane_limit = lane_budgets.get(lane, 0)
        if lane_limit <= 0:
            if lane == "broad" and not any(lane_budgets.values()):
                lane_limit = len(lane_articles)
            else:
                continue
        for article in lane_articles:
            if article.url in seen_urls:
                continue
            selected.append(article)
            seen_urls.add(article.url)
            if len([item for item in selected if item.source_lane == lane]) >= lane_limit:
                break

    if max_articles is not None and max_articles >= 0:
        selected = sorted(selected, key=article_priority, reverse=True)[:max_articles]
    return sorted(selected, key=lambda item: item.published_at, reverse=True)


def build_bucket_overview(bucket_name: str, bucket_kind: str, article_count: int, source_count: int, sentiment_label: str, titles: list[str]) -> str:
    preview = "; ".join(titles[:2])
    prefix = "stock" if bucket_kind == "stock" else "sector" if bucket_kind == "sector" else "market lane"
    return (
        f"{bucket_name} is active as a {prefix} bucket across {source_count} sources and {article_count} items. "
        f"The tone is {sentiment_label}, with recent coverage centered on {preview}."
    )[:240]


def build_market_overview(market: str, bucket_count: int, live_source_count: int, article_count: int, bucket_names: list[str]) -> str:
    joined_buckets = ", ".join(bucket_names[:3]) or "market structure"
    market_name = "Indian" if market == "IN" else "US"
    return (
        f"Trace Money is tracking {bucket_count} fixed feed buckets from {live_source_count} live {market_name} market sources. "
        f"Coverage currently leans into {joined_buckets}, grouping each mention into stock, sector, or market buckets instead of one-off story topics."
    )[:240]


def build_market_snapshot(
    market: str,
    include_review_sources: bool = False,
    fetcher: Callable[[str], str] | None = None,
    use_llm: bool = True,
    enricher: OpenAIArticleEnricher | None = None,
    source_ids: list[str] | None = None,
    max_articles: int | None = None,
) -> dict:
    from backend.source_registry import list_sources_for_market, list_tracked_sources_for_market

    store: TraceMoneyStore | None = None
    if os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip() or os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip():
        try:
            store = TraceMoneyStore()
        except Exception:
            store = None

    active_sources = list_sources_for_market(market, include_review_sources=include_review_sources)
    tracked_sources = list_tracked_sources_for_market(market)
    if market == "US":
        core_sources = build_ticker_sources(market, core_tickers_for(market), lane="core")
        promoted_entries = store.get_promoted_tickers(market) if store else []
        promoted_sources = build_ticker_sources(market, promoted_entries, lane="promoted")
        active_sources.extend(core_sources)
        active_sources.extend(promoted_sources)
        tracked_sources = tracked_sources + core_sources + promoted_sources
    if source_ids:
        allowed_source_ids = set(source_ids)
        active_sources = [source for source in active_sources if source.id in allowed_source_ids]
        tracked_sources = [source for source in tracked_sources if source.id in allowed_source_ids]
    articles = []
    seen_urls: set[str] = set()
    source_errors: dict[str, str] = {}
    fetched_source_ids: set[str] = set()

    for source in active_sources:
        try:
            fetched_articles = fetch_feed(source, fetcher=fetcher)
        except Exception as error:
            source_errors[source.id] = str(error)
            continue
        fetched_source_ids.add(source.id)
        for article in fetched_articles:
            if article.url in seen_urls:
                continue
            seen_urls.add(article.url)
            articles.append(article)

    lane_budgets = lane_budgets_for(market, total_cap=max_articles)
    articles = _select_articles_for_enrichment(articles, lane_budgets, max_articles=max_articles)

    if not use_llm:
        raise ValueError("Heuristic snapshot generation has been removed; LLM enrichment is required")

    active_enricher = enricher or OpenAIArticleEnricher()
    articles = active_enricher.enrich_articles(articles)

    articles.sort(key=lambda item: item.published_at, reverse=True)
    grouped: dict[str, list] = defaultdict(list)
    bucket_meta: dict[str, dict[str, object]] = {}
    for article in articles:
        bucket_keys = article.bucket_keys or [article.topic_key]
        bucket_labels = article.bucket_labels or [article.topic_label]
        bucket_kinds = article.bucket_kinds or [article.topic_kind]
        for index, bucket_key in enumerate(bucket_keys):
            grouped[bucket_key].append(article)
            if bucket_key not in bucket_meta:
                bucket_meta[bucket_key] = {
                    "name": bucket_labels[index] if index < len(bucket_labels) else article.topic_label,
                    "kind": bucket_kinds[index] if index < len(bucket_kinds) else article.topic_kind,
                }

    buckets: list[Bucket] = []
    for slug, bucket_articles in grouped.items():
        bucket_articles.sort(key=lambda item: item.published_at, reverse=True)
        sentiment = summarize_sentiment([item.sentiment_score for item in bucket_articles])
        kind = str(bucket_meta[slug]["kind"])
        name = str(bucket_meta[slug]["name"])

        highlights = [
            {
                "id": item.id,
                "title": item.title,
                "source_name": item.source_name,
                "url": item.url,
                "published_at": item.published_at,
                "summary": item.article_overview,
                "sentiment_label": item.sentiment_label,
            }
            for item in bucket_articles[:3]
        ]
        timeline = [
            {
                "id": item.id,
                "title": item.title,
                "summary": item.article_overview,
                "timestamp": item.published_at,
                "source_name": item.source_name,
                "article_url": item.url,
            }
            for item in bucket_articles[:6]
        ]

        buckets.append(
            Bucket(
                slug=slug,
                name=name,
                kind=kind,
                market=market,
                article_count=len(bucket_articles),
                source_count=len(_unique([item.source_id for item in bucket_articles])),
                sources=_unique([item.source_name for item in bucket_articles]),
                tags=_unique([tag for item in bucket_articles for tag in item.tags] + [kind]),
                sector_tags=_unique([tag for item in bucket_articles for tag in item.sector_tags]),
                stock_candidates=_unique([candidate for item in bucket_articles for candidate in item.stock_candidates]),
                signal_types=_unique([signal for item in bucket_articles for signal in item.signal_types]),
                overview=build_bucket_overview(
                    name,
                    kind,
                    len(bucket_articles),
                    len(_unique([item.source_id for item in bucket_articles])),
                    str(sentiment["label"]),
                    [item.title for item in bucket_articles],
                ),
                key_points=_top_key_points(bucket_articles),
                highlights=highlights,
                sentiment=sentiment,
                latest_published_at=bucket_articles[0].published_at,
                timeline=timeline,
                articles=[item.to_dict() for item in bucket_articles[:8]],
                recent_count=_count_within_hours(bucket_articles, 6),
                previous_count=max(0, len(bucket_articles) - _count_within_hours(bucket_articles, 6)),
            )
        )

    buckets.sort(key=lambda bucket: (-bucket.article_count, bucket.latest_published_at, bucket.name), reverse=False)
    for bucket in buckets:
        related: list[dict[str, object]] = []
        for candidate in buckets:
            if candidate.slug == bucket.slug:
                continue
            shared = set(bucket.sector_tags).intersection(candidate.sector_tags)
            if not shared and bucket.kind == "stock" and candidate.kind == "sector" and set(bucket.sector_tags).intersection(candidate.tags):
                shared = set(bucket.sector_tags)
            if not shared:
                continue
            related.append({
                "slug": candidate.slug,
                "name": candidate.name,
                "kind": candidate.kind,
                "sentiment": candidate.sentiment,
                "shared_tags": sorted(shared),
            })
        related.sort(key=lambda item: (-len(item["shared_tags"]), item["name"]))
        bucket.related_buckets = related[:3]

    most_active = [
        {
            "slug": bucket.slug,
            "name": bucket.name,
            "kind": bucket.kind,
            "article_count": bucket.article_count,
            "source_count": bucket.source_count,
            "latest_published_at": bucket.latest_published_at,
            "sentiment": bucket.sentiment,
            "recent_count": getattr(bucket, "recent_count", 0),
        }
        for bucket in sorted(buckets, key=lambda item: (-item.article_count, -getattr(item, "recent_count", 0), item.name))[:8]
    ]
    narrative_candidates = [
        bucket for bucket in buckets
        if bucket.kind != "market" or bucket.slug in {"market:indices-and-breadth", "market:oil-and-commodities"}
    ]
    big_narratives = [
        {
            "slug": bucket.slug,
            "name": bucket.name,
            "kind": bucket.kind,
            "overview": bucket.overview,
            "key_points": bucket.key_points[:3],
            "sentiment": bucket.sentiment,
            "article_count": bucket.article_count,
            "source_count": bucket.source_count,
            "related": getattr(bucket, "related_buckets", [])[:3],
        }
        for bucket in sorted(narrative_candidates, key=lambda item: (item.article_count, abs(item.sentiment.get("average", 0))), reverse=True)[:3]
    ]
    leaders = [bucket.name for bucket in buckets if bucket.kind in {"stock", "sector"}][:3]
    if len(leaders) >= 2:
        pulse_subject = f"{', '.join(leaders[:-1])} and {leaders[-1]}"
        pulse_summary = f"{pulse_subject} are leading coverage today."
    elif leaders:
        pulse_subject = leaders[0]
        pulse_summary = f"{pulse_subject} is leading coverage today."
    else:
        pulse_summary = "Market breadth is leading coverage today."
    source_rows = []
    for source in tracked_sources:
        matching_articles = [article for article in articles if article.source_id == source.id]
        source_rows.append({
            **source.to_dict(),
            "is_live": source.id in fetched_source_ids,
            "article_count": len(matching_articles),
            "last_seen_at": matching_articles[0].published_at if matching_articles else None,
            "fetch_error": source_errors.get(source.id),
        })

    generated_at = datetime.now(timezone.utc)
    snapshot_id = f"{market}_{generated_at.date().isoformat()}"
    snapshot = Snapshot(
        snapshot_id=snapshot_id,
        market=market,
        as_of_date=generated_at.date().isoformat(),
        generated_at=generated_at.isoformat(),
        include_review_sources=include_review_sources,
        overview=build_market_overview(
            market,
            len(buckets),
            len(fetched_source_ids),
            len(articles),
            [bucket.name for bucket in buckets],
        ),
        stats={
            "article_count": len(articles),
            "bucket_count": len(buckets),
            "topic_count": len(buckets),
            "live_source_count": len(fetched_source_ids),
            "tracked_source_count": len(tracked_sources),
            "failed_source_count": len(source_errors),
            "lane_budgets": lane_budgets,
            "lane_counts": {
                "broad": len([article for article in articles if article.source_lane == "broad"]),
                "core": len([article for article in articles if article.source_lane == "core"]),
                "promoted": len([article for article in articles if article.source_lane == "promoted"]),
            },
        },
        sources=source_rows,
        buckets=[bucket.to_dict() for bucket in buckets],
        topics=[bucket.to_dict() for bucket in buckets],
        pulse={
            "summary": pulse_summary,
            "article_count": len(articles),
            "bucket_count": len(buckets),
            "source_count": len(fetched_source_ids),
            "leaders": leaders,
        },
        big_narratives=big_narratives,
        most_active=most_active,
    )
    return snapshot.to_dict()
