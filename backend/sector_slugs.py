"""Finviz-compatible sector slug helpers shared across sync, scoring, and views."""
from __future__ import annotations

import re
from typing import Any

# GICS / Yahoo / instrument-master labels → Finviz `f=sec_*` slugs.
_LABEL_TO_FINVIZ_SECTOR: dict[str, str] = {
    "technology": "technology",
    "healthcare": "healthcare",
    "health care": "healthcare",
    "financial": "financial",
    "financials": "financial",
    "financial services": "financial",
    "consumer cyclical": "consumercyclical",
    "consumer discretionary": "consumercyclical",
    "consumer defensive": "consumerdefensive",
    "consumer staples": "consumerdefensive",
    "industrials": "industrials",
    "industrial goods": "industrials",
    "basic materials": "basicmaterials",
    "energy": "energy",
    "utilities": "utilities",
    "real estate": "realestate",
    "communication services": "communicationservices",
    "telecommunication services": "communicationservices",
}


def finviz_slug_from_label(label: str) -> str:
    text = str(label or "").strip().lower()
    if not text:
        return ""
    mapped = _LABEL_TO_FINVIZ_SECTOR.get(text)
    if mapped:
        return mapped
    # Finviz industry slugs are lowercase alphanumeric only.
    return re.sub(r"[^a-z0-9]+", "", text)


def resolve_sector_fields(
    *,
    sector_slug: str = "",
    sector_label: str = "",
    instrument_sector: str = "",
    instrument_industry: str = "",
) -> tuple[str, str]:
    slug = str(sector_slug or "").strip()
    label = str(sector_label or "").strip()
    if not slug:
        label = label or str(instrument_sector or "").strip() or str(instrument_industry or "").strip()
        slug = finviz_slug_from_label(label)
    if not label and instrument_sector:
        label = str(instrument_sector).strip()
    return slug, label


def resolve_sector_fields_from_row(row: dict[str, Any]) -> tuple[str, str]:
    return resolve_sector_fields(
        sector_slug=str(row.get("sector_slug") or ""),
        sector_label=str(row.get("sector_label") or row.get("instrument_sector") or ""),
        instrument_sector=str(row.get("instrument_sector") or row.get("sector") or ""),
        instrument_industry=str(row.get("instrument_industry") or row.get("industry") or ""),
    )
