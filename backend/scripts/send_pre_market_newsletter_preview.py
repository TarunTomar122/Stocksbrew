"""Send one pre-market brief preview to a single address.

Usage:
    python -m backend.scripts.send_pre_market_newsletter_preview --to you@example.com --market US
    python -m backend.scripts.send_pre_market_newsletter_preview --to you@example.com --dry-run
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.lifecycle_emailing import (
    email_pre_market_brief,
    first_name_from_profile,
    send_email,
)
from backend.storage import TraceMoneyStore


def _find_user_by_email(store: TraceMoneyStore, email: str) -> tuple[str | None, dict[str, Any]]:
    value = email.strip().lower()
    if not value:
        return None, {}
    query = store.db.collection("users").where("email_lower", "==", value).limit(1).stream()
    for doc in query:
        return doc.id, (doc.to_dict() or {})
    return None, {}


def _macro_phase_line(store: TraceMoneyStore, market: str) -> str | None:
    try:
        doc = store.db.collection("tm_sector_regimes").document(f"{market.upper()}__macro").get()
    except Exception:
        return None
    if not doc.exists:
        return None
    data = doc.to_dict() or {}
    phase = data.get("market_phase")
    risk = data.get("risk_appetite")
    phase_label = {
        "trending_up": "trending up",
        "distribution": "in distribution",
        "correction": "in a correction",
        "recovery": "recovering",
        "range": "range-bound",
    }.get(str(phase or ""), "")
    risk_label = {"on": "risk-on", "off": "risk-off", "mixed": "mixed"}.get(str(risk or ""), "")
    if not phase_label:
        return None
    tail = f", {risk_label}" if risk_label else ""
    return f"The market is {phase_label}{tail}."


def _reporting_today(store: TraceMoneyStore, market: str) -> list[dict[str, Any]]:
    today = datetime.now(timezone.utc).date().isoformat()
    out: list[dict[str, Any]] = []
    valid_tickers = {
        str(row.get("ticker") or "").strip().upper()
        for row in list_instruments(market)
        if str(row.get("ticker") or "").strip()
    }
    try:
        snap = (
            store.db.collection("tm_earnings_events")
            .where("market", "==", market.upper())
            .where("event_date", "==", today)
            .get()
        )
        for doc in snap:
            t = str((doc.to_dict() or {}).get("ticker") or "").strip().upper()
            if t and t in valid_tickers:
                out.append({"ticker": t, "call": ""})
    except Exception:
        pass
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in out:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker or ticker in seen:
            continue
        deduped.append(row)
        seen.add(ticker)
        if len(deduped) >= 5:
            break
    return deduped


def main() -> None:
    parser = argparse.ArgumentParser(description="Send one pre-market brief preview email")
    parser.add_argument("--to", required=True, help="Target email")
    parser.add_argument("--market", default="US")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    market = args.market.upper()
    target = args.to.strip()

    uid, user = _find_user_by_email(store, target)
    first_name = first_name_from_profile(
        display_name=user.get("display_name"), email=target
    )

    premarket = store.get_premarket_movers(market)
    rows: list[dict[str, Any]] = []
    if uid:
        view = store.get_watchlist_view(uid) or {}
        rows = view.get("rows") or []

    subject, html = email_pre_market_brief(
        first_name,
        premarket,
        rows,
        market_phase_line=_macro_phase_line(store, market),
        reporting_today=_reporting_today(store, market),
    )

    summary = {
        "to": target,
        "uid": uid,
        "subject": subject,
        "has_premarket_doc": bool(premarket),
        "premarket_quoted": (premarket or {}).get("quoted_count", 0),
        "row_count": len(rows),
    }

    if args.dry_run:
        print(json.dumps({"mode": "dry_run", "sent": False, **summary}, indent=2))
        return

    sent = send_email(target, subject, html)
    print(json.dumps({"mode": "send", "sent": bool(sent), **summary}, indent=2))


if __name__ == "__main__":
    main()
