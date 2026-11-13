from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.scripts.trigger_web_revalidate import (
    notify_indexnow_families,
    trigger_web_revalidate,
)


class TriggerWebRevalidateTests(unittest.TestCase):
    @patch("backend.scripts.trigger_web_revalidate.requests.post")
    def test_force_is_sent_to_authenticated_revalidation_endpoint(self, post) -> None:
        post.return_value.status_code = 200
        post.return_value.text = '{"ok":true}'

        with patch.dict(
            "os.environ",
            {
                "WEB_REVALIDATE_BASE_URL": "https://www.stocksbrew.online",
                "WEB_REVALIDATE_TOKEN": "test-token",
            },
            clear=False,
        ):
            result = trigger_web_revalidate(["/premarket", "/pulse"], force=True)

        self.assertTrue(result)
        self.assertEqual(
            post.call_args.kwargs["json"],
            {"paths": ["/premarket", "/pulse"], "force": True},
        )

    @patch("backend.scripts.trigger_web_revalidate.requests.post")
    def test_can_notify_indexnow_after_revalidation(self, post) -> None:
        post.return_value.status_code = 200
        post.return_value.text = '{"ok":true}'

        with patch.dict(
            "os.environ",
            {
                "WEB_REVALIDATE_BASE_URL": "https://www.stocksbrew.online",
                "WEB_REVALIDATE_TOKEN": "test-token",
            },
            clear=False,
        ):
            result = trigger_web_revalidate(
                ["/market-daily", "/market-daily/2026-08-01", "/sitemap.xml"],
                force=True,
                notify_indexnow=True,
            )

        self.assertTrue(result)
        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args_list[1].args[0], "https://www.stocksbrew.online/api/seo/indexnow")
        self.assertEqual(
            post.call_args_list[1].kwargs["json"],
            {
                "urls": ["/market-daily", "/market-daily/2026-08-01"],
                "include_defaults": False,
            },
        )

    @patch("backend.scripts.trigger_web_revalidate.requests.post")
    def test_submits_sitemap_families_changed_since_a_day(self, post) -> None:
        post.return_value.status_code = 200
        post.return_value.text = '{"ok":true}'

        with patch.dict(
            "os.environ",
            {
                "WEB_REVALIDATE_BASE_URL": "https://www.stocksbrew.online/",
                "WEB_REVALIDATE_TOKEN": "test-token",
            },
            clear=False,
        ):
            post.return_value.json.return_value = {"ok": True}
            result = notify_indexnow_families(["stocks"], changed_since="2026-11-11")

        self.assertTrue(result)
        self.assertEqual(post.call_args.args[0], "https://www.stocksbrew.online/api/seo/indexnow")
        self.assertEqual(
            post.call_args.kwargs["json"],
            {"families": ["stocks"], "include_defaults": False, "changed_since": "2026-11-11"},
        )

    @patch("backend.scripts.trigger_web_revalidate.requests.post")
    def test_family_submission_is_best_effort(self, post) -> None:
        import requests

        post.side_effect = requests.ConnectionError("down")
        with patch.dict(
            "os.environ",
            {
                "WEB_REVALIDATE_BASE_URL": "https://www.stocksbrew.online",
                "WEB_REVALIDATE_TOKEN": "test-token",
            },
            clear=False,
        ):
            self.assertFalse(notify_indexnow_families(["stocks"]))
        with patch.dict("os.environ", {"WEB_REVALIDATE_BASE_URL": "", "WEB_REVALIDATE_TOKEN": ""}, clear=False):
            self.assertFalse(notify_indexnow_families(["stocks"]))

    @patch("backend.scripts.trigger_web_revalidate.requests.post")
    def test_family_submission_reports_an_indexnow_refusal(self, post) -> None:
        post.return_value.status_code = 200
        post.return_value.text = '{"ok":false}'
        post.return_value.json.return_value = {"ok": False, "indexnow": {"status": 429}}
        with patch.dict(
            "os.environ",
            {
                "WEB_REVALIDATE_BASE_URL": "https://www.stocksbrew.online",
                "WEB_REVALIDATE_TOKEN": "test-token",
            },
            clear=False,
        ):
            self.assertFalse(notify_indexnow_families(["stocks"], changed_since="2026-11-11"))


if __name__ == "__main__":
    unittest.main()


class RevalidateAfterWriteTests(unittest.TestCase):
    """revalidate_after_write: kinds and tickers in batches, rate-limited per kind, never raising."""

    def setUp(self) -> None:
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self.env = {
            "WEB_REVALIDATE_BASE_URL": "https://www.stocksbrew.online",
            "WEB_REVALIDATE_TOKEN": "test-token",
            "TIKRR_LOCK_DIR": self._tmp.name,
        }

    def tearDown(self) -> None:
        self._tmp.cleanup()

    @patch("backend.scripts.trigger_web_revalidate.requests.post")
    def test_sends_known_kinds_and_tickers_in_chunks(self, post) -> None:
        from backend.scripts.trigger_web_revalidate import SYMBOL_CHUNK, revalidate_after_write

        post.return_value.status_code = 200
        post.return_value.text = '{"ok":true}'
        symbols = [f"T{index}" for index in range(SYMBOL_CHUNK + 5)]
        with patch.dict("os.environ", self.env, clear=False):
            self.assertTrue(revalidate_after_write(["prices", "bogus", "news"], symbols=symbols))
        self.assertEqual(post.call_count, 2)
        first = post.call_args_list[0].kwargs["json"]
        second = post.call_args_list[1].kwargs["json"]
        self.assertEqual(first["kinds"], ["news", "prices"])
        self.assertEqual(len(first["symbols"]), SYMBOL_CHUNK)
        self.assertNotIn("kinds", second)
        self.assertEqual(len(second["symbols"]), 5)
        self.assertEqual(post.call_args_list[0].kwargs["headers"], {"x-revalidate-token": "test-token"})

    @patch("backend.scripts.trigger_web_revalidate.requests.post")
    def test_rate_limited_per_kind_across_calls(self, post) -> None:
        from backend.scripts.trigger_web_revalidate import revalidate_after_write

        post.return_value.status_code = 200
        post.return_value.text = "{}"
        with patch.dict("os.environ", self.env, clear=False):
            self.assertTrue(revalidate_after_write(["news"], min_interval_seconds=600))
            self.assertFalse(revalidate_after_write(["news"], min_interval_seconds=600))
            # Another kind is not held back, and force goes through.
            self.assertTrue(revalidate_after_write(["signals"], min_interval_seconds=600))
            self.assertTrue(revalidate_after_write(["news"], min_interval_seconds=600, force=True))
        self.assertEqual(post.call_count, 3)

    @patch("backend.scripts.trigger_web_revalidate.requests.post")
    def test_never_raises_and_does_not_stamp_a_failure(self, post) -> None:
        import requests

        from backend.scripts.trigger_web_revalidate import revalidate_after_write

        post.side_effect = requests.ConnectionError("down")
        with patch.dict("os.environ", self.env, clear=False):
            self.assertFalse(revalidate_after_write(["news"], min_interval_seconds=600))
            # Not stamped: the next run tries again.
            post.side_effect = None
            post.return_value.status_code = 200
            post.return_value.text = "{}"
            self.assertTrue(revalidate_after_write(["news"], min_interval_seconds=600))

    @patch("backend.scripts.trigger_web_revalidate.requests.post")
    def test_skips_without_configuration_or_kinds(self, post) -> None:
        from backend.scripts.trigger_web_revalidate import revalidate_after_write

        with patch.dict("os.environ", {"WEB_REVALIDATE_BASE_URL": "", "WEB_REVALIDATE_TOKEN": ""}, clear=False):
            self.assertFalse(revalidate_after_write(["prices"]))
        with patch.dict("os.environ", self.env, clear=False):
            self.assertFalse(revalidate_after_write(["bogus"]))
        post.assert_not_called()

    def test_every_lane_kind_is_known_to_the_web_app(self) -> None:
        import re
        from pathlib import Path

        from backend.cloudrun.orchestrator.dispatch import LANE_REVALIDATE_KINDS
        from backend.scripts.trigger_web_revalidate import KNOWN_KINDS

        source = (Path(__file__).resolve().parents[2] / "lib" / "revalidate-targets.ts").read_text()
        targets = source[source.index("REVALIDATE_KINDS") : source.index("const FAMILIES")]
        web_kinds = set(re.findall(r"^  (\w+): \{", targets, flags=re.MULTILINE))
        self.assertEqual(set(KNOWN_KINDS), web_kinds)
        for lane, (kinds, _) in LANE_REVALIDATE_KINDS.items():
            for kind in kinds:
                self.assertIn(kind, KNOWN_KINDS, lane)

    @patch("backend.cloudrun.orchestrator.dispatch.revalidate_after_write")
    def test_dispatch_refreshes_after_a_lane_but_not_a_dispatched_one(self, revalidate) -> None:
        from backend.cloudrun.orchestrator.dispatch import revalidate_web_after_lane

        revalidate.return_value = True
        self.assertTrue(revalidate_web_after_lane("price_core_intraday", "failed"))
        revalidate.assert_called_once_with(("prices",), min_interval_seconds=0)
        revalidate.reset_mock()
        self.assertFalse(revalidate_web_after_lane("price_core_intraday", "dispatched"))
        self.assertFalse(revalidate_web_after_lane("weekly_email", "success"))
        revalidate.assert_not_called()
        revalidate_web_after_lane("on_demand_news", "success")
        revalidate.assert_called_once_with(("news",), min_interval_seconds=600)
