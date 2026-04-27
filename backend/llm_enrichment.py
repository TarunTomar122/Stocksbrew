"""OpenAI-backed article enrichment for Trace Money."""
from __future__ import annotations

import hashlib
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import replace
from typing import Any

import requests

from backend.coverage_mode import coverage_modes_for_source_id, derive_coverage_mode
from backend.env import load_backend_env
from backend.market_strategy import default_llm_concurrency, default_llm_model
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

load_backend_env()


OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = default_llm_model()
CACHE_VERSION = "2026-03-26-llm-v3"
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
        "name": "trace_money_article_enrichment",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "article_overview": {"type": "string"},
                "article_key_points": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "primary_event_type": {"type": "string"},
                "numbers_mentioned": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "overall_sentiment_score": {"type": "number"},
                "entities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string", "enum": ["stock", "sector", "market"]},
                            "canonical_name": {"type": "string"},
                            "ticker": {"type": "string"},
                            "sector_id": {"type": "string"},
                            "market_id": {"type": "string"},
                            "sentiment_score": {"type": "number"},
                            "confidence": {"type": "number"},
                            "relevance": {"type": "number"},
                            "mention_role": {"type": "string", "enum": ["primary", "secondary", "incidental"]},
                            "what_happened": {"type": "string"},
                            "why_it_matters": {"type": "string"},
                            "bullish_points": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "risk_points": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "entity_overview": {"type": "string"},
                            "entity_key_points": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": [
                            "type",
                            "canonical_name",
                            "ticker",
                            "sector_id",
                            "market_id",
                            "sentiment_score",
                            "confidence",
                            "relevance",
                            "mention_role",
                            "what_happened",
                            "why_it_matters",
                            "bullish_points",
                            "risk_points",
                            "entity_overview",
                            "entity_key_points",
                        ],
                        "additionalProperties": False,
                    },
                },
            },
            "required": [
                "article_overview",
                "article_key_points",
                "primary_event_type",
                "numbers_mentioned",
                "overall_sentiment_score",
                "entities",
            ],
            "additionalProperties": False,
        },
    }


def _system_prompt(market: str) -> str:
    sector_map = sector_label_map().get(market, {})
    market_map = market_bucket_map()
    sector_lines = "\n".join([f"- {sector_id}: {label}" for sector_id, label in sector_map.items()])
    market_lines = "\n".join([f"- {market_id}: {label}" for market_id, label in market_map.items()])
    market_name = "India" if market == "IN" else "United States"
    return (
        "You enrich finance news for a market-intelligence feed.\n"
        f"The article is about the {market_name} market.\n"
        "Return strict JSON only.\n"
        "Extract every clearly relevant stock, sector, or market bucket mentioned in the provided text.\n"
        "Return at least one usable entity for every article.\n"
        "If no specific stock or sector is clearly relevant, you must return a market entity.\n"
        "If the article is broad, generic, or only loosely equity-related, use market_id `general-market-updates`.\n"
        "Entities must never be empty.\n"
        "Do not invent entities. If a ticker is unclear, leave ticker as an empty string.\n"
        "Classify each stock mention as primary, secondary, or incidental.\n"
        "Only use primary when the article is materially about that stock.\n"
        "Use incidental when the stock is just a passing mention.\n"
        "For sectors, use only the allowed sector ids below. If none apply, leave sector_id as an empty string.\n"
        "For market buckets, use only the allowed market ids below. If none apply, leave market_id as an empty string.\n"
        "Sentiment must be entity-specific and on a scale from -1 to 1.\n"
        "Use confidence/relevance from 0 to 1.\n"
        "Keep overviews concise and key points factual.\n"
        "State what happened, why it matters, and include numbers only if they appear in the provided text.\n"
        "Do not write generic finance filler like 'the company is a major player', 'strong position', 'well known for', or 'this could be important for investors'.\n"
        "Do not describe a company in generic background terms unless that background fact is directly the news.\n"
        "If the article does not contain a concrete fact for a field, use 'unknown' or an empty list.\n"
        "For stock entities, `what_happened` must describe the actual event in the article, not a company description.\n"
        "For stock entities, `why_it_matters` must explain the consequence or implication using facts from the article, not generic investing language.\n"
        "For incidental mentions, keep `what_happened` short and factual, and prefer empty bullish/risk lists.\n"
        "For articles about broad market conditions, indices (S&P 500, Dow, Nasdaq Composite), "
        "Federal Reserve policy, macroeconomic data, or sector-wide trends, always include a 'market' type entity "
        "with an appropriate market_id from the allowed list below, even if individual stocks are mentioned in passing. "
        "If the article is primarily about the overall market rather than a specific company, make the market entity primary.\n"
        "Allowed sector ids:\n"
        f"{sector_lines}\n"
        "Allowed market ids:\n"
        f"{market_lines}"
    )


def _repair_system_prompt(market: str) -> str:
    market_name = "India" if market == "IN" else "United States"
    return (
        "You are repairing a failed finance-news extraction.\n"
        f"The article is about the {market_name} market.\n"
        "Return strict JSON only.\n"
        "You must return at least one usable entity.\n"
        "If a specific stock or sector is not confidently identifiable, return exactly one market entity with market_id `general-market-updates`.\n"
        "Use confidence and relevance of at least 0.8 for that fallback market entity.\n"
        "Do not return an empty entities array.\n"
    )


def _few_shot_messages() -> list[dict[str, str]]:
    return [
        {
            "role": "user",
            "content": json.dumps(
                {
                    "market": "US",
                    "title": "AMD stock rises 7% after reports of CPU price hikes",
                    "summary": "AMD and Intel shares jumped after reports that CPU prices are being raised amid stronger AI-related demand.",
                    "body_text": "AMD and Intel shares rose after reports of CPU price hikes. The report said pricing is improving as demand linked to AI servers broadens beyond GPUs. AMD shares were up 7% in the session.",
                    "source_name": "Example Finance",
                    "published_at": "2026-03-26T05:09:00+00:00",
                },
                ensure_ascii=True,
            ),
        },
        {
            "role": "assistant",
            "content": json.dumps(
                {
                    "article_overview": "AMD and Intel shares rose after reports of CPU price hikes tied to broader AI-server demand.",
                    "article_key_points": [
                        "AMD shares rose 7%.",
                        "Reports pointed to CPU price hikes.",
                        "Demand is broadening beyond GPUs into CPU-linked AI servers.",
                    ],
                    "primary_event_type": "price_move",
                    "numbers_mentioned": ["7%"],
                    "overall_sentiment_score": 0.68,
                    "entities": [
                        {
                            "type": "stock",
                            "canonical_name": "AMD",
                            "ticker": "AMD",
                            "sector_id": "semiconductors",
                            "market_id": "",
                            "sentiment_score": 0.7,
                            "confidence": 0.92,
                            "relevance": 0.97,
                            "mention_role": "primary",
                            "what_happened": "AMD shares rose 7% after reports of CPU price hikes.",
                            "why_it_matters": "Higher CPU pricing and broader AI-server demand could support AMD revenue beyond GPU-only AI exposure.",
                            "bullish_points": [
                                "AMD shares rose 7%.",
                                "CPU pricing improved as AI-server demand broadened."
                            ],
                            "risk_points": [],
                            "entity_overview": "AMD shares rose on reports of stronger CPU pricing linked to AI demand.",
                            "entity_key_points": [
                                "AMD shares rose 7%.",
                                "CPU pricing improved as AI-server demand broadened."
                            ]
                        }
                    ],
                },
                ensure_ascii=True,
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "market": "US",
                    "title": "Arm launches AI data-center chip with Meta as anchor customer",
                    "summary": "Arm introduced a new AI chip and said Meta is the anchor customer.",
                    "body_text": "Arm launched an AI-focused data-center chip. Meta is the anchor customer. Arm said the product could generate about $15 billion in annual revenue in roughly five years. AMD and Nvidia were mentioned as existing semiconductor competitors.",
                    "source_name": "Example Finance",
                    "published_at": "2026-03-26T07:00:00+00:00",
                },
                ensure_ascii=True,
            ),
        },
        {
            "role": "assistant",
            "content": json.dumps(
                {
                    "article_overview": "Arm launched an AI data-center chip, named Meta as the anchor customer, and said the product could reach about $15 billion in annual revenue within five years.",
                    "article_key_points": [
                        "Arm launched an AI data-center chip.",
                        "Meta is the anchor customer.",
                        "Arm said the product could reach about $15 billion in annual revenue within five years."
                    ],
                    "primary_event_type": "product",
                    "numbers_mentioned": ["$15 billion", "five years"],
                    "overall_sentiment_score": 0.62,
                    "entities": [
                        {
                            "type": "stock",
                            "canonical_name": "Nvidia",
                            "ticker": "NVDA",
                            "sector_id": "semiconductors",
                            "market_id": "",
                            "sentiment_score": 0.0,
                            "confidence": 0.78,
                            "relevance": 0.55,
                            "mention_role": "incidental",
                            "what_happened": "Nvidia was mentioned only as an existing semiconductor competitor.",
                            "why_it_matters": "unknown",
                            "bullish_points": [],
                            "risk_points": [],
                            "entity_overview": "Nvidia is only a contextual competitor mention in this article.",
                            "entity_key_points": []
                        },
                        {
                            "type": "market",
                            "canonical_name": "General market updates",
                            "ticker": "",
                            "sector_id": "",
                            "market_id": "general-market-updates",
                            "sentiment_score": 0.4,
                            "confidence": 0.86,
                            "relevance": 0.88,
                            "mention_role": "primary",
                            "what_happened": "Arm launched an AI data-center chip and named Meta as the anchor customer.",
                            "why_it_matters": "The launch adds competition in AI data-center chips and carries a stated $15 billion revenue target over five years.",
                            "bullish_points": [
                                "Meta is the anchor customer.",
                                "Arm cited a potential $15 billion annual revenue opportunity."
                            ],
                            "risk_points": [],
                            "entity_overview": "The article is mainly about a new AI-chip product launch and its market implications.",
                            "entity_key_points": [
                                "Arm launched an AI data-center chip.",
                                "Meta is the anchor customer.",
                                "Arm cited a potential $15 billion annual revenue opportunity."
                            ]
                        }
                    ],
                },
                ensure_ascii=True,
            ),
        },
    ]


def _user_prompt(article: Article) -> str:
    return json.dumps(
        {
            "market": article.market,
            "title": article.title,
            "summary": article.summary,
            "body_text": article.body_text[:6000],
            "source_name": article.source_name,
            "published_at": article.published_at,
        },
        ensure_ascii=True,
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
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "").strip()
        self.model = model or os.getenv("TRACE_MONEY_LLM_MODEL", DEFAULT_MODEL)
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
            raise ValueError("OPENAI_API_KEY is required because heuristic enrichment has been removed")
        self._ensure_store()
        enriched: list[Article | None] = [None] * len(articles)
        pending: list[tuple[int, Article, str]] = []
        for index, article in enumerate(articles):
            cache_key = self._cache_key(article)
            payload = self._get_cached_payload(cache_key)
            if payload is None:
                pending.append((index, article, cache_key))
                continue
            try:
                enriched[index] = apply_enrichment(article, payload)
            except ValueError:
                pending.append((index, article, cache_key))

        if pending:
            with ThreadPoolExecutor(max_workers=min(self.max_workers, len(pending))) as executor:
                future_map = {
                    executor.submit(self._enrich_article, article, cache_key): index
                    for index, article, cache_key in pending
                }
                for future in as_completed(future_map):
                    enriched[future_map[future]] = future.result()

        return [article for article in enriched if article is not None]

    def _extract(self, article: Article, repair: bool = False) -> dict[str, Any]:
        response = self._post_with_retry(article, repair=repair)
        payload = response.json()
        message = payload["choices"][0]["message"]
        if message.get("refusal"):
            raise ValueError("OpenAI refused enrichment request")
        content = message.get("content", "")
        if not content:
            raise ValueError("OpenAI returned empty content")
        return json.loads(content)

    def _request_payload(self, article: Article, repair: bool = False) -> dict[str, Any]:
        return {
            "model": self.model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": _repair_system_prompt(article.market) if repair else _system_prompt(article.market)},
                *([] if repair else _few_shot_messages()),
                {"role": "user", "content": _user_prompt(article)},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": _response_schema(),
            },
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
                    OPENAI_API_URL,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=self._request_payload(article, repair=repair),
                    timeout=self.timeout,
                )
                response.raise_for_status()
                return response
            except Exception as error:
                last_error = error
                if attempt >= self.max_attempts or not self._is_retryable(error):
                    raise
                time.sleep(min(2 ** (attempt - 1), 8))
        if last_error is not None:
            raise last_error
        raise RuntimeError("OpenAI request failed without an error")

    def _cache_key(self, article: Article) -> str:
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
        payload = self._extract(article)
        try:
            enriched = apply_enrichment(article, payload)
        except ValueError:
            repaired_payload = self._extract(article, repair=True)
            try:
                enriched = apply_enrichment(article, repaired_payload)
                self._save_cached_payload(cache_key, article, repaired_payload)
                return enriched
            except ValueError:
                fallback_payload = _fallback_payload(article)
                enriched = apply_enrichment(article, fallback_payload)
                self._save_cached_payload(cache_key, article, fallback_payload)
                return enriched
        self._save_cached_payload(cache_key, article, payload)
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
