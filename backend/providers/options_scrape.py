from __future__ import annotations

import html
import re
from typing import Any

import requests


ALPHAQUERY_BASE = "https://www.alphaquery.com"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

_ALPHAQUERY_PATHS = {
    "iv_mean_30d": "/stock/{ticker}/volatility-option-statistics/30-day/iv-mean",
    "iv_call_30d": "/stock/{ticker}/volatility-option-statistics/30-day/iv-call",
    "iv_put_30d": "/stock/{ticker}/volatility-option-statistics/30-day/iv-put",
    "put_call_ratio_volume_30d": "/stock/{ticker}/volatility-option-statistics/30-day/put-call-ratio-volume",
    "put_call_ratio_oi_30d": "/stock/{ticker}/volatility-option-statistics/30-day/put-call-ratio-oi",
    "iv_mean_skew_30d": "/stock/{ticker}/volatility-option-statistics/30-day/iv-mean-skew",
    "historical_volatility_30d": "/stock/{ticker}/volatility-option-statistics/30-day/historical-volatility",
}


def _normalize_html_text(raw_html: str) -> str:
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", raw_html, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_metric_value(html: str) -> float | None:
    text = _normalize_html_text(html)
    # AlphaQuery renders pages like:
    # "Microsoft Corporation (MSFT) had 30-Day Implied Volatility (Mean) of 0.3720 for 2026-06-25."
    match = re.search(r"\bhad\b.+?\bof\s+(-?\d+(?:\.\d+)?)\s+\bfor\b", text, re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    try:
        return float(match.group(1))
    except Exception:
        return None


def _extract_price_date(html: str) -> str | None:
    text = _normalize_html_text(html)
    match = re.search(r"Last Closing Price:\s*[\d.,]+\s*\((\d{4}-\d{2}-\d{2})\)", text, re.IGNORECASE)
    return match.group(1) if match else None


def _fetch_alphaquery_metric(ticker: str, path_template: str, timeout: int = 20) -> dict[str, Any]:
    ticker_up = ticker.strip().upper()
    url = ALPHAQUERY_BASE + path_template.format(ticker=ticker_up)
    response = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
        timeout=timeout,
    )
    html = response.text
    return {
        "ok": response.status_code == 200,
        "status_code": response.status_code,
        "url": url,
        "value": _extract_metric_value(html) if response.status_code == 200 else None,
        "as_of_date": _extract_price_date(html) if response.status_code == 200 else None,
        "paywalled": "Please subscribe to continue using AlphaQuery" in html,
    }


def fetch_alphaquery_options_digest(ticker: str, *, timeout: int = 20) -> dict[str, Any]:
    metrics: dict[str, dict[str, Any]] = {}
    for key, path in _ALPHAQUERY_PATHS.items():
        metrics[key] = _fetch_alphaquery_metric(ticker, path, timeout=timeout)

    iv_mean = metrics["iv_mean_30d"]["value"]
    iv_call = metrics["iv_call_30d"]["value"]
    iv_put = metrics["iv_put_30d"]["value"]
    hv_30 = metrics["historical_volatility_30d"]["value"]
    pc_vol = metrics["put_call_ratio_volume_30d"]["value"]
    pc_oi = metrics["put_call_ratio_oi_30d"]["value"]
    skew = metrics["iv_mean_skew_30d"]["value"]
    any_ok = any(bool(row.get("ok")) and row.get("value") is not None for row in metrics.values())

    # Keep the digest narrow: enough to moderate confidence and avoid chasing.
    digest: dict[str, Any] = {
        "source": "alphaquery_scrape",
        "ticker": ticker.strip().upper(),
        "ok": any_ok,
        "as_of_date": next((row.get("as_of_date") for row in metrics.values() if row.get("as_of_date")), None),
        "iv_mean_30d": iv_mean,
        "iv_call_30d": iv_call,
        "iv_put_30d": iv_put,
        "historical_volatility_30d": hv_30,
        "put_call_volume_ratio": pc_vol,
        "put_call_oi_ratio": pc_oi,
        "iv_skew_30d": skew,
        "elevated_iv": bool(iv_mean and hv_30 and iv_mean > hv_30 * 1.2),
        "puts_richer_than_calls": bool(iv_put and iv_call and iv_put > iv_call),
        "metrics": metrics,
    }
    return digest
