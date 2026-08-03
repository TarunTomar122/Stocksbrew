"""OpenAI-backed article enrichment for Trace Money."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import replace
from typing import Any
from urllib.parse import urlparse

import requests

from backend.coverage_mode import coverage_modes_for_source_id, derive_coverage_mode
from backend.env import load_backend_env
from backend.llm_client import (
    json_response_format,
    llm_enrichment_api_key,
    llm_enrichment_api_url,
    llm_enrichment_headers,
    llm_enrichment_model,
    llm_enrichment_provider,
    log_llm_call,
    parse_json_content,
    schema_system_prompt,
)
from backend.market_strategy import default_llm_concurrency
from backend.url_extractor import article_needs_url_extract, extract_url, strip_html
from backend.models import Article
from backend.preferences import sector_label_map
from backend.sentiment import label_sentiment
from backend.storage import TraceMoneyStore
from backend.topicing import (
    looks_like_non_stock_entity,
    market_bucket_map,
    resolve_market_bucket,
    resolve_sector_label,
    resolve_stock_reference,
    slugify,
)

logger = logging.getLogger(__name__)

load_backend_env()


DEFAULT_MODEL = llm_enrichment_model()
CACHE_VERSION = "2026-07-02-slim-v1"
STABLE_URL_CACHE_VERSION = "2026-07-30-url-v1"
RETRYABLE_STATUS_CODES = {408, 409, 429, 500, 502, 503, 504}


def _clip(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _clean_points(values: list[str]) -> list[str]:
    cleaned = []
    for value in values:
        item = " ".join(str(value).split()).strip()
        if item and item not in cleaned:
            cleaned.append(item)
    return cleaned[:4]


def _response_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "key_points": {"type": "array", "items": {"type": "string"}},
            "sentiment": {"type": "string", "enum": ["bullish", "bearish", "neutral"]},
            "entities": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ticker": {"type": "string"},
                        "relevance": {"type": "string", "enum": ["primary", "secondary"]},
                        "facts": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["ticker", "relevance", "facts"],
                },
            },
        },
        "required": ["summary", "key_points", "sentiment", "entities"],
    }


def _system_prompt(market: str) -> str:
    market_name = "India" if market == "IN" else "United States"
    return (
        "Extract factual finance-news metadata for a downstream stock-brief model.\n"
        f"Market context: {market_name}.\n"
        "Return strict JSON only. No prose outside JSON.\n"
        "Rules:\n"
        "- summary: one factual sentence.\n"
        "- key_points: max 3 factual bullets with numbers only if present in text.\n"
        "- sentiment: article-level bullish|bearish|neutral.\n"
        "- entities: every clearly relevant stock ticker mentioned.\n"
        "- relevance primary only when the article is mainly about that ticker.\n"
        "- facts: max 2 short factual strings per ticker.\n"
        "- Do not invent tickers or numbers.\n"
        "- If no stock is clearly relevant, return one entity with ticker GENERAL and relevance primary."
    )


def _repair_system_prompt(market: str) -> str:
    market_name = "India" if market == "IN" else "United States"
    return (
        "Repair a failed finance-news extraction.\n"
        f"Market context: {market_name}.\n"
        "Return strict JSON only with at least one entity."
    )


def _user_prompt(article: Article) -> str:
    return json.dumps(
        {
            "market": article.market,
            "title": strip_html(article.title),
            "summary": strip_html(article.summary),
            "body_text": strip_html(article.body_text)[:6000],
            "source_name": article.source_name,
            "published_at": article.published_at,
        },
        ensure_ascii=True,
    )


def _sentiment_to_score(label: str) -> float:
    normalized = str(label or "").strip().lower()
    if normalized == "bullish":
        return 0.5
    if normalized == "bearish":
        return -0.5
    return 0.0


def normalize_enrichment_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if "article_overview" in payload:
        return payload

    sentiment_label = str(payload.get("sentiment") or "neutral").strip().lower()
    overall = _sentiment_to_score(sentiment_label)
    entities: list[dict[str, Any]] = []
    for raw_entity in payload.get("entities") or []:
        if not isinstance(raw_entity, dict):
            continue
        ticker = str(raw_entity.get("ticker") or "").strip().upper()
        if not ticker or ticker == "GENERAL":
            entities.append(
                {
                    "type": "market",
                    "canonical_name": "General market updates",
                    "ticker": "",
                    "sector_id": "",
                    "market_id": "general-market-updates",
                    "sentiment_score": overall,
                    "confidence": 0.85,
                    "relevance": 0.9,
                    "mention_role": "primary",
                    "what_happened": str(payload.get("summary") or "").strip() or "unknown",
                    "why_it_matters": "unknown",
                    "bullish_points": _clean_points(list(payload.get("key_points") or [])),
                    "risk_points": [],
                    "entity_overview": str(payload.get("summary") or "").strip(),
                    "entity_key_points": _clean_points(list(payload.get("key_points") or [])),
                }
            )
            continue

        relevance = str(raw_entity.get("relevance") or "secondary").strip().lower()
        facts = _clean_points(list(raw_entity.get("facts") or []))[:2]
        role = "primary" if relevance == "primary" else "secondary"
        confidence = 0.92 if role == "primary" else 0.78
        rel_score = 0.95 if role == "primary" else 0.72
        entities.append(
            {
                "type": "stock",
                "canonical_name": ticker,
                "ticker": ticker,
                "sector_id": "",
                "market_id": "",
                "sentiment_score": overall,
                "confidence": confidence,
                "relevance": rel_score,
                "mention_role": role,
                "what_happened": facts[0] if facts else str(payload.get("summary") or "").strip() or "unknown",
                "why_it_matters": facts[1] if len(facts) > 1 else facts[0] if facts else "unknown",
                "bullish_points": facts,
                "risk_points": [],
                "entity_overview": facts[0] if facts else str(payload.get("summary") or "").strip(),
                "entity_key_points": facts,
            }
        )

    if not entities:
        raise ValueError("slim enrichment payload had no entities")

    return {
        "article_overview": str(payload.get("summary") or "").strip(),
        "article_key_points": _clean_points(list(payload.get("key_points") or []))[:3],
        "primary_event_type": "unknown",
        "numbers_mentioned": [],
        "overall_sentiment_score": overall,
        "entities": entities,
    }


def _prepare_article_for_enrichment(article: Article) -> Article:
    parsed_url = urlparse(str(article.url or ""))
    host = parsed_url.netloc.lower().removeprefix("www.")
    path = parsed_url.path.lower()
    known_feed_shell = (
        host == "news.google.com" and path.startswith("/rss/articles/")
    ) or host == "finance.yahoo.com" or (
        host == "seekingalpha.com"
        and path.startswith("/symbol/")
        and path.endswith("/news")
    )
    if not article.url or known_feed_shell or not article_needs_url_extract(
        title=article.title,
        summary=article.summary,
        body_text=article.body_text,
    ):
        return replace(
            article,
            title=strip_html(article.title),
            summary=strip_html(article.summary),
            body_text=strip_html(article.body_text),
        )

    extracted = extract_url(article.url)
    if extracted.status != "ok":
        return replace(
            article,
            title=strip_html(article.title or extracted.title),
            summary=strip_html(article.summary or extracted.summary),
            body_text=strip_html(article.body_text or extracted.body_text),
        )

    return replace(
        article,
        title=strip_html(extracted.title or article.title),
        summary=strip_html(extracted.summary or article.summary),
        body_text=strip_html(extracted.body_text or article.body_text),
        published_at=extracted.published_at or article.published_at,
    )


def _fallback_payload(article: Article) -> dict[str, Any]:
    if article.focus_ticker:
        resolved = resolve_stock_reference(article.market, article.focus_ticker, article.focus_ticker)
        canonical_name = article.focus_ticker
        sector_id = ""
        if resolved:
            canonical_name = str(resolved.get("display_name", canonical_name)).strip() or canonical_name
            sector_id = next(iter(resolved.get("sector_tags", [])), "")
        return {
            "article_overview": article.summary or article.title,
            "article_key_points": _clean_points([article.title, article.summary]),
            "primary_event_type": "unknown",
            "numbers_mentioned": [],
            "overall_sentiment_score": 0.0,
            "entities": [
                {
                    "type": "stock",
                    "canonical_name": canonical_name,
                    "ticker": article.focus_ticker,
                    "sector_id": sector_id,
                    "market_id": "",
                    "sentiment_score": 0.0,
                    "confidence": 0.85,
                    "relevance": 0.95,
                    "mention_role": "primary",
                    "what_happened": article.summary or article.title,
                    "why_it_matters": "unknown",
                    "bullish_points": _clean_points([article.title]),
                    "risk_points": [],
                    "entity_overview": article.summary or f"{canonical_name} is the primary focus of this article.",
                    "entity_key_points": _clean_points([article.title, article.summary]),
                }
            ],
        }
    return {
        "article_overview": article.summary or article.title,
        "article_key_points": _clean_points([article.title, article.summary]),
        "primary_event_type": "unknown",
        "numbers_mentioned": [],
        "overall_sentiment_score": 0.0,
        "entities": [
            {
                "type": "market",
                "canonical_name": "General market updates",
                "ticker": "",
                "sector_id": "",
                "market_id": "general-market-updates",
                "sentiment_score": 0.0,
                "confidence": 0.85,
                "relevance": 0.9,
                "mention_role": "primary",
                "what_happened": article.summary or article.title,
                "why_it_matters": "unknown",
                "bullish_points": _clean_points([article.title]),
                "risk_points": [],
                "entity_overview": article.summary or "This article is being retained as a general market update.",
                "entity_key_points": _clean_points([article.title, article.summary]),
            }
        ],
    }


class OpenAIArticleEnricher:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout: int = 40,
        max_workers: int | None = None,
        store: TraceMoneyStore | None = None,
    ) -> None:
        self.api_key = api_key or llm_enrichment_api_key()
        self.model = model or llm_enrichment_model(DEFAULT_MODEL)
        self.timeout = timeout
        configured_workers = max_workers or default_llm_concurrency()
        self.max_workers = max(1, configured_workers)
        self.store = store
        self._memory_cache: dict[str, dict[str, Any]] = {}
        self.max_attempts = 3

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def enrich_articles(self, articles: list[Article]) -> list[Article]:
        if not self.enabled:
            raise ValueError("OPENAI_API_KEY is required for article enrichment")
        self._ensure_store()
        enriched: list[Article | None] = [None] * len(articles)
        pending_prepare: list[tuple[int, Article, str]] = []
        for index, article in enumerate(articles):
            # Cache identity deliberately excludes extracted body text. Most
            # feed rows already have a stable URL/title/summary, so checking
            # the cache before a remote scrape avoids paying Firecrawl's
            # latency again for an article whose LLM result already exists.
            cleaned = replace(
                article,
                title=strip_html(article.title),
                summary=strip_html(article.summary),
                body_text=strip_html(article.body_text),
            )
            cache_key = self._cache_key(cleaned)
            payload = self._get_cached_payload(cache_key)
            if payload is None:
                # Migrate an existing title-sensitive entry without scraping.
                legacy_key = self._legacy_cache_key(cleaned)
                payload = self._get_cached_payload(legacy_key)
                if payload is not None:
                    self._save_cached_payload(cache_key, cleaned, payload)
            if payload is None:
                pending_prepare.append((index, cleaned, cache_key))
                continue
            try:
                enriched[index] = apply_enrichment(cleaned, normalize_enrichment_payload(payload))
            except ValueError:
                pending_prepare.append((index, cleaned, cache_key))

        pending: list[tuple[int, Article, str]] = []
        if pending_prepare:
            # URL extraction is I/O bound. Run it only for cache misses and in
            # a bounded pool instead of serially blocking every article.
            prepared_rows: list[tuple[int, Article, str]] = []
            # Scraping is heavier than the model call and all shards share one
            # local Firecrawl service. Keep each worker modest so concurrent
            # shards do not turn normal pages into 30-second queue timeouts.
            prepare_workers = min(4, self.max_workers, len(pending_prepare))
            with ThreadPoolExecutor(max_workers=prepare_workers) as executor:
                future_map = {
                    executor.submit(_prepare_article_for_enrichment, article): (index, article, initial_key)
                    for index, article, initial_key in pending_prepare
                }
                for future in as_completed(future_map):
                    index, article, initial_key = future_map[future]
                    try:
                        prepared = future.result()
                    except Exception as exc:
                        logger.warning(
                            "article URL preparation failed source_id=%s err=%s url=%s",
                            article.source_id,
                            exc,
                            article.url,
                        )
                        prepared = article
                    prepared_rows.append((index, prepared, initial_key))

            prepared_rows.sort(key=lambda item: item[0])
            for index, prepared, stable_key in prepared_rows:
                cache_key = self._cache_key(prepared)
                # Extraction can fill/change title/summary. Consult the
                # pre-migration key once, then persist the result under the
                # URL-stable key so future runs never need this scrape.
                payload = self._get_cached_payload(self._legacy_cache_key(prepared))
                if payload is not None:
                    try:
                        enriched[index] = apply_enrichment(
                            prepared,
                            normalize_enrichment_payload(payload),
                        )
                        self._save_cached_payload(stable_key, prepared, payload)
                        continue
                    except ValueError:
                        pass
                pending.append((index, prepared, cache_key))

        if pending:
            with ThreadPoolExecutor(max_workers=min(self.max_workers, len(pending))) as executor:
                future_map = {
                    executor.submit(self._enrich_article, article, cache_key): (index, article, cache_key)
                    for index, article, cache_key in pending
                }
                for future in as_completed(future_map):
                    index, article, cache_key = future_map[future]
                    try:
                        enriched[index] = future.result()
                    except Exception as exc:
                        logger.error(
                            "LLM enrich terminal fallback market=%s source_id=%s err=%s url=%s",
                            article.market,
                            article.source_id,
                            exc,
                            article.url,
                        )
                        fallback_payload = _fallback_payload(article)
                        try:
                            enriched[index] = apply_enrichment(article, fallback_payload)
                        except Exception:
                            enriched[index] = replace(
                                article,
                                topic_key=f"market:{article.market}:macro",
                                topic_label="Market",
                                topic_kind="market",
                                bucket_keys=[f"market:{article.market}:macro"],
                                bucket_labels=["Market"],
                                bucket_kinds=["market"],
                                enrichment_source="llm",
                            )
                        self._save_cached_payload(cache_key, article, fallback_payload)

        return [article for article in enriched if article is not None]

    def _extract(self, article: Article, repair: bool = False) -> dict[str, Any]:
        response = self._post_with_retry(article, repair=repair)
        payload = response.json()
        message = payload["choices"][0]["message"]
        if message.get("refusal"):
            raise ValueError("LLM refused enrichment request")
        content = (message.get("content") or "").strip()
        if not content:
            raise ValueError("LLM returned empty content")
        return parse_json_content(content)

    def _request_payload(self, article: Article, repair: bool = False) -> dict[str, Any]:
        return {
            "model": self.model,
            "reasoning_effort": "low",
            "messages": [
                {
                    "role": "system",
                    "content": schema_system_prompt(
                        _repair_system_prompt(article.market) if repair else _system_prompt(article.market),
                        _response_schema(),
                    ),
                },
                {"role": "user", "content": _user_prompt(article)},
            ],
            "response_format": json_response_format(),
        }

    def _is_retryable(self, error: Exception) -> bool:
        if isinstance(error, (requests.Timeout, requests.ConnectionError)):
            return True
        if isinstance(error, requests.HTTPError) and error.response is not None:
            return error.response.status_code in RETRYABLE_STATUS_CODES
        return False

    def _post_with_retry(self, article: Article, *, repair: bool = False) -> requests.Response:
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = requests.post(
                    llm_enrichment_api_url(),
                    headers=llm_enrichment_headers(self.api_key),
                    json=self._request_payload(article, repair=repair),
                    timeout=self.timeout,
                )
                response.raise_for_status()
                body = response.json()
                usage = body.get("usage") if isinstance(body, dict) else {}
                if not isinstance(usage, dict):
                    usage = {}
                log_llm_call(
                    stage="article_enrichment",
                    provider=llm_enrichment_provider(),
                    model=self.model,
                    input_tokens=usage.get("prompt_tokens"),
                    output_tokens=usage.get("completion_tokens"),
                    cache_hit=False,
                    cost_usd=usage.get("cost"),
                    extra=f"url={article.url}",
                )
                return response
            except Exception as error:
                last_error = error
                if attempt >= self.max_attempts or not self._is_retryable(error):
                    raise
                logger.warning(
                    "LLM HTTP retry attempt=%s/%s market=%s source_id=%s err=%s",
                    attempt,
                    self.max_attempts,
                    article.market,
                    article.source_id,
                    error,
                )
                time.sleep(min(2 ** (attempt - 1), 8))
        if last_error is not None:
            raise last_error
        raise RuntimeError("LLM enrichment request failed without an error")

    def _cache_key(self, article: Article) -> str:
        fingerprint = "\n".join([
            STABLE_URL_CACHE_VERSION,
            self.model,
            article.market,
            article.source_id,
            article.url,
        ])
        digest = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
        return f"{article.market.lower()}_{digest}"

    def _legacy_cache_key(self, article: Article) -> str:
        fingerprint = "\n".join([
            CACHE_VERSION,
            self.model,
            article.market,
            article.source_id,
            article.url,
            article.title,
            article.summary,
        ])
        digest = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
        return f"{article.market.lower()}_{digest}"

    def _ensure_store(self) -> TraceMoneyStore | None:
        if self.store is not None:
            return self.store
        if os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip() or os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip():
            self.store = TraceMoneyStore()
        return self.store

    def _get_cached_payload(self, cache_key: str) -> dict[str, Any] | None:
        if cache_key in self._memory_cache:
            log_llm_call(
                stage="article_enrichment",
                provider=llm_enrichment_provider(),
                model=self.model,
                input_tokens=0,
                output_tokens=0,
                cache_hit=True,
            )
            return self._memory_cache[cache_key]
        store = self._ensure_store()
        if not store:
            return None
        cached = store.get_llm_enrichment(cache_key)
        if not cached:
            return None
        payload = cached.get("payload")
        if isinstance(payload, dict):
            self._memory_cache[cache_key] = payload
            log_llm_call(
                stage="article_enrichment",
                provider=llm_enrichment_provider(),
                model=self.model,
                input_tokens=0,
                output_tokens=0,
                cache_hit=True,
            )
            return payload
        return None

    def _save_cached_payload(self, cache_key: str, article: Article, payload: dict[str, Any]) -> None:
        self._memory_cache[cache_key] = payload
        store = self._ensure_store()
        if not store:
            return
        store.save_llm_enrichment(cache_key, {
            "cache_key": cache_key,
            "market": article.market,
            "model": self.model,
            "source_id": article.source_id,
            "url": article.url,
            "title": article.title,
            "published_at": article.published_at,
            "body_text": article.body_text[:500],
            "payload": payload,
        })

    def _enrich_article(self, article: Article, cache_key: str) -> Article:
        recoverable = (ValueError, json.JSONDecodeError)

        try:
            raw_payload = self._extract(article, repair=False)
            payload = normalize_enrichment_payload(raw_payload)
            enriched = apply_enrichment(article, payload)
            self._save_cached_payload(cache_key, article, raw_payload)
            return enriched
        except recoverable as exc:
            logger.warning(
                "LLM enrich primary failed market=%s source_id=%s err=%s url=%s",
                article.market,
                article.source_id,
                exc,
                article.url,
            )

        try:
            raw_payload = self._extract(article, repair=True)
            payload = normalize_enrichment_payload(raw_payload)
            enriched = apply_enrichment(article, payload)
            self._save_cached_payload(cache_key, article, raw_payload)
            return enriched
        except recoverable as exc:
            logger.warning(
                "LLM enrich repair failed market=%s source_id=%s err=%s url=%s",
                article.market,
                article.source_id,
                exc,
                article.url,
            )

        logger.warning(
            "LLM enrich heuristic_fallback market=%s source_id=%s title=%.120s url=%s",
            article.market,
            article.source_id,
            article.title or "",
            article.url,
        )
        fallback_payload = _fallback_payload(article)
        enriched = apply_enrichment(article, fallback_payload)
        self._save_cached_payload(cache_key, article, fallback_payload)
        return enriched




def apply_enrichment(article: Article, payload: dict[str, Any]) -> Article:
    stock_candidates: list[str] = []
    stock_tickers: list[str] = []
    sector_tags: list[str] = []
    bucket_refs: list[dict[str, str]] = []
    entity_mentions: list[dict[str, Any]] = []
    for raw_entity in payload.get("entities", []):
        entity_type = str(raw_entity.get("type", "")).strip().lower()
        canonical_name = " ".join(str(raw_entity.get("canonical_name", "")).split()).strip()
        ticker = str(raw_entity.get("ticker", "")).strip().upper()
        sector_id = str(raw_entity.get("sector_id", "")).strip()
        market_id = str(raw_entity.get("market_id", "")).strip()
        confidence = round(_clip(float(raw_entity.get("confidence", 0.0)), 0.0, 1.0), 2)
        relevance = round(_clip(float(raw_entity.get("relevance", 0.0)), 0.0, 1.0), 2)
        sentiment_score = round(_clip(float(raw_entity.get("sentiment_score", 0.0)), -1.0, 1.0), 2)

        if confidence < 0.45 or relevance < 0.45:
            continue

        mention = {
            "type": entity_type,
            "canonical_name": canonical_name,
            "ticker": ticker,
            "sector_id": sector_id,
            "market_id": market_id,
            "sentiment_label": label_sentiment(sentiment_score),
            "sentiment_score": sentiment_score,
            "confidence": confidence,
            "relevance": relevance,
            "mention_role": str(raw_entity.get("mention_role", "secondary")).strip().lower(),
            "what_happened": " ".join(str(raw_entity.get("what_happened", "")).split()).strip(),
            "why_it_matters": " ".join(str(raw_entity.get("why_it_matters", "")).split()).strip(),
            "bullish_points": _clean_points(list(raw_entity.get("bullish_points", []))),
            "risk_points": _clean_points(list(raw_entity.get("risk_points", []))),
            "entity_overview": " ".join(str(raw_entity.get("entity_overview", "")).split()).strip(),
            "entity_key_points": _clean_points(list(raw_entity.get("entity_key_points", []))),
        }

        if entity_type == "stock" and canonical_name:
            if looks_like_non_stock_entity(canonical_name):
                continue

            resolved_stock = resolve_stock_reference(article.market, canonical_name, ticker)
            if resolved_stock:
                canonical_name = str(resolved_stock.get("display_name", canonical_name)).strip() or canonical_name
                ticker = str(resolved_stock.get("ticker", ticker)).strip().upper()
                sector_id = sector_id or next(iter(resolved_stock.get("sector_tags", [])), "")
                mention["canonical_name"] = canonical_name
                mention["ticker"] = ticker
                mention["sector_id"] = sector_id
                mention["market_id"] = ""

            stock_candidates.append(canonical_name)
            if ticker:
                stock_tickers.append(ticker)
            stock_slug = ticker or canonical_name
            bucket_refs.append({
                "key": f"stock:{article.market}:{slugify(stock_slug)}",
                "label": canonical_name,
                "kind": "stock",
            })
            entity_mentions.append(mention)
            continue

        if entity_type == "sector" and sector_id:
            sector_tags.append(sector_id)
            bucket_refs.append({
                "key": f"sector:{article.market}:{slugify(sector_id)}",
                "label": resolve_sector_label(article.market, sector_id, canonical_name),
                "kind": "sector",
            })
            entity_mentions.append(mention)
            continue

        if entity_type == "market" and market_id:
            market_bucket = resolve_market_bucket(market_id)
            if not market_bucket:
                continue
            bucket_refs.append(market_bucket)
            entity_mentions.append(mention)

    deduped_bucket_refs: list[dict[str, str]] = []
    seen_bucket_keys: set[str] = set()
    for bucket_ref in bucket_refs:
        if bucket_ref["key"] in seen_bucket_keys:
            continue
        seen_bucket_keys.add(bucket_ref["key"])
        deduped_bucket_refs.append(bucket_ref)

    if not deduped_bucket_refs:
        raise ValueError(f"LLM returned no usable entities for article: {article.title}")

    overall_sentiment_score = round(_clip(float(payload.get("overall_sentiment_score", article.sentiment_score)), -1.0, 1.0), 2)
    article_overview = " ".join(str(payload.get("article_overview", article.summary)).split()).strip() or article.summary
    article_key_points = _clean_points(
        list(payload.get("article_key_points", [])) + list(payload.get("numbers_mentioned", []))
    )

    primary_index = 0
    source_coverage_modes = list(article.source_coverage_modes) or coverage_modes_for_source_id(article.source_id)
    coverage_mode = derive_coverage_mode(
        source_id=article.source_id,
        source_lane=article.source_lane,
        source_coverage_modes=source_coverage_modes,
        entity_mentions=entity_mentions,
    )
    return replace(
        article,
        article_overview=article_overview,
        article_key_points=article_key_points,
        topic_key=deduped_bucket_refs[primary_index]["key"],
        topic_label=deduped_bucket_refs[primary_index]["label"],
        topic_kind=deduped_bucket_refs[primary_index]["kind"],
        sector_tags=list(dict.fromkeys(sector_tags or article.sector_tags)),
        stock_candidates=list(dict.fromkeys(stock_candidates)),
        stock_tickers=list(dict.fromkeys(stock_tickers)),
        bucket_keys=[item["key"] for item in deduped_bucket_refs],
        bucket_labels=[item["label"] for item in deduped_bucket_refs],
        bucket_kinds=[item["kind"] for item in deduped_bucket_refs],
        entity_mentions=entity_mentions,
        sentiment_score=overall_sentiment_score,
        sentiment_label=label_sentiment(overall_sentiment_score),
        enrichment_source="llm",
        source_coverage_modes=source_coverage_modes,
        coverage_mode=coverage_mode,
    )
