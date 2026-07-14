"""Build event-backed, personalized Radar views from existing stock data."""
from __future__ import annotations

import argparse
import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Mapping

from backend.radar_intelligence import (
    Citation,
    PortfolioPosition,
    RadarEvent,
    StockState,
    build_personalized_inbox,
    process_evidence,
    validate_prose,
)
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _ticker(instrument_id: str) -> str:
    return instrument_id.split("_", 1)[-1].upper()


def _position_type(value: Any) -> str:
    return "long" if _text(value).lower() == "holding" else "watch"


def _source_evidence(
    *,
    kind: str,
    ticker: str,
    occurred_at: str,
    source: str,
    title: str,
    url: str,
    payload: dict[str, Any],
    evidence_id: str = "",
    reliability: float = 0.8,
) -> dict[str, Any]:
    return {
        "evidence_id": evidence_id,
        "kind": kind,
        "ticker": ticker,
        "occurred_at": occurred_at,
        "source": source,
        "citation_title": title,
        "citation_url": url,
        "payload": payload,
        "reliability": reliability,
    }


def row_evidence(row: Mapping[str, Any], as_of: str) -> list[dict[str, Any]]:
    """Convert existing materialized watchlist data into domain evidence."""
    ticker = _text(row.get("ticker")).upper()
    if not ticker:
        return []
    out: list[dict[str, Any]] = []
    technicals = row.get("technicals") if isinstance(row.get("technicals"), dict) else {}
    rsi_payload = technicals.get("rsi_14") if isinstance(technicals.get("rsi_14"), dict) else {}
    rsi = _number(rsi_payload.get("value"))
    if rsi is not None:
        out.append(
            _source_evidence(
                kind="rsi",
                ticker=ticker,
                occurred_at=as_of,
                source="Daily price history",
                title=f"{ticker} 14-day RSI",
                url="",
                payload={"rsi_14": rsi},
                reliability=0.95,
            )
        )

    facts = row.get("facts") if isinstance(row.get("facts"), dict) else {}
    analyst = facts.get("analyst") if isinstance(facts.get("analyst"), dict) else {}
    rating = _text(analyst.get("label"))
    if rating:
        out.append(
            _source_evidence(
                kind="analyst_rating",
                ticker=ticker,
                occurred_at=as_of,
                source="Analyst consensus",
                title=f"{ticker} analyst consensus",
                url="",
                payload={"rating": rating},
                reliability=0.75,
            )
        )
    target = _number(analyst.get("target_price"))
    if target is not None:
        out.append(
            _source_evidence(
                kind="analyst_target",
                ticker=ticker,
                occurred_at=as_of,
                source="Analyst consensus",
                title=f"{ticker} consensus target",
                url="",
                payload={"target": target},
                reliability=0.75,
            )
        )

    for event in facts.get("events") or []:
        if not isinstance(event, dict):
            continue
        label = " ".join(
            _text(event.get(key)) for key in ("type", "event_type", "label", "title")
        ).lower()
        date_value = _text(event.get("date") or event.get("event_date") or event.get("date_label"))
        if "earn" not in label or not date_value[:10].count("-") == 2:
            continue
        out.append(
            _source_evidence(
                kind="earnings_upcoming",
                ticker=ticker,
                occurred_at=as_of,
                source="Company calendar",
                title=f"{ticker} earnings date",
                url=_text(event.get("url")),
                payload={"earnings_date": date_value[:10]},
                reliability=0.85,
            )
        )
    return out


def official_evidence_to_raw(payload: Mapping[str, Any], instrument_id: str) -> dict[str, Any] | None:
    if instrument_id not in (payload.get("instrument_ids") or []):
        return None
    ticker = _ticker(instrument_id)
    facts = payload.get("facts") if isinstance(payload.get("facts"), dict) else {}
    document_kind = _text(payload.get("document_kind")).lower()
    occurred_at = _text(payload.get("published_at") or payload.get("detected_at"))
    citation = payload.get("citation") if isinstance(payload.get("citation"), dict) else {}
    common = {
        "ticker": ticker,
        "occurred_at": occurred_at,
        "source": _text(citation.get("publisher") or payload.get("provider") or "Official source"),
        "title": _text(payload.get("title")),
        "url": _text(payload.get("url") or citation.get("url")),
        "evidence_id": _text(payload.get("evidence_id")),
        "reliability": _number(payload.get("extraction_confidence")) or 0.9,
    }
    if document_kind == "filing":
        return _source_evidence(
            kind="filing",
            payload={
                "filing_id": _text(facts.get("accession_number") or payload.get("evidence_id")),
                "filing_type": _text(facts.get("form") or "filing"),
                "items": _text(facts.get("items")),
            },
            **common,
        )
    if document_kind == "investor_relations":
        combined = f"{common['title']} {_text(facts.get('summary'))}".lower()
        if "guidance" in combined and any(word in combined for word in ("raise", "lower", "cut")):
            direction = "raised" if "rais" in combined else "lowered"
            return _source_evidence(
                kind="earnings_guidance",
                payload={"direction": direction, "summary": _text(facts.get("summary"))},
                **common,
            )
    return None


def state_from_doc(instrument_id: str, payload: Mapping[str, Any] | None) -> StockState | None:
    if not payload:
        return None
    fields = StockState.__dataclass_fields__
    values = {name: payload.get(name) for name in fields if name in payload}
    values["ticker"] = _ticker(instrument_id)
    values["seen_event_ids"] = tuple(payload.get("seen_event_ids") or ())
    try:
        return StockState(**values)
    except (TypeError, ValueError):
        return None


def event_from_doc(payload: Mapping[str, Any]) -> RadarEvent | None:
    try:
        event_type = _text(payload.get("event_type") or payload.get("kind"))
        if event_type not in {
            "rsi_oversold_cross", "rsi_overbought_cross", "rsi_return_to_neutral",
            "analyst_rating_change", "analyst_target_revision", "earnings_upcoming",
            "earnings_results", "earnings_guidance_change", "filing_catalyst",
            "abnormal_price_move",
        }:
            return None
        citations = tuple(
            Citation(
                source=_text(row.get("source")),
                title=_text(row.get("title")),
                url=_text(row.get("url")),
                occurred_at=_text(row.get("occurred_at")),
            )
            for row in payload.get("citations") or []
            if isinstance(row, dict)
        )
        return RadarEvent(
            event_id=_text(payload.get("event_id")),
            ticker=_text(payload.get("ticker")).upper(),
            kind=event_type,
            occurred_at=_text(payload.get("occurred_at")),
            materiality=float(payload.get("materiality") or 0),
            confidence=float(payload.get("confidence") or 0),
            novelty=float(payload.get("novelty") or 0),
            payload=dict(payload.get("payload") or {}),
            citations=citations,
            what_changed=_text(payload.get("what_changed")),
            why_it_matters=_text(payload.get("why_it_matters")),
            next_trigger=_text(payload.get("next_trigger")),
            evidence_refs=tuple(payload.get("evidence_refs") or ()),
        )
    except (TypeError, ValueError):
        return None


def event_direction(event: RadarEvent) -> str:
    direction = "neutral"
    if event.kind == "rsi_oversold_cross":
        direction = "mixed"
    elif event.kind == "rsi_overbought_cross":
        direction = "negative"
    elif event.kind == "rsi_return_to_neutral":
        direction = "neutral"
    if event.kind == "analyst_rating_change":
        direction = "positive" if event.payload.get("direction") == "upgrade" else "negative"
    elif event.kind == "analyst_target_revision":
        direction = "positive" if float(event.payload.get("change_pct") or 0) > 0 else "negative"
    elif event.kind == "earnings_results":
        label = str(event.payload.get("result_label") or "")
        direction = "positive" if label == "beat" else "negative" if label == "miss" else "neutral"
    elif event.kind == "earnings_guidance_change":
        direction = "positive" if event.payload.get("direction") == "raised" else "negative"
    elif event.kind == "abnormal_price_move":
        direction = "positive" if float(event.payload.get("day_change_pct") or 0) > 0 else "negative"
    return direction


def event_document(event: RadarEvent, as_of: str) -> dict[str, Any]:
    direction = event_direction(event)
    return {
        "event_id": event.event_id,
        "dedupe_key": event.event_id,
        "market": "US",
        "instrument_id": f"US_{event.ticker}",
        "ticker": event.ticker,
        "event_type": event.kind,
        "direction": direction,
        "materiality": event.materiality,
        "confidence": event.confidence,
        "novelty": event.novelty,
        "occurred_at": event.occurred_at,
        "detected_at": as_of,
        "payload": event.payload,
        "citations": [citation.to_dict() for citation in event.citations],
        "evidence_refs": list(event.evidence_refs),
        "source_watermark": event.event_id,
        "what_changed": event.what_changed,
        "why_it_matters": event.why_it_matters,
        "next_trigger": event.next_trigger,
    }


def _headline(event: RadarEvent) -> str:
    labels = {
        "rsi_oversold_cross": "RSI crossed into oversold territory",
        "rsi_overbought_cross": "RSI crossed into overbought territory",
        "rsi_return_to_neutral": "RSI moved back to neutral",
        "analyst_rating_change": "Analyst rating changed",
        "analyst_target_revision": "Consensus target changed",
        "earnings_upcoming": "Earnings are coming up",
        "earnings_results": "New earnings results",
        "earnings_guidance_change": "Management changed guidance",
        "filing_catalyst": f"New {event.payload.get('filing_type') or 'company'} filing",
        "abnormal_price_move": "Unusual move with a verified catalyst",
    }
    return labels.get(event.kind, "Material change")


def _quality_issues(items: list[dict[str, Any]]) -> list[str]:
    issues: list[str] = []
    if len(items) > 3:
        issues.append("more_than_three_items")
    ids = [str(item.get("item_id") or "") for item in items]
    if len(ids) != len(set(ids)):
        issues.append("duplicate_items")
    for item in items:
        if not item.get("citations"):
            issues.append(f"missing_citation:{item.get('ticker')}")
        if not item.get("what_changed") or not item.get("why_it_matters"):
            issues.append(f"missing_copy:{item.get('ticker')}")
    return issues


def synthesize_narrative(
    attention: list[dict[str, Any]],
    fallback: dict[str, str],
) -> tuple[dict[str, str], str]:
    """Use OpenRouter for phrasing only; facts and actions remain deterministic."""
    if not attention:
        return fallback, "fallback"
    from backend.llm_client import post_chat_completion

    facts = [
        {
            "ticker": item["ticker"],
            "headline": item["headline"],
            "what_changed": item["what_changed"],
        }
        for item in attention
    ]
    try:
        response = post_chat_completion(
            model="openai/gpt-4o-mini",
            temperature=0.1,
            response_format={"type": "json_object"},
            stage="radar_daily_narrative",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Write a terse daily portfolio briefing. Return JSON with headline and body. "
                        "Use only supplied facts. Do not recommend buying, selling, trimming, or adding. "
                        "Do not invent numbers. Avoid hype, filler, and market clichés. "
                        "Headline <= 80 characters; body <= 240 characters."
                    ),
                },
                {"role": "user", "content": json.dumps(facts, sort_keys=True)},
            ],
            max_attempts=2,
        )
        content = response["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        candidate = {
            "headline": _text(parsed.get("headline")),
            "body": _text(parsed.get("body")),
        }
    except Exception:  # noqa: BLE001 - optional copy must never block deterministic views
        return fallback, "fallback"
    combined = f"{candidate['headline']} {candidate['body']}"
    banned = re.compile(
        r"\b(overall|in summary|important to note|game[- ]changer|delve|buy|sell|trim|add to)\b",
        re.IGNORECASE,
    )
    if (
        not candidate["headline"]
        or not candidate["body"]
        or len(candidate["headline"]) > 80
        or len(candidate["body"]) > 240
        or banned.search(combined)
    ):
        return fallback, "fallback"
    return candidate, "generated"


def build_user_view(
    user: Mapping[str, Any],
    watchlist_view: Mapping[str, Any],
    events: list[RadarEvent],
    states: list[StockState],
    as_of: str,
    *,
    shadow_mode: bool,
    with_llm: bool = False,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows = [row for row in watchlist_view.get("rows") or [] if isinstance(row, dict)]
    positions: list[PortfolioPosition] = []
    position_by_ticker: dict[str, str] = {}
    name_by_ticker: dict[str, str] = {}
    for row in rows:
        ticker = _text(row.get("ticker")).upper()
        if not ticker:
            continue
        position = _position_type(row.get("position_type"))
        weight = _number(((row.get("holding") or {}).get("portfolio_weight_pct"))) or 0.0
        positions.append(PortfolioPosition(ticker=ticker, position_type=position, weight_pct=weight))
        position_by_ticker[ticker] = "holding" if position == "long" else "watchlist"
        name_by_ticker[ticker] = _text(row.get("instrument_name"))

    result = build_personalized_inbox(events, states, positions, as_of)
    attention: list[dict[str, Any]] = []
    for item in result.items:
        event = item.event
        attention.append(
            {
                "item_id": event.event_id,
                "instrument_id": f"US_{event.ticker}",
                "ticker": event.ticker,
                "instrument_name": name_by_ticker.get(event.ticker) or event.ticker,
                "position_type": position_by_ticker.get(event.ticker, "watchlist"),
                "event_type": event.kind,
                "direction": event_direction(event),
                "headline": _headline(event),
                "what_changed": event.what_changed,
                "why_it_matters": event.why_it_matters,
                "next_trigger": event.next_trigger,
                "occurred_at": event.occurred_at,
                "priority": item.rank,
                "priority_score": item.score,
                "event_ids": [event.event_id],
                "citations": [
                    {
                        "title": citation.title,
                        "url": citation.url,
                        "publisher": citation.source,
                        "published_at": citation.occurred_at,
                    }
                    for citation in event.citations
                ],
            }
        )

    quiet = result.quiet_summary
    issues = _quality_issues(attention)
    today = datetime.fromisoformat(as_of.replace("Z", "+00:00")).date()
    upcoming_by_ticker: dict[str, RadarEvent] = {}
    for event in events:
        if event.kind != "earnings_upcoming" or not event.payload.get("earnings_date"):
            continue
        try:
            expected = datetime.fromisoformat(str(event.payload["earnings_date"])[:10]).date()
        except ValueError:
            continue
        if expected < today:
            continue
        current = upcoming_by_ticker.get(event.ticker)
        if current is None or event.occurred_at > current.occurred_at:
            upcoming_by_ticker[event.ticker] = event
    upcoming = [
        {
            "instrument_id": f"US_{event.ticker}",
            "ticker": event.ticker,
            "event_type": "earnings",
            "expected_at": f"{event.payload['earnings_date']}T00:00:00+00:00",
            "description": "earnings",
            "confidence": event.confidence,
        }
        for event in sorted(
            upcoming_by_ticker.values(),
            key=lambda item: str(item.payload.get("earnings_date") or ""),
        )
    ][:6]

    def _upcoming_calendar_line() -> str:
        if not upcoming:
            return ""
        parts: list[str] = []
        for event in upcoming[:4]:
            try:
                when = datetime.fromisoformat(str(event["expected_at"]).replace("Z", "+00:00")).date()
                label = f"{when.strftime('%b')} {when.day}"
            except ValueError:
                label = str(event["expected_at"])[:10]
            parts.append(f"{event['ticker']} {label}")
        suffix = f" (+{len(upcoming) - 4} more)" if len(upcoming) > 4 else ""
        return "Next on your calendar: " + ", ".join(parts) + suffix + "."

    if attention:
        tickers = ", ".join(item["ticker"] for item in attention)
        fallback_narrative = {
            "headline": f"{len(attention)} {'change' if len(attention) == 1 else 'changes'} need attention",
            "body": f"The highest-signal updates in your book are in {tickers}. Everything else stayed below the materiality threshold.",
        }
    elif upcoming:
        calendar = _upcoming_calendar_line()
        fallback_narrative = {
            "headline": quiet.headline if quiet else "Nothing material changed today",
            "body": (
                (quiet.body if quiet else "No tracked change crossed the attention threshold.")
                + (" " + calendar if calendar else "")
            ).strip(),
        }
    else:
        fallback_narrative = {
            "headline": quiet.headline if quiet else "Nothing material changed",
            "body": quiet.body if quiet else "No tracked change crossed the attention threshold.",
        }
    if with_llm and attention:
        narrative, copy_status = synthesize_narrative(attention, fallback_narrative)
    else:
        narrative, copy_status = fallback_narrative, "fallback"
    view = {
        "uid": _text(user.get("uid")),
        "generated_at": as_of,
        "as_of": as_of,
        "narrative": narrative,
        "attention_items": attention,
        "upcoming_events": upcoming,
        "quiet_summary": {
            "instrument_ids": [f"US_{ticker}" for ticker in (quiet.tickers_checked if quiet else ())],
            "body": quiet.body if quiet else "",
            "count": len(quiet.tickers_checked) if quiet else 0,
        },
        "source_versions": [
            {
                "source_id": "tm_watchlist_views",
                "version": str(watchlist_view.get("source_version") or "unknown"),
                "as_of": _text(watchlist_view.get("updated_at") or watchlist_view.get("built_at") or as_of),
            }
        ],
        "generated_copy_status": copy_status,
        "shadow_mode": shadow_mode,
        "quality": {"passed": not issues, "issues": issues},
    }
    return view, attention


def materialize_radar_views(
    store: TraceMoneyStore,
    *,
    user_ids: list[str] | None = None,
    write: bool = False,
    shadow_mode: bool = True,
    with_llm: bool = False,
    as_of: str | None = None,
) -> dict[str, Any]:
    now = as_of or datetime.now(timezone.utc).isoformat()
    users = store.list_users_by_ids(user_ids) if user_ids else store.list_subscribed_users()
    views: dict[str, dict[str, Any]] = {}
    row_by_instrument: dict[str, dict[str, Any]] = {}
    errors: list[dict[str, str]] = []
    for user in users:
        uid = _text(user.get("uid"))
        try:
            view = store.get_watchlist_view(uid)
        except Exception as error:  # noqa: BLE001 - isolate one user
            errors.append({"scope": "watchlist_view", "id": uid, "error": str(error)[:160]})
            logger.exception("Radar watchlist read failed uid=%s", uid)
            continue
        if not uid or not view:
            continue
        views[uid] = view
        for row in view.get("rows") or []:
            if isinstance(row, dict) and _text(row.get("instrument_id")).startswith("US_"):
                row_by_instrument.setdefault(_text(row.get("instrument_id")).upper(), row)

    instrument_ids = sorted(row_by_instrument)
    previous_docs = store.get_radar_stock_states(instrument_ids)
    official = store.list_radar_evidence(instrument_ids, limit=max(500, len(instrument_ids) * 10))
    official_by_instrument: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for payload in official:
        for instrument_id in payload.get("instrument_ids") or []:
            if instrument_id in row_by_instrument:
                official_by_instrument[instrument_id].append(payload)

    new_events: list[RadarEvent] = []
    states: dict[str, StockState] = {}
    for instrument_id, row in row_by_instrument.items():
        raw = row_evidence(row, now)
        for payload in official_by_instrument.get(instrument_id, []):
            converted = official_evidence_to_raw(payload, instrument_id)
            if converted:
                raw.append(converted)
        previous = state_from_doc(instrument_id, previous_docs.get(instrument_id))
        try:
            result = process_evidence(previous, raw, _ticker(instrument_id), now)
        except Exception as error:  # noqa: BLE001 - isolate one instrument
            errors.append({"scope": "instrument", "id": instrument_id, "error": str(error)[:160]})
            logger.exception("Radar reducer failed instrument_id=%s", instrument_id)
            if previous is not None:
                states[instrument_id] = previous
            continue
        states[instrument_id] = result.state
        new_events.extend(result.events)
    if write and new_events:
        # Save immutable events before advancing state. If a later state write
        # fails, reruns safely upsert the same event ID; the reverse order could
        # mark an event seen before it was ever persisted.
        store.save_radar_events([event_document(event, now) for event in new_events])
    if write:
        for instrument_id, state in states.items():
            try:
                store.save_radar_stock_state(
                    instrument_id,
                    {"instrument_id": instrument_id, **state.to_dict()},
                )
            except Exception as error:  # noqa: BLE001 - isolate one instrument
                errors.append({"scope": "state_write", "id": instrument_id, "error": str(error)[:160]})
                logger.exception("Radar state write failed instrument_id=%s", instrument_id)

    try:
        event_docs = store.list_radar_events(instrument_ids, limit=max(200, len(instrument_ids) * 10))
    except Exception as error:  # noqa: BLE001 - new events can still build this cycle
        event_docs = []
        errors.append({"scope": "event_read", "id": "all", "error": str(error)[:160]})
        logger.exception("Radar event history read failed")
    persisted = [
        event for payload in event_docs if (event := event_from_doc(payload)) is not None
    ]
    events_by_id = {event.event_id: event for event in [*persisted, *new_events]}

    built = 0
    passed = 0
    for user in users:
        uid = _text(user.get("uid"))
        view = views.get(uid)
        if not view:
            continue
        tracked = {_text(value).upper() for value in user.get("tracked_stocks") or []}
        user_events = [event for event in events_by_id.values() if f"US_{event.ticker}" in tracked]
        user_states = [state for instrument_id, state in states.items() if instrument_id in tracked]
        try:
            payload, inbox = build_user_view(
                user,
                view,
                user_events,
                user_states,
                now,
                shadow_mode=shadow_mode,
                with_llm=with_llm,
            )
        except Exception as error:  # noqa: BLE001 - isolate one user
            errors.append({"scope": "user_view", "id": uid, "error": str(error)[:160]})
            logger.exception("Radar user view failed uid=%s", uid)
            continue
        built += 1
        if payload["quality"]["passed"]:
            passed += 1
        if write:
            try:
                store.save_radar_inbox_items(uid, inbox)
                store.save_radar_user_view(uid, payload)
            except Exception as error:  # noqa: BLE001 - isolate one user
                errors.append({"scope": "user_write", "id": uid, "error": str(error)[:160]})
                logger.exception("Radar user write failed uid=%s", uid)

    return {
        "users_seen": len(users),
        "views_built": built,
        "quality_passed": passed,
        "stocks_processed": len(states),
        "events_generated": len(new_events),
        "error_count": len(errors),
        "errors": errors[:20],
        "status": "written" if write else "dry_run",
        "shadow_mode": shadow_mode,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize personalized Radar daily views")
    parser.add_argument("--user-id", action="append", default=[])
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--with-llm", action="store_true")
    args = parser.parse_args()
    result = materialize_radar_views(
        TraceMoneyStore(),
        user_ids=args.user_id or None,
        write=args.write,
        shadow_mode=not args.activate,
        with_llm=args.with_llm,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
