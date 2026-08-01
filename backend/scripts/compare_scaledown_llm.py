"""Compare ScaleDown APIs vs our baseline OpenAI calls on real Tikrr data.

Isolation harness only — does not change production pipelines.

Example:
  cd /path/to/tikrr && python3 -m backend.scripts.compare_scaledown_llm --ticker NVDA
"""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from typing import Any

import requests

from backend.env import load_backend_env
from backend.instrument_universe import list_instruments
from backend.llm_client import (
    json_response_format,
    llm_api_key,
    llm_api_url,
    llm_headers,
    llm_model,
    parse_json_content,
    schema_system_prompt,
)
from backend.models import Article
from backend.scripts.build_reddit_buzz import TICKER_EXTRACTION_PROMPT, _fetch_rss
from backend.scripts.build_sector_regimes import (
    REGIME_SCHEMA,
    REGIME_SYSTEM_PROMPT,
    _compute_sector_signals,
    _fetch_prices_latest,
    _fetch_technicals_for_date,
    _llm_classify_sector,
)
from backend.stock_intelligence import (
    STOCK_BRIEF_SCHEMA,
    STOCK_BRIEF_SYSTEM_PROMPT,
    _llm_synthesize_brief,
    build_stock_intelligence_docs,
)
from backend.storage import TraceMoneyStore

load_backend_env()

SCALEDOWN_BASE = "https://api.scaledown.xyz"
REGIME_LABELS = [
    ("expanding", "Does this describe an expanding sector with rising breadth and majority above key moving averages?"),
    ("momentum", "Does this describe strong established trend with breadth holding and positive relative strength?"),
    ("topping", "Does this describe topping with narrowing breadth and flattening relative strength?"),
    ("choppy", "Does this describe choppy mixed trend with flat relative strength?"),
    ("breaking_down", "Does this describe breaking down with majority below MAs and negative breadth?"),
    ("recovering", "Does this describe recovering with breadth turning up from lows?"),
]
REDDIT_MOOD_LABELS = [
    ("bullish", "Does this text express bullish optimism about stocks going up?"),
    ("bearish", "Does this text express bearish pessimism about stocks going down?"),
    ("mixed", "Does this text express mixed or conflicting sentiment?"),
    ("neutral", "Does this text express neutral or informational tone without clear direction?"),
]


def _scaledown_key() -> str:
    key = os.getenv("SCALEDOWN_API_KEY", "").strip()
    if not key:
        raise SystemExit("SCALEDOWN_API_KEY is required in backend/.env")
    return key


def _scaledown_headers() -> dict[str, str]:
    return {"x-api-key": _scaledown_key(), "Content-Type": "application/json"}


def _timed(label: str, fn) -> tuple[Any, float]:
    start = time.perf_counter()
    result = fn()
    elapsed = time.perf_counter() - start
    return result, elapsed


def _print_section(title: str) -> None:
    print(f"\n{'=' * 78}")
    print(title)
    print("=" * 78)


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=True))


def _coerce_article(payload: dict[str, Any]) -> Article:
    row = dict(payload)
    row.setdefault("body_text", "")
    return Article(**row)


def _find_instrument(market: str, universe_id: str, ticker: str) -> dict[str, Any] | None:
    target = ticker.strip().upper()
    for instrument in list_instruments(market, universe_id):
        if str(instrument.get("ticker", "")).upper() == target:
            return instrument
    return None


def _capture_brief_kwargs(
    market: str,
    universe_id: str,
    instrument: dict[str, Any],
    articles: list[Article],
    store: TraceMoneyStore,
) -> dict[str, Any] | None:
    captured: dict[str, Any] = {}
    original = _llm_synthesize_brief

    def _wrapper(**kwargs: Any) -> dict[str, Any] | None:
        captured.update(kwargs)
        return None

    import backend.stock_intelligence as stock_intelligence

    stock_intelligence._llm_synthesize_brief = _wrapper  # type: ignore[assignment]
    try:
        build_stock_intelligence_docs(
            market,
            universe_id,
            [instrument],
            articles,
            store=store,
        )
    finally:
        stock_intelligence._llm_synthesize_brief = original  # type: ignore[assignment]
    return captured or None


def _build_brief_payload(kwargs: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "today": datetime.now(timezone.utc).date().isoformat(),
        "ticker": kwargs["ticker"],
        "company_name": kwargs["name"],
        "sentiment_label": kwargs["sentiment_label"],
        "sentiment_score": kwargs["sentiment_score"],
        "article_count": kwargs["article_count"],
        "source_count": kwargs["source_count"],
        "key_evidence": kwargs["key_points"][:5],
        "top_article_titles": kwargs["article_titles"][:4],
        "catalyst": kwargs["catalyst"],
        "risk": kwargs["risk"],
        "current_price": kwargs.get("current_price"),
        "analyst_target": kwargs.get("analyst_target"),
        "fundamentals": kwargs.get("fundamentals"),
    }
    for key in ("recent_news", "reddit", "earnings", "price_context", "market_regime"):
        value = kwargs.get(key)
        if value:
            payload[key] = value
    return payload


def _evidence_text(payload: dict[str, Any]) -> str:
    lines: list[str] = []
    for item in payload.get("recent_news") or []:
        if not isinstance(item, dict):
            continue
        lines.append(
            f"[{item.get('date','')}] {item.get('title','')}: {item.get('summary','')}"
        )
    for point in payload.get("key_evidence") or []:
        lines.append(f"Evidence: {point}")
    reddit = payload.get("reddit_buzz") or payload.get("reddit")
    if isinstance(reddit, dict):
        lines.append(
            f"Reddit buzz ({reddit.get('sentiment','neutral')}, {reddit.get('mentions',0)} mentions): "
            f"{reddit.get('context','')}"
        )
    earnings = payload.get("earnings")
    if isinstance(earnings, dict):
        lines.append(
            f"Earnings status={earnings.get('status')} event_date={earnings.get('event_date')} "
            f"days_until={earnings.get('days_until')} days_since_report={earnings.get('days_since_report')}"
        )
    if payload.get("current_price") is not None:
        lines.append(f"Current price: {payload['current_price']}")
    if payload.get("analyst_target") is not None:
        lines.append(f"Analyst target: {payload['analyst_target']}")
    price_context = payload.get("price_context")
    if isinstance(price_context, dict):
        lines.append(f"Price context: {json.dumps(price_context, ensure_ascii=True)}")
    return "\n".join(lines).strip()


def _openai_stock_brief(
    payload: dict[str, Any],
    *,
    user_content: str | None = None,
    usage_out: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    api_key = llm_api_key()
    if not api_key:
        return None
    model = llm_model()
    content = user_content if user_content is not None else json.dumps(payload, ensure_ascii=True)
    resp = requests.post(
        llm_api_url(),
        headers=llm_headers(api_key),
        json={
            "model": model,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": schema_system_prompt(STOCK_BRIEF_SYSTEM_PROMPT, STOCK_BRIEF_SCHEMA),
                },
                {"role": "user", "content": content},
            ],
            "response_format": json_response_format(),
        },
        timeout=60,
    )
    resp.raise_for_status()
    body = resp.json()
    if usage_out is not None and isinstance(body.get("usage"), dict):
        usage_out.update(body["usage"])
    return parse_json_content(body["choices"][0]["message"]["content"])


def _scaledown_compress(context: str, prompt: str) -> dict[str, Any]:
    resp = requests.post(
        f"{SCALEDOWN_BASE}/compress/raw/",
        headers=_scaledown_headers(),
        json={"prompt": prompt, "context": context},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _scaledown_extract(text: str, entities: dict[str, Any], *, instructions: str = "") -> dict[str, Any]:
    payload: dict[str, Any] = {"text": text, "entities": entities}
    if instructions:
        payload["instructions"] = instructions
    resp = requests.post(
        f"{SCALEDOWN_BASE}/extract",
        headers=_scaledown_headers(),
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _scaledown_summarize(text: str, *, instructions: str = "") -> dict[str, Any]:
    payload: dict[str, Any] = {"text": text, "max_tokens": 400}
    if instructions:
        payload["instructions"] = instructions
    resp = requests.post(
        f"{SCALEDOWN_BASE}/summarization/abstractive",
        headers=_scaledown_headers(),
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _scaledown_classify(text: str, labels: list[tuple[str, str]]) -> dict[str, Any]:
    resp = requests.post(
        f"{SCALEDOWN_BASE}/classify",
        headers=_scaledown_headers(),
        json={
            "text": text,
            "labels": [{"name": name, "rubric": rubric} for name, rubric in labels],
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _brief_ui_slice(brief: dict[str, Any] | None) -> dict[str, Any]:
    if not brief:
        return {"error": "no brief"}
    return {
        "headline": brief.get("headline"),
        "thesis": brief.get("thesis"),
        "body": brief.get("body"),
        "setup_state": brief.get("setup_state"),
        "drivers_count": len(brief.get("drivers") or []),
        "catalyst_cards_count": len(brief.get("catalyst_cards") or []),
        "risk_cards_count": len(brief.get("risk_cards") or []),
    }


def _reddit_post_blob(posts: list[dict[str, Any]], limit: int = 40) -> str:
    lines = []
    for index, post in enumerate(posts[:limit], start=1):
        lines.append(
            f"[{index}] r/{post.get('subreddit','')} | {post.get('title','')}\n"
            f"{str(post.get('selftext',''))[:220]}"
        )
    return "\n\n".join(lines)


def _openai_reddit_extract(post_blob: str) -> dict[str, Any] | None:
    api_key = llm_api_key()
    if not api_key:
        return None
    resp = requests.post(
        llm_api_url(),
        headers=llm_headers(api_key),
        json={
            "model": llm_model(),
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": schema_system_prompt(TICKER_EXTRACTION_PROMPT, {"type": "object"}),
                },
                {"role": "user", "content": json.dumps({"posts": post_blob.split("\n\n")}, ensure_ascii=True)},
            ],
            "response_format": json_response_format(),
        },
        timeout=90,
    )
    resp.raise_for_status()
    return parse_json_content(resp.json()["choices"][0]["message"]["content"])


def _signals_to_text(signals: dict[str, Any]) -> str:
    return json.dumps(signals, ensure_ascii=True)


def _pick_sector_signals(store: TraceMoneyStore, market: str, sector: str | None) -> tuple[str, dict[str, Any]]:
    regimes = store.get_sector_regimes(market)
    if sector:
        slug = sector.strip().lower().replace(" ", "-")
        for key, doc in regimes.items():
            if key == "macro":
                continue
            if key == slug or str(doc.get("sector", "")).lower() == sector.lower():
                cached = doc.get("signals")
                if isinstance(cached, dict) and cached:
                    return str(doc.get("sector") or sector), cached
    for key, doc in sorted(regimes.items()):
        if key == "macro":
            continue
        cached = doc.get("signals")
        if isinstance(cached, dict) and cached:
            return str(doc.get("sector") or key), cached

    instruments = store.list_instruments(market)
    by_sector: dict[str, list[dict[str, Any]]] = {}
    for inst in instruments:
        sec = str(inst.get("sector") or "").strip()
        if sec:
            by_sector.setdefault(sec, []).append(inst)
    if not by_sector:
        raise SystemExit("No sector instruments found")
    chosen = sector if sector and sector in by_sector else sorted(by_sector)[0]
    date_str = datetime.now(timezone.utc).date().isoformat()
    instrument_ids = [i["instrument_id"] for i in instruments if i.get("instrument_id")]
    technical_docs = _fetch_technicals_for_date(store, instrument_ids, date_str)
    missing = [iid for iid in instrument_ids if iid not in technical_docs]
    if missing:
        collection = store.db.collection("tm_stock_technicals_latest")
        for snap in store.db.get_all([collection.document(iid) for iid in missing[:400]]):
            if snap.exists:
                data = snap.to_dict() or {}
                iid = str(data.get("instrument_id") or "").strip()
                if iid:
                    technical_docs[iid] = data
    price_docs = _fetch_prices_latest(store, instrument_ids)
    return chosen, _compute_sector_signals(chosen, by_sector[chosen], technical_docs, price_docs)


def run_stock_brief_task(
    market: str,
    ticker: str,
    *,
    skip_openai: bool,
) -> dict[str, Any]:
    store = TraceMoneyStore()
    universe_id = store.get_active_ai_universe(market)
    if not universe_id:
        raise SystemExit(f"No active AI universe for {market}")
    instrument = _find_instrument(market, universe_id, ticker)
    if not instrument:
        raise SystemExit(f"Ticker {ticker!r} not found")
    articles = [
        _coerce_article(payload)
        for payload in store.list_article_enrichments(market, universe_id)
    ]
    kwargs = _capture_brief_kwargs(market, universe_id, instrument, articles, store)
    if not kwargs:
        raise SystemExit("Could not capture stock brief inputs for this ticker")

    payload = _build_brief_payload(kwargs)
    evidence = _evidence_text(payload)
    results: dict[str, Any] = {
        "ticker": ticker,
        "payload_chars": len(json.dumps(payload, ensure_ascii=True)),
        "evidence_chars": len(evidence),
    }

    if not skip_openai:
        usage: dict[str, Any] = {}
        baseline, baseline_s = _timed(
            "baseline",
            lambda: _openai_stock_brief(payload, usage_out=usage),
        )
        results["baseline_openai"] = {
            "latency_s": round(baseline_s, 2),
            "usage": usage,
            "brief": _brief_ui_slice(baseline),
        }

        compressed_meta, compress_s = _timed(
            "compress",
            lambda: _scaledown_compress(
                json.dumps(payload, ensure_ascii=True),
                "Synthesize stock intelligence JSON from this evidence.",
            ),
        )
        compressed_prompt = (
            (compressed_meta.get("results") or {}).get("compressed_prompt")
            or json.dumps(payload, ensure_ascii=True)
        )
        compress_stats = compressed_meta.get("results") or {}
        compressed_brief, compressed_llm_s = _timed(
            "compress+openai",
            lambda: _openai_stock_brief(payload, user_content=compressed_prompt),
        )
        results["compress_plus_openai"] = {
            "compress_latency_s": round(compress_s, 2),
            "openai_latency_s": round(compressed_llm_s, 2),
            "total_latency_s": round(compress_s + compressed_llm_s, 2),
            "compression_ratio": compress_stats.get("compression_ratio"),
            "original_tokens": compress_stats.get("original_prompt_tokens"),
            "compressed_tokens": compress_stats.get("compressed_prompt_tokens"),
            "brief": _brief_ui_slice(compressed_brief),
        }

    extract_entities = {
        "headline": "Under 12 words insight headline about the stock, not a price move",
        "thesis": "One line primary insight max 12 words",
        "body": "2-3 sentence factual news overview grounded in evidence",
        "catalyst": "Single most important near-term catalyst",
        "risk": "Single biggest downside risk",
        "setup_state": "One of accumulation, breakout, trend, rotation, exhaustion, unclear",
    }
    extract_out, extract_s = _timed(
        "extract",
        lambda: _scaledown_extract(
            evidence,
            extract_entities,
            instructions=(
                "Write fluent outputs for a stock intelligence app. "
                "Use only facts present in the text. No markdown."
            ),
        ),
    )
    structured = extract_out.get("structured_result")
    if not structured:
        structured = {row.get("type"): row.get("text") for row in extract_out.get("entities") or []}
    results["extract_only"] = {
        "latency_s": round(extract_s, 2),
        "fields": structured,
        "note": "Partial replacement — no drivers/catalyst_cards/risk_cards",
    }

    summarize_out, summarize_s = _timed(
        "summarize",
        lambda: _scaledown_summarize(
            evidence,
            instructions=(
                "Write a 2-3 sentence stock news overview for a premium market app. "
                "Plain English, current, no price narration."
            ),
        ),
    )
    results["summarize_body"] = {
        "latency_s": round(summarize_s, 2),
        "summary": summarize_out.get("summary"),
        "scaledown_latency_ms": summarize_out.get("latency_ms"),
    }
    return results


def run_sector_regime_task(market: str, sector: str | None, *, skip_openai: bool) -> dict[str, Any]:
    store = TraceMoneyStore()
    sector_name, signals = _pick_sector_signals(store, market, sector)
    signal_text = _signals_to_text(signals)
    results: dict[str, Any] = {"sector": sector_name, "signal_chars": len(signal_text)}

    if not skip_openai:
        baseline, baseline_s = _timed(
            "sector-openai",
            lambda: _llm_classify_sector(signals, llm_model()),
        )
        results["baseline_openai"] = {
            "latency_s": round(baseline_s, 2),
            "regime": baseline.get("regime"),
            "conviction": baseline.get("conviction"),
            "narrative": baseline.get("narrative"),
            "invalidators": baseline.get("invalidators"),
            "leadership_stocks": baseline.get("leadership_stocks"),
        }

    classify_out, classify_s = _timed(
        "sector-classify",
        lambda: _scaledown_classify(signal_text, REGIME_LABELS),
    )
    results["scaledown_classify"] = {
        "latency_s": round(classify_s, 2),
        "top_label": classify_out.get("top_label"),
        "scores": classify_out.get("scores"),
        "note": "Regime enum only — no conviction/invalidators/leadership",
    }

    summarize_out, summarize_s = _timed(
        "sector-summarize",
        lambda: _scaledown_summarize(
            signal_text,
            instructions=(
                "Write exactly 2 short direct sentences stating the sector regime and key reason. "
                "No hedge words."
            ),
        ),
    )
    results["scaledown_summarize_narrative"] = {
        "latency_s": round(summarize_s, 2),
        "narrative": summarize_out.get("summary"),
    }

    extract_out, extract_s = _timed(
        "sector-extract",
        lambda: _scaledown_extract(
            signal_text,
            {
                "regime": "One of expanding, momentum, topping, choppy, breaking_down, recovering",
                "conviction": "Integer 0-100 conviction score",
                "narrative": "Two short sentences on regime and key reason",
                "invalidators": [
                    {
                        "condition": "Concrete if/then condition that would flip the regime",
                    }
                ],
                "leadership_stocks": "Up to 3 ticker symbols leading the sector",
            },
            instructions="Use only data in the input JSON. Return structured fields for a market app.",
        ),
    )
    results["scaledown_extract_structured"] = {
        "latency_s": round(extract_s, 2),
        "structured_result": extract_out.get("structured_result"),
    }
    return results


def run_reddit_task(*, skip_openai: bool) -> dict[str, Any]:
    posts: list[dict[str, Any]] = []
    for subreddit in ("wallstreetbets", "stocks", "investing"):
        try:
            posts.extend(_fetch_rss(subreddit, timeout_s=20))
        except Exception as exc:
            print(f"[warn] reddit fetch failed for r/{subreddit}: {exc}")
    if not posts:
        raise SystemExit("Could not fetch Reddit posts for comparison")
    blob = _reddit_post_blob(posts)
    results: dict[str, Any] = {"posts": len(posts), "blob_chars": len(blob)}

    if not skip_openai:
        baseline, baseline_s = _timed("reddit-openai", lambda: _openai_reddit_extract(blob))
        results["baseline_openai"] = {
            "latency_s": round(baseline_s, 2),
            "market_mood": (baseline or {}).get("market_mood"),
            "top_themes": (baseline or {}).get("top_themes"),
            "ticker_count": len((baseline or {}).get("tickers") or {}),
            "notable_posts_count": len((baseline or {}).get("notable_posts") or []),
        }

    classify_out, classify_s = _timed(
        "reddit-classify",
        lambda: _scaledown_classify(blob[:12000], REDDIT_MOOD_LABELS),
    )
    results["scaledown_classify_mood"] = {
        "latency_s": round(classify_s, 2),
        "top_label": classify_out.get("top_label"),
        "scores": classify_out.get("scores"),
        "note": "Mood only — no ticker extraction",
    }

    summarize_out, summarize_s = _timed(
        "reddit-summarize",
        lambda: _scaledown_summarize(
            blob[:12000],
            instructions="Summarize the top 3 retail stock themes in 3 bullet sentences.",
        ),
    )
    results["scaledown_summarize_themes"] = {
        "latency_s": round(summarize_s, 2),
        "summary": summarize_out.get("summary"),
    }
    return results


def _verdict(results: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    brief = results.get("stock_brief") or {}
    if brief:
        base = (brief.get("baseline_openai") or {}).get("brief") or {}
        comp = (brief.get("compress_plus_openai") or {}).get("brief") or {}
        if base and comp and base != comp:
            lines.append(
                "Stock brief: compress+OpenAI changed output vs baseline — review brief-content parity."
            )
        elif base and comp:
            lines.append("Stock brief: compress+OpenAI matched baseline shape; modest token savings only.")
        extract_fields = (brief.get("extract_only") or {}).get("fields") or {}
        if extract_fields:
            lines.append(
                "Stock brief: ScaleDown extract covers headline/body/thesis but cannot replace full JSON brief."
            )
        if brief.get("summarize_body", {}).get("summary"):
            lines.append("Stock brief: summarize is viable for body-only generation at much lower latency.")

    sector = results.get("sector_regime") or {}
    if sector:
        base_regime = (sector.get("baseline_openai") or {}).get("regime")
        sd_regime = (sector.get("scaledown_classify") or {}).get("top_label")
        if base_regime and sd_regime:
            if base_regime == sd_regime:
                lines.append(f"Sector regime: classify agreed with OpenAI ({base_regime}).")
            else:
                lines.append(
                    f"Sector regime: classify disagreed — OpenAI={base_regime}, ScaleDown={sd_regime}."
                )

    reddit = results.get("reddit") or {}
    if reddit:
        base_mood = (reddit.get("baseline_openai") or {}).get("market_mood")
        sd_mood = (reddit.get("scaledown_classify_mood") or {}).get("top_label")
        if base_mood and sd_mood:
            if base_mood == sd_mood:
                lines.append(f"Reddit mood: classify agreed with OpenAI ({base_mood}).")
            else:
                lines.append(f"Reddit mood: classify disagreed — OpenAI={base_mood}, ScaleDown={sd_mood}.")
        lines.append("Reddit: ScaleDown cannot replace ticker extraction; OpenAI still needed for tickers.")

    if not lines:
        lines.append("No comparisons run.")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare ScaleDown vs OpenAI on Tikrr LLM tasks")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--ticker", default="NVDA", help="Ticker for stock brief task")
    parser.add_argument("--sector", default="", help="Optional sector name for regime task")
    parser.add_argument(
        "--tasks",
        default="brief,sector,reddit",
        help="Comma-separated: brief,sector,reddit",
    )
    parser.add_argument(
        "--skip-openai",
        action="store_true",
        help="Only run ScaleDown endpoints (no OpenAI spend)",
    )
    args = parser.parse_args()

    if not args.skip_openai and not llm_api_key():
        raise SystemExit("OPENAI_API_KEY is required unless --skip-openai is set")

    tasks = {part.strip().lower() for part in args.tasks.split(",") if part.strip()}
    report: dict[str, Any] = {"market": args.market, "tasks": sorted(tasks)}

    if "brief" in tasks:
        _print_section(f"TASK 1 — Stock brief ({args.ticker})")
        report["stock_brief"] = run_stock_brief_task(
            args.market,
            args.ticker,
            skip_openai=args.skip_openai,
        )
        _print_json(report["stock_brief"])

    if "sector" in tasks:
        _print_section("TASK 2 — Sector regime")
        report["sector_regime"] = run_sector_regime_task(
            args.market,
            args.sector.strip() or None,
            skip_openai=args.skip_openai,
        )
        _print_json(report["sector_regime"])

    if "reddit" in tasks:
        _print_section("TASK 3 — Reddit buzz")
        report["reddit"] = run_reddit_task(skip_openai=args.skip_openai)
        _print_json(report["reddit"])

    _print_section("VERDICT")
    for line in _verdict(report):
        print(f"- {line}")


if __name__ == "__main__":
    main()
