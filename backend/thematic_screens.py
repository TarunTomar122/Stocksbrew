"""Compute pre-built thematic screens over the scored stock_intel_pro docs
plus the latest technical docs.

Each screen is a deterministic filter+sort over metrics we already produce -
no new pipeline, no LLM. Saved as a single doc per market so the frontend
reads one Firestore row and renders the whole dashboard tile grid.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _pillar_score(intel: dict[str, Any], pillar: str) -> float | None:
    pillar_doc = (intel.get("pillars") or {}).get(pillar) or {}
    score = pillar_doc.get("score")
    return float(score) if isinstance(score, (int, float)) else None


def _metric_value(intel: dict[str, Any], pillar: str, label: str) -> float | None:
    pillar_doc = (intel.get("pillars") or {}).get(pillar) or {}
    for metric in pillar_doc.get("metrics") or []:
        if str(metric.get("label", "")).strip().lower() == label.lower():
            value = metric.get("value")
            if isinstance(value, (int, float)):
                return float(value)
    return None


def _rsi(technical: dict[str, Any] | None) -> float | None:
    if not technical:
        return None
    rsi_block = technical.get("rsi_14") or {}
    value = rsi_block.get("value")
    return float(value) if isinstance(value, (int, float)) else None


def _from_high_pct(technical: dict[str, Any] | None) -> float | None:
    if not technical:
        return None
    value = (technical.get("distance") or {}).get("from_52w_high_pct")
    return float(value) if isinstance(value, (int, float)) else None


def _price_vs_sma_200(technical: dict[str, Any] | None) -> str:
    if not technical:
        return "insufficient_data"
    return str((technical.get("moving_averages") or {}).get("price_vs_sma_200") or "insufficient_data")


def _instrument_row(
    instrument: dict[str, Any],
    intel: dict[str, Any],
    latest_price: dict[str, Any] | None,
    extras: dict[str, Any] | None = None,
) -> dict[str, Any]:
    quote = (latest_price or {}).get("quote") or {}
    row = {
        "instrument_id": intel.get("instrument_id") or instrument.get("instrument_id"),
        "ticker": instrument.get("ticker") or intel.get("ticker"),
        "name": instrument.get("name"),
        "sector": intel.get("sector_label") or instrument.get("sector"),
        "price": quote.get("current"),
        "day_change_pct": quote.get("day_change_pct"),
        "overall_score": (intel.get("overall") or {}).get("score"),
        "overall_verdict": (intel.get("overall") or {}).get("verdict"),
        "pillar_scores": {
            pillar: _pillar_score(intel, pillar)
            for pillar in ("valuation", "growth", "quality", "momentum")
        },
    }
    if extras:
        row.update(extras)
    return row


SCREEN_DEFINITIONS: list[dict[str, Any]] = [
    {
        # House pick - the only screen that cuts purely on our composite
        # overall score, which already weighs all four pillars. Kept first in
        # the list so it lands as the default tab on the landing page.
        "id": "tikrr_top",
        "title": "Top tikrr Score",
        "tagline": "Our highest composite-score picks across all four pillars.",
        "hook": "The 10 stocks with the best overall tikrr score right now.",
    },
    {
        "id": "quality_compounders",
        "title": "Quality Compounders",
        "tagline": "Great businesses with real growth - the kind you can own for years.",
        "hook": "Top-quartile quality + durable growth, nothing ugly on valuation.",
    },
    {
        "id": "cheap_growth",
        "title": "Cheap Growth",
        "tagline": "Growing fast and not priced for perfection.",
        "hook": "Growth pillar ≥70 with valuation score still above 60.",
    },
    {
        "id": "momentum_leaders",
        "title": "Momentum Leaders",
        "tagline": "What's working right now - and still above its 200-day line.",
        "hook": "Top-quartile momentum with the long-term trend intact.",
    },
    {
        "id": "oversold_quality",
        "title": "Oversold Quality",
        "tagline": "Good businesses that just got marked down.",
        "hook": "RSI below 35 but quality pillar still in the top third.",
    },
    {
        "id": "near_52w_high",
        "title": "Near 52-Week Highs",
        "tagline": "Breakout watchlist - stocks within 3% of a yearly high.",
        "hook": "Price within 3% of its 52-week high.",
    },
    {
        "id": "smart_money",
        "title": "Smart Money Favorites",
        "tagline": "Where the pros are positioned - high institutional ownership.",
        "hook": "Institutional ownership above 70% with overall score ≥ 55.",
    },
]


def compute_screens(
    instruments_by_id: dict[str, dict[str, Any]],
    intel_pro_by_id: dict[str, dict[str, Any]],
    technical_by_id: dict[str, dict[str, Any]],
    latest_prices_by_id: dict[str, dict[str, Any]],
    top_n: int = 10,
) -> list[dict[str, Any]]:
    """Run each screen filter+sort and return tile payloads."""
    rows: list[tuple[str, dict[str, Any]]] = []
    for instrument_id, intel in intel_pro_by_id.items():
        instrument = instruments_by_id.get(instrument_id)
        if not instrument:
            continue
        rows.append((instrument_id, intel))

    screens: list[dict[str, Any]] = []

    def tikrr_top() -> list[dict[str, Any]]:
        out = []
        for iid, intel in rows:
            overall = (intel.get("overall") or {}).get("score")
            if not isinstance(overall, (int, float)):
                continue
            out.append(_instrument_row(
                instruments_by_id[iid], intel, latest_prices_by_id.get(iid),
                extras={"match_score": round(float(overall), 1)},
            ))
        out.sort(key=lambda row: row["match_score"], reverse=True)
        return out[:top_n]

    def quality_compounders() -> list[dict[str, Any]]:
        out = []
        for iid, intel in rows:
            q = _pillar_score(intel, "quality") or 0
            g = _pillar_score(intel, "growth") or 0
            v = _pillar_score(intel, "valuation")
            if q >= 75 and g >= 60 and (v is None or v >= 30):
                out.append(_instrument_row(
                    instruments_by_id[iid], intel, latest_prices_by_id.get(iid),
                    extras={"match_score": round(q * 0.6 + g * 0.4, 1)},
                ))
        out.sort(key=lambda row: row["match_score"], reverse=True)
        return out[:top_n]

    def cheap_growth() -> list[dict[str, Any]]:
        out = []
        for iid, intel in rows:
            g = _pillar_score(intel, "growth") or 0
            v = _pillar_score(intel, "valuation") or 0
            if g >= 70 and v >= 60:
                out.append(_instrument_row(
                    instruments_by_id[iid], intel, latest_prices_by_id.get(iid),
                    extras={"match_score": round(g * 0.5 + v * 0.5, 1)},
                ))
        out.sort(key=lambda row: row["match_score"], reverse=True)
        return out[:top_n]

    def momentum_leaders() -> list[dict[str, Any]]:
        out = []
        for iid, intel in rows:
            m = _pillar_score(intel, "momentum") or 0
            above_200 = _price_vs_sma_200(technical_by_id.get(iid)) == "above"
            if m >= 70 and above_200:
                out.append(_instrument_row(
                    instruments_by_id[iid], intel, latest_prices_by_id.get(iid),
                    extras={"match_score": m, "above_200dma": True},
                ))
        out.sort(key=lambda row: row["match_score"], reverse=True)
        return out[:top_n]

    def oversold_quality() -> list[dict[str, Any]]:
        out = []
        for iid, intel in rows:
            q = _pillar_score(intel, "quality") or 0
            rsi = _rsi(technical_by_id.get(iid))
            if q >= 70 and rsi is not None and rsi <= 35:
                out.append(_instrument_row(
                    instruments_by_id[iid], intel, latest_prices_by_id.get(iid),
                    extras={"match_score": round(q - rsi, 1), "rsi_14": round(rsi, 1)},
                ))
        out.sort(key=lambda row: row["match_score"], reverse=True)
        return out[:top_n]

    def near_52w_high() -> list[dict[str, Any]]:
        out = []
        for iid, intel in rows:
            distance = _from_high_pct(technical_by_id.get(iid))
            if distance is None:
                continue
            # distance is negative when below high; > -3 means within 3%
            if distance >= -3.0 and distance <= 0.5:
                out.append(_instrument_row(
                    instruments_by_id[iid], intel, latest_prices_by_id.get(iid),
                    extras={"match_score": round(distance, 2), "from_52w_high_pct": round(distance, 2)},
                ))
        # Sort by proximity to high (distance closest to 0 first)
        out.sort(key=lambda row: abs(row["match_score"]))
        return out[:top_n]

    def smart_money() -> list[dict[str, Any]]:
        out = []
        for iid, intel in rows:
            inst_own = _metric_value(intel, "quality", "Institutional ownership")
            overall = (intel.get("overall") or {}).get("score") or 0
            if inst_own is not None and inst_own >= 70 and overall >= 55:
                out.append(_instrument_row(
                    instruments_by_id[iid], intel, latest_prices_by_id.get(iid),
                    extras={"match_score": round(inst_own, 1), "inst_own_pct": round(inst_own, 1)},
                ))
        out.sort(key=lambda row: row["match_score"], reverse=True)
        return out[:top_n]

    computers = {
        "tikrr_top": tikrr_top,
        "quality_compounders": quality_compounders,
        "cheap_growth": cheap_growth,
        "momentum_leaders": momentum_leaders,
        "oversold_quality": oversold_quality,
        "near_52w_high": near_52w_high,
        "smart_money": smart_money,
    }

    for definition in SCREEN_DEFINITIONS:
        matches = computers[definition["id"]]()
        screens.append({
            **definition,
            "match_count": len(matches),
            "matches": matches,
        })

    return screens


def build_screens_doc(
    market: str,
    universe_id: str,
    instruments: list[dict[str, Any]],
    intel_pro_docs: list[dict[str, Any]],
    technical_docs: list[dict[str, Any]],
    latest_prices: dict[str, dict[str, Any]],
    top_n: int = 10,
) -> dict[str, Any]:
    instruments_by_id = {i["instrument_id"]: i for i in instruments}
    intel_pro_by_id = {
        doc["instrument_id"]: doc
        for doc in intel_pro_docs
        if isinstance(doc, dict) and doc.get("instrument_id")
    }
    technical_by_id = {
        doc["instrument_id"]: doc
        for doc in technical_docs
        if isinstance(doc, dict) and doc.get("instrument_id")
    }
    screens = compute_screens(
        instruments_by_id=instruments_by_id,
        intel_pro_by_id=intel_pro_by_id,
        technical_by_id=technical_by_id,
        latest_prices_by_id=latest_prices,
        top_n=top_n,
    )
    return {
        "market": market,
        "universe_id": universe_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "coverage": {
            "instruments": len(instruments),
            "intel_pro_docs": len(intel_pro_by_id),
            "technical_docs": len(technical_by_id),
        },
        "screens": screens,
    }
