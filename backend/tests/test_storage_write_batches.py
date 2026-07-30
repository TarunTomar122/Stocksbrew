from dataclasses import dataclass

from backend.storage import _firestore_write_batches


@dataclass
class _Ref:
    path: str


def test_firestore_batches_respect_payload_bytes_not_only_write_count() -> None:
    writes = [
        (_Ref(f"tm_latest_prices/{index}"), {"history_window": ["x" * 900]})
        for index in range(10)
    ]
    batches = _firestore_write_batches(
        writes,
        max_operations=400,
        max_payload_bytes=4_000,
    )

    assert len(batches) > 1
    assert sum(len(batch) for batch in batches) == 10
    assert all(len(batch) < 10 for batch in batches)
