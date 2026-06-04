"""Compute sector-level regime signals and write to tm_sector_regimes.

For each sector in the instrument universe we aggregate per-stock technical
and price data, compute a handful of heuristic signals, then call the LLM to
classify the regime and write the result to Firestore.

Regime doc is keyed as  tm_sector_regimes/{MARKET}__{sector_slug}
A  tm_sector_regimes/{MARKET}__macro  doc is also written that summarises
all sectors into a market-wide read.

Usage:
    # today
    python -m backend.scripts.build_sector_regimes --market US --dry-run
    python -m backend.scripts.build_sector_regimes --market US

    # historical backtest (one date)
    python -m backend.scripts.build_sector_regimes --market US --date 2026-05-15

    # backtest range (writes one doc per sector per date under a _backtest suffix)
    python -m backend.scripts.build_sector_regimes --market US --backtest --from-date 2026-05-01 --to-date 2026-06-01
"""
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
    llm_api_url,
    llm_headers,
    llm_model,
    parse_json_content,
    require_llm_api_key,
    schema_system_prompt,
)
from backend.storage import TraceMoneyStore

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REGIME_SYSTEM_PROMPT = """You are a market analyst classifying the current regime for a specific stock market sector.

You will receive heuristic signals computed from recent price and technical data for all stocks in the sector.
Your job is to synthesise these into a regime classification and a brief, opinionated narrative.

Rules:
- Be direct. No hedge words like "may", "could", "might", "unclear".
- regime must be one of: expanding | momentum | topping | choppy | breaking_down | recovering
  - expanding: breadth rising, majority above key MAs, positive RS vs market
  - momentum: strong trend already in place, breadth holding, RS positive
  - topping: breadth starting to narrow, divergences forming, RS flattening
  - choppy: no clear trend, mixed breadth, RS flat
  - breaking_down: majority below MAs, breadth negative, RS negative
  - recovering: breadth turning up from lows, early RS improvement
- conviction is 0-100. Use 80+ only when signals strongly agree.
- narrative: 2 short sentences. State the regime and the key reason.
- invalidators: exactly 2-3 concrete if/then conditions that would flip the regime.
- leadership_stocks: up to 3 tickers leading the sector (from the input data). Empty list if none stand out.

Return exactly one JSON object matching the schema. No markdown.
"""

REGIME_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["regime", "conviction", "narrative", "invalidators", "leadership_stocks"],
    "properties": {
        "regime": {
            "type": "string",
            "enum": ["expanding", "momentum", "topping", "choppy", "breaking_down", "recovering"],
        },
        "conviction": {"type": "integer", "minimum": 0, "maximum": 100},
        "narrative": {"type": "string"},
        "invalidators": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 2,
            "maxItems": 3,
        },
        "leadership_stocks": {
            "type": "array",
            "items": {"type": "string"},
            "maxItems": 3,
        },
    },
}

MACRO_SYSTEM_PROMPT = """You are a macro market analyst summarising cross-sector regime data into a market-wide read.

You will receive a list of sector regime docs. Synthesise them into a single macro view.

Rules:
- Be direct and opinionated.
- risk_appetite: "on" | "off" | "mixed"
- market_phase: "trending_up" | "distribution" | "correction" | "recovery" | "range"
- narrative: 2 short sentences on what the market is doing and why.
- leadership: sectors currently leading (expanding or momentum regime).
- laggards: sectors currently lagging (breaking_down or choppy).
- rotation_signal: one sentence if you see rotation happening, empty string if not.

Return exactly one JSON object matching the schema. No markdown.
"""

MACRO_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["risk_appetite", "market_phase", "narrative", "leadership", "laggards", "rotation_signal"],
    "properties": {
        "risk_appetite": {"type": "string", "enum": ["on", "off", "mixed"]},
        "market_phase": {
            "type": "string",
            "enum": ["trending_up", "distribution", "correction", "recovery", "range"],
        },
        "narrative": {"type": "string"},
        "leadership": {"type": "array", "items": {"type": "string"}},
        "laggards": {"type": "array", "items": {"type": "string"}},
        "rotation_signal": {"type": "string"},
    },
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _date_range(from_date: str, to_date: str) -> list[str]:
    start = datetime.fromisoformat(from_date).date()
    end = datetime.fromisoformat(to_date).date()
    days: list[str] = []
    current = start
    while current <= end:
        days.append(current.isoformat())
        current += timedelta(days=1)
    return days


# ---------------------------------------------------------------------------
# Signal computation
# ---------------------------------------------------------------------------

def _compute_sector_signals(
    sector: str,
    instruments: list[dict[str, Any]],
    technical_docs: dict[str, dict[str, Any]],
    price_docs: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Aggregate per-stock technicals into sector-level signals."""
    tickers: list[str] = []
    moves: list[float] = []
    above_sma20 = above_sma50 = above_sma200 = eligible_ma = 0
    rsi_values: list[float] = []
    top_movers: list[dict[str, Any]] = []

    for inst in instruments:
        iid = inst.get("instrument_id", "")
        ticker = inst.get("ticker", "")
        tech = technical_docs.get(iid) or {}
        price = price_docs.get(iid) or {}

        tickers.append(ticker)

        # Day change: prefer the snapshot baked into the technical doc (accurate
        # for historical dates), fall back to live price doc for today's run.
        day_change = _to_float(tech.get("day_change_pct"))
        if day_change is None:
            quote = price.get("quote") or {}
            day_change = _to_float(quote.get("day_change_pct"))
        if day_change is not None:
            moves.append(day_change)
            if abs(day_change) >= 2.0:
                top_movers.append({"ticker": ticker, "change_pct": day_change})

        # MA positions
        ma = tech.get("moving_averages") or {}
        has_sma20 = ma.get("sma_20") is not None
        has_sma50 = ma.get("sma_50") is not None
        has_sma200 = ma.get("sma_200") is not None
        if has_sma20 or has_sma50 or has_sma200:
            eligible_ma += 1
        if ma.get("price_vs_sma_20") == "above":
            above_sma20 += 1
        if ma.get("price_vs_sma_50") == "above":
            above_sma50 += 1
        if ma.get("price_vs_sma_200") == "above":
            above_sma200 += 1

        # RSI
        rsi_block = tech.get("rsi_14") or {}
        rsi_val = _to_float(rsi_block.get("value"))
        if rsi_val is not None:
            rsi_values.append(rsi_val)

    n = len(instruments)
    if n == 0:
        return {"sector": sector, "stock_count": 0, "error": "no_instruments"}

    # Breadth
    up_count = sum(1 for m in moves if m > 0)
    down_count = sum(1 for m in moves if m < 0)
    breadth_ratio = (up_count / len(moves)) if moves else None  # 0-1, >0.6 = bullish

    # MA participation
    sma20_pct = (above_sma20 / eligible_ma * 100) if eligible_ma else None
    sma50_pct = (above_sma50 / eligible_ma * 100) if eligible_ma else None
    sma200_pct = (above_sma200 / eligible_ma * 100) if eligible_ma else None

    # Average RSI
    avg_rsi = (sum(rsi_values) / len(rsi_values)) if rsi_values else None

    # Average move
    avg_move = (sum(moves) / len(moves)) if moves else None

    # Top movers (for leadership)
    top_movers.sort(key=lambda x: x["change_pct"], reverse=True)

    return {
        "sector": sector,
        "stock_count": n,
        "tickers_in_sector": tickers[:20],  # cap for prompt size
        "breadth": {
            "up_count": up_count,
            "down_count": down_count,
            "total_with_moves": len(moves),
            "up_ratio": round(breadth_ratio, 3) if breadth_ratio is not None else None,
            "description": (
                "bullish" if breadth_ratio and breadth_ratio >= 0.6
                else "bearish" if breadth_ratio and breadth_ratio <= 0.4
                else "mixed"
            ) if breadth_ratio is not None else "unknown",
        },
        "ma_participation": {
            "above_sma20_pct": round(sma20_pct, 1) if sma20_pct is not None else None,
            "above_sma50_pct": round(sma50_pct, 1) if sma50_pct is not None else None,
            "above_sma200_pct": round(sma200_pct, 1) if sma200_pct is not None else None,
            "eligible": eligible_ma,
        },
        "momentum": {
            "avg_rsi": round(avg_rsi, 1) if avg_rsi is not None else None,
            "avg_day_move_pct": round(avg_move, 3) if avg_move is not None else None,
        },
        "top_movers": top_movers[:5],
    }


# ---------------------------------------------------------------------------
# LLM calls
# ---------------------------------------------------------------------------

def _llm_classify_sector(signals: dict[str, Any], model_name: str) -> dict[str, Any]:
    api_key = require_llm_api_key()
    response = requests.post(
        llm_api_url(),
        headers=llm_headers(api_key),
        json={
            "model": model_name,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": schema_system_prompt(REGIME_SYSTEM_PROMPT, REGIME_SCHEMA),
                },
                {
                    "role": "user",
                    "content": json.dumps(signals, ensure_ascii=True),
                },
            ],
            "response_format": json_response_format(),
        },
        timeout=60,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return parse_json_content(content)


def _llm_classify_macro(sector_regimes: list[dict[str, Any]], model_name: str) -> dict[str, Any]:
    api_key = require_llm_api_key()
    # Send a slim version of each sector regime to keep prompt small
    slim = [
        {
            "sector": r.get("sector"),
            "regime": r.get("regime"),
            "conviction": r.get("conviction"),
            "narrative": r.get("narrative"),
        }
        for r in sector_regimes
    ]
    response = requests.post(
        llm_api_url(),
        headers=llm_headers(api_key),
        json={
            "model": model_name,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": schema_system_prompt(MACRO_SYSTEM_PROMPT, MACRO_SCHEMA),
                },
                {
                    "role": "user",
                    "content": json.dumps({"sectors": slim}, ensure_ascii=True),
                },
            ],
            "response_format": json_response_format(),
        },
        timeout=60,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return parse_json_content(content)


# ---------------------------------------------------------------------------
# Firestore helpers
# ---------------------------------------------------------------------------

def _fetch_technicals_for_date(
    store: TraceMoneyStore,
    instrument_ids: list[str],
    date_str: str,
) -> dict[str, dict[str, Any]]:
    """Batch-fetch technical docs for a specific date."""
    collection = store.db.collection("tm_stock_technicals")
    refs = [collection.document(f"{iid}_{date_str}") for iid in instrument_ids]
    out: dict[str, dict[str, Any]] = {}
    # Firestore getAll has a 500-doc limit; chunk if needed
    chunk_size = 400
    for i in range(0, len(refs), chunk_size):
        chunk = refs[i : i + chunk_size]
        for snap in store.db.get_all(chunk):
            if snap.exists:
                data = snap.to_dict() or {}
                iid = str(data.get("instrument_id") or "").strip()
                if iid:
                    out[iid] = data
    return out


def _fetch_prices_latest(
    store: TraceMoneyStore,
    instrument_ids: list[str],
) -> dict[str, dict[str, Any]]:
    """Fetch latest price docs."""
    collection = store.db.collection("tm_latest_prices")
    refs = [collection.document(iid) for iid in instrument_ids]
    out: dict[str, dict[str, Any]] = {}
    chunk_size = 400
    for i in range(0, len(refs), chunk_size):
        for snap in store.db.get_all(refs[i : i + chunk_size]):
            if snap.exists:
                data = snap.to_dict() or {}
                out[snap.id] = data
    return out


def _save_sector_regime(
    store: TraceMoneyStore,
    market: str,
    sector_slug: str,
    payload: dict[str, Any],
    *,
    backtest_date: str | None = None,
) -> None:
    collection = store.db.collection("tm_sector_regimes")
    if backtest_date:
        doc_id = f"{market}__{sector_slug}__bt_{backtest_date}"
    else:
        doc_id = f"{market}__{sector_slug}"
    collection.document(doc_id).set(payload)


def _save_macro_regime(
    store: TraceMoneyStore,
    market: str,
    payload: dict[str, Any],
    *,
    backtest_date: str | None = None,
) -> None:
    collection = store.db.collection("tm_sector_regimes")
    if backtest_date:
        doc_id = f"{market}__macro__bt_{backtest_date}"
    else:
        doc_id = f"{market}__macro"
    collection.document(doc_id).set(payload)


# ---------------------------------------------------------------------------
# Core build logic
# ---------------------------------------------------------------------------

def build_for_date(
    store: TraceMoneyStore,
    *,
    market: str,
    date_str: str,
    model_name: str,
    dry_run: bool,
    backtest: bool,
    verbose: bool,
) -> dict[str, Any]:
    """Build sector regimes for a single date. Returns summary dict."""
    # Load instrument universe with sector info
    instruments = store.list_instruments(market)
    if not instruments:
        return {"error": "no_instruments", "market": market, "date": date_str}

    instrument_ids = [i["instrument_id"] for i in instruments if i.get("instrument_id")]

    # Group by sector
    by_sector: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for inst in instruments:
        sector = str(inst.get("sector") or "").strip()
        if sector:
            by_sector[sector].append(inst)

    if not by_sector:
        return {"error": "no_sector_info", "market": market, "date": date_str}

    # Fetch technical docs for the date (historical) or latest
    technical_docs = _fetch_technicals_for_date(store, instrument_ids, date_str)

    # For live runs (or when date-specific docs are sparse), fill gaps from latest
    if not backtest:
        missing_ids = [iid for iid in instrument_ids if iid not in technical_docs]
        if missing_ids:
            collection = store.db.collection("tm_stock_technicals_latest")
            chunk_size = 400
            for i in range(0, len(missing_ids), chunk_size):
                chunk_refs = [collection.document(iid) for iid in missing_ids[i : i + chunk_size]]
                for snap in store.db.get_all(chunk_refs):
                    if snap.exists:
                        data = snap.to_dict() or {}
                        iid = str(data.get("instrument_id") or "").strip()
                        if iid:
                            technical_docs[iid] = data

    # Price docs (always latest for signals, good enough)
    price_docs = _fetch_prices_latest(store, instrument_ids)

    if verbose:
        print(f"  instruments={len(instruments)}, sectors={len(by_sector)}, "
              f"tech_docs={len(technical_docs)}, price_docs={len(price_docs)}")

    sector_results: list[dict[str, Any]] = []
    for sector, sector_instruments in sorted(by_sector.items()):
        sector_slug = _slugify(sector)
        signals = _compute_sector_signals(sector, sector_instruments, technical_docs, price_docs)

        if verbose:
            print(f"  sector={sector!r} n={len(sector_instruments)} "
                  f"breadth={signals.get('breadth', {}).get('description')}")

        if dry_run:
            sector_results.append({"sector": sector, "signals": signals, "dry_run": True})
            continue

        try:
            llm_out = _llm_classify_sector(signals, model_name)
        except Exception as exc:
            print(f"  [WARN] LLM failed for sector {sector!r}: {exc}")
            sector_results.append({"sector": sector, "error": str(exc)})
            continue

        doc = {
            "market": market,
            "sector": sector,
            "sector_slug": sector_slug,
            "as_of_date": date_str,
            "generated_at": _now_iso(),
            "stock_count": signals.get("stock_count", 0),
            "signals": signals,
            "regime": llm_out.get("regime", "choppy"),
            "conviction": llm_out.get("conviction", 50),
            "narrative": llm_out.get("narrative", ""),
            "invalidators": llm_out.get("invalidators", []),
            "leadership_stocks": llm_out.get("leadership_stocks", []),
        }

        _save_sector_regime(
            store, market, sector_slug, doc,
            backtest_date=date_str if backtest else None,
        )
        sector_results.append(doc)
        if verbose:
            print(f"    -> regime={doc['regime']} conviction={doc['conviction']}")

    # Macro roll-up
    if not dry_run and sector_results:
        completed = [r for r in sector_results if "regime" in r]
        if completed:
            try:
                macro_out = _llm_classify_macro(completed, model_name)
                macro_doc = {
                    "market": market,
                    "as_of_date": date_str,
                    "generated_at": _now_iso(),
                    "sector_count": len(completed),
                    **macro_out,
                }
                _save_macro_regime(
                    store, market, macro_doc,
                    backtest_date=date_str if backtest else None,
                )
                if verbose:
                    print(f"  macro: phase={macro_out.get('market_phase')} "
                          f"risk={macro_out.get('risk_appetite')}")
            except Exception as exc:
                print(f"  [WARN] Macro LLM failed: {exc}")

    return {
        "market": market,
        "date": date_str,
        "sectors_processed": len(sector_results),
        "dry_run": dry_run,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Build sector regimes for one date or a backtest range")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--date", default=None, help="Date to compute (YYYY-MM-DD). Defaults to today.")
    parser.add_argument("--backtest", action="store_true", help="Run over a date range; saves with __bt_ suffix.")
    parser.add_argument("--from-date", default=None, help="Start of backtest range (YYYY-MM-DD).")
    parser.add_argument("--to-date", default=None, help="End of backtest range (YYYY-MM-DD). Defaults to yesterday.")
    parser.add_argument("--dry-run", action="store_true", help="Compute signals but skip LLM + Firestore writes.")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    market = args.market.upper()
    model_name = llm_model()
    store = TraceMoneyStore()

    if args.backtest:
        from_date = args.from_date
        if not from_date:
            # Default: last 30 days
            from_date = (datetime.now(timezone.utc).date() - timedelta(days=30)).isoformat()
        to_date = args.to_date or (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
        dates = _date_range(from_date, to_date)
        print(json.dumps({"status": "backtest_start", "market": market, "dates": len(dates),
                          "from": from_date, "to": to_date}))
        results = []
        for date_str in dates:
            print(f"  [{date_str}]", flush=True)
            result = build_for_date(
                store,
                market=market,
                date_str=date_str,
                model_name=model_name,
                dry_run=args.dry_run,
                backtest=True,
                verbose=args.verbose,
            )
            results.append(result)
        print(json.dumps({"status": "backtest_done", "processed": len(results)}))
    else:
        date_str = args.date or datetime.now(timezone.utc).date().isoformat()
        result = build_for_date(
            store,
            market=market,
            date_str=date_str,
            model_name=model_name,
            dry_run=args.dry_run,
            backtest=False,
            verbose=args.verbose,
        )
        print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
