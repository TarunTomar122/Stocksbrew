import io
import unittest

from backend.agentdata import schedule


class ScheduleTest(unittest.TestCase):
    def test_every_job_names_a_real_module(self):
        import importlib.util

        for group, jobs in schedule.GROUPS.items():
            self.assertIn(group, schedule.TIMEOUT_SECONDS)
            for label, argv in jobs:
                if argv[0].startswith("node:"):
                    self.assertTrue((schedule._ROOT / argv[0].split(":", 1)[1]).exists(), label)
                else:
                    self.assertIsNotNone(importlib.util.find_spec(argv[0]), f"{group}: {label}")

    def test_dry_run_prints_the_plan_and_runs_nothing(self):
        out = io.StringIO()
        code = schedule.run_group("frequent", dry_run=True, out=out)
        self.assertEqual(code, 0)
        text = out.getvalue()
        self.assertIn("backend.agentdata.news_feed", text)
        self.assertIn("backend.agentdata.markets", text)

    def test_no_job_appears_in_two_groups(self):
        seen = {}
        for group, jobs in schedule.GROUPS.items():
            for _, argv in jobs:
                self.assertNotIn(argv[0], seen, f"{argv[0]} is in {seen.get(argv[0])} and {group}")
                seen[argv[0]] = group

    def test_unknown_group_is_refused(self):
        with self.assertRaises(KeyError):
            schedule.plan("nightly")


if __name__ == "__main__":
    unittest.main()
