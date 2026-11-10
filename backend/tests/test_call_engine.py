from __future__ import annotations

import random
import unittest
from dataclasses import replace
from datetime import date, timedelta

from backend import call_engine as ce
from backend.call_factors import FACTOR_LABELS, FINANCIAL, REIT, STANDARD


def mondays(n: int, start: str = "2024-01-01") -> list[str]:
    day = date.fromisoformat(start)
    return [(day + timedelta(days=7 * i)).isoformat() for i in range(n)]


PRICE = {"price": 100.0, "sigma_daily": 0.02, "sma_50": 95.0, "sma_200": 80.0, "high_252": 125.0, "low_20": 93.0, "ret_1m": 0.03, "ret_5d": 0.0}
BELOW_TREND = {**PRICE, "sma_200": 120.0, "sma_50": 110.0}


def families(votes: dict[str, int] | None = None, model: str = STANDARD, insider_buyers: int = 0) -> dict:
    """A stock's family_scores entry with the given votes (missing families abstain)."""
    votes = votes or {}
    out: dict = {}
    for family in ce.FAMILIES[model]:
        vote = votes.get(family, 0)
        out[family] = {"status": "scored", "percentile": 85.0 if vote > 0 else 15.0 if vote < 0 else 50.0, "vote": vote, "members": {name: 50.0 for name in ce.FAMILIES[model][family]}}
    for family, reason in ce.NOT_SCORED.get(model, {}).items():
        out[family] = {"status": "not_scored", "reason": reason}
    out["insider"] = {"status": "scored", "percentile": None, "vote": 1 if insider_buyers >= 2 else 0, "buyers_90d": insider_buyers}
    return out


BULL = {"quality": 1, "value": 1, "accruals": 1}
BEAR = {"quality": -1, "value": -1, "accruals": -1}


class ScorecardDefinitionTest(unittest.TestCase):
    def test_every_family_is_defined_and_labelled(self) -> None:
        self.assertEqual(ce.FAMILY_ORDER, ("quality", "value", "trend", "investment", "accruals", "insider"))
        for model, fams in ce.FAMILIES.items():
            for family, names in fams.items():
                self.assertIn(family, ce.FAMILY_ORDER)
                self.assertTrue(set(names) <= set(FACTOR_LABELS), (model, family))
            # a family is either scored from factors or explicitly not scored, never both
            self.assertFalse(set(fams) & set(ce.NOT_SCORED.get(model, {})))
            self.assertEqual(set(fams) | set(ce.NOT_SCORED.get(model, {})) | {"insider"}, set(ce.FAMILY_ORDER))

    def test_financials_and_reits_do_not_use_accruals_or_industrial_factors(self) -> None:
        for model in (FINANCIAL, REIT):
            self.assertIn("accruals", ce.NOT_SCORED[model])
            used = {name for names in ce.FAMILIES[model].values() for name in names}
            self.assertNotIn("low_accruals", used)
            self.assertNotIn("gross_profitability", used)
        self.assertIn("book_value_growth", ce.FAMILIES[FINANCIAL]["quality"])
        self.assertIn("cash_flow_yield", ce.FAMILIES[REIT]["value"])

    def test_no_family_can_carry_more_than_30_percent(self) -> None:
        self.assertLessEqual(1 / ce.DEFAULT_PARAMS.min_families, 0.30)
        card = ce.scorecard(families(), "Technology")
        self.assertTrue(all(row["weight"] <= 0.30 for row in card if row["status"] == "scored"))
        self.assertAlmostEqual(sum(row["weight"] for row in card if row["status"] == "scored"), 1.0, places=3)

    def test_peer_groups(self) -> None:
        self.assertEqual(ce.peer_group(REIT, "Technology", "6798"), "REITs")  # the screener files some REITs as Technology
        self.assertEqual(ce.peer_group(FINANCIAL, "Financials", "6021"), "Banks")
        self.assertEqual(ce.peer_group(FINANCIAL, "Financials", "6331"), "Insurers")
        self.assertEqual(ce.peer_group(FINANCIAL, "Financials", "6211"), "Brokers, exchanges and asset managers")
        self.assertEqual(ce.peer_group(STANDARD, "Financials", "7389"), "Financials")
        self.assertEqual(ce.peer_group(STANDARD, None, "2911"), "SIC 29")
        self.assertEqual(ce.peer_group(STANDARD, None, None), "")

    def test_min_members(self) -> None:
        self.assertEqual(ce.min_members(("a",)), 1)
        self.assertEqual(ce.min_members(("a", "b")), 1)
        self.assertEqual(ce.min_members(("a", "b", "c")), 1)
        self.assertEqual(ce.min_members(("a", "b", "c", "d", "e")), 2)


class FamilyScoresTest(unittest.TestCase):
    def universe(self, n: int = 40) -> dict:
        stocks = {}
        for i in range(n):
            raw = {name: float(i) for names in ce.FAMILIES[STANDARD].values() for name in names}
            stocks[f"S{i}"] = {"model": STANDARD, "group": "Tech", "size": None, "raw": raw, "insider_buyers": 0}
        return stocks

    def test_percentiles_and_votes_follow_the_peer_rank(self) -> None:
        scores = ce.family_scores(self.universe())
        top, bottom, middle = scores["S39"], scores["S0"], scores["S20"]
        for family in ce.FAMILIES[STANDARD]:
            self.assertEqual(top[family]["vote"], 1)
            self.assertGreater(top[family]["percentile"], 95)
            self.assertEqual(bottom[family]["vote"], -1)
            self.assertEqual(middle[family]["vote"], 0)
            self.assertEqual(set(top[family]["members"]), set(ce.FAMILIES[STANDARD][family]))
        self.assertEqual(ce.tally(top), {"for": 5, "against": 0, "neutral": 1, "scored": 6})

    def test_each_peer_group_is_ranked_on_its_own(self) -> None:
        stocks = self.universe(20)
        for i in range(20):
            raw = {name: 1000.0 + i for names in ce.FAMILIES[STANDARD].values() for name in names}
            stocks[f"B{i}"] = {"model": STANDARD, "group": "Banks-ish", "size": None, "raw": raw, "insider_buyers": 0}
        scores = ce.family_scores(stocks)
        self.assertEqual(scores["S19"]["value"]["percentile"], scores["B19"]["value"]["percentile"])
        self.assertEqual(scores["S0"]["value"]["vote"], -1)

    def test_size_halves_when_the_group_is_big_enough(self) -> None:
        stocks = {}
        for i in range(40):
            big = i >= 20
            # small names all score higher than big ones; within each half the order is i
            raw = {name: float((i - 20) if big else (i + 100)) for names in ce.FAMILIES[STANDARD].values() for name in names}
            stocks[f"S{i}"] = {"model": STANDARD, "group": "Tech", "size": 1e10 * (i + 1), "raw": raw, "insider_buyers": 0}
        scores = ce.family_scores(stocks)
        # the best big company ranks at the top of the big half, not under every small one
        self.assertEqual(scores["S39"]["quality"]["vote"], 1)
        self.assertEqual(scores["S19"]["quality"]["vote"], 1)
        self.assertEqual(scores["S20"]["quality"]["vote"], -1)

    def test_not_scored_families_and_missing_data_are_explicit(self) -> None:
        stocks = self.universe(12)
        for i in range(12):
            raw = {name: float(i) for names in ce.FAMILIES[FINANCIAL].values() for name in names}
            raw["low_accruals"] = float(i)  # present in the data, but must not be used for a bank
            stocks[f"F{i}"] = {"model": FINANCIAL, "group": "Banks", "size": None, "raw": raw, "insider_buyers": 0}
        stocks["S3"]["raw"] = {name: value for name, value in stocks["S3"]["raw"].items() if name not in ("earnings_yield", "fcf_yield", "sales_yield")}
        scores = ce.family_scores(stocks)
        self.assertEqual(scores["F11"]["accruals"]["status"], "not_scored")
        self.assertIn("banks", scores["F11"]["accruals"]["reason"])
        self.assertNotIn("vote", scores["F11"]["accruals"])
        self.assertEqual(scores["S3"]["value"]["status"], "no_data")
        self.assertIn("needs 1 of 3", scores["S3"]["value"]["reason"])
        self.assertEqual(ce.tally(scores["F11"])["scored"], 5)
        self.assertIn("note", scores["F11"]["quality"])  # payout is not in the feed: said, not hidden

    def test_insider_buying_only_votes_for(self) -> None:
        stocks = self.universe(12)
        stocks["S1"]["insider_buyers"] = 3
        stocks["S2"]["insider_buyers"] = 1
        stocks["S3"]["insider_buyers"] = None
        scores = ce.family_scores(stocks)
        self.assertEqual(scores["S1"]["insider"], {"status": "scored", "percentile": None, "vote": 1, "buyers_90d": 3})
        self.assertEqual(scores["S2"]["insider"]["vote"], 0)
        self.assertEqual(scores["S0"]["insider"]["vote"], 0)
        self.assertEqual(scores["S3"]["insider"]["status"], "no_data")
        self.assertTrue(all(entry["insider"].get("vote", 0) >= 0 for entry in scores.values()))

    def test_funds_get_no_scorecard(self) -> None:
        stocks = self.universe(10)
        stocks["GLD"] = {"model": "fund", "group": "", "size": None, "raw": {}, "insider_buyers": 0}
        self.assertEqual(ce.family_scores(stocks)["GLD"], {})


class RuleTest(unittest.TestCase):
    def votes(self, pos: int, neg: int, scored: int = 6) -> dict:
        return {"for": pos, "against": neg, "neutral": scored - pos - neg, "scored": scored}

    def test_agreement_plus_trend(self) -> None:
        cases = [
            (None, 3, 0, True, "add"),
            (None, 3, 1, True, "add"),
            (None, 3, 0, False, "hold"),   # families agree, trend does not
            (None, 3, 2, True, "hold"),    # disagreement is HOLD
            (None, 2, 0, True, "hold"),    # two families are not enough
            (None, 0, 3, False, "trim"),
            (None, 0, 3, True, "hold"),
            (None, 4, 3, True, "hold"),
            ("add", 2, 1, False, "add"),   # kept: the trend gate applies to entering only
            ("add", 1, 0, True, "hold"),
            ("add", 2, 2, True, "hold"),
            ("trim", 1, 2, True, "trim"),
            ("trim", 0, 1, False, "hold"),
        ]
        for current, pos, neg, up, expected in cases:
            self.assertEqual(ce.target_call(current, self.votes(pos, neg), up), expected, (current, pos, neg, up))

    def test_no_single_family_moves_hold(self) -> None:
        for pos in range(0, 3):
            self.assertEqual(ce.target_call(ce.HOLD, self.votes(pos, 0), True), ce.HOLD)

    def replay(self, steps: list[tuple[dict, bool]], params: ce.Params = ce.DEFAULT_PARAMS) -> tuple[list[str], list[dict]]:
        state = None
        calls, changes = [], []
        for day, (votes, up) in zip(mondays(len(steps)), steps):
            state = ce.advance(state, day=day, votes=votes, trend_up=up, params=params)
            calls.append(state["call"])
            if state["change"]:
                changes.append(state["change"])
        return calls, changes

    def test_initial_call_follows_the_rule(self) -> None:
        self.assertEqual(self.replay([(self.votes(3, 0), True)])[0], ["add"])
        self.assertEqual(self.replay([(self.votes(3, 0), False)])[0], ["hold"])
        self.assertEqual(self.replay([(self.votes(0, 4), False)])[0], ["trim"])

    def test_a_change_needs_two_weeks_and_the_minimum_hold(self) -> None:
        calls, changes = self.replay([(self.votes(3, 0), True)] + [(self.votes(0, 0), True)] * 6)
        # weeks 1..3 inside the 4-week hold; week 4 is the first allowed, and the HOLD target has shown twice by then
        self.assertEqual(calls, ["add", "add", "add", "add", "hold", "hold", "hold"])
        self.assertEqual(changes[-1]["trigger"], "rule")
        self.assertEqual(changes[-1]["votes"]["for"], 0)
        calls, _ = self.replay([(self.votes(0, 0), True)] * 6 + [(self.votes(3, 0), True)] + [(self.votes(0, 0), True)])
        self.assertEqual(calls[-1], "hold")  # one week of agreement is not enough

    def test_flickering_votes_never_change_the_call(self) -> None:
        steps = [(self.votes(3, 0) if i % 2 else self.votes(1, 0), True) for i in range(40)]
        calls, changes = self.replay(steps)
        self.assertEqual(set(calls), {"hold"})
        self.assertEqual(len(changes), 1)  # the initial one

    def test_reruns_inside_the_week_never_move_the_call(self) -> None:
        state = ce.advance(None, day="2024-01-01", votes=self.votes(3, 0), trend_up=True)
        for day in ("2024-01-01", "2024-01-03", "2024-01-05", "2023-12-20"):
            again = ce.advance(state, day=day, votes=self.votes(0, 5), trend_up=False)
            self.assertEqual(again["call"], "add")
            self.assertEqual(again["weeks_in_call"], 0)
            self.assertEqual(again["day"], "2024-01-01")
            self.assertIsNone(again["change"])
        self.assertEqual(ce.advance(state, day="2024-01-08", votes=self.votes(3, 0), trend_up=True)["weeks_in_call"], 1)


class ZonesTest(unittest.TestCase):
    def test_add_level_is_a_real_level_inside_the_band(self) -> None:
        zones = ce.build_zones("add", PRICE, day="2024-03-04")
        self.assertEqual(zones["accumulate_below"], 95.0)
        self.assertEqual(zones["add_anchor"], "its 50-day average")
        self.assertEqual(zones["entry_state"], "wait_for_pullback")
        self.assertEqual(zones["anchored_on"], "2024-03-04")

    def test_a_pullback_that_already_happened_is_the_entry(self) -> None:
        zones = ce.build_zones("add", {**PRICE, "ret_1m": -0.12}, day="2024-03-04")
        self.assertEqual(zones["entry_state"], "in_zone")
        self.assertGreaterEqual(zones["accumulate_below"], 100.0)

    def test_levels_never_contradict_the_close(self) -> None:
        rng = random.Random(7)
        for _ in range(3000):
            spot = rng.choice([0.37, 3.3, 29.03, 136.1, 999.99, 12345.0]) * rng.uniform(0.8, 1.2)
            price = {
                "price": spot,
                "sigma_daily": rng.uniform(0.003, 0.08),
                "sma_50": spot * rng.uniform(0.7, 1.3),
                "sma_200": spot * rng.uniform(0.5, 1.6),
                "high_252": spot * rng.uniform(1.0, 2.5),
                "low_20": spot * rng.uniform(0.7, 1.0),
                "ret_1m": rng.uniform(-0.4, 0.4),
            }
            for call in ("add", "hold", "trim"):
                zones = ce.build_zones(call, price, day="2026-11-09", analyst_target=spot * rng.uniform(0.5, 2.0))
                self.assertGreater(zones["trim_above"], spot)
                if zones["entry_state"] == "wait_for_pullback":
                    self.assertLess(zones["accumulate_below"], spot)
                if zones["entry_state"] == "in_zone":
                    self.assertGreaterEqual(zones["accumulate_below"], spot)
                self.assertEqual(ce.entry_state_at(zones, spot), zones["entry_state"])

    def test_trim_levels_stay_near_for_volatile_names(self) -> None:
        wild = {**PRICE, "sigma_daily": 0.05, "high_252": 400.0, "sma_50": 300.0, "sma_200": 300.0}
        trim = ce.build_zones("trim", wild, day="2026-11-09")
        self.assertLessEqual(trim["trim_above"] / 100.0 - 1, 0.5 * 0.05 * 21 ** 0.5 + 0.01)
        add = ce.build_zones("add", wild, day="2026-11-09")
        self.assertLessEqual(add["trim_above"] / 100.0 - 1, 1.0 * 0.05 * 63 ** 0.5 + 0.01)

    def test_entry_state_at_a_live_price(self) -> None:
        zones = ce.build_zones("add", PRICE, day="2024-03-04")
        self.assertEqual(ce.entry_state_at(zones, 94.0), "in_zone")
        self.assertEqual(ce.entry_state_at(zones, 101.0), "wait_for_pullback")
        self.assertEqual(ce.entry_state_at(ce.build_zones("trim", PRICE, day="2024-03-04"), 50.0), "no_entry")

    def test_round_level(self) -> None:
        self.assertEqual(ce.round_level(349.51), 350.0)
        self.assertEqual(ce.round_level(41.37), 41.4)
        self.assertEqual(ce.round_level(7.238), 7.24)
        self.assertEqual(ce.round_level(0.0), 0.0)
        self.assertEqual(ce.round_level_toward(1020.67, up=True), 1030.0)
        self.assertEqual(ce.round_level_toward(1020.67, up=False), 1020.0)
        self.assertEqual(ce.round_level_toward(95.0, up=False), 95.0)
        self.assertEqual(ce.round_level_toward(0.03712, up=True), 0.0372)


class BuildCallTest(unittest.TestCase):
    def build(self, day: str, votes: dict, previous: dict | None = None, price: dict = PRICE, model: str = STANDARD, **kwargs: object) -> dict:
        return ce.build_call(day=day, model=model, group="Technology", families=families(votes, model), price=price, universe_size=600, previous=previous, **kwargs)

    def test_first_call_and_shape(self) -> None:
        call = self.build("2024-03-04", BULL)
        self.assertEqual(call["version"], "call-engine-3")
        self.assertEqual(call["call"], "add")
        self.assertEqual([row["family"] for row in call["families"]], list(ce.FAMILY_ORDER))
        self.assertEqual(call["votes"], {"for": 3, "against": 0, "neutral": 3, "scored": 6})
        self.assertEqual(call["score"], 50.0)
        self.assertEqual(call["coverage"], 1.0)
        self.assertTrue(call["trend"]["up"])
        self.assertEqual(call["horizon_label"], "about 6 months")
        self.assertEqual(call["change_log"][0]["trigger"], "initial")
        self.assertFalse(call["changed"])
        self.assertEqual({item["family"] for item in call["reasons"]}, {"quality", "value", "accruals"})
        self.assertIn("percentile in its peer group (Technology)", call["reasons"][0]["text"])
        self.assertEqual(call["rule"], ce.RULE_TEXT)
        self.assertEqual(set(call["evidence"]), {"summary", "limits"})

    def test_financial_scorecard_marks_accruals_not_scored(self) -> None:
        call = self.build("2024-03-04", {"quality": 1, "value": 1, "trend": 1}, model=FINANCIAL)
        accruals = next(row for row in call["families"] if row["family"] == "accruals")
        self.assertEqual(accruals["status"], "not_scored")
        self.assertNotIn("weight", accruals)
        self.assertEqual(call["votes"]["scored"], 5)
        self.assertEqual(call["coverage"], 1.0)  # not-applicable families do not count as missing
        self.assertEqual(call["model_label"], "bank, broker or insurer")

    def test_levels_are_rebuilt_from_every_close(self) -> None:
        first = self.build("2024-03-04", BULL)
        later = self.build("2024-03-06", BULL, previous=first, price={**PRICE, "price": 60.0, "sma_50": 57.0, "low_20": 55.0, "sma_200": 50.0, "high_252": 75.0})
        self.assertEqual(later["call"], "add")  # same week: the call does not move
        self.assertEqual(later["zones"]["anchored_on"], "2024-03-06")
        self.assertLess(later["zones"]["accumulate_below"], 60.0)
        self.assertLess(later["zones"]["trim_above"], 100.0)  # not the old level from a price of 100

    def test_a_mid_week_rerun_shows_todays_scorecard_with_the_weeks_call(self) -> None:
        monday = self.build("2024-03-04", BULL)
        wednesday = self.build("2024-03-06", {}, previous=monday)
        self.assertEqual(wednesday["call"], "add")
        self.assertEqual(wednesday["votes"]["for"], 0)
        self.assertIn("(now 0)", wednesday["what_would_change"][0]["text"])
        self.assertEqual(wednesday["state"], monday["state"])

    def test_change_is_logged_with_the_families_behind_it(self) -> None:
        call = self.build("2024-03-04", {})
        for day in mondays(5, "2024-03-11"):
            call = self.build(day, BEAR, previous=call, price=BELOW_TREND)
        self.assertEqual(call["call"], "trim")
        log = [entry for entry in call["change_log"] if entry["from"]]
        self.assertEqual(log[-1]["to"], "trim")
        self.assertIn("quality, value, accruals", log[-1]["reason"])
        self.assertIn("below its 200-day average", log[-1]["reason"])
        self.assertEqual(call["zones"]["entry_state"], "no_entry")

    def test_pending_change_is_said(self) -> None:
        call = self.build("2024-03-04", BULL)
        for day in mondays(4, "2024-03-11"):
            call = self.build(day, BULL, previous=call)
        call = self.build("2024-04-08", {}, previous=call)
        self.assertEqual(call["call"], "add")
        self.assertEqual(call["what_would_change"][0]["kind"], "pending")
        self.assertEqual(call["what_would_change"][0]["to"], "hold")
        self.assertIn("next weekly check", call["what_would_change"][0]["text"])

    def test_state_from_another_engine_version_is_ignored(self) -> None:
        old = {**self.build("2024-03-04", BULL), "version": "call-engine-2"}
        fresh = self.build("2024-03-11", BEAR, previous=old, price=BELOW_TREND)
        self.assertEqual(fresh["call"], "trim")
        self.assertEqual(fresh["change_log"][0]["trigger"], "initial")

    def test_what_would_change_comes_from_the_rule(self) -> None:
        hold = self.build("2024-03-04", {"quality": 1, "value": 1}, price=BELOW_TREND)
        to_add = next(item for item in hold["what_would_change"] if item.get("to") == "add")
        self.assertIn("1 more family reaches the top third", to_add["text"])
        self.assertIn("200-day average (about $120)", to_add["text"])
        self.assertEqual(to_add["price_level"], 120.0)
        add = self.build("2024-03-04", BULL)
        self.assertIn("fewer than 2 families stay in the top third", add["what_would_change"][0]["text"])
        self.assertEqual(add["what_would_change"][-1]["kind"], "dwell")

    def test_confidence_is_agreement_only(self) -> None:
        self.assertEqual(ce.confidence("add", {"for": 4, "against": 0, "neutral": 2, "scored": 6})["label"], "high")
        self.assertEqual(ce.confidence("add", {"for": 3, "against": 1, "neutral": 2, "scored": 6})["label"], "medium")
        self.assertEqual(ce.confidence("add", {"for": 2, "against": 1, "neutral": 3, "scored": 6})["label"], "low")
        self.assertEqual(ce.confidence("hold", {"for": 1, "against": 1, "neutral": 4, "scored": 6})["label"], "high")
        self.assertEqual(ce.confidence("hold", {"for": 3, "against": 3, "neutral": 0, "scored": 6})["label"], "low")
        self.assertIn("2 of 6", ce.confidence("trim", {"for": 0, "against": 2, "neutral": 4, "scored": 6})["text"])

    def test_legacy_shape_labels_and_derived_setup(self) -> None:
        add = ce.to_directive_v2(self.build("2024-03-04", BULL), live_price=100.0)
        for key in ("version", "stance", "execution", "horizon", "confidence", "action", "zones", "setup", "evidence", "watch_out", "invalidation", "changed_from_previous", "change_reason"):
            self.assertIn(key, add)
        self.assertEqual((add["stance"], add["action"]["label"]), ("accumulate", "Accumulate on pullbacks"))
        self.assertEqual(ce.to_directive_v2(self.build("2024-03-04", BULL), live_price=94.0)["action"]["label"], "Accumulate now")
        self.assertEqual(add["setup"]["valuation"], "cheap_vs_peers")
        self.assertEqual(add["setup"]["quality"], "strong_vs_peers")
        self.assertEqual(add["setup"]["trend"], "uptrend")
        trim = ce.to_directive_v2(self.build("2024-03-04", BEAR, price=BELOW_TREND), live_price=100.0)
        self.assertEqual((trim["stance"], trim["action"]["label"], trim["execution"]), ("trim", "Do not add here", "do_not_chase"))
        self.assertEqual((trim["setup"]["valuation"], trim["setup"]["quality"], trim["setup"]["trend"]), ("expensive_vs_peers", "weak_vs_peers", "downtrend"))
        self.assertEqual(set(trim["zones"]), {"trim_above"})
        hold = ce.to_directive_v2(self.build("2024-03-04", {}), live_price=100.0)
        self.assertEqual((hold["action"]["label"], hold["setup"]["valuation"]), ("Hold here", "in_line_with_peers"))
        no_value = self.build("2024-03-04", BULL)
        no_value["families"] = [row if row["family"] != "value" else {**row, "status": "no_data"} for row in no_value["families"]]
        self.assertEqual(ce.to_directive_v2(no_value)["setup"]["valuation"], "not_scored")
        for directive in (add, trim, hold):
            self.assertNotIn("unclear", directive["setup"].values())
            self.assertNotIn("mixed", directive["setup"].values())

    def test_no_text_claims_an_edge(self) -> None:
        banned = ("will rise", "will fall", "outperform", "beat the market", "win rate", "probability", "likely to", "expected return")
        texts = [ce.BASIS, ce.RULE_TEXT] + list(ce.ACTION.values())
        for votes, price in ((BULL, PRICE), (BEAR, BELOW_TREND), ({}, PRICE)):
            call = self.build("2024-03-04", votes, price=price)
            legacy = ce.to_directive_v2(call, 100.0)
            texts += [call["confidence"]["text"], legacy["action"]["summary"], legacy["watch_out"], call["trend"]["text"]]
            texts += [item["text"] for item in call["what_would_change"]] + [row["text"] for row in call["families"]]
        for text in texts:
            for phrase in banned:
                self.assertNotIn(phrase, text.lower(), text)
        self.assertIn("not a forecast", ce.BASIS)
        self.assertIsNone(ce.EVIDENCE["hit_rate"])
        self.assertIn("may not promise outperformance", ce.EVIDENCE["limits"].lower())

    def test_evidence_quotes_no_return_gap(self) -> None:
        # Every pre-registered condition failed (backtest_call_engine_v3.py), so
        # the copy carries no percentage, t-stat or win rate.
        for text in (ce.EVIDENCE["summary"], ce.EVIDENCE["limits"]):
            self.assertNotIn("%", text)
            self.assertNotIn("t =", text)
            self.assertNotIn("t-stat", text)
        self.assertIn("did not do better", ce.EVIDENCE["summary"])
        self.assertIn("listed today", ce.EVIDENCE["summary"])
        self.assertIn("delisted", ce.EVIDENCE["limits"])
        self.assertIn("not against an index fund", ce.EVIDENCE["limits"])


class ParamsTest(unittest.TestCase):
    def test_params_are_plain_and_storable(self) -> None:
        p = replace(ce.DEFAULT_PARAMS, dwell_weeks=2)
        self.assertEqual(p.dwell_weeks, 2)
        self.assertEqual(ce.DEFAULT_PARAMS.enter_votes, 3)
        self.assertAlmostEqual(ce.DEFAULT_PARAMS.top_pct, 200 / 3)


if __name__ == "__main__":
    unittest.main()
