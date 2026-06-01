"""Send market-open newsletter to all users (pro + free).

Pro users get personalized Radar digest.
Free users get generic market-open digest (movers + reddit buzz).
"""
from __future__ import annotations

import argparse
import hashlib
from datetime import datetime, timezone
from typing import Any

from backend.email_runtime import log_email_send
from backend.lifecycle_emailing import email_pro_daily_digest, send_email
from backend.scripts.send_market_open_newsletter_preview import (
    _build_generic_market_newsletter,
    _generic_rows_from_anomalies,
)
from backend.storage import TraceMoneyStore


def _today_key() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _email_opted_in(user: dict[str, Any], pref_key: str) -> bool:
    return user.get(pref_key) is not False


def _email_key(email: str) -> str:
    return hashlib.sha1(email.strip().lower().encode("utf-8")).hexdigest()[:16]


def _view_is_fresh_for_today(view: dict[str, Any], *, today_key: str) -> bool:
    built_at = str(view.get("built_at") or "").strip()
    if not built_at:
        return False
    try:
        dt = datetime.fromisoformat(built_at.replace("Z", "+00:00"))
    except Exception:
        return False
    return dt.astimezone(timezone.utc).date().isoformat() == today_key


def _already_sent(store: TraceMoneyStore, *, market: str, date_key: str, email: str) -> bool:
    doc_id = f"{market}__{date_key}__{_email_key(email)}"
    doc = store.db.collection("tm_market_open_email_log").document(doc_id).get()
    if not doc.exists:
        return False
    payload = doc.to_dict() or {}
    return bool(payload.get("sent") is True)


def _mark_sent(
    store: TraceMoneyStore,
    *,
    market: str,
    date_key: str,
    email: str,
    uid: str,
    mode: str,
    subject: str,
    sent: bool,
) -> None:
    doc_id = f"{market}__{date_key}__{_email_key(email)}"
    store.db.collection("tm_market_open_email_log").document(doc_id).set(
        {
            "market": market,
            "date": date_key,
            "email": email,
            "uid": uid,
            "mode": mode,
            "subject": subject,
            "sent": bool(sent),
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        merge=True,
    )


def run_market_open_newsletters(*, market: str = "US", limit: int = 0, dry_run: bool = False) -> dict[str, Any]:
    market = str(market or "US").upper()
    store = TraceMoneyStore()
    today = _today_key()

    market_rows = store.get_market_price_snapshot(market)
    generic_rows = _generic_rows_from_anomalies(store, market=market, limit=8)
    if not generic_rows:
        ranked = sorted(
            market_rows,
            key=lambda row: abs(float(row.get("day_change_pct", row.get("change_pct", 0)) or 0)),
            reverse=True,
        )
        generic_rows = [
            {
                "ticker": str(item.get("ticker") or item.get("symbol") or ""),
                "price": item.get("price") or item.get("current"),
                "day_change_pct": item.get("day_change_pct", item.get("change_pct")),
                "day_change_abs": item.get("day_change_abs", item.get("change_abs")),
                "position_type": "watchlist",
                "ai_directive_text": "Top market mover",
                "ai_directive_rationale": "Picked from broad market snapshot.",
            }
            for item in ranked[:8]
        ]
    generic_subject, generic_html = _build_generic_market_newsletter(store=store, market=market, rows=generic_rows)

    users = store.db.collection("users").select(
        ["email", "email_lower", "is_subscribed", "email_digest_enabled"]
    ).stream()

    total = sent = skipped = failed = 0
    for doc in users:
        if limit and total >= limit:
            break
        uid = doc.id
        user = doc.to_dict() or {}
        email = str(user.get("email") or user.get("email_lower") or "").strip().lower()
        if not email:
            continue
        total += 1
        if not _email_opted_in(user, "email_digest_enabled"):
            skipped += 1
            continue
        if _already_sent(store, market=market, date_key=today, email=email):
            skipped += 1
            continue

        is_subscribed = bool(user.get("is_subscribed"))
        mode = "generic"
        subject = generic_subject
        html = generic_html

        if is_subscribed:
            view = store.get_watchlist_view(uid) or {}
            rows = view.get("rows") if isinstance(view, dict) else []
            rows = rows if isinstance(rows, list) else []
            if rows and isinstance(view, dict) and _view_is_fresh_for_today(view, today_key=today):
                brief = view.get("brief") if isinstance(view, dict) else None
                events = view.get("event_radar") if isinstance(view, dict) else None
                subject, html = email_pro_daily_digest(
                    rows,
                    market_rows,
                    radar_brief=brief if isinstance(brief, dict) else None,
                    radar_events=events if isinstance(events, list) else None,
                )
                mode = "personalized"

        if dry_run:
            skipped += 1
            continue

        ok = send_email(email, subject, html)
        _mark_sent(
            store,
            market=market,
            date_key=today,
            email=email,
            uid=uid,
            mode=mode,
            subject=subject,
            sent=ok,
        )
        if ok:
            log_email_send(
                store,
                uid=uid,
                email=email,
                email_type="subscriber_daily_digest" if mode == "personalized" else "free_market_digest",
                dedupe_key=f"{mode}_{today}",
                subject=subject,
                trigger_type="market_open_email",
                meta={"market": market, "mode": mode},
            )
            sent += 1
        else:
            failed += 1

    summary = {
        "market": market,
        "date": today,
        "total_users_scanned": total,
        "sent": sent,
        "skipped": skipped,
        "failed": failed,
    }
    if failed > 0 and not dry_run:
        raise SystemExit(1)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Send market-open newsletter to all free+pro users")
    parser.add_argument("--market", default="US")
    parser.add_argument("--limit", type=int, default=0, help="optional max users to process (0 = no limit)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(
        run_market_open_newsletters(
            market=str(args.market or "US").upper(),
            limit=max(0, int(args.limit or 0)),
            dry_run=bool(args.dry_run),
        )
    )


if __name__ == "__main__":
    main()
