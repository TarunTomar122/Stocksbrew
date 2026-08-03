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
        by_ticker = {"AAPL": {"headline": "Apple raises iPhone prices", "why": "Apple confirmed the change."}}
        with patch("backend.premarket_tape_llm._llm_batch_lines") as llm_batch:
            enrich_context_with_tape_lines(
                store,
                market="US",
                by_ticker=by_ticker,
                company_by_ticker={"AAPL": "Apple"},
            )
        self.assertEqual(by_ticker["AAPL"]["tape_line"], "Cached tape line.")
        llm_batch.assert_not_called()

    def test_enrich_context_batches_a_full_mover_set_in_one_call(self) -> None:
        by_ticker = {
            f"T{idx}": {"headline": f"T{idx} reports results", "why": f"T{idx} detail"}
            for idx in range(35)
        }
        with patch("backend.premarket_tape_llm._llm_batch_lines") as llm_batch:
            llm_batch.side_effect = lambda items: {
                item["ticker"]: f"Tape line for {item['ticker']}." for item in items
            }
            enrich_context_with_tape_lines(None, market="US", by_ticker=by_ticker)

        llm_batch.assert_called_once()
        self.assertEqual(len(llm_batch.call_args.args[0]), 35)

    def test_enrich_context_respects_an_empty_line_for_wrong_company_input(self) -> None:
        by_ticker = {
            "PLTR": {
                "headline": "Palantir mentioned alongside an unrelated event",
                "why": "Palantir had no confirmed company-specific catalyst.",
            }
        }
        with patch("backend.premarket_tape_llm._llm_batch_lines") as llm_batch:
            llm_batch.return_value = {"PLTR": ""}
            enrich_context_with_tape_lines(
                None,
                market="US",
                by_ticker=by_ticker,
                company_by_ticker={"PLTR": "Palantir Technologies"},
            )

        self.assertNotIn("tape_line", by_ticker["PLTR"])


if __name__ == "__main__":
    unittest.main()
