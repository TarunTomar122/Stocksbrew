from __future__ import annotations

import unittest

from backend.scripts.build_context_intelligence import _save_contextual_stock_docs


class BuildContextIntelligenceTest(unittest.TestCase):
    def test_scoped_contextual_stock_docs_are_upserted(self) -> None:
        class Store:
            def __init__(self) -> None:
                self.calls: list[tuple[str, str, str, list[dict]]] = []

            def upsert_stock_intelligence_docs(self, market: str, universe: str, docs: list[dict]) -> None:
                self.calls.append(("upsert", market, universe, docs))

            def save_stock_intelligence_docs(self, market: str, universe: str, docs: list[dict]) -> None:
                self.calls.append(("replace", market, universe, docs))

        store = Store()

        _save_contextual_stock_docs(
            store,  # type: ignore[arg-type]
            "US",
            "us_core_100",
            [{"instrument_id": "US_CRK"}],
            scoped=True,
        )

        self.assertEqual(store.calls, [("upsert", "US", "us_core_100", [{"instrument_id": "US_CRK"}])])

    def test_full_contextual_stock_docs_replace_collection(self) -> None:
        class Store:
            def __init__(self) -> None:
                self.calls: list[tuple[str, str, str, list[dict]]] = []

            def upsert_stock_intelligence_docs(self, market: str, universe: str, docs: list[dict]) -> None:
                self.calls.append(("upsert", market, universe, docs))

            def save_stock_intelligence_docs(self, market: str, universe: str, docs: list[dict]) -> None:
                self.calls.append(("replace", market, universe, docs))

        store = Store()

        _save_contextual_stock_docs(
            store,  # type: ignore[arg-type]
            "US",
            "us_core_100",
            [{"instrument_id": "US_CRK"}],
            scoped=False,
        )

        self.assertEqual(store.calls, [("replace", "US", "us_core_100", [{"instrument_id": "US_CRK"}])])


if __name__ == "__main__":
    unittest.main()
