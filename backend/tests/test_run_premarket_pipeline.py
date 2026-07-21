from __future__ import annotations

import sys
import unittest
from unittest.mock import patch

from backend.scripts.run_premarket_pipeline import main


class PremarketPipelineTests(unittest.TestCase):
    @patch("backend.scripts.run_premarket_pipeline.subprocess.run")
    def test_us_pipeline_builds_opening_report_before_email(self, run) -> None:
        run.return_value.returncode = 0

        with patch.object(sys, "argv", ["run_premarket_pipeline", "--market", "US", "--dry-run"]):
            main()

        commands = [call.args[0] for call in run.call_args_list]
        modules = [command[command.index("-m") + 1] for command in commands]
        self.assertEqual(
            modules,
            [
                "backend.scripts.build_premarket_news",
                "backend.scripts.build_premarket_movers",
                "backend.scripts.build_premarket_context",
                "backend.scripts.build_premarket_sentiment",
                "backend.scripts.send_premarket_briefs",
            ],
        )
        sentiment = commands[3]
        self.assertIn("--phase", sentiment)
        self.assertEqual(sentiment[sentiment.index("--phase") + 1], "premarket")
        self.assertIn("--dry-run", sentiment)
        self.assertIn("--dry-run", commands[4])


if __name__ == "__main__":
    unittest.main()
