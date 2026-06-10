"""Build pre-earnings setup reports for stocks reporting in the next N days.

MVP:
    python -m backend.scripts.build_pre_earnings_intel --market US --ticker NVDA --dry-run

Batch (universe-scoped, US only, skips already-built events unless --force):
    python -m backend.scripts.build_pre_earnings_intel --market US --all-upcoming --write
"""
from __future__ import annotations

import argparse
import json
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
from backend.pre_earnings_enrichment import enrich_pre_earnings_payload
from backend.scripts.build_earnings_intel import (
    OPENAI_DEFAULT_MODEL,
    _as_date,
    _build_input_payload,
    _sanitize_decision_guide,
    _universe_instruments_by_ticker,
    _utc_now,
)
from backend.storage import TraceMoneyStore


PRE_EARNINGS_SYSTEM_PROMPT = """You are writing a PRE-EARNINGS setup card for US retail investors.

The print has NOT happened yet (payload.timing.status is "upcoming").

Voice (strict):
- Be direct and opinionated. Write like you are telling a friend what to expect.
- No hedge words: ban "lean", "may", "could", "unclear", "mixed signals", "monitor", "watch for", "catalyst".
- No vendor or data-source names in any string you output.
- headline: one punchy verdict (max 14 words). Example: "Hot EPS setup but stock already ran."
- summary: max 2 short sentences. State what you expect on EPS and on the stock price after.
- NEVER use em dashes, en dashes as punctuation, semicolons, or bullet characters in strings.

Use payload.eps_consensus, payload.external_research, prices, fundamentals, and news.
Pick sides from the evidence:

- eps_outlook: beat | inline | miss
  Use beat when eps_consensus signals favor above-consensus EPS.
  Use miss when signals favor a miss.
  Use inline only when signals are balanced.
  Use unclear ONLY when calendar_eps_estimate is missing AND external_research has no estimate clues.

- post_print_move: rally | fade | chop
  rally = bullish stock reaction after the report (UI label: Bullish).
  fade = bearish stock reaction after the report (UI label: Bearish).
  chop = neutral, range-bound reaction (UI label: Neutral).
  Use unclear ONLY when you have almost no price or positioning context.
  In headline and summary, use words like EPS beat, EPS miss, bullish, bearish. Never say rip, dump, meh, or chop.

- setup.consensus_context: one sentence with a number from payload when possible.
- setup.pre_earnings_positioning: one sentence on how the stock is set up into the print.
- key_bull_case / key_bear_case: max 2 items each, max 12 words, concrete.
- decision_guide.for_holders / for_watchers: imperative, max 18 words each.
- invalidators: max 3 concrete if/then checks.
- confidence.score_0_100: how strong the evidence stack is (not a probability).
- confidence.reason: one short sentence, no banned words.

If payload.external_research searches succeeded, use fresh preview snippets.
If eps_consensus.signals is non-empty, your eps_outlook and post_print_move should align with those signals unless external_research strongly disagrees (say why in summary).
"""

PRE_EARNINGS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": [
        "headline",
        "summary",
        "call",
        "setup",
        "decision_guide",
        "confidence",
        "invalidators",
    ],
    "properties": {
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "call": {
            "type": "object",
            "required": ["eps_outlook", "post_print_move"],
            "properties": {
                "eps_outlook": {
                    "type": "string",
                    "enum": ["beat", "inline", "miss", "unclear"],
                },
                "post_print_move": {
                    "type": "string",
                    "enum": ["rally", "fade", "chop", "unclear"],
                },
            },
        },
        "setup": {
            "type": "object",
            "required": [
                "consensus_context",
                "pre_earnings_positioning",
                "key_bull_case",
                "key_bear_case",
            ],
            "properties": {
                "consensus_context": {"type": "string"},
                "pre_earnings_positioning": {"type": "string"},
                "key_bull_case": {"type": "array", "items": {"type": "string"}},
                "key_bear_case": {"type": "array", "items": {"type": "string"}},
            },
        },
        "decision_guide": {
            "type": "object",
            "required": ["for_holders", "for_watchers", "key_monitor_list"],
            "properties": {
                "for_holders": {"type": "string"},
                "for_watchers": {"type": "string"},
                "key_monitor_list": {"type": "array", "items": {"type": "string"}},
            },
        },
        "confidence": {
            "type": "object",
            "required": ["score_0_100", "reason"],
            "properties": {
                "score_0_100": {"type": "number"},
                "reason": {"type": "string"},
            },
        },
        "invalidators": {"type": "array", "items": {"type": "string"}},
    },
}

_BANNED_OUTPUT_WORDS = ("lean", "zacks", "finviz", "tavily")


def _build_doc_id(market: str, instrument_id: str, event_date: str) -> str:
    return f"{market.upper()}__{instrument_id}__{event_date}"


def _sanitize_prose(value: Any) -> Any:
    if isinstance(value, str):
        cleaned = (
            value.replace("—", ". ")
            .replace("–", ". ")
            .replace(";", ". ")
        )
        while "  " in cleaned:
            cleaned = cleaned.replace("  ", " ")
        return cleaned.strip()
    if isinstance(value, list):
        return [_sanitize_prose(item) for item in value]
    if isinstance(value, dict):
        return {key: _sanitize_prose(item) for key, item in value.items()}
    return value


def _sanitize_prose_fields(report: dict[str, Any]) -> dict[str, Any]:
    return _sanitize_prose(report)


def _scrub_banned_words(report: dict[str, Any]) -> dict[str, Any]:
    blob = json.dumps(report, ensure_ascii=True).lower()
    if not any(word in blob for word in _BANNED_OUTPUT_WORDS):
        return report
    def walk(value: Any) -> Any:
        if isinstance(value, str):
            text = value
            for word in _BANNED_OUTPUT_WORDS:
                text = text.replace(word, "").replace(word.capitalize(), "")
            return " ".join(text.split())
        if isinstance(value, list):
            return [walk(item) for item in value]
        if isinstance(value, dict):
            return {key: walk(item) for key, item in value.items()}
        return value
    return walk(report)


def _normalize_call_fields(report: dict[str, Any]) -> dict[str, Any]:
    call = report.get("call")
    if not isinstance(call, dict):
        return report
    allowed_eps = {"beat", "inline", "miss", "unclear"}
    allowed_move = {"rally", "fade", "chop", "unclear"}
    eps = str(call.get("eps_outlook") or "").strip().lower()
    move = str(call.get("post_print_move") or "").strip().lower()
    if eps not in allowed_eps:
        call.pop("eps_outlook", None)
    else:
        call["eps_outlook"] = eps
    if move not in allowed_move:
        call.pop("post_print_move", None)
    else:
        call["post_print_move"] = move
    report["call"] = call
    return report


def _pre_earnings_already_built(store: TraceMoneyStore, doc_id: str) -> bool:
    doc = store.db.collection("tm_pre_earnings_intel").document(doc_id).get()
    if not doc.exists:
        return False
    data = doc.to_dict() or {}
    report = data.get("report") or {}
    return bool(str(report.get("headline") or "").strip())


def _list_upcoming_events(
    store: TraceMoneyStore,
    market: str,
    upcoming_days: int,
    max_events: int,
    allowed_tickers: set[str] | None = None,
) -> list[dict[str, Any]]:
    today = datetime.now(timezone.utc).date()
    end = today + timedelta(days=max(1, upcoming_days))
    out: list[tuple[datetime.date, dict[str, Any]]] = []
    query = (
        store.db.collection("tm_earnings_events")
        .where("market", "==", market.upper())
        .stream()
    )
    for doc in query:
        payload = doc.to_dict() or {}
        if allowed_tickers is not None:
            ticker = str(payload.get("ticker") or "").upper().strip()
            if ticker not in allowed_tickers:
                continue
        event_date = _as_date(str(payload.get("event_date") or ""))
        if not event_date:
            continue
        if today <= event_date <= end:
            out.append((event_date, payload))
    out.sort(key=lambda pair: pair[0])
    return [payload for _date, payload in out[: max(1, max_events)]]


def _llm_synthesize(payload: dict[str, Any], model_name: str) -> dict[str, Any]:
    api_key = require_llm_api_key()
    response = requests.post(
        llm_api_url(),
        headers=llm_headers(api_key),
        json={
            "model": model_name,
            "temperature": 0.25,
            "messages": [
                {
                    "role": "system",
                    "content": schema_system_prompt(PRE_EARNINGS_SYSTEM_PROMPT, PRE_EARNINGS_SCHEMA),
                },
                {
                    "role": "user",
                    "content": json.dumps(payload, ensure_ascii=True),
                },
            ],
            "response_format": json_response_format(),
        },
        timeout=90,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return parse_json_content(content)


def _process_one_event(
    store: TraceMoneyStore,
    *,
    market: str,
    event: dict[str, Any],
    instrument: dict[str, Any],
    model_name: str,
    force: bool,
    write: bool,
    dry_run: bool,
) -> dict[str, Any] | None:
    ticker = str(event.get("ticker") or instrument.get("symbol") or "").upper().strip()
    if not ticker:
        return None
    instrument_id = str(instrument.get("instrument_id") or "")
    event_date = str(event.get("event_date") or datetime.now(timezone.utc).date().isoformat())
    doc_id = _build_doc_id(market, instrument_id, event_date)

    if not force and _pre_earnings_already_built(store, doc_id):
        print(f"  [skip] {ticker} {event_date}: already built ({doc_id})", flush=True)
        return {"status": "skipped", "ticker": ticker, "event_date": event_date, "doc_id": doc_id}

    print(f"  [build] {ticker} {event_date}", flush=True)
    base_payload = _build_input_payload(store, market, ticker, instrument, event)
    payload = enrich_pre_earnings_payload(
        store,
        base_payload,
        instrument_id=instrument_id,
        event=event,
        ticker=ticker,
    )

    synthesis = _llm_synthesize(payload, model_name=model_name)
    synthesis = _sanitize_decision_guide(synthesis, payload)
    synthesis = _sanitize_prose_fields(synthesis)
    synthesis = _scrub_banned_words(synthesis)
    synthesis = _normalize_call_fields(synthesis)

    timing = payload.get("timing") or {}
    eps_consensus = payload.get("eps_consensus") if isinstance(payload.get("eps_consensus"), dict) else {}
    ext = payload.get("external_research") if isinstance(payload.get("external_research"), dict) else {}
    report = {
        "doc_id": doc_id,
        "market": market.upper(),
        "instrument_id": instrument_id,
        "ticker": ticker,
        "event_date": event_date,
        "days_until": timing.get("days_until_report"),
        "generated_at": _utc_now(),
        "model": model_name,
        "inputs": {
            "earnings_event": payload.get("earnings_event"),
            "timing": timing,
            "eps_consensus_signals": eps_consensus.get("signals") or [],
            "external_research_ok": bool(ext.get("ok")),
            "post_earnings_news_count": len(payload.get("post_earnings_news") or []),
            "reddit_present": bool(payload.get("reddit_buzz")),
        },
        "report": synthesis,
    }
    if write and not dry_run:
        store.db.collection("tm_pre_earnings_intel").document(doc_id).set(report, merge=True)
        store.db.collection("tm_pre_earnings_intel").document(
            f"{market.upper()}__{instrument_id}__upcoming"
        ).set(report, merge=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Build pre-earnings setup reports (US only)")
    parser.add_argument("--market", default="US", choices=["US", "IN"])
    parser.add_argument("--ticker", default="", help="Ticker symbol, e.g. NVDA")
    parser.add_argument("--event-date", default="", help="Optional earnings event date YYYY-MM-DD")
    parser.add_argument("--model", default="", help="Override OpenAI model")
    parser.add_argument("--universe", default="", help="Optional universe id to scope --all-upcoming")
    parser.add_argument(
        "--all-upcoming",
        action="store_true",
        help="Process all upcoming earnings in our calendar universe",
    )
    parser.add_argument(
        "--upcoming-days",
        type=int,
        default=7,
        help="When --all-upcoming, include event_date within this many days ahead",
    )
    parser.add_argument("--max-events", type=int, default=200, help="Cap processed events")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild even if a report already exists for this event",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write", action="store_true", help="Write into tm_pre_earnings_intel")
    args = parser.parse_args()

    if args.market.upper() != "US":
        print(json.dumps({"status": "noop", "reason": "pre_earnings_us_only"}))
        return

    store = TraceMoneyStore()
    model_name = args.model.strip() or llm_model(OPENAI_DEFAULT_MODEL)
    universe_by_ticker = _universe_instruments_by_ticker(
        store, args.market, args.universe.strip() or None
    )

    events_to_process: list[dict[str, Any]] = []
    if args.all_upcoming:
        events_to_process = _list_upcoming_events(
            store=store,
            market=args.market,
            upcoming_days=args.upcoming_days,
            max_events=args.max_events,
            allowed_tickers=set(universe_by_ticker.keys()),
        )
        if not events_to_process:
            print(json.dumps({"status": "noop", "reason": "no_upcoming_events"}))
            return
    else:
        ticker = args.ticker.upper().strip()
        if not ticker:
            raise ValueError("--ticker is required unless --all-upcoming is set")
        explicit = args.event_date.strip()
        if explicit:
            doc = store.db.collection("tm_earnings_events").document(f"{ticker}_{explicit}").get()
            event = doc.to_dict() if doc.exists else None
        else:
            events = _list_upcoming_events(
                store,
                args.market,
                upcoming_days=max(7, args.upcoming_days),
                max_events=5,
                allowed_tickers={ticker},
            )
            event = events[0] if events else None
        if event is None:
            raise ValueError(f"No upcoming earnings event found for ticker={ticker} market={args.market}")
        events_to_process = [event]

    results: list[dict[str, Any]] = []
    skipped_universe: list[str] = []
    skipped_built: list[str] = []
    failures: list[dict[str, str]] = []

    for event in events_to_process:
        ticker = str(event.get("ticker") or args.ticker).upper().strip()
        if not ticker:
            continue
        instrument = universe_by_ticker.get(ticker)
        if instrument is None:
            skipped_universe.append(ticker)
            print(f"  [skip] {ticker}: not in universe", flush=True)
            continue
        try:
            report = _process_one_event(
                store,
                market=args.market,
                event=event,
                instrument=instrument,
                model_name=model_name,
                force=args.force,
                write=args.write,
                dry_run=args.dry_run,
            )
        except Exception as exc:
            failures.append({"ticker": ticker, "error": str(exc)})
            print(f"  [fail] {ticker}: {exc}", flush=True)
            continue
        if report is None:
            continue
        if report.get("status") == "skipped":
            skipped_built.append(ticker)
            continue
        results.append(report)

    summary = {
        "status": "ok" if not failures else "partial",
        "built": len(results),
        "skipped_already_built": skipped_built,
        "skipped_not_in_universe": skipped_universe,
        "failures": failures,
    }

    if args.dry_run or not args.write:
        if len(results) == 1:
            print(json.dumps(results[0], indent=2, ensure_ascii=True))
        else:
            print(json.dumps({**summary, "items": results}, indent=2, ensure_ascii=True))
        return

    print(json.dumps({**summary, "doc_ids": [item["doc_id"] for item in results]}, ensure_ascii=True))


if __name__ == "__main__":
    main()
