from __future__ import annotations

import json
import math
import random
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from backend import call_engine as ce
from backend.agentdata import call_scores
from backend.agentdata.store import WRITABLE_PREFIXES, _check_writable


def weekdays(n: int, end: str = "2026-11-09") -> list[str]:
    out: list[str] = []
    day = date.fromisoformat(end)
    while len(out) < n:
        if day.weekday() < 5:
            out.append(day.isoformat())
        day -= timedelta(days=1)
    return out[::-1]


DATES = weekdays(420)
LAST = DATES[-1]


def walk(seed: int, drift: float = 0.0004, vol: float = 0.015) -> list[float]:
    rng = random.Random(seed)
    out = [50.0 + seed % 40]
    for _ in range(len(DATES) - 1):
        out.append(out[-1] * math.exp(drift + rng.gauss(0, vol)))
    return out


def fund_doc(seed: int) -> dict:
    """Three fiscal years of annual facts plus the latest quarter, filed in the past."""
    rng = random.Random(1000 + seed)
    scale = 1000.0 * (1 + seed % 7)
    facts: dict[str, list] = {name: [] for name in ("revenue", "gross_profit", "operating_income", "net_income", "operating_cash_flow", "capex", "assets", "equity", "shares_cover")}
    for year in (2023, 2024, 2025):
        filed = f"{year + 1}-02-15"
        income = scale * rng.uniform(0.05, 0.2)
        facts["revenue"].append([f"{year}-01-01", f"{year}-12-31", scale * rng.uniform(1.0, 2.0), filed])
        facts["gross_profit"].append([f"{year}-01-01", f"{year}-12-31", scale * rng.uniform(0.3, 0.8), filed])
        facts["operating_income"].append([f"{year}-01-01", f"{year}-12-31", scale * rng.uniform(0.1, 0.3), filed])
        facts["net_income"].append([f"{year}-01-01", f"{year}-12-31", income, filed])
        facts["operating_cash_flow"].append([f"{year}-01-01", f"{year}-12-31", income * rng.uniform(0.5, 1.8), filed])
        facts["capex"].append([f"{year}-01-01", f"{year}-12-31", scale * 0.05, filed])
        facts["assets"].append([None, f"{year}-12-31", scale * rng.uniform(2.0, 3.0), filed])
        facts["equity"].append([None, f"{year}-12-31", scale, filed])
        facts["shares_cover"].append([None, f"{year + 1}-01-31", 100.0 * rng.uniform(0.97, 1.03), filed])
    # nine months of 2026, so the trailing year ends 2026-09-30
    for name in ("revenue", "gross_profit", "operating_income", "net_income", "operating_cash_flow", "capex"):
        annual = facts[name][-1][2]
        facts[name].append(["2025-01-01", "2025-09-30", annual * 0.74, "2025-11-01"])
        facts[name].append(["2026-01-01", "2026-09-30", annual * 0.74 * rng.uniform(0.9, 1.3), "2026-11-02"])
        facts[name].sort(key=lambda row: row[3])
    facts["assets"].append([None, "2026-09-30", scale * 2.6, "2026-11-02"])
    return {"symbol": f"S{seed}", "sic": "3571", "facts": facts, "earnings_dates": ["2026-07-30", DATES[-6]]}


def universe(n: int = 130) -> dict:
    prices = {"SPY": {"dates": DATES, "closes": walk(9999, 0.0003, 0.008)}}
    funds, rows = {}, {}
    for i in range(n):
        symbol = f"S{i}"
        prices[symbol] = {"dates": DATES, "closes": walk(i)}
        funds[symbol] = fund_doc(i)
        rows[symbol] = {"symbol": symbol, "sector": ("Technology", "Financials", "Energy")[i % 3], "market_cap": 5e9 * (1 + i % 11), "target": None}
    return {"prices": prices, "funds": funds, "insiders": {"S1": [[LAST, LAST, "7", 10, 5.0, ""], [LAST, LAST, "8", 10, 5.0, ""], [LAST, LAST, "9", 10, 5.0, ""]]}, "rows": rows, "states": {}}


class FakeDocStore:
    def __init__(self, docs: dict[str, dict]) -> None:
        self.docs = docs
        self.written: list[tuple[str, dict]] = []

    def list(self, collection: str, limit: int = 1000) -> list[tuple[str, dict]]:
        return [(path, data) for path, data in self.docs.items() if path.split("/")[0] == collection]

    def get(self, path: str) -> dict | None:
        return self.docs.get(path)

    def get_many(self, paths: list[str]) -> dict[str, dict]:
        return {path: self.docs[path] for path in paths if path in self.docs}

    def set_many(self, docs, *, merge: bool = False) -> int:
        count = 0
        for path, data in docs:
            _check_writable(path)
            json.dumps(data)  # must be storable
            self.written.append((path, data))
            count += 1
        return count


class ScoreUniverseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.inputs = universe()
        cls.result = call_scores.score_universe(cls.inputs)

    def test_every_stock_gets_a_scorecard_and_a_rule_call(self) -> None:
        result = self.result
        self.assertEqual(result["day"], LAST)
        self.assertEqual(result["scored"], 130)
        self.assertEqual(result["skipped"], {})
        for call in result["calls"].values():
            self.assertEqual(call["version"], ce.ENGINE_VERSION)
            self.assertEqual(call["universe_size"], 130)
            self.assertEqual([row["family"] for row in call["families"]], list(ce.FAMILY_ORDER))
            self.assertGreaterEqual(call["votes"]["scored"], ce.DEFAULT_PARAMS.min_families)
            self.assertTrue(all(row["weight"] <= 0.25 for row in call["families"] if row["status"] == "scored"))
            # a first call is exactly what the rule says for today's votes and trend
            self.assertEqual(call["call"], ce.target_call(None, call["votes"], call["trend"]["up"]))
        counts = {kind: sum(1 for call in result["calls"].values() if call["call"] == kind) for kind in ("add", "hold", "trim")}
        self.assertEqual(sum(counts.values()), 130)
        self.assertGreater(counts["hold"], counts["add"])  # disagreement is the common case
        s1 = result["calls"]["S1"]["families"][-1]
        self.assertEqual((s1["family"], s1["vote"], s1["buyers_90d"]), ("insider", 1, 3))

    def test_levels_never_contradict_the_close(self) -> None:
        for call in self.result["calls"].values():
            zones, close = call["zones"], call["close"]
            self.assertEqual(zones["anchored_on"], LAST)
            self.assertEqual(zones["anchor_price"], round(close, 4))
            self.assertGreater(zones["trim_above"], close)
            if call["call"] == "trim":
                self.assertNotIn("accumulate_below", zones)
            elif zones["entry_state"] == "wait_for_pullback":
                self.assertLess(zones["accumulate_below"], close * 0.985)
            else:
                self.assertGreaterEqual(zones["accumulate_below"], close)

    def test_levels_follow_the_latest_close_inside_the_week(self) -> None:
        moved = json.loads(json.dumps({k: v for k, v in self.inputs.items() if k != "states"}))
        moved["states"] = self.result["calls"]
        for symbol in ("S5", "S6", "S7"):
            moved["prices"][symbol]["closes"][-1] *= 0.6
        again = call_scores.score_universe(moved)
        for symbol in ("S5", "S6", "S7"):
            before, after = self.result["calls"][symbol], again["calls"][symbol]
            self.assertEqual(after["call"], before["call"])  # same week: the call holds
            self.assertAlmostEqual(after["zones"]["anchor_price"], round(after["close"], 4))
            self.assertLess(after["zones"]["trim_above"], before["zones"]["trim_above"])
            self.assertGreater(after["zones"]["trim_above"], after["close"])

    def test_same_week_rerun_keeps_the_call(self) -> None:
        again = call_scores.score_universe({**self.inputs, "states": self.result["calls"]})
        for symbol, call in again["calls"].items():
            first = self.result["calls"][symbol]
            self.assertEqual(call["call"], first["call"])
            self.assertEqual(call["zones"], first["zones"])
            self.assertEqual(call["change_log"], first["change_log"])
            self.assertFalse(call["changed"])

    def test_daily_record_keeps_raw_inputs_and_family_results(self) -> None:
        record = self.result["records"]["S5"]
        self.assertEqual(record["day"], LAST)
        self.assertEqual(record["engine_version"], ce.ENGINE_VERSION)
        for name in ("momentum_12_1", "low_accruals", "earnings_yield", "return_on_assets", "low_volatility"):
            self.assertIn(name, record["raw_factors"])
        self.assertEqual(set(record["families"]), set(ce.FAMILY_ORDER))
        self.assertIn("percentile", record["families"]["quality"])
        self.assertEqual(record["fundamentals_filed"], "2026-11-02")
        self.assertEqual(record["fundamentals_period_end"], "2026-09-30")
        self.assertEqual(record["model"], "standard")
        self.assertEqual(self.result["records"]["S1"]["insider_buyers_90d"], 3)
        json.dumps(record)

    def test_banks_reits_and_funds_get_their_own_treatment(self) -> None:
        inputs = universe()
        inputs["funds"]["S2"] = {**inputs["funds"]["S2"], "sic": "6021"}
        inputs["funds"]["S4"] = {**inputs["funds"]["S4"], "sic": "6798"}
        inputs["rows"]["S4"]["sector"] = "Technology"   # the screener's label is not used for a REIT
        inputs["funds"]["S8"] = {**inputs["funds"]["S8"], "sic": "6221"}
        result = call_scores.score_universe(inputs)
        bank, reit = result["calls"]["S2"], result["calls"]["S4"]
        self.assertEqual((bank["model"], bank["peer_group"]), ("financial", "Banks"))
        self.assertEqual((reit["model"], reit["peer_group"]), ("reit", "REITs"))
        for call in (bank, reit):
            accruals = next(row for row in call["families"] if row["family"] == "accruals")
            self.assertEqual(accruals["status"], "not_scored")
            self.assertEqual(call["votes"]["scored"], 5)
        self.assertNotIn("S8", result["calls"])
        self.assertIn("not an operating company", result["skipped"]["S8"])

    def test_unscored_stocks_say_why(self) -> None:
        inputs = universe()
        inputs["funds"]["S3"] = {"symbol": "S3", "sic": "3571", "facts": {k: [row for row in v if row[3] < "2025-01-01"] for k, v in inputs["funds"]["S3"]["facts"].items()}}
        inputs["funds"]["S4"] = {"facts": {}, "earnings_dates": []}
        del inputs["prices"]["S6"]
        result = call_scores.score_universe(inputs)
        self.assertNotIn("S3", result["calls"])
        self.assertIn("stale", result["skipped"]["S3"])
        self.assertIn("no SEC filing was known", result["skipped"]["S4"])
        self.assertIn("no price history", result["skipped"]["S6"])
        self.assertEqual(result["scored"], 127)

    def test_market_cap_falls_back_to_filed_shares(self) -> None:
        inputs = universe()
        del inputs["rows"]["S7"]
        result = call_scores.score_universe(inputs)
        record = result["records"]["S7"]
        shares = inputs["funds"]["S7"]["facts"]["shares_cover"][-1][2]
        self.assertAlmostEqual(record["market_cap"], shares * record["close"])
        self.assertIn("earnings_yield", record["raw_factors"])

    def test_too_small_a_universe_is_refused(self) -> None:
        small = universe(20)
        with self.assertRaises(ValueError):
            call_scores.score_universe(small)
        with self.assertRaises(ValueError):
            call_scores.score_universe({**small, "prices": {k: v for k, v in small["prices"].items() if k != "SPY"}})


class StoreIoTest(unittest.TestCase):
    def test_load_from_store_and_write(self) -> None:
        inputs = universe()
        docs: dict[str, dict] = {}
        for symbol, series in inputs["prices"].items():
            docs[f"tm_price_history_daily/{symbol}"] = {"symbol": symbol, **series}
        for symbol, doc in inputs["funds"].items():
            docs[f"tm_fundamentals_pit/{symbol}"] = doc
        docs["tm_insider_buy_history/S1"] = {"symbol": "S1", "rows": inputs["insiders"]["S1"][:1]}
        docs["tm_insider_trades/a"] = {"symbol": "S1", "tx_type": "buy", "filing_date": LAST, "transaction_date": LAST, "insider_id": "0008", "shares": 1, "price": 2}
        docs["tm_insider_trades/b"] = {"symbol": "S1", "tx_type": "sell", "filing_date": LAST, "insider_id": "0009"}
        docs["tm_insider_trades/c"] = {"symbol": "S1", "tx_type": "buy", "plan_10b5_1": True, "filing_date": LAST, "insider_id": "0010"}
        docs["tm_screener_snapshot/US"] = {"shards": ["US__0"], "extra_shard": "US__extra"}
        docs["tm_screener_snapshot/US__0"] = {"rows": list(inputs["rows"].values())[:100]}
        docs["tm_screener_snapshot/US__extra"] = {"rows": list(inputs["rows"].values())[100:]}
        store = FakeDocStore(docs)
        loaded = call_scores.load_from_store(store)
        self.assertEqual(len(loaded["prices"]), 131)
        self.assertEqual(len(loaded["rows"]), 130)
        self.assertEqual([row[2] for row in loaded["insiders"]["S1"]], ["7", "8"])  # history plus the live feed's open-market buy
        self.assertEqual(loaded["states"], {})

        result = call_scores.score_universe(loaded)
        counts = call_scores.write(store, result)
        self.assertEqual(counts, {"state": 130, "daily": 130})
        collections = {path.split("/")[0] for path, _ in store.written}
        self.assertEqual(collections, {"tm_call_engine_state", "tm_call_engine_daily"})
        self.assertIn(f"tm_call_engine_daily/S5__{LAST}", {path for path, _ in store.written})
        self.assertIn("scored 130 of 130", call_scores.summary(result))

        # the next run continues from what was written
        for path, data in store.written:
            store.docs[path] = data
        again = call_scores.load_from_store(store)
        self.assertEqual(len(again["states"]), 130)

    def test_new_collections_are_writable_and_others_are_not(self) -> None:
        for path in ("tm_call_engine_state/NVDA", "tm_call_engine_daily/NVDA__2026-11-09", "tm_fundamentals_pit/NVDA", "tm_insider_buy_history/NVDA"):
            _check_writable(path)
        for path in ("tm_news_runs/x", "tm_directive_history/x", "users/x"):
            with self.assertRaises(ValueError):
                _check_writable(path)
        self.assertIn("tm_call_engine_", WRITABLE_PREFIXES)

    def test_load_from_dir(self) -> None:
        inputs = universe(3)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sec").mkdir()
            (root / "prices.json").write_text(json.dumps(inputs["prices"]))
            for symbol, doc in inputs["funds"].items():
                (root / "sec" / f"{symbol}.json").write_text(json.dumps(doc))
            (root / "sec" / "_company_tickers.json").write_text("{}")
            loaded = call_scores.load_from_dir(root)
        self.assertEqual(sorted(loaded["funds"]), ["S0", "S1", "S2"])
        self.assertEqual(loaded["rows"], {})
        self.assertEqual(loaded["states"], {})


if __name__ == "__main__":
    unittest.main()
