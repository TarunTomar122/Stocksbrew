from __future__ import annotations

import argparse
import html
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
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


def _llm_extract(posts: list[dict[str, Any]], *, timeout_seconds: int) -> dict[str, Any] | None:
    resolved = _resolve_llm_config()
    if not resolved:
        return None
    api_key, model, endpoint = resolved
    if not api_key:
        return None
    post_lines = []
    for index, post in enumerate(posts[:160], start=1):
        post_lines.append(
            f"[{index}] r/{post.get('subreddit','')} | {post.get('title','')}\n{str(post.get('selftext',''))[:220]}"
        )
    user_payload = {"posts": post_lines}
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
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market) or ""
    if not universe_id:
        raise ValueError(f"No active universe configured for {args.market}")

    subreddits = [s.strip().lstrip("r/") for s in args.subreddits.split(",") if s.strip()]
    posts: list[dict[str, Any]] = []
    for subreddit in subreddits:
        try:
            rows = _fetch_rss(subreddit, args.timeout_seconds)
            posts.extend(rows[: args.posts_per_subreddit])
        except Exception as exc:
            print({"stage": "reddit_scan_failed", "subreddit": subreddit, "error": str(exc)})

    supported_tickers = _load_supported_tickers(store, args.market)

    llm_data: dict[str, Any] | None = None
    try:
        llm_data = _llm_extract(posts, timeout_seconds=args.llm_timeout_seconds)
    except Exception as exc:
        print({"stage": "reddit_llm_failed", "error": str(exc)})

    top_posts = [
        {
            "title": str(post.get("title") or ""),
            "subreddit": str(post.get("subreddit") or ""),
            "summary": str(post.get("title") or ""),
            "tickers": [],
            "url": post.get("url"),
            "permalink": post.get("permalink"),
            "body": str(post.get("selftext") or "")[:800],
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
        before_supplement = len(tickers_payload)
        tickers_payload = _supplement_with_heuristics(
            posts=posts,
            existing=tickers_payload,
            max_tickers=max(0, args.max_tickers),
            supported_tickers=supported_tickers,
        )
        heuristic_supplement_count = max(0, len(tickers_payload) - before_supplement)
    else:
        heuristic_only = True
        tickers_payload, mood, notable = _heuristic_fallback(posts, args.max_tickers, supported_tickers)

    payload = {
        "market": args.market,
        "generated_at": _utc_now(),
        "post_count": len(posts),
        "subreddit_count": len(subreddits),
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
        "ticker_count": len(tickers_payload),
        "llm": bool(llm_data),
        "llm_ticker_count": llm_ticker_count,
        "heuristic_supplement_count": heuristic_supplement_count,
        "heuristic_only": heuristic_only,
    })


if __name__ == "__main__":
    main()
