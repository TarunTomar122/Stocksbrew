from __future__ import annotations

import argparse
import html
import json
import os
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

USER_AGENT = "tikrr-reddit-buzz/2.0"
DEFAULT_SUBREDDITS = [
    "wallstreetbets",
    "stocks",
    "investing",
    "StockMarket",
    "options",
    "shortsqueeze",
    "SecurityAnalysis",
    "ValueInvesting",
    "dividends",
    "ETFs",
    "pennystocks",
]
OPENAI_DEFAULT_MODEL = "gpt-4.1-mini"
DEFAULT_SUBREDDIT_BATCH_SIZE = 4
DEFAULT_CACHE_HOURS = 48

TICKER_EXTRACTION_PROMPT = """You extract stock buzz from Reddit posts.
Return JSON object:
{
  "market_mood": "bullish|bearish|mixed|neutral",
  "top_themes": ["..."],
  "tickers": {
    "NVDA": {
      "mentions": 4,
      "sentiment": "bullish|bearish|neutral",
      "context": "2 concise sentences explaining the catalyst or narrative",
      "catalysts": ["...", "..."],
      "company_name": "NVIDIA Corporation",
      "exchange_hint": "NASDAQ|NYSE|AMEX|UNKNOWN",
      "confidence": 0.0,
      "evidence_span": "short quote or phrase from post text"
    }
  },
  "notable_posts": [
    {"title":"...", "subreddit":"...", "why_notable":"...", "tickers":["NVDA","AMD"]}
  ]
}
Rules:
- Output valid JSON only.
- Use only US stock tickers; no crypto.
- `candidate_tickers` is a deterministic pre-scan of supported tickers found in the posts.
- Prefer producing ticker narratives for candidate tickers with concrete post evidence.
- Do not return mention-count filler. If the posts do not explain a ticker narrative, omit that ticker.
- No filler language like "users are saying"; explain the market narrative directly.
- Confidence must be 0..1 and should be low when ticker/company mapping is uncertain.
"""


def _ticker_context_doc_id(market: str, ticker: str) -> str:
    return f"{market.upper()}__{str(ticker or '').strip().upper()}"


def _write_ticker_read_models(store: TraceMoneyStore, market: str, payload: dict[str, Any]) -> None:
    """Write per-ticker Reddit context docs for stock pages."""
    market_key = market.upper()
    tickers = [row for row in (payload.get("tickers") or []) if isinstance(row, dict)]
    top_posts = [row for row in (payload.get("top_posts") or []) if isinstance(row, dict)]
    notable = payload.get("notable_discussions") or []
    current_tickers = sorted({str(row.get("ticker") or "").strip().upper() for row in tickers if row.get("ticker")})
    index_ref = store.db.collection("reddit_ticker_context_index").document(market_key)
    previous = index_ref.get()
    previous_tickers: list[str] = []
    if previous.exists:
        previous_data = previous.to_dict() or {}
        previous_tickers = [
            str(ticker or "").strip().upper()
            for ticker in (previous_data.get("tickers") or [])
            if str(ticker or "").strip()
        ]

    batch = store.db.batch()
    collection = store.db.collection("reddit_ticker_contexts")
    for row in tickers:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        ticker_posts = [
            post
            for post in top_posts
            if ticker in {str(t or "").strip().upper() for t in (post.get("tickers") or [])}
        ]
        batch.set(
            collection.document(_ticker_context_doc_id(market_key, ticker)),
            {
                "market": market_key,
                "ticker": ticker,
                "generated_at": payload.get("generated_at"),
                "post_count": payload.get("post_count") or 0,
                "cue": row,
                "top_posts": ticker_posts,
                "notable_discussions": notable,
            },
        )
    for ticker in sorted(set(previous_tickers) - set(current_tickers)):
        batch.delete(collection.document(_ticker_context_doc_id(market_key, ticker)))
    batch.set(
        index_ref,
        {
            "market": market_key,
            "generated_at": payload.get("generated_at"),
            "tickers": current_tickers,
            "count": len(current_tickers),
        },
    )
    batch.commit()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _post_cache_id(market: str, subreddit: str) -> str:
    safe_subreddit = re.sub(r"[^A-Za-z0-9_-]+", "_", str(subreddit or "").strip())
    return f"{market.upper()}__{safe_subreddit}"


def _post_key(post: dict[str, Any]) -> str:
    raw = str(post.get("id") or "").strip()
    if raw:
        return raw
    return f"{post.get('subreddit', '')}:{post.get('url', '')}:{post.get('title', '')}"


def _prune_cached_posts(posts: list[dict[str, Any]], cache_hours: int) -> list[dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, cache_hours))
    kept: list[dict[str, Any]] = []
    seen: set[str] = set()
    for post in posts:
        if not isinstance(post, dict):
            continue
        key = _post_key(post)
        if not key or key in seen:
            continue
        published = _parse_datetime(post.get("published"))
        if published and published < cutoff:
            continue
        seen.add(key)
        kept.append(post)
    kept.sort(key=lambda row: str(row.get("published") or ""), reverse=True)
    return kept


def _load_cached_posts(store: TraceMoneyStore, market: str, cache_hours: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    docs = (
        store.db.collection("reddit_post_cache")
        .where("market", "==", market.upper())
        .stream()
    )
    for doc in docs:
        payload = doc.to_dict() or {}
        rows.extend(post for post in (payload.get("posts") or []) if isinstance(post, dict))
    return _prune_cached_posts(rows, cache_hours)


def _write_subreddit_cache(
    store: TraceMoneyStore,
    *,
    market: str,
    subreddit: str,
    fetched_posts: list[dict[str, Any]],
    cache_hours: int,
) -> int:
    ref = store.db.collection("reddit_post_cache").document(_post_cache_id(market, subreddit))
    current = ref.get()
    existing = []
    if current.exists:
        existing = [
            post
            for post in ((current.to_dict() or {}).get("posts") or [])
            if isinstance(post, dict)
        ]

    by_id = {_post_key(post): post for post in existing if _post_key(post)}
    before = len(by_id)
    for post in fetched_posts:
        key = _post_key(post)
        if key:
            by_id[key] = post
    posts = _prune_cached_posts(list(by_id.values()), cache_hours)
    ref.set(
        {
            "market": market.upper(),
            "subreddit": subreddit,
            "updated_at": _utc_now(),
            "cache_hours": max(1, cache_hours),
            "post_count": len(posts),
            "posts": posts[:250],
        }
    )
    return max(0, len(by_id) - before)


def _select_subreddit_batch(
    store: TraceMoneyStore,
    *,
    market: str,
    subreddits: list[str],
    batch_size: int,
) -> list[str]:
    if not subreddits:
        return []
    if batch_size <= 0 or batch_size >= len(subreddits):
        return subreddits

    ref = store.db.collection("reddit_pipeline_state").document(market.upper())
    snap = ref.get()
    current = int((snap.to_dict() or {}).get("next_subreddit_index") or 0) if snap.exists else 0
    start = current % len(subreddits)
    selected = [subreddits[(start + offset) % len(subreddits)] for offset in range(batch_size)]
    ref.set(
        {
            "market": market.upper(),
            "next_subreddit_index": (start + batch_size) % len(subreddits),
            "last_selected_subreddits": selected,
            "updated_at": _utc_now(),
        },
        merge=True,
    )
    return selected


def _strip_html(raw: str) -> str:
    text = html.unescape(str(raw or ""))
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _fetch_rss(subreddit: str, timeout_s: int) -> list[dict[str, Any]]:
    url = f"https://www.reddit.com/r/{subreddit}/hot.rss"
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout_s)
    resp.raise_for_status()
    xml = resp.text
    rows: list[dict[str, Any]] = []
    for entry in re.findall(r"<entry>([\s\S]*?)</entry>", xml):
        def tag(name: str) -> str:
            m = re.search(rf"<{name}[^>]*>([\s\S]*?)</{name}>", entry)
            return _strip_html(m.group(1)).strip() if m else ""

        title = tag("title")
        if not title:
            continue
        link_match = re.search(r'<link[^>]*href="([^"]+)"', entry)
        rows.append(
            {
                "id": tag("id").replace("t3_", ""),
                "title": title,
                "subreddit": subreddit,
                "selftext": tag("content")[:700],
                "url": link_match.group(1).strip() if link_match else "",
                "permalink": "",
                "published": tag("published") or tag("updated"),
            }
        )
    return rows


STOPWORDS = {
    "THE", "AND", "FOR", "ARE", "WITH", "THIS", "THAT", "FROM", "WILL", "YOUR",
    "YOLO", "FOMO", "DD", "ETF", "CEO", "CPI", "GDP", "FED", "SEC", "FDA",
    "CALL", "CALLS", "PUT", "PUTS", "HOLD", "SELL", "BUY", "LONG", "SHORT",
}

HEURISTIC_AMBIGUOUS_TICKERS = {
    "A", "AA", "AI", "ALL", "AM", "AMP", "AN", "ARE", "AS", "AT", "BR", "BY",
    "CAN", "CEO", "DD", "EDIT", "ELSE", "EV", "FOR", "GO", "HAS", "HE", "HIM",
    "I", "IN", "IT", "JOB", "KEY", "LINK", "LOW", "MD", "ME", "MY", "NOW",
    "ON", "OR", "OUT", "R", "REDD", "S", "SO", "T", "TD", "TO", "U", "US",
    "V", "W", "WELL", "WHY", "X", "Y", "YOU",
}


def _extract_heuristic_candidates(text: str) -> list[str]:
    out: list[str] = []
    raw = str(text or "")
    for token in re.findall(r"\$([A-Za-z]{1,5})\b", raw):
        out.append(token.upper())
    for token in re.findall(r"\b[A-Z]{3,5}\b", raw):
        out.append(token)
    return out


def _post_supported_tickers(post: dict[str, Any], supported_tickers: set[str]) -> list[str]:
    text = f"{post.get('title', '')} {post.get('selftext', '')}"
    tickers: list[str] = []
    seen: set[str] = set()
    for token in _extract_heuristic_candidates(text):
        if token in STOPWORDS or token in HEURISTIC_AMBIGUOUS_TICKERS or len(token) <= 1:
            continue
        if token not in supported_tickers or token in seen:
            continue
        seen.add(token)
        tickers.append(token)
    return tickers


def _brief_text(value: Any, limit: int = 420) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:")
    return f"{cut}..."


def _build_llm_context(
    posts: list[dict[str, Any]],
    *,
    supported_tickers: set[str],
    max_posts: int = 160,
    max_ticker_examples: int = 4,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ticker_stats: dict[str, dict[str, Any]] = {}
    enriched_posts: list[dict[str, Any]] = []
    for post in posts:
        tickers = _post_supported_tickers(post, supported_tickers)
        enriched = dict(post)
        enriched["_supported_tickers"] = tickers
        enriched_posts.append(enriched)
        for ticker in tickers:
            stats = ticker_stats.setdefault(ticker, {"ticker": ticker, "mentions": 0, "examples": []})
            stats["mentions"] += 1
            if len(stats["examples"]) < max_ticker_examples:
                stats["examples"].append(
                    {
                        "subreddit": str(post.get("subreddit") or ""),
                        "title": _brief_text(post.get("title"), 180),
                    }
                )

    candidate_tickers = sorted(
        ticker_stats.values(),
        key=lambda row: (int(row.get("mentions") or 0), len(row.get("examples") or [])),
        reverse=True,
    )

    relevant_posts = [post for post in enriched_posts if post.get("_supported_tickers")]
    filler_posts = [post for post in enriched_posts if not post.get("_supported_tickers")]
    selected_posts = (relevant_posts + filler_posts)[:max_posts]
    llm_posts = [
        {
            "index": index,
            "subreddit": str(post.get("subreddit") or ""),
            "published": str(post.get("published") or ""),
            "title": _brief_text(post.get("title"), 220),
            "body": _brief_text(post.get("selftext"), 360),
            "candidate_tickers": post.get("_supported_tickers") or [],
        }
        for index, post in enumerate(selected_posts, start=1)
    ]
    return candidate_tickers, llm_posts


def _heuristic_fallback(
    posts: list[dict[str, Any]],
    max_tickers: int,
    supported_tickers: set[str] | None = None,
) -> tuple[list[dict[str, Any]], str, list[str]]:
    stats: dict[str, int] = defaultdict(int)
    for post in posts:
        text = f"{post.get('title', '')} {post.get('selftext', '')}"
        for token in _extract_heuristic_candidates(text):
            if token in STOPWORDS or token in HEURISTIC_AMBIGUOUS_TICKERS or len(token) <= 1:
                continue
            if supported_tickers is not None and token not in supported_tickers:
                continue
            stats[token] += 1
    ranked = sorted(stats.items(), key=lambda item: item[1], reverse=True)[:max_tickers]
    tickers = [
        {
            "ticker": symbol,
            "sentiment": "neutral",
            "summary": f"{symbol} mentioned in {count} Reddit posts.",
            "mention_count": int(count),
            "catalysts": [],
            "source": "heuristic",
        }
        for symbol, count in ranked
    ]
    return tickers, "neutral", []


def _supplement_with_heuristics(
    *,
    posts: list[dict[str, Any]],
    existing: list[dict[str, Any]],
    max_tickers: int,
    supported_tickers: set[str],
) -> list[dict[str, Any]]:
    if len(existing) >= max_tickers:
        return existing[:max_tickers]

    existing_by_ticker = {
        str(row.get("ticker") or "").strip().upper(): dict(row)
        for row in existing
        if str(row.get("ticker") or "").strip()
    }
    existing_order = [
        str(row.get("ticker") or "").strip().upper()
        for row in existing
        if str(row.get("ticker") or "").strip()
    ]
    heuristics, _, _ = _heuristic_fallback(posts, max_tickers=max_tickers * 3, supported_tickers=supported_tickers)
    remaining_slots = min(max_tickers - len(existing_order), 6)
    added_order: list[str] = []
    for row in heuristics:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker or ticker in existing_by_ticker:
            continue
        if ticker not in supported_tickers:
            continue
        existing_by_ticker[ticker] = row
        added_order.append(ticker)
        if len(added_order) >= remaining_slots or len(existing_by_ticker) >= max_tickers:
            break

    merged = [existing_by_ticker[ticker] for ticker in existing_order if ticker in existing_by_ticker]
    merged.extend(existing_by_ticker[ticker] for ticker in added_order if ticker in existing_by_ticker)
    return merged[:max_tickers]


def _normalize_name(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\b(inc|inc\.|corp|corporation|ltd|limited|holdings?|company|co|plc|class a|class b)\b", " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _load_supported_tickers(store: TraceMoneyStore, market: str) -> set[str]:
    docs = (
        store.db.collection("tm_instruments")
        .where("market", "==", str(market).upper())
        .select(["ticker"])
        .stream()
    )
    out: set[str] = set()
    for doc in docs:
        payload = doc.to_dict() or {}
        ticker = str(payload.get("ticker") or "").strip().upper()
        if ticker:
            out.add(ticker)
    return out


def _resolve_llm_config() -> tuple[str, str, str] | None:
    """Return OpenAI credentials for Reddit ticker extraction."""
    api_key = llm_api_key()
    if not api_key:
        return None
    model = llm_model(OPENAI_DEFAULT_MODEL)
    return api_key, model, llm_api_url()


def _llm_extract(
    posts: list[dict[str, Any]],
    *,
    supported_tickers: set[str],
    timeout_seconds: int,
) -> dict[str, Any] | None:
    resolved = _resolve_llm_config()
    if not resolved:
        return None
    api_key, model, endpoint = resolved
    if not api_key:
        return None
    candidate_tickers, llm_posts = _build_llm_context(posts, supported_tickers=supported_tickers)
    user_payload = {
        "candidate_tickers": candidate_tickers[:80],
        "posts": llm_posts,
    }
    resp = requests.post(
        endpoint,
        headers=llm_headers(api_key),
        json={
            "model": model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": schema_system_prompt(TICKER_EXTRACTION_PROMPT, {"type": "object"})},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
            ],
            "response_format": json_response_format(),
        },
        timeout=max(45, int(timeout_seconds)),
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return parse_json_content(content)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Reddit buzz snapshot for a market")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    parser.add_argument("--subreddits", default=",".join(DEFAULT_SUBREDDITS))
    parser.add_argument("--posts-per-subreddit", type=int, default=25)
    parser.add_argument("--max-tickers", type=int, default=20)
    parser.add_argument("--max-top-posts", type=int, default=12)
    parser.add_argument("--timeout-seconds", type=int, default=12)
    parser.add_argument("--llm-timeout-seconds", type=int, default=120)
    parser.add_argument("--subreddit-batch-size", type=int, default=DEFAULT_SUBREDDIT_BATCH_SIZE)
    parser.add_argument("--cache-hours", type=int, default=DEFAULT_CACHE_HOURS)
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market) or ""
    if not universe_id:
        raise ValueError(f"No active universe configured for {args.market}")

    subreddits = [s.strip().lstrip("r/") for s in args.subreddits.split(",") if s.strip()]
    selected_subreddits = _select_subreddit_batch(
        store,
        market=args.market,
        subreddits=subreddits,
        batch_size=max(0, args.subreddit_batch_size),
    )
    fetched_posts: list[dict[str, Any]] = []
    fetch_failures: list[dict[str, str]] = []
    new_cache_posts = 0
    for subreddit in selected_subreddits:
        try:
            rows = _fetch_rss(subreddit, args.timeout_seconds)
            selected_rows = rows[: args.posts_per_subreddit]
            fetched_posts.extend(selected_rows)
            new_cache_posts += _write_subreddit_cache(
                store,
                market=args.market,
                subreddit=subreddit,
                fetched_posts=selected_rows,
                cache_hours=args.cache_hours,
            )
        except Exception as exc:
            error = str(exc)
            fetch_failures.append({"subreddit": subreddit, "error": error})
            print({"stage": "reddit_scan_failed", "subreddit": subreddit, "error": error})

    posts = _load_cached_posts(store, args.market, args.cache_hours)
    if not posts:
        posts = fetched_posts

    supported_tickers = _load_supported_tickers(store, args.market)

    llm_data: dict[str, Any] | None = None
    try:
        llm_data = _llm_extract(
            posts,
            supported_tickers=supported_tickers,
            timeout_seconds=args.llm_timeout_seconds,
        )
    except Exception as exc:
        print({"stage": "reddit_llm_failed", "error": str(exc)})

    top_posts = [
        {
            "title": str(post.get("title") or ""),
            "subreddit": str(post.get("subreddit") or ""),
            "summary": str(post.get("title") or ""),
            "tickers": _post_supported_tickers(post, supported_tickers),
            "url": post.get("url"),
            "permalink": post.get("permalink"),
            "body": _brief_text(post.get("selftext"), 800),
        }
        for post in posts[: max(0, args.max_top_posts)]
    ]

    llm_ticker_count = 0
    heuristic_supplement_count = 0
    heuristic_only = False

    if llm_data and isinstance(llm_data.get("tickers"), dict):
        tickers_payload: list[dict[str, Any]] = []
        for symbol, item in (llm_data.get("tickers") or {}).items():
            ticker = str(symbol or "").strip().upper()
            if not ticker or ticker in STOPWORDS or len(ticker) > 5:
                continue
            if not isinstance(item, dict):
                continue
            company_name = str(item.get("company_name") or "").strip()
            company_norm = _normalize_name(company_name)

            if ticker not in supported_tickers:
                continue

            # Hard guard for common private-company confusion (e.g. SpaceX -> SPCE).
            if ticker == "SPCE" and "space exploration technologies" in company_norm:
                continue
            mention_count = int(item.get("mentions") or 0)
            if mention_count <= 0:
                continue

            tickers_payload.append(
                {
                    "ticker": ticker,
                    "sentiment": str(item.get("sentiment") or "neutral"),
                    "summary": str(item.get("context") or "").strip() or f"{ticker} is active in Reddit chatter.",
                    "mention_count": mention_count,
                    "catalysts": [str(c).strip() for c in (item.get("catalysts") or []) if str(c).strip()][:4],
                    "company_name": company_name,
                    "exchange_hint": str(item.get("exchange_hint") or "UNKNOWN").strip().upper()[:12],
                    "confidence": max(0.0, min(1.0, float(item.get("confidence") or 0.0))),
                    "evidence_span": str(item.get("evidence_span") or "").strip()[:180],
                    "source": "llm",
                }
            )
        tickers_payload.sort(key=lambda row: int(row.get("mention_count") or 0), reverse=True)
        tickers_payload = tickers_payload[: max(0, args.max_tickers)]
        llm_ticker_count = len(tickers_payload)
        mood = str(llm_data.get("market_mood") or "neutral")
        notable = []
        for row in (llm_data.get("notable_posts") or [])[:12]:
            if isinstance(row, dict):
                why = str(row.get("why_notable") or "").strip()
                title = str(row.get("title") or "").strip()
                if why:
                    notable.append(why)
                elif title:
                    notable.append(title)
        if not tickers_payload:
            heuristic_only = True
            tickers_payload, mood, notable = _heuristic_fallback(posts, args.max_tickers, supported_tickers)
            heuristic_supplement_count = len(tickers_payload)
    else:
        heuristic_only = True
        tickers_payload, mood, notable = _heuristic_fallback(posts, args.max_tickers, supported_tickers)

    payload = {
        "market": args.market,
        "generated_at": _utc_now(),
        "post_count": len(posts),
        "posts_fetched_this_run": len(fetched_posts),
        "new_cached_posts_this_run": new_cache_posts,
        "subreddit_count": len(subreddits),
        "subreddits_scanned_this_run": selected_subreddits,
        "fetch_failures": fetch_failures,
        "cache_hours": max(1, args.cache_hours),
        "subreddits": subreddits,
        "market_mood": mood,
        "ticker_count": len(tickers_payload),
        "llm_ticker_count": llm_ticker_count,
        "heuristic_supplement_count": heuristic_supplement_count,
        "heuristic_only": heuristic_only,
        "tickers": tickers_payload,
        "top_posts": top_posts,
        "notable_discussions": notable[:12],
        "universe_id": universe_id,
    }
    store.db.collection("reddit_snapshots").document(f"{args.market}__latest").set(payload)
    _write_ticker_read_models(store, args.market, payload)
    store.save_stage_watermark(
        market=args.market,
        stage_key="build_reddit_buzz",
        universe_id=universe_id,
        expected_count=len(posts),
        success_count=len(tickers_payload),
        error_count=0,
        metadata={"subreddits": subreddits, "max_tickers": args.max_tickers},
    )
    print({
        "market": args.market,
        "post_count": len(posts),
        "posts_fetched_this_run": len(fetched_posts),
        "new_cached_posts_this_run": new_cache_posts,
        "subreddits_scanned_this_run": selected_subreddits,
        "fetch_failures": len(fetch_failures),
        "ticker_count": len(tickers_payload),
        "llm": bool(llm_data),
        "llm_ticker_count": llm_ticker_count,
        "heuristic_supplement_count": heuristic_supplement_count,
        "heuristic_only": heuristic_only,
    })


if __name__ == "__main__":
    main()
