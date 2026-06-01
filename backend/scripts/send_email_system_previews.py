"""Send rebuilt email system previews to a target inbox.

Usage:
  python -m backend.scripts.send_email_system_previews --to tomartarun2001@gmail.com
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.lifecycle_emailing import (  # noqa: E402
    email_checkout_abandoned,
    email_first_radar_item,
    email_pro_daily_digest,
    email_pro_directive_change,
    email_pro_earnings_setup,
    email_pro_welcome,
    email_track_blocked,
    first_name_from_profile,
    send_email,
)
from backend.storage import TraceMoneyStore  # noqa: E402


def _find_user_by_email(store: TraceMoneyStore, email: str) -> tuple[str | None, dict[str, Any] | None]:
    docs = list(
        store.db.collection("users").where("email_lower", "==", email.strip().lower()).limit(1).stream()
    )
    if not docs:
        return None, None
    doc = docs[0]
    return doc.id, doc.to_dict() or {}


def _first_real_row(view: dict[str, Any]) -> dict[str, Any]:
    rows = view.get("rows") if isinstance(view, dict) else []
    if isinstance(rows, list) and rows:
        return rows[0] if isinstance(rows[0], dict) else {}
    return {
        "ticker": "NVDA",
        "position_type": "watchlist",
        "price": 118.42,
        "day_change_pct": 2.8,
        "day_change_abs": 3.22,
        "ai_directive_text": "Accumulate on continued AI capex strength.",
        "ai_directive_rationale": "Demand remains ahead of supply and estimate resets are still moving upward.",
        "catalysts": [{"title": "Estimate revisions still rising"}],
    }


def _pick_pre_earnings_doc(store: TraceMoneyStore, tracked: list[str]) -> dict[str, Any] | None:
    refs = [store.db.collection("tm_pre_earnings_intel").document(f"US__{iid}__upcoming") for iid in tracked if iid.startswith("US_")]
    if refs:
        for snap in store.db.get_all(refs):
            if snap.exists:
                return snap.to_dict() or {}
    docs = list(store.db.collection("tm_pre_earnings_intel").limit(5).stream())
    for doc in docs:
        row = doc.to_dict() or {}
        if row.get("ticker") and row.get("event_date"):
            return row
    return {
        "ticker": "AAPL",
        "event_date": "2026-06-04",
        "instrument_id": "US_AAPL",
        "report": {
            "headline": "AAPL earnings setup: hold through the print, but trim if margin guidance slips.",
            "summary": "Services remains the key support line while hardware expectations are already cleaner than last quarter.",
            "setup": {"pre_earnings_positioning": "Expectations are not washed out, but positioning is no longer euphoric."},
            "decision_guide": {
                "for_holders": "Hold through the print only if you can tolerate a guidance-driven air pocket.",
                "for_watchers": "Wait for the report unless the stock retests support with calmer volume.",
                "key_monitor_list": ["gross margin guide", "China commentary", "services growth"],
            },
            "confidence": {"score_0_100": 68},
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Send rebuilt email previews")
    parser.add_argument("--to", required=True)
    args = parser.parse_args()

    store = TraceMoneyStore()
    target = args.to.strip().lower()
    uid, user = _find_user_by_email(store, target)
    user = user or {}
    first_name = first_name_from_profile(display_name=user.get("display_name"), email=target)
    view = store.get_watchlist_view(uid) if uid else {}
    view = view or {}
    rows = view.get("rows") if isinstance(view.get("rows"), list) else []
    market_rows = store.get_market_price_snapshot("US")
    primary_row = _first_real_row(view)
    tracked = [str(i).strip().upper() for i in (user.get("tracked_stocks") or []) if str(i).strip()]
    earnings_doc = _pick_pre_earnings_doc(store, tracked)

    payloads = [
        email_first_radar_item(first_name),
        email_track_blocked(str(primary_row.get("ticker") or "NVDA")),
        email_checkout_abandoned("monthly"),
        email_pro_welcome(),
        email_pro_directive_change(
            ticker=str(primary_row.get("ticker") or "NVDA"),
            position_type=str(primary_row.get("position_type") or "watchlist"),
            prev_stance="hold",
            new_stance="accumulate",
            directive_text=str(primary_row.get("ai_directive_text") or ""),
        ),
        email_pro_daily_digest(
            rows if rows else [primary_row],
            market_rows,
            radar_brief=view.get("brief") if isinstance(view.get("brief"), dict) else None,
            radar_events=view.get("event_radar") if isinstance(view.get("event_radar"), list) else None,
        ),
        email_pro_earnings_setup(
            earnings_doc or {},
            position_type="holding" if str((earnings_doc or {}).get("instrument_id") or "") in set(tracked) else "watchlist",
        ),
    ]

    sent = 0
    for subject, html in payloads:
        ok = send_email(target, subject, html)
        print({"subject": subject, "sent": ok})
        if ok:
            sent += 1
    print({"target": target, "sent": sent, "total": len(payloads)})


if __name__ == "__main__":
    main()
