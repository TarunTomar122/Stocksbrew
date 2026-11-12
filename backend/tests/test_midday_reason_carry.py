"""Midday mover rebuild: keep the session's verified reasons, research only what is new."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.scripts import build_daily_anomalies as builder
from backend.scripts.research_daily_anomaly_reasons import _is_final_explanation

DAY_STAMP = "2026-11-11T15:00:00+00:00"  # 10:00 AM New York
NEXT_DAY_STAMP = "2026-11-12T15:00:00+00:00"


def _sourced(headline: str = "CoreWeave rallies on strong results", why: str = "Results beat and guidance rose.") -> dict:
    return {
        "cause_type": "earnings",
        "dominant_angle": "hard_catalyst",
        "headline": headline,
        "why_it_matters": why,
        "confidence": "high",
        "searched_externally": True,
        "external_source": "mover_research",
        "evidence": [{"title": "Q3 results", "url": "https://example.com/crwv"}],
    }


def _row(ticker: str, pct: float, *, stamp: str = DAY_STAMP, explanation: dict | None = None) -> dict:
    row = {
        "instrument_id": f"US_{ticker}",
        "ticker": ticker,
        "day_change_pct": pct,
        "direction": "up" if pct >= 0 else "down",
        "price_as_of": stamp,
        "narrative_status": "unverified",
        "narrative_as_of": None,
        "move_explanation": None,
        "headline": None,
        "key_points": [],
    }
    if explanation is not None:
        row.update(narrative_status="verified", narrative_as_of=stamp, move_explanation=explanation)
    return row


def _feed(rows: list[dict], phase: str = "open_check") -> dict:
    return {"price_session_phase": phase, "generated_at": DAY_STAMP, "anomalies": rows}


class CarrySessionReasonsTest(unittest.TestCase):
    def test_same_session_same_direction_keeps_the_reason(self) -> None:
        previous = _feed([_row("CRWV", 18.0, explanation=_sourced())])
        rows = [_row("CRWV", 24.8, stamp="2026-11-11T19:20:00+00:00")]
        carried = builder.carry_session_reasons(previous, rows, market="US")
        self.assertEqual(carried, ["CRWV"])
        self.assertEqual(rows[0]["narrative_status"], "verified")
        self.assertEqual(rows[0]["move_explanation"]["headline"], "CoreWeave rallies on strong results")
        # The research time stays the morning's; the quote fields stay the new ones.
        self.assertEqual(rows[0]["narrative_as_of"], DAY_STAMP)
        self.assertEqual(rows[0]["day_change_pct"], 24.8)
        self.assertEqual(rows[0]["price_as_of"], "2026-11-11T19:20:00+00:00")
        # The reason pass treats a carried row as done.
        self.assertTrue(_is_final_explanation(rows[0]))

    def test_carried_reason_is_a_copy(self) -> None:
        previous = _feed([_row("CRWV", 18.0, explanation=_sourced())])
        rows = [_row("CRWV", 20.0)]
        builder.carry_session_reasons(previous, rows, market="US")
        rows[0]["move_explanation"]["headline"] = "changed"
        self.assertEqual(previous["anomalies"][0]["move_explanation"]["headline"], "CoreWeave rallies on strong results")

    def test_direction_flip_drops_the_reason(self) -> None:
        previous = _feed([_row("MU", 3.0, explanation=_sourced("Micron jumps on AI demand"))])
        rows = [_row("MU", -2.0)]
        self.assertEqual(builder.carry_session_reasons(previous, rows, market="US"), [])
        self.assertEqual(rows[0]["narrative_status"], "unverified")
        self.assertIsNone(rows[0]["move_explanation"])

    def test_never_across_days(self) -> None:
        previous = _feed([_row("CRWV", 18.0, explanation=_sourced())])
        rows = [_row("CRWV", 20.0, stamp=NEXT_DAY_STAMP)]
        self.assertEqual(builder.carry_session_reasons(previous, rows, market="US"), [])
        # Same day quote, but the reason itself was researched the day before.
        stale = _row("CRWV", 18.0, explanation=_sourced())
        stale["narrative_as_of"] = "2026-11-10T20:00:00+00:00"
        rows = [_row("CRWV", 20.0)]
        self.assertEqual(builder.carry_session_reasons(_feed([stale]), rows, market="US"), [])

    def test_new_york_day_not_utc_day(self) -> None:
        # 7:30 PM ET on Nov 11 is Nov 12 in UTC; both quotes are the Nov 11 session.
        previous = _feed([_row("CRWV", 18.0, stamp="2026-11-11T15:00:00+00:00", explanation=_sourced())])
        rows = [_row("CRWV", 20.0, stamp="2026-11-12T00:30:00+00:00")]
        self.assertEqual(builder.carry_session_reasons(previous, rows, market="US"), ["CRWV"])

    def test_only_from_an_intraday_feed(self) -> None:
        for phase in ("post_close", "close_check", None):
            previous = _feed([_row("CRWV", 18.0, explanation=_sourced())], phase=phase)
            rows = [_row("CRWV", 20.0)]
            self.assertEqual(builder.carry_session_reasons(previous, rows, market="US"), [], phase)
        previous = _feed([_row("CRWV", 18.0, explanation=_sourced())], phase="mid_check")
        self.assertEqual(builder.carry_session_reasons(previous, [_row("CRWV", 20.0)], market="US"), ["CRWV"])

    def test_tape_reads_and_unresolved_rows_are_researched_again(self) -> None:
        tape = _sourced("NLST reverses recent gains", "NLST fell 6.84% after a prior gain.")
        tape.update(cause_type="price_action", external_source="internal_tape_after_source_search", evidence=[])
        none = _sourced("--", "")
        none.update(cause_type="no_verified_catalyst", external_source=None, evidence=[])
        unsourced = _sourced()
        unsourced["evidence"] = []
        previous = _feed(
            [
                _row("NLST", -6.8, explanation=tape),
                _row("AIRJW", 35.9, explanation=none),
                _row("SOXL", 17.9, explanation=unsourced),
            ]
        )
        rows = [_row("NLST", -7.5), _row("AIRJW", 30.0), _row("SOXL", 17.0)]
        self.assertEqual(builder.carry_session_reasons(previous, rows, market="US"), [])
        self.assertFalse(any(_is_final_explanation(row) for row in rows))

    def test_reason_quoting_the_old_move_size_is_dropped_once_the_move_changes(self) -> None:
        quoted = _sourced("Jefferies Buy rating sends FormFactor higher", "The note supports the 11.85% gain.")
        previous = _feed([_row("FORM", 11.85, explanation=quoted)])
        moved = [_row("FORM", 15.2)]
        self.assertEqual(builder.carry_session_reasons(previous, moved, market="US"), [])
        steady = [_row("FORM", 12.1)]
        self.assertEqual(builder.carry_session_reasons(previous, steady, market="US"), ["FORM"])
        # Other figures in the reason ("259% revenue growth") are not the move and do not block it.
        other = _sourced("Firefly rallies on revenue", "Firefly reported 259% revenue growth.")
        previous = _feed([_row("FLY", 12.3, explanation=other)])
        self.assertEqual(builder.carry_session_reasons(previous, [_row("FLY", 16.0)], market="US"), ["FLY"])

    def test_a_move_that_outgrew_its_reason_is_researched_again(self) -> None:
        # An upgrade explained a 2% move; at 18% something else is going on.
        previous = _feed([_row("ABC", 2.0, explanation=_sourced("Analyst upgrade lifts ABC"))])
        self.assertEqual(builder.carry_session_reasons(previous, [_row("ABC", 18.0)], market="US"), [])
        self.assertEqual(builder.carry_session_reasons(previous, [_row("ABC", 4.9)], market="US"), ["ABC"])
        # Larger moves get proportionally more room: 20% -> 29% is fine, 20% -> 31% is not.
        previous = _feed([_row("ABC", 20.0, explanation=_sourced())])
        self.assertEqual(builder.carry_session_reasons(previous, [_row("ABC", 29.0)], market="US"), ["ABC"])
        self.assertEqual(builder.carry_session_reasons(previous, [_row("ABC", 31.0)], market="US"), [])
        # A shrinking move keeps its reason.
        self.assertEqual(builder.carry_session_reasons(previous, [_row("ABC", 6.0)], market="US"), ["ABC"])

    def test_checks_run_against_the_move_the_reason_was_written_for(self) -> None:
        # Researched at 11.3% ("up 12%"), carried at 12:30 with the row at 12.4%; at 14:30 the row is
        # at 14% and the morning figure no longer fits, even though it is close to the 12:30 row.
        explanation = _sourced("FormFactor up 12% on a Buy rating", "Jefferies initiated at Buy.")
        explanation["researched_day_change_pct"] = 11.3
        previous = _feed([_row("FORM", 12.4, explanation=explanation)], phase="mid_check")
        self.assertEqual(builder.carry_session_reasons(previous, [_row("FORM", 12.6)], market="US"), ["FORM"])
        self.assertEqual(builder.carry_session_reasons(previous, [_row("FORM", 14.0)], market="US"), [])

    def test_percent_figures(self) -> None:
        fits = builder._reason_still_fits_move
        # "percent" in words counts; ".5%" is not "5%".
        self.assertFalse(fits(_sourced("ABC jumps 5 percent"), 5.0, 7.0))
        self.assertTrue(fits(_sourced("Margins widen by 0.5%"), 5.0, 7.0))
        self.assertTrue(fits(_sourced("Guidance up .5%"), 5.0, 7.0))
        self.assertTrue(fits(_sourced("ABC rises on results"), 5.0, 7.0))

    def test_a_reason_from_the_days_archive_comes_back_with_the_stock(self) -> None:
        # MU was explained at 09:50, missed the 12:30 list, and is back at 14:30.
        previous = _feed([_row("CRWV", 18.0, explanation=_sourced())], phase="mid_check")
        archived = {"anomalies": [_row("MU", 5.0, explanation=_sourced("Micron jumps on AI demand"))]}
        rows = [_row("CRWV", 19.0), _row("MU", 6.0)]
        carried = builder.carry_session_reasons(previous, rows, market="US", archived=archived)
        self.assertEqual(carried, ["CRWV", "MU"])
        # The live feed wins over the archive for the same stock.
        archived = {"anomalies": [_row("CRWV", 18.0, explanation=_sourced("Older CoreWeave reason"))]}
        rows = [_row("CRWV", 19.0)]
        builder.carry_session_reasons(previous, rows, market="US", archived=archived)
        self.assertEqual(rows[0]["move_explanation"]["headline"], "CoreWeave rallies on strong results")
        # The archive alone, beside a post-close feed, carries nothing.
        rows = [_row("MU", 6.0)]
        closed = _feed([], phase="post_close")
        archived = {"anomalies": [_row("MU", 5.0, explanation=_sourced())]}
        self.assertEqual(builder.carry_session_reasons(closed, rows, market="US", archived=archived), [])

    def test_daily_bar_label_keeps_its_date(self) -> None:
        self.assertEqual(builder._market_day("2026-11-11T00:00:00+00:00", "US"), "2026-11-11")
        self.assertEqual(builder._market_day("2026-11-12T00:30:00+00:00", "US"), "2026-11-11")

    def test_new_movers_stay_unresolved_and_missing_previous_is_a_no_op(self) -> None:
        previous = _feed([_row("CRWV", 18.0, explanation=_sourced())])
        rows = [_row("CRWV", 20.0), _row("NEW", 9.0)]
        self.assertEqual(builder.carry_session_reasons(previous, rows, market="US"), ["CRWV"])
        self.assertEqual(rows[1]["narrative_status"], "unverified")
        self.assertEqual(builder.carry_session_reasons(None, [_row("NEW", 9.0)], market="US"), [])
        self.assertEqual(builder.carry_session_reasons({}, [_row("NEW", 9.0)], market="US"), [])


class MiddayBuilderMainTest(unittest.TestCase):
    """Run builder main() against a throwaway LocalDB file."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        env = patch.dict(os.environ, {"LOCALDB_PATH": str(Path(self._tmp.name) / "docs.sqlite3")})
        env.start()
        self.addCleanup(env.stop)
        self.store = builder.TraceMoneyStore()
        now = datetime.now(timezone.utc)
        self.now_iso = now.isoformat()
        earlier = (now - timedelta(seconds=30)).isoformat()
        self.instruments = [
            {"instrument_id": f"US_{ticker}", "ticker": ticker, "name": ticker}
            for ticker in ("CRWV", "MU", "NEW", "FLAT")
        ]
        moves = {"CRWV": 22.0, "MU": -3.0, "NEW": 8.0, "FLAT": 0.1}
        for ticker, pct in moves.items():
            self.store.db.collection("tm_latest_prices").document(f"US_{ticker}").set(
                {
                    "session_phase": "mid_check",
                    "captured_at": self.now_iso,
                    "updated_at": self.now_iso,
                    "quote": {"current": 100.0, "day_change_pct": pct, "previous_close": 100.0 / (1 + pct / 100)},
                }
            )
        self.previous = {
            "market": "US",
            "price_session_phase": "open_check",
            "generated_at": earlier,
            "reasoned_at": earlier,
            "anomalies": [
                _row("CRWV", 18.0, stamp=earlier, explanation=_sourced()),
                _row("MU", 4.0, stamp=earlier, explanation=_sourced("Micron jumps on AI demand")),
            ],
        }
        self.latest_ref = self.store.db.collection("tm_daily_anomalies").document("US__latest")
        self.latest_ref.set(deepcopy(self.previous))

    def _main(self, *extra: str) -> list[str]:
        argv = [
            "build_daily_anomalies",
            "--market",
            "US",
            "--universe",
            "us_test",
            "--mover-reasoning-only",
            "--require-price-session-phase",
            "mid_check",
            "--carry-session-reasons",
            *extra,
        ]
        printed: list[str] = []
        with patch("sys.argv", argv), patch.object(
            builder, "_load_scan_instruments", return_value=deepcopy(self.instruments)
        ), patch.object(builder, "fresh_sector_summary_from_prices", return_value=([], None, 0)), patch.object(
            builder, "trigger_web_revalidate", return_value=True
        ) as revalidate, patch("builtins.print", side_effect=lambda *a, **k: printed.append(str(a[0]))):
            builder.main()
        self.revalidate = revalidate
        return printed

    def test_dry_run_reports_the_carry_and_writes_nothing(self) -> None:
        printed = self._main("--dry-run")
        self.assertEqual(self.latest_ref.get().to_dict(), self.previous)
        self.assertFalse(self.store.db.collection("tm_daily_anomaly_tickers").document("US__CRWV").get().exists)
        self.assertFalse(self.store.db.collection("tm_daily_anomaly_ticker_index").document("US").get().exists)
        self.revalidate.assert_not_called()
        self.assertIn("'carried': ['CRWV']", printed[-1])
        self.assertIn("'to_research': ['NEW', 'MU']", printed[-1])

    def test_rebuild_keeps_morning_reasons_and_leaves_only_new_work(self) -> None:
        self._main()
        feed = self.latest_ref.get().to_dict()
        self.assertEqual(feed["price_session_phase"], "mid_check")
        self.assertEqual(feed["carried_reason_count"], 1)
        rows = {row["ticker"]: row for row in feed["anomalies"]}
        self.assertEqual(set(rows), {"CRWV", "NEW", "MU"})
        self.assertEqual(rows["CRWV"]["move_explanation"]["headline"], "CoreWeave rallies on strong results")
        self.assertEqual(rows["CRWV"]["day_change_pct"], 22.0)
        self.assertEqual(rows["CRWV"]["price_as_of"], self.now_iso)
        # MU flipped from up to down: its morning reason is gone.
        self.assertIsNone(rows["MU"]["move_explanation"])
        to_research = sorted(ticker for ticker, row in rows.items() if not _is_final_explanation(row))
        self.assertEqual(to_research, ["MU", "NEW"])
        ticker_doc = self.store.db.collection("tm_daily_anomaly_tickers").document("US__CRWV").get().to_dict()
        self.assertEqual(ticker_doc["anomaly"]["narrative_status"], "verified")
        self.revalidate.assert_called_once()

    def test_carry_flag_is_refused_outside_mid_check(self) -> None:
        for extra in (
            ["--mover-reasoning-only", "--require-price-session-phase", "post_close"],
            ["--require-price-session-phase", "mid_check"],
        ):
            argv = ["build_daily_anomalies", "--market", "US", *extra, "--carry-session-reasons"]
            with patch("sys.argv", argv), patch("sys.stderr"), self.assertRaises(SystemExit):
                builder.main()
        self.assertEqual(self.latest_ref.get().to_dict(), self.previous)


if __name__ == "__main__":
    unittest.main()
