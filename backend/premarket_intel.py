"""Shared helpers for the pre-market intelligence pipeline."""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.subscription_entitlement import is_pro_user
from backend.models import Article
from backend.storage import TraceMoneyStore

PREMARKET_GAP_THRESHOLD = 0.15
MOVER_GAP_THRESHOLD = 2.0
CONTEXT_MOVER_LIMIT = 15
EMAIL_CONTEXT_PER_USER_LIMIT = 8
EMAIL_CONTEXT_TICKER_LIMIT = 40

_AMBIGUOUS_TICKERS = {
    "A",
    "AI",
    "ALL",
    "ARE",
    "CAR",
    "FOR",
    "IT",
    "NOW",
    "ON",
    "OPEN",
    "SO",
}
_COMPANY_NOISE_WORDS = {
    "adr",
    "class",
    "company",
    "corp",
    "corporation",
    "group",
    "holding",
    "holdings",
    "inc",
    "incorporated",
    "limited",
    "ltd",
    "plc",
    "sponsored",
    "technologies",
    "technology",
}


def parse_iso(value: Any) -> datetime | None:
    s = str(value or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def sector_summary_from_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        sector = str(row.get("sector") or "Other").strip() or "Other"
        try:
            gap = float(row.get("pre_market_change_pct") or 0)
        except (TypeError, ValueError):
            continue
        buckets[sector].append(gap)

    summary: list[dict[str, Any]] = []
    for sector, gaps in buckets.items():
        if not gaps:
            continue
        avg = sum(gaps) / len(gaps)
        summary.append({
            "sector": sector,
            "avg_gap_pct": round(avg, 2),
            "count": len(gaps),
        })
    summary.sort(key=lambda item: abs(float(item["avg_gap_pct"])), reverse=True)
    return summary[:8]


def mover_tickers_from_snapshot(
    premarket: dict[str, Any] | None,
    *,
    min_gap: float = MOVER_GAP_THRESHOLD,
    limit: int = CONTEXT_MOVER_LIMIT,
) -> list[str]:
    premarket = premarket or {}
    seen: set[str] = set()
    ordered: list[tuple[str, float]] = []

    for row in list(premarket.get("gappers_up") or []) + list(premarket.get("gappers_down") or []):
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker or ticker in seen:
            continue
        gap = abs(float(row.get("pre_market_change_pct") or 0))
        if gap < min_gap:
            continue
        seen.add(ticker)
        ordered.append((ticker, gap))

    by_ticker = premarket.get("by_ticker") or {}
    if isinstance(by_ticker, dict):
        for ticker, hit in by_ticker.items():
            sym = str(ticker or "").strip().upper()
            if not sym or sym in seen:
                continue
            if not isinstance(hit, dict):
                continue
            gap = abs(float(hit.get("pre_market_change_pct") or 0))
            if gap < min_gap:
                continue
            seen.add(sym)
            ordered.append((sym, gap))

    ordered.sort(key=lambda item: item[1], reverse=True)
    return [ticker for ticker, _gap in ordered[:limit]]


def subscriber_book_mover_tickers(
    store: TraceMoneyStore,
    premarket: dict[str, Any] | None,
    *,
    min_gap: float = PREMARKET_GAP_THRESHOLD,
    per_user_limit: int = EMAIL_CONTEXT_PER_USER_LIMIT,
    limit: int = EMAIL_CONTEXT_TICKER_LIMIT,
) -> list[str]:
    """Return live movers that can appear in subscriber email news rows.

    The email renders at most ``per_user_limit`` book movers per subscriber.
    Building context for that exact union keeps the time-critical pre-market
    path bounded without dropping personalized catalyst lines.
    """
    by_ticker = (premarket or {}).get("by_ticker") or {}
    if not isinstance(by_ticker, dict) or not by_ticker:
        return []

    ranked: dict[str, float] = {}
    for user in store.list_subscribed_users():
        if not is_pro_user(user) or user.get("email_digest_enabled") is False:
            continue
        uid = str(user.get("uid") or "").strip()
        if not uid:
            continue
        rows = list((store.get_watchlist_view(uid) or {}).get("rows") or [])
        user_hits: list[tuple[str, float]] = []
        for row in rows:
            ticker = str((row or {}).get("ticker") or "").strip().upper()
            hit = by_ticker.get(ticker)
            if not ticker or not isinstance(hit, dict):
                continue
            gap = abs(float(hit.get("pre_market_change_pct") or 0))
            if gap < min_gap:
                continue
            user_hits.append((ticker, gap))
        user_hits.sort(key=lambda item: item[1], reverse=True)
        for ticker, gap in user_hits[: max(0, per_user_limit)]:
            ranked[ticker] = max(ranked.get(ticker, 0.0), gap)

    ordered = sorted(ranked.items(), key=lambda item: (-item[1], item[0]))
    return [ticker for ticker, _gap in ordered[: max(0, limit)]]


def _company_reference_terms(company_name: str) -> list[str]:
    terms = [
        token.lower()
        for token in re.findall(r"[A-Za-z0-9]+", str(company_name or ""))
        if token.lower() not in _COMPANY_NOISE_WORDS
    ]
    return [term for term in terms if len(term) >= 4 or any(char.isdigit() for char in term)]


def context_row_matches_ticker(
    row: dict[str, Any],
    ticker: str,
    company_name: str = "",
) -> bool:
    """Require visible evidence that a context row is about the claimed stock.

    Some company-news APIs occasionally return market-wide or wrong-company
    stories for a symbol. Email is a trust-sensitive surface, so metadata alone
    is not enough: the raw headline/detail must name the ticker or company.
    """
    if not isinstance(row, dict):
        return False
    sym = str(ticker or "").strip().upper()
    if not sym:
        return False
    raw_text = " ".join(
        str(row.get(key) or "")
        for key in ("headline", "why", "summary", "article_overview", "body_text")
    )
    if not raw_text.strip():
        return False

    if sym not in _AMBIGUOUS_TICKERS:
        symbol_pattern = re.compile(rf"(?<![A-Z0-9]){re.escape(sym)}(?![A-Z0-9])")
        if symbol_pattern.search(raw_text):
            return True

    lowered = raw_text.lower()
    for term in _company_reference_terms(company_name):
        if re.search(rf"\b{re.escape(term)}\b", lowered):
            return True
    return False


def _article_mentions_ticker(
    article: Article,
    ticker: str,
    *,
    company_name: str = "",
) -> bool:
    sym = ticker.upper()
    article_row = {
        "headline": article.title,
        "why": article.summary,
        "body_text": article.body_text,
    }
    if context_row_matches_ticker(article_row, sym, company_name):
        return True
    if company_name:
        return False
    # Finnhub's company-news endpoint can return generic or wrong-company
    # stories. Its requested symbol is therefore not proof of relevance.
    if str(article.source_id or "").strip().lower() == "finnhub":
        return False
    focus = str(getattr(article, "focus_ticker", "") or "").strip().upper()
    if focus == sym:
        return True
    for raw in getattr(article, "stock_tickers", []) or []:
        if str(raw or "").strip().upper() == sym:
            return True
    pattern = re.compile(rf"\b{re.escape(sym)}\b", re.IGNORECASE)
    blob = f"{article.title} {article.summary} {article.body_text}"
    return bool(pattern.search(blob))


def score_article_for_ticker(
    article: Article,
    ticker: str,
    *,
    company_name: str = "",
    now: datetime | None = None,
) -> float:
    now = now or datetime.now(timezone.utc)
    sym = ticker.upper()
    score = 0.0
    title = str(article.title or "")
    if sym in title.upper():
        score += 12.0
    if _article_mentions_ticker(article, sym, company_name=company_name):
        score += 4.0
    published = parse_iso(article.published_at)
    if published:
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        age_hours = max(0.0, (now - published).total_seconds() / 3600.0)
        score += max(0.0, 16.0 - age_hours)
    summary = str(article.summary or "")
    if summary:
        score += min(3.0, len(summary) / 120.0)
    source = str(article.source_name or "").lower()
    if any(bad in source for bad in ("marketbeat", "defense world", "etf daily")):
        score -= 4.0
    return score


def pick_best_article(
    articles: list[Article],
    ticker: str,
    *,
    company_name: str = "",
) -> Article | None:
    matches = [
        article
        for article in articles
        if _article_mentions_ticker(article, ticker, company_name=company_name)
    ]
    if not matches:
        return None
    matches.sort(
        key=lambda article: score_article_for_ticker(
            article,
            ticker,
            company_name=company_name,
        ),
        reverse=True,
    )
    return matches[0]


def article_to_context_row(
    article: Article,
    *,
    ticker: str = "",
    company_name: str = "",
) -> dict[str, Any]:
    why = (
        str(getattr(article, "article_overview", "") or "").strip()
        or str(article.summary or "").strip()
        or str(article.title or "").strip()
    )
    row = {
        "headline": str(article.title or "").strip(),
        "why": why,
        "source": str(article.source_name or "").strip()[:80],
        "published_at": str(article.published_at or ""),
        "url": str(article.url or "").strip(),
    }
    if ticker:
        row["ticker"] = ticker.upper()
        row["company"] = company_name
        row["relevance_verified"] = context_row_matches_ticker(row, ticker, company_name)
    return row


def _entity_mention_for_ticker(row: dict[str, Any], ticker: str) -> dict[str, Any] | None:
    sym = ticker.upper()
    for mention in row.get("entity_mentions") or []:
        if not isinstance(mention, dict):
            continue
        if str(mention.get("ticker") or "").strip().upper() == sym:
            return mention
    return None


def enrichment_row_for_ticker(
    row: dict[str, Any],
    ticker: str,
    *,
    company_name: str = "",
) -> bool:
    sym = ticker.upper()
    if company_name and not context_row_matches_ticker(row, sym, company_name):
        return False
    for mention in row.get("entity_mentions") or []:
        if not isinstance(mention, dict):
            continue
        if str(mention.get("ticker") or "").strip().upper() == sym:
            return True
    for raw in row.get("stock_tickers") or []:
        if str(raw or "").strip().upper() == sym:
            return True
    title = str(row.get("title") or "")
    return sym in title.upper()


def pick_best_enrichment(
    enrichments: list[dict[str, Any]],
    ticker: str,
    *,
    cutoff: datetime | None = None,
    company_name: str = "",
) -> dict[str, Any] | None:
    sym = ticker.upper()
    candidates: list[tuple[float, dict[str, Any]]] = []
    now = datetime.now(timezone.utc)
    for row in enrichments:
        if not enrichment_row_for_ticker(row, sym, company_name=company_name):
            continue
        published = parse_iso(row.get("published_at"))
        if cutoff and published:
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
            if published < cutoff:
                continue
        title = str(row.get("title") or "")
        score = 0.0
        if sym in title.upper():
            score += 12.0
        if published:
            age_hours = max(0.0, (now - published).total_seconds() / 3600.0)
            score += max(0.0, 16.0 - age_hours)
        candidates.append((score, row))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    best = candidates[0][1]
    mention = _entity_mention_for_ticker(best, sym)
    why = ""
    if mention:
        why = (
            str(mention.get("what_happened") or "").strip()
            or str(mention.get("why_it_matters") or "").strip()
        )
    if not why:
        why = (
            str(best.get("what_happened") or "").strip()
            or str(best.get("article_overview") or "").strip()
            or str(best.get("summary") or "").strip()
        )
    context_row = {
        "headline": str(best.get("title") or "").strip(),
        "why": why,
        "source": str(best.get("source_name") or "").strip()[:80],
        "published_at": str(best.get("published_at") or ""),
        "url": str(best.get("url") or "").strip(),
        "ticker": sym,
        "company": company_name,
    }
    context_row["relevance_verified"] = context_row_matches_ticker(
        context_row,
        sym,
        company_name,
    )
    return context_row


def overnight_headlines_by_ticker(
    store: TraceMoneyStore,
    *,
    market: str,
    universe_id: str,
    tickers: list[str],
    lookback_hours: int = 14,
    company_by_ticker: dict[str, str] | None = None,
    gap_by_ticker: dict[str, float] | None = None,
) -> dict[str, dict[str, Any]]:
    if not tickers:
        return {}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, lookback_hours))
    enrichments = store.list_article_enrichments(market, universe_id, limit=400)
    out: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        row = pick_best_enrichment(
            enrichments,
            ticker,
            cutoff=cutoff,
            company_name=(company_by_ticker or {}).get(ticker.upper(), ""),
        )
        if row and row.get("headline"):
            out[ticker.upper()] = row
    if out:
        from backend.premarket_tape_llm import enrich_context_with_tape_lines

        enrich_context_with_tape_lines(
            store,
            market=market,
            by_ticker=out,
            company_by_ticker=company_by_ticker,
            gap_by_ticker=gap_by_ticker,
        )
    return out


def tracked_instrument_ids(store: TraceMoneyStore, market: str) -> list[str]:
    prefix = f"{market.upper()}_"
    seen: set[str] = set()
    out: list[str] = []
    for user in store.list_subscribed_users():
        if not is_pro_user(user):
            continue
        for raw in user.get("tracked_stocks") or []:
            iid = str(raw or "").strip().upper()
            if not iid or not iid.startswith(prefix) or iid in seen:
                continue
            seen.add(iid)
            out.append(iid)
    return out
