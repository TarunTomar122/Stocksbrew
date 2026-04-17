"""Build market, sector, and context-aware stock summaries."""
from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
from datetime import datetime, timedelta, timezone
import os
from typing import Any

import requests

from backend.env import load_backend_env
from backend.models import Article
from backend.preferences import sector_label_map
from backend.storage import TraceMoneyStore

load_backend_env()

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
CONTEXT_CACHE_VERSION = "2026-03-27-context-v1"


class ContextBriefWriter:
    def __init__(self, store: TraceMoneyStore | None = None) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.model = os.getenv("TRACE_MONEY_LLM_MODEL", "gpt-5-nano").strip() or "gpt-5-nano"
        self.store = store

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _cache_key(self, prefix: str, payload: dict[str, Any]) -> str:
        digest = hashlib.sha256(
            json.dumps([CONTEXT_CACHE_VERSION, self.model, prefix, payload], sort_keys=True).encode("utf-8")
        ).hexdigest()
        return f"context_{digest}"

    def _schema(self, kind: str) -> dict[str, Any]:
        if kind == "stock":
            return {
                "name": "trace_money_stock_context_brief",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "headline": {"type": "string"},
                        "today_brief": {"type": "string"},
                        "week_brief": {"type": "string"},
                        "catalyst": {"type": "string"},
                        "risk": {"type": "string"},
                    },
                    "required": ["headline", "today_brief", "week_brief", "catalyst", "risk"],
                    "additionalProperties": False,
                },
            }
        return {
            "name": f"trace_money_{kind}_context_brief",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "today_brief": {"type": "string"},
                    "week_brief": {"type": "string"},
                },
                "required": ["today_brief", "week_brief"],
                "additionalProperties": False,
            },
        }

    def _system_prompt(self, kind: str) -> str:
        if kind == "stock":
            return (
                "You write short stock briefs for a market-intelligence product.\n"
                "Use only the provided facts.\n"
                "Write in plain market language, not analyst boilerplate.\n"
                "Do not say phrases like 'today's tone is', 'over the last week', 'the company is a major player', or 'signal is based on'.\n"
                "Prioritize the actual stock event first, then place it in sector and market context.\n"
                "Keep `headline` under 12 words.\n"
                "Keep `today_brief` to 2 or 3 short sentences.\n"
                "Keep `week_brief` to 1 or 2 short sentences.\n"
                "If evidence is narrow, say it naturally, e.g. 'early coverage is positive, though breadth is still limited.'\n"
                "Make `catalyst` and `risk` short phrases, not full explanations.\n"
                "Return strict JSON only."
            )
        if kind == "market_synthesis":
            return (
                "You write a market intelligence briefing for an investor dashboard.\n"
                "You are synthesizing the overall market tone from sector and stock-level signals.\n"
                "Use only the provided facts. Do not invent data.\n"
                "Write in plain, confident market language — like a morning note from a desk strategist.\n"
                "Do not say 'signal is based on', 'today's tone is', or 'the data suggests'.\n"
                "Name specific sectors and drivers when available.\n"
                "If recent history is provided, note whether today continues or breaks the recent trend.\n"
                "Keep `today_brief` to 2 or 3 short sentences covering: overall tone, leading sectors, lagging sectors.\n"
                "Keep `week_brief` to 1 or 2 short sentences about the recent trend.\n"
                "Return strict JSON only."
            )
        return (
            "You write short market and sector briefs for a market-intelligence product.\n"
            "Use only the provided facts.\n"
            "Write in plain market language, not analyst boilerplate.\n"
            "Do not say phrases like 'today's tone is', 'over the last week', or 'signal is based on'.\n"
            "Keep each brief to 1 or 2 short sentences.\n"
            "Make the language feel like a human market note.\n"
            "Return strict JSON only."
        )

    def _call(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.enabled:
            return {}
        cache_key = self._cache_key(kind, payload)
        if self.store:
            cached = self.store.get_llm_enrichment(cache_key)
            if cached and isinstance(cached.get("payload"), dict):
                return cached["payload"]
        response = requests.post(
            OPENAI_API_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": self._system_prompt(kind)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": self._schema(kind),
                },
            },
            timeout=45,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        result = json.loads(content)
        if self.store:
            self.store.save_llm_enrichment(cache_key, {
                "cache_key": cache_key,
                "payload": result,
                "kind": kind,
                "model": self.model,
            })
        return result


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _round(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def _score_label(score: int) -> str:
    if score >= 75:
        return "bullish"
    if score >= 60:
        return "constructive"
    if score >= 45:
        return "mixed"
    if score >= 30:
        return "cautious"
    return "bearish"


def _score_from_articles(articles: list[Article]) -> int:
    if not articles:
        return 50
    avg = sum(float(article.sentiment_score) for article in articles) / len(articles)
    return max(5, min(95, int(round(50 + (avg * 50)))))


def _unique(values: list[str], limit: int = 4) -> list[str]:
    seen: list[str] = []
    for value in values:
        cleaned = " ".join(str(value).split()).strip().rstrip(".")
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
        if len(seen) >= limit:
            break
    return seen


def _filter_generic_points(points: list[str]) -> list[str]:
    bad_starts = (
        "the article",
        "the company is",
        "the company has",
        "known for",
        "major player",
        "leading company",
        "key player",
    )
    bad_terms = (
        "looks alarmingly like",
        "warning for big tech",
        "feature highlights",
        "investment ideas",
        "about to soar",
    )
    filtered = []
    for point in points:
        lowered = point.lower()
        if any(lowered.startswith(prefix) for prefix in bad_starts):
            continue
        if any(term in lowered for term in bad_terms):
            continue
        filtered.append(point)
    return filtered


def _window_split(articles: list[Article]) -> tuple[list[Article], list[Article]]:
    if not articles:
        return [], []
    latest = max(_parse_iso(article.published_at) for article in articles)
    cutoff = latest - timedelta(hours=24)
    today = [article for article in articles if _parse_iso(article.published_at) >= cutoff]
    week = list(articles)
    return today, week


def _market_relevant_articles(articles: list[Article]) -> list[Article]:
    relevant: list[Article] = []
    for article in articles:
        has_primary_market_entity = any(
            str(mention.get("type", "")).lower() == "market"
            and str(mention.get("mention_role", "")).lower() == "primary"
            for mention in article.entity_mentions
        )
        has_any_market_entity = any(
            str(mention.get("type", "")).lower() == "market"
            for mention in article.entity_mentions
        )
        if has_primary_market_entity:
            relevant.append(article)
            continue
        if article.source_lane == "broad" and has_any_market_entity:
            relevant.append(article)
    return relevant


def _extract_points(articles: list[Article]) -> list[str]:
    raw: list[str] = []
    for article in articles:
        raw.extend(article.article_key_points)
        for mention in article.entity_mentions:
            raw.extend(mention.get("bullish_points", []))
            raw.extend(mention.get("risk_points", []))
            what = str(mention.get("what_happened", "")).strip()
            if what:
                raw.append(what)
    return _unique(_filter_generic_points(raw), limit=5)


def _extract_stock_points(articles: list[Article], ticker: str) -> list[str]:
    raw: list[str] = []
    target = ticker.upper()
    for article in articles:
        for mention in article.entity_mentions:
            if str(mention.get("type", "")).lower() != "stock":
                continue
            if str(mention.get("ticker", "")).upper() != target:
                continue
            if str(mention.get("mention_role", "secondary")).lower() == "incidental":
                continue
            raw.extend(mention.get("bullish_points", []))
            raw.extend(mention.get("risk_points", []))
            for field in ("what_happened", "why_it_matters"):
                value = str(mention.get(field, "")).strip()
                if value and value.lower() != "unknown":
                    raw.append(value)
            raw.extend(mention.get("entity_key_points", []))
    if not raw:
        raw = [point for article in articles for point in article.article_key_points]
    return _unique(_filter_generic_points(raw), limit=5)


def _top_sector_labels(articles: list[Article], market: str, limit: int = 3) -> list[str]:
    labels = sector_label_map().get(market, {})
    counts: Counter[str] = Counter()
    for article in articles:
        for mention in article.entity_mentions:
            sector_id = str(mention.get("sector_id", "")).strip()
            if sector_id:
                counts[sector_id] += 1
    top = []
    for sector_id, _ in counts.most_common(limit):
        top.append(labels.get(sector_id, sector_id.replace("-", " ").title()))
    return top


def _market_brief(today: list[Article], week: list[Article], market: str) -> tuple[str, str]:
    today_points = _extract_points(today)
    week_points = _extract_points(week)
    today_score = _score_from_articles(today)
    week_score = _score_from_articles(week)
    today_label = _score_label(today_score)
    sector_names = _top_sector_labels(today, market)
    sector_clause = ""
    if sector_names:
        sector_clause = f" {', '.join(sector_names[:2])} are driving the tone."
    today_line = (
        f"Today's market tone is {today_label}."
        f" {today_points[0]}." if today_points else f"Today's market tone is {today_label}."
    )
    week_line = (
        f"Over the last week, the tone has stayed {_score_label(week_score)}."
        f" {week_points[0]}." if week_points else f"Over the last week, the tone has stayed {_score_label(week_score)}."
    )
    return (today_line + sector_clause).strip(), week_line.strip()


def _synthesize_from_components(
    market: str,
    articles: list[Article],
    stock_docs: list[dict[str, Any]],
    sector_docs: list[dict[str, Any]],
    recent_summaries: list[dict[str, Any]],
    writer: ContextBriefWriter | None = None,
) -> dict[str, Any]:
    """Build market context bottom-up from stock and sector intelligence."""
    labels = sector_label_map().get(market, {})

    # Aggregate sector signals
    leading: list[str] = []
    lagging: list[str] = []
    sector_signals: list[dict[str, Any]] = []
    for doc in sorted(sector_docs, key=lambda d: -int(d.get("article_count", 0))):
        score = int(doc.get("today_score", 50))
        sector_label = str(doc.get("sector_label", "")).strip()
        if not sector_label:
            continue
        direction = "leading" if score >= 60 else "lagging" if score <= 40 else "neutral"
        if direction == "leading":
            leading.append(sector_label)
        elif direction == "lagging":
            lagging.append(sector_label)
        sector_signals.append({
            "sector": sector_label,
            "score": score,
            "label": _score_label(score),
            "direction": direction,
        })

    # Aggregate stock signals
    bullish = sum(1 for d in stock_docs if str(d.get("overall_label", "")) in ("bullish", "constructive"))
    bearish = sum(1 for d in stock_docs if str(d.get("overall_label", "")) in ("bearish", "cautious"))
    total = len(stock_docs)

    # Overall score from stock docs
    stock_scores = [int(d.get("overall_score", 50)) for d in stock_docs if d.get("overall_score")]
    today_score = int(round(sum(stock_scores) / len(stock_scores))) if stock_scores else 50
    today_label = _score_label(today_score)

    # Collect top catalysts from stock docs
    catalysts: list[str] = []
    for doc in stock_docs:
        for point in doc.get("key_points", [])[:2]:
            cleaned = " ".join(str(point).split()).strip()
            if cleaned and cleaned not in catalysts:
                catalysts.append(cleaned)
            if len(catalysts) >= 5:
                break

    # Top sectors from articles as fallback
    top_sectors = [s["sector"] for s in sector_signals[:3]] or _top_sector_labels(articles, market)

    # Build template briefs
    if leading and lagging:
        today_brief = (
            f"Market tone is {today_label} today, led by {', '.join(leading[:2])}. "
            f"{', '.join(lagging[:2])} {'are' if len(lagging) > 1 else 'is'} lagging."
        )
    elif leading:
        today_brief = f"Market tone is {today_label} today, led by {', '.join(leading[:2])}."
    elif lagging:
        today_brief = f"Market tone is {today_label} today. {', '.join(lagging[:2])} {'are' if len(lagging) > 1 else 'is'} under pressure."
    else:
        today_brief = f"Market tone is {today_label} today across {total} tracked names."

    if catalysts:
        today_brief = f"{today_brief} {catalysts[0]}."

    # Week brief from recent run summaries
    week_brief = ""
    if recent_summaries:
        recent_labels = [str(s.get("today_label", "")) for s in recent_summaries if s.get("today_label")]
        if recent_labels:
            dominant = max(set(recent_labels), key=recent_labels.count)
            if dominant == today_label:
                week_brief = f"This {today_label} tilt has held for most of the recent sessions."
            else:
                week_brief = f"Today marks a shift toward {today_label} after recent sessions leaned {dominant}."
    if not week_brief:
        week_brief = f"Coverage across {total} stocks with {bullish} leaning positive and {bearish} cautious."

    # LLM rewrite if available
    if writer and writer.enabled:
        recent_history_lines = []
        for summary in recent_summaries[-5:]:
            date = str(summary.get("date", "")).strip()
            label = str(summary.get("today_label", "")).strip()
            sectors = summary.get("leading_sectors", [])
            if date and label:
                sector_note = f" ({', '.join(sectors[:2])} led)" if sectors else ""
                recent_history_lines.append(f"{date}: {label}{sector_note}")
        payload = {
            "market": market,
            "today_label": today_label,
            "today_score": today_score,
            "leading_sectors": leading[:3],
            "lagging_sectors": lagging[:3],
            "sector_signals": sector_signals[:5],
            "stock_signal_summary": {
                "total": total,
                "bullish": bullish,
                "bearish": bearish,
            },
            "top_catalysts": catalysts[:4],
            "recent_history": recent_history_lines,
        }
        generated = writer._call("market_synthesis", payload)
        today_brief = str(generated.get("today_brief", today_brief)).strip() or today_brief
        week_brief = str(generated.get("week_brief", week_brief)).strip() or week_brief

    return {
        "market": market,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "today_score": today_score,
        "today_label": today_label,
        "week_score": today_score,
        "week_label": today_label,
        "today_brief": today_brief,
        "week_brief": week_brief,
        "today_key_points": catalysts[:4],
        "week_key_points": [],
        "top_sectors": top_sectors,
        "article_count": len(articles),
        "leading_sectors": leading[:3],
        "lagging_sectors": lagging[:3],
        "source": "synthesized",
    }


def build_market_context_doc(
    market: str,
    universe_id: str,
    articles: list[Article],
    writer: ContextBriefWriter | None = None,
    stock_docs: list[dict[str, Any]] | None = None,
    sector_docs: list[dict[str, Any]] | None = None,
    store: TraceMoneyStore | None = None,
) -> dict[str, Any]:
    # Try the article-based path first
    market_articles = _market_relevant_articles(articles)
    has_enough_articles = (
        len(market_articles) >= 2
        and len({article.source_name for article in market_articles}) >= 2
    )

    # Load recent run summaries for temporal context
    recent_summaries: list[dict[str, Any]] = []
    if store:
        try:
            recent_summaries = store.list_market_run_summaries(market, universe_id, limit=5)
        except Exception:
            recent_summaries = []

    if has_enough_articles:
        today, week = _window_split(market_articles)
        today_score = _score_from_articles(today)
        week_score = _score_from_articles(week)
        today_points = _extract_points(today)
        week_points = _extract_points(week)
        top_sectors = _top_sector_labels(today, market)
        today_brief, week_brief = _market_brief(today, week, market)
        if writer and writer.enabled:
            # Include recent history in the LLM payload
            recent_history_lines = []
            for summary in recent_summaries[-5:]:
                date = str(summary.get("date", "")).strip()
                label = str(summary.get("today_label", "")).strip()
                sectors = summary.get("leading_sectors", [])
                if date and label:
                    sector_note = f" ({', '.join(sectors[:2])} led)" if sectors else ""
                    recent_history_lines.append(f"{date}: {label}{sector_note}")
            payload = {
                "market": market,
                "today_label": _score_label(today_score),
                "today_score": today_score,
                "today_key_points": today_points,
                "top_sectors": top_sectors,
                "week_label": _score_label(week_score),
                "week_score": week_score,
                "week_key_points": week_points,
                "recent_history": recent_history_lines,
            }
            generated = writer._call("market", payload)
            today_brief = str(generated.get("today_brief", today_brief)).strip() or today_brief
            week_brief = str(generated.get("week_brief", week_brief)).strip() or week_brief
        result = {
            "market": market,
            "universe_id": universe_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "today_score": today_score,
            "today_label": _score_label(today_score),
            "week_score": week_score,
            "week_label": _score_label(week_score),
            "today_brief": today_brief,
            "week_brief": week_brief,
            "today_key_points": today_points,
            "week_key_points": week_points,
            "top_sectors": top_sectors,
            "article_count": len(market_articles),
            "source": "articles",
        }
    elif stock_docs or sector_docs:
        # Fallback: synthesize from stock + sector intelligence
        result = _synthesize_from_components(
            market, articles, stock_docs or [], sector_docs or [],
            recent_summaries, writer,
        )
        result["universe_id"] = universe_id
    else:
        return {}

    # Persist a compact run summary for temporal lookback
    if store and result.get("today_label"):
        try:
            store.save_market_run_summary(market, universe_id, {
                "date": datetime.now(timezone.utc).date().isoformat(),
                "today_label": result["today_label"],
                "today_score": result["today_score"],
                "leading_sectors": result.get("leading_sectors", result.get("top_sectors", []))[:3],
                "lagging_sectors": result.get("lagging_sectors", [])[:3],
                "source": result.get("source", "articles"),
            })
        except Exception:
            pass  # non-critical

    return result


def build_sector_context_docs(
    market: str,
    universe_id: str,
    articles: list[Article],
    writer: ContextBriefWriter | None = None,
) -> list[dict[str, Any]]:
    grouped: dict[str, list[Article]] = defaultdict(list)
    labels = sector_label_map().get(market, {})
    for article in articles:
        sector_ids = {
            str(mention.get("sector_id", "")).strip()
            for mention in article.entity_mentions
            if str(mention.get("sector_id", "")).strip()
        }
        for sector_id in sector_ids:
            grouped[sector_id].append(article)

    docs: list[dict[str, Any]] = []
    for sector_id, sector_articles in grouped.items():
        today, week = _window_split(sector_articles)
        today_points = _extract_points(today)
        week_points = _extract_points(week)
        today_score = _score_from_articles(today)
        week_score = _score_from_articles(week)
        today_brief = (
            f"Today's {labels.get(sector_id, sector_id)} tone is {_score_label(today_score)}."
            + (f" {today_points[0]}." if today_points else "")
        ).strip()
        week_brief = (
            f"Over the last week, {labels.get(sector_id, sector_id)} has stayed {_score_label(week_score)}."
            + (f" {week_points[0]}." if week_points else "")
        ).strip()
        if writer and writer.enabled:
            payload = {
                "market": market,
                "sector_label": labels.get(sector_id, sector_id.replace("-", " ").title()),
                "today_label": _score_label(today_score),
                "today_score": today_score,
                "today_key_points": today_points,
                "week_label": _score_label(week_score),
                "week_score": week_score,
                "week_key_points": week_points,
            }
            generated = writer._call("sector", payload)
            today_brief = str(generated.get("today_brief", today_brief)).strip() or today_brief
            week_brief = str(generated.get("week_brief", week_brief)).strip() or week_brief
        docs.append({
            "market": market,
            "universe_id": universe_id,
            "sector_id": sector_id,
            "sector_label": labels.get(sector_id, sector_id.replace("-", " ").title()),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "today_score": today_score,
            "today_label": _score_label(today_score),
            "week_score": week_score,
            "week_label": _score_label(week_score),
            "today_brief": today_brief,
            "week_brief": week_brief,
            "today_key_points": today_points,
            "week_key_points": week_points,
            "article_count": len(sector_articles),
        })
    docs.sort(key=lambda item: (-int(item["article_count"]), item["sector_label"]))
    return docs


def contextualize_stock_docs(
    instruments: list[dict[str, Any]],
    articles: list[Article],
    stock_docs: list[dict[str, Any]],
    market_context: dict[str, Any],
    sector_context_docs: list[dict[str, Any]],
    writer: ContextBriefWriter | None = None,
) -> list[dict[str, Any]]:
    docs_by_id = {doc["instrument_id"]: dict(doc) for doc in stock_docs}
    sector_context_by_id = {doc["sector_id"]: doc for doc in sector_context_docs}
    articles_by_ticker: dict[str, list[Article]] = defaultdict(list)

    for article in articles:
        tickers = {
            str(mention.get("ticker", "")).upper()
            for mention in article.entity_mentions
            if str(mention.get("type", "")).lower() == "stock"
            and str(mention.get("ticker", "")).strip()
            and str(mention.get("mention_role", "secondary")).lower() != "incidental"
        }
        for ticker in tickers:
            articles_by_ticker[ticker].append(article)

    contextualized: list[dict[str, Any]] = []
    for instrument in instruments:
        doc = docs_by_id.get(instrument["instrument_id"])
        if not doc:
            continue
        ticker = instrument["ticker"].upper()
        matched_articles = articles_by_ticker.get(ticker, [])
        stock_today, stock_week = _window_split(matched_articles)
        stock_points_today = _extract_stock_points(stock_today, ticker)
        stock_points_week = _extract_stock_points(stock_week, ticker)
        sector_id = ""
        for article in matched_articles:
            for mention in article.entity_mentions:
                if str(mention.get("ticker", "")).upper() == ticker:
                    sector_id = str(mention.get("sector_id", "")).strip() or sector_id
        sector_context = sector_context_by_id.get(sector_id, {})

        stock_sentence = stock_points_today[0] if stock_points_today else str(doc.get("headline", "")).strip().rstrip(".")
        week_sentence = stock_points_week[0] if stock_points_week else (str(doc.get("key_points", [""])[0]).strip() if doc.get("key_points") else "")
        contextual_brief = " ".join(
            part.rstrip(".") + "."
            for part in [stock_sentence, str(sector_context.get("today_brief", "")).strip(), str(market_context.get("today_brief", "")).strip()]
            if part
        ).strip()
        generated_headline = str(doc.get("headline", "")).strip()
        generated_catalyst = str(doc.get("catalyst", "")).strip()
        generated_risk = str(doc.get("risk", "")).strip()
        if writer and writer.enabled:
            payload = {
                "instrument_name": instrument["name"],
                "ticker": ticker,
                "stock_today_points": stock_points_today,
                "stock_week_points": stock_points_week,
                "stock_score": int(doc.get("overall_score", 50)),
                "stock_label": str(doc.get("overall_label", "")),
                "news_count": int(doc.get("news_count", 0)),
                "source_count": int(doc.get("source_count", 0)),
                "sector_context_today": str(sector_context.get("today_brief", "")).strip(),
                "sector_context_week": str(sector_context.get("week_brief", "")).strip(),
                "market_context_today": str(market_context.get("today_brief", "")).strip(),
                "market_context_week": str(market_context.get("week_brief", "")).strip(),
            }
            generated = writer._call("stock", payload)
            generated_headline = str(generated.get("headline", generated_headline)).strip() or generated_headline
            contextual_brief = str(generated.get("today_brief", contextual_brief)).strip() or contextual_brief
            week_sentence = str(generated.get("week_brief", week_sentence)).strip() or week_sentence
            generated_catalyst = str(generated.get("catalyst", generated_catalyst)).strip() or generated_catalyst
            generated_risk = str(generated.get("risk", generated_risk)).strip() or generated_risk

        doc["today_brief"] = contextual_brief
        doc["week_summary"] = week_sentence
        doc["headline"] = generated_headline
        doc["catalyst"] = generated_catalyst
        doc["risk"] = generated_risk
        doc["market_context"] = {
            "today_brief": market_context.get("today_brief", ""),
            "week_brief": market_context.get("week_brief", ""),
        }
        doc["sector_context"] = {
            "sector_id": sector_id,
            "today_brief": sector_context.get("today_brief", ""),
            "week_brief": sector_context.get("week_brief", ""),
        }
        contextualized.append(doc)
    return contextualized
