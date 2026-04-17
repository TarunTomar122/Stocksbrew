"""News ingest helpers for the small-universe intelligence pipeline."""
from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import replace
from typing import Callable
from urllib.parse import quote_plus

from bs4 import BeautifulSoup
import requests

from backend.instrument_universe import list_instruments
from backend.market_strategy import build_ticker_sources
from backend.models import Article, SourceDefinition
from backend.rss import fetch_feed
from backend.source_registry import list_sources_for_market


BROAD_SOURCE_IDS = {
    "US": [
        "nasdaq-markets",
        "nasdaq-stocks",
        "nasdaq-earnings",
        "investing-stock-market-news",
        "seekingalpha-market-currents",
        "foxbusiness-markets",
    ],
    "IN": [
        "livemint-markets",
        "economic-times-markets",
        "businessline-markets",
        "nse-circulars",
    ],
}

GOOGLE_BROAD_QUERIES = {
    "US": [
        ("google-broad-us-market", "US stock market when:1d"),
        ("google-broad-big-tech", "big tech stocks when:2d"),
        ("google-broad-semiconductors", "semiconductor stocks when:2d"),
        ("google-broad-defense", "defense stocks when:2d"),
        ("google-broad-banks", "bank stocks when:2d"),
        ("google-broad-energy", "energy stocks when:2d"),
        ("google-broad-software", "software stocks when:2d"),
    ],
    "IN": [
        ("google-broad-india-market", "India stock market when:1d"),
        ("google-broad-nifty", "Nifty 50 stocks when:2d"),
        ("google-broad-bank-nifty", "Bank Nifty stocks when:2d"),
        ("google-broad-india-it", "India IT stocks when:2d"),
        ("google-broad-india-energy", "India energy stocks when:2d"),
        ("google-broad-india-pharma", "India pharma stocks when:2d"),
    ],
}


COMPANY_SIGNAL_TERMS = (
    "earnings",
    "results",
    "revenue",
    "guidance",
    "analyst",
    "price target",
    "upgrade",
    "downgrade",
    "contract",
    "deal",
    "dividend",
    "outlook",
    "forecast",
    "shares",
    "stock",
    "profit",
    "quarterly",
    "beats",
    "misses",
)

MACRO_NOISE_TERMS = (
    "futures",
    "crude",
    "coffee",
    "sugar",
    "gold",
    "silver",
    "oil prices",
    "iran",
    "war",
    "currencies",
    "forex",
    "treasury",
    "fed",
    "fomc",
)

MARKET_PASS_TERMS = (
    "market",
    "s&p",
    "dow",
    "wall street",
    "fed ",
    "federal reserve",
    "rate cut",
    "rate hike",
    "inflation",
    "gdp",
    "rally",
    "selloff",
    "sell-off",
    "sector rotation",
    "treasury",
    "bull market",
    "bear market",
    "recession",
    "jobs report",
    "unemployment",
    "index",
    "indices",
)

LOW_SIGNAL_GOOGLE_PUBLISHERS = {
    "MarketBeat",
    "Defense World",
    "ETF Daily News",
    "Dakota Financial News",
    "The AM Reporter",
    "Transcript Daily",
    "Techdows",
    "Best Stocks",
    "DefenseWorld.net",
    "Meyka",
    "StockInvest.us",
    "Devdiscourse",
    "AD HOC NEWS",
    "MSN",
    "CoinCentral",
    "Rock Paper Shotgun",
}

GOOGLE_ALLOWED_PUBLISHERS = {
    "Yahoo Finance",
    "TipRanks",
    "Benzinga",
    "Nasdaq",
    "Reuters",
    "CNBC",
    "MarketWatch",
    "Barron's",
    "Zacks",
    "Seeking Alpha",
    "Investor's Business Daily",
    "The Motley Fool",
    "Bloomberg",
    "TheStreet",
    "Trefis",
    "Mint",
    "Livemint",
    "The Economic Times",
    "Economic Times",
    "The Hindu BusinessLine",
    "BusinessLine",
    "Moneycontrol",
    "CNBCTV18",
    "Business Today",
    "Financial Express",
    "NDTV Profit",
}

LOW_SIGNAL_GOOGLE_TITLE_TERMS = (
    "stock price, news, quote & history",
    "interactive stock chart",
    "stock position increased",
    "purchases",
    "acquires",
    "lowers stock position",
    "boosts position",
    "shares of",
    "call (",
    "put (",
)

LOW_SIGNAL_TITLE_TERMS = (
    "feature highlights",
    "investment ideas",
    "better buy",
    "why this stock",
    "why these stocks",
    "what q1 earnings could mean",
    "looks alarmingly like",
    "warning for big tech",
    "about to soar",
    "could send",
    "could soar",
    "could skyrocket",
    "could plunge",
    "could crash",
    "should you buy",
    "is it time to buy",
    "is it too late to buy",
    "top stocks to buy",
    "best stocks to buy",
    "stocks to watch",
    "millionaire maker",
    "potential factors",
    "reasons to buy",
    "reasons to sell",
    "things to know",
    "what you need to know",
    "what investors should know",
    "here's why",
    "here's what",
    "buy the dip",
    "hot stock",
    "next big thing",
    "must-buy",
    "stock alert",
    "us stocks markets |",
)

INDIA_MARKET_MARKERS = (
    "nifty",
    "sensex",
    "nse",
    "bse",
    "sebi",
    "india",
    "indian",
    "rupee",
    "bank nifty",
    "mcap of",
    "rs ",
    "₹",
)

US_MARKET_MARKERS = (
    "s&p 500",
    "nasdaq",
    "dow jones",
    "wall street",
    "us stocks",
    "u.s. stocks",
)


def _clean_body_lines(lines: list[str], limit: int = 18) -> str:
    cleaned: list[str] = []
    for line in lines:
        text = " ".join(str(line).split()).strip()
        if not text or len(text) < 30:
            continue
        if text in cleaned:
            continue
        cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return "\n".join(cleaned)


def _fetch_article_body(article: Article) -> str:
    if not article.url or "news.google.com" in article.url:
        return ""
    try:
        response = requests.get(article.url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
    except Exception:
        return ""
    soup = BeautifulSoup(response.text, "html.parser")
    paragraphs: list[str] = []

    if "nasdaq.com" in article.url:
        started = False
        for tag in soup.find_all(["h1", "p"]):
            text = " ".join(tag.get_text(" ", strip=True).split())
            if not text:
                continue
            if text.startswith("Chicago, IL"):
                started = True
            if started:
                paragraphs.append(text)
        return _clean_body_lines(paragraphs)

    for tag in soup.find_all(["article", "main"]):
        text = " ".join(tag.get_text(" ", strip=True).split())
        if text and len(text) > 500:
            paragraphs.append(text)
            break
    if not paragraphs:
        paragraphs = [
            " ".join(tag.get_text(" ", strip=True).split())
            for tag in soup.find_all("p")
        ]
    return _clean_body_lines(paragraphs)


def _hydrate_article_bodies(articles: list[Article]) -> list[Article]:
    if not articles:
        return []

    hydrated: list[Article | None] = [None] * len(articles)

    def fetch_one(index: int, article: Article) -> tuple[int, Article]:
        body_text = _fetch_article_body(article)
        if not body_text:
            return index, article
        return index, replace(article, body_text=body_text)

    with ThreadPoolExecutor(max_workers=min(8, len(articles))) as executor:
        futures = [executor.submit(fetch_one, index, article) for index, article in enumerate(articles)]
        for future in as_completed(futures):
            index, hydrated_article = future.result()
            hydrated[index] = hydrated_article

    return [article for article in hydrated if article is not None]


def _build_google_broad_sources(market: str) -> list[SourceDefinition]:
    sources: list[SourceDefinition] = []
    locale = ("en-US", "US", "US:en")
    if market == "IN":
        locale = ("en-IN", "IN", "IN:en")
    for source_id, query in GOOGLE_BROAD_QUERIES.get(market, []):
        feed_url = (
            "https://news.google.com/rss/search?q="
            f"{quote_plus(query)}&hl={locale[0]}&gl={locale[1]}&ceid={locale[2]}"
        )
        sources.append(
            SourceDefinition(
                id=source_id,
                name=f"Google News {query}",
                kind="publisher",
                market_codes=[market],
                homepage_url="https://news.google.com/",
                feed_url=feed_url,
                verification_url="https://news.google.com/rss",
                verified_at="2026-03-26",
                usage_status="enabled",
                enabled_by_default=True,
                licensing_notes=f"Google News RSS search for {query}.",
                coverage_modes=["market", "sector", "stock"],
                sector_tags=[],
                signal_types=["market_news", "macro", "ratings", "earnings"],
                source_tier="publisher",
                max_items=6,
                max_age_hours=48,
                lane="broad",
                rank_boost=15,
            )
        )
    return sources


def _is_low_signal_google_article(article: Article) -> bool:
    if not article.source_id.startswith("google-") and "-google_news-" not in article.source_id:
        return False
    title = article.title.lower()
    publisher = article.source_name.strip()
    if publisher in LOW_SIGNAL_GOOGLE_PUBLISHERS:
        return True
    if publisher and publisher not in GOOGLE_ALLOWED_PUBLISHERS:
        return True
    return any(term in title for term in LOW_SIGNAL_GOOGLE_TITLE_TERMS)


def _is_low_signal_article(article: Article) -> bool:
    title = article.title.lower()
    publisher = article.source_name.strip()
    if publisher in LOW_SIGNAL_GOOGLE_PUBLISHERS:
        return True
    return any(term in title for term in LOW_SIGNAL_TITLE_TERMS)


def _is_market_level_article(article: Article) -> bool:
    text = f"{article.title} {article.summary}".lower()
    return any(term in text for term in MARKET_PASS_TERMS)


def _looks_finance_relevant(article: Article) -> bool:
    text = f"{article.title} {article.summary}".lower()
    if any(term in text for term in COMPANY_SIGNAL_TERMS):
        return True
    if any(marker in text for marker in ("%", "$", "shares", "stock", "price target", "guidance")):
        return True
    return False


def build_universe_sources(market: str, universe_id: str) -> list[SourceDefinition]:
    instruments = list_instruments(market, universe_id)
    broad_ids = set(BROAD_SOURCE_IDS.get(market, []))
    broad_sources = [
        source
        for source in list_sources_for_market(market)
        if source.id in broad_ids and source.kind == "publisher"
    ]
    provider_set = ["google_news"] if market == "IN" else ["nasdaq", "seekingalpha", "google_news"]
    ticker_entries = [
        {
            "ticker": instrument["ticker"],
            "display_name": instrument["name"],
            "aliases": instrument.get("aliases", []),
            "sector_tags": [instrument.get("sector", "").strip().lower().replace(" ", "-")] if instrument.get("sector") else [],
            "providers": provider_set,
            "max_items_per_source": 2,
            "max_age_hours": 72,
        }
        for instrument in instruments
    ]
    core_sources = build_ticker_sources(market, ticker_entries, lane="core")
    return broad_sources + _build_google_broad_sources(market) + core_sources


def article_priority(article: Article, tracked_terms: list[str]) -> tuple[int, str]:
    text = f"{article.title} {article.summary}".lower()
    score = 0
    if article.source_lane == "core":
        score += 220
    elif article.source_lane == "promoted":
        score += 260
    else:
        score += 80
    if article.focus_ticker:
        score += 140
    if article.source_kind == "publisher":
        score += 20
    score += 20 * sum(1 for term in COMPANY_SIGNAL_TERMS if term in text)
    score -= 12 * sum(1 for term in MACRO_NOISE_TERMS if term in text)
    score += 35 * sum(1 for term in tracked_terms if term in text)
    if _looks_finance_relevant(article):
        score += 45
    if _is_low_signal_article(article):
        score -= 160
    if " vs " in text or " versus " in text:
        score -= 40
    return score, article.published_at


def _matches_tracked_terms(article: Article, tracked_terms: list[str]) -> bool:
    text = f"{article.title} {article.summary}".lower()
    return any(term in text for term in tracked_terms)


def _tracked_term_hit_count(article: Article, tracked_terms: list[str]) -> int:
    text = f"{article.title} {article.summary}".lower()
    return sum(1 for term in tracked_terms if term in text)


def _matches_market_scope(article: Article, market: str) -> bool:
    text = f"{article.title} {article.summary}".lower()
    if market == "IN":
        if any(marker in text for marker in INDIA_MARKET_MARKERS):
            return True
        if any(marker in text for marker in US_MARKET_MARKERS):
            return False
    return True


def _matches_focus_terms(article: Article, focus_terms: list[str]) -> bool:
    text = f"{article.title} {article.summary}".lower()
    return any(term in text for term in focus_terms)


def _select_articles(articles: list[Article], tracked_terms: list[str], max_articles: int) -> list[Article]:
    lane_groups: dict[str, list[Article]] = defaultdict(list)
    for article in articles:
        lane_groups[article.source_lane or "broad"].append(article)

    core_limit = max(6, int(round(max_articles * 0.7)))
    broad_limit = max(2, max_articles - core_limit)
    lane_limits = {"core": core_limit, "broad": broad_limit}
    selected: list[Article] = []
    seen_urls: set[str] = set()
    for lane in ("core", "broad"):
        lane_articles = sorted(lane_groups.get(lane, []), key=lambda item: article_priority(item, tracked_terms), reverse=True)
        for article in lane_articles:
            if article.url in seen_urls:
                continue
            seen_urls.add(article.url)
            selected.append(article)
            if len([item for item in selected if item.source_lane == lane]) >= lane_limits[lane]:
                break

    selected = sorted(selected, key=lambda item: article_priority(item, tracked_terms), reverse=True)
    return selected[:max_articles]


def collect_universe_articles(
    market: str,
    universe_id: str,
    max_articles: int = 20,
    fetcher: Callable[[str], str] | None = None,
) -> tuple[list[Article], list[dict[str, object]]]:
    instruments = list_instruments(market, universe_id)
    tracked_terms = []
    focus_terms_by_ticker: dict[str, list[str]] = {}
    for instrument in instruments:
        instrument_terms = [instrument["ticker"].lower(), instrument["name"].lower()]
        tracked_terms.append(instrument["ticker"].lower())
        tracked_terms.append(instrument["name"].lower())
        for alias in instrument.get("aliases", []):
            alias_value = str(alias).lower()
            tracked_terms.append(alias_value)
            instrument_terms.append(alias_value)
        focus_terms_by_ticker[instrument["ticker"].upper()] = list(dict.fromkeys(term for term in instrument_terms if term))
    tracked_terms = list(dict.fromkeys(term for term in tracked_terms if term))

    all_articles: list[Article] = []
    source_health: list[dict[str, object]] = []
    seen_urls: set[str] = set()

    def fetch_one(source: SourceDefinition) -> tuple[SourceDefinition, list[Article], str | None]:
        try:
            fetched = fetch_feed(source, fetcher=fetcher)
        except Exception as error:
            return source, [], str(error)
        return source, fetched, None

    sources = build_universe_sources(market, universe_id)
    fetched_results: list[tuple[SourceDefinition, list[Article], str | None]] = []
    with ThreadPoolExecutor(max_workers=min(16, max(1, len(sources)))) as executor:
        future_map = [executor.submit(fetch_one, source) for source in sources]
        for future in as_completed(future_map):
            fetched_results.append(future.result())

    fetched_results.sort(key=lambda item: item[0].id)
    for source, fetched, error in fetched_results:
        if error is not None:
            source_health.append({
                "source_id": source.id,
                "source_name": source.name,
                "ok": False,
                "article_count": 0,
                "error": error,
            })
            continue
        kept = 0
        for article in fetched:
            if _is_low_signal_google_article(article) or _is_low_signal_article(article):
                continue
            if source.focus_ticker:
                focus_terms = focus_terms_by_ticker.get(source.focus_ticker.upper(), [source.focus_ticker.lower()])
                if not _matches_focus_terms(article, focus_terms):
                    continue
            if source.lane == "broad":
                if not _matches_market_scope(article, market):
                    continue
                if _is_market_level_article(article) and _looks_finance_relevant(article):
                    pass  # market-level articles bypass the tracked-term filter
                else:
                    if not _matches_tracked_terms(article, tracked_terms):
                        continue
                    if not _looks_finance_relevant(article):
                        continue
                    title_lc = article.title.lower()
                    hit_count = _tracked_term_hit_count(article, tracked_terms)
                    if hit_count < 2 and not any(term in title_lc for term in tracked_terms):
                        continue
            if article.url in seen_urls:
                continue
            seen_urls.add(article.url)
            all_articles.append(article)
            kept += 1
        source_health.append({
            "source_id": source.id,
            "source_name": source.name,
            "ok": True,
            "article_count": kept,
            "error": "",
        })

    selected = _select_articles(all_articles, tracked_terms, max_articles=max_articles)
    return _hydrate_article_bodies(selected), source_health
