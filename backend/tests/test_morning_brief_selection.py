from __future__ import annotations

from datetime import datetime, timezone
import unittest

from backend.morning_brief_selection import (
    closes_before,
    day_move_pct,
    earnings_release_at,
    previous_session_lookback_hours,
    select_morning_briefs,
    typical_daily_move_pct,
)

# Tuesday 2026-11-10, 10:00 ET (EST, UTC-5).
NOW = datetime(2026, 11, 10, 15, 0, tzinfo=timezone.utc)
QUOTE_AT = "2026-11-10T14:50:00+00:00"  # the 09:50 ET batch
LAST_EVENING = "2026-11-09T21:25:00+00:00"  # yesterday's 16:25 ET brief


def _price(move: float | None, *, captured_at: str = QUOTE_AT, ticker: str = "") -> dict:
    quote: dict = {"current": 100.0, "captured_at": captured_at}
    if move is not None:
        quote["day_change_pct"] = move
    return {"quote": quote, "ticker": ticker, "session_phase": "open_check"}


def _select(
    ids: list[str],
    *,
    prices: dict | None = None,
    freshness: dict | None = None,
    briefs: dict | None = None,
    typical: dict | None = None,
    earnings: dict | None = None,
    held: list[str] | None = None,
    zone: list[str] | None = None,
    cap: int = 160,
):
    return select_morning_briefs(
        ids,
        prices=prices or {},
        freshness=freshness or {},
        briefs=briefs if briefs is not None else {iid: {"generated_at": LAST_EVENING} for iid in ids},
        typical_moves=typical or {},
        earnings_by_id=earnings or {},
        held_ids=held or [],
        zone_ids=zone or [],
        now=NOW,
        cap=cap,
    )


class MoveRuleTest(unittest.TestCase):
    def test_big_drop_without_news_gets_a_fresh_brief(self) -> None:
        # The ASTS case: -11% with no new headline kept yesterday's brief.
        result = _select(["US_ASTS"], prices={"US_ASTS": _price(-11.4)}, typical={"US_ASTS": 5.0})
        self.assertEqual(result.selected, ["US_ASTS"])
        self.assertEqual(result.reasons["US_ASTS"], ["move"])

    def test_three_percent_is_material_on_its_own(self) -> None:
        result = _select(["US_A", "US_B"], prices={"US_A": _price(3.0), "US_B": _price(-2.99)})
        self.assertEqual(result.selected, ["US_A"])
        self.assertEqual(result.skipped_fresh, ["US_B"])

    def test_two_times_typical_move_counts_for_quiet_stocks(self) -> None:
        result = _select(
            ["US_KO", "US_PEP"],
            prices={"US_KO": _price(1.7), "US_PEP": _price(1.5)},
            typical={"US_KO": 0.8, "US_PEP": 0.8},
        )
        self.assertEqual(result.selected, ["US_KO"])

    def test_relative_rule_has_a_floor_for_near_flat_instruments(self) -> None:
        result = _select(["US_SGOV"], prices={"US_SGOV": _price(0.3)}, typical={"US_SGOV": 0.05})
        self.assertEqual(result.selected, [])

    def test_brief_already_written_from_this_tape_is_skipped(self) -> None:
        result = _select(
            ["US_ASTS"],
            prices={"US_ASTS": _price(-11.4)},
            briefs={"US_ASTS": {"generated_at": "2026-11-10T14:58:00+00:00"}},
        )
        self.assertEqual(result.selected, [])
        self.assertEqual(result.skipped_fresh, ["US_ASTS"])

    def test_brief_written_from_the_0930_tape_is_rewritten(self) -> None:
        result = _select(
            ["US_ASTS"],
            prices={"US_ASTS": _price(-11.4)},
            freshness={"US_ASTS": {"latest_brief_at": "2026-11-10T14:44:00+00:00"}},
        )
        self.assertEqual(result.selected, ["US_ASTS"])

    def test_move_falls_back_to_previous_close(self) -> None:
        self.assertAlmostEqual(day_move_pct({"quote": {"current": 92, "previous_close": 100}}), -8.0)
        self.assertIsNone(day_move_pct({"quote": {"current": 92}}))
        self.assertIsNone(day_move_pct(None))


class NewsAndZoneRuleTest(unittest.TestCase):
    def test_changed_news_and_missing_briefs_are_selected(self) -> None:
        result = _select(
            ["US_NEWS", "US_NEW", "US_QUIET"],
            prices={iid: _price(0.4) for iid in ["US_NEWS", "US_NEW", "US_QUIET"]},
            freshness={"US_NEWS": {"needs_brief_refresh": True}},
            briefs={"US_NEWS": {"generated_at": LAST_EVENING}, "US_QUIET": {"generated_at": LAST_EVENING}},
        )
        self.assertEqual(result.reasons, {"US_NEW": ["missing_brief"], "US_NEWS": ["news"]})
        self.assertEqual(result.skipped_fresh, ["US_QUIET"])

    def test_zone_name_with_old_brief_is_selected_fresh_one_is_not(self) -> None:
        result = _select(
            ["US_OLD", "US_RECENT"],
            prices={"US_OLD": _price(0.5), "US_RECENT": _price(0.5)},
            briefs={
                "US_OLD": {"generated_at": "2026-11-08T21:00:00+00:00"},
                "US_RECENT": {"generated_at": LAST_EVENING},
            },
            zone=["US_OLD", "US_RECENT"],
        )
        self.assertEqual(result.selected, ["US_OLD"])
        self.assertEqual(result.reasons["US_OLD"], ["zone"])


class EarningsRuleTest(unittest.TestCase):
    def test_held_stock_after_close_print_is_selected_next_morning(self) -> None:
        # Brief written at 16:25 ET from pre-close news, print at ~16:00 ET.
        result = _select(
            ["US_ASTS"],
            prices={"US_ASTS": _price(0.5)},
            freshness={"US_ASTS": {"latest_brief_at": LAST_EVENING, "latest_article_at": "2026-11-09T19:00:00+00:00"}},
            earnings={"US_ASTS": [{"event_date": "2026-11-09", "time": "amc"}]},
            held=["US_ASTS"],
        )
        self.assertEqual(result.reasons["US_ASTS"], ["earnings"])

    def test_not_held_print_is_not_an_earnings_reason(self) -> None:
        result = _select(
            ["US_X"],
            prices={"US_X": _price(0.5)},
            earnings={"US_X": [{"event_date": "2026-11-09", "time": "amc"}]},
        )
        self.assertEqual(result.selected, [])

    def test_print_the_last_brief_already_read_is_skipped(self) -> None:
        result = _select(
            ["US_A"],
            prices={"US_A": _price(0.5)},
            freshness={
                "US_A": {
                    "latest_brief_at": "2026-11-09T22:30:00+00:00",
                    "latest_article_at": "2026-11-09T21:15:00+00:00",
                }
            },
            earnings={"US_A": [{"event_date": "2026-11-09", "time": "amc"}]},
            held=["US_A"],
        )
        self.assertEqual(result.selected, [])

    def test_today_after_close_print_has_not_happened_yet(self) -> None:
        result = _select(
            ["US_A"],
            prices={"US_A": _price(0.5)},
            earnings={"US_A": [{"event_date": "2026-11-10", "time": "amc"}]},
            held=["US_A"],
        )
        self.assertEqual(result.selected, [])

    def test_friday_print_reaches_monday_morning(self) -> None:
        monday = datetime(2026, 11, 16, 15, 0, tzinfo=timezone.utc)
        result = select_morning_briefs(
            ["US_A"],
            prices={"US_A": _price(0.5, captured_at="2026-11-16T14:50:00+00:00")},
            freshness={"US_A": {"latest_brief_at": "2026-11-13T21:25:00+00:00"}},
            briefs={"US_A": {"generated_at": "2026-11-13T21:25:00+00:00"}},
            typical_moves={},
            earnings_by_id={"US_A": [{"event_date": "2026-11-13", "time": "amc"}]},
            held_ids=["US_A"],
            zone_ids=[],
            now=monday,
        )
        self.assertEqual(result.reasons["US_A"], ["earnings"])

    def test_release_times_follow_the_calendar_label(self) -> None:
        self.assertEqual(
            earnings_release_at({"event_date": "2026-11-09", "time": "bmo"}).isoformat(),
            "2026-11-09T12:00:00+00:00",
        )
        self.assertEqual(
            earnings_release_at({"event_date": "2026-07-09", "time": "amc"}).isoformat(),
            "2026-07-09T20:00:00+00:00",
        )
        self.assertIsNone(earnings_release_at({"event_date": "soon"}))


class CapAndSummaryTest(unittest.TestCase):
    def test_cap_keeps_earnings_then_biggest_moves(self) -> None:
        ids = ["US_NEWS", "US_SMALL", "US_BIG", "US_EARN"]
        result = _select(
            ids,
            prices={
                "US_NEWS": _price(0.1),
                "US_SMALL": _price(-3.5),
                "US_BIG": _price(9.0),
                "US_EARN": _price(0.2),
            },
            freshness={
                "US_NEWS": {"needs_brief_refresh": True},
                "US_EARN": {"latest_brief_at": LAST_EVENING},
            },
            earnings={"US_EARN": [{"event_date": "2026-11-10", "time": "bmo"}]},
            held=["US_EARN"],
            cap=3,
        )
        self.assertEqual(result.selected, ["US_EARN", "US_BIG", "US_SMALL"])
        self.assertEqual(result.dropped_by_cap, ["US_NEWS"])
        summary = result.summary()
        self.assertEqual(summary["selected"], 3)
        self.assertEqual(summary["selected_by_reason"]["move"], 2)
        self.assertEqual(summary["selected_by_reason"]["earnings"], 1)
        self.assertEqual(summary["selected_by_reason"]["news"], 0)
        self.assertEqual(summary["dropped_by_cap"], 1)
        self.assertEqual(summary["selected_ids"][1], {"id": "US_BIG", "reasons": ["move"], "move_pct": 9.0, "typical_pct": None})

    def test_zero_or_negative_cap_means_no_cap(self) -> None:
        prices = {"US_A": _price(4.0), "US_B": _price(5.0)}
        for cap in (0, -1):
            with self.subTest(cap=cap):
                result = _select(["US_A", "US_B"], prices=prices, cap=cap)
                self.assertEqual(result.selected, ["US_B", "US_A"])
                self.assertEqual(result.dropped_by_cap, [])

    def test_candidates_are_deduped_and_normalised(self) -> None:
        result = _select(["us_a", "US_A", ""], prices={"US_A": _price(4.0)}, briefs={"US_A": {"generated_at": LAST_EVENING}})
        self.assertEqual(result.candidate_count, 1)
        self.assertEqual(result.selected, ["US_A"])


class HelpersTest(unittest.TestCase):
    def test_typical_move_is_the_median_absolute_daily_move(self) -> None:
        closes = [100.0]
        for index in range(31):
            closes.append(closes[-1] * (1.02 if index < 20 else 0.99))
        self.assertAlmostEqual(typical_daily_move_pct(closes), 2.0, places=6)
        self.assertIsNone(typical_daily_move_pct(closes[:10]))
        self.assertIsNone(typical_daily_move_pct([]))

    def test_typical_move_ignores_todays_partial_bar(self) -> None:
        dates = ["2026-11-06", "2026-11-09", "2026-11-10"]
        self.assertEqual(closes_before(dates, [1, 2, 3], datetime(2026, 11, 10).date()), [1, 2])

    def test_monday_morning_reads_news_back_to_friday(self) -> None:
        monday = datetime(2026, 11, 16, 15, 0, tzinfo=timezone.utc)
        hours = previous_session_lookback_hours(["2026-11-12", "2026-11-13", "2026-11-16"], now=monday)
        self.assertEqual(hours, 73)  # Friday 09:30 ET -> Monday 10:00 ET

    def test_tuesday_after_a_holiday_reads_back_to_the_last_session(self) -> None:
        # Provider bars skip the holiday Monday, so the window reaches Friday.
        tuesday = datetime(2026, 11, 17, 15, 0, tzinfo=timezone.utc)
        hours = previous_session_lookback_hours(["2026-11-13", "2026-11-17"], now=tuesday)
        self.assertEqual(hours, 97)

    def test_lookback_never_drops_below_a_day(self) -> None:
        self.assertEqual(previous_session_lookback_hours(["2026-11-09"], now=NOW), 25)
        self.assertEqual(previous_session_lookback_hours([], now=NOW), 25)


if __name__ == "__main__":
    unittest.main()
