from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import requests

from backend.llm_client import (
    MIMO_API_URL,
    json_response_format,
    llm_api_key,
    llm_headers,
    llm_model,
    parse_json_content,
    schema_system_prompt,
)
from backend.storage import TraceMoneyStore

USER_AGENT = "tikrr-reddit-buzz/2.0"
DEFAULT_SUBREDDITS = ["wallstreetbets", "stocks", "investing", "StockMarket", "options", "shortsqueeze"]
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_DEFAULT_MODEL = "gpt-4.1-mini"
LLM_URL = os.getenv("MIMO_API_URL", "").strip() or MIMO_API_URL

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
      "catalysts": ["...", "..."]
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
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_html(raw: str) -> str:
    return (
        str(raw or "")
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )


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


def _heuristic_fallback(posts: list[dict[str, Any]], max_tickers: int) -> tuple[list[dict[str, Any]], str, list[str]]:
    stats: dict[str, int] = defaultdict(int)
    for post in posts:
        text = f"{post.get('title', '')} {post.get('selftext', '')}".upper()
        for token in re.findall(r"\b[A-Z]{1,5}\b", text):
            if token in STOPWORDS or len(token) <= 1:
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
        }
        for symbol, count in ranked
    ]
    return tickers, "neutral", []


def _resolve_llm_config() -> tuple[str, str, str] | None:
    """Prefer OpenAI for Reddit ticker extraction; fall back to MiMo."""
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if openai_key:
        model = os.getenv("OPENAI_MODEL", "").strip() or OPENAI_DEFAULT_MODEL
        return openai_key, model, OPENAI_CHAT_URL
    mimo_key = llm_api_key()
    if mimo_key:
        return mimo_key, llm_model("gpt-4o-mini"), LLM_URL
    return None


def _llm_extract(posts: list[dict[str, Any]]) -> dict[str, Any] | None:
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
        timeout=45,
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

    llm_data: dict[str, Any] | None = None
    try:
        llm_data = _llm_extract(posts)
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

    if llm_data and isinstance(llm_data.get("tickers"), dict):
        tickers_payload: list[dict[str, Any]] = []
        for symbol, item in (llm_data.get("tickers") or {}).items():
            ticker = str(symbol or "").strip().upper()
            if not ticker or ticker in STOPWORDS or len(ticker) > 5:
                continue
            if not isinstance(item, dict):
                continue
            tickers_payload.append(
                {
                    "ticker": ticker,
                    "sentiment": str(item.get("sentiment") or "neutral"),
                    "summary": str(item.get("context") or "").strip() or f"{ticker} is active in Reddit chatter.",
                    "mention_count": int(item.get("mentions") or 0),
                    "catalysts": [str(c).strip() for c in (item.get("catalysts") or []) if str(c).strip()][:4],
                }
            )
        tickers_payload.sort(key=lambda row: int(row.get("mention_count") or 0), reverse=True)
        tickers_payload = tickers_payload[: max(0, args.max_tickers)]
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
    else:
        tickers_payload, mood, notable = _heuristic_fallback(posts, args.max_tickers)

    payload = {
        "market": args.market,
        "generated_at": _utc_now(),
        "post_count": len(posts),
        "subreddits": subreddits,
        "market_mood": mood,
        "tickers": tickers_payload,
        "top_posts": top_posts,
        "notable_discussions": notable[:12],
        "universe_id": universe_id,
    }
    store.db.collection("reddit_snapshots").document(f"{args.market}__latest").set(payload)
    store.save_stage_watermark(
        market=args.market,
        stage_key="build_reddit_buzz",
        universe_id=universe_id,
        expected_count=len(posts),
        success_count=len(tickers_payload),
        error_count=0,
        metadata={"subreddits": subreddits, "max_tickers": args.max_tickers},
    )
    print({"market": args.market, "post_count": len(posts), "ticker_count": len(tickers_payload), "llm": bool(llm_data)})


if __name__ == "__main__":
    main()
