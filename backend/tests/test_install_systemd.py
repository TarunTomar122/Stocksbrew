"""Render backend/vps/install-systemd.sh into a temp dir and check the units.

Runs without the VPS: a fake ``systemctl`` on PATH records calls instead of
touching the host.
"""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "backend" / "vps" / "install-systemd.sh"

# New York wall-clock schedule the pipeline is built around.
EXPECTED_CALENDARS = {
    "premarket": "Mon..Fri *-*-* 07:30:00 America/New_York",
    "reddit-buzz": "Mon..Fri *-*-* 08,11,14,17:20:00 America/New_York",
    "radar-official-open": "Mon..Fri *-*-* 08:35:00 America/New_York",
    "preopen-news": "Mon..Fri *-*-* 08:45:00 America/New_York",
    "open-price": "Mon..Fri *-*-* 09:30:00 America/New_York",
    "radar-materialize-open": "Mon..Fri *-*-* 09:43:00 America/New_York",
    "open-movers-price": "Mon..Fri *-*-* 09:50:00 America/New_York",
    "intraday-price-hourly": "Mon..Fri *-*-* 10..15:00:00 America/New_York",
    "midday-movers-price": "Mon..Fri *-*-* 12,14:30:00 America/New_York",
    "market-discovery-open": "Mon..Fri *-*-* 10:30:00 America/New_York",
    "contrarian-calls-open": "Mon..Fri *-*-* 10:35:00 America/New_York",
    "market-events-open": "Mon..Fri *-*-* 10:40:00 America/New_York",
    "data-health-open": "Mon..Fri *-*-* 10:50:00 America/New_York",
    "preclose-news": "Mon..Fri *-*-* 15:40:00 America/New_York",
    "postclose": "Mon..Fri *-*-* 16:10:00 America/New_York",
    "contrarian-calls-close": "Mon..Fri *-*-* 16:30:00 America/New_York",
    "market-discovery-close": "Mon..Fri *-*-* 17:00:00 America/New_York",
    "radar-official-close": "Mon..Fri *-*-* 17:10:00 America/New_York",
    "radar-materialize-close": "Mon..Fri *-*-* 17:45:00 America/New_York",
    "earnings-intel": "Mon..Fri *-*-* 18:00:00 America/New_York",
    "market-events-close": "Mon..Fri *-*-* 18:30:00 America/New_York",
    "data-health-close": "Mon..Fri *-*-* 18:40:00 America/New_York",
    "pre-earnings-intel": "Mon..Fri *-*-* 18:45:00 America/New_York",
    "radar-outcomes": "Mon..Fri *-*-* 19:00:00 America/New_York",
    "research-themes": "Sun *-*-* 10:00:00 America/New_York",
}

# Not tied to the US session: fixed UTC or interval schedules on purpose.
SESSION_FREE = {
    "on-demand-news",
    "stock-requests",
    "stock-facts",
    "trump-logic",
    "weekly-email",
    "business-questions",
    "radar-alerts",
    "power-trades",
}


def _unit_value(text: str, key: str) -> str:
    for line in text.splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1]
    return ""


@unittest.skipUnless(shutil.which("bash"), "bash is required")
class InstallSystemdTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        root = Path(cls._tmp.name)
        cls.unit_dir = root / "units"
        cls.unit_dir.mkdir()
        bin_dir = root / "bin"
        bin_dir.mkdir()
        cls.systemctl_log = root / "systemctl.log"
        fake = bin_dir / "systemctl"
        fake.write_text(f'#!/usr/bin/env bash\necho "$*" >> "{cls.systemctl_log}"\n')
        fake.chmod(0o755)
        # A leftover unit from an older install must be cleaned up.
        (cls.unit_dir / "tikrr-zone-briefs.timer").write_text("[Timer]\n")
        (cls.unit_dir / "tikrr-zone-briefs.service").write_text("[Service]\n")
        env = {
            **os.environ,
            "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
            "UNIT_DIR": str(cls.unit_dir),
            "TIKRR_REPO_DIR": str(REPO),
            "TIMER_STAMP_DIR": str(root / "stamps"),
            "ENABLE_TIMERS": "1",
        }
        subprocess.run(["bash", str(SCRIPT)], check=True, env=env, capture_output=True, text=True)
        cls.timers = {
            path.name[len("tikrr-"):-len(".timer")]: _unit_value(path.read_text(), "OnCalendar")
            for path in cls.unit_dir.glob("tikrr-*.timer")
        }

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def _service(self, name: str) -> str:
        return (self.unit_dir / f"tikrr-{name}.service").read_text()

    def test_market_timers_keep_their_new_york_times(self) -> None:
        for name, calendar in EXPECTED_CALENDARS.items():
            with self.subTest(timer=name):
                self.assertEqual(self.timers.get(name), calendar)

    def test_every_session_timer_names_a_timezone(self) -> None:
        unclassified = set(self.timers) - set(EXPECTED_CALENDARS) - SESSION_FREE
        self.assertEqual(unclassified, set(), "classify new timers in this test")
        for name, calendar in self.timers.items():
            if name in SESSION_FREE:
                continue
            with self.subTest(timer=name):
                self.assertTrue(calendar.endswith(" America/New_York"), calendar)

    def test_zone_briefs_is_retired(self) -> None:
        self.assertNotIn("zone-briefs", self.timers)
        self.assertFalse((self.unit_dir / "tikrr-zone-briefs.service").exists())
        log = self.systemctl_log.read_text()
        self.assertIn("disable --now tikrr-zone-briefs.timer", log)
        enabled = [line for line in log.splitlines() if line.startswith("enable --now")]
        self.assertEqual(len(enabled), 1)
        self.assertNotIn("zone-briefs", enabled[0])
        self.assertIn("tikrr-open-movers-price.timer", enabled[0])

    def test_morning_chain_hangs_off_the_settled_price_batch(self) -> None:
        self.assertEqual(_unit_value(self._service("open-price"), "OnSuccess"), "")
        self.assertEqual(
            _unit_value(self._service("open-movers-price"), "OnSuccess").split(),
            ["tikrr-open-anomalies.service", "tikrr-open-briefs.service"],
        )
        briefs = _unit_value(self._service("open-briefs"), "ExecStart")
        self.assertIn("tracked_open_briefs --session-phase open_check", briefs)
        self.assertIn("--max-parallel 4", briefs)
        self.assertIn("--brief-cap 160", briefs)
        self.assertNotIn("open-briefs", self.timers)
        self.assertNotIn("open-anomalies", self.timers)

    def test_midday_movers_rebuild_hangs_off_its_own_price_batch(self) -> None:
        price = self._service("midday-movers-price")
        self.assertEqual(_unit_value(price, "OnSuccess"), "tikrr-midday-anomalies.service")
        exec_start = _unit_value(price, "ExecStart")
        # The intraday lane shares its lock with the hourly batch, so the two never overlap.
        self.assertIn("run-dispatch.sh price_core_intraday --session-phase mid_check", exec_start)
        self.assertIn("--limit 500", exec_start)
        anomalies = self._service("midday-anomalies")
        self.assertIn(
            "run-dispatch.sh open_anomalies --price-session-phase mid_check",
            _unit_value(anomalies, "ExecStart"),
        )
        self.assertEqual(_unit_value(anomalies, "Restart"), "on-failure")
        self.assertNotIn("midday-anomalies", self.timers)
        # The hourly batch must not start the rebuild every hour.
        self.assertEqual(_unit_value(self._service("intraday-price-hourly"), "OnSuccess"), "")
        self.assertIn("tikrr-midday-movers-price.timer", self.systemctl_log.read_text())

    def test_evening_chain_is_unchanged(self) -> None:
        self.assertEqual(_unit_value(self._service("postclose"), "OnSuccess"), "tikrr-close-briefs.service")
        self.assertEqual(_unit_value(self._service("close-briefs"), "OnSuccess"), "tikrr-close-anomalies.service")
        self.assertIn(
            "tracked_open_briefs --session-phase post_close --shard-size 4 --max-parallel 4",
            _unit_value(self._service("close-briefs"), "ExecStart"),
        )

    @unittest.skipUnless(shutil.which("systemd-analyze"), "systemd-analyze not installed")
    def test_calendars_parse(self) -> None:  # pragma: no cover - Linux only
        for name, calendar in self.timers.items():
            with self.subTest(timer=name):
                subprocess.run(["systemd-analyze", "calendar", calendar], check=True, capture_output=True)



def _timer_text(calendar: str) -> str:
    return f"[Timer]\nOnCalendar={calendar}\nPersistent=true\n"


@unittest.skipUnless(shutil.which("bash"), "bash is required")
class MovedTimerTest(unittest.TestCase):
    """A moved timer must not fire on daemon-reload (systemd counts from the last trigger)."""

    def _install(self, root: Path, *, enable: str = "1") -> str:
        bin_dir = root / "bin"
        bin_dir.mkdir(exist_ok=True)
        log = root / "systemctl.log"
        log.write_text("")
        fake = bin_dir / "systemctl"
        fake.write_text(f'#!/usr/bin/env bash\necho "$*" >> "{log}"\n')
        fake.chmod(0o755)
        env = {
            **os.environ,
            "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
            "UNIT_DIR": str(root / "units"),
            "TIKRR_REPO_DIR": str(REPO),
            "TIMER_STAMP_DIR": str(root / "stamps"),
            "ENABLE_TIMERS": enable,
        }
        subprocess.run(["bash", str(SCRIPT)], check=True, env=env, capture_output=True, text=True)
        return log.read_text()

    def _seed(self, root: Path) -> None:
        units = root / "units"
        units.mkdir()
        # Old bare-UTC premarket slot; postclose already on its final schedule.
        (units / "tikrr-premarket.timer").write_text(_timer_text("Mon..Fri *-*-* 08:30:00"))
        (units / "tikrr-postclose.timer").write_text(_timer_text(EXPECTED_CALENDARS["postclose"]))

    def test_moved_timer_is_stopped_and_stamped_before_reload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._seed(root)
            log = self._install(root).splitlines()
            self.assertIn("stop tikrr-premarket.timer", log)
            self.assertNotIn("stop tikrr-postclose.timer", log)
            self.assertLess(log.index("stop tikrr-premarket.timer"), log.index("daemon-reload"))
            self.assertTrue((root / "stamps" / "stamp-tikrr-premarket.timer").exists())
            self.assertFalse((root / "stamps" / "stamp-tikrr-postclose.timer").exists())

            # Second run: nothing moved, nothing stopped.
            again = self._install(root).splitlines()
            self.assertFalse([line for line in again if line.startswith("stop ")])

    def test_moved_timer_restarts_without_enabling(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._seed(root)
            log = self._install(root, enable="0").splitlines()
            self.assertFalse([line for line in log if line.startswith("enable ")])
            self.assertIn("start tikrr-premarket.timer", log)


if __name__ == "__main__":
    unittest.main()
