from __future__ import annotations

from datetime import datetime, timezone

from backend.storage import TraceMoneyStore


def compute_baseline_version(data: dict) -> int:
    existing = data.get("watchlist_version")
    try:
        parsed = int(existing)
        if parsed > 0:
            return parsed
    except (TypeError, ValueError):
        pass

    tracked = data.get("tracked_stocks")
    if isinstance(tracked, list):
        return max(1, len(tracked))
    return 1


def main() -> None:
    store = TraceMoneyStore()
    docs = store.db.collection("users").stream()

    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    skipped = 0

    batch = store.db.batch()
    pending = 0

    for doc in docs:
        data = doc.to_dict() or {}
        current = data.get("watchlist_version")
        if isinstance(current, int) and current > 0:
            skipped += 1
            continue

        version = compute_baseline_version(data)
        batch.set(
            doc.reference,
            {
                "watchlist_version": version,
                "watchlist_updated_at": data.get("watchlist_updated_at") or now,
            },
            merge=True,
        )
        updated += 1
        pending += 1

        if pending >= 450:
            batch.commit()
            batch = store.db.batch()
            pending = 0

    if pending:
        batch.commit()

    print(f"Backfill complete. updated={updated} skipped={skipped}")


if __name__ == "__main__":
    main()
