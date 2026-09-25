"""Safety helpers for optional narrative rendered in outgoing emails.

Email sections should contain supported facts, not status messages about facts we
failed to find.  This module gives every email path the same last-mile filter so
old cached data and upstream fallbacks cannot leak missing-information filler.
"""
from __future__ import annotations

import re
from typing import Any


_MISSING_INFORMATION_PATTERNS = (
    re.compile(r"\bno clear (?:overnight |company-specific |ticker-specific |single |bear )?(?:catalyst|driver)\b", re.I),
    re.compile(r"\bno (?:fresh |confirmed |specific |material |ticker-specific )?(?:catalyst|driver|news)\b", re.I),
    re.compile(r"\bwithout (?:a )?(?:fresh|clear|confirmed|specific) catalyst\b", re.I),
    re.compile(r"\b(?:data|pricing|prices?|information|context) (?:is |are )?(?:not available|unavailable|not live|still updating)\b", re.I),
    re.compile(r"\bnot live yet\b", re.I),
    re.compile(r"\bstill (?:updating|loading)\b", re.I),
)
_EMPTY_MARKERS = frozenset({"", "none", "n/a", "na", "unknown", "unavailable", "not available"})
_NON_TERMINAL_ABBREVIATIONS = frozenset({
    "u.s.", "u.k.", "mr.", "mrs.", "dr.", "inc.", "corp.", "co.",
    "ltd.", "vs.", "e.g.", "i.e.", "a.m.", "p.m.",
})


def is_missing_information_statement(value: Any) -> bool:
    """Return True when text only reports that useful information is missing."""
    text = " ".join(str(value or "").split()).strip()
    lowered = text.lower().strip(" .,:;-–—")
    if lowered in _EMPTY_MARKERS:
        return True
    return any(pattern.search(text) for pattern in _MISSING_INFORMATION_PATTERNS)


def clean_optional_email_text(value: Any) -> str:
    """Remove no-data sentences while preserving any supported sentences.

    This is intentionally for optional narrative.  Measured values such as a
    ticker, price, percentage move, or event date should be validated by their
    own renderer rather than passed through this helper.
    """
    raw = str(value or "").strip()
    if not raw:
        return ""

    paragraphs: list[str] = []
    for raw_paragraph in re.split(r"\n\s*\n", raw):
        paragraph = " ".join(raw_paragraph.split()).strip()
        sentences = re.split(r"(?<=[.!?])\s+", paragraph)
        kept = [sentence.strip() for sentence in sentences if not is_missing_information_statement(sentence)]
        cleaned_paragraph = " ".join(part for part in kept if part).strip()
        if cleaned_paragraph:
            paragraphs.append(cleaned_paragraph)
    return "\n\n".join(paragraphs)


def limit_optional_email_sentences(value: Any, *, max_sentences: int = 3) -> str:
    """Keep complete stock-story sentences, with no character cutoff or ellipsis."""
    text = clean_optional_email_text(value)
    if max_sentences < 1:
        return ""
    boundaries = 0
    for match in re.finditer(r"[.!?][\"'”’)]*\s+(?=\S)", text):
        preceding_word = text[:match.start() + 1].rsplit(maxsplit=1)[-1].lower()
        if preceding_word in _NON_TERMINAL_ABBREVIATIONS and (
            preceding_word in {"mr.", "mrs.", "dr."} or text[match.end()].islower()
        ):
            continue
        boundaries += 1
        if boundaries == max_sentences:
            return text[:match.end()].rstrip()
    return text
