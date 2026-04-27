"""Typed helpers for Trace Money backend."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class SourceDefinition:
    id: str
    name: str
    kind: str
    market_codes: list[str]
    homepage_url: str
    feed_url: str
    verification_url: str
    verified_at: str
    usage_status: str
    enabled_by_default: bool
    licensing_notes: str
    coverage_modes: list[str]
    sector_tags: list[str]
    signal_types: list[str]
    source_tier: str
    max_items: int
    max_age_hours: int
    lane: str = "broad"
    focus_ticker: str = ""
    rank_boost: int = 0
    urls_file: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Article:
    id: str
    source_id: str
    source_name: str
    source_kind: str
    market: str
    title: str
    url: str
    summary: str
    article_overview: str
    article_key_points: list[str]
    published_at: str
    topic_key: str
    topic_label: str
    topic_kind: str
    tags: list[str]
    sector_tags: list[str]
    stock_candidates: list[str]
    stock_tickers: list[str]
    signal_types: list[str]
    bucket_keys: list[str]
    bucket_labels: list[str]
    bucket_kinds: list[str]
    entity_mentions: list[dict[str, Any]]
    sentiment_score: float
    sentiment_label: str
    enrichment_source: str
    source_lane: str = "broad"
    focus_ticker: str = ""
    body_text: str = ""
    source_coverage_modes: list[str] = field(default_factory=list)
    coverage_mode: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Bucket:
    slug: str
    name: str
    kind: str
    market: str
    article_count: int
    source_count: int
    sources: list[str]
    tags: list[str]
    sector_tags: list[str]
    stock_candidates: list[str]
    signal_types: list[str]
    overview: str
    key_points: list[str]
    highlights: list[dict[str, Any]]
    sentiment: dict[str, Any]
    latest_published_at: str
    recent_count: int = 0
    previous_count: int = 0
    related_buckets: list[dict[str, Any]] = field(default_factory=list)
    timeline: list[dict[str, Any]] = field(default_factory=list)
    articles: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Snapshot:
    snapshot_id: str
    market: str
    as_of_date: str
    generated_at: str
    include_review_sources: bool
    overview: str
    stats: dict[str, Any]
    sources: list[dict[str, Any]]
    buckets: list[dict[str, Any]]
    pulse: dict[str, Any] = field(default_factory=dict)
    big_narratives: list[dict[str, Any]] = field(default_factory=list)
    most_active: list[dict[str, Any]] = field(default_factory=list)
    topics: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
