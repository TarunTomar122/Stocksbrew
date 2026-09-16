"""TypeSafe Jev gate: fast atomic QA on generated stock briefs.

One call per brief asks three calibrated questions (company match, price-level
sanity, evidence support); the decision is a rule in code, per TypeSafe's
decompose-and-compose pattern. Used in shadow mode: the result is attached to
the brief as `jev_qa` and logged, but publishing never depends on it.

Never raises: any failure returns None and the caller continues unchanged.
"""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone
from typing import Any

API_URL = "https://api.typesafe.ai/v1/systemone"
HOLD_THRESHOLD = 0.45
TIMEOUT_S = 8

QUESTIONS: dict[str, dict[str, Any]] = {
    "correct_company": {
        "type": "noul",
        "instructions": "Does the brief text talk about the company named in `company_name`, and only that company? A brief about a different or fictional company means false.",
    },
    "prices_sane": {
        "type": "noul",
        "instructions": "Are the price levels (add/trim zones, targets) plausibly consistent with `current_price`? Levels that are 100x away from the current price, or a buy-below level above the trim level, mean false.",
    },
    "evidence_supported": {
        "type": "noul",
        "instructions": "Do the headline and what_changed text appear to describe events that could genuinely apply to this company, rather than an unrelated fictional story?",
    },
}


def is_configured() -> bool:
    return bool(os.getenv("TYPESAFE_API_KEY", "").strip())


def decide(correct_company: float, prices_sane: float, evidence_supported: float) -> str:
    """Pure decision rule: hold when any atomic check loses confidence."""
    if min(correct_company, prices_sane, evidence_supported) < HOLD_THRESHOLD:
        return "hold"
    return "publish"


def build_brief_state(payload: dict[str, Any]) -> dict[str, Any]:
    directive = payload.get("directive_v2") if isinstance(payload.get("directive_v2"), dict) else {}
    instrument_id = str(payload.get("instrument_id") or "")
    ticker = str(payload.get("ticker") or (instrument_id.split("_", 1)[-1] if "_" in instrument_id else ""))
    return {
        "ticker": ticker,
        "current_price": payload.get("current_price") or directive.get("price_at_call"),
        "headline": str(payload.get("headline") or ""),
        "thesis": str(payload.get("thesis") or ""),
        "what_changed": str((payload.get("visual_summary") or {}).get("what_changed") or ""),
        "action_label": str((directive.get("action") or {}).get("label") or ""),
        "zones": directive.get("zones") or {},
    }


def evaluate_brief_state(state: dict[str, Any]) -> dict[str, Any] | None:
    key = os.getenv("TYPESAFE_API_KEY", "").strip()
    if not key:
        return None
    body = json.dumps({"state": state, "model": "jev-latest", "questions": QUESTIONS}).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as res:
        payload = json.loads(res.read().decode("utf-8"))
    answers = payload.get("answers", {})
    usage = payload.get("usage", {})
    cc = float((answers.get("correct_company") or {}).get("noul") or 0.0)
    ps = float((answers.get("prices_sane") or {}).get("noul") or 0.0)
    ev = float((answers.get("evidence_supported") or {}).get("noul") or 0.0)
    return {
        "decision": decide(cc, ps, ev),
        "correct_company": round(cc, 3),
        "prices_sane": round(ps, 3),
        "evidence_supported": round(ev, 3),
        "input_tokens": usage.get("input_tokens"),
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }


def gate_brief(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Shadow gate for one brief payload. Returns the QA result or None. Never raises."""
    if not is_configured():
        return None
    try:
        return evaluate_brief_state(build_brief_state(payload))
    except Exception as error:
        print(
            "jev_qa_error",
            {"instrument_id": payload.get("instrument_id"), "error": str(error)[:160]},
        )
        return None
