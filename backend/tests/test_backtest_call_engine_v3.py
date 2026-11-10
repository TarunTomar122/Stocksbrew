from __future__ import annotations

import math
import pickle
import statistics
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

from backend import call_engine as ce
from backend.call_factors import STANDARD
from backend.scripts import backtest_call_engine_v3 as bt


def week_of(n: int, *, trend_up: bool | None = None, fwd_add: float = 0.0, seed_day: str = "2019-01-07") -> dict:
    """``n`` standard stocks; stock i ranks i-th on every factor."""
    stocks = {}
    for i in range(n):
        up = (i >= n // 2) if trend_up is None else trend_up
        stocks[f"S{i}"] = {
            "model": STANDARD,
            "group": "Tech",
            "size": 1e9 * (i + 1),
            "raw": {name: float(i) for names in ce.FAMILIES[STANDARD].values() for name in names},
            "insider_buyers": 0,
            "trend_up": up,
            "fwd": {63: fwd_add if i >= n // 2 else 0.0, 126: fwd_add if i >= n // 2 else 0.0},
        }
    return {"day": seed_day, "stocks": stocks, "bench_fwd": {63: 0.0, 126: 0.0}}


def panel_of(weeks: int, n: int = 40, start: str = "2019-01-07", **kwargs: object) -> list[dict]:
    day = date.fromisoformat(start)
    return [week_of(n, seed_day=(day + timedelta(days=7 * k)).isoformat(), **kwargs) for k in range(weeks)]  # type: ignore[arg-type]


class StatsTest(unittest.TestCase):
    def test_t_stat(self) -> None:
        values = [1.0, 2.0, 3.0, 4.0]
        expected = statistics.fmean(values) / (statistics.stdev(values) / 2)
        self.assertAlmostEqual(bt.t_stat(values), expected)
        self.assertTrue(math.isnan(bt.t_stat([1.0, 2.0])))
        self.assertTrue(math.isnan(bt.t_stat([1.0, 1.0, 1.0])))

    def test_non_overlapping_uses_every_starting_week(self) -> None:
        series = [0.01 * ((i * 7) % 5 + 1) for i in range(52)]
        out = bt.non_overlapping(series, 13)
        self.assertEqual(out["periods"], 4)
        ts = [bt.t_stat(series[k::13]) for k in range(13)]
        self.assertAlmostEqual(out["t_median"], round(statistics.median(ts), 2))
        self.assertLessEqual(out["t_min"], out["t_median"])
        self.assertLessEqual(out["t_median"], out["t_max"])
        self.assertEqual(bt.non_overlapping([0.1, 0.2], 13)["periods"], 0)


class ReplayTest(unittest.TestCase):
    def test_replay_runs_the_engines_rule(self) -> None:
        panel = panel_of(6)
        replayed = bt.replay(panel)
        week = replayed["calls"][0]
        self.assertEqual(week["S39"], "add")      # top on everything, trend up
        self.assertEqual(week["S0"], "trim")      # bottom on everything, trend down
        self.assertEqual(week["S20"], "hold")
        self.assertEqual(replayed["votes"][0]["S39"]["quality"], 1)
        self.assertEqual(sum(replayed["changes"].values()), 0)

    def test_trend_gate_blocks_trim_in_an_uptrend(self) -> None:
        replayed = bt.replay(panel_of(2, trend_up=True))
        self.assertEqual(replayed["calls"][0]["S0"], "hold")

    def test_spread_series_and_summary(self) -> None:
        panel = panel_of(30, fwd_add=0.10)
        replayed = bt.replay(panel)
        rows = bt.spread_series(panel, replayed["calls"], 0, 30, 126)
        self.assertEqual(len(rows), 30)
        self.assertAlmostEqual(rows[0]["add_trim"], 0.10)
        demeaned = bt.spread_series(panel, replayed["calls"], 0, 30, 126, demean=True)
        self.assertEqual(len(demeaned), 30)
        summary = bt.summarize(rows, 126)
        self.assertTrue(summary["testable"])
        self.assertEqual(summary["add_minus_trim_pct"], 10.0)
        self.assertEqual(summary["weeks_add_beats_trim_pct"], 100)
        self.assertFalse(bt.summarize(rows[:5], 126)["testable"])
        only_big = bt.spread_series(panel, replayed["calls"], 0, 30, 126, keep=lambda i, s: int(s[1:]) >= 30)
        self.assertEqual(only_big, [])  # no TRIM names among them: the week does not count


class SurvivalTest(unittest.TestCase):
    def results(self, gap: float = 1.0, t: float = 2.5, dev_gap: float = 1.0) -> dict:
        def row(g: float, tt: float) -> dict:
            return {126: {"testable": True, "weeks": 100, "add_minus_trim_pct": g, "t_median": tt, "t_min": tt - 1, "t_max": tt + 1, "periods": 8}}

        holdout = {subset: row(gap, t) for subset in bt.SUBSETS}
        return {"holdout": holdout, "dev": {subset: row(dev_gap, 1.0) for subset in bt.SUBSETS}}

    def test_everything_must_hold(self) -> None:
        self.assertTrue(all(ok for _, ok, _ in bt.survival(self.results())))
        self.assertFalse(all(ok for _, ok, _ in bt.survival(self.results(t=1.9))))
        self.assertFalse(all(ok for _, ok, _ in bt.survival(self.results(dev_gap=-0.1))))
        self.assertFalse(all(ok for _, ok, _ in bt.survival(self.results(gap=-1.0))))
        untestable = self.results()
        untestable["holdout"]["financials"][126] = {"testable": False, "weeks": 3}
        checks = bt.survival(untestable)
        self.assertFalse(all(ok for _, ok, _ in checks))
        self.assertTrue(any("not testable" in detail for _, _, detail in checks))


class PreregistrationTest(unittest.TestCase):
    def test_the_holdout_needs_a_preregistration_file(self) -> None:
        panel = [week_of(12, seed_day=day) for day in ("2018-09-03", "2022-10-03", "2022-10-10")]
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "panel.pkl"
            cache.write_bytes(pickle.dumps({"panel": panel, "n_stocks": 12}))
            argv = ["prog", "--data-dir", tmp, "--panel-cache", str(cache), "--show-holdout", str(Path(tmp) / "missing.md")]
            with mock.patch("sys.argv", argv), mock.patch("builtins.print"):
                with self.assertRaises(SystemExit):
                    bt.main()


if __name__ == "__main__":
    unittest.main()
