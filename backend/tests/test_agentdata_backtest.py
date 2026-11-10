"""Backtest engine checks. The fixture is shared with lib/backtest/engine.test.ts."""

from __future__ import annotations

import copy
import json
import unittest

from backend.agentdata import backtest
from backend.agentdata import backtest_fixture as fixture


def _load(name: str):
    return json.loads((fixture.FIXTURE_DIR / name).read_text())


class FixtureParityTest(unittest.TestCase):
    """Python must reproduce expected.json; the TypeScript engine is held to the same file."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.panel = _load("panel.json")
        cls.cases = _load("cases.json")
        cls.expected = _load("expected.json")

    def test_stored_panel_is_the_generated_panel(self) -> None:
        self.assertEqual(self.panel, json.loads(json.dumps(fixture.build_panel())))
        self.assertEqual(self.cases, json.loads(json.dumps(fixture.build_cases())))

    def test_backtests_match_expected(self) -> None:
        for case in self.cases["backtests"]:
            with self.subTest(case=case["name"]):
                result = backtest.run_backtest(case["spec"], fixture.case_data(self.panel, case))
                digest = json.loads(json.dumps(fixture.digest(result)))
                self.assertEqual(digest, self.expected["backtests"][case["name"]])

    def test_weights_match_expected(self) -> None:
        for case in self.cases["weights"]:
            with self.subTest(case=case["name"]):
                result = backtest.run_weights_backtest(case["input"], self.panel["prices"])
                digest = json.loads(json.dumps(fixture.digest_weights(result)))
                self.assertEqual(digest, self.expected["weights"][case["name"]])

    def test_picks_match_expected(self) -> None:
        for case in self.cases["picks"]:
            with self.subTest(case=case["name"]):
                picks = backtest.current_picks(case["spec"], fixture.case_data(self.panel, case))
                self.assertEqual(json.loads(json.dumps(picks)), self.expected["picks"][case["name"]])


class EngineRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.panel = fixture.build_panel()
        cls.cases = {case["name"]: case for case in fixture.build_cases()["backtests"]}
        cls.picks = fixture.build_cases()["picks"]

    def _run(self, name: str, *, spec_patch: dict | None = None, prices: dict | None = None) -> dict:
        case = self.cases[name]
        spec = dict(case["spec"], **(spec_patch or {}))
        data = fixture.case_data(self.panel, case)
        if prices is not None:
            data["prices"] = prices
        return backtest.run_backtest(spec, data)

    def test_no_look_ahead(self) -> None:
        cut = "2021-06-30"
        base = self._run("momentum")
        scrambled = copy.deepcopy(self.panel["prices"])
        for symbol, series in scrambled.items():
            for index, day in enumerate(series["dates"]):
                if day > cut:
                    series["closes"][index] *= 1 + ((index * 7 + ord(symbol[0])) % 13) / 20
        changed = self._run("momentum", prices=scrambled)

        keep = len([day for day in base["curve"]["dates"] if day <= cut])
        self.assertGreater(keep, 100)
        self.assertEqual(changed["curve"]["strategy"][:keep], base["curve"]["strategy"][:keep])
        before = [r for r in base["rebalances"] if r["signal_date"] <= cut]
        self.assertGreater(len(before), 10)
        self.assertEqual(
            [r["holdings"] for r in changed["rebalances"][: len(before)]],
            [r["holdings"] for r in before],
        )
        self.assertNotEqual(changed["curve"]["strategy"][-1], base["curve"]["strategy"][-1])

    def test_trades_fill_the_session_after_the_signal(self) -> None:
        result = self._run("momentum")
        calendar = self.panel["prices"]["SPY"]["dates"]
        for rebalance in result["rebalances"]:
            index = calendar.index(rebalance["signal_date"])
            self.assertEqual(calendar[index + 1], rebalance["trade_date"])
            self.assertNotEqual(rebalance["signal_date"][:7], rebalance["trade_date"][:7])
        self.assertEqual(result["period"]["start"], result["rebalances"][0]["trade_date"])

    def test_costs_are_on_by_default_and_lower_the_result(self) -> None:
        with_costs = self._run("momentum")
        free = self._run("momentum", spec_patch={"cost_bps": 0})
        self.assertEqual(with_costs["spec"]["cost_bps"], 10)
        self.assertGreater(with_costs["costs"]["total_drag"], 0)
        self.assertEqual(free["costs"]["total_drag"], 0)
        self.assertGreater(
            free["summary"]["strategy"]["total_return"], with_costs["summary"]["strategy"]["total_return"]
        )
        self.assertAlmostEqual(with_costs["curve"]["strategy"][0], 99.9, places=6)
        self.assertEqual(free["curve"]["strategy"][0], 100)
        self.assertEqual(with_costs["curve"]["benchmark"][0], 100)

    def test_benchmark_is_buy_and_hold(self) -> None:
        result = self._run("momentum")
        spy = dict(zip(self.panel["prices"]["SPY"]["dates"], self.panel["prices"]["SPY"]["closes"]))
        start, end = result["period"]["start"], result["period"]["end"]
        self.assertAlmostEqual(
            result["summary"]["benchmark"]["total_return"], spy[end] / spy[start] - 1, places=5
        )

    def test_a_stock_that_stops_trading_is_dropped(self) -> None:
        result = self._run("momentum")
        late = [r for r in result["rebalances"] if r["signal_date"] > "2022-04-01"]
        self.assertTrue(late)
        for rebalance in late:
            self.assertNotIn("JJJ", [h["symbol"] for h in rebalance["holdings"]])

    def test_a_late_listing_waits_for_its_lookback(self) -> None:
        result = self._run("momentum")
        first_iii = self.panel["prices"]["III"]["dates"][0]
        for rebalance in result["rebalances"]:
            if "III" in [h["symbol"] for h in rebalance["holdings"]]:
                gap = backtest.day_number(rebalance["signal_date"]) - backtest.day_number(first_iii)
                self.assertGreaterEqual(gap, 6 * 28)

    def test_weights_and_cash_add_up(self) -> None:
        for name in self.cases:
            result = self._run(name)
            for rebalance in result["rebalances"]:
                invested = sum(h["weight"] for h in rebalance["holdings"])
                self.assertAlmostEqual(invested + rebalance["cash"], 1.0, places=5)
                self.assertLessEqual(len(rebalance["holdings"]), result["spec"]["holdings"])

    def test_every_backtest_is_labelled_with_its_biases(self) -> None:
        for name, case in self.cases.items():
            result = self._run(name)
            ids = [c["id"] for c in result["caveats"]]
            self.assertEqual(ids[0], "backtest_label")
            self.assertIn("survivorship" if case["universe_kind"] == "stocks" else "fixed_funds", ids)
            for caveat in result["caveats"]:
                self.assertNotIn("{", caveat["title"] + caveat["text"])

    def test_congress_test_starts_at_the_first_filing(self) -> None:
        result = self._run("congress_net_buying")
        first_filing = min(event["date"] for event in self.panel["events"])
        self.assertGreaterEqual(result["period"]["first_signal"], first_filing)
        self.assertIn("congress_filings", [c["id"] for c in result["caveats"]])

    def test_fundamental_rules_cannot_be_backtested(self) -> None:
        case = self.picks[0]
        with self.assertRaises(backtest.BacktestError):
            backtest.run_backtest(case["spec"], fixture.case_data(self.panel, case))

    def test_spec_validation_caps_inputs(self) -> None:
        good = {"universe": {"id": "sp500"}, "rank": [{"type": "momentum"}]}
        spec = backtest.normalize_spec(good)
        self.assertEqual((spec["holdings"], spec["cost_bps"], spec["rebalance"]), (20, 10, "monthly"))
        bad = [
            dict(good, holdings=500),
            dict(good, holdings=0),
            dict(good, cost_bps=-1),
            dict(good, cost_bps=5000),
            dict(good, rebalance="daily"),
            dict(good, rank=[]),
            dict(good, rank=[{"type": "momentum", "months": 400}]),
            dict(good, rank=[{"type": "momentum", "months": 3, "skip_months": 3}]),
            dict(good, rank=[{"type": "low_volatility", "days": 100000}]),
            dict(good, rank=[{"type": "made_up"}]),
            dict(good, rank=[{"type": "momentum"}] * 9),
            dict(good, filters=[{"type": "trend"}]),
            dict(good, universe={"symbols": [f"T{i}" for i in range(200)]}),
            dict(good, universe={}),
            dict(good, start="yesterday"),
            dict(good, start="2024-02-31"),
            dict(good, holdings=float("inf")),
            "not a spec",
        ]
        for item in bad:
            with self.subTest(spec=item):
                with self.assertRaises(backtest.SpecError):
                    backtest.normalize_spec(item)


class LiveRecordTest(unittest.TestCase):
    """simulate_decisions values frozen picks: the forward record."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.prices = fixture.build_panel()["prices"]
        cls.calendar = cls.prices["SPY"]["dates"]

    def test_pending_until_a_session_follows_the_signal(self) -> None:
        decisions = [{"signal_date": self.calendar[-1], "holdings": [{"symbol": "AAA", "weight": 1.0}]}]
        self.assertIsNone(backtest.simulate_decisions(decisions, self.prices))

    def test_single_holding_tracks_its_price_after_costs(self) -> None:
        signal = self.calendar[600]
        decisions = [{"signal_date": signal, "holdings": [{"symbol": "AAA", "weight": 1.0}]}]
        live = backtest.simulate_decisions(decisions, self.prices, cost_bps=10)
        self.assertEqual(live["first_fill_date"], self.calendar[601])
        closes = dict(zip(self.prices["AAA"]["dates"], self.prices["AAA"]["closes"]))
        wanted = 0.999 * closes[self.calendar[-1]] / closes[self.calendar[601]] - 1
        self.assertAlmostEqual(live["strategy_return"], wanted, places=5)
        self.assertEqual(live["curve"]["benchmark"][0], 100)

    def test_a_later_decision_does_not_change_the_earlier_curve(self) -> None:
        first = {"signal_date": self.calendar[600], "holdings": [{"symbol": "AAA", "weight": 0.5}, {"symbol": "BBB", "weight": 0.5}]}
        second = {"signal_date": self.calendar[700], "holdings": [{"symbol": "EEE", "weight": 1.0}]}
        alone = backtest.simulate_decisions([first], self.prices)
        both = backtest.simulate_decisions([first, second], self.prices)
        self.assertEqual(both["curve"]["strategy"][:100], alone["curve"]["strategy"][:100])
        self.assertNotEqual(both["curve"]["strategy"][-1], alone["curve"]["strategy"][-1])



class WeightsBacktestTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.prices = fixture.build_panel()["prices"]

    def test_weights_are_rescaled_in_the_order_given(self) -> None:
        spec = backtest.normalize_weights_input(
            {"holdings": [{"symbol": " ddd ", "weight": 30}, {"symbol": "AAA", "weight": 10}]}
        )
        self.assertEqual(spec["holdings"], [{"symbol": "DDD", "weight": 0.75}, {"symbol": "AAA", "weight": 0.25}])
        self.assertEqual(spec["rebalance"], "monthly")
        self.assertEqual(spec["cost_bps"], 10)

    def test_missing_history_is_named(self) -> None:
        with self.assertRaises(backtest.MissingHistoryError) as caught:
            backtest.run_weights_backtest(
                {"holdings": [{"symbol": "AAA", "weight": 1}, {"symbol": "NOPE", "weight": 1}]}, self.prices
            )
        self.assertEqual(caught.exception.symbols, ["NOPE"])

    def test_bad_input_is_rejected(self) -> None:
        for raw in (
            {"holdings": []},
            {"holdings": [{"symbol": "AAA", "weight": 0}]},
            {"holdings": [{"symbol": "AAA", "weight": 1}, {"symbol": "aaa", "weight": 1}]},
            {"holdings": [{"symbol": "AAA", "weight": 1}], "rebalance": "daily"},
            {"holdings": [{"symbol": "AAA", "weight": 1}], "start": "2022-01-01", "end": "2021-01-01"},
        ):
            with self.assertRaises(backtest.SpecError):
                backtest.normalize_weights_input(raw)

    def test_late_listing_moves_the_start(self) -> None:
        result = backtest.run_weights_backtest(
            {"holdings": [{"symbol": "III", "weight": 1}, {"symbol": "BBB", "weight": 1}], "start": "2019-06-03"},
            self.prices,
        )
        self.assertEqual(result["limited_by"]["symbol"], "III")
        self.assertEqual(result["period"]["start"], result["limited_by"]["first_date"])
        self.assertIn("late_start", [caveat["id"] for caveat in result["caveats"]])

    def test_no_look_ahead(self) -> None:
        end = "2021-06-30"
        raw = {"holdings": [{"symbol": "AAA", "weight": 1}, {"symbol": "DDD", "weight": 1}], "end": end}
        full = backtest.run_weights_backtest(raw, self.prices)
        cut = {}
        for symbol, series in self.prices.items():
            keep = len([day for day in series["dates"] if day <= end])
            cut[symbol] = {"dates": series["dates"][:keep], "closes": series["closes"][:keep]}
        self.assertEqual(backtest.run_weights_backtest(raw, cut), full)

    def test_single_holding_tracks_its_price(self) -> None:
        result = backtest.run_weights_backtest(
            {"holdings": [{"symbol": "AAA", "weight": 1}], "rebalance": "never", "cost_bps": 0, "benchmark": "AAA"},
            self.prices,
        )
        self.assertAlmostEqual(
            result["summary"]["strategy"]["total_return"], result["summary"]["benchmark"]["total_return"], places=6
        )

    def test_costs_lower_the_result(self) -> None:
        raw = {"holdings": [{"symbol": "AAA", "weight": 1}, {"symbol": "HHH", "weight": 1}]}
        free = backtest.run_weights_backtest(dict(raw, cost_bps=0), self.prices)
        paid = backtest.run_weights_backtest(dict(raw, cost_bps=50), self.prices)
        self.assertLess(paid["summary"]["strategy"]["final_value"], free["summary"]["strategy"]["final_value"])


class PullbackSignalTest(unittest.TestCase):
    def test_pullback_is_the_fall_over_the_window(self) -> None:
        prices = {
            "SPY": {"dates": [f"2024-01-{d:02d}" for d in range(1, 31)], "closes": [100.0] * 30},
            "AAA": {"dates": [f"2024-01-{d:02d}" for d in range(1, 31)], "closes": [100.0] * 9 + [90.0] * 21},
        }
        spec = backtest.normalize_spec(
            {"universe": {"symbols": ["AAA"]}, "rank": [{"type": "pullback", "days": 21}], "holdings": 1}
        )
        panel = backtest.Panel(spec, {"prices": prices, "universe": ["AAA"]})
        value = backtest.signal_value(spec["rank"][0], "AAA", 29, panel)
        self.assertAlmostEqual(value, 0.1, places=9)



class StrategyJobTest(unittest.TestCase):
    """The publishing job in backtest_strategies.py, run on the synthetic panel."""

    @classmethod
    def setUpClass(cls) -> None:
        from backend.agentdata import backtest_strategies as job

        cls.job = job
        panel = fixture.build_panel()
        cls.prices = panel["prices"]
        cls.data = {
            "prices": panel["prices"],
            "size_factors": panel["size_factors"],
            "events": [],
            "fundamentals": panel["fundamentals"],
        }
        cls.group = {
            "id": "test",
            "label": "test companies",
            "description": "twelve made-up companies",
            "kind": "stocks",
            "partial": True,
            "symbols": sorted(symbol for symbol in panel["prices"] if symbol != "SPY"),
        }
        cls.names = {symbol: f"{symbol} Inc." for symbol in panel["prices"]}

    def _definition(self, spec: dict) -> dict:
        return {
            "slug": "test",
            "name": "Test",
            "style": "Test",
            "tagline": "t",
            "summary": "s",
            "rules": ["one"],
            "watch_out": "w",
            "universe": "test",
            "spec": spec,
        }

    def _run(self, spec: dict, previous=None, previous_run=None, today: str = "2022-11-01", prices=None):
        data = dict(self.data, prices=prices or self.prices)
        return self.job.run_strategy(
            self._definition(spec), self.group, data, self.names, {}, previous, previous_run, today
        )

    def test_unfinished_session_is_dropped(self) -> None:
        document = {"dates": ["2026-11-06", "2026-11-09"], "closes": [1.0, 2.0], "fetched_at": "2026-11-09T19:40:01+00:00"}
        self.assertEqual(self.job.completed_sessions(document), (["2026-11-06"], [1.0]))
        document["fetched_at"] = "2026-11-09T21:30:00+00:00"
        self.assertEqual(self.job.completed_sessions(document)[0], ["2026-11-06", "2026-11-09"])
        document["fetched_at"] = "2026-11-10T02:00:00+00:00"
        self.assertEqual(self.job.completed_sessions(document)[0], ["2026-11-06", "2026-11-09"])

    def test_next_rebalance_skips_weekends(self) -> None:
        self.assertEqual(
            self.job.next_rebalance("2026-11-06"),
            {"signal_date": "2026-11-30", "trade_date": "2026-12-01", "estimated": True},
        )
        # Oct 31, 2026 is a Saturday: the signal is Friday the 30th, trades fill Monday.
        self.assertEqual(self.job.next_rebalance("2026-10-12")["signal_date"], "2026-10-30")
        self.assertEqual(self.job.next_rebalance("2026-10-12")["trade_date"], "2026-11-02")
        self.assertEqual(self.job.next_rebalance("2026-12-31")["signal_date"], "2027-01-29")

    def test_backtested_strategy_document(self) -> None:
        doc, run = self._run({"rank": [{"type": "momentum", "months": 6, "skip_months": 1}], "holdings": 4})
        self.assertEqual(doc["status"], "backtested")
        self.assertEqual(doc["backtest"]["label"], "Backtested, not traded")
        self.assertIn("survivorship", [caveat["id"] for caveat in doc["caveats"]])
        self.assertEqual(len(doc["basket"]["holdings"]), 4)
        for holding in doc["basket"]["holdings"]:
            self.assertIn("Rank", holding["reason"])
            self.assertIn("months", holding["reason"])
        # The basket shown is the one chosen at the last rebalance, and it is what gets frozen.
        self.assertEqual(doc["basket"]["as_of"], doc["last_rebalance"]["signal_date"])
        self.assertEqual(
            [h["symbol"] for h in run["decisions"][0]["holdings"]], [h["symbol"] for h in doc["basket"]["holdings"]]
        )
        self.assertEqual(doc["live"]["since"], "2022-11-01")
        self.assertEqual(doc["live"]["sessions"], 0)
        self.assertIsNone(doc["live"]["strategy_return"])
        curve = doc["backtest"]["curve"]
        self.assertEqual(len(curve["dates"]), len(curve["dd_strategy"]))
        self.assertAlmostEqual(min(curve["dd_strategy"]), doc["backtest"]["strategy"]["max_drawdown"], places=3)

    def test_financial_rules_get_no_backtest(self) -> None:
        doc, run = self._run({"rank": [{"type": "fundamental", "field": "roic"}], "holdings": 3})
        self.assertEqual(doc["status"], "live_only")
        self.assertIsNone(doc["backtest"])
        self.assertEqual(doc["risk"]["level"], "unknown")
        self.assertIn("live_only", [caveat["id"] for caveat in doc["caveats"]])
        self.assertEqual(len(run["decisions"]), 1)

    def test_live_record_is_frozen_once_it_starts(self) -> None:
        spec = {"rank": [{"type": "momentum", "months": 6, "skip_months": 1}], "holdings": 4}
        cut = "2022-06-15"
        early = {
            symbol: {
                "dates": [day for day in series["dates"] if day <= cut],
                "closes": series["closes"][: len([day for day in series["dates"] if day <= cut])],
            }
            for symbol, series in self.prices.items()
        }
        doc1, run1 = self._run(spec, today=cut, prices=early)
        self.assertEqual(doc1["live"]["sessions"], 0)
        start = run1["decisions"][0]

        doc2, run2 = self._run(spec, previous=doc1, previous_run=run1, today="2022-11-01")
        self.assertEqual(doc2["published_at"], cut)
        self.assertEqual(doc2["live"]["since"], cut)
        self.assertEqual(run2["decisions"][0]["holdings"], start["holdings"])
        self.assertEqual(run2["decisions"][0]["signal_date"], cut)
        # One decision per month end after publication: June through September, and October's.
        later = [d["signal_date"] for d in run2["decisions"][1:]]
        self.assertEqual(later, sorted(later))
        self.assertTrue(all(day > cut for day in later))
        self.assertEqual(len(later), 5)
        self.assertGreater(doc2["live"]["sessions"], 60)
        self.assertGreater(doc2["live"]["first_fill_date"], cut)
        self.assertIsNotNone(doc2["live"]["strategy_return"])

        doc3, run3 = self._run(spec, previous=doc2, previous_run=run2, today="2022-11-02")
        self.assertEqual(run3["decisions"], run2["decisions"])
        self.assertEqual(doc3["live"]["strategy_return"], doc2["live"]["strategy_return"])


if __name__ == "__main__":
    unittest.main()
