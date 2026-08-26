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
    if candidate and not _is_bad_logo_url(candidate):
        return f"{APP_URL}/api/logo-proxy?url={quote(candidate, safe='')}"
    if symbol:
        finnhub = (
            "https://static2.finnhub.io/file/publicdatany/finnhubimage/"
            f"stock_logo/{quote(symbol.replace('.', '-'))}.png"
        )
        return f"{APP_URL}/api/logo-proxy?url={quote(finnhub, safe='')}"
    fmp = f"https://financialmodelingprep.com/image-stock/{quote(symbol)}.png"
    return f"{APP_URL}/api/logo-proxy?url={quote(fmp, safe='')}"


def logo_img(*, ticker: str, logo_url: str | None = None, size: int = 44) -> str:
    src = logo_src(ticker=ticker, logo_url=logo_url)
    radius = max(8, size // 5)
    return (
        f"<img src='{html.escape(src)}' width='{size}' height='{size}' alt='' "
        f"style='border-radius:{radius}px;object-fit:contain;background:#fff;"
        f"border:1px solid {BORDER};padding:2px;display:block' />"
    )
