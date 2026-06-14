"""Shared helpers for post-earnings copy when EPS actuals are missing."""
from __future__ import annotations

_MISSING_ACTUAL_MARKERS = (
    "not yet available",
    "not available",
    "unavailable",
    "were unavailable",
    "was unavailable",
    "cannot confirm",
    "no beat or miss",
    "no confirmed beat",
    "not reported",
    "not captured",
    "do not state a beat",
    "lacked eps",
    "absent eps",
    "no eps data",
    "no eps disclosure",
)


def is_missing_actual_copy(text: str | None) -> bool:
    lower = str(text or "").strip().lower()
    if not lower:
        return True
    return any(marker in lower for marker in _MISSING_ACTUAL_MARKERS)


def earnings_evidence_lines(facts: dict | None) -> list[str]:
    """Prefer price reaction and guidance over missing-EPS disclaimers."""
    if not isinstance(facts, dict):
        return []
    ordered = (
        str(facts.get("price_reaction") or "").strip(),
        str(facts.get("guidance_signal") or "").strip(),
        str(facts.get("post_earnings_narrative") or "").strip(),
        str(facts.get("reported_vs_expected") or "").strip(),
    )
    out: list[str] = []
    for line in ordered:
        if not line or is_missing_actual_copy(line):
            continue
        if line not in out:
            out.append(line)
    return out[:3]
