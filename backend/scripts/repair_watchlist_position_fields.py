from __future__ import annotations

import argparse
from datetime import datetime, timezone
from typing import Any

from backend.storage import TraceMoneyStore


PREFIX = "watchlist_positions."
VALID_POSITIONS = {"holding", "watchlist"}


def repaired_user_payload(data: dict[str, Any]) -> tuple[dict[str, Any] | None, int]:
    dotted = {
        key: value
        for key, value in data.items()
        if key.startswith(PREFIX) and len(key) > len(PREFIX)
    }
    if not dotted:
        return None, 0

    positions = data.get("watchlist_positions") or {}
    if not isinstance(positions, dict):
        positions = {}
    else:
        positions = dict(positions)

    repaired = 0
    for key, value in dotted.items():
        instrument_id = key[len(PREFIX):]
        position = str(value or "").strip()
        if instrument_id and position in VALID_POSITIONS:
            positions[instrument_id] = position
            repaired += 1

    cleaned = {
        key: value
        for key, value in data.items()
        if not key.startswith(PREFIX)
    }
    cleaned["watchlist_positions"] = positions
    cleaned["watchlist_updated_at"] = datetime.now(timezone.utc).isoformat()
    return cleaned, repaired


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Merge bad top-level watchlist_positions.* fields into the nested watchlist_positions map.",
    )
    parser.add_argument("--uid", default=None, help="Repair one user only.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be repaired without writing.")
    args = parser.parse_args()

    store = TraceMoneyStore()
    if args.uid:
        docs = [store.db.collection("users").document(args.uid).get()]
    else:
        docs = list(store.db.collection("users").stream())

    users_repaired = 0
    fields_repaired = 0
    for doc in docs:
        if not doc.exists:
            continue
        data = doc.to_dict() or {}
        payload, count = repaired_user_payload(data)
        if not payload:
            continue
        users_repaired += 1
        fields_repaired += count
        print(f"{'[dry] ' if args.dry_run else ''}{doc.id}: fields={count}")
        if not args.dry_run:
            doc.reference.set(payload, merge=False)

    print(f"Done. users_repaired={users_repaired} fields_repaired={fields_repaired}")


if __name__ == "__main__":
    main()
