from __future__ import annotations

import unittest

from backend.scripts.build_per_stock_intelligence import (
    _material_price_signal,
    _price_signal_changed_materially,
)


def _price_doc(*, current: float, day_change: float, prior: list[tuple[str, float]]) -> dict:
    return {
        "captured_at": "2026-07-30T14:00:00+00:00",
        "quote": {
            "current": current,
            "day_change_pct": day_change,
            "captured_at": "2026-07-30T14:00:00+00:00",
        },
        "recent_sessions": [
            {
                "date": day,
                "close": price,
            }
            for day, price in prior
        ],
    }


class TrackedBriefPriceTriggerTest(unittest.TestCase):
    def test_large_move_against_prior_five_sessions_is_a_reversal_trigger(self) -> None:
        signal = _material_price_signal(
            _price_doc(
                current=130,
                day_change=8.3,
                prior=[
                    ("2026-07-23", 180),
                    ("2026-07-24", 170),
                    ("2026-07-27", 160),
                    ("2026-07-28", 150),
                    ("2026-07-29", 120),
                ],
            ),
            phase="open_check",
        )

        self.assertIsNotNone(signal)
        self.assertTrue(signal["reversal"])
        self.assertEqual(signal["day_change_pct"], 8.3)
        self.assertEqual(signal["prior_five_session_change_pct"], -33.33)

    def test_small_quote_tick_does_not_trigger_an_ai_refresh(self) -> None:
        signal = _material_price_signal(
            _price_doc(
                current=101,
                day_change=1.0,
                prior=[
                    ("2026-07-23", 99),
                    ("2026-07-24", 100),
                    ("2026-07-27", 99),
                    ("2026-07-28", 100),
                    ("2026-07-29", 100),
                ],
            ),
            phase="open_check",
        )

        self.assertIsNone(signal)

    def test_sparse_fetch_history_is_not_treated_as_session_tape(self) -> None:
        price_doc = {
            "captured_at": "2026-07-30T14:00:00+00:00",
            "quote": {
                "current": 130,
                "day_change_pct": 8.3,
                "captured_at": "2026-07-30T14:00:00+00:00",
            },
            "history_window": [
                {
                    "captured_at": "2026-07-01T20:00:00+00:00",
                    "quote": {"current": 100},
                },
                {
                    "captured_at": "2026-07-22T20:00:00+00:00",
                    "quote": {"current": 120},
                },
            ],
        }

        self.assertIsNone(_material_price_signal(price_doc, phase="open_check"))

    def test_phase_change_alone_does_not_change_price_fingerprint(self) -> None:
        price_doc = _price_doc(
            current=130,
            day_change=8.3,
            prior=[
                ("2026-07-23", 180),
                ("2026-07-24", 170),
                ("2026-07-27", 160),
                ("2026-07-28", 150),
                ("2026-07-29", 120),
            ],
        )

        open_signal = _material_price_signal(price_doc, phase="open_check")
        close_signal = _material_price_signal(price_doc, phase="postclose")

        self.assertEqual(open_signal["fingerprint"], close_signal["fingerprint"])

    def test_small_same_day_tape_drift_reuses_existing_brief(self) -> None:
        previous_signal = {
            "captured_day": "2026-07-30",
            "phase": "open_check",
            "day_change_pct": 8.3,
            "prior_five_session_change_pct": -33.33,
            "five_session_change_pct": -27.78,
            "reversal": True,
            "continuation": False,
            "breakout": False,
            "fingerprint": "open",
        }
        close_signal = dict(
            previous_signal,
            phase="postclose",
            day_change_pct=8.8,
            five_session_change_pct=-27.3,
            fingerprint="close",
        )

        self.assertFalse(
            _price_signal_changed_materially(
                close_signal,
                {"price_brief_signal": previous_signal},
            )
        )

    def test_material_same_day_tape_change_refreshes_brief(self) -> None:
        previous_signal = {
            "captured_day": "2026-07-30",
            "phase": "open_check",
            "day_change_pct": 5.2,
            "prior_five_session_change_pct": 3.0,
            "five_session_change_pct": 8.3,
            "reversal": False,
            "continuation": False,
            "breakout": False,
            "fingerprint": "open",
        }
        close_signal = dict(
            previous_signal,
            phase="postclose",
            day_change_pct=10.4,
            five_session_change_pct=13.9,
            continuation=True,
            fingerprint="close",
        )

        self.assertTrue(
            _price_signal_changed_materially(
                close_signal,
                {"price_brief_signal": previous_signal},
            )
        )


class RefreshSelectedTest(unittest.TestCase):
    """The morning dispatcher picks stocks; the synthesis must not re-narrow them."""

    def _run(self, *extra: str):
        import sys
        from unittest.mock import MagicMock, patch

        from backend.scripts import build_per_stock_intelligence as script

        store = MagicMock()
        store.list_subscribed_users.return_value = []
        store.list_instruments.return_value = [
            {"instrument_id": "US_ASTS", "ticker": "ASTS"},
            {"instrument_id": "US_KO", "ticker": "KO"},
        ]
        store.get_news_freshness_docs.return_value = {}
        store.get_stock_intelligence_docs_batch.return_value = {
            "US_ASTS": {"generated_at": "2026-11-09T21:25:00+00:00"},
            "US_KO": {"generated_at": "2026-11-09T21:25:00+00:00"},
        }
        store.get_latest_prices.return_value = {}
        store.list_article_enrichments_for_tickers.return_value = []
        argv = [
            "build_per_stock_intelligence",
            "--market", "US",
            "--universe", "us_core_155",
            "--instrument-ids", "US_ASTS,US_KO",
            "--upsert", "--synthesis-only", "--incremental", "--include-no-news",
            "--require-complete", "--skip-context", "--skip-materialize",
            *extra,
        ]

        def build_docs(_market, _universe, instruments, _articles, **_kwargs):
            return [{"instrument_id": row["instrument_id"]} for row in instruments]

        with patch.object(sys, "argv", argv), patch.object(
            script, "TraceMoneyStore", return_value=store
        ), patch.object(script, "list_instruments", return_value=[]), patch.object(
            script, "configure_pipeline_logging"
        ), patch.object(
            script, "build_stock_intelligence_docs", side_effect=build_docs
        ) as build:
            script.main()
        return build, store

    def test_selected_mode_rewrites_every_requested_stock(self) -> None:
        build, store = self._run("--refresh-selected")
        built = [row["instrument_id"] for row in build.call_args.args[2]]
        self.assertEqual(sorted(built), ["US_ASTS", "US_KO"])
        saved = store.save_news_freshness_docs.call_args.args[0]
        self.assertEqual({row["instrument_id"] for row in saved}, {"US_ASTS", "US_KO"})
        self.assertTrue(all(row["needs_brief_refresh"] is False and row["latest_brief_at"] for row in saved))

    def test_incremental_mode_still_skips_unchanged_stocks(self) -> None:
        build, _store = self._run()
        build.assert_not_called()

    def test_selected_mode_requires_the_incremental_synthesis_path(self) -> None:
        import sys
        from unittest.mock import patch

        from backend.scripts import build_per_stock_intelligence as script

        with patch.object(sys, "argv", ["x", "--refresh-selected", "--synthesis-only"]):
            with self.assertRaises(ValueError):
                script.main()
