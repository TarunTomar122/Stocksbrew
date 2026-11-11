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

    def test_reason_checks_run_after_the_standing_agents(self):
        labels = [label for label, _ in schedule.GROUPS["after_close"]]
        self.assertIn("reason checks", labels)
        self.assertEqual(labels.index("reason checks"), labels.index("standing agents") + 1)
        self.assertEqual(labels[-1], "reason checks")

    def test_node_jobs_use_the_jobs_config_not_the_test_config(self):
        self.assertTrue((schedule._ROOT / schedule.NODE_JOBS_CONFIG).exists())
        command = schedule.command_for(["node:scripts/run-agent-jobs.ts"])
        if command is None:  # no node or node_modules on this machine
            self.skipTest("node not available")
        self.assertEqual(command[1:4], ["-c", schedule.NODE_JOBS_CONFIG, "scripts/run-agent-jobs.ts"])

    def test_node_env_fills_the_two_vps_defaults(self):
        env = schedule.node_env({"LOCALDB_API_TOKEN": "t", "GOOGLE_APPLICATION_CREDENTIALS": "/etc/sa.json", "LOCALDB_PATH": "/x"})
        self.assertEqual(env["LOCALDB_URL"], "http://127.0.0.1:8500")
        self.assertEqual(env["FIREBASE_SERVICE_ACCOUNT_PATH"], "/etc/sa.json")
        self.assertEqual(schedule.node_env_missing(env), [])
        self.assertEqual(schedule.node_env({"LOCALDB_API_TOKEN": "t", "LOCALDB_PORT": "9000"})["LOCALDB_URL"], "http://127.0.0.1:9000")

    def test_node_env_never_overrides_what_is_set(self):
        given = {
            "LOCALDB_API_TOKEN": "t",
            "LOCALDB_URL": "https://db.example",
            "FIREBASE_SERVICE_ACCOUNT_PATH": "/own.json",
            "GOOGLE_APPLICATION_CREDENTIALS": "/other.json",
        }
        self.assertEqual(schedule.node_env(given), given)
        self.assertNotIn("LOCALDB_URL", schedule.node_env({}))

    def test_node_env_missing_names_what_the_unit_lacks(self):
        self.assertEqual(schedule.node_env_missing({}), ["LOCALDB_API_TOKEN", "FIREBASE_SERVICE_ACCOUNT_PATH"])
        self.assertEqual(schedule.node_env_missing({"FIRESTORE_BACKEND": "firebase", "FIREBASE_SERVICE_ACCOUNT_JSON": "{}"}), [])

    def test_a_node_job_short_of_env_fails_by_name_without_values(self):
        if schedule.command_for(["node:scripts/run-agent-jobs.ts"]) is None:
            self.skipTest("node not available")
        out = io.StringIO()
        code = schedule.run_group("after_close", dry_run=True, out=out, environ={"LOCALDB_PATH": "/secret/path.sqlite3"})
        text = out.getvalue()
        self.assertEqual(code, 1)
        self.assertIn("FAILED       standing agents: set LOCALDB_API_TOKEN, FIREBASE_SERVICE_ACCOUNT_PATH for this unit", text)
        self.assertIn("FAILED       reason checks:", text)
        self.assertNotIn("/secret/path", text)

    def test_a_node_job_with_env_is_planned(self):
        if schedule.command_for(["node:scripts/run-agent-jobs.ts"]) is None:
            self.skipTest("node not available")
        out = io.StringIO()
        environ = {"LOCALDB_API_TOKEN": "do-not-print", "GOOGLE_APPLICATION_CREDENTIALS": "/etc/sa.json"}
        code = schedule.run_group("after_close", dry_run=True, out=out, environ=environ)
        self.assertEqual(code, 0)
        self.assertIn("would run reason checks", out.getvalue())
        self.assertNotIn("do-not-print", out.getvalue())

    def test_missing_node_fails_where_the_job_is_meant_to_run(self):
        from unittest import mock

        with mock.patch.object(schedule, "command_for", side_effect=lambda argv: None if argv[0].startswith("node:") else ["python3"]):
            out = io.StringIO()
            self.assertEqual(schedule.run_group("after_close", dry_run=True, out=out, environ={}), 0)
            self.assertIn("skip  standing agents", out.getvalue())
            for environ in ({"LOCALDB_API_TOKEN": "t"}, {"TIKRR_REQUIRE_NODE": "1"}):
                out = io.StringIO()
                self.assertEqual(schedule.run_group("after_close", dry_run=True, out=out, environ=environ), 1)
                self.assertIn("FAILED       standing agents: needs node", out.getvalue())
                self.assertIn("FAILED       reason checks: needs node", out.getvalue())

    def test_unknown_group_is_refused(self):
        with self.assertRaises(KeyError):
            schedule.plan("nightly")


if __name__ == "__main__":
    unittest.main()
