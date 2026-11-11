from __future__ import annotations

import os
import tempfile
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from backend import call_stability as cs
from backend.localdb.firestore import LocalFirestoreClient
from backend.storage import TraceMoneyStore


def weekdays(start: str, count: int) -> list[str]:
    out: list[str] = []
    day = date.fromisoformat(start)
    while len(out) < count:
        if day.weekday() < 5:
            out.append(day.isoformat())
        day += timedelta(days=1)
    return out


DAYS = weekdays("2026-06-01", 140)


def facts(*, upto: str, shock: dict[str, float] | None = None, market_drop_on: str | None = None, earnings: list[str] | None = None, next_earnings: str | None = None) -> cs.Facts:
    """A quiet stock (+-1% a day, alternating) and a flat market, with optional shocks.
    ``shock`` adds a one-day stock return on a day; ``market_drop_on`` makes the
    market fall 6% over the five sessions ending that day."""
    shock = shock or {}
    closes, mcloses = [], []
    price = market = 100.0
    drop_days = set()
    if market_drop_on:
        index = DAYS.index(market_drop_on)
        drop_days = set(DAYS[index - 4 : index + 1])
    for i, day in enumerate(DAYS):
        if day > upto:
            break
        mret = -0.0125 if day in drop_days else 0.0
        market *= 1 + mret
        price *= 1 + mret + (0.01 if i % 2 else -0.01) + shock.get(day, 0.0)
        closes.append(price)
        mcloses.append(market)
    n = len(closes)
    return cs.Facts(DAYS[:n], closes, DAYS[:n], mcloses, [d for d in (earnings or []) if d <= upto], next_earnings)


def run(votes: list[tuple[str, str]], *, state=None, levels=None, **fact_kwargs):
    """Feed one vote per day; returns the last state and every view."""
    views = []
    for day, stance in votes:
        state, view = cs.stabilise(state, stance, day, facts(upto=day, **fact_kwargs), raw_levels=levels, name="Acme")
        views.append(view)
    return state, views


START = 80  # leave 60+ sessions of history for the volatility window


class ModeTest(unittest.TestCase):
    def test_default_and_garbage_are_off(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(cs.MODE_ENV, None)
            self.assertEqual(cs.stability_mode(), "off")
            os.environ[cs.MODE_ENV] = "maybe"
            self.assertEqual(cs.stability_mode(), "off")
            os.environ[cs.MODE_ENV] = " Shadow "
            self.assertEqual(cs.stability_mode(), "shadow")

    def test_off_reads_nothing(self) -> None:
        class Exploding:
            def __getattr__(self, name):
                raise AssertionError(f"off mode touched the store: {name}")

        with patch.dict(os.environ, {cs.MODE_ENV: "off"}):
            out = cs.run_for_brief(store=Exploding(), market="US", instrument={"instrument_id": "US_X"}, directive={"stance": "trim"}, history_points=[])
        self.assertEqual(out, {})
        # non-US is always off
        self.assertEqual(cs.run_for_brief(store=Exploding(), market="IN", instrument={"instrument_id": "IN_X"}, directive={"stance": "trim"}, history_points=[], mode="on"), {})


class RuleTest(unittest.TestCase):
    def test_first_vote_sets_the_call(self) -> None:
        state, views = run([(DAYS[START], "accumulate")])
        self.assertEqual(views[0]["call"], "Add")
        self.assertEqual(views[0]["since"], DAYS[START])
        self.assertIsNone(views[0]["since_reason"])
        self.assertFalse(views[0]["changed"])

    def test_noisy_votes_never_flip_add_to_trim(self) -> None:
        pattern = ["accumulate", "trim", "accumulate", "hold", "trim", "accumulate", "trim"]
        votes = [(DAYS[START + i], pattern[i % len(pattern)]) for i in range(40)]
        _, views = run(votes)
        self.assertEqual({v["call"] for v in views}, {"Add"})
        self.assertTrue(any(v["held_against_vote"] for v in views))

    def test_a_lasting_turn_moves_one_step_after_the_hold(self) -> None:
        votes = [(DAYS[START], "accumulate")] + [(DAYS[START + i], "trim") for i in range(1, 45)]
        _, views = run(votes)
        calls = [v["call"] for v in views]
        # No hard reason: Add stands 20 sessions, steps to Hold, then needs another 20 for Trim.
        first_change = calls.index("Hold")
        self.assertEqual(first_change, cs.DEFAULT_RULES.min_hold_sessions)
        self.assertNotIn("Trim", calls[: first_change + cs.DEFAULT_RULES.min_hold_sessions])
        self.assertIn(f"leaned toward selling for {cs.DEFAULT_RULES.confirm_sessions} trading days in a row", views[first_change]["since_reason"])
        self.assertIn("from Buy more to Keep", views[first_change]["since_reason"])
        self.assertEqual(calls[-1], "Trim")

    def test_earnings_allow_a_straight_jump_once(self) -> None:
        report = DAYS[START + 3]
        votes = [(DAYS[START], "accumulate"), (DAYS[START + 1], "accumulate"), (DAYS[START + 2], "accumulate"),
                 (report, "trim"), (DAYS[START + 4], "trim"), (DAYS[START + 5], "accumulate"), (DAYS[START + 6], "accumulate")]
        _, views = run(votes, earnings=[report])
        self.assertEqual(views[3]["call"], "Add")  # one vote is not enough
        self.assertEqual(views[4]["call"], "Trim")  # two votes after the report
        self.assertEqual(views[4]["trigger"], "earnings")
        self.assertIn("reported results on", views[4]["since_reason"])
        # The same report cannot take it back.
        self.assertEqual([v["call"] for v in views[5:]], ["Trim", "Trim"])

    def test_a_market_drop_can_lower_the_call_but_never_raise_it(self) -> None:
        drop = DAYS[START + 6]
        down = [(DAYS[START + i], "accumulate") for i in range(6)] + [(drop, "trim"), (DAYS[START + 7], "trim")]
        _, views = run(down, market_drop_on=drop)
        self.assertEqual(views[-1]["call"], "Trim")
        self.assertEqual(views[-1]["trigger"], "market")
        self.assertIn("S&P 500 fell", views[-1]["since_reason"])

        up = [(DAYS[START + i], "trim") for i in range(6)] + [(drop, "accumulate"), (DAYS[START + 7], "accumulate")]
        _, views = run(up, market_drop_on=drop)
        self.assertEqual(views[-1]["call"], "Trim")

    def test_a_big_move_of_its_own_counts_but_cannot_undo_a_change_inside_the_hold(self) -> None:
        jump = DAYS[START + 4]
        votes = [(DAYS[START + i], "hold") for i in range(4)] + [(jump, "accumulate"), (DAYS[START + 5], "accumulate")]
        _, views = run(votes, shock={jump: 0.15})
        self.assertEqual(views[-1]["call"], "Add")
        self.assertEqual(views[-1]["trigger"], "move")
        self.assertRegex(views[-1]["since_reason"], r"^Acme rose 1[45]% more than the market in a day, far beyond its usual swings")

        fall = DAYS[START + 8]
        later = votes + [(DAYS[START + 6], "accumulate"), (DAYS[START + 7], "accumulate"), (fall, "trim"), (DAYS[START + 9], "trim")]
        _, views = run(later, shock={jump: 0.15, fall: -0.15})
        self.assertEqual(views[-1]["call"], "Add")  # a move may not reverse inside the 20-session hold

    def test_same_day_reruns_start_from_the_day_before(self) -> None:
        state, _ = run([(DAYS[START + i], "accumulate") for i in range(3)])
        day = DAYS[START + 3]
        f = facts(upto=day)
        once, view_once = cs.stabilise(state, "hold", day, f, name="Acme")
        twice, view_twice = cs.stabilise(once, "hold", day, f, name="Acme")
        self.assertEqual(view_once, view_twice)
        self.assertEqual(once["votes"], twice["votes"])
        self.assertEqual(once["prior"], twice["prior"])
        # The day's vote is replaced, not added.
        self.assertEqual(sum(1 for v in twice["votes"] if v["day"] == day), 1)

    def test_a_change_made_earlier_in_the_day_stands(self) -> None:
        report = DAYS[START + 3]
        state, views = run([(DAYS[START], "accumulate"), (DAYS[START + 1], "accumulate"), (DAYS[START + 2], "trim"), (report, "trim")], earnings=[report])
        self.assertEqual(views[-1]["call"], "Trim")
        again, view = cs.stabilise(state, "accumulate", report, facts(upto=report, earnings=[report]), name="Acme")
        self.assertEqual(view["call"], "Trim")
        self.assertTrue(view["changed"])

    def test_the_first_call_stands_for_its_first_day(self) -> None:
        day = DAYS[START]
        state, _ = cs.stabilise(None, "accumulate", day, facts(upto=day), name="Acme")
        _, view = cs.stabilise(state, "trim", day, facts(upto=day), name="Acme")
        self.assertEqual(view["call"], "Add")

    def test_levels_move_only_when_it_matters(self) -> None:
        state, views = run([(DAYS[START], "accumulate")], levels={"accumulate_below": 100.0})
        self.assertEqual(views[0]["levels"], {"accumulate_below": 100.0})
        day = DAYS[START + 1]
        state, view = cs.stabilise(state, "accumulate", day, facts(upto=day), raw_levels={"accumulate_below": 101.0}, name="Acme")
        self.assertEqual(view["levels"]["accumulate_below"], 100.0)  # 1% is inside the stock's noise
        day = DAYS[START + 2]
        state, view = cs.stabilise(state, "accumulate", day, facts(upto=day), raw_levels={"accumulate_below": 92.0}, name="Acme")
        self.assertEqual(view["levels"]["accumulate_below"], 92.0)
        self.assertEqual(view["levels_set_on"], day)
        day = DAYS[START + 3]
        state, view = cs.stabilise(state, "accumulate", day, facts(upto=day), raw_levels={}, name="Acme")
        self.assertEqual(view["levels"], {"accumulate_below": 92.0})  # a day with no levels at all keeps ours
        day = DAYS[START + 4]
        _, view = cs.stabilise(state, "accumulate", day, facts(upto=day), raw_levels={"trim_above": 130.0}, name="Acme")
        self.assertEqual(view["levels"], {"trim_above": 130.0})  # a level the day's call no longer sets is dropped

    def test_what_would_change_matches_the_rule(self) -> None:
        _, views = run([(DAYS[START], "accumulate")], next_earnings=DAYS[START + 10])
        text = views[0]["what_would_change"]
        earliest = cs.short_day(cs.add_sessions(DAYS[START], cs.DEFAULT_RULES.min_hold_sessions))
        self.assertIn(f"until at least {earliest}", text)
        self.assertIn(f"its {cs.short_day(DAYS[START + 10])} results", text)
        self.assertIn("a market sell-off", text)
        self.assertIn("a sharp drop", text)
        # No mechanics in the copy: no day counts, percentages or rule words.
        self.assertNotIn("trading days", text)
        self.assertNotIn("%", text)
        self.assertIn("we'd move to Keep", text.replace("We'd", "we'd"))
        self.assertIn("a sharp drop", text)  # from Buy more only a fall can fast-track a change
        # A Sell some call cannot be lowered by a market drop, so the text does not offer it.
        state, views = run([(DAYS[START], "trim")])
        later = DAYS[START + 30]
        text = cs.what_would_change(state, later, facts(upto=later), "Acme")
        self.assertNotIn("market sell-off", text)
        self.assertTrue(text.startswith("We'd move to Keep if the case for selling fades for a few days"))
        self.assertIn("a sharp rise", text)
        self.assertIn("or sooner after", text)

    def test_a_hard_reason_moves_only_as_far_as_both_days_agree(self) -> None:
        jump = DAYS[START + 4]
        votes = [(DAYS[START + i], "accumulate") for i in range(3)] + [(DAYS[START + 3], "hold"), (jump, "trim")]
        _, views = run(votes, shock={jump: -0.2})
        self.assertEqual(views[-1]["call"], "Hold")
        self.assertEqual(views[-1]["trigger"], "move")

    def test_a_long_move_is_one_event(self) -> None:
        days = DAYS[START + 2 : START + 6]
        events = cs.hard_events(facts(upto=days[-1], shock={d: -0.08 for d in days}), days[-1])
        moves = [e for e in events if e["kind"] == "move"]
        self.assertEqual(len(moves), 1)
        self.assertEqual(moves[0]["date"], days[0])

    def test_one_report_dated_twice_is_one_event(self) -> None:
        day = DAYS[START + 4]
        f = facts(upto=day, earnings=[DAYS[START + 2], DAYS[START + 4]])
        self.assertEqual([e["id"] for e in cs.hard_events(f, day) if e["kind"] == "earnings"], [f"earnings:{DAYS[START + 2]}"])

    def test_a_report_can_take_back_a_recent_change_but_only_one_step(self) -> None:
        drop = DAYS[START + 6]
        report = DAYS[START + 9]
        votes = [(DAYS[START + i], "hold") for i in range(6)] + [(drop, "trim"), (DAYS[START + 7], "trim"), (DAYS[START + 8], "trim")]
        votes += [(report, "accumulate"), (DAYS[START + 10], "accumulate"), (DAYS[START + 11], "accumulate")]
        _, views = run(votes, market_drop_on=drop, earnings=[report])
        self.assertEqual(views[7]["call"], "Trim")
        self.assertEqual(views[7]["trigger"], "market")
        self.assertEqual(views[10]["call"], "Trim")  # two agreeing days are not enough to take it back
        self.assertEqual(views[11]["call"], "Hold")  # three are, and only one step
        self.assertEqual(views[11]["trigger"], "earnings")

    def test_a_day_without_a_price_abstains(self) -> None:
        self.assertIsNone(cs.vote_from_directive({"stance": "watch", "execution": "after_event", "action": {"label": "Watch setup"}}))
        self.assertIsNone(cs.vote_from_directive({"stance": "watch", "text": "Watch setup"}))
        self.assertEqual(cs.vote_from_directive({"stance": "watch", "execution": "breakout"}), "watch")
        state, _ = run([(DAYS[START], "accumulate")], levels={"accumulate_below": 95.0})
        day = DAYS[START + 1]
        _, view = cs.stabilise(state, None, day, facts(upto=day), raw_levels={}, name="Acme")
        self.assertEqual(view["call"], "Add")
        self.assertFalse(view["held_against_vote"])
        self.assertEqual(view["levels"], {"accumulate_below": 95.0})

    def test_without_prices_the_hold_counts_weekdays(self) -> None:
        state = None
        empty = cs.Facts()
        for i in range(8):
            state, view = cs.stabilise(state, "accumulate" if i == 0 else "trim", DAYS[START + i], empty, name="Acme")
        self.assertEqual(view["call"], "Add")

    def test_reports_count_from_the_first_session_that_could_react(self) -> None:
        history = {"reports": [
            {"date": "2026-11-05", "session": "amc", "release": True, "items": ["2.02", "9.01"]},
            {"date": "2026-08-06", "session": "bmo", "release": True, "items": ["2.02"]},
            {"date": "2026-09-15", "session": "bmo", "release": False, "items": ["2.02", "7.01"]},
            {"date": "2026-08-08", "session": "bmo", "release": None, "items": ["2.02"]},  # the same report dated twice
            {"date": "2026-10-01", "session": "bmo", "release": True, "items": ["5.02"]},  # not a results filing
        ]}
        day_docs = [
            {"event_date": "2026-11-25", "session": "bmo", "filing": {"accession": "x"}, "guidance": {"change": "lowered"}},
            {"event_date": "2026-11-20", "session": "amc"},  # scheduled, not filed yet
        ]
        rows = cs.report_rows(history, day_docs)
        self.assertEqual([(r["date"], r["known_on"], r["kind"]) for r in rows], [
            ("2026-08-06", "2026-08-06", "earnings"),
            ("2026-09-15", "2026-09-15", "guidance"),
            ("2026-11-05", "2026-11-06", "earnings"),
            ("2026-11-25", "2026-11-25", "earnings"),
        ])
        self.assertEqual(rows[-1]["change"], "lowered")
        self.assertEqual(rows[-1]["direction"], -1)  # a cut outlook only ever lowers the call
        # An outlook update and then the results release a few days later: the release stands.
        pair = cs.report_rows({"reports": [
            {"date": "2026-10-20", "session": "bmo", "release": False, "items": ["2.02"]},
            {"date": "2026-10-23", "session": "amc", "release": True, "items": ["2.02"]},
        ]})
        self.assertEqual([(r["date"], r["kind"]) for r in pair], [("2026-10-23", "earnings")])
        # A report day from tm_earnings_day near a filed release adds its guidance, not a second row.
        late = cs.report_rows(
            {"reports": [{"date": "2026-10-23", "session": "amc", "release": True, "items": ["2.02"]}]},
            [{"event_date": "2026-10-21", "report_day": "2026-10-23", "filing": {"accession": "y"}, "guidance": {"change": "raised"}}],
        )
        self.assertEqual([(r["date"], r["known_on"], r["change"], r["direction"]) for r in late], [("2026-10-23", "2026-10-26", "raised", None)])
        # A report after Friday's close is first known on Monday.
        self.assertEqual(cs.report_rows({"reports": [{"date": "2026-11-06", "session": "amc", "items": ["2.02"]}]})[0]["known_on"], "2026-11-09")
        f = cs.build_facts([], [], [], [], rows, ["2026-11-20", "2026-08-06"], "2026-11-06")
        self.assertEqual([r["date"] for r in f.reports], ["2026-08-06", "2026-09-15", "2026-11-05"])
        self.assertEqual(f.next_earnings, "2026-11-20")

    def test_a_big_rise_never_fast_tracks_sell_some(self) -> None:
        jump = DAYS[START + 4]
        votes = [(DAYS[START + i], "accumulate") for i in range(4)] + [(jump, "trim"), (DAYS[START + 5], "trim")]
        _, views = run(votes, shock={jump: 0.2})
        self.assertEqual(views[-1]["call"], "Add")
        _, views = run(votes, shock={jump: -0.2})
        self.assertEqual(views[-1]["call"], "Trim")

    def test_an_outlook_cut_only_lowers_the_call(self) -> None:
        cut = DAYS[START + 4]
        report = [{"date": cut, "known_on": cut, "kind": "earnings", "direction": -1, "change": "lowered"}]
        def go(stances):
            state = None
            for i, stance in enumerate(stances):
                day = DAYS[START + i]
                f = facts(upto=day)
                f.reports = [r for r in report if r["known_on"] <= day]
                state, view = cs.stabilise(state, stance, day, f, name="Acme")
            return view
        up = go(["trim"] * 4 + ["accumulate", "accumulate"])
        self.assertEqual(up["call"], "Trim")
        down = go(["accumulate"] * 4 + ["trim", "trim"])
        self.assertEqual(down["call"], "Trim")
        self.assertEqual(down["trigger"], "earnings")
        self.assertEqual(down["since_reason"], f"Acme reported results on {cs.short_day(cut)} and cut its outlook, so we moved our call from Buy more to Sell some.")

    def test_stale_prices_do_not_freeze_the_day(self) -> None:
        self.assertEqual(cs.session_day(["2026-11-06", "2026-11-09"], "2026-11-10"), "2026-11-09")
        self.assertEqual(cs.session_day(["2026-11-06", "2026-11-09"], "2026-11-14"), "2026-11-13")  # Saturday, prices a week old
        self.assertEqual(cs.session_day(["2026-11-13"], "2026-11-15"), "2026-11-13")  # Sunday rerun

    def test_the_earliest_date_counts_trading_days_like_the_rule(self) -> None:
        # A price series with a holiday: the date said on the page is the session the rule allows.
        dates = [d for d in weekdays("2026-11-02", 30) if d != "2026-11-26"]
        f = cs.Facts(dates=dates[:5], closes=[100.0] * 5)
        state = {"call": "Add", "since": dates[0], "changes": []}
        held = cs.held_sessions(f, dates[0], dates[4])
        text = cs.what_would_change(state, dates[4], f, "Acme")
        self.assertIn(f"until at least {cs.short_day(cs.add_sessions(dates[4], cs.DEFAULT_RULES.min_hold_sessions - held))}", text)
        self.assertIn("a new outlook", text)

    def test_no_vote_and_no_state_gives_nothing(self) -> None:
        self.assertEqual(cs.stabilise(None, "", DAYS[START], facts(upto=DAYS[START])), (None, None))


class DirectiveTest(unittest.TestCase):
    def raw(self) -> dict:
        return {
            "version": "v2-shadow-2",
            "stance": "trim",
            "execution": "do_not_chase",
            "confidence": "medium",
            "action": {"label": "Do not add here", "summary": "Risk/reward has weakened."},
            "zones": {"accumulate_below": 95.0, "breakout_above": 120.0},
            "call_reason": "Acme is down 9% this week, so we'd sell some.",
            "watch_out": "Revisit if the stock resets.",
        }

    def test_held_call_gets_its_own_words_and_levels(self) -> None:
        view = {"version": cs.VERSION, "call": "Add", "since": "2026-10-01", "since_reason": None, "trigger": "start",
                "changed": False, "levels": {"accumulate_below": 97.0}, "levels_set_on": "2026-10-01",
                "what_would_change": "We'd move to Keep if our daily review leans toward selling for 4 trading days in a row."}
        out = cs.steady_directive(self.raw(), view)
        self.assertEqual(out["stance"], "accumulate")
        self.assertEqual(out["action"]["label"], "Accumulate on pullbacks")
        self.assertNotIn("call_reason", out)  # the vote's reason argued for Sell some
        self.assertEqual(out["zones"], {"accumulate_below": 97.0, "breakout_above": 120.0})
        self.assertEqual(out["watch_out"], view["what_would_change"])
        self.assertEqual(out["stability"]["since"], "2026-10-01")
        self.assertFalse(out["stability"]["held_against_vote"])
        self.assertEqual(out["raw_stance"], "trim")
        self.assertFalse(out["changed_from_previous"])

    def test_matching_call_keeps_the_vote_words(self) -> None:
        view = {"version": cs.VERSION, "call": "Trim", "since": "2026-11-05", "since_reason": "Acme reported results on Nov 4, so we moved our call from Buy more to Sell some.",
                "trigger": "earnings", "changed": True, "levels": {}, "levels_set_on": None, "what_would_change": "x"}
        out = cs.steady_directive(self.raw(), view)
        self.assertEqual(out["action"]["label"], "Do not add here")
        self.assertIn("call_reason", out)
        self.assertTrue(out["changed_from_previous"])
        self.assertEqual(out["change_reason"], view["since_reason"])
        self.assertNotIn("accumulate_below", out["zones"])


class PipelineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = object.__new__(TraceMoneyStore)
        self.store.db = LocalFirestoreClient(os.path.join(self.tmp.name, "docs.sqlite3"))
        cs._MARKET_CACHE.clear()
        self.addCleanup(cs._MARKET_CACHE.clear)

    def rows(self, upto: str) -> tuple[list[dict], list[dict]]:
        f = facts(upto=upto)
        stock = [{"captured_at": f"{d}T20:59:00+00:00", "quote": {"current": c}} for d, c in zip(f.dates[-65:], f.closes[-65:])]
        market = [{"captured_at": f"{d}T20:59:00+00:00", "quote": {"current": c}} for d, c in zip(f.market_dates[-65:], f.market_closes[-65:])]
        return stock, market

    def brief(self, stance: str, day: str, mode: str) -> dict:
        from datetime import datetime, timezone

        stock, market = self.rows(day)
        self.store.get_price_history = lambda instrument_id, limit=65: market if instrument_id == cs.MARKET_ID else stock  # type: ignore[method-assign]
        directive = {"stance": stance, "version": "v2-shadow-2", "action": {"label": "Hold here"}, "zones": {"accumulate_below": 90.0}}
        now = datetime.fromisoformat(f"{day}T19:00:00+00:00").astimezone(timezone.utc)
        fields = cs.run_for_brief(store=self.store, market="US", instrument={"instrument_id": "US_ACME", "name": "Acme"},
                                  directive=directive, history_points=stock, now_utc=now, mode=mode)
        cs._MARKET_CACHE.clear()
        return {"instrument_id": "US_ACME", "current_price": 100.0, "generated_at": f"{day}T19:00:00+00:00",
                "directive_v2": fields.pop("directive_v2", directive), **fields}

    def history_row(self, day: str) -> dict:
        return self.store.db.collection("tm_call_stability_history").document("US_ACME").collection("calls").document(day).get().to_dict()

    def test_shadow_saves_state_first_and_leaves_the_call(self) -> None:
        day = DAYS[START]
        doc = self.brief("accumulate", day, "shadow")
        self.assertEqual(doc["directive_v2"]["stance"], "accumulate")
        self.assertNotIn("stability", doc["directive_v2"])
        self.assertEqual(doc["call_stability"]["call"], "Add")
        self.assertEqual(doc["call_stability"]["mode"], "shadow")
        saved = self.store.get_call_stability_state("US_ACME")
        assert saved is not None
        self.assertEqual((saved["call"], saved["rev"]), ("Add", 1))
        self.assertEqual(saved["votes"], [{"day": day, "call": "Add"}])
        self.assertEqual((self.history_row(day)["call"], self.history_row(day)["raw_call"]), ("Add", "Add"))

        nxt = DAYS[START + 1]
        doc2 = self.brief("trim", nxt, "shadow")
        self.assertEqual(doc2["call_stability"]["call"], "Add")
        self.assertTrue(doc2["call_stability"]["held_against_vote"])
        saved = self.store.get_call_stability_state("US_ACME")
        self.assertEqual((saved["rev"], saved["votes"][-1]), (2, {"day": nxt, "call": "Trim"}))

    def test_on_publishes_the_steady_call_and_the_ledger_records_both(self) -> None:
        day = DAYS[START]
        self.brief("accumulate", day, "on")
        nxt = DAYS[START + 1]
        doc = self.brief("trim", nxt, "on")
        self.assertEqual(doc["directive_v2"]["stance"], "accumulate")
        self.assertEqual(doc["directive_v2"]["raw_stance"], "trim")
        self.assertEqual(doc["directive_v2"]["stability"]["since"], day)
        self.store.append_directive_history("US", [doc])
        row = self.store.db.collection("tm_directive_history").document("US_ACME").collection("calls").document(nxt).get().to_dict()
        self.assertEqual((row["stance"], row["raw_stance"], row["stability_since"]), ("accumulate", "trim", day))

    def test_a_save_that_lost_a_race_decides_again(self) -> None:
        self.brief("accumulate", DAYS[START], "shadow")
        real = self.store.save_call_stability_state
        calls = []

        def racing(instrument_id, state, *, expected_rev, history_row=None):
            calls.append(expected_rev)
            if len(calls) == 1:
                # Another run saves this stock between our read and our write.
                other = dict(self.store.get_call_stability_state(instrument_id))
                real(instrument_id, other, expected_rev=other["rev"], history_row=None)
                return real(instrument_id, state, expected_rev=expected_rev, history_row=history_row)
            return real(instrument_id, state, expected_rev=expected_rev, history_row=history_row)

        self.store.save_call_stability_state = racing  # type: ignore[method-assign]
        doc = self.brief("accumulate", DAYS[START + 1], "shadow")
        self.assertEqual(calls, [1, 2])  # the first write was refused, the second read the newer rev
        self.assertEqual(doc["call_stability"]["call"], "Add")
        self.assertEqual(self.store.get_call_stability_state("US_ACME")["rev"], 3)

    def test_a_failed_save_stops_on_mode_but_never_shadow(self) -> None:
        def broken(*_args, **_kwargs):
            raise OSError("disk full")

        self.store.save_call_stability_state = broken  # type: ignore[method-assign]
        with self.assertLogs("backend.call_stability", level="ERROR"):
            self.assertEqual(self.brief("accumulate", DAYS[START], "shadow")["directive_v2"]["stance"], "accumulate")
        with self.assertRaises(cs.CallStabilityError):
            self.brief("accumulate", DAYS[START], "on")

    def test_weekend_reruns_belong_to_friday(self) -> None:
        friday = next(d for d in DAYS[START:] if date.fromisoformat(d).weekday() == 4)
        self.brief("accumulate", friday, "shadow")
        saturday = (date.fromisoformat(friday) + timedelta(days=1)).isoformat()
        stock, market = self.rows(friday)
        self.store.get_price_history = lambda instrument_id, limit=65: market if instrument_id == cs.MARKET_ID else stock  # type: ignore[method-assign]
        from datetime import datetime

        cs.run_for_brief(store=self.store, market="US", instrument={"instrument_id": "US_ACME", "name": "Acme"},
                         directive={"stance": "hold"}, history_points=stock, now_utc=datetime.fromisoformat(f"{saturday}T15:00:00+00:00"), mode="shadow")
        self.assertEqual(self.store.get_call_stability_state("US_ACME")["session"], friday)

    def test_reports_are_read_from_the_store(self) -> None:
        self.store.db.collection("tm_earnings_history").document("ACME").set({"reports": [{"date": "2026-10-28", "session": "amc", "release": True, "items": ["2.02"]}]})
        self.store.db.collection("tm_earnings_events").document("ACME_2027-01-28").set({"market": "US", "ticker": "ACME", "event_date": "2027-01-28"})
        reports, upcoming = cs.load_report_rows(self.store, "acme")
        self.assertEqual([(r["date"], r["known_on"]) for r in reports], [("2026-10-28", "2026-10-29")])
        self.assertEqual(upcoming, ["2027-01-28"])


class BuilderTest(unittest.TestCase):
    """The news-backed brief builder with the flag off, in shadow and on."""

    def build(self, mode: str) -> dict:
        from backend.tests.test_call_engine_pipeline import FakeStore, build

        class Store(FakeStore):
            saved: dict = {}

            def get_call_stability_state(self, instrument_id):
                return self.saved.get(instrument_id)

            def save_call_stability_state(self, instrument_id, state, *, expected_rev, history_row=None):
                self.saved[instrument_id] = {**state, "rev": (expected_rev or 0) + 1}
                return True

        with patch.dict(os.environ, {cs.MODE_ENV: mode}):
            cs._MARKET_CACHE.clear()
            store = Store()
            store.saved = {}
            doc, _ = build(store, None)
            self.saved = store.saved
        return doc

    def test_off_is_unchanged_and_shadow_only_adds(self) -> None:
        off = self.build("off")
        self.assertEqual(self.saved, {})
        self.assertNotIn("call_stability", off)
        shadow = self.build("shadow")
        self.assertEqual(shadow["call_stability"]["mode"], "shadow")
        self.assertIn("US_NVDA", self.saved)
        for key in ("generated_at", "as_of", "run_context"):
            off.pop(key, None)
            shadow.pop(key, None)
        shadow.pop("call_stability")
        self.assertEqual(off, shadow)

    def test_on_publishes_the_steady_directive(self) -> None:
        on = self.build("on")
        self.assertIn("stability", on["directive_v2"])
        self.assertEqual(on["directive_v2"]["stability"]["since"], on["call_stability"]["since"])
        self.assertEqual(cs.call_word(on["directive_v2"]["stance"]), on["call_stability"]["call"])


class ReplayScriptTest(unittest.TestCase):
    def test_replay_cuts_flips_and_counts_them(self) -> None:
        from backend.scripts.replay_call_stability import flip_stats, replay_stock, ticker_for

        self.assertEqual(ticker_for("US_BRK_B"), "BRK.B")
        f = facts(upto=DAYS[START + 40])
        pattern = ["accumulate", "trim", "trim", "accumulate", "hold"]
        calls = [{"day": DAYS[START + i], "stance": pattern[i % 5], "trigger_type": "price_below", "trigger_value": 95.0} for i in range(40)]
        state, out = replay_stock(calls, f.dates, f.closes, (f.market_dates, f.market_closes), [], [], "Acme")
        assert state is not None
        raw = flip_stats({"US_ACME": [(d, r) for d, r, _ in out]}, f.market_dates)
        steady = flip_stats({"US_ACME": [(d, s) for d, _, s in out]}, f.market_dates)
        self.assertGreater(raw["changes"], 20)
        self.assertGreater(raw["add_trim_within_5_sessions"], 5)
        self.assertEqual(steady["changes"], 0)
        self.assertEqual(steady["add_trim_within_5_sessions"], 0)

    def test_seeding_starts_from_the_call_shown_now(self) -> None:
        from backend.scripts.replay_call_stability import run, seed_from_current

        calls = [{"day": DAYS[START + i], "stance": s, "trigger_type": "price_below", "trigger_value": 90.0}
                 for i, s in enumerate(["accumulate", "trim", "hold", "hold"])]
        seed = seed_from_current(calls)
        assert seed is not None
        self.assertEqual((seed["call"], seed["since"], seed["session"]), ("Hold", DAYS[START + 2], DAYS[START + 3]))
        self.assertEqual(seed["levels"]["accumulate_below"], 90.0)
        # The next day's vote is held: the seeded call is what people saw.
        _, view = cs.stabilise(seed, "trim", DAYS[START + 4], facts(upto=DAYS[START + 4]), name="Acme")
        self.assertEqual(view["call"], "Hold")
        self.assertFalse(view["changed"])

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        store = object.__new__(TraceMoneyStore)
        store.db = LocalFirestoreClient(os.path.join(tmp.name, "docs.sqlite3"))
        for call in calls:
            store.db.collection("tm_directive_history").document("US_ACME").collection("calls").document(call["day"]).set(call)
        dry = run(store)
        self.assertEqual((dry["status"], store.get_call_stability_state("US_ACME")), ("dry_run", None))
        result = run(store, write=True, seed_current=True)
        self.assertEqual(result["written"], 1)
        self.assertEqual(store.get_call_stability_state("US_ACME")["call"], "Hold")
        self.assertEqual(run(store, write=True, seed_current=True)["skipped"], 1)  # never overwrites unless asked


class OnModeSkipTest(unittest.TestCase):
    def test_a_stock_whose_state_cannot_be_saved_keeps_its_previous_brief(self) -> None:
        from backend.tests.test_call_engine_pipeline import FakeStore, build

        previous = {"instrument_id": "US_NVDA", "headline": "Yesterday's brief", "directive_v2": {"stance": "hold"}}

        class Broken(FakeStore):
            def get_call_stability_state(self, instrument_id):
                return None

            def save_call_stability_state(self, *_args, **_kwargs):
                raise OSError("disk full")

        with patch.dict(os.environ, {cs.MODE_ENV: "on"}):
            cs._MARKET_CACHE.clear()
            with self.assertLogs("backend.stock_intelligence", level="ERROR"):
                doc, _ = build(Broken(previous_doc=previous), None)
        self.assertEqual(doc, previous)

    def test_replay_counts_calls_on_their_new_york_day(self) -> None:
        from backend.scripts.replay_call_stability import trading_day

        self.assertEqual(trading_day("2026-11-11T00:30:00+00:00", "2026-11-11"), "2026-11-10")
        self.assertEqual(trading_day("2026-11-10T20:40:00+00:00", "x"), "2026-11-10")
        self.assertEqual(trading_day(None, "2026-11-09"), "2026-11-09")
