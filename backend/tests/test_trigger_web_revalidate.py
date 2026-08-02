from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.scripts.trigger_web_revalidate import trigger_web_revalidate


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


if __name__ == "__main__":
    unittest.main()
