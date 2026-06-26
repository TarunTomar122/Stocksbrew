from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.premarket_tape_llm import enrich_context_with_tape_lines


class PremarketTapeLlmTests(unittest.TestCase):
    def test_enrich_context_uses_llm_tape_line(self) -> None:
        store = MagicMock()
        store.get_llm_enrichment.return_value = None
        by_ticker = {
            "MU": {
                "headline": "Micron Technology, Inc. $MU Shares Sold by Parkway Wealth Management",
                "why": "Institutional filing mention.",
            }
        }
        with patch("backend.premarket_tape_llm._llm_batch_lines") as llm_batch:
            llm_batch.return_value = {
                "MU": "Micron is sliding pre-market as memory-chip sentiment cools after recent gains.",
            }
            enrich_context_with_tape_lines(
                store,
                market="US",
                by_ticker=by_ticker,
                company_by_ticker={"MU": "Micron"},
                gap_by_ticker={"MU": -5.4},
            )
        self.assertIn("sliding pre-market", by_ticker["MU"]["tape_line"])
        store.save_llm_enrichment.assert_called()

    def test_enrich_context_uses_cache_when_present(self) -> None:
        store = MagicMock()
        store.get_llm_enrichment.return_value = {"tape_line": "Cached tape line."}
        by_ticker = {"AAPL": {"headline": "SEO headline", "why": "detail"}}
        with patch("backend.premarket_tape_llm._llm_batch_lines") as llm_batch:
            enrich_context_with_tape_lines(store, market="US", by_ticker=by_ticker)
        self.assertEqual(by_ticker["AAPL"]["tape_line"], "Cached tape line.")
        llm_batch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
