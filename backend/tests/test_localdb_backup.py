"""backend/ops/localdb_backup.py against a small sample store: copy while writing, checks, retention, restore."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest import mock
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.localdb import LocalDocumentStore
from backend.ops import localdb_backup as lb

GIB = 1024**3


def plenty(_path: Path) -> int:
    return 500 * GIB


def seed(path: Path, count: int = 400) -> LocalDocumentStore:
    store = LocalDocumentStore(path)
    store.batch_upsert([{"path": f"tm_test/{i}", "data": {"i": i, "text": "x" * 800}} for i in range(count)])
    return store


class BackupTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="localdb-backup-"))
        self.live = self.root / "live" / "documents.sqlite3"
        self.dest = self.root / "backups"
        self.staging = self.root / "staging"
        self.store = seed(self.live)
        self.logs: list[str] = []

    def tearDown(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    def run_backup(self, now: datetime, **kwargs) -> dict:
        return lb.run_backup(self.live, self.dest, self.staging, now=now, log=self.logs.append, free=plenty, min_free=0, **kwargs)

    def test_backup_while_writing_is_consistent_and_checked(self) -> None:
        stop = threading.Event()

        def writer() -> None:
            n = 0
            while not stop.is_set():
                self.store.upsert(f"tm_test/w{n}", {"n": n, "pad": "y" * 2000})
                n += 1

        thread = threading.Thread(target=writer)
        thread.start()
        try:
            time.sleep(0.05)
            summary = self.run_backup(datetime(2026, 11, 14, 8, 30, tzinfo=timezone.utc))
        finally:
            stop.set()
            thread.join()
        self.assertTrue(summary["ok"])
        self.assertEqual(summary["quick_check"], "ok")
        self.assertGreaterEqual(summary["documents"], 400)
        archive = self.dest / summary["file"]
        self.assertTrue(archive.is_file())
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        manifest = json.loads(lb.manifest_path(archive).read_text())
        self.assertEqual(manifest["raw_sha256"], summary["raw_sha256"])
        for key in ("copy_s", "check_s", "compress_s", "test_s", "total_s"):
            self.assertIn(key, manifest["timings"])
        latest = json.loads((self.dest / "latest.json").read_text())
        self.assertTrue(latest["ok"])
        # The staging copy is gone and nothing partial is left anywhere.
        self.assertEqual([p for p in self.staging.iterdir()], [])
        self.assertFalse(any(p.name.startswith(lb.PARTIAL_PREFIX) for p in self.dest.rglob("*")))

    def test_restore_round_trip_and_refusals(self) -> None:
        summary = self.run_backup(datetime(2026, 11, 14, 8, 30, tzinfo=timezone.utc))
        archive = self.dest / summary["file"]
        target = self.root / "restore" / "documents.sqlite3"
        result = lb.restore_archive(archive, target, live=[self.live], log=self.logs.append, free=plenty, min_free=0)
        self.assertTrue(result["manifest_match"])
        self.assertEqual(result["quick_check"], "ok")
        connection = sqlite3.connect(target)
        try:
            self.assertEqual(connection.execute("SELECT count(*) FROM documents").fetchone()[0], summary["documents"])
        finally:
            connection.close()
        # Never onto the live database, never over an existing file without --overwrite.
        with self.assertRaises(lb.BackupError) as live:
            lb.restore_archive(archive, self.live, live=[self.live], overwrite=True, free=plenty, min_free=0)
        self.assertIn("live database", str(live.exception))
        with self.assertRaises(lb.BackupError):
            lb.restore_archive(archive, target, live=[self.live], free=plenty, min_free=0)
        # A symlink to the live file is the live file.
        link = self.root / "link.sqlite3"
        os.symlink(self.live, link)
        with self.assertRaises(lb.BackupError):
            lb.restore_archive(archive, link, live=[self.live], overwrite=True, free=plenty, min_free=0)

    def test_restore_rejects_a_tampered_archive(self) -> None:
        summary = self.run_backup(datetime(2026, 11, 14, 8, 30, tzinfo=timezone.utc))
        archive = self.dest / summary["file"]
        manifest_file = lb.manifest_path(archive)
        manifest = json.loads(manifest_file.read_text())
        manifest["raw_sha256"] = "0" * 64
        manifest_file.write_text(json.dumps(manifest))
        target = self.root / "restore" / "documents.sqlite3"
        with self.assertRaises(lb.BackupError):
            lb.restore_archive(archive, target, live=[self.live], free=plenty, min_free=0)
        self.assertFalse(target.exists())
        self.assertEqual([p for p in target.parent.iterdir()], [])

    def test_retention_keeps_seven_dailies_and_four_weeklies(self) -> None:
        start = datetime(2026, 10, 1, 7, 30, tzinfo=timezone.utc)  # a Thursday
        for day in range(40):
            self.run_backup(start + timedelta(days=day))
        dailies = lb.archives_in(self.dest / "daily")
        weeklies = lb.archives_in(self.dest / "weekly")
        self.assertEqual(len(dailies), 7)
        self.assertEqual(len(weeklies), 4)
        # Weeklies are Sunday nights (New York), newest first, a week apart.
        stamps = [lb.parse_stamp(lb.ARCHIVE_RE.match(p.name).group(1)) for p in weeklies]
        self.assertTrue(all(s.astimezone(lb.ET).weekday() == 6 for s in stamps[:3]))
        self.assertTrue(all((a - b) == timedelta(days=7) for a, b in zip(stamps, stamps[1:3])))
        # Every kept archive has its manifest and no orphan manifests are left.
        for folder in (self.dest / "daily", self.dest / "weekly"):
            names = {p.name for p in folder.iterdir()}
            for archive in lb.archives_in(folder):
                self.assertIn(archive.name + ".json", names)
            self.assertEqual(len(names), 2 * len(lb.archives_in(folder)))

    def test_prune_never_touches_other_files(self) -> None:
        daily = self.dest / "daily"
        daily.mkdir(parents=True)
        keep_me = daily / "notes.txt"
        keep_me.write_text("mine")
        hand = daily / "localdb-manual.sqlite3.zst"
        hand.write_text("not ours")
        for day in range(3):
            (daily / f"localdb-2026110{day + 1}T083000Z.sqlite3.zst").write_text("a")
        removed = lb.prune(daily, 1, self.logs.append)
        self.assertEqual(len(removed), 2)
        self.assertTrue(keep_me.exists() and hand.exists())

    def test_refuses_without_room_for_the_wal(self) -> None:
        with self.assertRaises(lb.BackupError) as refused:
            lb.plan_run(self.live, self.dest, self.staging, free=lambda _p: 512 * 1024 * 1024)
        self.assertEqual(refused.exception.code, 2)
        self.assertIn("WAL", str(refused.exception))

    def test_falls_back_to_the_backup_volume_when_the_fast_disk_is_short(self) -> None:
        size = lb.source_bytes(self.live)
        reserve = lb.wal_reserve(size)

        def free(path: Path) -> int:
            # Room for the WAL next to the database but not for a copy as well; the backup volume is roomy.
            return 100 * GIB if str(path).startswith(str(self.dest)) else reserve + 2 * GIB + 1

        plan = lb.plan_run(self.live, self.dest, self.staging, free=free)
        self.assertEqual(plan.staging_kind, "backup-volume")
        self.assertEqual(plan.staging, self.dest / ".staging")

    def test_a_failed_run_is_recorded_and_keeps_the_last_good_one(self) -> None:
        good = self.run_backup(datetime(2026, 11, 14, 8, 30, tzinfo=timezone.utc))
        with self.assertRaises(lb.BackupError):
            lb.run_backup(self.live, self.dest, self.staging, now=datetime(2026, 11, 15, 8, 30, tzinfo=timezone.utc), log=self.logs.append, free=lambda _p: 1024)
        latest = json.loads((self.dest / "latest.json").read_text())
        self.assertFalse(latest["ok"])
        self.assertIn("refusing", latest["error"])
        self.assertEqual(latest["last_ok"]["file"], good["file"])
        self.assertEqual(len(lb.archives_in(self.dest / "daily")), 1)

    def test_leftover_staging_copy_is_cleared_before_the_space_check(self) -> None:
        self.staging.mkdir(parents=True)
        leftover = self.staging / f"{lb.PARTIAL_PREFIX}20261113T083000Z.sqlite3"
        leftover.write_bytes(b"\0" * 1024)
        self.run_backup(datetime(2026, 11, 14, 8, 30, tzinfo=timezone.utc))
        self.assertFalse(leftover.exists())

    def test_gzip_when_zstd_is_missing(self) -> None:
        compressor = lb.pick_compressor(which=lambda _name: None)
        self.assertEqual(compressor.name, "gzip")
        summary = self.run_backup(datetime(2026, 11, 14, 8, 30, tzinfo=timezone.utc), which=lambda _name: None)
        self.assertTrue(summary["file"].endswith(".sqlite3.gz"))
        target = self.root / "restore.sqlite3"
        lb.restore_archive(self.dest / summary["file"], target, live=[self.live], free=plenty, min_free=0)
        self.assertTrue(target.exists())

    def test_a_full_backup_volume_fails_fast_instead_of_hanging(self) -> None:
        raw = self.root / "raw.bin"
        raw.write_bytes(os.urandom(24 * 1024 * 1024))  # incompressible: the pipes fill up at once
        archive = self.root / "out.zst"
        original = lb._pump

        def pump(read, write, digest):
            if getattr(getattr(write, "__self__", None), "name", "") == str(archive):
                read(1)
                raise OSError(28, "No space left on device")
            return original(read, write, digest)

        started = time.monotonic()
        with mock.patch.object(lb, "_pump", pump):
            with self.assertRaises(OSError):
                lb.compress_file(raw, archive, lb.pick_compressor())
        self.assertLess(time.monotonic() - started, 20)

        def failing_write(_chunk: bytes) -> None:
            raise OSError(28, "No space left on device")

        good = self.root / "good.zst"
        lb.compress_file(raw, good, lb.pick_compressor())
        started = time.monotonic()
        with self.assertRaises(OSError):
            lb.decompress_to(good, failing_write, lb.pick_compressor())
        self.assertLess(time.monotonic() - started, 20)

    def test_source_size_survives_the_wal_vanishing(self) -> None:
        with mock.patch.object(Path, "stat", side_effect=[os.stat(self.live), FileNotFoundError()]):
            self.assertEqual(lb.source_bytes(self.live), os.stat(self.live).st_size)

    def test_one_weekly_per_new_york_day(self) -> None:
        sunday_night = datetime(2026, 11, 15, 8, 30, tzinfo=timezone.utc)  # 03:30 New York, Sunday
        self.run_backup(sunday_night)
        self.run_backup(sunday_night + timedelta(hours=10))  # a manual one that afternoon
        self.assertEqual(len(lb.archives_in(self.dest / "weekly")), 1)
        self.assertEqual(len(lb.archives_in(self.dest / "daily")), 2)

    def test_restore_refuses_the_live_wal_and_shm(self) -> None:
        summary = self.run_backup(datetime(2026, 11, 14, 8, 30, tzinfo=timezone.utc))
        for suffix in ("-wal", "-shm"):
            with self.assertRaises(lb.BackupError):
                lb.restore_archive(self.dest / summary["file"], Path(str(self.live) + suffix), live=[self.live], overwrite=True, free=plenty, min_free=0)

    def test_lock_stops_a_second_run(self) -> None:
        handle = lb._lock(self.dest)
        try:
            with self.assertRaises(lb.BackupError) as locked:
                lb._lock(self.dest)
            self.assertEqual(locked.exception.code, 3)
        finally:
            handle.close()


if __name__ == "__main__":
    unittest.main()
