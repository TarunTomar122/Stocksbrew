from __future__ import annotations

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import yfinance as yf

from backend.storage import TraceMoneyStore
from backend.tikrr_pipeline.article_fetcher import fetch_article_evidence, fetch_topic_evidence
from backend.tikrr_pipeline.client import TikrrAPIClient
from backend.tikrr_pipeline.facts import curate_hits, extract_facts, merge_extracted_facts
from backend.tikrr_pipeline.openai_client import OpenAIJSONClient
from backend.tikrr_pipeline.prompting import (
    MARKET_SYSTEM_PROMPT,
    SECTOR_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    build_market_prompt,
    build_sector_prompt,
    build_user_prompt,
)
from backend.tikrr_pipeline.searxng import SearXNGClient, build_market_queries, build_sector_queries, build_stock_queries


CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "tikrr_eval_universe.json"
AI_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "tikrr_ai_universe.json"
DEFAULT_US_SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMD", "AMZN", "TSLA", "JPM", "GS", "XOM", "CVX"]
DEFAULT_IN_SYMBOLS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "BHARTIARTL", "SUNPHARMA", "TATAMOTORS", "HINDUNILVR"]
MARKET_INDEX_SYMBOLS = {
    "US": [
        ("S&P 500", "^GSPC"),
        ("Dow Jones", "^DJI"),
        ("Nasdaq Composite", "^IXIC"),
    ],
    "IN": [
        ("NIFTY 50", "^NSEI"),
        ("SENSEX", "^BSESN"),
        ("BANK NIFTY", "^NSEBANK"),
    ],
}
GLOBAL_CUE_SYMBOLS = {
    "oil": "CL=F",
    "gold": "GC=F",
    "dxy": "DX-Y.NYB",
    "vix": "^VIX",
    "usTenYear": "^TNX",
}


def _load_eval_universe() -> dict[str, list[str]]:
    try:
        payload = json.loads(CONFIG_PATH.read_text())
    except FileNotFoundError:
        return {"US": DEFAULT_US_SYMBOLS, "IN": DEFAULT_IN_SYMBOLS}
    except json.JSONDecodeError:
        return {"US": DEFAULT_US_SYMBOLS, "IN": DEFAULT_IN_SYMBOLS}
    return {
        "US": [str(item).upper() for item in payload.get("US", DEFAULT_US_SYMBOLS)],
        "IN": [str(item).upper() for item in payload.get("IN", DEFAULT_IN_SYMBOLS)],
    }


def _load_ai_universe() -> dict[str, list[str]]:
    """Load the smaller AI-enriched stock universe (stock-level LLM briefings only)."""
    try:
        payload = json.loads(AI_CONFIG_PATH.read_text())
    except FileNotFoundError:
        return {"US": DEFAULT_US_SYMBOLS, "IN": DEFAULT_IN_SYMBOLS}
    except json.JSONDecodeError:
        return {"US": DEFAULT_US_SYMBOLS, "IN": DEFAULT_IN_SYMBOLS}
    return {
        "US": [str(item).upper() for item in payload.get("US", DEFAULT_US_SYMBOLS)],
        "IN": [str(item).upper() for item in payload.get("IN", DEFAULT_IN_SYMBOLS)],
    }


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _history_quote(symbol: str) -> dict[str, float]:
    ticker = yf.Ticker(symbol)
    history = ticker.history(period="5d", interval="1d", auto_adjust=False)
    if history is None or getattr(history, "empty", True):
        return {"value": 0.0, "change": 0.0, "changePct": 0.0}
    latest = history.iloc[-1]
    previous = history.iloc[-2] if len(history) > 1 else latest
    value = _to_float(latest.get("Close"))
    prev_value = _to_float(previous.get("Close"))
    change = value - prev_value
    change_pct = (change / prev_value * 100.0) if prev_value else 0.0
    return {"value": round(value, 2), "change": round(change, 2), "changePct": round(change_pct, 2)}


def _label_from_sentiment(value: float) -> str:
    if value >= 0.35:
        return "Bullish"
    if value >= 0.1:
        return "Constructive"
    if value <= -0.35:
        return "Bearish"
    if value <= -0.1:
        return "Cautious"
    return "Neutral"


def _ticker_for_sentiment(value: float) -> str:
    if value >= 0.15:
        return "+"
    if value <= -0.15:
        return "-"
    return "0"


def _first_nonempty(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _label_from_change(value: float) -> str:
    if value >= 1.5:
        return "Bullish"
    if value >= 0.25:
        return "Constructive"
    if value <= -1.5:
        return "Bearish"
    if value <= -0.25:
        return "Cautious"
    return "Neutral"


def _stock_payload_for(symbol: str, name: str, market: str, run_type: str, limit: int) -> dict[str, Any]:
    searxng = SearXNGClient()
    llm = OpenAIJSONClient()
    hit_map: dict[str, list[Any]] = defaultdict(list)
    for label, query, options in build_stock_queries(symbol, market, name):
        hit_map[label].extend(searxng.search(query, limit=limit, **options))
    curated = {
        "price": curate_hits("price", hit_map["price"], symbol, name, limit=limit),
        "news": curate_hits("news", hit_map["news"], symbol, name, limit=limit),
        "analyst": curate_hits("analyst", hit_map["analyst"], symbol, name, limit=limit),
    }
    full_news_articles = fetch_article_evidence(
        curated["news"],
        label="news",
        symbol=symbol,
        stock_name=name,
        limit=min(3, limit),
    )
    full_analyst_articles = fetch_article_evidence(
        curated["analyst"],
        label="analyst",
        symbol=symbol,
        stock_name=name,
        limit=min(2, limit),
    )
    prompt = build_user_prompt(
        symbol=symbol,
        market=market,
        stock_name=name,
        run_type=run_type,
        price_hits=curated["price"],
        news_hits=curated["news"],
        analyst_hits=curated["analyst"],
        full_news_articles=full_news_articles,
        full_analyst_articles=full_analyst_articles,
    )
    payload = llm.generate_stock_payload(SYSTEM_PROMPT, prompt)
    facts = extract_facts(
        symbol=symbol,
        stock_name=name,
        price_hits=curated["price"],
        news_hits=curated["news"],
        analyst_hits=curated["analyst"],
    )
    return merge_extracted_facts(payload, facts)


def _market_factual_context(market: str, stock_docs: dict[str, dict[str, Any]]) -> dict[str, Any]:
    sentiment_values = [float(doc["sentiment"]["overall"]) for doc in stock_docs.values()]
    sorted_rows = sorted(
        (
            {"symbol": symbol, "changePct": float(doc["price"]["changePct"] or 0.0)}
            for symbol, doc in stock_docs.items()
        ),
        key=lambda row: row["changePct"],
        reverse=True,
    )
    return {
        "indices": [{"name": label, **_history_quote(ticker)} for label, ticker in MARKET_INDEX_SYMBOLS[market]],
        "topMovers": {
            "gainers": sorted_rows[:3],
            "losers": sorted(sorted_rows, key=lambda row: row["changePct"])[:3],
        },
        "globalCues": {key: _history_quote(ticker) for key, ticker in GLOBAL_CUE_SYMBOLS.items()},
        "breadth": {
            "advancers": len([row for row in sorted_rows if row["changePct"] > 0]),
            "decliners": len([row for row in sorted_rows if row["changePct"] < 0]),
            "unchanged": len([row for row in sorted_rows if row["changePct"] == 0]),
        },
        "avgSentiment": round(sum(sentiment_values) / len(sentiment_values), 2) if sentiment_values else 0.0,
    }


def _build_market_doc(market: str, stock_docs: dict[str, dict[str, Any]], run_type: str, limit: int) -> dict[str, Any]:
    factual = _market_factual_context(market, stock_docs)
    searxng = SearXNGClient()
    llm = OpenAIJSONClient()
    hits: list[Any] = []
    for _label, query, options in build_market_queries(market):
        hits.extend(searxng.search(query, limit=limit, **options))
    required_terms = ["s&p", "nasdaq", "dow", "fed", "wall street"] if market == "US" else ["nifty", "sensex", "rbi", "india"]
    articles = fetch_topic_evidence(hits, label="market", required_terms=required_terms, limit=min(6, max(4, limit)))
    prompt = build_market_prompt(
        market=market,
        run_type=run_type,
        articles=articles,
        indices=factual["indices"],
        global_cues=factual["globalCues"],
        top_gainers=factual["topMovers"]["gainers"],
        top_losers=factual["topMovers"]["losers"],
        breadth=factual["breadth"],
    )
    ai_payload = llm.generate_market_payload(MARKET_SYSTEM_PROMPT, prompt)
    ai_sentiment = ai_payload.get("sentiment", {}) if isinstance(ai_payload, dict) else {}
    overall = float(ai_sentiment.get("overall") or factual.get("avgSentiment") or 0.0)
    return {
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "runType": run_type,
        "indices": factual["indices"],
        "sentiment": {
            "overall": round(overall, 2),
            "label": str(ai_sentiment.get("label") or _label_from_change(overall)),
            "drivers": [str(item) for item in ai_sentiment.get("drivers", [])][:4],
        },
        "topMovers": factual["topMovers"],
        "globalCues": factual["globalCues"],
        "keyHeadlines": [str(item) for item in ai_payload.get("keyHeadlines", [])][:6],
        "bottomLine": str(ai_payload.get("bottomLine") or ""),
    }


def _fetch_sector_price_docs(store: TraceMoneyStore, market: str, sector_symbols: list[str]) -> dict[str, dict[str, Any]]:
    """Fetch raw price docs from Firestore for all stocks in a sector.

    This reads from the full stock universe (not just AI-enriched stocks) so
    sector factual context reflects everyone in that sector.
    """
    price_docs: dict[str, dict[str, Any]] = {}
    for symbol in sector_symbols:
        iid = f"{market}_{symbol}"
        try:
            doc = store.db.collection("stocks").document(iid).get()
            if doc.exists:
                data = doc.to_dict() or {}
                price = data.get("price") or {}
                if price.get("changePct") is not None:
                    price_docs[symbol] = {"price": price}
        except Exception:
            pass
    return price_docs


def _sector_factual_context(sector_id: str, sector_name: str, price_docs: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Build sector factual context from raw Firestore price docs (all sector stocks)."""
    available = list(price_docs.keys())
    changes = [float(price_docs[s]["price"].get("changePct") or 0.0) for s in available]
    avg_change = sum(changes) / len(changes) if changes else 0.0
    sorted_symbols = sorted(available, key=lambda s: float(price_docs[s]["price"].get("changePct") or 0.0), reverse=True)
    return {
        "performance": {
            "changePct": round(avg_change, 2),
            "vsMarket": "outperforming" if avg_change > 0 else "underperforming" if avg_change < 0 else "flat",
        },
        "topMovers": {
            "gainers": [{"symbol": s, "changePct": price_docs[s]["price"].get("changePct")} for s in sorted_symbols[:3]],
            "losers": [{"symbol": s, "changePct": price_docs[s]["price"].get("changePct")} for s in sorted_symbols[-3:]],
        },
        "trackedStocks": sorted_symbols,
    }


def _build_sector_doc(sector_id: str, sector_name: str, sector_symbols: list[str], store: TraceMoneyStore, run_type: str, market: str, limit: int) -> dict[str, Any]:
    """Build a sector doc using:
    - Factual context: price data fetched from Firestore for ALL stocks in the sector
    - Narrative: SearXNG sector-level web search → LLM (no pre-enriched stock summaries)
    """
    price_docs = _fetch_sector_price_docs(store, market, sector_symbols)
    factual = _sector_factual_context(sector_id, sector_name, price_docs)
    searxng = SearXNGClient()
    llm = OpenAIJSONClient()
    hits: list[Any] = []
    for _label, query, options in build_sector_queries(market, sector_name, factual["trackedStocks"]):
        hits.extend(searxng.search(query, limit=limit, **options))
    required_terms = [sector_name.lower()]
    articles = fetch_topic_evidence(hits, label="sector", required_terms=required_terms, limit=min(5, max(3, limit)))
    prompt = build_sector_prompt(
        market=market,
        sector_id=sector_id,
        sector_name=sector_name,
        run_type=run_type,
        articles=articles,
        sector_symbols=factual["trackedStocks"],
        performance=factual["performance"],
        top_gainers=factual["topMovers"]["gainers"],
        top_losers=factual["topMovers"]["losers"],
    )
    ai_payload = llm.generate_sector_payload(SECTOR_SYSTEM_PROMPT, prompt)
    ai_sentiment = ai_payload.get("sentiment", {}) if isinstance(ai_payload, dict) else {}
    overall = float(ai_sentiment.get("overall") or 0.0)
    return {
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "runType": run_type,
        "sentiment": {
            "overall": round(overall, 2),
            "label": str(ai_sentiment.get("label") or _label_from_change(overall)),
            "drivers": [str(item) for item in ai_sentiment.get("drivers", [])][:3],
        },
        "performance": factual["performance"],
        "topMovers": factual["topMovers"],
        "drivers": [str(item) for item in ai_payload.get("drivers", [])][:3],
        "bottomLine": str(ai_payload.get("bottomLine") or ""),
    }


def _meta_for_market(meta_stocks: dict[str, Any], meta_sectors: dict[str, Any], market: str) -> tuple[dict[str, Any], dict[str, Any]]:
    key = "india" if market == "IN" else "us"
    return (meta_stocks.get(key, {}) or {}, meta_sectors.get(key, {}) or {})


def _default_symbols_for_market(market: str) -> list[str]:
    universe = _load_ai_universe()
    return universe.get(market, DEFAULT_IN_SYMBOLS if market == "IN" else DEFAULT_US_SYMBOLS)


def _run_market_batch(
    store: TraceMoneyStore,
    client: TikrrAPIClient,
    market: str,
    symbols: list[str],
    run_type: str,
    limit: int,
    max_workers: int,
) -> tuple[int, int, list[str]]:
    meta_stocks_doc = store.db.collection("meta").document("stocks").get().to_dict() or {}
    meta_sectors_doc = store.db.collection("meta").document("sectors").get().to_dict() or {}
    market_stocks, market_sectors = _meta_for_market(meta_stocks_doc, meta_sectors_doc, market)

    started_at = datetime.now(timezone.utc).isoformat()
    client.push_run_status(
        market=market,
        run_type=run_type,
        status="started",
        started_at=started_at,
        completed_at=None,
        stocks_updated=0,
        sectors_updated=0,
        markets_updated=0,
        errors=[],
    )

    stock_docs: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    requested: list[tuple[str, str]] = []
    for symbol in symbols:
        upper_symbol = symbol.upper()
        stock_meta = market_stocks.get(upper_symbol)
        if not stock_meta:
            errors.append(f"Missing stock meta for {upper_symbol}")
            continue
        requested.append((upper_symbol, str(stock_meta.get("name") or upper_symbol)))

    with ThreadPoolExecutor(max_workers=max(1, min(max_workers, len(requested) or 1))) as executor:
        futures = {
            executor.submit(_stock_payload_for, symbol, name, market, run_type, limit): (symbol, name)
            for symbol, name in requested
        }
        for future in as_completed(futures):
            symbol, _name = futures[future]
            try:
                payload = future.result()
                client.push_stock(market, symbol, payload)
                stock_docs[symbol] = payload
                print(f"pushed {market} stock {symbol}")
            except Exception as exc:
                errors.append(f"{symbol}: {exc}")
                print(f"failed {market} stock {symbol}: {exc}")

    market_doc = _build_market_doc(market, stock_docs, run_type, limit)
    client.push_market(market, market_doc)
    print(f"pushed market {market}")

    sector_docs = 0
    active_sector_ids: list[str] = []
    for sector_id, sector_meta in market_sectors.items():
        sector_symbols = [str(s).upper() for s in sector_meta.get("stocks", [])]
        if not sector_symbols:
            continue
        payload = _build_sector_doc(sector_id, str(sector_meta.get("name") or sector_id), sector_symbols, store, run_type, market, limit)
        client.push_sector(sector_id, payload)
        sector_docs += 1
        active_sector_ids.append(sector_id)
        print(f"pushed sector {sector_id}")

    completed_at = datetime.now(timezone.utc).isoformat()
    store.db.collection("meta").document("tikrrEvalUniverse").set({
        market: {
            "symbols": list(stock_docs.keys()),
            "sectorIds": active_sector_ids,
            "lastUpdated": completed_at,
        },
        "updatedAtServer": completed_at,
    }, merge=True)
    client.push_run_status(
        market=market,
        run_type=run_type,
        status="completed",
        started_at=started_at,
        completed_at=completed_at,
        stocks_updated=len(stock_docs),
        sectors_updated=sector_docs,
        markets_updated=1,
        errors=errors,
    )
    print(
        f"completed demo batch: market={market} stocks={len(stock_docs)} sectors={sector_docs} errors={len(errors)}"
    )
    return len(stock_docs), sector_docs, errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a small Tikrr demo batch and push it to the live API")
    parser.add_argument("--market", default="US", choices=["US", "IN", "ALL"])
    parser.add_argument("--symbols", nargs="*")
    parser.add_argument("--run-type", default="market_open", choices=["pre_market", "market_open", "midday", "market_close"])
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--max-workers", type=int, default=3)
    args = parser.parse_args()

    store = TraceMoneyStore()
    client = TikrrAPIClient()
    markets = ["US", "IN"] if args.market == "ALL" else [args.market]
    for market in markets:
        symbols = [symbol.upper() for symbol in (args.symbols or _default_symbols_for_market(market))]
        _run_market_batch(store, client, market, symbols, args.run_type, args.limit, args.max_workers)


if __name__ == "__main__":
    main()
