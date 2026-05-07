from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from backend.storage import TraceMoneyStore


def main() -> None:
    store = TraceMoneyStore()
    counts: Counter[str] = Counter()
    docs = store.db.collection("users").stream()
    for doc in docs:
        data = doc.to_dict() or {}
        tracked = data.get("tracked_stocks") or []
        if not isinstance(tracked, list):
            continue
        for raw in tracked:
            instrument_id = str(raw or "").strip().upper()
            if instrument_id:
                counts[instrument_id] += 1

    now = datetime.now(timezone.utc).isoformat()
    batch = store.db.batch()
    pending = 0
    for instrument_id, count in counts.items():
        ref = store.db.collection("tm_tracked_instruments").document(instrument_id)
        ticker = instrument_id.split("_", 1)[-1]
        market = instrument_id.split("_", 1)[0]
        batch.set(ref, {
            "instrument_id": instrument_id,
            "ticker": ticker,
            "market": market,
            "tracked_count": count,
            "updated_at": now,
        }, merge=True)
        pending += 1
        if pending >= 450:
            batch.commit()
            batch = store.db.batch()
            pending = 0
    if pending:
        batch.commit()
    print(f"Backfilled {len(counts)} tracked instrument counter docs.")


if __name__ == "__main__":
    main()
