from __future__ import annotations

import html
from urllib.parse import quote

from backend.email import APP_URL
from backend.emails._theme import BORDER


LOGO_SOURCE_OVERRIDES = {
    # Finnhub does not publish a CEG image. This source has a stable company
    # mark and is still served through the app proxy for email clients.
    "CEG": "https://companiesmarketcap.com/img/company-logos/256/CEG.png",
}


def _is_bad_logo_url(raw: str) -> bool:
    s = str(raw or "").strip().lower()
    if not s:
        return True
    if "google.com/s2/favicons" in s:
        return True
    if "/favicon" in s:
        return True
    return False


def logo_src(*, ticker: str, logo_url: str | None = None) -> str:
    symbol = str(ticker or "").strip().upper()
    candidate = str(logo_url or "").strip()
    if not candidate:
        candidate = LOGO_SOURCE_OVERRIDES.get(symbol, "")
    if symbol:
        src = f"{APP_URL}/api/logo-proxy?ticker={quote(symbol, safe='')}&fallback=1"
        if candidate and not _is_bad_logo_url(candidate):
            src += f"&url={quote(candidate, safe='')}"
        return src
    return ""


def logo_img(*, ticker: str, logo_url: str | None = None, size: int = 44) -> str:
    src = logo_src(ticker=ticker, logo_url=logo_url)
    return (
        f"<img src='{html.escape(src)}' width='{size}' height='{size}' alt='' "
        "style='border-radius:50%;object-fit:cover;background:#fff;"
        f"border:1px solid {BORDER};padding:2px;display:block' />"
    )


def ticker_with_logo(*, ticker: str, logo_url: str | None = None) -> str:
    return (
        "<table cellpadding='0' cellspacing='0' role='presentation'><tr>"
        f"<td width='34'>{logo_img(ticker=ticker, logo_url=logo_url, size=24)}</td>"
        f"<td>{html.escape(ticker)}</td></tr></table>"
    )
