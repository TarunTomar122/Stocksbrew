"""backend/ops/health.py: freshness against the job schedules, journal and access-log summaries, alerts."""

from __future__ import annotations

import json
import shutil
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from backend.localdb import LocalDocumentStore
from backend.ops import health as h

ET = h.ET
UTC = timezone.utc


def et(*args: int) -> datetime:
    return datetime(*args, tzinfo=ET)


SPECS = {spec.id: spec for spec in h.FRESHNESS}


class FreshnessTest(unittest.TestCase):
    def judge(self, spec_id: str, now: datetime, written_at: datetime | None, extra: dict | None = None) -> dict:
        spec = SPECS[spec_id]
        written = {path: written_at for path in spec.paths}
        written.update(extra or {})
        return h.judge_freshness(spec, written, now.astimezone(UTC))

    def test_prices_in_market_hours(self) -> None:
        # Thursday Nov 12 2026, 11:40 ET: the 11:00 run is due (grace 25 min).
        now = et(2026, 11, 12, 11, 40)
        self.assertEqual(self.judge("prices", now, et(2026, 11, 12, 11, 2))["status"], "ok")
        # One missed run (10:00 data) is still fine; three missed is amber; older is red.
        self.assertEqual(self.judge("prices", now, et(2026, 11, 12, 10, 2))["status"], "ok")
        self.assertEqual(self.judge("prices", now, et(2026, 11, 12, 9, 31))["status"], "warn")
        self.assertEqual(self.judge("prices", now, et(2026, 11, 11, 16, 12))["status"], "fail")

    def test_prices_over_a_weekend_and_a_holiday(self) -> None:
        # Sunday: Friday's postclose is the newest due run.
        self.assertEqual(self.judge("prices", et(2026, 11, 15, 12, 0), et(2026, 11, 13, 16, 12))["status"], "ok")
        # Thanksgiving 2026 is Thursday Nov 26: Wednesday's close is still current on Thursday afternoon.
        self.assertEqual(self.judge("prices", et(2026, 11, 26, 15, 0), et(2026, 11, 25, 16, 12))["status"], "ok")

    def test_extended_hours_windows(self) -> None:
        # 17:00 ET: the 16:35 run is due (grace 12), 16:50 is not yet.
        now = et(2026, 11, 12, 17, 0)
        self.assertEqual(self.judge("extended", now, et(2026, 11, 12, 16, 36))["status"], "ok")
        self.assertEqual(self.judge("extended", now, et(2026, 11, 12, 16, 21))["status"], "ok")  # one missed
        self.assertEqual(self.judge("extended", now, et(2026, 11, 12, 9, 21))["status"], "warn")  # three missed
        # Midday: nothing scheduled since 09:20, so the morning write is current.
        self.assertEqual(self.judge("extended", et(2026, 11, 12, 13, 0), et(2026, 11, 12, 9, 21))["status"], "ok")

    def test_half_days_drop_runs_that_write_nothing(self) -> None:
        # Fri Nov 27 2026 closes at 1pm: after-hours ends at 17:00, so at 19:00 the 16:50 write is current.
        self.assertEqual(self.judge("extended", et(2026, 11, 27, 19, 0), et(2026, 11, 27, 16, 51))["status"], "ok")
        # A normal Friday at 19:00 with the same write is red.
        self.assertEqual(self.judge("extended", et(2026, 11, 20, 19, 0), et(2026, 11, 20, 16, 51))["status"], "fail")
        # Prices on the half day: the 13:00 write is current until the 16:10 post-close run.
        self.assertEqual(self.judge("prices", et(2026, 11, 27, 16, 20), et(2026, 11, 27, 13, 2))["status"], "ok")

    def test_news_max_age(self) -> None:
        now = et(2026, 11, 13, 3, 0)
        self.assertEqual(self.judge("news", now, now - timedelta(minutes=40))["status"], "ok")
        self.assertEqual(self.judge("news", now, now - timedelta(minutes=100))["status"], "warn")
        self.assertEqual(self.judge("news", now, now - timedelta(hours=4))["status"], "fail")

    def test_oldest_of_several_documents(self) -> None:
        spec = SPECS["sec_hourly"]
        now = et(2026, 11, 13, 3, 0).astimezone(UTC)
        written = {spec.paths[0]: now - timedelta(minutes=10), spec.paths[1]: now - timedelta(hours=6), spec.paths[2]: now}
        self.assertEqual(h.judge_freshness(spec, written, now)["status"], "fail")
        written[spec.paths[1]] = None
        self.assertEqual(h.judge_freshness(spec, written, now)["status"], "fail")

    def test_missing_document_is_red(self) -> None:
        self.assertEqual(self.judge("home_view", et(2026, 11, 12, 12, 0), None)["status"], "fail")

    def test_close_briefs_dated_document(self) -> None:
        spec = SPECS["close_briefs"]
        now = et(2026, 11, 12, 18, 0).astimezone(UTC)
        today = "tm_market_session_runs/US__post_close__2026-11-12"
        yesterday = "tm_market_session_runs/US__post_close__2026-11-11"
        self.assertEqual(h.judge_freshness(spec, {today: et(2026, 11, 12, 16, 40), yesterday: et(2026, 11, 11, 16, 40)}, now)["status"], "ok")
        self.assertEqual(h.judge_freshness(spec, {yesterday: et(2026, 11, 11, 16, 40)}, now)["status"], "warn")
        self.assertEqual(h.judge_freshness(spec, {}, now)["status"], "fail")
        # Before 17:25 ET today's is not due yet.
        early = et(2026, 11, 12, 17, 0).astimezone(UTC)
        self.assertEqual(h.judge_freshness(spec, {yesterday: et(2026, 11, 11, 16, 40)}, early)["status"], "ok")
        self.assertIn(today, h.freshness_paths([spec], now))

    def test_close_briefs_need_the_briefs_stage(self) -> None:
        root = Path(tempfile.mkdtemp())
        try:
            db = root / "documents.sqlite3"
            store = LocalDocumentStore(db)
            ok = "tm_market_session_runs/US__post_close__2026-11-12"
            failed = "tm_market_session_runs/US__post_close__2026-11-11"
            store.upsert(ok, {"stages": {"price": {"status": "success"}, "briefs": {"status": "success", "completed_at": "2026-11-12T21:39:38+00:00"}}})
            store.upsert(failed, {"stages": {"price": {"status": "success"}, "briefs": {"status": "failed", "completed_at": "2026-11-11T21:39:38+00:00"}}})
            paths = [ok, failed]
            times = h.read_write_times(str(db), paths, h.stage_paths(h.FRESHNESS, paths))
            self.assertEqual(times[ok], datetime(2026, 11, 12, 21, 39, 38, tzinfo=UTC))
            self.assertIsNone(times[failed])
        finally:
            shutil.rmtree(root)

    def test_reads_write_times_read_only(self) -> None:
        root = Path(tempfile.mkdtemp())
        try:
            db = root / "documents.sqlite3"
            LocalDocumentStore(db).upsert("tm_agent_news_meta/US", {"ok": True})
            times = h.read_write_times(str(db), ["tm_agent_news_meta/US", "tm_missing/x"])
            self.assertIsNotNone(times["tm_agent_news_meta/US"])
            self.assertIsNone(times["tm_missing/x"])
        finally:
            shutil.rmtree(root)


class JournalTest(unittest.TestCase):
    def test_timespans(self) -> None:
        self.assertAlmostEqual(h.timespan_seconds("10min 55.112s"), 655.112)
        self.assertAlmostEqual(h.timespan_seconds("1h 2min 3s"), 3723)
        self.assertAlmostEqual(h.timespan_seconds("250ms"), 0.25)
        self.assertIsNone(h.timespan_seconds("soon"))

    def test_units(self) -> None:
        def res(unit: str, wall: str, cpu: int, at: int) -> dict:
            return {"MESSAGE_ID": h.RESOURCES_ID, "UNIT": unit, "MESSAGE": f"{unit}: Consumed 1s CPU time over {wall} wall clock time, 10M memory peak.", "CPU_USAGE_NSEC": str(cpu), "MEMORY_PEAK": "1000", "__REALTIME_TIMESTAMP": str(at * 1_000_000)}

        entries = [
            res("tikrr-radar-alerts.service", "12s", 2_000_000_000, 100),
            res("tikrr-radar-alerts.service", "20s", 3_000_000_000, 200),
            {"MESSAGE_ID": h.FAILED_ID, "UNIT": "tikrr-radar-alerts.service", "UNIT_RESULT": "exit-code", "__REALTIME_TIMESTAMP": str(200 * 1_000_000)},
            res("tikrr-web@3000.service", "1h", 9, 300),  # long-running: left out
            res("trace-welcome.service", "1s", 9, 300),  # not ours
        ]
        rows = h.summarize_units(entries)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual((row["runs"], row["failures"], row["max_s"], row["cpu_s"]), (2, 1, 20, 5.0))
        self.assertFalse(row["last_ok"])

    def test_steps(self) -> None:
        lines = [
            "[frequent] ok           markets in 31s",
            "[frequent] FAILED (1)   news in 12s",
            "[after_close] FAILED (124) prices in 1800s (stopped at its 30 min limit)",
            "[after_close] FAILED       standing agents: set LOCALDB_API_TOKEN for this unit",
            "[frequent] ok           news in 40s",
            "[markets] FAILED     pc-spx (cboe): no recent put/call ratio",
            "something else",
        ]
        entries = [{"MESSAGE": line, "__REALTIME_TIMESTAMP": str((i + 1) * 1_000_000)} for i, line in enumerate(lines)]
        rows = {(r["group"], r["step"]): r for r in h.summarize_steps(entries)}
        self.assertEqual(rows[("frequent", "news")]["failures"], 1)
        self.assertTrue(rows[("frequent", "news")]["last_ok"])
        self.assertEqual(rows[("frequent", "news")]["last_s"], 40)
        self.assertEqual(rows[("after_close", "prices")]["last_s"], 1800)
        self.assertFalse(rows[("after_close", "standing agents")]["last_ok"])
        self.assertNotIn("markets", {group for group, _ in rows})


class TrafficTest(unittest.TestCase):
    def line(self, ts: float, status: int, ms: float, uri: str = "/", agent: str = "Mozilla", cache: str = "MISS") -> str:
        return json.dumps(
            {
                "ts": ts,
                "status": status,
                "duration": ms / 1000,
                "request": {"uri": uri, "remote_ip": "203.0.113.9", "headers": {"User-Agent": [agent], "Cf-Connecting-Ip": ["203.0.113.9"]}},
                "resp_headers": {"X-Cache": [cache]},
            }
        )

    def test_stats_skip_our_probe_and_keep_no_private_data(self) -> None:
        now = 10_000.0
        lines = [self.line(now - 4000, 500, 10)]  # outside the window
        lines += [self.line(now - 60, 200, 100, cache="HIT") for _ in range(18)]
        lines += [self.line(now - 30, 502, 9000, uri="/u/AbCdEf1234567890xyz/settings?token=secret")]
        lines += [self.line(now - 20, 500, 50, agent=h.USER_AGENT)]  # our own probe
        stats = h.traffic_stats(lines, now - 900)
        self.assertEqual(stats["requests"], 19)
        self.assertEqual(stats["errors_5xx"], 1)
        self.assertEqual(stats["top_5xx"], [{"path": "502 /u/:id/settings", "count": 1}])
        self.assertAlmostEqual(stats["cache_hit_rate"], 18 / 19, places=3)
        dumped = json.dumps(stats)
        for secret in ("203.0.113.9", "token", "secret", "AbCdEf"):
            self.assertNotIn(secret, dumped)

    def test_clean_path_keeps_routes_and_drops_visitor_data(self) -> None:
        self.assertEqual(h.clean_path("/stock/BRK.B?x=1"), "/stock/BRK.B")
        self.assertEqual(h.clean_path("/_next/static/chunks/abc123def456.js"), "/_next/static/chunks/:id")
        self.assertEqual(h.clean_path("/u/john.doe@example.com/x"), "/u/:id/x")
        self.assertEqual(h.clean_path("/share/eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl"), "/share/:id")
        self.assertEqual(h.clean_path("/api/v1/user/abc%40x"), "/api/v1/user/:id")
        self.assertEqual(h.clean_path("/robots.txt"), "/robots.txt")
        self.assertEqual(h.clean_path("/calendar/2026-11-13"), "/calendar/2026-11-13")

    def test_traffic_checks(self) -> None:
        quiet = {"requests": 4, "errors_5xx": 0, "error_rate": 0.0, "p50_ms": 20, "p95_ms": 9000}
        self.assertEqual([r["status"] for r in h.traffic_checks(quiet, 15)], ["ok", "ok"])
        bad = {"requests": 100, "errors_5xx": 9, "error_rate": 0.09, "p50_ms": 20, "p95_ms": 3000}
        self.assertEqual([r["status"] for r in h.traffic_checks(bad, 15)], ["fail", "warn"])

    def test_running_backup_copy_counts_as_free(self) -> None:
        root = Path(tempfile.mkdtemp())
        try:
            (root / ".partial-20261113T083000Z.sqlite3").write_bytes(b"\0" * 4096)
            self.assertEqual(h.staging_in_use(str(root)), 4096)
            self.assertEqual(h.staging_in_use(str(root), now=time.time() + 5 * 3600), 0)  # a leftover counts against the disk
            gib = 1024**3
            st = mock.Mock(f_blocks=72 * gib // 4096, f_frsize=4096, f_bavail=int(7.6 * gib) // 4096)
            rows = h.disk_checks(statvfs=lambda _m: st, staging=int(4.4 * gib), staging_dev=1, dev_of=lambda m: 1 if m == "/" else 2)
            self.assertEqual(rows[0]["status"], "ok")
            self.assertIn("backup is running", rows[0]["detail"])
            self.assertEqual(rows[1]["status"], "warn")
        finally:
            shutil.rmtree(root)

    def test_reads_only_the_tail_it_needs(self) -> None:
        root = Path(tempfile.mkdtemp())
        try:
            log = root / "access.log"
            with open(log, "w") as out:
                for i in range(20000):
                    out.write(self.line(float(i), 200, 1) + "\n")
            lines = h.read_recent_lines(str(log), 19990.0, block=4096)
            self.assertLess(len(lines), 200)
            self.assertEqual(h.traffic_stats(lines, 19990.0)["requests"], 10)
            self.assertEqual(h.read_recent_lines(str(root / "missing.log"), 0), [])
        finally:
            shutil.rmtree(root)


class AlertTest(unittest.TestCase):
    red = [
        {"id": "site_home", "label": "Home page", "status": "fail", "detail": "HTTP 502 in 30 ms"},
        {"id": "memory", "label": "Memory", "status": "ok", "detail": "fine"},
    ]
    green = [dict(red[0], status="ok"), red[1]]
    t0 = datetime(2026, 11, 13, 9, 0, tzinfo=UTC)

    def step(self, checks, state, minutes, address=None, send=None, logs=None):
        now = self.t0 + timedelta(minutes=minutes)
        plan = h.plan_alert(checks, state, now, live=bool(address))
        return plan, h.deliver_alert(plan, state, now, address=address, send=send, log=(logs.append if logs is not None else (lambda _l: None)))

    def test_off_records_what_it_would_send_after_two_reds(self) -> None:
        send = mock.Mock()
        logs: list[str] = []
        plan, state = self.step(self.red, None, 0, send=send, logs=logs)
        self.assertIsNone(plan["subject"])  # one red run is not enough
        plan, state = self.step(self.red, state, 5, send=send, logs=logs)
        self.assertEqual(plan["new"], ["site_home"])
        send.assert_not_called()
        self.assertFalse(state["enabled"])
        self.assertIn("1 check red (Home page)", state["would_send"]["subject"])
        self.assertIn("would send", logs[-1])
        plan, state = self.step(self.red, state, 10)
        self.assertIsNone(plan["subject"])

    def test_on_sends_new_reds_reminders_all_clear_and_ignores_flapping(self) -> None:
        send = mock.Mock(return_value=True)
        addr = "owner@example.com"
        _, state = self.step(self.red, None, 0, addr, send)
        _, state = self.step(self.red, state, 5, addr, send)
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args[0][0], addr)
        _, state = self.step(self.red, state, 60, addr, send)
        self.assertEqual(send.call_count, 1)  # no repeat within 6 hours
        _, state = self.step(self.red, state, 6 * 60 + 10, addr, send)
        self.assertEqual(send.call_count, 2)
        self.assertIn("still", send.call_args[0][1])
        _, state = self.step(self.green, state, 6 * 60 + 15, addr, send)
        self.assertEqual(send.call_count, 3)
        self.assertIn("back to green", send.call_args[0][1])
        # Red again right away (flapping): two reds confirm it, but it was emailed about under 2 hours ago.
        _, state = self.step(self.red, state, 6 * 60 + 20, addr, send)
        _, state = self.step(self.red, state, 6 * 60 + 25, addr, send)
        self.assertEqual(send.call_count, 3)
        # Once the cooldown is over, a still-red check is new again.
        _, state = self.step(self.red, state, 8 * 60 + 30, addr, send)
        self.assertEqual(send.call_count, 4)

    def test_a_single_red_run_between_greens_never_emails(self) -> None:
        send = mock.Mock(return_value=True)
        state = None
        for minute, checks in enumerate([self.green, self.red, self.green, self.red, self.green]):
            _, state = self.step(checks, state, minute * 5, "x@example.com", send)
        send.assert_not_called()

    def test_unsent_alert_is_retried(self) -> None:
        send = mock.Mock(return_value=False)
        _, state = self.step(self.red, None, 0, "x@example.com", send)
        _, state = self.step(self.red, state, 5, "x@example.com", send)
        plan, _ = self.step(self.red, state, 10, "x@example.com", send)
        self.assertEqual(plan["new"], ["site_home"])

    def test_turning_email_on_while_red_sends(self) -> None:
        _, state = self.step(self.red, None, 0)
        _, state = self.step(self.red, state, 5)  # recorded as would-send while off
        send = mock.Mock(return_value=True)
        _, state = self.step(self.red, state, 10, "x@example.com", send)
        self.assertEqual(send.call_count, 1)

    def test_alert_state_file_round_trip(self) -> None:
        root = tempfile.mkdtemp()
        try:
            h.write_alert_state(root, {"streaks": {"a": 2}})
            self.assertEqual(h.read_alert_state(root), {"streaks": {"a": 2}})
            self.assertIsNone(h.read_alert_state(None))
            self.assertIsNone(h.read_alert_state(root + "/missing"))
        finally:
            shutil.rmtree(root)


class RunTest(unittest.TestCase):
    def test_history_keeps_24_hours(self) -> None:
        now = datetime(2026, 11, 13, 9, 0, tzinfo=UTC)
        old = {"entries": [{"t": h.iso(now - timedelta(hours=25)), "o": "g"}, {"t": h.iso(now - timedelta(hours=1)), "o": "a"}]}
        merged = h.merge_history(old, {"t": h.iso(now), "o": "g"}, now)
        self.assertEqual([e["o"] for e in merged["entries"]], ["a", "g"])

    def test_collect_end_to_end_writes_nothing(self) -> None:
        root = Path(tempfile.mkdtemp())
        try:
            db = root / "documents.sqlite3"
            store = LocalDocumentStore(db)
            store.upsert("tm_agent_news_meta/US", {"x": 1})
            store.upsert("tm_agent_news_tone_meta/US", {"x": 1})
            before = (db.stat().st_size, db.stat().st_mtime)

            def fetcher(url: str, headers=None, **_kw):
                if url.endswith("/health") and "8500" in url:
                    return 200, 3.0, b'{"ok": true}'
                if "/metrics" in url:
                    return 200, 3.0, json.dumps({"window_seconds": 900, "totals": {"count": 5}, "collections": {"users/*/watchlist": {"count": 2, "bytes": 10}}}).encode()
                return 200, 50.0, b"ok"

            with mock.patch.object(h, "CADDY_LOG", str(root / "none.log")), mock.patch.object(h, "BACKUP_DIR", str(root / "backups")):
                result = h.collect(db_path=str(db), token="t", fetcher=fetcher, run=lambda _argv: "")
            ids = {row["id"]: row["status"] for row in result["checks"]}
            self.assertEqual(ids["site_home"], "ok")
            self.assertEqual(ids["news"], "ok")
            self.assertEqual(ids["prices"], "fail")  # nothing written in this sample store
            self.assertEqual(ids["backup"], "warn")
            self.assertEqual(result["overall"], "fail")
            self.assertEqual(result["localdb"]["collections"][0]["name"], "users/*/watchlist")
            self.assertEqual((db.stat().st_size, db.stat().st_mtime), before)
            entry = h.history_entry(result)
            self.assertEqual(entry["o"], "r")
            json.dumps(result)
        finally:
            shutil.rmtree(root)

    def test_main_without_write_never_writes(self) -> None:
        with mock.patch.object(h, "collect", return_value={"generated_at": "2026-11-13T09:00:00+00:00", "overall": "ok", "checks": [], "jobs": [], "took_ms": 1}), mock.patch.object(h.Store, "set") as setter, mock.patch.object(h.Store, "get", return_value=None), mock.patch.dict("os.environ", {"OPS_ALERT_EMAIL": "x@example.com"}):
            self.assertEqual(h.main([]), 0)
            setter.assert_not_called()
            self.assertEqual(h.main(["--write"]), 0)
            self.assertEqual(setter.call_count, 2)


if __name__ == "__main__":
    unittest.main()
