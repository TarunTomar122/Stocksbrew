from __future__ import annotations

import unittest
from typing import Any

from backend.stock_page_view import (
    SECTION_KEYS,
    market_for_instrument_id,
    merge_stock_view_sections,
    section_stamp,
    stock_page_view_doc_id,
)


class FakeWriteBatch:
    def __init__(self, client: "FakeDb") -> None:
        self.client = client
        self.ops: list[tuple[str, str, dict[str, Any] | None, bool]] = []

    def set(self, ref: Any, data: dict[str, Any], merge: bool = False) -> "FakeWriteBatch":
        self.ops.append(("set", ref.path, data, merge))
        return self

    def commit(self) -> None:
        self.client.commits += 1
        for _op, path, data, merge in self.ops:
            self.client.apply(path, data or {}, merge=merge)
        self.ops = []


class FakeDocumentRef:
    def __init__(self, client: "FakeDb", path: str) -> None:
        self.client = client
        self.path = path

    def set(self, data: dict[str, Any], merge: bool = False) -> None:
        self.client.apply(self.path, data, merge=merge)


class FakeDb:
    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}
        self.commits = 0

    def collection(self, name: str) -> Any:
        parent = name

        class Col:
            def document(self, doc_id: str) -> FakeDocumentRef:
                return FakeDocumentRef(outer, f"{name}/{doc_id}")

        outer = self
        return Col()

    def apply(self, path: str, data: dict[str, Any], merge: bool = False) -> None:
        if merge and path in self.docs:
            self.docs[path].update(data)
        else:
            self.docs[path] = dict(data)

    def batch(self) -> FakeWriteBatch:
        return FakeWriteBatch(self)


class StockPageViewTest(unittest.TestCase):
    def test_doc_id_and_market_derivation(self) -> None:
        self.assertEqual(stock_page_view_doc_id("US", "US_AAPL"), "US__US_AAPL")
        self.assertEqual(stock_page_view_doc_id("", "IN_RELIANCE"), "IN__IN_RELIANCE")
        self.assertEqual(market_for_instrument_id("US_KO"), "US")

    def test_section_stamp_prefers_source_fields(self) -> None:
        self.assertEqual(section_stamp({"generated_at": "2026-01-02"}), "2026-01-02")
        self.assertEqual(section_stamp({"captured_at": "2026-01-03"}), "2026-01-03")
        self.assertIsNone(section_stamp({}))
        self.assertIsNone(section_stamp(None))

    def test_merge_writes_flat_sections_with_stamps(self) -> None:
        db = FakeDb()
        merge_stock_view_sections(
            db,
            "US",
            "US_AAPL",
            {
                "facts": {"instrument_id": "US_AAPL", "generated_at": "2026-01-02T00:00:00Z"},
                "peers": {"better": [], "rows": []},
            },
        )
        doc = db.docs["tm_stock_page_views/US__US_AAPL"]
        self.assertEqual(doc["instrument_id"], "US_AAPL")
        self.assertEqual(doc["ticker"], "AAPL")
        self.assertEqual(doc["market"], "US")
        self.assertEqual(doc["facts_stamp"], "2026-01-02T00:00:00Z")
        self.assertEqual(doc["facts"]["instrument_id"], "US_AAPL")
        self.assertTrue(doc["peers_stamp"])
        self.assertEqual(doc["peers"], {"better": [], "rows": []})
        self.assertEqual(doc["peers"], {"better": [], "rows": []})
        # Untouched sections keep their previous values; only passed sections
        # (and their stamps) appear in the doc.
        self.assertNotIn("intelligence", doc)
        self.assertNotIn("intelligence_stamp", doc)

    def test_unknown_section_raises(self) -> None:
        db = FakeDb()
        with self.assertRaises(ValueError):
            merge_stock_view_sections(db, "US", "US_AAPL", {"nope": {"a": 1}})

    def test_merge_appends_to_caller_batch(self) -> None:
        db = FakeDb()
        batch = db.batch()
        merge_stock_view_sections(db, "US", "US_KO", {"facts": {"a": 1}}, batch=batch)
        # Nothing applied yet: the caller's batch owns the commit.
        self.assertEqual(db.docs, {})
        batch.set(FakeDocumentRef(db, "tm_stock_facts/US_KO"), {"b": 2}, merge=True)
        batch.commit()
        self.assertIn("tm_stock_page_views/US__US_KO", db.docs)
        self.assertIn("tm_stock_facts/US_KO", db.docs)

    def test_empty_sections_is_noop(self) -> None:
        db = FakeDb()
        merge_stock_view_sections(db, "US", "US_AAPL", {})
        self.assertEqual(db.docs, {})


if __name__ == "__main__":
    unittest.main()
