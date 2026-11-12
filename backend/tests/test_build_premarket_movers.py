from __future__ import annotations

import re
import unittest
from pathlib import Path

from backend.scripts.build_premarket_movers import (
    EXAMPLE_PORTFOLIO_TICKERS,
    REFERENCE_TICKERS,
    _canonicalize_row,
    candidate_instruments,
    candidate_tickers,
    fetch_quotes_in_batches,
    user_book_tickers,
)

REPO = Path(__file__).resolve().parents[2]


class BuildPremarketMoversTest(unittest.TestCase):
    def test_canonicalize_row_prefers_current_universe_ticker_mapping(self) -> None:
        candidates = {
            "US_WRONG": {
                "instrument_id": "US_WRONG",
                "ticker": "CBRS",
                "name": "Airbnb, Inc.",
                "sector": "Consumer Cyclical",
                "logo_url": "",
            }
        }
        by_ticker = {
            "SMCI": {
                "instrument_id": "US_SMCI",
                "ticker": "SMCI",
                "name": "Super Micro Computer Inc.",
                "sector": "Technology",
                "logo_url": "",
            }
        }
        by_id = {row["instrument_id"]: row for row in by_ticker.values()}
        quote = {
            "ticker": "SMCI",
            "pre_market_price": 49.63,
            "previous_close": 47.27,
            "pre_market_change_pct": 5.0,
        }

        row = _canonicalize_row(
            instrument_id="US_WRONG",
            quote=quote,
            candidates=candidates,
            by_ticker=by_ticker,
            by_id=by_id,
        )

        assert row is not None
        self.assertEqual(row["instrument_id"], "US_SMCI")
        self.assertEqual(row["name"], "Super Micro Computer Inc.")
        self.assertEqual(row["ticker"], "SMCI")

    def test_canonicalize_row_drops_unsupported_ticker(self) -> None:
        row = _canonicalize_row(
            instrument_id="US_CBRS",
            quote={
                "ticker": "CBRS",
                "pre_market_price": 232.54,
                "previous_close": 218.55,
                "pre_market_change_pct": 6.4,
            },
            candidates={},
            by_ticker={},
            by_id={},
        )
        self.assertIsNone(row)



CATALOG = {
    "AAPL": {"instrument_id": "US_AAPL", "ticker": "AAPL", "market": "US", "name": "Apple"},
    "BRK.B": {"instrument_id": "US_BRK_B", "ticker": "BRK.B", "market": "US", "name": "Berkshire Hathaway"},
    "MSFT": {"instrument_id": "US_MSFT", "ticker": "MSFT", "market": "US", "name": "Microsoft"},
}
CATALOG_BY_ID = {row["instrument_id"]: row for row in CATALOG.values()}


class CandidateSetTest(unittest.TestCase):
    def test_example_list_matches_the_web_apps_example_portfolio(self) -> None:
        source = (REPO / "lib" / "portfolio-data.ts").read_text(encoding="utf-8")
        block = source[source.index("const EXAMPLE: Array<") :]
        block = block[: block.index("];")]
        self.assertEqual(sorted(set(re.findall(r'ticker: "([A-Z.]+)"', block))), sorted(set(EXAMPLE_PORTFOLIO_TICKERS)))

    def test_holdings_rank_by_how_many_users_hold_them_and_win_over_watching(self) -> None:
        users = [
            {"tracked_stocks": ["US_AAPL", "US_CBRS", "US_MSFT"], "watchlist_positions": {"US_AAPL": "holding", "US_CBRS": "holding", "US_MSFT": "watchlist"}},
            {"tracked_stocks": ["US_CBRS", "US_BRK_B", "IN_TCS"], "watchlist_positions": {"US_CBRS": "holding", "US_BRK_B": "watchlist"}},
            {"tracked_stocks": ["US_AAPL", "US_MSFT"], "watchlist_positions": {}},
            {"tracked_stocks": None, "watchlist_positions": "broken"},
        ]
        held, watched = user_book_tickers(users, "US", CATALOG_BY_ID)
        # CBRS held by two users, AAPL by one; ids outside the catalog become tickers the web app's way.
        self.assertEqual(held, ["CBRS", "AAPL"])
        # MSFT watched by two, BRK.B by one; AAPL is held by someone, so it is not listed again; IN_ ids are skipped.
        self.assertEqual(watched, ["MSFT", "BRK.B"])

    def test_priority_order_dedupe_and_cap(self) -> None:
        tickers = candidate_tickers(market="US", held=["CBRS", "AAPL", "SPY"], catalysts=["MU", "aapl", ""], watched=["TSLA"], cap=600)
        fixed = list(dict.fromkeys([*REFERENCE_TICKERS, *EXAMPLE_PORTFOLIO_TICKERS]))
        self.assertEqual(tickers[: len(fixed)], fixed)
        self.assertEqual(tickers[len(fixed) :], ["CBRS", "MU", "TSLA"])
        self.assertEqual(len(tickers), len(set(tickers)))

        capped = candidate_tickers(market="US", held=[f"H{i}" for i in range(700)], catalysts=["MU"], watched=["TSLA"], cap=600)
        self.assertEqual(len(capped), 600)
        # Holdings fill the cap before catalysts and watched names.
        self.assertNotIn("MU", capped)
        self.assertIn("H0", capped)

    def test_reference_and_example_names_are_us_only(self) -> None:
        self.assertEqual(candidate_tickers(market="IN", held=["TCS"], catalysts=[], watched=[]), ["TCS"])

    def test_names_outside_the_catalog_are_quote_only_in_the_us(self) -> None:
        instruments, quote_only = candidate_instruments(["SPY", "AAPL", "BRK.B", "AAPL"], market="US", by_ticker=CATALOG)
        self.assertEqual([row["instrument_id"] for row in instruments], ["US_SPY", "US_AAPL", "US_BRK_B"])
        self.assertEqual(quote_only, {"US_SPY"})
        self.assertEqual(instruments[0]["ticker"], "SPY")
        in_instruments, in_quote_only = candidate_instruments(["TCS"], market="IN", by_ticker={})
        self.assertEqual((in_instruments, in_quote_only), ([], set()))

    def test_quotes_come_in_batches_with_a_pause_and_a_failed_batch_costs_only_its_names(self) -> None:
        instruments = [{"instrument_id": f"US_T{i}", "ticker": f"T{i}"} for i in range(7)]
        calls: list[list[str]] = []
        pauses: list[float] = []

        def fetch(batch: list[dict], *, max_workers: int) -> dict:
            calls.append([row["ticker"] for row in batch])
            if batch[0]["ticker"] == "T3":
                raise RuntimeError("429")
            return {row["instrument_id"]: {"ticker": row["ticker"]} for row in batch}

        quotes = fetch_quotes_in_batches(instruments, max_workers=2, batch_size=3, pause_s=1.5, fetch=fetch, sleep=pauses.append)
        self.assertEqual(calls, [["T0", "T1", "T2"], ["T3", "T4", "T5"], ["T6"]])
        self.assertEqual(pauses, [1.5, 1.5])
        self.assertEqual(sorted(quotes), ["US_T0", "US_T1", "US_T2", "US_T6"])


if __name__ == "__main__":
    unittest.main()
