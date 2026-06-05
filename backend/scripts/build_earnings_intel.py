"""Build post-earnings intelligence reports for stocks.

MVP usage (local test):
    python -m backend.scripts.build_earnings_intel --market US --ticker NVDA --dry-run

Write to Firestore:
    python -m backend.scripts.build_earnings_intel --market US --ticker NVDA --write
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
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
from backend.instrument_universe import list_instruments
from backend.storage import TraceMoneyStore


OPENAI_DEFAULT_MODEL = "gpt-4.1-mini"

GROUNDING_CONTRACT = """NON-NEGOTIABLE GROUNDING RULES (read payload.timing and payload.reported_actuals first):

TENSE / TIMING:
- payload.timing.status tells you if this print already happened ("reported") or is "upcoming".
- If status is "reported", the earnings call is in the PAST. Write about it in past tense.
  NEVER tell the reader to "await", "watch for", or "wait for" THIS earnings call - it already happened.
- A trigger or catalyst must be a FUTURE event (next-quarter guidance, a product/customer ramp,
  a contract booking, a margin inflection, a named upcoming date) - NEVER the print that just occurred.

ACTUALS:
- If payload.reported_actuals.available is true, the beat/miss is REAL: compare reported_eps to estimated_eps
  and use eps_surprise_pct / surprise_label. State the actual reported number, not the estimate.
- If payload.reported_actuals.available is false, the actual result is NOT in yet. Say so plainly.
  Do NOT present the estimate (eps_estimate) as if it were the reported result, and do NOT claim a beat or miss.

ANTI-GIMMICK:
- Ban vague, recyclable filler: "watch next year's guidance", "monitor the earnings call",
  "keep an eye on the stock", "stay tuned". Every line must reference a concrete, payload-grounded number,
  date, contract, segment, or risk - or it must be cut.
- Scenarios and the decision guide must be ACTIONABLE: a specific condition the reader can check in the
  next 30-90 days, not a restatement of the print that already happened.

"""

EARNINGS_INTEL_SYSTEM_PROMPT_V1 = GROUNDING_CONTRACT + """You are a strict equity earnings analyst.
You write institutional-grade post-earnings intelligence.

Rules:
- Use only evidence provided in the payload.
- If a field is unknown, say it is unknown. Never invent numbers.
- Separate facts from interpretation.
- Keep outputs concise and decision-useful.
- Every claim must anchor to a concrete number, date, or explicit risk in payload.
- Do not invent price levels, probability splits, or threshold numbers not present or directly derivable from payload.
- Do not restate the same idea across sections.
- Avoid fluff words: "exceptional", "robust", "strong", "solid", "bullish outlook" unless paired with a numeric reason.
- For scenarios, use 30-90 day reasoning grounded in FORWARD catalysts and risk (not the print that already happened).
- Include explicit invalidation conditions for bull and bear views.

Critical style contract for interpretation:
1) what_changed:
   - One sentence, max 18 words.
   - Must include at least one concrete delta (e.g. revenue +85% YoY, EPS beat vs estimate, guidance value).
   - Purely "what is different now vs before print", no opinion.
2) what_market_is_pricing:
   - One sentence, max 20 words.
   - Must explain current move/tone using one supportive observed signal (price reaction, valuation multiple, concentration/geopolitical risk).
   - Must not repeat wording from what_changed.
3) fundamental_implication:
   - One sentence, max 20 words.
   - Must answer "what should an investor do with this info?" in thesis terms (upgrade / unchanged / downgrade bias).
   - Include one explicit watch trigger.

Decision guide must be specific:
- for_holders: imperative sentence with a trigger or threshold ("Hold unless...", "Trim if...", "Add only if...").
- for_watchers: one entry condition and one no-trade condition.
- key_monitor_list: max 4 bullets, each concrete and measurable/date-linked where possible.
"""

EARNINGS_INTEL_SYSTEM_PROMPT_V2 = GROUNDING_CONTRACT + """You are a buy-side PM note writer.
Your job is not to summarize; your job is to help decide.

Hard constraints:
- No filler adjectives unless tied to data.
- No repeated claims across sections.
- Max sentence length: 20 words.
- If evidence is missing, say unknown.

Interpretation contract:
1) what_changed: ONE delta only, numeric, post-print.
2) what_market_is_pricing: ONE sentence: "Market is pricing X because Y despite Z."
3) fundamental_implication: ONE actionable thesis statement with invalidation trigger.

Decision guide contract:
- for_holders: "Do X. Invalidate if Y."
- for_watchers: "Enter only if A. Avoid if B."
- key_monitor_list: max 4, each measurable.
"""

EARNINGS_INTEL_SYSTEM_PROMPT_V3 = GROUNDING_CONTRACT + """You are writing an earnings trade card for serious retail investors.
Every line must earn its place.

Rules:
- One idea per line.
- Prefer numbers > adjectives.
- Ban generic phrasing: "strong growth", "solid outlook", "market cautious" unless quantified.
- No duplicate nouns across interpretation lines (if line 1 is about growth, line 2 must focus on risk/positioning, line 3 on action trigger).

Interpretation outputs:
1) what_changed: factual delta only.
2) what_market_is_pricing: positioning/risk explanation only.
3) fundamental_implication: decision implication only + exact trigger to revisit.
"""

PROMPT_VARIANTS = {
    "v1": EARNINGS_INTEL_SYSTEM_PROMPT_V1,
    "v2": EARNINGS_INTEL_SYSTEM_PROMPT_V2,
    "v3": EARNINGS_INTEL_SYSTEM_PROMPT_V3,
}

EARNINGS_INTEL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": [
        "headline",
        "summary",
        "facts",
        "interpretation",
        "scenarios_30_90d",
        "decision_guide",
        "confidence",
    ],
    "properties": {
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "facts": {
            "type": "object",
            "required": ["reported_vs_expected", "guidance_signal", "price_reaction", "post_earnings_narrative"],
            "properties": {
                "reported_vs_expected": {"type": "string"},
                "guidance_signal": {"type": "string"},
                "price_reaction": {"type": "string"},
                "post_earnings_narrative": {"type": "string"},
            },
        },
        "interpretation": {
            "type": "object",
            "required": ["what_changed", "what_market_is_pricing", "fundamental_implication"],
            "properties": {
                "what_changed": {"type": "string"},
                "what_market_is_pricing": {"type": "string"},
                "fundamental_implication": {"type": "string"},
            },
        },
        "scenarios_30_90d": {
            "type": "array",
            "minItems": 2,
            "maxItems": 3,
            "items": {
                "type": "object",
                "required": ["case", "probability_pct", "thesis", "triggers", "invalidators"],
                "properties": {
                    "case": {"type": "string", "enum": ["bull", "base", "bear"]},
                    "probability_pct": {"type": "number"},
                    "thesis": {"type": "string"},
                    "triggers": {"type": "array", "items": {"type": "string"}},
                    "invalidators": {"type": "array", "items": {"type": "string"}},
                },
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
    },
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_date(value: str) -> datetime.date | None:
    if not value:
        return None
    candidate = value.split("T", 1)[0].strip()
    try:
        return datetime.strptime(candidate, "%Y-%m-%d").date()
    except ValueError:
        return None


def _resolve_instrument(store: TraceMoneyStore, market: str, ticker: str) -> dict[str, Any]:
    rows = store.list_instruments(market)
    ticker_up = ticker.upper().strip()
    for row in rows:
        if str(row.get("symbol") or row.get("ticker") or "").upper() == ticker_up:
            return row
    raise ValueError(f"Ticker {ticker_up} not found in tm_instruments for market={market}")


def _pick_earnings_event(
    store: TraceMoneyStore,
    market: str,
    ticker: str,
    explicit_event_date: str | None,
) -> dict[str, Any] | None:
    if explicit_event_date:
        doc = store.db.collection("tm_earnings_events").document(f"{ticker}_{explicit_event_date}").get()
        if doc.exists:
            payload = doc.to_dict() or {}
            if str(payload.get("market") or "").upper() == market.upper():
                return payload
        return None

    rows = []
    query = (
        store.db.collection("tm_earnings_events")
        .where("market", "==", market.upper())
        .where("ticker", "==", ticker.upper())
        .stream()
    )
    for doc in query:
        payload = doc.to_dict() or {}
        event_date = str(payload.get("event_date") or "")
        parsed = _as_date(event_date)
        if not parsed:
            continue
        rows.append((parsed, payload))
    if not rows:
        return None
    today = datetime.now(timezone.utc).date()
    rows.sort(key=lambda pair: pair[0], reverse=True)
    for parsed, payload in rows:
        if parsed <= today:
            return payload
    return rows[0][1]


def _universe_instruments_by_ticker(
    store: TraceMoneyStore,
    market: str,
    universe_id: str | None = None,
) -> dict[str, dict[str, Any]]:
    """Map ticker -> instrument row for our calendar universe.

    "Our calendar universe" is tm_instruments for the market - the exact same
    set the frontend earnings calendar filters against via tm_search_index
    (both are 531 US tickers and identical). When a universe_id is supplied we
    scope further to just that universe's instruments.

    The earnings calendar in tm_earnings_events holds the full Alpha Vantage
    feed (thousands of tickers), so this map is what keeps --all-recent from
    spending LLM calls on - and crashing _resolve_instrument against - stocks
    we don't actually cover.
    """
    rows = list_instruments(market, universe_id) if universe_id else store.list_instruments(market)
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        ticker = str(row.get("ticker") or row.get("symbol") or "").upper().strip()
        if ticker and ticker not in out:
            out[ticker] = row
    return out


def _list_recent_events(
    store: TraceMoneyStore,
    market: str,
    recent_days: int,
    max_events: int,
    allowed_tickers: set[str] | None = None,
) -> list[dict[str, Any]]:
    today = datetime.now(timezone.utc).date()
    out: list[tuple[datetime.date, dict[str, Any]]] = []
    query = (
        store.db.collection("tm_earnings_events")
        .where("market", "==", market.upper())
        .stream()
    )
    for doc in query:
        payload = doc.to_dict() or {}
        # Scope to our universe BEFORE the recency/cap filter. Without this the
        # max_events cap would just grab the most-recent global AV tickers
        # (mostly stocks we don't cover) instead of our stocks that reported.
        if allowed_tickers is not None:
            ticker = str(payload.get("ticker") or "").upper().strip()
            if ticker not in allowed_tickers:
                continue
        event_date = _as_date(str(payload.get("event_date") or ""))
        if not event_date:
            continue
        delta = (today - event_date).days
        if 0 <= delta <= max(0, recent_days):
            out.append((event_date, payload))
    out.sort(key=lambda pair: pair[0], reverse=True)
    return [payload for _date, payload in out[: max(1, max_events)]]


def recent_reporter_instrument_ids(
    store: TraceMoneyStore,
    market: str,
    *,
    recent_days: int,
    max_events: int,
    universe_id: str | None = None,
) -> list[str]:
    """Instrument ids for stocks that recently reported in our calendar universe."""
    universe_by_ticker = _universe_instruments_by_ticker(store, market, universe_id)
    events = _list_recent_events(
        store,
        market,
        recent_days,
        max_events,
        set(universe_by_ticker.keys()),
    )
    ids: list[str] = []
    seen: set[str] = set()
    for event in events:
        ticker = str(event.get("ticker") or "").upper().strip()
        instrument = universe_by_ticker.get(ticker)
        if not instrument:
            continue
        instrument_id = str(instrument.get("instrument_id") or "").strip()
        if instrument_id and instrument_id not in seen:
            seen.add(instrument_id)
            ids.append(instrument_id)
    return ids


def _recent_news_context(
    store: TraceMoneyStore,
    market: str,
    ai_universe: str,
    instrument_id: str,
    max_items: int = 12,
) -> list[dict[str, Any]]:
    rows = store.list_article_enrichments(market, ai_universe, limit=180)
    out: list[dict[str, Any]] = []
    for item in rows:
        instruments = [str(v).strip() for v in (item.get("instrument_ids") or []) if str(v).strip()]
        if instrument_id not in instruments:
            continue
        out.append(
            {
                "id": item.get("id"),
                "title": str(item.get("title") or "")[:180],
                "published_at": item.get("published_at"),
                "source": item.get("source"),
                "summary": str(item.get("summary") or item.get("brief") or "")[:260],
                "signals": [str(v) for v in (item.get("signal_types") or [])[:6]],
            }
        )
        if len(out) >= max_items:
            break
    return out


def _history_snapshot(history: list[dict[str, Any]], max_points: int = 25) -> list[dict[str, Any]]:
    trimmed = history[-max_points:] if len(history) > max_points else history
    points: list[dict[str, Any]] = []
    for row in trimmed:
        quote = row.get("quote") or {}
        points.append(
            {
                "date": row.get("date"),
                "close": _safe_float(quote.get("close")),
                "day_change_pct": _safe_float(quote.get("day_change_pct")),
                "volume": _safe_float(quote.get("volume")),
            }
        )
    return points


def _reaction_metrics(history: list[dict[str, Any]], event_date: str | None) -> dict[str, Any]:
    if not history or not event_date:
        return {"event_day_pct": None, "day_1_pct": None, "day_2_pct": None}
    parsed_event = _as_date(event_date)
    if not parsed_event:
        return {"event_day_pct": None, "day_1_pct": None, "day_2_pct": None}
    timeline: list[tuple[datetime.date, dict[str, Any]]] = []
    for row in history:
        parsed_row = _as_date(str(row.get("date") or ""))
        if not parsed_row:
            continue
        timeline.append((parsed_row, row))
    timeline.sort(key=lambda pair: pair[0])
    event_idx = next((i for i, (d, _r) in enumerate(timeline) if d == parsed_event), None)
    if event_idx is None:
        return {"event_day_pct": None, "day_1_pct": None, "day_2_pct": None}

    def _pct_at(idx: int) -> float | None:
        if idx < 0 or idx >= len(timeline):
            return None
        quote = (timeline[idx][1].get("quote") or {})
        return _safe_float(quote.get("day_change_pct"))

    return {
        "event_day_pct": _pct_at(event_idx),
        "day_1_pct": _pct_at(event_idx + 1),
        "day_2_pct": _pct_at(event_idx + 2),
    }


def _reddit_context(store: TraceMoneyStore, market: str, ticker: str) -> dict[str, Any]:
    doc = store.db.collection("reddit_snapshots").document(f"{market}__latest").get()
    if not doc.exists:
        return {}
    data = doc.to_dict() or {}
    tickers = data.get("tickers")
    ticker_up = ticker.upper()
    if isinstance(tickers, dict):
        entry = tickers.get(ticker_up) or tickers.get(ticker_up.lower())
        if isinstance(entry, dict):
            return {
                "mentions": _safe_float(entry.get("mentions")),
                "sentiment": entry.get("sentiment"),
                "context": str(entry.get("context") or "")[:220],
                "catalysts": [str(v) for v in (entry.get("catalysts") or [])[:4]],
            }
    if isinstance(tickers, list):
        for row in tickers:
            if not isinstance(row, dict):
                continue
            if str(row.get("ticker") or "").upper() == ticker_up:
                return {
                    "mentions": _safe_float(row.get("mention_count") or row.get("mentions")),
                    "sentiment": row.get("sentiment"),
                    "context": str(row.get("summary") or row.get("context") or "")[:220],
                    "catalysts": [str(v) for v in (row.get("catalysts") or [])[:4]],
                }
    return {}


def _llm_synthesize(payload: dict[str, Any], model_name: str, prompt_variant: str) -> dict[str, Any]:
    api_key = require_llm_api_key()
    system_prompt = PROMPT_VARIANTS.get(prompt_variant, EARNINGS_INTEL_SYSTEM_PROMPT_V1)
    response = requests.post(
        llm_api_url(),
        headers=llm_headers(api_key),
        json={
            "model": model_name,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": schema_system_prompt(system_prompt, EARNINGS_INTEL_SCHEMA),
                },
                {
                    "role": "user",
                    "content": json.dumps(payload, ensure_ascii=True),
                },
            ],
            "response_format": json_response_format(),
        },
        timeout=70,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return parse_json_content(content)


def _collect_allowed_numeric_tokens(payload: dict[str, Any]) -> set[str]:
    allowed: set[str] = set()
    blob = json.dumps(payload, ensure_ascii=True)
    for match in re.finditer(r"-?\d+(?:\.\d+)?", blob):
        token = match.group(0).lstrip("+")
        if token:
            allowed.add(token)
    return allowed


def _has_disallowed_numeric_threshold(text: str, allowed_tokens: set[str]) -> bool:
    if not text:
        return False
    for match in re.finditer(r"(-?\d+(?:\.\d+)?)\s*%?", text):
        token = match.group(1).lstrip("+")
        if token and token not in allowed_tokens:
            return True
    return False


def _sanitize_decision_guide(report: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    decision = report.get("decision_guide")
    if not isinstance(decision, dict):
        return report
    allowed = _collect_allowed_numeric_tokens(payload)
    holders = str(decision.get("for_holders") or "").strip()
    watchers = str(decision.get("for_watchers") or "").strip()

    if _has_disallowed_numeric_threshold(holders, allowed):
        decision["for_holders"] = (
            "Hold unless next-quarter revenue misses guidance materially or customer concentration risk worsens."
        )
    if _has_disallowed_numeric_threshold(watchers, allowed):
        decision["for_watchers"] = (
            "Add only if next-quarter guidance is reiterated or raised; avoid if guidance is cut or geopolitical risk escalates."
        )
    report["decision_guide"] = decision
    return report


def _build_doc_id(market: str, instrument_id: str, event_date: str) -> str:
    return f"{market.upper()}__{instrument_id}__{event_date}"


def _event_timing(event_date: str) -> dict[str, Any]:
    """Is this print already in the past, and how stale is it?

    The calendar event_date IS the report date. Without this marker the model
    treated a call that already happened as an upcoming trigger ("await the
    Q1 call") and parroted the estimate as the result. Here we state plainly
    whether the print has happened and how many days ago.
    """
    parsed = _as_date(event_date)
    today = datetime.now(timezone.utc).date()
    if parsed is None:
        return {"status": "unknown", "event_date": event_date or None}
    delta = (today - parsed).days
    if delta >= 0:
        return {
            "status": "reported",
            "event_date": event_date,
            "days_since_report": delta,
            "note": (
                "This earnings print has ALREADY happened. Write in past tense "
                "about what was reported. Do NOT frame this call as an upcoming "
                "event or a future trigger."
            ),
        }
    return {
        "status": "upcoming",
        "event_date": event_date,
        "days_until_report": abs(delta),
        "note": "This print has not happened yet; frame it as upcoming.",
    }


def _reported_actuals(event: dict[str, Any]) -> dict[str, Any]:
    """Actual reported numbers merged onto the event by sync_earnings_actuals.

    Returns an explicit `available` flag so the prompt can branch: when actuals
    are present the model must use reported_eps vs estimated_eps (a real
    beat/miss); when absent it must say the actual result is not yet captured
    rather than dressing up the estimate as the result.
    """
    reported_eps = _safe_float(event.get("reported_eps"))
    if reported_eps is None:
        return {
            "available": False,
            "note": (
                "Actual reported EPS is NOT captured yet. Do not state a beat or "
                "miss and do not present the estimate as the reported result."
            ),
        }
    estimated_eps = _safe_float(event.get("estimated_eps"))
    if estimated_eps is None:
        estimated_eps = _safe_float(event.get("eps_estimate"))
    eps_surprise = _safe_float(event.get("eps_surprise"))
    eps_surprise_pct = _safe_float(event.get("eps_surprise_pct"))
    if (
        reported_eps == 0
        and estimated_eps not in (None, 0)
        and eps_surprise is not None
        and abs(eps_surprise + estimated_eps) < 0.0001
        and eps_surprise_pct is not None
        and abs(eps_surprise_pct + 100.0) < 0.01
    ):
        return {
            "available": False,
            "rejected_reason": "provider_zero_eps_placeholder",
            "estimated_eps": estimated_eps,
            "reported_date": event.get("actuals_reported_date") or event.get("event_date"),
            "note": (
                "Provider actuals look like a provisional zero-EPS placeholder. "
                "Do not state a beat or miss until real reported EPS is captured."
            ),
        }
    return {
        "available": True,
        "reported_eps": reported_eps,
        "estimated_eps": estimated_eps,
        "eps_surprise": eps_surprise,
        "eps_surprise_pct": eps_surprise_pct,
        "surprise_label": event.get("surprise_label"),
        "reported_date": event.get("actuals_reported_date") or event.get("event_date"),
        "fiscal_date_ending": event.get("actuals_fiscal_date_ending")
        or event.get("fiscal_date_ending"),
    }


_ACTUALS_EVENT_FIELDS = {
    "actuals_captured_at",
    "actuals_fiscal_date_ending",
    "actuals_reported_date",
    "eps_surprise",
    "eps_surprise_pct",
    "reported_eps",
    "surprise_label",
}


def _prompt_reported_actuals(reported_actuals: dict[str, Any]) -> dict[str, Any]:
    """Return only model-safe actuals fields.

    Internal rejection reasons are useful for debugging, but they must not leak
    into the prompt. Otherwise the model can turn implementation diagnostics
    like "placeholder" into user-facing earnings narratives.
    """
    if reported_actuals.get("available") is True:
        return reported_actuals
    return {
        "available": False,
        "note": (
            "Actual reported EPS is not captured yet. Do not state a beat or "
            "miss and do not present the estimate as the reported result."
        ),
    }


def _prompt_earnings_event(event: dict[str, Any], reported_actuals: dict[str, Any]) -> dict[str, Any]:
    """Strip rejected raw actuals from model-visible event payloads."""
    clean = dict(event or {})
    if reported_actuals.get("available") is not True:
        for key in _ACTUALS_EVENT_FIELDS:
            clean.pop(key, None)
    return clean


def _build_input_payload(
    store: TraceMoneyStore,
    market: str,
    ticker: str,
    instrument: dict[str, Any],
    event: dict[str, Any] | None,
) -> dict[str, Any]:
    instrument_id = str(instrument.get("instrument_id") or "")
    if not instrument_id:
        raise ValueError(f"Missing instrument_id for ticker={ticker}")
    active_price_universe = store.get_active_price_universe(market)
    active_ai_universe = store.get_active_ai_universe(market) or active_price_universe
    if not active_price_universe:
        raise ValueError(f"No active price universe configured for {market}")
    if not active_ai_universe:
        raise ValueError(f"No active AI universe configured for {market}")

    latest = (store.get_latest_prices([instrument_id]).get(instrument_id) or {})
    facts = (store.get_stock_facts_batch([instrument_id]).get(instrument_id) or {})
    technical_doc = store.db.collection("tm_stock_technicals_latest").document(instrument_id).get()
    technicals = technical_doc.to_dict() if technical_doc.exists else {}
    intel_pro = store.get_stock_intel_pro(market, active_price_universe, instrument_id) or {}
    stock_intel = store.get_stock_intelligence_doc(market, active_ai_universe, instrument_id) or {}
    history = store.get_price_history(instrument_id, limit=90)
    recent_news = _recent_news_context(store, market, active_ai_universe, instrument_id)
    reddit = _reddit_context(store, market, ticker)
    event_date = str((event or {}).get("event_date") or "")
    timing = _event_timing(event_date)
    reported_actuals = _reported_actuals(event or {})
    prompt_reported_actuals = _prompt_reported_actuals(reported_actuals)
    prompt_event = _prompt_earnings_event(event or {}, reported_actuals)

    return {
        "as_of_utc": _utc_now(),
        "market": market.upper(),
        "ticker": ticker.upper(),
        "instrument_id": instrument_id,
        "company_name": instrument.get("name"),
        "timing": timing,
        "reported_actuals": prompt_reported_actuals,
        "earnings_event": prompt_event,
        "latest_price": latest.get("quote") or {},
        "price_reaction_window": _reaction_metrics(history, event_date),
        "price_history_90d": _history_snapshot(history),
        "fundamentals": {
            "analyst": facts.get("analyst") or {},
            "quick_stats": facts.get("quick_stats") or {},
            "returns": facts.get("returns") or {},
            "events": facts.get("events") or [],
        },
        "technicals": {
            "rsi_14": (technicals.get("rsi_14") if isinstance(technicals, dict) else {}) or {},
            "moving_averages": (technicals.get("moving_averages") if isinstance(technicals, dict) else {}) or {},
        },
        "intel_pro": {
            "overall": intel_pro.get("overall") or {},
            "pillars": intel_pro.get("pillars") or {},
            "catalysts": intel_pro.get("catalysts") or [],
        },
        "stock_intelligence": {
            "headline": stock_intel.get("headline"),
            "today_brief": stock_intel.get("today_brief"),
            "catalyst": stock_intel.get("catalyst"),
            "risk": stock_intel.get("risk"),
            "thesis": stock_intel.get("thesis"),
            "overall_label": stock_intel.get("overall_label"),
            "overall_score": stock_intel.get("overall_score"),
        },
        "post_earnings_news": recent_news,
        "reddit_buzz": reddit,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build post-earnings intelligence report for a ticker")
    parser.add_argument("--market", default="US", choices=["US", "IN"])
    parser.add_argument("--ticker", default="", help="Ticker symbol, e.g. NVDA")
    parser.add_argument("--event-date", default="", help="Optional earnings event date YYYY-MM-DD")
    parser.add_argument("--model", default="", help="Override OpenAI model")
    parser.add_argument("--prompt-variant", choices=["v1", "v2", "v3"], default="v1")
    parser.add_argument(
        "--universe",
        default="",
        help=(
            "Optional universe id to scope --all-recent. Defaults to the whole "
            "market's tm_instruments (our calendar universe)."
        ),
    )
    parser.add_argument("--all-recent", action="store_true", help="Process all recent earnings events in our calendar universe")
    parser.add_argument("--recent-days", type=int, default=3, help="When --all-recent, include event_date within this many days back")
    parser.add_argument("--max-events", type=int, default=20, help="When --all-recent, cap processed events")
    parser.add_argument("--dry-run", action="store_true", help="Build and print payload/result without Firestore write")
    parser.add_argument("--write", action="store_true", help="Write result into tm_earnings_intel")
    args = parser.parse_args()

    store = TraceMoneyStore()
    model_name = args.model.strip() or llm_model(OPENAI_DEFAULT_MODEL)
    # Build the ticker -> instrument map for our calendar universe once, up front.
    # This both scopes --all-recent to stocks we cover and lets the loop resolve
    # instruments without re-scanning all of tm_instruments per ticker.
    universe_by_ticker = _universe_instruments_by_ticker(
        store, args.market, args.universe.strip() or None
    )
    events_to_process: list[dict[str, Any]] = []
    if args.all_recent:
        events_to_process = _list_recent_events(
            store=store,
            market=args.market,
            recent_days=args.recent_days,
            max_events=args.max_events,
            allowed_tickers=set(universe_by_ticker.keys()),
        )
        if not events_to_process:
            print(json.dumps({"status": "noop", "reason": "no_recent_events"}))
            return
    else:
        ticker = args.ticker.upper().strip()
        if not ticker:
            raise ValueError("--ticker is required unless --all-recent is set")
        event = _pick_earnings_event(store, args.market, ticker, args.event_date.strip() or None)
        if event is None:
            raise ValueError(f"No earnings event found for ticker={ticker} market={args.market}")
        events_to_process = [event]

    results: list[dict[str, Any]] = []
    skipped: list[str] = []
    for event in events_to_process:
        ticker = str(event.get("ticker") or args.ticker).upper().strip()
        if not ticker:
            continue
        # Prefer the prebuilt universe map; fall back to a direct lookup for an
        # explicit single --ticker that may sit outside the default universe.
        instrument = universe_by_ticker.get(ticker)
        if instrument is None:
            try:
                instrument = _resolve_instrument(store, args.market, ticker)
            except ValueError:
                skipped.append(ticker)
                continue
        payload = _build_input_payload(store, args.market, ticker, instrument, event)
        synthesis = _llm_synthesize(payload, model_name=model_name, prompt_variant=args.prompt_variant)
        synthesis = _sanitize_decision_guide(synthesis, payload)
        event_date = str((event or {}).get("event_date") or datetime.now(timezone.utc).date().isoformat())
        instrument_id = str(instrument.get("instrument_id") or "")
        doc_id = _build_doc_id(args.market, instrument_id, event_date)
        report = {
            "doc_id": doc_id,
            "market": args.market.upper(),
            "instrument_id": instrument_id,
            "ticker": ticker,
            "event_date": event_date,
            "generated_at": _utc_now(),
            "model": model_name,
            "prompt_variant": args.prompt_variant,
            "inputs": {
                "earnings_event": payload.get("earnings_event"),
                "timing": payload.get("timing"),
                "reported_actuals": payload.get("reported_actuals"),
                "price_reaction_window": payload.get("price_reaction_window"),
                "post_earnings_news_count": len(payload.get("post_earnings_news") or []),
                "reddit_present": bool(payload.get("reddit_buzz")),
            },
            "report": synthesis,
        }
        if args.write:
            # Generated reports are full snapshots. Do not merge nested maps:
            # stale keys from older prompt/input shapes can otherwise survive
            # and leak bad provider data into downstream materializers.
            store.db.collection("tm_earnings_intel").document(doc_id).set(report)
            store.db.collection("tm_earnings_intel").document(f"{args.market.upper()}__{instrument_id}__latest").set(report)
        results.append(report)

    if args.dry_run or not args.write:
        print(json.dumps(results[0] if len(results) == 1 else {"count": len(results), "skipped": skipped, "items": results}, indent=2, ensure_ascii=True))
        return
    print(json.dumps({
        "status": "ok",
        "count": len(results),
        "skipped": skipped,
        "doc_ids": [item["doc_id"] for item in results],
        "instrument_ids": [item["instrument_id"] for item in results if item.get("instrument_id")],
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
