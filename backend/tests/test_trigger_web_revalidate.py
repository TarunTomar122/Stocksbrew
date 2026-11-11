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
