"""Nightly online backup of the LocalDB SQLite store, its retention, and a checked restore.

What one run does (``python3 -m backend.ops.localdb_backup run``):

1. Checks space first and refuses with the numbers when it is short: the staging copy plus room for the live
   database's WAL to grow while the copy holds its read snapshot (writers keep going in WAL mode, but nothing can
   be checkpointed past an open reader), and the compressed archive on the backup volume.
2. Copies the live database with SQLite's online backup API in a single step, from a read-only connection: one
   consistent snapshot while the server keeps serving. A live file is never copied with cp.
3. Runs ``PRAGMA quick_check`` on the copy and counts its documents. A copy that fails is never kept.
4. Compresses it (zstd when installed, gzip otherwise) onto the backup volume, hashing the raw stream and the
   archive as it goes, then decompresses the archive once and checks it gives back the same bytes.
5. Writes a manifest next to the archive (sizes, hashes, the check result, how long each step took), keeps the
   newest 7 dailies and 4 weeklies (a weekly is a hard link to that Sunday's daily, so it costs no space), and
   records the outcome in ``latest.json`` for the health job.

Old archives are pruned only after a new one has passed every check, and only files this job named.

Restore (``restore ARCHIVE --to PATH``) decompresses into a new file, checks the hash against the manifest and
optionally runs quick_check. It never writes over an existing file or the live database: swapping a restored
copy into production is backend/vps/restore-localdb.sh's job, behind ``--production --yes``.

Standard library only. Archives and manifests are mode 0600 (the store holds account data).
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
GIB = 1024**3
CHUNK = 1024 * 1024

DEFAULT_SOURCE = "/var/lib/tikrr/localdb/documents.sqlite3"
DEFAULT_DEST = "/srv/tikrr-data/backups/localdb"
# On the same fast disk as the live database: the copy is written and checked there, then streamed compressed
# to the slow backup volume. quick_check on the slow volume would crawl (random reads at ~0.5 MB/s).
DEFAULT_STAGING = "/var/lib/tikrr/backup-staging"

KEEP_DAILY = 7
KEEP_WEEKLY = 4
# Sunday, New York time: that night's daily is also kept as the weekly.
WEEKLY_WEEKDAY = 6

ARCHIVE_RE = re.compile(r"^localdb-(\d{8}T\d{6}Z)\.sqlite3\.(zst|gz)$")
PARTIAL_PREFIX = ".partial-"


class BackupError(RuntimeError):
    """A failed step. ``code`` is the exit status: 1 a failed run, 2 refused before starting, 3 already running."""

    def __init__(self, message: str, code: int = 1):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Compressor:
    name: str
    ext: str
    compress: list[str]
    decompress: list[str]


def pick_compressor(level: int = 3, which: Callable[[str], str | None] = shutil.which) -> Compressor:
    """zstd when the host has it (fast, small), gzip otherwise. Both read stdin and write stdout, one thread."""
    if which("zstd"):
        return Compressor("zstd", "zst", ["zstd", "-q", "-c", f"-{level}", "-T1"], ["zstd", "-q", "-d", "-c"])
    return Compressor("gzip", "gz", ["gzip", "-c", f"-{min(max(level, 1), 9)}"], ["gzip", "-d", "-c"])


def compressor_for(archive: Path, which: Callable[[str], str | None] = shutil.which) -> Compressor:
    if archive.name.endswith(".zst"):
        if not which("zstd"):
            raise BackupError(f"{archive.name} is zstd and zstd is not installed here", 2)
        return pick_compressor(which=lambda _name: "zstd")
    if archive.name.endswith(".gz"):
        return pick_compressor(which=lambda _name: None)
    raise BackupError(f"{archive.name}: not a .zst or .gz archive", 2)


def human(n: float | int | None) -> str:
    if n is None:
        return "?"
    value = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(value) < 1024 or unit == "TB":
            return f"{value:.0f} {unit}" if unit in ("B", "KB") else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"


def _existing(path: Path) -> Path:
    """The path itself, or its nearest existing parent (for statvfs before a folder exists)."""
    probe = path
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    return probe


def free_bytes(path: Path) -> int:
    st = os.statvfs(_existing(path))
    return st.f_bavail * st.f_frsize


def same_filesystem(a: Path, b: Path) -> bool:
    return os.stat(_existing(a)).st_dev == os.stat(_existing(b)).st_dev


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def stamp_of(now: datetime) -> str:
    return now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def parse_stamp(stamp: str) -> datetime:
    return datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)


def archives_in(folder: Path) -> list[Path]:
    """This job's archives in a folder, newest first. Anything else in the folder is ignored (and never deleted)."""
    if not folder.is_dir():
        return []
    found = [path for path in folder.iterdir() if path.is_file() and ARCHIVE_RE.match(path.name)]
    return sorted(found, key=lambda path: ARCHIVE_RE.match(path.name).group(1), reverse=True)  # type: ignore[union-attr]


def manifest_path(archive: Path) -> Path:
    return archive.with_name(archive.name + ".json")


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def write_json_atomic(path: Path, data: dict[str, Any], mode: int = 0o600) -> None:
    tmp = path.with_name(f"{PARTIAL_PREFIX}{path.name}.{os.getpid()}")
    with open(tmp, "w") as handle:
        json.dump(data, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def source_bytes(source: Path) -> int:
    """The database plus its WAL right now: what the copy will be at most."""
    total = source.stat().st_size
    try:
        # The server deletes the WAL when its last connection closes, so it can vanish between any two calls.
        total += source.with_name(source.name + "-wal").stat().st_size
    except FileNotFoundError:
        pass
    return total


def wal_reserve(size: int) -> int:
    """Room for the live WAL to grow while the copy holds its snapshot: a quarter of the database, at least 1 GiB."""
    return max(GIB, size // 4)


def estimated_archive_bytes(size: int, previous: Iterable[dict[str, Any]]) -> int:
    """The last archive's size with 25% headroom, or half the raw size before there is one."""
    for manifest in previous:
        compressed = manifest.get("compressed_bytes")
        raw = manifest.get("backup_bytes")
        if isinstance(compressed, int) and isinstance(raw, int) and raw > 0:
            return int(size * compressed / raw * 1.25)
    return size // 2


# ---------------------------------------------------------------------------------------------------------------
# The three steps: copy, check, compress.


def sqlite_backup(source: Path, target: Path) -> None:
    """One consistent copy through SQLite's backup API, in a single step, from a read-only connection.

    A single step holds one read snapshot from start to end, so the copy is exactly the database at one moment.
    In WAL mode that never blocks the server's writers; it only keeps the WAL from being checkpointed until the
    copy is done (the space check reserves room for that).
    """
    if target.exists():
        raise BackupError(f"{target} already exists")
    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True, timeout=60.0)
    try:
        src.execute("PRAGMA busy_timeout=60000")
        dst = sqlite3.connect(str(target))
        try:
            src.backup(dst, pages=-1)
        finally:
            dst.close()
    finally:
        src.close()
    os.chmod(target, 0o600)


def check_copy(path: Path) -> dict[str, Any]:
    """quick_check plus a document count, on a copy nobody else has open (immutable: no -wal/-shm is created)."""
    connection = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True)
    try:
        rows = [str(row[0]) for row in connection.execute("PRAGMA quick_check")]
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        documents = connection.execute("SELECT count(*) FROM documents").fetchone()[0] if "documents" in tables else None
        page_size = connection.execute("PRAGMA page_size").fetchone()[0]
        page_count = connection.execute("PRAGMA page_count").fetchone()[0]
    finally:
        connection.close()
    ok = rows == ["ok"] and documents is not None
    problem = None
    if rows != ["ok"]:
        problem = "quick_check: " + "; ".join(rows[:5])
    elif documents is None:
        problem = "no documents table"
    return {"ok": ok, "quick_check": "ok" if rows == ["ok"] else problem, "documents": documents, "page_size": page_size, "page_count": page_count, "problem": problem}


def _pump(read: Callable[[int], bytes], write: Callable[[bytes], Any], digest: Any) -> int:
    total = 0
    while True:
        chunk = read(CHUNK)
        if not chunk:
            return total
        digest.update(chunk)
        write(chunk)
        total += len(chunk)


def _stderr_text(handle: Any) -> str:
    handle.seek(0)
    return handle.read().decode(errors="replace").strip()


def compress_file(raw: Path, archive: Path, compressor: Compressor) -> dict[str, Any]:
    """Stream ``raw`` through the compressor into ``archive``, hashing both sides in the same pass.

    The compressor's stderr goes to a temp file (never a pipe nobody drains), and if anything fails on our side
    (the backup volume fills, SIGTERM) the compressor is killed first, so the feeding thread cannot block forever.
    """
    raw_digest, archive_digest = hashlib.sha256(), hashlib.sha256()
    errors = tempfile.TemporaryFile()
    proc = subprocess.Popen(compressor.compress, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors)
    fed: dict[str, Any] = {}

    def feed() -> None:
        try:
            with open(raw, "rb") as source:
                fed["bytes"] = _pump(source.read, proc.stdin.write, raw_digest)  # type: ignore[union-attr]
        except BaseException as exc:  # surfaced below
            fed["error"] = exc
        finally:
            try:
                proc.stdin.close()  # type: ignore[union-attr]
            except OSError:
                pass

    feeder = threading.Thread(target=feed, daemon=True)
    feeder.start()
    ok = False
    try:
        with open(archive, "xb") as out:
            os.fchmod(out.fileno(), 0o600)
            written = _pump(proc.stdout.read, out.write, archive_digest)  # type: ignore[union-attr]
            out.flush()
            os.fsync(out.fileno())
        ok = True
    finally:
        if not ok:
            proc.kill()
        feeder.join(timeout=None if ok else 30)
        code = proc.wait()
        proc.stdout.close()  # type: ignore[union-attr]
        stderr = _stderr_text(errors)
        errors.close()
    if fed.get("error") is not None:
        raise BackupError(f"reading the copy failed: {fed['error']}")
    if code != 0:
        raise BackupError(f"{compressor.name} failed ({code}): {stderr[:300]}")
    return {"raw_bytes": fed.get("bytes", 0), "raw_sha256": raw_digest.hexdigest(), "compressed_bytes": written, "compressed_sha256": archive_digest.hexdigest()}


def decompress_to(archive: Path, write: Callable[[bytes], Any], compressor: Compressor) -> tuple[int, str]:
    """Decompress ``archive`` into ``write``; returns (bytes, sha256 of the raw stream). Kills the tool if ``write`` fails."""
    digest = hashlib.sha256()
    with open(archive, "rb") as source, tempfile.TemporaryFile() as errors:
        proc = subprocess.Popen(compressor.decompress, stdin=source, stdout=subprocess.PIPE, stderr=errors)
        ok = False
        try:
            total = _pump(proc.stdout.read, write, digest)  # type: ignore[union-attr]
            ok = True
        finally:
            if not ok:
                proc.kill()
            code = proc.wait()
            proc.stdout.close()  # type: ignore[union-attr]
            stderr = _stderr_text(errors)
    if code != 0:
        raise BackupError(f"{compressor.name} could not read {archive.name} ({code}): {stderr[:300]}")
    return total, digest.hexdigest()


# ---------------------------------------------------------------------------------------------------------------
# Retention.


def is_weekly_run(now: datetime, weekly_dir: Path) -> bool:
    """Sunday (New York) nights, and any night the newest weekly is more than 7 days old (or there is none).

    One weekly per New York day: a backup taken by hand later on a Sunday does not make a second one.
    """
    newest = archives_in(weekly_dir)
    if not newest:
        return True
    newest_at = parse_stamp(ARCHIVE_RE.match(newest[0].name).group(1))  # type: ignore[union-attr]
    if newest_at.astimezone(ET).date() == now.astimezone(ET).date():
        return False
    if now.astimezone(ET).weekday() == WEEKLY_WEEKDAY:
        return True
    return now - newest_at > timedelta(days=7, hours=12)


def prune(folder: Path, keep: int, log: Callable[[str], None]) -> list[str]:
    """Delete this job's archives (and their manifests) beyond the newest ``keep``. Returns the names deleted."""
    removed = []
    for archive in archives_in(folder)[max(keep, 1) :]:
        archive.unlink()
        manifest = manifest_path(archive)
        if manifest.exists():
            manifest.unlink()
        removed.append(archive.name)
        log(f"[backup] pruned {folder.name}/{archive.name}")
    return removed


def keep_weekly(archive: Path, weekly_dir: Path) -> Path:
    """The daily archive as this week's weekly: a hard link (no extra space), or a copy across filesystems."""
    weekly_dir.mkdir(parents=True, exist_ok=True)
    target = weekly_dir / archive.name
    if not target.exists():
        try:
            os.link(archive, target)
        except OSError:
            shutil.copy2(archive, target)
    manifest = manifest_path(archive)
    if manifest.exists():
        shutil.copy2(manifest, manifest_path(target))
    return target


# ---------------------------------------------------------------------------------------------------------------
# One run.


@dataclass
class Plan:
    source: Path
    dest: Path
    staging: Path
    staging_kind: str
    compressor: Compressor
    size: int
    wal_reserve: int
    archive_estimate: int
    source_free: int
    staging_free: int
    dest_free: int


def plan_run(
    source: Path,
    dest: Path,
    staging: Path,
    *,
    level: int = 3,
    min_free: int = 2 * GIB,
    which: Callable[[str], str | None] = shutil.which,
    free: Callable[[Path], int] = free_bytes,
) -> Plan:
    """Where the copy goes and whether everything fits. Raises BackupError(code 2) with the numbers when not."""
    if not source.is_file():
        raise BackupError(f"no database at {source}", 2)
    size = source_bytes(source)
    reserve = wal_reserve(size)
    previous = [m for m in (read_json(manifest_path(a)) for a in archives_in(dest / "daily")) if m]
    estimate = estimated_archive_bytes(size, previous)
    source_free = free(source.parent)
    dest_free = free(dest)

    # The live WAL can grow while the copy is open: never let the backup fill the live database's disk.
    if source_free < reserve + min_free:
        raise BackupError(
            f"refusing: {human(source_free)} free next to the live database, need {human(reserve)} for its WAL "
            f"to grow during the copy plus {human(min_free)} spare",
            2,
        )
    staging_kind = "fast"
    staging_free = free(staging)
    staging_need = size + min_free + (reserve if same_filesystem(staging, source) else 0)
    if staging_free < staging_need:
        # Not enough room on the fast disk: stage on the backup volume instead (slower to check, still safe).
        staging = dest / ".staging"
        staging_kind = "backup-volume"
        staging_free = dest_free
        if dest_free < size + estimate + min_free:
            raise BackupError(
                f"refusing: the copy ({human(size)}) fits neither next to the database ({human(source_free)} free, "
                f"need {human(staging_need)}) nor on the backup volume with its archive ({human(dest_free)} free, "
                f"need {human(size + estimate + min_free)})",
                2,
            )
    elif dest_free < estimate + min_free:
        raise BackupError(
            f"refusing: {human(dest_free)} free on the backup volume, need about {human(estimate)} for the archive "
            f"plus {human(min_free)} spare",
            2,
        )
    return Plan(source, dest, staging, staging_kind, pick_compressor(level, which), size, reserve, estimate, source_free, staging_free, dest_free)


def _lock(dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    handle = open(dest / ".backup.lock", "a+")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise BackupError("another backup is running (lock held)", 3)
    return handle


def _clear_partials(*folders: Path) -> None:
    """Leftovers of a run that died (we hold the lock, so nothing else is writing them)."""
    for folder in folders:
        if not folder.is_dir():
            continue
        for path in folder.iterdir():
            if path.name.startswith(PARTIAL_PREFIX) and path.is_file():
                path.unlink()


def run_backup(
    source: Path,
    dest: Path,
    staging: Path,
    *,
    keep_daily: int = KEEP_DAILY,
    keep_weekly_count: int = KEEP_WEEKLY,
    level: int = 3,
    min_free: int = 2 * GIB,
    now: datetime | None = None,
    log: Callable[[str], None] = print,
    which: Callable[[str], str | None] = shutil.which,
    free: Callable[[Path], int] = free_bytes,
) -> dict[str, Any]:
    """One full run. Returns the manifest; raises BackupError on any failure (and records it in latest.json)."""
    started_at = now or utc_now()
    started = time.monotonic()
    daily_dir, weekly_dir = dest / "daily", dest / "weekly"
    latest = dest / "latest.json"
    lock = _lock(dest)
    staged: Path | None = None
    timings: dict[str, float] = {}
    try:
        for folder in (daily_dir, weekly_dir):
            folder.mkdir(parents=True, exist_ok=True)
            os.chmod(folder, 0o750)
        os.chmod(dest, 0o750)
        # A run killed mid-copy (SIGKILL after the unit's stop timeout) leaves its staging copy behind: clear it
        # before the space check counts it against us. We hold the lock, so nothing else is writing these.
        _clear_partials(staging, dest / ".staging", daily_dir, weekly_dir, dest)
        plan = plan_run(source, dest, staging, level=level, min_free=min_free, which=which, free=free)
        plan.staging.mkdir(parents=True, exist_ok=True)
        os.chmod(plan.staging, 0o700)
        log(
            f"[backup] {source} ({human(plan.size)}) -> {dest}, staging on the {plan.staging_kind} disk; "
            f"free: {human(plan.source_free)} by the database, {human(plan.dest_free)} on the backup volume"
        )

        stamp = stamp_of(started_at)
        name = f"localdb-{stamp}.sqlite3.{plan.compressor.ext}"
        staged = plan.staging / f"{PARTIAL_PREFIX}{stamp}.sqlite3"

        step = time.monotonic()
        sqlite_backup(source, staged)
        timings["copy_s"] = round(time.monotonic() - step, 1)
        log(f"[backup] copied {human(staged.stat().st_size)} in {timings['copy_s']}s")

        step = time.monotonic()
        check = check_copy(staged)
        timings["check_s"] = round(time.monotonic() - step, 1)
        if not check["ok"]:
            raise BackupError(f"the copy failed its check: {check['problem']}")
        log(f"[backup] quick_check ok, {check['documents']} documents, in {timings['check_s']}s")

        step = time.monotonic()
        partial = daily_dir / f"{PARTIAL_PREFIX}{name}"
        sums = compress_file(staged, partial, plan.compressor)
        timings["compress_s"] = round(time.monotonic() - step, 1)
        log(f"[backup] {plan.compressor.name}: {human(sums['raw_bytes'])} -> {human(sums['compressed_bytes'])} in {timings['compress_s']}s")

        # Read the archive back: it must decompress to exactly the bytes that passed the check.
        step = time.monotonic()
        test_bytes, test_sha = decompress_to(partial, lambda _chunk: None, plan.compressor)
        timings["test_s"] = round(time.monotonic() - step, 1)
        if test_sha != sums["raw_sha256"] or test_bytes != sums["raw_bytes"]:
            raise BackupError("the archive does not decompress to the checked copy")
        log(f"[backup] archive read back and matches, in {timings['test_s']}s")

        archive = daily_dir / name
        os.replace(partial, archive)
        timings["total_s"] = round(time.monotonic() - started, 1)
        manifest: dict[str, Any] = {
            "ok": True,
            "file": f"daily/{name}",
            "created_at": started_at.isoformat(),
            "finished_at": utc_now().isoformat(),
            "host": socket.gethostname(),
            "source": str(source),
            "source_bytes": plan.size,
            "backup_bytes": sums["raw_bytes"],
            "compressed_bytes": sums["compressed_bytes"],
            "compressor": plan.compressor.name,
            "level": level,
            "raw_sha256": sums["raw_sha256"],
            "compressed_sha256": sums["compressed_sha256"],
            "quick_check": check["quick_check"],
            "documents": check["documents"],
            "page_size": check["page_size"],
            "page_count": check["page_count"],
            "sqlite_version": sqlite3.sqlite_version,
            "staging": plan.staging_kind,
            "timings": timings,
        }
        write_json_atomic(manifest_path(archive), manifest)

        weekly = None
        if is_weekly_run(started_at, weekly_dir):
            weekly = keep_weekly(archive, weekly_dir)
            log(f"[backup] kept as this week's weekly: weekly/{weekly.name}")
        removed = prune(daily_dir, keep_daily, log) + prune(weekly_dir, keep_weekly_count, log)

        summary = dict(manifest)
        summary.update(
            {
                "weekly": f"weekly/{weekly.name}" if weekly else None,
                "pruned": removed,
                "dailies": len(archives_in(daily_dir)),
                "weeklies": len(archives_in(weekly_dir)),
                "dest_free_bytes": free(dest),
                "source_free_bytes": free(source.parent),
            }
        )
        write_json_atomic(latest, summary, mode=0o640)
        log(
            f"[backup] done: {name}, {human(sums['compressed_bytes'])}, {timings['total_s']}s in all; "
            f"{summary['dailies']} dailies, {summary['weeklies']} weeklies, {human(summary['dest_free_bytes'])} free"
        )
        return summary
    except BaseException as exc:
        if isinstance(exc, BackupError):
            message = str(exc)
        elif isinstance(exc, (SystemExit, KeyboardInterrupt)):
            message = "stopped before it finished (SIGTERM or Ctrl-C, e.g. the unit's time limit)"
        else:
            message = f"{type(exc).__name__}: {exc}"
        previous = read_json(latest) or {}
        last_ok = previous if previous.get("ok") else previous.get("last_ok")
        failure = {
            "ok": False,
            "created_at": started_at.isoformat(),
            "finished_at": utc_now().isoformat(),
            "error": message[:500],
            "timings": timings,
            "last_ok": last_ok,
        }
        try:
            write_json_atomic(latest, failure, mode=0o640)
        except OSError:
            pass
        if isinstance(exc, BackupError):
            raise
        raise BackupError(message) from exc
    finally:
        if staged is not None and staged.exists():
            staged.unlink()
        _clear_partials(daily_dir, weekly_dir)
        lock.close()


# ---------------------------------------------------------------------------------------------------------------
# Restore into a new file (never over the live database).


def same_file(a: Path, b: Path) -> bool:
    try:
        return os.path.samefile(a, b)
    except OSError:
        return False


def restore_archive(
    archive: Path,
    target: Path,
    *,
    live: Iterable[Path] = (Path(DEFAULT_SOURCE),),
    quick_check: bool = True,
    overwrite: bool = False,
    min_free: int = GIB,
    log: Callable[[str], None] = print,
    free: Callable[[Path], int] = free_bytes,
) -> dict[str, Any]:
    """Decompress ``archive`` into ``target`` (a new file), check its hash against the manifest, optionally quick_check.

    Refuses to write onto the live database (always, even with ``overwrite``) or onto any existing file unless
    ``overwrite``. The file only appears at ``target`` once every check has passed.
    """
    archive = archive.resolve()
    if not archive.is_file():
        raise BackupError(f"no archive at {archive}", 2)
    target = target.absolute()
    # The default live path and LOCALDB_PATH are always refused, whatever else the caller passes.
    live_paths = [Path(p) for p in (*live, DEFAULT_SOURCE, os.environ.get("LOCALDB_PATH") or DEFAULT_SOURCE)]
    for live_path in live_paths:
        if same_file(target, live_path) or target.resolve() == live_path.resolve():
            raise BackupError(f"refusing: {target} is the live database; use restore-localdb.sh --production --yes", 2)
        for suffix in ("-wal", "-shm", "-journal"):
            side = live_path.resolve().with_name(live_path.resolve().name + suffix)
            if target.resolve() == side or target.name == live_path.name + suffix:
                raise BackupError(f"refusing: {target} is the live database's {suffix[1:]} file", 2)
    if target.exists() and not overwrite:
        raise BackupError(f"refusing: {target} exists (pass --overwrite for a scratch copy)", 2)
    compressor = compressor_for(archive)
    manifest = read_json(manifest_path(archive))
    expected_sha = (manifest or {}).get("raw_sha256")
    raw_size = (manifest or {}).get("backup_bytes") or archive.stat().st_size * 5
    target.parent.mkdir(parents=True, exist_ok=True)
    room = free(target.parent)
    if room < raw_size + min_free:
        raise BackupError(f"refusing: {human(room)} free at {target.parent}, need {human(raw_size)} plus {human(min_free)} spare", 2)

    partial = target.with_name(f"{PARTIAL_PREFIX}{target.name}.{os.getpid()}")
    started = time.monotonic()
    try:
        with open(partial, "xb") as out:
            os.fchmod(out.fileno(), 0o600)
            size, sha = decompress_to(archive, out.write, compressor)
            out.flush()
            os.fsync(out.fileno())
        if expected_sha and sha != expected_sha:
            raise BackupError(f"hash mismatch: the archive gives {sha[:12]}, its manifest says {str(expected_sha)[:12]}")
        log(f"[restore] {archive.name}: {human(size)} decompressed" + (", hash matches the manifest" if expected_sha else ", no manifest to compare"))
        check: dict[str, Any] | None = None
        if quick_check:
            check = check_copy(partial)
            if not check["ok"]:
                raise BackupError(f"the restored copy failed its check: {check['problem']}")
            log(f"[restore] quick_check ok, {check['documents']} documents")
        os.replace(partial, target)
    finally:
        if partial.exists():
            partial.unlink()
    return {
        "ok": True,
        "archive": str(archive),
        "target": str(target),
        "bytes": size,
        "raw_sha256": sha,
        "manifest_match": bool(expected_sha),
        "quick_check": None if check is None else check["quick_check"],
        "documents": None if check is None else check["documents"],
        "seconds": round(time.monotonic() - started, 1),
    }


# ---------------------------------------------------------------------------------------------------------------
# CLI.


def list_archives(dest: Path) -> list[dict[str, Any]]:
    rows = []
    for kind in ("daily", "weekly"):
        for archive in archives_in(dest / kind):
            manifest = read_json(manifest_path(archive)) or {}
            rows.append(
                {
                    "kind": kind,
                    "file": str(archive),
                    "created_at": manifest.get("created_at") or parse_stamp(ARCHIVE_RE.match(archive.name).group(1)).isoformat(),  # type: ignore[union-attr]
                    "compressed_bytes": archive.stat().st_size,
                    "backup_bytes": manifest.get("backup_bytes"),
                    "quick_check": manifest.get("quick_check"),
                    "documents": manifest.get("documents"),
                }
            )
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LocalDB backup, retention and restore.")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="take, check and keep one backup")
    run.add_argument("--source", default=os.environ.get("LOCALDB_BACKUP_SOURCE", DEFAULT_SOURCE))
    run.add_argument("--dest", default=os.environ.get("LOCALDB_BACKUP_DIR", DEFAULT_DEST))
    run.add_argument("--staging", default=os.environ.get("LOCALDB_BACKUP_STAGING", DEFAULT_STAGING))
    run.add_argument("--keep-daily", type=int, default=KEEP_DAILY)
    run.add_argument("--keep-weekly", type=int, default=KEEP_WEEKLY)
    run.add_argument("--level", type=int, default=3, help="compression level (zstd 1-19, gzip 1-9)")
    run.add_argument("--min-free-gb", type=float, default=2.0, help="spare space every disk must keep")
    run.add_argument("--dry-run", action="store_true", help="check space and print the plan, copy nothing")

    listing = sub.add_parser("list", help="the kept archives")
    listing.add_argument("--dest", default=os.environ.get("LOCALDB_BACKUP_DIR", DEFAULT_DEST))
    listing.add_argument("--json", action="store_true")

    restore = sub.add_parser("restore", help="decompress an archive into a NEW file and check it")
    restore.add_argument("archive")
    restore.add_argument("--to", required=True, help="the new file to write (never the live database)")
    restore.add_argument("--live", action="append", default=[], help="a live database path to refuse (repeatable)")
    restore.add_argument("--no-quick-check", action="store_true", help="hash check only (quick_check on the slow volume takes hours)")
    restore.add_argument("--overwrite", action="store_true", help="replace an existing scratch file")

    args = parser.parse_args(argv)
    # systemd stops a unit with SIGTERM: turn it into SystemExit so the staging copy is cleaned up on the way out.
    signal.signal(signal.SIGTERM, lambda _signum, _frame: sys.exit(143))
    try:
        if args.command == "run":
            source, dest, staging = Path(args.source), Path(args.dest), Path(args.staging)
            min_free = int(args.min_free_gb * GIB)
            if args.dry_run:
                plan = plan_run(source, dest, staging, level=args.level, min_free=min_free)
                print(
                    f"[backup] would copy {source} ({human(plan.size)}), staging on the {plan.staging_kind} disk at "
                    f"{plan.staging} ({human(plan.staging_free)} free), WAL reserve {human(plan.wal_reserve)}, "
                    f"archive about {human(plan.archive_estimate)} with {plan.compressor.name} into {dest} "
                    f"({human(plan.dest_free)} free)"
                )
                return 0
            run_backup(source, dest, staging, keep_daily=args.keep_daily, keep_weekly_count=args.keep_weekly, level=args.level, min_free=min_free)
            return 0
        if args.command == "list":
            rows = list_archives(Path(args.dest))
            if args.json:
                print(json.dumps(rows, indent=2))
            elif not rows:
                print(f"no backups in {args.dest}")
            for row in rows if not args.json else []:
                print(f"{row['kind']:6s} {row['created_at'][:16]}  {human(row['compressed_bytes']):>9s}  check={row['quick_check'] or '?'}  docs={row['documents'] or '?'}  {row['file']}")
            return 0
        if args.command == "restore":
            live = [Path(p) for p in args.live]
            result = restore_archive(Path(args.archive), Path(args.to), live=live, quick_check=not args.no_quick_check, overwrite=args.overwrite)
            print(json.dumps(result, indent=2))
            return 0
    except BackupError as exc:
        print(f"[backup] FAILED: {exc}", file=sys.stderr)
        return exc.code
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
