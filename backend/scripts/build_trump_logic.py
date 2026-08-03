from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from backend.llm_client import (
    json_response_format,
    llm_api_key,
    llm_api_url,
    llm_headers,
    llm_model,
    parse_json_content,
    schema_system_prompt,
)
from backend.storage import TraceMoneyStore
from backend.truth_social_client import fetch_trump_truth_posts

OPENAI_DEFAULT_MODEL = "gpt-5.6-luna"
DEFAULT_BATCH_SIZE = 50
DEFAULT_INCREMENTAL_FETCH_DAYS = 5

SCAN_PROMPT = """You screen Donald Trump Truth Social posts for stock-market relevance.
Return JSON:
{
  "results": [
    {
      "post_id": "same id from input",
      "has_market_mention": true,
      "sentiment": "bullish|bearish|neutral|mixed",
      "tickers": ["NVDA"],
      "company_names": ["Nvidia"],
      "highlight": "Max 15 words: what he said about the company/market"
    }
  ]
}
Rules:
- Evaluate EVERY input post. If no public-company or market mention, set has_market_mention=false and omit the other fields.
- has_market_mention=true when the post mentions: a publicly traded US company by name, a US ticker, stocks/markets, tariffs/trade with economic impact, Fed/rates, oil/energy, major indices, or policy with a clear market channel.
- sentiment is ONLY about the market/company angle — bullish, bearish, neutral, or mixed.
- tickers: US symbols only when confident. company_names: plain names he used (e.g. Dell, Nvidia, Apple).
- highlight: short paraphrase, no quote dumps, no politics filler.
- Do not invent companies or tickers not grounded in the post text.
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_published_at(value: str | None) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _seed_ingested_from_snapshot(data: dict[str, Any]) -> set[str]:
    """Backfill known post ids from a pre-incremental snapshot."""
    seeded: set[str] = set()
    for row in (data.get("mentions") or data.get("posts") or []):
        if not isinstance(row, dict):
            continue
        post_id = str(row.get("post_id") or "").strip()
        if post_id:
            seeded.add(post_id)
    for ticker_row in data.get("tickers") or []:
        if not isinstance(ticker_row, dict):
            continue
        for mention in ticker_row.get("mentions") or []:
            if not isinstance(mention, dict):
                continue
            post_id = str(mention.get("post_id") or "").strip()
            if post_id:
                seeded.add(post_id)
    return seeded


def _load_existing_snapshot(store: TraceMoneyStore, market: str) -> tuple[dict[str, Any] | None, set[str]]:
    doc = store.db.collection("trump_logic_snapshots").document(f"{market}__latest").get()
    if not doc.exists:
        return None, set()
    data = doc.to_dict() or {}
    ingested = {
        str(post_id).strip()
        for post_id in (data.get("ingested_post_ids") or [])
        if str(post_id).strip()
    }
    if not ingested:
        ingested = _seed_ingested_from_snapshot(data)
    return data, ingested


def _prune_mentions(mentions: list[dict[str, Any]], *, lookback_days: int) -> list[dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, lookback_days))
    kept: list[dict[str, Any]] = []
    for mention in mentions:
        published = _parse_published_at(str(mention.get("published_at") or ""))
        if published and published < cutoff:
            continue
        kept.append(mention)
    kept.sort(key=lambda row: str(row.get("published_at") or ""), reverse=True)
    return kept


def _merge_mentions(
    existing: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_id = {
        str(row.get("post_id") or "").strip(): row
        for row in existing
        if str(row.get("post_id") or "").strip()
    }
    for row in incoming:
        post_id = str(row.get("post_id") or "").strip()
        if post_id:
            by_id[post_id] = row
    merged = list(by_id.values())
    merged.sort(key=lambda row: str(row.get("published_at") or ""), reverse=True)
    return merged


def _prune_ingested_ids(
    ingested_ids: set[str],
    *,
    lookback_days: int,
    recent_posts: list[dict[str, Any]],
) -> set[str]:
    """Keep the rolling window of known post ids bounded."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, lookback_days))
    kept: set[str] = set()
    for post in recent_posts:
        post_id = str(post.get("post_id") or "").strip()
        published = _parse_published_at(str(post.get("published_at") or ""))
        if not post_id:
            continue
        if published and published < cutoff:
            continue
        kept.add(post_id)
    for post_id in ingested_ids:
        kept.add(post_id)
    return kept


def _normalize_name(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(
        r"\b(inc|inc\.|corp|corporation|ltd|limited|holdings?|company|co|plc|class a|class b)\b",
        " ",
        text,
    )
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _load_instrument_index(
    store: TraceMoneyStore,
    market: str,
) -> tuple[set[str], dict[str, str]]:
    """Return supported tickers and normalized company-name -> ticker map."""
    supported: set[str] = set()
    name_to_ticker: dict[str, str] = {}
    docs = (
        store.db.collection("tm_instruments")
        .where("market", "==", str(market).upper())
        .select(["ticker", "name"])
        .stream()
    )
    for doc in docs:
        payload = doc.to_dict() or {}
        ticker = str(payload.get("ticker") or "").strip().upper()
        name = str(payload.get("name") or "").strip()
        if not ticker:
            continue
        supported.add(ticker)
        norm = _normalize_name(name)
        if norm and norm not in name_to_ticker:
            name_to_ticker[norm] = ticker
        # First token alias (e.g. "NVIDIA Corporation" -> "nvidia")
        first = norm.split(" ", 1)[0] if norm else ""
        if first and len(first) >= 3 and first not in name_to_ticker:
            name_to_ticker[first] = ticker
    return supported, name_to_ticker


def _llm_scan_batch(
    posts: list[dict[str, Any]],
    *,
    api_key: str,
    model: str,
    timeout_seconds: int,
) -> list[dict[str, Any]]:
    lines = []
    for index, post in enumerate(posts, start=1):
        lines.append(
            json.dumps(
                {
                    "index": index,
                    "post_id": post.get("post_id"),
                    "published_at": post.get("published_at"),
                    "text": str(post.get("text") or "")[:700],
                },
                ensure_ascii=True,
            )
        )
    resp = requests.post(
        llm_api_url(),
        headers=llm_headers(api_key),
        json={
            "model": model,
            "reasoning_effort": "low",
            "messages": [
                {
                    "role": "system",
                    "content": schema_system_prompt(SCAN_PROMPT, {"type": "object"}),
                },
                {"role": "user", "content": "\n".join(lines)},
            ],
            "response_format": json_response_format(),
        },
        timeout=max(90, int(timeout_seconds)),
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    payload = parse_json_content(content)
    rows = payload.get("results") if isinstance(payload, dict) else None
    return [row for row in rows or [] if isinstance(row, dict)]


def _llm_scan_all(
    posts: list[dict[str, Any]],
    *,
    timeout_seconds: int,
    batch_size: int,
) -> list[dict[str, Any]]:
    api_key = llm_api_key()
    if not api_key or not posts:
        return []
    model = llm_model(OPENAI_DEFAULT_MODEL)
    merged: list[dict[str, Any]] = []
    chunk_size = max(10, batch_size)

    for offset in range(0, len(posts), chunk_size):
        chunk = posts[offset : offset + chunk_size]
        try:
            batch_rows = _llm_scan_batch(
                chunk,
                api_key=api_key,
                model=model,
                timeout_seconds=timeout_seconds,
            )
            merged.extend(batch_rows)
            print({"stage": "trump_logic_scan_batch", "offset": offset, "size": len(chunk), "hits": len(batch_rows)})
        except Exception as exc:
            print({"stage": "trump_logic_scan_batch_failed", "offset": offset, "error": str(exc)})
    return merged


def _resolve_tickers(
    row: dict[str, Any],
    *,
    supported: set[str],
    name_to_ticker: dict[str, str],
) -> list[str]:
    tickers: set[str] = set()
    for raw in row.get("tickers") or []:
        symbol = str(raw or "").strip().upper().lstrip("$")
        if symbol in supported:
            tickers.add(symbol)
    for raw_name in row.get("company_names") or []:
        norm = _normalize_name(str(raw_name or ""))
        if not norm:
            continue
        if norm in name_to_ticker:
            tickers.add(name_to_ticker[norm])
            continue
        for token in norm.split():
            if len(token) >= 3 and token in name_to_ticker:
                tickers.add(name_to_ticker[token])
    highlight = str(row.get("highlight") or "")
    for match in re.findall(r"\$([A-Za-z]{1,5})\b", highlight):
        symbol = match.upper()
        if symbol in supported:
            tickers.add(symbol)
    return sorted(tickers)[:8]


def _build_mentions(
    raw_posts: list[dict[str, Any]],
    scan_rows: list[dict[str, Any]],
    *,
    supported: set[str],
    name_to_ticker: dict[str, str],
) -> list[dict[str, Any]]:
    by_id = {str(p.get("post_id") or ""): p for p in raw_posts if p.get("post_id")}
    mentions: list[dict[str, Any]] = []

    for row in scan_rows:
        if not row.get("has_market_mention"):
            continue
        post_id = str(row.get("post_id") or "").strip()
        base = by_id.get(post_id)
        if not base:
            continue
        tickers = _resolve_tickers(row, supported=supported, name_to_ticker=name_to_ticker)
        highlight = str(row.get("highlight") or "").strip()[:200]
        sentiment = str(row.get("sentiment") or "neutral").strip().lower()
        if sentiment not in {"bullish", "bearish", "neutral", "mixed"}:
            sentiment = "neutral"

        mentions.append(
            {
                "post_id": post_id,
                "published_at": base.get("published_at"),
                "truth_url": base.get("truth_url"),
                "archive_url": base.get("archive_url"),
                "source": base.get("source") or "truth_social",
                "said": highlight or "Mentioned a market-relevant company or topic.",
                "sentiment": sentiment,
                "tickers": tickers,
                "company_names": [
                    str(name).strip()
                    for name in (row.get("company_names") or [])
                    if str(name).strip()
                ][:6],
            }
        )
    mentions.sort(key=lambda row: str(row.get("published_at") or ""), reverse=True)
    return mentions


def _build_ticker_index(mentions: list[dict[str, Any]], *, market: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for mention in mentions:
        tickers = mention.get("tickers") or []
        if not tickers:
            grouped["__macro__"].append(mention)
            continue
        for ticker in tickers:
            grouped[str(ticker).upper()].append(mention)

    rows: list[dict[str, Any]] = []
    for ticker, items in grouped.items():
        if ticker == "__macro__":
            continue
        items.sort(key=lambda row: str(row.get("published_at") or ""), reverse=True)
        latest = items[0]
        bullish = sum(1 for item in items if item.get("sentiment") == "bullish")
        bearish = sum(1 for item in items if item.get("sentiment") == "bearish")
        rows.append(
            {
                "ticker": ticker,
                "market": market,
                "mention_count": len(items),
                "bullish_count": bullish,
                "bearish_count": bearish,
                "latest_sentiment": latest.get("sentiment") or "neutral",
                "latest_said": latest.get("said") or "",
                "latest_published_at": latest.get("published_at") or "",
                "mentions": items,
            }
        )

    rows.sort(
        key=lambda row: (
            int(row.get("mention_count") or 0),
            str(row.get("latest_published_at") or ""),
        ),
        reverse=True,
    )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Build daily Trump Logic snapshot (Truth Social)")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--lookback-days", type=int, default=90)
    parser.add_argument("--max-posts", type=int, default=5000)
    parser.add_argument("--rss-chunk-days", type=int, default=7)
    parser.add_argument("--incremental-fetch-days", type=int, default=DEFAULT_INCREMENTAL_FETCH_DAYS)
    parser.add_argument("--llm-timeout-seconds", type=int, default=240)
    parser.add_argument("--llm-batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument(
        "--full-refresh",
        action="store_true",
        help="Re-bootstrap the full lookback window (default: incremental new posts only)",
    )
    args = parser.parse_args()

    store = TraceMoneyStore()
    existing, ingested_ids = _load_existing_snapshot(store, args.market)
    lookback_days = max(1, args.lookback_days)
    incremental_fetch_days = max(1, args.incremental_fetch_days)

    full_refresh = bool(args.full_refresh or not existing)
    ingest_mode = "full" if full_refresh else "incremental"

    if full_refresh:
        fetched = fetch_trump_truth_posts(
            lookback_days=lookback_days,
            max_posts=max(100, args.max_posts),
            chunk_days=max(1, args.rss_chunk_days),
        )
        new_posts = fetched
        ingested_ids = {
            str(post.get("post_id") or "").strip()
            for post in fetched
            if str(post.get("post_id") or "").strip()
        }
    else:
        fetched = fetch_trump_truth_posts(
            lookback_days=incremental_fetch_days,
            max_posts=max(100, args.max_posts),
            chunk_days=max(1, min(args.rss_chunk_days, incremental_fetch_days)),
        )
        new_posts = [
            post
            for post in fetched
            if str(post.get("post_id") or "").strip()
            and str(post.get("post_id") or "").strip() not in ingested_ids
        ]
        for post in fetched:
            post_id = str(post.get("post_id") or "").strip()
            if post_id:
                ingested_ids.add(post_id)
        ingested_ids = _prune_ingested_ids(
            ingested_ids,
            lookback_days=lookback_days,
            recent_posts=fetched,
        )

    supported, name_to_ticker = _load_instrument_index(store, args.market)

    scan_rows: list[dict[str, Any]] = []
    if new_posts:
        try:
            scan_rows = _llm_scan_all(
                new_posts,
                timeout_seconds=args.llm_timeout_seconds,
                batch_size=args.llm_batch_size,
            )
        except Exception as exc:
            print({"stage": "trump_logic_scan_failed", "error": str(exc)})

    new_mentions = _build_mentions(
        new_posts,
        scan_rows,
        supported=supported,
        name_to_ticker=name_to_ticker,
    )
    prior_mentions = []
    if existing and not full_refresh:
        prior_mentions = [
            row
            for row in (existing.get("mentions") or existing.get("posts") or [])
            if isinstance(row, dict)
        ]
    mentions = _prune_mentions(
        _merge_mentions(prior_mentions, new_mentions),
        lookback_days=lookback_days,
    )
    tickers = _build_ticker_index(mentions, market=args.market)

    payload = {
        "version": 2,
        "market": args.market,
        "generated_at": _utc_now(),
        "handle": "realDonaldTrump",
        "ingest_mode": ingest_mode,
        "ingested_post_ids": sorted(ingested_ids),
        "posts_fetched_this_run": len(fetched),
        "posts_scanned_this_run": len(new_posts),
        "posts_fetched": len(ingested_ids),
        "posts_scanned": len(ingested_ids),
        "posts_with_mentions": len(mentions),
        "ticker_count": len(tickers),
        "tickers": tickers,
        "mentions": mentions,
        "lookback_days": lookback_days,
        "incremental_fetch_days": incremental_fetch_days,
        "source_note": (
            f"Ticker index from Truth Social over {lookback_days} days. "
            f"{'Full bootstrap' if full_refresh else 'Incremental'} ingest — "
            f"only new posts hit AI; rolling window prunes older mentions."
        ),
        # Legacy fields for older readers
        "posts_candidates": len(new_posts),
        "posts_market_relevant": len(mentions),
        "posts": mentions,
    }
    store.db.collection("trump_logic_snapshots").document(f"{args.market}__latest").set(payload)
    store.save_stage_watermark(
        market=args.market,
        stage_key="build_trump_logic",
        universe_id=store.get_active_price_universe(args.market) or "global",
        expected_count=len(new_posts),
        success_count=len(new_mentions),
        error_count=0,
        metadata={
            "ticker_count": len(tickers),
            "batch_size": args.llm_batch_size,
            "ingest_mode": ingest_mode,
            "fetched_this_run": len(fetched),
        },
    )
    print(
        {
            "market": args.market,
            "ingest_mode": ingest_mode,
            "fetched_this_run": len(fetched),
            "new_posts_scanned": len(new_posts),
            "new_mentions": len(new_mentions),
            "total_mentions": len(mentions),
            "tickers": len(tickers),
            "llm_batches": (
                (len(new_posts) + max(10, args.llm_batch_size) - 1) // max(10, args.llm_batch_size)
                if new_posts
                else 0
            ),
        }
    )


if __name__ == "__main__":
    main()
