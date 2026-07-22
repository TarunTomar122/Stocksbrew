from __future__ import annotations

from backend.storage import TraceMoneyStore


class _Document:
    def __init__(self) -> None:
        self.payload: dict | None = None
        self.merge: bool | None = None

    def set(self, payload: dict, *, merge: bool = False) -> None:
        self.payload = payload
        self.merge = merge


class _Collection:
    def __init__(self, document: _Document) -> None:
        self._document = document

    def document(self, _document_id: str) -> _Document:
        return self._document


class _Database:
    def __init__(self, document: _Document) -> None:
        self._document = document

    def collection(self, _name: str) -> _Collection:
        return _Collection(self._document)


def test_search_index_partial_save_uses_nested_entry_map() -> None:
    document = _Document()
    store = object.__new__(TraceMoneyStore)
    store.db = _Database(document)

    saved = store.save_search_index_entries(
        "US",
        [
            {
                "instrument_id": "US_SNDK",
                "ticker": "SNDK",
                "price": 1589.4,
                "day_change_pct": 14.27,
            }
        ],
    )

    assert saved == 1
    assert document.merge is True
    assert document.payload is not None
    assert "entries.US_SNDK" not in document.payload
    assert document.payload["entries"]["US_SNDK"]["day_change_pct"] == 14.27
