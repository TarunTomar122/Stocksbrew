"""Shared helpers for the pre-market intelligence pipeline."""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.models import Article
from backend.storage import TraceMoneyStore

PREMARKET_GAP_THRESHOLD = 0.15
MOVER_GAP_THRESHOLD = 2.0
CONTEXT_MOVER_LIMIT = 15


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


def _article_mentions_ticker(article: Article, ticker: str) -> bool:
    sym = ticker.upper()
    if sym in str(article.title or "").upper():
        return True
    focus = str(getattr(article, "focus_ticker", "") or "").strip().upper()
    if focus == sym:
        return True
    for raw in getattr(article, "stock_tickers", []) or []:
        if str(raw or "").strip().upper() == sym:
            return True
    pattern = re.compile(rf"\b{re.escape(sym)}\b", re.IGNORECASE)
    blob = f"{article.title} {article.summary} {article.body_text}"
    return bool(pattern.search(blob))


def score_article_for_ticker(article: Article, ticker: str, *, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    sym = ticker.upper()
    score = 0.0
    title = str(article.title or "")
    if sym in title.upper():
        score += 12.0
    if _article_mentions_ticker(article, sym):
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


def pick_best_article(articles: list[Article], ticker: str) -> Article | None:
    matches = [article for article in articles if _article_mentions_ticker(article, ticker)]
    if not matches:
        return None
    matches.sort(key=lambda article: score_article_for_ticker(article, ticker), reverse=True)
    return matches[0]


def article_to_context_row(article: Article) -> dict[str, Any]:
    why = (
        str(getattr(article, "article_overview", "") or "").strip()
        or str(article.summary or "").strip()
        or str(article.title or "").strip()
    )
    if len(why) > 180:
        why = why[:177].rstrip() + "..."
    return {
        "headline": str(article.title or "").strip()[:200],
        "why": why,
        "source": str(article.source_name or "").strip()[:80],
        "published_at": str(article.published_at or ""),
        "url": str(article.url or "").strip(),
    }


def _entity_mention_for_ticker(row: dict[str, Any], ticker: str) -> dict[str, Any] | None:
    sym = ticker.upper()
    for mention in row.get("entity_mentions") or []:
        if not isinstance(mention, dict):
            continue
        if str(mention.get("ticker") or "").strip().upper() == sym:
            return mention
    return None


def enrichment_row_for_ticker(row: dict[str, Any], ticker: str) -> bool:
    sym = ticker.upper()
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
) -> dict[str, Any] | None:
    sym = ticker.upper()
    candidates: list[tuple[float, dict[str, Any]]] = []
    now = datetime.now(timezone.utc)
    for row in enrichments:
        if not enrichment_row_for_ticker(row, sym):
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
    if len(why) > 180:
        why = why[:177].rstrip() + "..."
    return {
        "headline": str(best.get("title") or "").strip()[:200],
        "why": why,
        "source": str(best.get("source_name") or "").strip()[:80],
        "published_at": str(best.get("published_at") or ""),
        "url": str(best.get("url") or "").strip(),
    }


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
        row = pick_best_enrichment(enrichments, ticker, cutoff=cutoff)
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
        if not bool(user.get("is_subscribed")):
            continue
        for raw in user.get("tracked_stocks") or []:
            iid = str(raw or "").strip().upper()
            if not iid or not iid.startswith(prefix) or iid in seen:
                continue
            seen.add(iid)
            out.append(iid)
    return out
