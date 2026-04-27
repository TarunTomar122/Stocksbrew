"""News ingest helpers for the small-universe intelligence pipeline."""
from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import replace
from typing import Callable
from urllib.parse import quote_plus, urlparse

from bs4 import BeautifulSoup
import requests

from backend.instrument_universe import list_instruments
from backend.market_strategy import build_ticker_sources
from backend.models import Article, SourceDefinition
from backend.rss import fetch_feed
from backend.source_registry import list_sources_for_market


GOOGLE_BROAD_QUERIES = {
    "US": [
        ("google-broad-us-market", "US stock market earnings guidance outlook news when:1d -wikipedia -pdf"),
        ("google-sector-us-technology", "US technology sector earnings guidance margins outlook news when:2d -wikipedia -pdf -statista -zippia -gitnux"),
        ("google-sector-us-consumer-discretionary", "US consumer discretionary sector earnings demand outlook news when:2d -wikipedia -pdf -statista -zippia -gitnux"),
        ("google-sector-us-industrials", "US industrials sector orders backlog capex outlook news when:2d -wikipedia -pdf -statista -zippia -gitnux"),
        ("google-sector-us-communication-services", "US communication services sector ad spending outlook earnings news when:2d -wikipedia -pdf -statista -zippia -gitnux"),
        ("google-sector-us-financials", "US financials sector earnings guidance credit outlook news when:2d -wikipedia -pdf -statista -zippia -gitnux"),
        ("google-sector-us-healthcare", "US healthcare sector approvals pipeline reimbursement outlook news when:2d -wikipedia -pdf -statista -zippia -gitnux"),
        ("google-sector-us-energy", "US energy sector production refining margins outlook news when:2d -wikipedia -pdf -statista -zippia -gitnux"),
    ],
    "IN": [
        ("google-broad-india-market", "India stock market earnings guidance outlook news when:1d -wikipedia -pdf"),
        ("google-sector-india-it", "India IT sector earnings guidance margins outlook news when:2d -wikipedia -pdf"),
        ("google-sector-india-financials", "India financial sector credit growth guidance outlook news when:2d -wikipedia -pdf"),
        ("google-sector-india-energy", "India energy sector production refining margins outlook news when:2d -wikipedia -pdf"),
        ("google-sector-india-pharma", "India pharma sector approvals pipeline outlook news when:2d -wikipedia -pdf"),
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

TRUSTED_SECTOR_SOURCE_HINTS = (
    "reuters",
    "ap",
    "associated press",
    "cnbc",
    "bloomberg",
    "wall street journal",
    "wsj",
    "s&p global",
    "morningstar",
    "charles schwab",
    "marketwatch",
    "financial times",
    "ft.com",
)

TRUSTED_SECTOR_DOMAIN_HINTS = (
    "reuters.com",
    "apnews.com",
    "cnbc.com",
    "bloomberg.com",
    "wsj.com",
    "spglobal.com",
    "morningstar.com",
    "schwab.com",
    "marketwatch.com",
    "ft.com",
)

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
    from backend.curated_fetcher import extract_url
    extracted = extract_url(article.url)
    if extracted.status != "ok":
        return ""
    return extracted.body_text


def _hydrate_article_bodies(articles: list[Article]) -> list[Article]:
    if not articles:
        return []

    hydrated: list[Article | None] = [None] * len(articles)

    def fetch_one(index: int, article: Article) -> tuple[int, Article]:
        if article.body_text:
            return index, article
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
        if source_id.startswith("google-sector-"):
            source_coverage_modes = ["sector"]
        elif source_id.startswith("google-broad-"):
            source_coverage_modes = ["market"]
        else:
            source_coverage_modes = ["market", "sector", "stock"]
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
                coverage_modes=source_coverage_modes,
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


def _is_sector_lane_article(article: Article) -> bool:
    return article.source_id.startswith("google-sector-")


def _is_trusted_sector_article(article: Article) -> bool:
    source_name = str(article.source_name or "").lower()
    domain = urlparse(str(article.url or "")).netloc.lower()
    if domain.startswith("www."):
        domain = domain[4:]
    return any(hint in source_name for hint in TRUSTED_SECTOR_SOURCE_HINTS) or any(
        hint in domain for hint in TRUSTED_SECTOR_DOMAIN_HINTS
    )


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
    all_market_sources = list_sources_for_market(market)
    broad_sources = [
        source
        for source in all_market_sources
        if source.lane == "broad" and source.kind in {"publisher", "regulator"}
    ]
    curated_sources = [source for source in all_market_sources if source.kind == "curated"]
    provider_set = (
        ["google_news", "google_news_price"]
        if market == "IN"
        else ["nasdaq", "seekingalpha", "google_news", "google_news_price"]
    )
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
    return broad_sources + curated_sources + _build_google_broad_sources(market) + core_sources


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


def collect_per_ticker_articles(
    market: str,
    universe_id: str,
    per_stock_cap: int = 5,
    broad_cap: int = 12,
    fetcher: Callable[[str], str] | None = None,
) -> tuple[list[Article], list[dict[str, object]]]:
    """Fetch articles partitioned per-ticker plus a small broad-lane bucket.

    The global pool approach (`collect_universe_articles`) pools every source
    into one article list and caps the total — which means popular tickers
    drown out quiet ones and the tail gets zero coverage.  This collector
    instead guarantees each AI-tier instrument gets its own article slice
    (`per_stock_cap` per ticker) while still pulling a small broad-lane bucket
    (`broad_cap`) so market- and sector-level briefs have material to work
    with.
    """
    instruments = list_instruments(market, universe_id)

    tracked_terms: list[str] = []
    focus_terms_by_ticker: dict[str, list[str]] = {}
    for instrument in instruments:
        instrument_terms = [instrument["ticker"].lower(), instrument["name"].lower()]
        tracked_terms.append(instrument["ticker"].lower())
        tracked_terms.append(instrument["name"].lower())
        for alias in instrument.get("aliases", []):
            alias_value = str(alias).lower()
            tracked_terms.append(alias_value)
            instrument_terms.append(alias_value)
        focus_terms_by_ticker[instrument["ticker"].upper()] = list(
            dict.fromkeys(term for term in instrument_terms if term)
        )
    tracked_terms = list(dict.fromkeys(term for term in tracked_terms if term))

    # Build per-ticker core-lane sources (reuses the existing ticker-source
    # factory so Google News / Nasdaq / SeekingAlpha feeds behave identically
    # to the pooled flow).
    provider_set = (
        ["google_news", "google_news_price"]
        if market == "IN"
        else ["nasdaq", "seekingalpha", "google_news", "google_news_price"]
    )
    ticker_entries = [
        {
            "ticker": instrument["ticker"],
            "display_name": instrument["name"],
            "aliases": instrument.get("aliases", []),
            "sector_tags": (
                [instrument.get("sector", "").strip().lower().replace(" ", "-")]
                if instrument.get("sector")
                else []
            ),
            "providers": provider_set,
            "max_items_per_source": 2,
            "max_age_hours": 72,
        }
        for instrument in instruments
    ]
    core_sources = build_ticker_sources(market, ticker_entries, lane="core")

    # Broad/market/sector sources — pulled from the market registry plus the
    # curated Google News broad/sector queries. Kept small intentionally: this
    # bucket only needs to feed the market brief and sector gates.
    all_market_sources = list_sources_for_market(market)
    broad_sources = [
        source
        for source in all_market_sources
        if source.lane == "broad" and source.kind in {"publisher", "regulator"}
    ]
    curated_sources = [source for source in all_market_sources if source.kind == "curated"]
    broad_bucket_sources = broad_sources + curated_sources + _build_google_broad_sources(market)

    all_sources = broad_bucket_sources + core_sources
    source_health: list[dict[str, object]] = []

    def fetch_one(source: SourceDefinition) -> tuple[SourceDefinition, list[Article], str | None]:
        try:
            if source.kind == "curated":
                from backend.curated_fetcher import fetch_curated
                fetched, _attempts = fetch_curated(source)
                return source, fetched, None
            fetched = fetch_feed(source, fetcher=fetcher)
        except Exception as error:
            return source, [], str(error)
        return source, fetched, None

    fetched_results: list[tuple[SourceDefinition, list[Article], str | None]] = []
    with ThreadPoolExecutor(max_workers=min(16, max(1, len(all_sources)))) as executor:
        futures = [executor.submit(fetch_one, source) for source in all_sources]
        for future in as_completed(futures):
            fetched_results.append(future.result())

    fetched_results.sort(key=lambda item: item[0].id)

    # Partition filtered articles into per-ticker buckets and a broad bucket.
    per_ticker_articles: dict[str, list[Article]] = defaultdict(list)
    broad_articles: list[Article] = []
    seen_urls: set[str] = set()

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
            if source.kind == "curated":
                if article.url in seen_urls:
                    continue
                seen_urls.add(article.url)
                broad_articles.append(article)
                kept += 1
                continue
            if _is_low_signal_google_article(article) or _is_low_signal_article(article):
                continue
            if _is_sector_lane_article(article) and not _is_trusted_sector_article(article):
                continue
            focus_ticker = (source.focus_ticker or "").upper()
            if focus_ticker:
                focus_terms = focus_terms_by_ticker.get(focus_ticker, [focus_ticker.lower()])
                if not _matches_focus_terms(article, focus_terms):
                    continue
                if article.url in seen_urls:
                    continue
                seen_urls.add(article.url)
                per_ticker_articles[focus_ticker].append(article)
                kept += 1
                continue
            # Broad/sector/curated lane — apply the same heuristic gate as the
            # pooled flow so the market-brief bucket stays clean.
            if source.lane == "broad":
                if not _matches_market_scope(article, market):
                    continue
                if _is_market_level_article(article) and _looks_finance_relevant(article):
                    pass
                else:
                    if _is_sector_lane_article(article) and _looks_finance_relevant(article):
                        pass
                    elif not _matches_tracked_terms(article, tracked_terms):
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
            broad_articles.append(article)
            kept += 1
        source_health.append({
            "source_id": source.id,
            "source_name": source.name,
            "ok": True,
            "article_count": kept,
            "error": "",
        })

    selected: list[Article] = []
    # Per-ticker slice — top N by priority for each instrument.
    for instrument in instruments:
        ticker = instrument["ticker"].upper()
        bucket = per_ticker_articles.get(ticker, [])
        bucket.sort(key=lambda item: article_priority(item, tracked_terms), reverse=True)
        selected.extend(bucket[:per_stock_cap])
    # Broad slice — top N by priority across the shared bucket.
    broad_articles.sort(key=lambda item: article_priority(item, tracked_terms), reverse=True)
    selected.extend(broad_articles[:broad_cap])

    # Final dedupe by URL in case the same article appeared in both buckets.
    deduped: list[Article] = []
    final_seen: set[str] = set()
    for article in selected:
        if article.url in final_seen:
            continue
        final_seen.add(article.url)
        deduped.append(article)

    return _hydrate_article_bodies(deduped), source_health


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
            if source.kind == "curated":
                from backend.curated_fetcher import fetch_curated
                fetched, _attempts = fetch_curated(source)
                return source, fetched, None
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
            # Curated articles are hand-vouched by the operator — they bypass the
            # broad-lane heuristics (market-scope, tracked-term, low-signal etc.)
            # that are meant to filter noisy RSS feeds.
            if source.kind == "curated":
                if article.url in seen_urls:
                    continue
                seen_urls.add(article.url)
                all_articles.append(article)
                kept += 1
                continue
            if _is_low_signal_google_article(article) or _is_low_signal_article(article):
                continue
            if _is_sector_lane_article(article) and not _is_trusted_sector_article(article):
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
                    if _is_sector_lane_article(article) and _looks_finance_relevant(article):
                        pass
                    elif not _matches_tracked_terms(article, tracked_terms):
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
