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


if __name__ == "__main__":
    unittest.main()
