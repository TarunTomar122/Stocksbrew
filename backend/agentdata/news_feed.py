"""Fresh market and per-ticker headlines for ``tm_agent_news``.

The LLM news pipeline (``tm_news_runs``) stopped on 2026-05-11. This job is the
plain, keyless replacement for the headline stream: publisher RSS, SEC, Fed, FTC
and DOJ press releases for the market feed, and Yahoo Finance's per-symbol RSS
for the covered universe.

What gets stored per headline: title, source, URL, publish time, the publisher's
own excerpt (trimmed; never rewritten, never model-written), and the tickers the
headline names. Tickers come from a strict match only: an exchange tag such as
``(NASDAQ: AAPL)``, a cashtag such as ``$AAPL``, or the company's name as a whole
phrase. A bare ticker is never matched, and one-word names that are also ordinary
words (Target, Gap, Block...) are left out. A missed tag is better than a wrong one.

Documents use the field names the app's news loader already reads
(``title``, ``url``, ``source_name``, ``published_at``, ``stock_tickers``), so
``lib/news.ts`` can merge them in without a second schema. Ids are a hash of the
canonical URL, so reruns update in place. Nothing is deleted.

Run: ``python3 -m backend.agentdata.news_feed``
"""

from __future__ import annotations

import argparse
import hashlib
import html
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Iterable
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

from .feeds_common import (
    BROWSER_USER_AGENT,
    SEC_USER_AGENT,
    Fetcher,
    Instrument,
    WriteLedger,
    iso_now,
    load_universe,
    query,
    utc_now,
    write_changed,
)
from .store import DocStore

COLLECTION = "tm_agent_news"
META_PATH = "tm_agent_news_meta/US"
EXCERPT_LIMIT = 280
# "strict-v2": names count only in the headline (or the lead sentence for a per-ticker feed).
TICKER_MATCH_VERSION = "strict-v2"


@dataclass(frozen=True)
class Feed:
    key: str
    name: str
    url: str
    kind: str  # "publisher" | "official" | "press_release"
    user_agent: str = BROWSER_USER_AGENT


MARKET_FEEDS: tuple[Feed, ...] = (
    Feed("cnbc_finance", "CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", "publisher"),
    Feed("cnbc_earnings", "CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135", "publisher"),
    Feed("cnbc_markets", "CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258", "publisher"),
    Feed("cnbc_top", "CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", "publisher"),
    Feed("mw_top", "MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories", "publisher"),
    Feed("mw_pulse", "MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_marketpulse", "publisher"),
    Feed("seeking_alpha", "Seeking Alpha", "https://seekingalpha.com/market_currents.xml", "publisher"),
    Feed("investing", "Investing.com", "https://www.investing.com/rss/news_25.rss", "publisher"),
    Feed("prnewswire", "PR Newswire", "https://www.prnewswire.com/rss/news-releases-list.rss", "press_release"),
    Feed("sec_press", "SEC", "https://www.sec.gov/news/pressreleases.rss", "official", SEC_USER_AGENT),
    Feed("fed_press", "Federal Reserve", "https://www.federalreserve.gov/feeds/press_all.xml", "official", SEC_USER_AGENT),
    Feed("ftc_press", "FTC", "https://www.ftc.gov/feeds/press-release.xml", "official", SEC_USER_AGENT),
    Feed("doj_press", "Department of Justice", "https://www.justice.gov/news/rss?type=press_release&m=1", "official", SEC_USER_AGENT),
    Feed("bls", "Bureau of Labor Statistics", "https://www.bls.gov/feed/bls_latest.rss", "official", SEC_USER_AGENT),
)

_YAHOO_TICKER_FEED = "https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US"

# -- ticker matching ----------------------------------------------------------

_EXCHANGE_TAG = re.compile(
    r"\(\s*(?:NASDAQ|Nasdaq|NYSE(?:\s+American|\s+Arca)?|AMEX|NYSEAMERICAN|NasdaqGS|NasdaqGM|NasdaqCM)\s*:\s*([A-Za-z][A-Za-z.\-]{0,6})\s*\)"
)
_CASHTAG = re.compile(r"(?<![A-Za-z0-9$])\$([A-Z][A-Z.\-]{0,5})(?![A-Za-z0-9])")
_SUFFIXES = re.compile(
    r"(?:,?\s+(?:Inc|Incorporated|Corp|Corporation|Company|Co|Ltd|Limited|PLC|plc|N\.?V|S\.?A|AG|SE|LLC|L\.?P|"
    r"Holdings?|Group|Class\s+[A-C]|Common\s+Stock|\(The\)|& Co))\.?$"
)
# One-word names and aliases that are also everyday words, places, people or other
# entities. Matching them as a company would tag the wrong headlines.
_AMBIGUOUS_SINGLE = {
    "abbott", "american", "ball", "bank", "block", "booking", "boston", "brady", "buckle", "bullish",
    "cadence", "capital", "cardinal", "carlyle", "carnival", "celsius", "chase", "citizens", "coach",
    "coherent", "corning", "crane", "crown", "diodes", "discover", "dominion", "donaldson", "dover", "dow",
    "dreamland", "eaton", "edison", "elastic", "enact", "energy", "ensign", "equitable", "everest", "first",
    "franklin", "frontier", "gap", "gartner", "gates", "general", "global", "graco", "griffon", "harmonic",
    "hawkins", "hess", "horizon", "intercontinental", "intuitive", "jacobs", "key", "liberty", "life",
    "lincoln", "loews", "lowe's", "match", "merlin", "meta", "modine", "monro", "mosaic", "nasdaq",
    "national", "open", "ouster", "philip", "pinnacle", "pool", "power", "premier", "procter",
    "progressive", "prudential", "public", "realty", "recursion", "reddit", "regions", "republic", "ross",
    "samsara", "sealed", "shell", "simon", "sirius", "snap", "snowflake", "southern", "sprout", "square",
    "stride", "summit", "super", "target", "texas", "thermo", "toast", "trade", "travelers", "tyson",
    "united", "unity", "unum", "vertex", "visa", "vulcan", "waters", "williams", "wynn", "zions", "zoom",
}


def strip_suffixes(name: str) -> str:
    """``Apple Inc.`` -> ``Apple``; ``Meta Platforms, Inc.`` -> ``Meta Platforms``."""
    out = " ".join(name.replace("’", "'").split()).strip(" ,.")
    for _ in range(4):
        trimmed = _SUFFIXES.sub("", out).strip(" ,.")
        if trimmed == out or not trimmed:
            break
        out = trimmed
    return out


# Everyday names a company goes by that its listing name does not contain. Kept short
# and unambiguous on purpose: each entry is a brand that only ever means this company.
_EXTRA_NAMES: dict[str, tuple[str, ...]] = {
    "GOOG": ("Google",),
    "GOOGL": ("Google",),
    "JPM": ("JPMorgan",),
}

# A name followed by one of these words is a different company: Merck KGaA is not Merck & Co.
_OTHER_COMPANY_AFTER: dict[str, tuple[str, ...]] = {
    "Merck": ("KGaA",),
}

# Banks and brokers turn up in headlines as the source of an opinion ("Jefferies lifts its
# target", "Morgan Stanley says the correction is ending") far more often than as the subject.
_BROKERS = {"JEF", "MS", "GS", "JPM", "C", "BAC", "WFC", "EVR", "HLI", "UBS", "BLK"}
_OPINION_AFTER = re.compile(
    r"^(?:['’]s)?(?:\s+(?:analysts?|strategists?|economists?|CEO|chief|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))?\s+"
    r"(?i:says|said|sees|saw|highlights|lifts|raises|cuts|lowers|trims\s+(?:its\s+)?target|upgrades|downgrades|initiates|reiterates|"
    r"warns|calls|expects|predicts|likes|argues|sends|names|picks|thinks|forecasts|turns|flags|backs|prefers|estimates|"
    r"recommends|tells|believes|projects|is\s+bullish|is\s+bearish)\b"
)
_OPINION_BEFORE = re.compile(r"(?:\b(?:as|per|from|by|says|according\s+to)\s+)$", re.IGNORECASE)
_CONFERENCE_AFTER = re.compile(r"^(?:\s+[A-Z0-9][\w&.-]*){0,4}\s+(?:Conference|Summit|Symposium|Forum)\b")
# Research-firm boilerplate: "Global X Market Report 2026 ... Featuring Thermo Fisher, Merck...".
_MARKET_REPORT = re.compile(
    r"\b(?:market|industry)\b.{0,60}\b(?:report|forecast|outlook|analysis|size|share)\b.{0,80}(?:\b20\d\d\b|CAGR)|\bCAGR\b"
    r"|\bGlobal\b.{0,80}\b(?:Strategic\s+)?(?:Business|Market|Industry)\s+Report\b",
    re.IGNORECASE,
)

# All-caps words in a headline that are never a ticker mention, even when a listing uses them.
_CAPS_STOPWORDS = {
    "AI", "CEO", "CFO", "CTO", "ETF", "ETFS", "IPO", "USA", "GDP", "CPI", "PPI", "PCE", "FDA", "SEC", "FTC", "DOJ",
    "FBI", "EU", "UK", "US", "NYSE", "EPS", "ESG", "EV", "EVS", "OPEC", "IRS", "NFL", "NBA", "TV", "CEOS", "ONE", "NOW",
    "ALL", "IT", "ON", "AN", "OR", "BE", "ARE", "NEW", "BIG", "WELL", "LOW", "HIGH", "KEY", "CASH", "REAL", "FAST",
}


def name_phrases(instrument: Instrument) -> list[str]:
    """Company-name phrases safe to match as a whole phrase in a headline."""
    phrases: list[str] = []
    for raw in (instrument.name, *instrument.aliases, *_EXTRA_NAMES.get(instrument.ticker.upper(), ())):
        raw = raw.strip()
        if not raw or raw.upper() == instrument.ticker.upper() or raw.upper() == raw and len(raw) <= 6:
            continue  # the ticker itself, or a ticker-shaped alias
        stripped = strip_suffixes(raw)
        variants = {raw.strip(" ,."), stripped}
        if stripped.startswith("The ") and len(stripped.split()) >= 3:
            variants.add(stripped[4:])  # "The Goldman Sachs" is written "Goldman Sachs"
        for candidate in variants:
            words = candidate.split()
            if not words or len(candidate) < 4:
                continue
            if len(words) == 1:
                lowered = candidate.lower()
                if not candidate[0].isupper() or len(candidate) < 5:
                    continue
                if lowered in _AMBIGUOUS_SINGLE:
                    continue
            if candidate not in phrases:
                phrases.append(candidate)
            # Publishers write "NVIDIA" as "Nvidia": an all-caps brand also matches in title case.
            if len(words) == 1 and candidate.isupper() and len(candidate) >= 5:
                titled = candidate.title()
                if titled.lower() not in _AMBIGUOUS_SINGLE and titled not in phrases:
                    phrases.append(titled)
    return phrases


_LEAD_PREFIX = re.compile(
    r"^(?:Key\s*Takeaways|Investing\.com\s*[-–—]+|[A-Z][A-Za-z.,&' ]{2,60}\((?:AP|Reuters|GLOBE NEWSWIRE|PRNewswire|BUSINESS WIRE)\)\s*[-–—]+|"
    r"[A-Z][A-Za-z.,' ]{2,40},\s+(?:[A-Z][a-z]+\.?\s+\d{1,2},\s+\d{4})\s*(?:\([^)]*\))?\s*[-–—/]+(?:PRNewswire/\s*[-–—]+)?)\s*"
)


def _lead_subject(text: str) -> str:
    """The opening words of a description, after the "Key Takeaways" label or a dateline:
    where a publisher puts the company the story is about."""
    out = text.strip()
    for _ in range(3):
        trimmed = _LEAD_PREFIX.sub("", out, count=1).strip()
        if trimmed == out:
            break
        out = trimmed
    return out[:60]


class TickerMatcher:
    """Strict headline -> tickers matching for one universe."""

    def __init__(self, universe: Iterable[Instrument]) -> None:
        self._by_symbol: dict[str, str] = {}
        phrase_owner: dict[str, str | None] = {}
        for instrument in universe:
            key = re.sub(r"[^A-Z0-9]", "", instrument.ticker.upper())
            self._by_symbol[key] = instrument.ticker
            for phrase in name_phrases(instrument):
                # Two listings sharing a phrase (GOOG/GOOGL share "Alphabet"): keep the first,
                # which is alphabetical and stable; a phrase is never ambiguous across companies
                # unless the names collide, in which case drop it.
                if phrase in phrase_owner and phrase_owner[phrase] != instrument.ticker:
                    owner = phrase_owner[phrase]
                    if owner and _same_company(owner, instrument.ticker):
                        continue
                    phrase_owner[phrase] = None
                else:
                    phrase_owner[phrase] = instrument.ticker
        self._phrases = {phrase: ticker for phrase, ticker in phrase_owner.items() if ticker}
        ordered = sorted(self._phrases, key=len, reverse=True)
        self._phrase_re = (
            re.compile(r"(?<![A-Za-z0-9])(" + "|".join(re.escape(p) for p in ordered) + r")(?![A-Za-z0-9])")
            if ordered
            else None
        )

    def match(self, text: str) -> list[str]:
        """Every ticker the text names by exchange tag, cashtag or whole company name."""
        found: list[str] = []
        self._explicit(text, found)
        self._named(text, found)
        return found

    def match_story(self, title: str, description: str = "", *, target: str | None = None) -> list[str]:
        """The tickers a story is about.

        A company counts when the headline names it, or when the publisher tags it
        explicitly anywhere ("(NASDAQ: AAPL)", "$AAPL"). A name that only turns up in
        the description is usually background ("five months after Elon Musk took SpaceX
        public"), so it does not count. The one exception is ``target``, the symbol a
        per-ticker feed was read for: the feed already says the story is about it, so
        the headline using its symbol, or the description opening with its name,
        is enough.
        """
        found: list[str] = []
        self._explicit(title, found)
        if not _MARKET_REPORT.search(title):
            self._named(title, found, as_subject=True)
        self._explicit(description, found)
        if target and target not in found:
            key = re.sub(r"[^A-Z0-9]", "", target.upper())
            symbol = target.upper()
            in_title = (
                len(key) >= 3
                and symbol not in _CAPS_STOPWORDS
                and re.search(r"(?<![A-Za-z0-9$])" + re.escape(symbol) + r"(?![A-Za-z0-9])", title) is not None
            )
            lead: list[str] = []
            # Banks are named in a lead mostly as the analyst ("Bank of America has downgraded..."), so they need the headline.
            if target not in _BROKERS and not _MARKET_REPORT.search(title):
                # The name has to open the description ("Shares of Airbnb...", "Hims & Hers Health, Inc. ..."),
                # not turn up later as a peer or partner.
                self._named(_lead_subject(description), lead, as_subject=True, max_start=12)
            if in_title or target in lead:
                found.append(target)
        return found

    def _explicit(self, text: str, found: list[str]) -> None:
        for pattern in (_EXCHANGE_TAG, _CASHTAG):
            for raw in pattern.findall(text):
                ticker = self._by_symbol.get(re.sub(r"[^A-Z0-9]", "", raw.upper()))
                if ticker and ticker not in found:
                    found.append(ticker)

    def _named(self, text: str, found: list[str], *, as_subject: bool = False, max_start: int | None = None) -> None:
        """Tickers named by company name. With ``as_subject``, a bank quoted for its view
        or a broker hosting a conference does not count as a story about that bank."""
        if self._phrase_re is None:
            return
        for hit in self._phrase_re.finditer(text):
            if max_start is not None and hit.start() > max_start:
                break
            phrase = hit.group(1)
            ticker = self._phrases.get(phrase)
            if not ticker or ticker in found:
                continue
            after = text[hit.end() :]
            if any(after.lstrip().startswith(word) for word in _OTHER_COMPANY_AFTER.get(phrase, ())):
                continue
            if as_subject and ticker in _BROKERS:
                before = text[: hit.start()]
                if _OPINION_AFTER.match(after) or _OPINION_BEFORE.search(before) or _CONFERENCE_AFTER.match(after):
                    continue
            found.append(ticker)


def _same_company(a: str, b: str) -> bool:
    """GOOG/GOOGL, BRK.A/BRK.B: share-class siblings."""
    a, b = a.upper(), b.upper()
    short, long_ = sorted((a, b), key=len)
    return long_.startswith(short) or a.split(".")[0] == b.split(".")[0]


# -- rss parsing --------------------------------------------------------------

_TAG = re.compile(r"<[^>]+>")
_TRACKING = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "cmpid", "mod", "tsrc", ".tsrc", "src"}


def clean_text(raw: str | None) -> str:
    text = html.unescape(_TAG.sub(" ", html.unescape(raw or "")))
    return " ".join(text.split())


def excerpt(raw: str | None, title: str) -> str:
    """The publisher's own description, trimmed. Empty when it only repeats the title."""
    text = clean_text(raw)
    if not text or text.lower().startswith(title.lower()[:60]) and len(text) < len(title) + 40:
        return ""
    if len(text) <= EXCERPT_LIMIT:
        return text
    cut = text[:EXCERPT_LIMIT].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return f"{cut}…"


def canonical_url(url: str) -> str:
    parts = urlsplit(url.strip())
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return ""
    params = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() not in _TRACKING]
    return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path, urlencode(params), ""))


def parse_time(raw: str | None) -> datetime | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        parsed = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def parse_feed(body: str) -> list[dict[str, Any]]:
    """RSS 2.0 or Atom -> [{title, url, published, description}]. Bad XML -> []."""
    try:
        root = ET.fromstring(body.lstrip("﻿ \n\r\t"))
    except ET.ParseError:
        return []
    items: list[dict[str, Any]] = []
    for node in root.iter():
        if _local(node.tag) not in {"item", "entry"}:
            continue
        fields: dict[str, str] = {}
        link = ""
        for child in node:
            name = _local(child.tag)
            if name == "link":
                link = link or (child.text or "").strip() or child.attrib.get("href", "").strip()
            elif name in {"title", "description", "summary", "pubdate", "published", "updated", "date"}:
                fields.setdefault(name, child.text or "")
        title = clean_text(fields.get("title"))
        url = canonical_url(link)
        published = parse_time(fields.get("pubdate") or fields.get("published") or fields.get("date") or fields.get("updated"))
        if not title or not url or published is None:
            continue
        items.append(
            {
                "title": title,
                "url": url,
                "published": published,
                "description": fields.get("description") or fields.get("summary") or "",
            }
        )
    return items


def doc_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:24]


def build_doc(
    item: dict[str, Any],
    *,
    source_name: str,
    source_kind: str,
    feed_key: str,
    tickers: list[str],
    now_iso: str,
) -> dict[str, Any]:
    return {
        "id": doc_id(item["url"]),
        "market": "US",
        "title": item["title"],
        "url": item["url"],
        "source_name": source_name,
        "source_kind": source_kind,
        "feed": feed_key,
        "published_at": item["published"].isoformat(),
        # Publisher text, trimmed. Not a model summary.
        "summary": excerpt(item["description"], item["title"]),
        "summary_origin": "publisher_excerpt",
        "stock_tickers": tickers,
        "ticker_match": TICKER_MATCH_VERSION,
        "captured_at": now_iso,
    }


def run(
    *,
    days: int = 14,
    skip_tickers: bool = False,
    ticker_limit: int | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    store = DocStore.from_env()
    universe = load_universe(store)
    matcher = TickerMatcher(universe)
    now = utc_now()
    now_iso = iso_now()
    cutoff = now - timedelta(days=days)
    horizon = now + timedelta(hours=6)  # ignore feeds with broken future dates

    docs: dict[str, dict[str, Any]] = {}
    per_source: dict[str, int] = {}
    failed_feeds: list[str] = []

    def keep(item: dict[str, Any]) -> bool:
        return cutoff <= item["published"] <= horizon

    def merge(doc: dict[str, Any]) -> None:
        existing = docs.get(doc["id"])
        if existing is None:
            docs[doc["id"]] = doc
            per_source[doc["source_name"]] = per_source.get(doc["source_name"], 0) + 1
            return
        for ticker in doc["stock_tickers"]:
            if ticker not in existing["stock_tickers"]:
                existing["stock_tickers"].append(ticker)

    fetchers: dict[str, Fetcher] = {}
    for feed in MARKET_FEEDS:
        fetcher = fetchers.setdefault(
            feed.user_agent,
            Fetcher("news_rss", user_agent=feed.user_agent, min_interval=0.4, ttl=600, timeout=20),
        )
        body = fetcher.get(feed.url)
        items = parse_feed(body) if body else []
        if not items:
            failed_feeds.append(feed.key)
            continue
        for item in items:
            if not keep(item):
                continue
            tickers = matcher.match_story(item["title"], clean_text(item["description"]))
            merge(build_doc(item, source_name=feed.name, source_kind=feed.kind, feed_key=feed.key, tickers=tickers, now_iso=now_iso))

    market_count = len(docs)
    ticker_feeds = 0
    ticker_feed_failures = 0
    if not skip_tickers:
        # Yahoo answers a descriptive client and throttles browser-shaped ones.
        yahoo = Fetcher("news_yahoo", user_agent=SEC_USER_AGENT, min_interval=0.3, ttl=900, timeout=20, attempts=2)
        targets = universe[:ticker_limit] if ticker_limit else universe
        misses = 0
        for instrument in targets:
            if misses >= 12:
                # Throttled or down: stop asking instead of hammering 800 symbols.
                ticker_feed_failures += len(targets) - ticker_feeds - ticker_feed_failures
                failed_feeds.append("yahoo_ticker: stopped after 12 failures in a row")
                break
            symbol = instrument.ticker.replace(".", "-")
            body = yahoo.get(_YAHOO_TICKER_FEED.format(symbol=quote(symbol)))
            if body is None:
                misses += 1
                ticker_feed_failures += 1
                continue
            misses = 0
            ticker_feeds += 1
            for item in parse_feed(body):
                if not keep(item):
                    continue
                tickers = matcher.match_story(item["title"], clean_text(item["description"]), target=instrument.ticker)
                # Yahoo's symbol feed also carries loosely related stories. Keep a
                # headline only when it names this company by the strict rules.
                if instrument.ticker not in tickers:
                    continue
                merge(
                    build_doc(
                        item,
                        source_name="Yahoo Finance",
                        source_kind="publisher",
                        feed_key="yahoo_ticker",
                        tickers=tickers,
                        now_iso=now_iso,
                    )
                )
        failed_feeds.extend(yahoo.failures[:5])

    writes = [(f"{COLLECTION}/{doc['id']}", doc) for doc in docs.values()]
    tagged = sum(1 for doc in docs.values() if doc["stock_tickers"])
    covered = {ticker for doc in docs.values() for ticker in doc["stock_tickers"]}
    newest = max((doc["published_at"] for doc in docs.values()), default=None)
    written = 0
    if not dry_run and writes:
        written = write_changed(store, WriteLedger("news_feed"), writes, merge=True)
        store.set(
            META_PATH,
            {
                "market": "US",
                "updated_at": now_iso,
                "newest_published_at": newest,
                "window_days": days,
                "headlines_in_window": len(docs),
                "tagged_headlines": tagged,
                "tickers_with_headlines": len(covered),
                "sources": dict(sorted(per_source.items())),
                "failed_feeds": failed_feeds,
                "method": "publisher and official RSS; tickers by exchange tag, cashtag or whole company name",
            },
            merge=True,
        )
    return {
        "headlines": len(docs),
        "market_feed": market_count,
        "ticker_feed_added": len(docs) - market_count,
        "tagged": tagged,
        "tickers_with_headlines": len(covered),
        "ticker_feeds_read": ticker_feeds,
        "ticker_feed_failures": ticker_feed_failures,
        "sources": per_source,
        "failed_feeds": failed_feeds,
        "newest": newest,
        "written": written,
    }


def retag_doc(matcher: TickerMatcher, doc: dict[str, Any]) -> list[str]:
    """Tags for a stored headline under the current rule, from its title and stored excerpt.

    A per-ticker (Yahoo) row does not record which symbol it was read for, but that
    symbol had to be among its tags, so each existing tag gets the per-ticker benefit.
    """
    title = str(doc.get("title") or "")
    description = str(doc.get("summary") or "")
    previous = [str(t) for t in doc.get("stock_tickers") or []]
    tickers = matcher.match_story(title, description)
    if doc.get("feed") == "yahoo_ticker":
        for ticker in previous:
            if ticker not in tickers and ticker in matcher.match_story(title, description, target=ticker):
                tickers.append(ticker)
    return tickers


def retag(*, days: int = 14, dry_run: bool = False) -> dict[str, Any]:
    """Re-apply the current tag rule to stored headlines. Only the tag fields change;
    the earlier tags are kept beside them in ``stock_tickers_previous``."""
    store = DocStore.from_env()
    matcher = TickerMatcher(load_universe(store))
    cutoff = (utc_now() - timedelta(days=days)).isoformat()
    rows = query(store, COLLECTION, filters=[("published_at", ">=", cutoff)], limit=10000)
    writes: list[tuple[str, dict[str, Any]]] = []
    removed = added = 0
    for path, doc in rows:
        if doc.get("ticker_match") == TICKER_MATCH_VERSION:
            continue
        before = [str(t) for t in doc.get("stock_tickers") or []]
        after = retag_doc(matcher, doc)
        removed += len(set(before) - set(after))
        added += len(set(after) - set(before))
        patch: dict[str, Any] = {"stock_tickers": after, "ticker_match": TICKER_MATCH_VERSION}
        if set(after) != set(before):
            patch["stock_tickers_previous"] = before
        writes.append((path, patch))
    if not dry_run and writes:
        store.set_many(writes, merge=True)
    return {"checked": len(rows), "retagged": len(writes), "tags_removed": removed, "tags_added": added, "written": 0 if dry_run else len(writes)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--days", type=int, default=14, help="ignore headlines older than this")
    parser.add_argument("--skip-tickers", action="store_true", help="market feeds only")
    parser.add_argument("--ticker-limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--retag", action="store_true", help="re-apply the tag rule to stored headlines, then stop")
    args = parser.parse_args()
    if args.retag:
        print(f"[news_feed] retag {retag(days=args.days, dry_run=args.dry_run)}", flush=True)
        return
    stats = run(days=args.days, skip_tickers=args.skip_tickers, ticker_limit=args.ticker_limit, dry_run=args.dry_run)
    print(f"[news_feed] {stats}", flush=True)


if __name__ == "__main__":
    main()
