import unittest

from backend.scripts import register_fund_instruments as reg

NOW = "2026-11-12T03:00:00+00:00"


class FundRowsTests(unittest.TestCase):
    def test_popular_names_win_and_confirmed_funds_are_added(self) -> None:
        meta = {"funds": {"VOO": {"name": "Vanguard 500 Index Fund"}, "fxaix": {"name": "Fidelity 500 Index Fund"}, "BAD": "x"}}
        rows = reg.fund_rows(meta)
        by_ticker = {row["ticker"]: row for row in rows}
        self.assertEqual(by_ticker["VOO"]["name"], "Vanguard S&P 500 ETF")
        self.assertEqual(by_ticker["FXAIX"]["name"], "Fidelity 500 Index Fund")
        self.assertNotIn("BAD", by_ticker)
        self.assertEqual(len(rows), len(by_ticker))


class PlanTests(unittest.TestCase):
    def test_never_touches_an_existing_instrument(self) -> None:
        rows = [{"ticker": "SCHD", "name": "Schwab U.S. Dividend Equity ETF", "exchange": "NYSE Arca"}, {"ticker": "VOO", "name": "Vanguard S&P 500 ETF", "exchange": "NYSE Arca"}]
        existing = {"US_SCHD": {"instrument_id": "US_SCHD", "ticker": "SCHD", "name": "SCHD", "source": "stock_request_auto"}}
        todo = reg.plan(rows, existing, indexed={"US_SCHD"}, priced={"US_SCHD"}, now=NOW)
        self.assertEqual([record["instrument_id"] for record in todo["create"]], ["US_VOO"])
        created = todo["create"][0]
        self.assertEqual(created["asset_type"], "fund")
        self.assertEqual(created["market"], "US")
        self.assertEqual(created["status"], "active")
        self.assertEqual(created["sector"], "")
        # The existing record is indexed as it is, not rewritten with our name.
        self.assertEqual([row["instrument_id"] for row in todo["index"]], ["US_VOO"])
        self.assertEqual(todo["price"], ["US_VOO"])

    def test_existing_but_unindexed_fund_gets_a_search_entry_from_its_own_record(self) -> None:
        rows = [{"ticker": "QQQ", "name": "Invesco QQQ Trust", "exchange": "NASDAQ"}]
        existing = {"US_QQQ": {"instrument_id": "US_QQQ", "ticker": "QQQ", "name": "Invesco QQQ Trust, Series 1"}}
        todo = reg.plan(rows, existing, indexed=set(), priced={"US_QQQ"}, now=NOW)
        self.assertEqual(todo["create"], [])
        entry = reg.search_entry(todo["index"][0], {"quote": {"current": 690.38, "day_change_pct": 0.4}, "updated_at": NOW})
        self.assertEqual(entry["name"], "Invesco QQQ Trust, Series 1")
        self.assertEqual(entry["price"], 690.38)
        self.assertEqual(todo["price"], [])

    def test_dotted_tickers_use_the_house_instrument_id(self) -> None:
        self.assertEqual(reg.instrument_id_for("brk.b"), "US_BRK_B")


class GuardTests(unittest.TestCase):
    def test_refuses_to_run_against_firebase_by_default(self) -> None:
        import os

        saved = os.environ.pop("LOCALDB_PATH", None)
        try:
            self.assertEqual(reg.main(["--dry-run"]), 2)
        finally:
            if saved is not None:
                os.environ["LOCALDB_PATH"] = saved


if __name__ == "__main__":
    unittest.main()
