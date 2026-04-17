from __future__ import annotations

from collections import defaultdict
import re
from typing import Any
from urllib.parse import urlparse

from backend.tikrr_pipeline.searxng import SearchHit


TRUSTED_PRICE_DOMAINS = {
    "finance.yahoo.com": 5,
    "stockanalysis.com": 5,
    "www.cnbc.com": 4,
    "www.investing.com": 4,
    "www.morningstar.com": 4,
    "robinhood.com": 3,
    "investor.apple.com": 4,
}

TRUSTED_NEWS_DOMAINS = {
    "www.cnbc.com": 5,
    "www.reuters.com": 5,
    "www.bloomberg.com": 5,
    "www.wsj.com": 5,
    "www.ft.com": 5,
    "www.nasdaq.com": 4,
    "finance.yahoo.com": 4,
    "www.marketwatch.com": 4,
    "www.benzinga.com": 3,
    "stocktwits.com": 1,
    "robinhood.com": 2,
}

TRUSTED_ANALYST_DOMAINS = {
    "www.benzinga.com": 5,
    "www.marketbeat.com": 4,
    "www.wsj.com": 4,
    "www.tipranks.com": 4,
    "www.tradingview.com": 3,
    "www.investing.com": 3,
    "www.cnn.com": 2,
}

GENERIC_NEWS_PATTERNS = (
    "stock price, news, quote",
    "quote & history",
    "stock price & overview",
    "buy or sell",
    "stock quote price and forecast",
    "stock price, quote, news",
    "stock price, quote and news",
    "stock market today",
    "live updates",
    "5 things to know",
)

ANALYST_RATINGS = ("strong buy", "buy", "hold", "neutral", "underperform", "sell")


def domain_for(url: str) -> str:
    return urlparse(url).netloc.lower()


def dedupe_hits(hits: list[SearchHit]) -> list[SearchHit]:
    seen: set[str] = set()
    output: list[SearchHit] = []
    for hit in hits:
        if not hit.url or hit.url in seen:
            continue
        seen.add(hit.url)
        output.append(hit)
    return output


def _score_hit(label: str, hit: SearchHit, symbol: str, stock_name: str) -> int:
    title = hit.title.lower()
    content = hit.content.lower()
    domain = domain_for(hit.url)
    symbol_lower = symbol.lower()
    name_words = [part.lower() for part in re.split(r"\W+", stock_name) if len(part) > 2]
    score = 0

    if label == "price":
        score += TRUSTED_PRICE_DOMAINS.get(domain, 0) * 10
        if "quote" in title or "stock price" in title:
            score += 8
        if "$" in hit.content or "usd" in content:
            score += 4
        if "52 week range" in content or "52-week range" in content:
            score += 4
    elif label == "news":
        score += TRUSTED_NEWS_DOMAINS.get(domain, 0) * 10
        if any(pattern in title for pattern in GENERIC_NEWS_PATTERNS):
            score -= 35
        if any(word in title for word in ("shares", "stock", "earnings", "launch", "delay", "analyst", "guidance")):
            score += 5
        if any(token in hit.url for token in ("/quote/", "/history/", "/forecast/")):
            score -= 25
        if "/stocks/" in hit.url and "news" not in hit.url and "/article/" not in hit.url:
            score -= 18
        if re.search(r"/20[0-9]{2}/[0-9]{2}/[0-9]{2}/", hit.url) or "/article/" in hit.url or "/news/" in hit.url:
            score += 18
        if "hours ago" in content or "today" in content:
            score += 6
    elif label == "analyst":
        score += TRUSTED_ANALYST_DOMAINS.get(domain, 0) * 10
        if "target" in title or "analyst" in title or "rating" in title:
            score += 8
        if "consensus" in content:
            score += 5

    mentions_stock = False
    if symbol_lower in title or symbol_lower in content:
        score += 6
        mentions_stock = True
    for word in name_words[:3]:
        if word in title:
            score += 4
            mentions_stock = True
        if word in content:
            score += 2
            mentions_stock = True
    if not mentions_stock:
        score -= 50
    return score


def curate_hits(label: str, hits: list[SearchHit], symbol: str, stock_name: str, limit: int = 5) -> list[SearchHit]:
    ranked = sorted(
        dedupe_hits(hits),
        key=lambda hit: _score_hit(label, hit, symbol, stock_name),
        reverse=True,
    )
    output: list[SearchHit] = []
    domain_counts: dict[str, int] = defaultdict(int)
    domain_limit = 2 if label == "news" else 1
    for hit in ranked:
        domain = domain_for(hit.url)
        if domain and domain_counts[domain] >= domain_limit:
            continue
        if domain:
            domain_counts[domain] += 1
        output.append(hit)
        if len(output) >= limit:
            break
    return output


def _match_number(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    value = match.group(1).replace(",", "")
    try:
        return float(value)
    except ValueError:
        return None


def _match_int(pattern: str, text: str) -> int | None:
    value = _match_number(pattern, text)
    if value is None:
        return None
    return int(value)


def extract_facts(
    *,
    symbol: str,
    stock_name: str,
    price_hits: list[SearchHit],
    news_hits: list[SearchHit],
    analyst_hits: list[SearchHit],
) -> dict[str, Any]:
    price_candidates: dict[str, list[float]] = defaultdict(list)
    text_blocks = [f"{hit.title} {hit.content}" for hit in price_hits]
    for text in text_blocks:
        current = _match_number(r"stock price is \$?([0-9][0-9,]*\.?[0-9]*)", text)
        if current is not None:
            price_candidates["current"].append(current)
        current = _match_number(r"trades at \$?([0-9][0-9,]*\.?[0-9]*)", text)
        if current is not None:
            price_candidates["current"].append(current)
        current = _match_number(r"currently priced at \$?([0-9][0-9,]*\.?[0-9]*)", text)
        if current is not None:
            price_candidates["current"].append(current)
        current = _match_number(r"stock price today is \$?([0-9][0-9,]*\.?[0-9]*)", text)
        if current is not None:
            price_candidates["current"].append(current)
        after_hours = _match_number(r"after-hours[^0-9$]*\$?([0-9][0-9,]*\.?[0-9]*)", text)
        if after_hours is not None:
            price_candidates["current"].append(after_hours)
        close = _match_number(r"close[^0-9$]*\$?([0-9][0-9,]*\.?[0-9]*)", text)
        if close is not None:
            price_candidates["previousClose"].append(close)
        previous_close = _match_number(r"previous close[^0-9$]*\$?([0-9][0-9,]*\.?[0-9]*)", text)
        if previous_close is not None:
            price_candidates["previousClose"].append(previous_close)
        open_price = _match_number(r"opened at \$?([0-9][0-9,]*\.?[0-9]*)", text)
        if open_price is not None:
            price_candidates["open"].append(open_price)
        high_price = _match_number(r"high of \$?([0-9][0-9,]*\.?[0-9]*)", text)
        if high_price is not None:
            price_candidates["high"].append(high_price)
        low_price = _match_number(r"low of \$?([0-9][0-9,]*\.?[0-9]*)", text)
        if low_price is not None:
            price_candidates["low"].append(low_price)
        moved_low = _match_number(r"intraday low of \$?([0-9][0-9,]*\.?[0-9]*)", text)
        if moved_low is not None:
            price_candidates["low"].append(moved_low)
        range_match = re.search(
            r"range of \$?([0-9][0-9,]*\.?[0-9]*) to \$?([0-9][0-9,]*\.?[0-9]*)",
            text,
            flags=re.IGNORECASE,
        )
        if range_match:
            low = float(range_match.group(1).replace(",", ""))
            high = float(range_match.group(2).replace(",", ""))
            price_candidates["low"].append(low)
            price_candidates["high"].append(high)
        range_match = re.search(
            r"52[\s-]week range[^0-9$]*\$?([0-9][0-9,]*\.?[0-9]*)[^0-9$]+\$?([0-9][0-9,]*\.?[0-9]*)",
            text,
            flags=re.IGNORECASE,
        )
        if range_match:
            low = float(range_match.group(1).replace(",", ""))
            high = float(range_match.group(2).replace(",", ""))
            price_candidates["fiftyTwoWeekLow"].append(low)
            price_candidates["fiftyTwoWeekHigh"].append(high)
        change_pct = _match_number(r"([+-]?[0-9]+(?:\.[0-9]+)?)%", text)
        if change_pct is not None:
            price_candidates["changePct"].append(change_pct)

    analyst_text = " ".join(f"{hit.title} {hit.content}" for hit in analyst_hits)
    target_price = _match_number(r"price target(?: of)? \$?([0-9][0-9,]*\.?[0-9]*)", analyst_text)
    num_analysts = _match_int(r"ratings of ([0-9][0-9,]*) analysts", analyst_text)
    upside = _match_number(r"([0-9][0-9,]*\.?[0-9]*)% upside", analyst_text)

    rating = None
    lowered = analyst_text.lower()
    for candidate in ANALYST_RATINGS:
        if candidate in lowered:
            rating = candidate.title()
            break

    news_domains = sorted({domain_for(hit.url) for hit in news_hits if hit.url})
    analyst_domains = sorted({domain_for(hit.url) for hit in analyst_hits if hit.url})
    price_domains = sorted({domain_for(hit.url) for hit in price_hits if hit.url})

    return {
        "symbol": symbol,
        "stockName": stock_name,
        "priceFacts": {
            key: values[0] if values else None
            for key, values in price_candidates.items()
        },
        "analystFacts": {
            "rating": rating,
            "targetPrice": target_price,
            "upside": upside,
            "numAnalysts": num_analysts,
        },
        "sourceSummary": {
            "priceDomains": price_domains,
            "newsDomains": news_domains,
            "analystDomains": analyst_domains,
            "newsCount": len(news_hits),
        },
    }


def merge_extracted_facts(payload: dict[str, Any], facts: dict[str, Any]) -> dict[str, Any]:
    price = payload.get("price", {})
    price_facts = facts.get("priceFacts", {})
    technicals = payload.get("technicals", {})
    analyst = payload.get("analystConsensus", {})
    analyst_facts = facts.get("analystFacts", {})

    if price.get("current") is None and price_facts.get("current") is not None:
        price["current"] = price_facts["current"]
    if price.get("previousClose") is None and price_facts.get("previousClose") is not None:
        price["previousClose"] = price_facts["previousClose"]
    if technicals.get("fiftyTwoWeekHigh") is None and price_facts.get("fiftyTwoWeekHigh") is not None:
        technicals["fiftyTwoWeekHigh"] = price_facts["fiftyTwoWeekHigh"]
    if technicals.get("fiftyTwoWeekLow") is None and price_facts.get("fiftyTwoWeekLow") is not None:
        technicals["fiftyTwoWeekLow"] = price_facts["fiftyTwoWeekLow"]
    if analyst.get("targetPrice") is None and analyst_facts.get("targetPrice") is not None:
        analyst["targetPrice"] = analyst_facts["targetPrice"]
    if analyst.get("upside") is None and analyst_facts.get("upside") is not None:
        analyst["upside"] = analyst_facts["upside"]
    if analyst.get("numAnalysts") is None and analyst_facts.get("numAnalysts") is not None:
        analyst["numAnalysts"] = analyst_facts["numAnalysts"]
    if analyst.get("rating") in ("", "Unknown") and analyst_facts.get("rating"):
        analyst["rating"] = analyst_facts["rating"]

    current = price.get("current")
    previous_close = price.get("previousClose")
    if current is not None and previous_close is not None:
        if price.get("change") is None:
            price["change"] = round(current - previous_close, 2)
        if price.get("changePct") is None and previous_close:
            price["changePct"] = round(((current - previous_close) / previous_close) * 100, 2)

    if not technicals.get("trend"):
        technicals["trend"] = "bullish" if (price.get("change") or 0) > 0 else "bearish" if (price.get("change") or 0) < 0 else "neutral"

    payload["price"] = price
    payload["technicals"] = technicals
    payload["analystConsensus"] = analyst
    return payload
