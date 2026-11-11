"""The copy-trade simulator: fixtures with hand-computed answers, the no-look-ahead rule and the ranking."""

from __future__ import annotations

import unittest

from backend.agentdata import copy_trades as ct

CALENDAR = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08", "2024-01-09", "2024-01-10", "2024-01-11"]


def series(closes: list[float | None], calendar: list[str] = CALENDAR) -> dict:
    pairs = [(day, close) for day, close in zip(calendar, closes) if close is not None]
    return {"dates": [day for day, _ in pairs], "closes": [close for _, close in pairs]}


def book(**tickers: list[float | None]) -> ct.Closes:
    data = {"SPY": series([100, 101, 102, 103, 104, 105, 106, 107])}
    data.update({name: series(values) for name, values in tickers.items()})
    return ct.Closes(CALENDAR, data)


class SessionTests(unittest.TestCase):
    def test_trades_at_the_session_after_the_public_date(self) -> None:
        self.assertEqual(ct.session_after(CALENDAR, "2024-01-03"), 2)
        # A Saturday disclosure trades on Monday's close.
        self.assertEqual(ct.session_after(CALENDAR, "2024-01-06"), 4)
        self.assertEqual(ct.session_after(CALENDAR, "2023-12-31"), 0)
        self.assertIsNone(ct.session_after(CALENDAR, "2024-01-11"))


class TargetModeTests(unittest.TestCase):
    def test_no_look_ahead_the_jump_on_the_filing_day_is_not_captured(self) -> None:
        # A rises 50% at the close of the filing day itself. A follower could only buy the next day.
        closes = book(A=[10, 10, 15, 15, 15, 15, 15, 15])
        run = ct.simulate([{"date": "2024-01-04", "weights": {"A": 1.0}}], closes, mode="target")
        self.assertEqual(run["dates"][0], "2024-01-05")
        self.assertAlmostEqual(run["values"][-1], ct.START_VALUE)

    def test_rebalance_and_profit_attribution(self) -> None:
        # Day 1 close: buy 50/50 A and B. A doubles by day 3; on day 4 the copy moves to all B.
        closes = book(A=[10, 10, 15, 20, 20, 20, 20, 20], B=[10, 10, 10, 10, 10, 11, 12, 12])
        events = [
            {"date": "2024-01-02", "weights": {"A": 0.4, "B": 0.4}},  # scaled up to 50/50
            {"date": "2024-01-05", "weights": {"B": 0.8}},
        ]
        run = ct.simulate(events, closes, mode="target")
        # 10,000 -> A 5,000 doubles to 10,000, B flat 5,000 -> 15,000 on day 4; then all B: 10 -> 12 is +20%.
        self.assertAlmostEqual(run["values"][3 - 1], 15_000)
        self.assertAlmostEqual(run["values"][-1], 18_000)
        self.assertAlmostEqual(sum(run["pnl"].values()), 8_000)
        self.assertAlmostEqual(run["pnl"]["A"], 5_000)
        self.assertAlmostEqual(run["pnl"]["B"], 3_000)
        self.assertEqual(run["counts"]["buys"], 2)
        self.assertEqual(run["counts"]["sells"], 1)
        self.assertEqual(run["counts"]["rebalances"], 2)
        # The first purchase is not turnover; moving from 2/3 A + 1/3 B to all B trades two thirds of the book.
        self.assertAlmostEqual(run["turnover"], 2 / 3)
        self.assertFalse(run["stints"]["A"]["open"])
        self.assertAlmostEqual(run["stints"]["A"]["current_factor"], 2.0)

    def test_the_no_trading_line_keeps_the_first_portfolio(self) -> None:
        closes = book(A=[10, 10, 15, 20, 20, 20, 20, 20], B=[10, 10, 10, 10, 10, 11, 12, 12])
        events = [{"date": "2024-01-02", "weights": {"A": 0.5, "B": 0.5}}, {"date": "2024-01-05", "weights": {"B": 1.0}}]
        hold = ct.simulate(events, closes, mode="target", hold=True)
        # 5,000 in A becomes 10,000; 5,000 in B becomes 6,000.
        self.assertAlmostEqual(hold["values"][-1], 16_000)

    def test_unpriced_and_stale_names_are_skipped_and_counted(self) -> None:
        # C has no series; D last printed four sessions before the entry day.
        closes = book(A=[10] * 8, D=[5, 5, None, None, None, None, None, None])
        run = ct.simulate([{"date": "2024-01-08", "weights": {"A": 0.5, "C": 0.3, "D": 0.2}}], closes, mode="target")
        self.assertEqual(run["skipped"], ["C", "D"])
        self.assertEqual(run["priced"], ["A"])
        self.assertAlmostEqual(run["coverage"][0], 0.5)

    def test_a_series_that_stops_while_held_keeps_its_last_price(self) -> None:
        closes = book(A=[10, 10, 12, None, None, None, None, None])
        run = ct.simulate([{"date": "2024-01-02", "weights": {"A": 1.0}}], closes, mode="target")
        self.assertAlmostEqual(run["values"][-1], 12_000)

    def test_a_filing_with_nothing_priced_keeps_what_is_held(self) -> None:
        closes = book(A=[10, 10, 10, 10, 10, 10, 20, 20])
        events = [{"date": "2024-01-02", "weights": {"A": 1.0}}, {"date": "2024-01-05", "weights": {"Z": 1.0}}]
        run = ct.simulate(events, closes, mode="target")
        self.assertEqual(run["held_now"], ["A"])
        self.assertAlmostEqual(run["values"][-1], 20_000)
        self.assertEqual(run["coverage"], [1.0, 0.0])
        self.assertEqual(run["counts"]["rebalances"], 1)

    def test_nothing_priced_returns_none(self) -> None:
        self.assertIsNone(ct.simulate([{"date": "2024-01-02", "weights": {"Z": 1.0}}], book(), mode="target"))

    def test_end_index_cuts_the_record(self) -> None:
        closes = book(A=[10, 10, 11, 12, 13, 14, 15, 16])
        run = ct.simulate([{"date": "2024-01-02", "weights": {"A": 1.0}}], closes, mode="target", end_index=4)
        self.assertEqual(run["dates"][-1], "2024-01-08")
        self.assertAlmostEqual(run["values"][-1], 13_000)


class TradesModeTests(unittest.TestCase):
    def test_buys_sized_by_amount_and_a_full_sale(self) -> None:
        closes = book(A=[10, 10, 10, 20, 20, 20, 20, 20], B=[10, 10, 10, 10, 10, 10, 15, 15])
        events = [
            {"date": "2024-01-02", "ticker": "A", "side": "buy", "amount": 1_000, "partial": False},
            {"date": "2024-01-02", "ticker": "B", "side": "buy", "amount": 3_000, "partial": False},
            {"date": "2024-01-05", "ticker": "A", "side": "sell", "amount": 1_000, "partial": False},
        ]
        run = ct.simulate(events, closes, mode="trades")
        # 25% A doubles: 10,000 -> 12,500 on Jan 4. A is sold at Jan 8's close; all B then rises 50%.
        self.assertAlmostEqual(run["values"][2], 12_500)
        self.assertAlmostEqual(run["values"][-1], 18_750)
        self.assertEqual(run["held_now"], ["B"])
        self.assertEqual(run["counts"], {"buys": 2, "sells": 1, "resized": 0, "rebalances": 0, "skipped_trades": 0, "ignored_sales": 0})

    def test_partial_sale_and_a_sale_of_something_never_bought(self) -> None:
        closes = book(A=[10] * 8)
        events = [
            {"date": "2024-01-02", "ticker": "A", "side": "buy", "amount": 4_000, "partial": False},
            {"date": "2024-01-03", "ticker": "A", "side": "sell", "amount": 1_000, "partial": True},
            {"date": "2024-01-03", "ticker": "Q", "side": "sell", "amount": 1_000, "partial": False},
        ]
        run = ct.simulate(events, closes, mode="trades")
        self.assertEqual(run["held_now"], ["A"])
        self.assertEqual(run["counts"]["ignored_sales"], 1)
        self.assertEqual(run["counts"]["sells"], 1)

    def test_cash_until_the_next_buy_earns_nothing(self) -> None:
        closes = book(A=[10, 10, 11, 11, 11, 11, 11, 11], B=[10, 10, 10, 10, 10, 10, 10, 20])
        events = [
            {"date": "2024-01-02", "ticker": "A", "side": "buy", "amount": 1_000, "partial": False},
            {"date": "2024-01-03", "ticker": "A", "side": "sell", "amount": 1_000, "partial": False},
            {"date": "2024-01-08", "ticker": "B", "side": "buy", "amount": 1_000, "partial": False},
        ]
        run = ct.simulate(events, closes, mode="trades")
        # +10% on A, then cash through Jan 9, then B doubles on Jan 11.
        self.assertAlmostEqual(run["values"][-1], 22_000)
        self.assertEqual(run["cash_days"], 3)

    def test_hold_ignores_sales(self) -> None:
        closes = book(A=[10, 10, 10, 20, 20, 20, 20, 20])
        events = [
            {"date": "2024-01-02", "ticker": "A", "side": "buy", "amount": 1_000, "partial": False},
            {"date": "2024-01-02", "ticker": "A", "side": "sell", "amount": 1_000, "partial": False},
        ]
        self.assertAlmostEqual(ct.simulate(events, closes, mode="trades", hold=True)["values"][-1], 20_000)

    def test_congress_events_start_with_the_first_buy_and_need_a_ticker(self) -> None:
        trades = [
            {"ticker": "A", "tx_type": "sell", "disclosure_date": "2024-01-02", "transaction_date": "2023-12-20", "est_amount": 8000},
            {"ticker": "", "tx_type": "buy", "disclosure_date": "2024-01-03", "transaction_date": "2023-12-21", "est_amount": 8000},
            {"ticker": "B", "tx_type": "sell", "disclosure_date": "2024-01-04", "transaction_date": "2023-12-22", "est_amount": 8000},
            {"ticker": "B", "tx_type": "buy", "disclosure_date": "2024-01-04", "transaction_date": "2023-12-22", "est_amount": 8000, "company": "Bee"},
        ]
        events, names = ct.congress_events(trades)
        # Same day and trade date: the buy goes first, then the sale.
        self.assertEqual([(event["ticker"], event["side"]) for event in events], [("B", "buy"), ("B", "sell")])
        self.assertEqual(names, {"A": "", "B": "Bee"})
        # Only the disclosure date is ever used, never the trade date.
        self.assertEqual({event["date"] for event in events}, {"2024-01-04"})


class StatsTests(unittest.TestCase):
    def test_drawdown_with_its_dates(self) -> None:
        fall = ct.drawdown(["a", "b", "c", "d"], [100, 120, 90, 130])
        self.assertAlmostEqual(fall["value"], -0.25)
        self.assertEqual((fall["peak"], fall["trough"]), ("b", "c"))

    def test_annualized_needs_a_year(self) -> None:
        self.assertIsNone(ct.annualized(0.1, "2024-01-01", "2024-06-01"))
        self.assertAlmostEqual(ct.annualized(0.21, "2022-01-01", "2024-01-01"), 0.1, places=3)

    def test_yearly_marks_partial_years(self) -> None:
        rows = ct.yearly(["2023-11-01", "2023-12-29", "2024-06-03"], [100, 110, 121])
        self.assertEqual(rows[0]["year"], 2023)
        self.assertEqual(rows[0]["from"], "2023-11-01")
        self.assertAlmostEqual(rows[0]["values"][0], 0.1)
        self.assertEqual(rows[1]["to"], "2024-06-03")
        self.assertAlmostEqual(rows[1]["values"][0], 0.1)


class CacheTests(unittest.TestCase):
    def test_a_fund_without_the_13f_cache_is_detected(self) -> None:
        import tempfile
        from pathlib import Path
        from unittest import mock

        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "111").mkdir()
            with mock.patch.object(ct, "_FILING_CACHE", Path(folder)):
                self.assertTrue(ct.has_filing_cache({"cik": [222, 111]}))
                self.assertFalse(ct.has_filing_cache({"cik": 333}))
                self.assertEqual(ct.fund_timeline({"cik": 333}), [])


class RankingTests(unittest.TestCase):
    def record(self, **overrides) -> dict:
        base = {"kind": "fund", "sessions": 600, "stopped": False, "excess_per_year": 0.02, "trades": {"rebalances": 8, "buys": 20}, "coverage": {"weight_avg": 0.9}}
        base.update(overrides)
        return base

    def test_eligibility_reasons_and_groups(self) -> None:
        self.assertEqual(ct.eligibility(self.record()), (True, None, None))
        self.assertEqual(ct.eligibility(self.record(sessions=400)), (False, "less than two years of record", "short"))
        self.assertEqual(ct.eligibility(self.record(stopped=True, end_date="2024-12-11")), (False, "the record ended in December 2024", "ended"))
        self.assertEqual(ct.eligibility(self.record(coverage={"weight_avg": 0.3}))[1:], ("we could price less than half of its portfolio", "untested"))
        self.assertEqual(ct.eligibility(self.record(kind="congress", trades={"rebalances": 0, "buys": 3}))[1], "fewer than five buys we could copy")

    def test_rank_rows_orders_by_excess_and_ranks_per_kind(self) -> None:
        rows = [
            {"slug": "a", "name": "A", "kind": "fund", "eligible": True, "excess_per_year": -0.01},
            {"slug": "b", "name": "B", "kind": "fund", "eligible": True, "excess_per_year": 0.03},
            {"slug": "c", "name": "C", "kind": "congress", "eligible": True, "excess_per_year": 0.05},
            {"slug": "d", "name": "D", "kind": "fund", "eligible": False, "excess_per_year": 0.5},
            {"slug": "aa", "name": "Zed", "kind": "fund", "eligible": True, "excess_per_year": -0.01},
        ]
        ranked = ct.rank_rows(rows)
        # Ties break on the slug, the same as rankRows in lib/copy-trades-shared.ts.
        self.assertEqual([row["slug"] for row in ranked], ["c", "b", "a", "aa", "d"])
        self.assertEqual({row["slug"]: row["rank"] for row in ranked}, {"c": 1, "b": 1, "a": 2, "aa": 3, "d": None})


if __name__ == "__main__":
    unittest.main()
