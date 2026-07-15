"""Build materialized watchlist views for tracked users.

Runs once per pre-market cycle. For each user with `tracked_stocks` set on
`users/{uid}`, joins the already-computed intel_pro scores + latest prices
+ alert flags and writes a single doc to `tm_watchlist_views/{uid}`.

The `/watchlist` page reads that one doc → 1 Firestore read per page view
no matter how many stocks the user tracks.

Cost shape: 1 write per tracked user per run. At 2 runs/day × 100 users
that's 200 writes/day - rounding-error territory.
"""
from __future__ import annotations

import argparse
import os
from datetime import date, datetime, timezone

from backend.storage import TraceMoneyStore
from backend.watchlist_view import (
    _active_universe_cache,
    build_watchlist_view,
)

ALERTABLE_HOLDING_STANCES = {"trim"}
ALERTABLE_WATCHING_STANCES = {"accumulate"}
DIRECTIVE_CHANGE_EMAILS_PAUSED = os.getenv("PAUSE_DIRECTIVE_CHANGE_EMAILS", "").strip().lower() in {"1", "true", "yes", "on"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_stance(row: dict) -> str:
    directive = row.get("ai_directive") if isinstance(row.get("ai_directive"), dict) else {}
    return str(directive.get("stance") or "").strip().lower()


def _stance_map(rows: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in rows or []:
        instrument_id = str(row.get("instrument_id") or "").strip().upper()
        if not instrument_id:
            continue
        out[instrument_id] = {
            "instrument_id": instrument_id,
            "ticker": str(row.get("ticker") or "").strip().upper(),
            "position_type": str(row.get("position_type") or "watchlist").strip().lower(),
            "stance": _row_stance(row),
            "text": str(row.get("ai_directive_text") or "").strip(),
        }
    return out


def _parse_earnings_date(row: dict) -> date | None:
    for catalyst in row.get("catalysts") or []:
        if not isinstance(catalyst, dict):
            continue
        if str(catalyst.get("kind") or "").strip().lower() != "earnings":
            continue
        raw = str(catalyst.get("date") or "").strip()[:10]
        try:
            return date.fromisoformat(raw)
        except ValueError:
            continue
    return None


def _queue_earnings_events(
    store: TraceMoneyStore,
    *,
    uid: str,
    current_rows: list[dict],
) -> int:
    today = datetime.now(timezone.utc).date()
    queued = 0
    for row in current_rows or []:
        event_date = _parse_earnings_date(row)
        if event_date is None or not (0 <= (event_date - today).days <= 1):
            continue
        instrument_id = str(row.get("instrument_id") or "").strip().upper()
        ticker = str(row.get("ticker") or "").strip().upper()
        if not instrument_id or not ticker:
            continue
        event_id = f"earnings_{uid}_{instrument_id}_{event_date.isoformat()}"
        event_ref = store.db.collection("tm_lifecycle_events").document(event_id)
        if event_ref.get().exists:
            continue
        event_ref.set(
            {
                "type": "earnings_24h",
                "uid": uid,
                "processed_at": None,
                "created_at": _now_iso(),
                "payload": {
                    "instrument_id": instrument_id,
                    "ticker": ticker,
                    "position_type": str(row.get("position_type") or "watchlist"),
                    "event_date": event_date.isoformat(),
                },
            },
            merge=False,
        )
        queued += 1
    return queued


def _queue_directive_change_events(
    store: TraceMoneyStore,
    *,
    uid: str,
    is_subscribed: bool,
    previous_rows: list[dict],
    current_rows: list[dict],
) -> int:
    if DIRECTIVE_CHANGE_EMAILS_PAUSED or not is_subscribed:
        return 0
    queued = _queue_earnings_events(store, uid=uid, current_rows=current_rows)
    previous = _stance_map(previous_rows)
    current = _stance_map(current_rows)
    if not previous or not current:
        return queued

    now = _now_iso()
    for instrument_id, curr in current.items():
        prev = previous.get(instrument_id)
        if not prev:
            continue
        prev_stance = str(prev.get("stance") or "")
        curr_stance = str(curr.get("stance") or "")
        if not prev_stance or not curr_stance or prev_stance == curr_stance:
            continue

        position_type = str(curr.get("position_type") or "watchlist")
        if position_type == "holding":
            should_alert = curr_stance in ALERTABLE_HOLDING_STANCES
        else:
            should_alert = curr_stance in ALERTABLE_WATCHING_STANCES
        if not should_alert:
            continue

        event_id = f"directive_{uid}_{instrument_id}_{curr_stance}_{now[:13].replace(':', '')}"
        event_ref = store.db.collection("tm_lifecycle_events").document(event_id)
        if event_ref.get().exists:
            continue
        event_ref.set(
            {
                "type": "directive_change",
                "uid": uid,
                "processed_at": None,
                "created_at": now,
                "payload": {
                    "instrument_id": instrument_id,
                    "ticker": curr.get("ticker"),
                    "position_type": position_type,
                    "prev_stance": prev_stance,
                    "new_stance": curr_stance,
                    "directive_text": curr.get("text") or "",
                },
            },
            merge=False,
        )
        queued += 1
    return queued


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build per-user watchlist views",
    )
    parser.add_argument(
        "--uid",
        default=None,
        help="Build for a single user only",
    )
    parser.add_argument(
        "--uids",
        default=None,
        help="Comma-separated user ids to rebuild selectively",
    )
    parser.add_argument(
        "--instrument-ids",
        default=None,
        help="Comma-separated instrument ids; rebuild only users tracking any of them",
    )
    parser.add_argument(
        "--input-version",
        default="",
        help="Optional source version tag for this refresh cycle (e.g. lane run_id).",
    )
    parser.add_argument(
        "--skip-if-version-matches",
        action="store_true",
        help="Skip write when tm_watchlist_views/{uid}.built_from_version matches --input-version.",
    )
    parser.add_argument(
        "--subscribed-only",
        action="store_true",
        help="Build only for subscribed users with tracked_stocks.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't write, just log",
    )
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Skip personalized LLM synthesis",
    )
    args = parser.parse_args()

    store = TraceMoneyStore()
    active_universes = _active_universe_cache(store)

    explicit_uids = [
        item.strip()
        for item in str(args.uids or "").split(",")
        if item.strip()
    ]
    instrument_ids = [
        item.strip().upper()
        for item in str(args.instrument_ids or "").split(",")
        if item.strip()
    ]
    if args.uid and explicit_uids:
        raise ValueError("Pass either --uid or --uids, not both")
    if args.uid:
        user_doc = store.db.collection("users").document(args.uid).get()
        if not user_doc.exists:
            raise ValueError(f"No user doc for uid={args.uid}")
        users = [{"uid": args.uid, **(user_doc.to_dict() or {})}]
    elif explicit_uids:
        users = store.list_users_by_ids(explicit_uids)
    elif instrument_ids:
        matched_uids = store.list_user_ids_tracking_any(
            instrument_ids,
            subscribed_only=args.subscribed_only,
        )
        users = store.list_users_by_ids(matched_uids)
    else:
        users = store.list_subscribed_users()
        if args.subscribed_only:
            users = [u for u in users if bool(u.get("is_subscribed"))]

    if not users:
        print("No subscribed users to build.")
        return

    print(f"Building watchlist views for {len(users)} user(s)...")
    built = 0
    skipped = 0
    skipped_version = 0
    input_version = args.input_version.strip()
    for user in users:
        uid = user["uid"]
        tracked = user.get("tracked_stocks") or []
        if not isinstance(tracked, list) or not tracked:
            skipped += 1
            continue

        existing = store.get_watchlist_view(uid) or {}
        if args.skip_if_version_matches and input_version:
            if str(existing.get("built_from_version") or "").strip() == input_version:
                skipped_version += 1
                continue

        payload = build_watchlist_view(
            store,
            uid,
            [str(t) for t in tracked],
            is_subscribed=bool(user.get("is_subscribed")),
            positions=user.get("watchlist_positions") or {},
            holdings=user.get("watchlist_holdings") or {},
            active_universes=active_universes,
            include_llm_brief=not args.no_llm,
        )
        source_version = int(user.get("watchlist_version") or 0)
        if source_version > 0:
            payload["source_version"] = source_version
            payload["today_version_applied"] = source_version
            payload["diagnosis_version_applied"] = source_version
            payload["activity_version_applied"] = source_version
        if input_version:
            payload["built_from_version"] = input_version
        if args.dry_run:
            portfolio = payload.get("portfolio") or {}
            signal_count = sum(
                len(r.get("premium_signals") or [])
                for r in payload["rows"]
            )
            print(
                f"  [dry] {uid}: {payload['tracked_count']} rows, "
                f"signals={signal_count}, "
                f"risks={len(portfolio.get('risk_flags') or [])}, "
                f"suggestions={len(portfolio.get('suggestions') or [])}, "
                f"pulse='{payload['pulse']['headline']}'"
            )
        else:
            store.save_watchlist_view(uid, payload)
            queued = _queue_directive_change_events(
                store,
                uid=uid,
                is_subscribed=bool(user.get("is_subscribed")),
                previous_rows=existing.get("rows") or [],
                current_rows=payload.get("rows") or [],
            )
            print(f"  [ok] {uid}: {payload['tracked_count']} rows written")
            if queued:
                print(f"    [events] directive_change queued={queued}")
        built += 1
    print(
        f"Done. Built {built}, skipped {skipped} (no tracked_stocks), "
        f"skipped_version {skipped_version}."
    )


if __name__ == "__main__":
    main()
