"""Generate the five plain-English business questions for Stocksbrew stocks."""
from __future__ import annotations

import argparse
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.llm_client import (
    json_response_format,
    llm_model,
    parse_json_content,
    post_chat_completion,
    schema_system_prompt,
)
from backend.market_strategy import default_llm_model
from backend.scripts.build_per_stock_intelligence import _merge_with_paid_tracked
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)

QUESTIONS = (
    "How does the business make money?",
    "How are the financials doing?",
    "What is the market expecting?",
    "What’s helping the business grow?",
    "What could hurt the business?",
)

QUESTIONS_PROMPT = """You write a short business read for a stock research product.

Answer the five questions in order using the current Stocksbrew data as your anchor, while adding stable knowledge you already have about the company and its industry. Reason like a smart investor, but write like you are explaining it to a smart friend.

Rules:
- Return one concise paragraph per question, with 1 to 3 short sentences.
- Use simple everyday language. Avoid finance jargon; explain any necessary term plainly.
- Do not repeat raw figures or list the supplied data. Turn it into an insight about the business.
- Do not give buy, sell, or hold advice.
- If the current evidence does not support a specific claim, say “not enough current evidence” instead of guessing.
- Do not mention the prompt, data payload, source limits, or being an AI.
- Keep the question text exactly as supplied.
"""

OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "minItems": 5,
            "maxItems": 5,
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "answer": {"type": "string"},
                },
                "required": ["question", "answer"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["answers"],
    "additionalProperties": False,
}


def _compact(value: Any, *, limit: int = 9000) -> Any:
    encoded = json.dumps(value, ensure_ascii=True, default=str, separators=(",", ":"))
    if len(encoded) <= limit:
        return value
    return encoded[:limit] + "..."


def _payload(
    instrument: dict[str, Any],
    facts: dict[str, Any],
    latest_price: dict[str, Any],
    intelligence: dict[str, Any],
    intel_pro: dict[str, Any],
) -> dict[str, Any]:
    return {
        "company": {
            "ticker": instrument.get("ticker"),
            "name": instrument.get("name"),
            "sector": instrument.get("sector"),
            "industry": instrument.get("industry"),
            "description": instrument.get("description"),
        },
        "current_market": {
            "price": ((latest_price.get("quote") or {}).get("current")),
            "market_cap": (latest_price.get("fundamentals") or {}).get("market_cap"),
            "captured_at": latest_price.get("captured_at") or latest_price.get("updated_at"),
        },
        "financials": {
            "captured_at": facts.get("captured_at"),
            "financials": facts.get("financials"),
            "financial_history": facts.get("financial_history"),
            "balance": facts.get("balance"),
            "valuation": facts.get("valuation"),
            "quality": facts.get("quality"),
            "analyst": facts.get("analyst"),
            "business_segments": facts.get("business_segments"),
            "geographic_mix": facts.get("geographic_mix"),
        },
        "recent_stocksbrew_read": {
            "generated_at": intelligence.get("generated_at"),
            "headline": intelligence.get("headline"),
            "thesis": intelligence.get("thesis"),
            "today_brief": intelligence.get("today_brief"),
            "week_summary": intelligence.get("week_summary"),
            "catalyst": intelligence.get("catalyst"),
            "risk": intelligence.get("risk"),
            "visual_summary": intelligence.get("visual_summary"),
        },
        "quality_scorecard": {
            "overall": intel_pro.get("overall"),
            "pillars": intel_pro.get("pillars"),
        },
    }


def _generate(instrument: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    ticker = str(instrument.get("ticker") or "").strip().upper()
    user_payload = {
        "ticker": ticker,
        "questions": list(QUESTIONS),
        "current_data": _compact(payload),
    }
    response = post_chat_completion(
        model=llm_model(default_llm_model()),
        reasoning_effort="low",
        response_format=json_response_format(),
        stage="business_questions",
        messages=[
            {"role": "system", "content": schema_system_prompt(QUESTIONS_PROMPT, OUTPUT_SCHEMA)},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
        ],
        timeout=90,
        max_attempts=4,
    )
    content = ((response.get("choices") or [{}])[0].get("message") or {}).get("content")
    parsed = parse_json_content(str(content or ""))
    answers = parsed.get("answers")
    if not isinstance(answers, list) or len(answers) != len(QUESTIONS):
        raise ValueError(f"{ticker}: expected five answers")
    normalized = []
    for expected, row in zip(QUESTIONS, answers):
        if not isinstance(row, dict):
            raise ValueError(f"{ticker}: invalid answer row")
        answer = " ".join(str(row.get("answer") or "").split()).strip()
        if not answer:
            raise ValueError(f"{ticker}: empty answer")
        normalized.append({"question": expected, "answer": answer})
    return {
        "instrument_id": str(instrument.get("instrument_id") or "").strip().upper(),
        "ticker": ticker,
        "market": str(instrument.get("market") or "").strip().upper(),
        "questions": normalized,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": llm_model(default_llm_model()),
    }


def _merge_researched_instruments(
    store: TraceMoneyStore,
    market: str,
    universe_id: str,
    instruments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Include on-demand researched stocks outside the static AI universe."""
    existing_ids = {
        str(row.get("instrument_id") or "").strip().upper()
        for row in instruments
        if row.get("instrument_id")
    }
    researched_ids = {
        str(row.get("instrument_id") or "").strip().upper()
        for row in store.list_stock_intelligence_docs(market, universe_id)
        if row.get("instrument_id")
    }
    extra_ids = sorted(researched_ids - existing_ids)
    if not extra_ids:
        return instruments
    return instruments + store.list_instruments(market, extra_ids)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build weekly business questions for the AI stock cohort")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    parser.add_argument("--instrument-ids", default="")
    parser.add_argument("--all-stocks", action="store_true", help="Generate for every persisted stock in the market")
    parser.add_argument("--missing-only", action="store_true", help="Generate questions only for researched stocks missing them")
    parser.add_argument("--max-workers", type=int, default=4)
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = str(args.universe or store.get_active_ai_universe(args.market) or "").strip()
    if not universe_id:
        raise ValueError(f"No active AI universe configured for {args.market}")

    seed_instruments = store.list_instruments(args.market) if args.all_stocks else list_instruments(args.market, universe_id)
    instruments, paid_count, paid_extra = _merge_with_paid_tracked(store, args.market, seed_instruments)
    instruments = _merge_researched_instruments(store, args.market, universe_id, instruments)
    requested = {item.strip().upper() for item in args.instrument_ids.split(",") if item.strip()}
    if requested:
        instruments = [
            row for row in instruments
            if str(row.get("instrument_id") or "").strip().upper() in requested
        ]
    ids = [str(row.get("instrument_id") or "").strip().upper() for row in instruments if row.get("instrument_id")]
    if args.missing_only:
        existing_questions = store.get_business_questions_docs_batch(args.market, universe_id, ids)
        instruments = [row for row in instruments if str(row.get("instrument_id") or "").strip().upper() not in existing_questions]
        ids = [str(row.get("instrument_id") or "").strip().upper() for row in instruments if row.get("instrument_id")]
        print({"missing_only": True, "selected_missing": len(ids)})
        if not ids:
            print("[business-questions] no missing documents")
            return
    facts = store.get_stock_facts_batch(ids)
    latest = store.get_latest_prices(ids)
    intelligence = store.get_stock_intelligence_docs_batch(args.market, universe_id, ids)
    intel_pro = store.get_stock_intel_pro_batch(args.market, universe_id, ids)
    print({"market": args.market, "universe": universe_id, "instruments": len(ids), "paid_tracked": paid_count, "paid_extra": paid_extra})

    results: list[dict[str, Any]] = []
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=max(1, args.max_workers)) as executor:
        futures = {
            executor.submit(
                _generate,
                instrument,
                _payload(
                    instrument,
                    facts.get(instrument["instrument_id"], {}),
                    latest.get(instrument["instrument_id"], {}),
                    intelligence.get(instrument["instrument_id"], {}),
                    intel_pro.get(instrument["instrument_id"], {}),
                ),
            ): instrument
            for instrument in instruments
        }
        for future in as_completed(futures):
            instrument = futures[future]
            ticker = str(instrument.get("ticker") or instrument.get("instrument_id") or "").upper()
            try:
                results.append(future.result())
                print(f"[business-questions] generated {ticker}")
            except Exception as exc:
                failures.append(ticker)
                logger.exception("business_questions failed ticker=%s error=%s", ticker, exc)
                print(f"[business-questions] failed {ticker}: {exc}")

    saved = store.save_business_questions_docs(args.market, universe_id, results)
    print({"saved": saved, "failed": len(failures), "failed_tickers": sorted(failures)})
    if not results:
        raise RuntimeError("No business question documents were generated")


if __name__ == "__main__":
    main()
