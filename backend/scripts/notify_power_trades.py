"""Email users when a watched politician trades a stock they HOLD.

Scans recent tm_power_trades rows against every user's tracked holdings
(users.watchlist_positions == "holding"), sends one batched email per user via
Brevo, and records each send in tm_power_trade_alerts/{uid}_{trade_id} so the
same trade never emails the same person twice.

Usage:
    python -m backend.scripts.notify_power_trades [--days 7] [--dry-run]
    python -m backend.scripts.notify_power_trades --test-to you@example.com
"""
from __future__ import annotations

import argparse
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.subscription_entitlement import is_pro_user
from backend.email import emails_enabled, send_email
from backend.emails.power_trade_alert import build_power_trade_email
from backend.env import load_backend_env

ALERT_COLLECTION = "tm_power_trade_alerts"
DEFAULT_DAYS = 8


def _holding_tickers(positions: Any) -> set[str]:
    out: set[str] = set()
    if not isinstance(positions, dict):
        return out
    for instrument_id, position_type in positions.items():
        if str(position_type or "").strip().lower() != "holding":
            continue
        ticker = str(instrument_id or "").strip().upper()
        if ticker.startswith("US_"):
            ticker = ticker[3:]
        if ticker:
            out.add(ticker)
    return out


def load_recent_trades(store: Any, days: int) -> list[dict[str, Any]]:
    from_date = (datetime.now(timezone.utc) - timedelta(days=max(1, days))).strftime("%Y-%m-%d")
    docs = (
        store.db.collection("tm_power_trades")
        .where("disclosure_date", ">=", from_date)
        .stream()
    )
    rows = [doc.to_dict() or {} for doc in docs]
    rows.sort(key=lambda r: str(r.get("disclosure_date") or ""), reverse=True)
    return rows


def already_sent(store: Any, user_id: str, trade_id: str) -> bool:
    doc = store.db.collection(ALERT_COLLECTION).document(f"{user_id}_{trade_id}").get()
    return doc.exists


def record_sent(store: Any, user_id: str, trade_ids: list[str]) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    for trade_id in trade_ids:
        store.db.collection(ALERT_COLLECTION).document(f"{user_id}_{trade_id}").set(
            {"user_id": user_id, "trade_id": trade_id, "sent_at": now_iso},
            merge=True,
        )


def build_alerts_for_user(trades: list[dict[str, Any]], holdings: set[str], *, seen: Any) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    for trade in trades:
        ticker = str(trade.get("ticker") or "").upper()
        trade_id = str(trade.get("trade_id") or "")
        if not ticker or ticker not in holdings or not trade_id:
            continue
        key = f"{trade.get('person_id')}|{trade_id}"
        if key in seen:
            continue
        alerts.append(trade)
    # newest disclosure first, cap per email so one burst stays readable
    alerts.sort(key=lambda t: str(t.get("disclosure_date") or ""), reverse=True)
    return alerts[:6]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS, help="lookback window on disclosure_date")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--test-to",
        default=None,
        help="send one sample alert to this address and exit (ignores watchlists and dedupe)",
    )
    args = parser.parse_args()

    load_backend_env()
    t0 = time.time()

    if args.test_to:
        subject, html_body = build_power_trade_email(
            [
                {
                    "person_name": "Nancy Pelosi",
                    "tx_type": "buy",
                    "ticker": "NVDA",
                    "company": "NVIDIA Corporation",
                    "chamber": "house",
                    "party": "D",
                    "state": "CA",
                    "amount_low": 100_001,
                    "amount_high": 250_000,
                    "transaction_date": "2026-08-20",
                    "disclosure_date": "2026-08-22",
                    "lag_days": 2,
                },
                {
                    "person_name": "Kevin Hern",
                    "tx_type": "sell",
                    "ticker": "NVDA",
                    "company": "NVIDIA Corporation",
                    "chamber": "house",
                    "party": "R",
                    "state": "OK",
                    "amount_low": 15_001,
                    "amount_high": 50_000,
                    "transaction_date": "2026-08-19",
                    "disclosure_date": "2026-08-22",
                    "lag_days": 3,
                },
            ]
        )
        print(f"[test] sending sample alert to {args.test_to}")
        sent = send_email(args.test_to, subject, html_body)
        print(f"[test] send_email -> {sent} (EMAILS_ENABLED={emails_enabled()})")
        return

    from backend.storage import TraceMoneyStore

    store = TraceMoneyStore()
    trades = load_recent_trades(store, args.days)
    print(f"Trades in last {args.days}d by disclosure date: {len(trades)}")

    users = store.list_subscribed_users()
    matched_users = 0
    emailed = 0

    for user in users:
        uid = str(user.get("uid") or "").strip()
        email = str(user.get("email") or "").strip()
        if not uid or not email:
            continue
        if not bool(user.get("email_alerts_enabled", True)):
            continue
        if not is_pro_user(user):
            continue  # power-trade emails are a Pro perk; widen later if wanted

        holdings = _holding_tickers(user.get("watchlist_positions"))
        if not holdings:
            continue

        fresh: list[dict[str, Any]] = []
        for trade in trades:
            ticker = str(trade.get("ticker") or "").upper()
            trade_id = str(trade.get("trade_id") or "")
            if ticker and ticker in holdings and trade_id and not already_sent(store, uid, trade_id):
                fresh.append(trade)
        if not fresh:
            continue

        matched_users += 1
        fresh.sort(key=lambda t: str(t.get("disclosure_date") or ""), reverse=True)
        batch = fresh[:6]

        if args.dry_run:
            for trade in batch:
                print(f"  [dry] would email {email}: {trade['person_name']} {trade['tx_type']} {trade['ticker']}")
            continue

        subject, html_body = build_power_trade_email(batch)
        ok = send_email(email, subject, html_body)
        print(f"  {'sent' if ok else 'FAILED'} -> {email}: {len(batch)} alert(s)")
        if ok:
            record_sent(store, uid, [str(t["trade_id"]) for t in batch])
            emailed += 1

    print(f"\nUsers with matches: {matched_users} | emails sent: {emailed} | {round(time.time() - t0, 1)}s")


if __name__ == "__main__":
    main()
