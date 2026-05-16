from __future__ import annotations

import argparse
from datetime import datetime, timezone

from backend.storage import TraceMoneyStore
from backend.watchlist_view import _active_universe_cache, build_watchlist_view


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Legacy utility: refresh users/{uid}.radar_v1 from tracked_stocks."
    )
    parser.add_argument("--uid", default=None, help="Optional single uid.")
    parser.add_argument("--no-llm", action="store_true", help="Skip personalized LLM synthesis.")
    parser.add_argument(
        "--write-legacy",
        action="store_true",
        help="Actually write users/{uid}.radar_v1. Disabled by default to avoid dual-source drift.",
    )
    args = parser.parse_args()

    if not args.write_legacy:
        print(
            "No-op: legacy radar_v1 writer disabled. "
            "Use tm_watchlist_views as source of truth. "
            "Pass --write-legacy only for emergency backfills."
        )
        return

    store = TraceMoneyStore()
    active_universes = _active_universe_cache(store)

    if args.uid:
        snap = store.db.collection("users").document(args.uid).get()
        if not snap.exists:
            raise ValueError(f"No user doc for uid={args.uid}")
        users = [{"uid": args.uid, **(snap.to_dict() or {})}]
    else:
        users = store.list_subscribed_users()

    now = datetime.now(timezone.utc).isoformat()
    built = 0
    skipped = 0
    for user in users:
        uid = str(user.get("uid") or "")
        tracked = user.get("tracked_stocks") or []
        positions = user.get("watchlist_positions") or {}
        if not uid or not isinstance(tracked, list):
            skipped += 1
            continue
        if not tracked:
            store.db.collection("users").document(uid).set({
                "radar_v1": {
                    "built_at": now,
                    "tracked_count": 0,
                    "holdings_count": 0,
                    "watchlist_count": 0,
                    "rows": [],
                    "suggestions": [],
                }
            }, merge=True)
            built += 1
            continue

        payload = build_watchlist_view(
            store,
            uid,
            [str(t) for t in tracked],
            positions=positions,
            active_universes=active_universes,
            include_llm_brief=not args.no_llm,
        )
        store.db.collection("users").document(uid).set({
            "radar_v1": {
                "built_at": payload.get("built_at") or now,
                "tracked_count": int(payload.get("tracked_count") or 0),
                "holdings_count": int(payload.get("holdings_count") or 0),
                "watchlist_count": int(payload.get("watchlist_count") or 0),
                "rows": payload.get("rows") or [],
                "suggestions": payload.get("suggestions") or [],
            }
        }, merge=True)
        built += 1
        print(f"[ok] {uid}: rows={len(payload.get('rows') or [])}")

    print(f"Done. built={built} skipped={skipped}")


if __name__ == "__main__":
    main()
