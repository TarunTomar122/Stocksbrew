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

from backend.storage import TraceMoneyStore
from backend.watchlist_view import (
    _active_universe_cache,
    build_watchlist_view,
)


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

    if args.uid:
        user_doc = store.db.collection("users").document(args.uid).get()
        if not user_doc.exists:
            raise ValueError(f"No user doc for uid={args.uid}")
        users = [{"uid": args.uid, **(user_doc.to_dict() or {})}]
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

        if args.skip_if_version_matches and input_version:
            existing = store.get_watchlist_view(uid) or {}
            if str(existing.get("built_from_version") or "").strip() == input_version:
                skipped_version += 1
                continue

        payload = build_watchlist_view(
            store,
            uid,
            [str(t) for t in tracked],
            positions=user.get("watchlist_positions") or {},
            active_universes=active_universes,
            include_llm_brief=not args.no_llm,
        )
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
            print(f"  [ok] {uid}: {payload['tracked_count']} rows written")
        built += 1
    print(
        f"Done. Built {built}, skipped {skipped} (no tracked_stocks), "
        f"skipped_version {skipped_version}."
    )


if __name__ == "__main__":
    main()
