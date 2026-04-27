"""Derive per-article coverage_mode (market | sector | stock) from source + entities.

coverage_mode is a universe-independent routing label. It is authoritative for
selecting which articles feed the market/sector/stock context briefs, replacing
the old entity-mention-primary gate that almost never fired.

Design:
- source.coverage_modes (list) is the hard capability of the feed. A single-mode
  source (e.g. Federal Reserve Press Releases = ["market"]) always produces
  market articles; nothing the LLM says can demote that.
- For multi-mode sources, the LLM's primary entity type is the tiebreaker.
- Per-ticker search feeds (lane == "core") are always stock regardless of what
  they scrape, because the query itself is ticker-keyed.
- Legacy articles missing source_coverage_modes get backfilled from the source
  registry + id-prefix rules for dynamic sources, so this is resilient to any
  stale raw doc in Firestore.
"""
from __future__ import annotations

from typing import Iterable


_COVERAGE_MODES = ("market", "sector", "stock")


def coverage_modes_for_source_id(source_id: str) -> list[str]:
    """Backfill for legacy Firestore articles missing source_coverage_modes.

    Look up the source in the registry; fall back to all modes. Dynamic sources
    (google-*, core-*, promoted-*) set source_coverage_modes at construction
    time, so they never reach this fallback in current runs.
    """
    sid = (source_id or "").strip()
    if not sid:
        return ["market", "sector", "stock"]
    from backend.source_registry import list_sources
    for source in list_sources():
        if source.id == sid:
            return list(source.coverage_modes) or ["market", "sector", "stock"]
    return ["market", "sector", "stock"]


def _primary_types(entity_mentions: Iterable[dict]) -> set[str]:
    primary: set[str] = set()
    for mention in entity_mentions or []:
        if str(mention.get("mention_role", "")).strip().lower() == "primary":
            t = str(mention.get("type", "")).strip().lower()
            if t:
                primary.add(t)
    return primary


def derive_coverage_mode(
    *,
    source_id: str,
    source_lane: str,
    source_coverage_modes: list[str] | None,
    entity_mentions: list[dict] | None,
) -> str:
    modes_list = list(source_coverage_modes or []) or coverage_modes_for_source_id(source_id)
    modes = {m for m in modes_list if m in _COVERAGE_MODES}
    if not modes:
        modes = set(_COVERAGE_MODES)

    lane = (source_lane or "broad").strip().lower()

    # Per-ticker search feeds are always stock-level.
    if lane in {"core", "promoted"}:
        return "stock"

    # Single-mode source: no ambiguity.
    if len(modes) == 1:
        return next(iter(modes))

    primary = _primary_types(entity_mentions or [])
    if "stock" in primary and "stock" in modes:
        return "stock"
    if "sector" in primary and "sector" in modes:
        return "sector"
    if "market" in primary and "market" in modes:
        return "market"

    # No clear primary entity. For broad-lane multi-mode sources, prefer market
    # — that is what a broad feed is for when no specific stock is the focus.
    if "market" in modes:
        return "market"
    if "sector" in modes:
        return "sector"
    return "stock"
