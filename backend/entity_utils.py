"""Validation helpers for entity-derived market identifiers."""
from __future__ import annotations

import re
from typing import Any


SAFE_MENTION_TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9._-]{0,19}$")


def safe_mention_ticker(value: Any) -> str | None:
    """Return a normalized ticker only when it is safe as a Firestore ID part."""
    ticker = str(value or "").strip().upper()
    return ticker if SAFE_MENTION_TICKER_RE.fullmatch(ticker) else None
