"""The box's health every 5 minutes, written to tm_ops_health for /admin/analytics (System tab).

``python3 -m backend.ops.health`` (tikrr-ops-health.timer) checks, in about ten seconds:

* the public site through Cloudflare (home and one stock page: status and time),
* both web instances, Varnish and LocalDB on the box,
* disk, memory, swap and load, failed units, and the last LocalDB backup (backend/ops/localdb_backup.py),
* data freshness: when key documents were last written, against the schedule of the jobs that write them
  (prices in market hours, the after-close chain, extended-hours quotes in their windows, the wire every 30 min),
* the last 15 minutes of Caddy's access log (5xx rate, p95) and LocalDB's own /metrics,
* a 24-hour journal summary of every tikrr-* unit (runs, failures, wall time, CPU, memory peak) and of each
  agent data step.

It writes two documents and nothing else: ``tm_ops_health/latest`` (this run in full) and
``tm_ops_health/history`` (one compact line per run, the last 24 hours). Read-only everywhere else: the
staleness reads open SQLite read-only, the HTTP checks are GETs.

Privacy: no IP address, query string, user id or token is ever stored. Paths in the 5xx list have their query
dropped and id-like segments replaced with ``:id``.

Alerts: off unless ``OPS_ALERT_EMAIL`` is set (in /etc/tikrr/ops.env, with EMAILS_ENABLED=1 and BREVO_API_KEY for
backend/email.py). Off, each run records (and logs) what it would have sent. On, it emails when a check has been red
two runs in a row (at most once per check every 2 hours), a reminder every 6 hours while it stays red, and once when
all is clear again. The alert state lives in the unit's StateDirectory as well as the store, so a store outage
cannot turn every run into a new alert.

Without ``--write`` it only runs the checks and prints them: nothing is written and no alert is planned or sent
(backend/vps/ops.sh status). The timer's unit passes ``--write``.

Standard library only.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import socket
import sqlite3
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
UTC = timezone.utc

SITE = os.environ.get("OPS_SITE_URL", "https://www.stocksbrew.online").rstrip("/")
STOCK_PATH = os.environ.get("OPS_STOCK_PATH", "/stock/AAPL")
USER_AGENT = "stocksbrew-ops-health/1"
LOCAL_HOST_HEADERS = {"Host": "www.stocksbrew.online", "X-Forwarded-Proto": "https"}
CADDY_LOG = os.environ.get("OPS_CADDY_LOG", "/var/log/caddy/stocksbrew.log")
BACKUP_DIR = os.environ.get("LOCALDB_BACKUP_DIR", "/srv/tikrr-data/backups/localdb")
DISKS = (("/", "System disk"), ("/srv/tikrr-data", "Data disk"))
COLLECTION = "tm_ops_health"
HISTORY_HOURS = 24
HISTORY_MAX = 320
ALERT_REMINDER_HOURS = 6
ALERT_COOLDOWN_HOURS = 2
# systemd's StateDirectory=tikrr-ops sets STATE_DIRECTORY; the alert state lives there, not only in the store.
STATE_DIR = os.environ.get("STATE_DIRECTORY") or os.environ.get("OPS_STATE_DIR")
APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", SITE).rstrip("/")

STATUS_RANK = {"ok": 0, "unknown": 1, "warn": 2, "fail": 3}
STATUS_LETTER = {"ok": "g", "warn": "a", "fail": "r", "unknown": "u"}


def now_utc() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat(timespec="seconds") if value else None


def parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def check(id: str, group: str, label: str, status: str, detail: str, **extra: Any) -> dict[str, Any]:
    row = {"id": id, "group": group, "label": label, "status": status, "detail": detail}
    row.update({key: value for key, value in extra.items() if value is not None})
    return row


def worst(statuses: Iterable[str]) -> str:
    """The overall colour: the worst of ok/warn/fail. A check that could not run (unknown) never turns it red."""
    known = [s for s in statuses if s != "unknown"]
    if not known:
        return "unknown"
    return max(known, key=lambda s: STATUS_RANK[s])


def ago(seconds: float) -> str:
    seconds = max(0, int(seconds))
    if seconds < 90:
        return f"{seconds}s ago"
    if seconds < 5400:
        return f"{round(seconds / 60)} min ago"
    if seconds < 48 * 3600:
        return f"{seconds / 3600:.1f} h ago"
    return f"{seconds / 86400:.1f} days ago"


# ---------------------------------------------------------------------------------------------------------------
# NYSE calendar (kept in step with backend/mail/nyse.py, imported when present).


def trading_day(day: date) -> bool:
    try:
        from backend.mail import nyse

        return nyse.trading_day(day)
    except Exception:  # pragma: no cover - the module ships with the repo
        return day.weekday() < 5


def half_day(day: date) -> bool:
    """A 1pm close (the day before Independence Day, after Thanksgiving, Christmas Eve)."""
    try:
        from backend.mail import nyse

        return day in nyse.early_closes(day.year)
    except Exception:  # pragma: no cover
        return False


# ---------------------------------------------------------------------------------------------------------------
# Freshness: when a document was last written, against the schedule of the job that writes it.


@dataclass(frozen=True)
class Freshness:
    id: str
    label: str
    paths: tuple[str, ...] = ()
    # "newest": any of the paths fresh is enough (several tickers of one job); "oldest": every one must be.
    combine: str = "newest"
    # Max-age rule (jobs that run around the clock).
    warn_after_min: int | None = None
    fail_after_min: int | None = None
    # Schedule rule: New York times on trading days / weekdays, each expected written within grace minutes.
    times: tuple[str, ...] = ()
    days: str = "trading"
    grace_min: int = 30
    ok_misses: int = 0
    warn_misses: int = 1
    # On a half day (1pm close) the runs in this New York window write nothing new: leave them out.
    half_day_skip: tuple[str, str] | None = None
    # One document per session (``{date}`` is the session's New York date); with dated_stage, the time that stage
    # of the session finished successfully (tm_market_session_runs: ``stages.<stage>.status == "success"``)
    # stands in for the document's write time, so a session whose later stage failed does not count as done.
    dated_path: str | None = None
    dated_stage: str | None = None
    feeds: str = ""


# The signals. Each names the job that writes it and the page that shows it.
FRESHNESS: tuple[Freshness, ...] = (
    Freshness(
        "prices",
        "Prices",
        paths=("tm_latest_prices/US_AAPL", "tm_latest_prices/US_MSFT", "tm_latest_prices/US_NVDA"),
        times=("09:30", "09:50", "10:00", "11:00", "12:00", "12:30", "13:00", "14:00", "14:30", "15:00", "16:10"),
        grace_min=25,
        ok_misses=1,
        warn_misses=3,
        half_day_skip=("13:01", "16:00"),
        feeds="price lanes (open, movers, hourly, postclose) -> every price on the site",
    ),
    Freshness(
        "home_view",
        "Home dashboard",
        paths=("tm_home_view_core/US",),
        times=("09:30", "16:10"),
        grace_min=40,
        feeds="open-price and postclose -> the home page",
    ),
    Freshness(
        "anomalies",
        "Move reasons",
        paths=("tm_daily_anomalies/US__latest",),
        times=("09:50", "16:10"),
        grace_min=60,
        feeds="open/close anomalies -> movers, briefing, opening email",
    ),
    Freshness(
        "close_briefs",
        "Closing briefs",
        dated_path="tm_market_session_runs/US__post_close__{date}",
        dated_stage="briefs",
        times=("16:10",),
        grace_min=75,
        feeds="postclose -> close briefs -> close anomalies",
    ),
    Freshness(
        "after_close",
        "After-close data",
        paths=("tm_screener_snapshot/US", "tm_dividend_history_meta/US"),
        combine="oldest",
        times=("17:30",),
        days="weekdays",
        grace_min=120,
        feeds="agentdata after_close -> screener, prices history, earnings, agents",
    ),
    Freshness(
        "extended",
        "Extended hours",
        paths=("tm_extended_quotes/AAPL", "tm_extended_quotes/MSFT", "tm_extended_quotes/NVDA"),
        times=("07:35", "08:35", "09:20")
        + tuple(f"{h:02d}:{m:02d}" for h in range(16, 20) for m in (5, 20, 35, 50))
        + ("20:05",),
        grace_min=12,
        ok_misses=1,
        warn_misses=3,
        # After-hours trading ends at 17:00 on a half day: the later runs find no new print and write nothing.
        half_day_skip=("17:01", "23:59"),
        feeds="agentdata extended_hours -> the stock page's after-hours line, agent, briefing",
    ),
    Freshness(
        "premarket",
        "Pre-market",
        paths=("tm_premarket_opening/US__latest",),
        times=("07:30",),
        grace_min=30,
        feeds="premarket pipeline -> pre-market page and email",
    ),
    Freshness(
        "news",
        "News wire",
        paths=("tm_agent_news_meta/US", "tm_agent_news_tone_meta/US"),
        combine="oldest",
        warn_after_min=75,
        fail_after_min=180,
        feeds="agentdata frequent -> /news, stock pages, briefing",
    ),
    Freshness(
        "markets",
        "Markets page",
        paths=("tm_markets_meta/latest",),
        warn_after_min=75,
        fail_after_min=180,
        feeds="agentdata frequent -> /markets",
    ),
    Freshness(
        "sec_hourly",
        "Filings and insiders",
        paths=("tm_agent_filings_meta/US", "tm_insider_meta/run", "tm_agent_calendar_meta/US"),
        combine="oldest",
        warn_after_min=150,
        fail_after_min=300,
        feeds="agentdata hourly -> filings, insiders, calendar",
    ),
)


def scheduled_runs(spec: Freshness, now: datetime, lookback_days: int = 10) -> list[datetime]:
    """Every scheduled run whose grace has passed by ``now``, newest first."""
    out = []
    today = now.astimezone(ET).date()
    for back in range(lookback_days + 1):
        day = today - timedelta(days=back)
        if spec.days == "trading" and not trading_day(day):
            continue
        if spec.days == "weekdays" and day.weekday() >= 5:
            continue
        short = spec.half_day_skip is not None and half_day(day)
        for hhmm in spec.times:
            if short and spec.half_day_skip[0] <= hhmm <= spec.half_day_skip[1]:  # type: ignore[index]
                continue
            hour, minute = (int(part) for part in hhmm.split(":"))
            at = datetime(day.year, day.month, day.day, hour, minute, tzinfo=ET)
            if at + timedelta(minutes=spec.grace_min) <= now:
                out.append(at)
    return sorted(out, reverse=True)


def judge_freshness(spec: Freshness, written: dict[str, datetime | None], now: datetime) -> dict[str, Any]:
    """One freshness check from the write times of its documents (a missing document is None)."""
    if spec.dated_path:
        runs = scheduled_runs(spec, now)
        if not runs:
            return check(spec.id, "data", spec.label, "unknown", "no scheduled run yet", feeds=spec.feeds)
        missed = 0
        for run in runs[: spec.warn_misses + 2]:
            at = written.get(spec.dated_path.format(date=run.astimezone(ET).date().isoformat()))
            if at is not None and at >= run:
                break
            missed += 1
        status = "ok" if missed <= spec.ok_misses else "warn" if missed <= spec.warn_misses else "fail"
        last = runs[missed] if missed < len(runs) else None
        detail = "done for the last session" if missed == 0 else f"missing for the last {missed} session(s)"
        return check(spec.id, "data", spec.label, status, detail, missed=missed, expected_at=iso(runs[0]), last_session=iso(last), feeds=spec.feeds)

    times = [written.get(path) for path in spec.paths]
    present = [t for t in times if t is not None]
    if not present:
        return check(spec.id, "data", spec.label, "fail", "no document found", feeds=spec.feeds)
    newest = max(present) if spec.combine == "newest" else (min(present) if len(present) == len(times) else None)
    if newest is None:
        return check(spec.id, "data", spec.label, "fail", "a document is missing", feeds=spec.feeds)
    age_s = (now - newest).total_seconds()

    if spec.warn_after_min is not None:
        status = "ok"
        if spec.fail_after_min is not None and age_s > spec.fail_after_min * 60:
            status = "fail"
        elif age_s > spec.warn_after_min * 60:
            status = "warn"
        return check(spec.id, "data", spec.label, status, f"written {ago(age_s)}", written_at=iso(newest), age_s=round(age_s), feeds=spec.feeds)

    runs = scheduled_runs(spec, now)
    missed = 0
    for run in runs[: spec.warn_misses + 2]:
        if newest >= run:
            break
        missed += 1
    status = "ok" if missed <= spec.ok_misses else "warn" if missed <= spec.warn_misses else "fail"
    detail = f"written {ago(age_s)}"
    if missed:
        detail += f", {missed} scheduled run(s) since" if missed <= spec.warn_misses + 1 else f", {missed}+ scheduled runs since"
    return check(spec.id, "data", spec.label, status, detail, written_at=iso(newest), age_s=round(age_s), missed=missed, expected_at=iso(runs[0]) if runs else None, feeds=spec.feeds)


def freshness_paths(specs: Iterable[Freshness], now: datetime) -> list[str]:
    paths: list[str] = []
    for spec in specs:
        paths.extend(spec.paths)
        if spec.dated_path:
            for run in scheduled_runs(spec, now)[: spec.warn_misses + 2]:
                paths.append(spec.dated_path.format(date=run.astimezone(ET).date().isoformat()))
    return sorted(set(paths))


def read_write_times(db_path: str, paths: list[str], stages: dict[str, str] | None = None) -> dict[str, datetime | None]:
    """``updated_at`` of each path, straight from SQLite opened read-only (a few rows by primary key).

    For a path in ``stages`` (path -> stage name) it is instead the time that stage finished with status "success"
    (``stages.<stage>.completed_at``), or None when the stage has not succeeded.
    """
    out: dict[str, datetime | None] = {path: None for path in paths}
    if not paths:
        return out
    stages = stages or {}
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=10.0)
    try:
        connection.execute("PRAGMA busy_timeout=10000")
        marks = ",".join("?" for _ in paths)
        for path, updated in connection.execute(f"SELECT path, updated_at FROM documents WHERE path IN ({marks})", paths):
            out[path] = parse_iso(updated)
        for path, stage in stages.items():
            if path not in out or out[path] is None or not re.fullmatch(r"[a-z_]+", stage):
                continue
            row = connection.execute(
                f"SELECT json_extract(data_json, '$.stages.{stage}.status'), json_extract(data_json, '$.stages.{stage}.completed_at') "
                "FROM documents WHERE path = ?",
                (path,),
            ).fetchone()
            out[path] = parse_iso(row[1]) if row and row[0] == "success" else None
    finally:
        connection.close()
    return out


def stage_paths(specs: Iterable[Freshness], paths: Iterable[str]) -> dict[str, str]:
    """Which of ``paths`` are dated session documents read by stage, and the stage for each."""
    out = {}
    for spec in specs:
        if spec.dated_path and spec.dated_stage:
            prefix = spec.dated_path.split("{date}")[0]
            out.update({path: spec.dated_stage for path in paths if path.startswith(prefix)})
    return out


# ---------------------------------------------------------------------------------------------------------------
# HTTP checks.


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:  # a 3xx is reported, not followed
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def fetch(url: str, *, headers: dict[str, str] | None = None, timeout: float = 15.0, read_limit: int = 2_000_000) -> tuple[int, float, bytes]:
    """(status, milliseconds to the full body, body). Status 0 when nothing came back."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    started = time.monotonic()
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            body = response.read(read_limit)
            return response.status, (time.monotonic() - started) * 1000, body
    except urllib.error.HTTPError as error:
        return error.code, (time.monotonic() - started) * 1000, b""
    except Exception:
        return 0, (time.monotonic() - started) * 1000, b""


def http_check(id: str, group: str, label: str, url: str, *, warn_ms: float, fail_ms: float, headers: dict[str, str] | None = None, fetcher: Callable[..., tuple[int, float, bytes]] = fetch) -> dict[str, Any]:
    status_code, ms, _body = fetcher(url, headers=headers)
    if status_code == 0:
        return check(id, group, label, "fail", "no answer within 15s", ms=round(ms))
    if status_code >= 500 or status_code in (401, 403, 404):
        return check(id, group, label, "fail", f"HTTP {status_code} in {round(ms)} ms", code=status_code, ms=round(ms))
    if status_code >= 300:
        state = "warn"
    elif ms > fail_ms:
        state = "fail"
    elif ms > warn_ms:
        state = "warn"
    else:
        state = "ok"
    return check(id, group, label, state, f"HTTP {status_code} in {round(ms)} ms", code=status_code, ms=round(ms))


def localdb_health(fetcher: Callable[..., tuple[int, float, bytes]] = fetch) -> dict[str, Any]:
    status_code, ms, body = fetcher("http://127.0.0.1:8500/health")
    try:
        ok = status_code == 200 and json.loads(body or b"{}").get("ok") is True
    except ValueError:
        ok = False
    if ok:
        return check("localdb", "services", "LocalDB", "warn" if ms > 1000 else "ok", f"healthy in {round(ms)} ms", ms=round(ms))
    return check("localdb", "services", "LocalDB", "fail", f"/health answered {status_code or 'nothing'}", ms=round(ms))


def localdb_metrics(token: str | None, fetcher: Callable[..., tuple[int, float, bytes]] = fetch, top: int = 12) -> dict[str, Any] | None:
    """LocalDB's own rolling read metrics (15 min): totals and the top collections by bytes. None without a token."""
    if not token:
        return None
    status_code, _ms, body = fetcher("http://127.0.0.1:8500/metrics?window=900", headers={"Authorization": f"Bearer {token}"})
    if status_code != 200:
        return {"error": f"HTTP {status_code}"}
    try:
        snap = json.loads(body)
    except ValueError:
        return {"error": "unreadable"}
    keep = ("count", "docs", "bytes", "p50_ms", "p95_ms", "max_ms")
    collections = [
        {"name": name, **{key: row.get(key) for key in keep}}
        for name, row in list((snap.get("collections") or {}).items())[:top]
        if isinstance(row, dict)
    ]
    endpoints = [{"name": name, **{key: row.get(key) for key in keep}} for name, row in (snap.get("endpoints") or {}).items() if isinstance(row, dict)]
    totals = snap.get("totals") or {}
    return {
        "window_s": snap.get("window_seconds"),
        "totals": {key: totals.get(key) for key in keep},
        "collections": collections,
        "endpoints": endpoints[:8],
    }


# ---------------------------------------------------------------------------------------------------------------
# The box: disks, memory, swap, load, services' memory and CPU.


def meminfo(text: str) -> dict[str, int]:
    out = {}
    for line in text.splitlines():
        name, _, rest = line.partition(":")
        parts = rest.split()
        if parts and parts[0].isdigit():
            out[name.strip()] = int(parts[0]) * 1024
    return out


STAGING_DIR = os.environ.get("LOCALDB_BACKUP_STAGING", "/var/lib/tikrr/backup-staging")


def staging_in_use(folder: str = STAGING_DIR, now: float | None = None, max_age_h: float = 4) -> int:
    """Bytes of a backup's staging copy written in the last few hours (the nightly backup is running).

    The copy takes ~4.4 GB of the system disk for a few minutes; the disk check counts it as free so every backup does
    not turn the disk amber. An older copy is a leftover of a killed run and does count against the disk.
    """
    now = now or time.time()
    total = 0
    for path in glob.glob(os.path.join(folder, ".partial-*")):
        try:
            st = os.stat(path)
        except OSError:
            continue
        if now - st.st_mtime < max_age_h * 3600:
            total += st.st_size
    return total


def disk_checks(statvfs: Callable[[str], Any] = os.statvfs, staging: int = 0, staging_dev: int | None = None, dev_of: Callable[[str], int] = lambda p: os.stat(p).st_dev) -> list[dict[str, Any]]:
    rows = []
    for mount, label in DISKS:
        try:
            st = statvfs(mount)
        except OSError:
            rows.append(check(f"disk:{mount}", "box", label, "unknown", "not mounted"))
            continue
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        note = ""
        try:
            if staging and staging_dev is not None and dev_of(mount) == staging_dev:
                free += staging
                note = ", a backup is running"
        except OSError:
            pass
        share = free / total if total else 0
        gib = 1024**3
        status = "fail" if free < 3 * gib or share < 0.05 else "warn" if free < 8 * gib or share < 0.12 else "ok"
        rows.append(check(f"disk:{mount}", "box", label, status, f"{free / gib:.1f} GB free of {total / gib:.0f} GB ({share:.0%}){note}", free=free, total=total, mount=mount))
    return rows


def memory_checks(info: dict[str, int], load: tuple[float, float, float], cpus: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    total = info.get("MemTotal", 0)
    available = info.get("MemAvailable", 0)
    swap_total = info.get("SwapTotal", 0)
    swap_used = swap_total - info.get("SwapFree", 0)
    mem_share = available / total if total else 0
    swap_share = swap_used / swap_total if swap_total else 0
    gib = 1024**3
    rows = [
        check(
            "memory",
            "box",
            "Memory",
            "fail" if mem_share < 0.07 else "warn" if mem_share < 0.15 else "ok",
            f"{available / gib:.1f} GB available of {total / gib:.1f} GB",
        ),
        check(
            "swap",
            "box",
            "Swap",
            "ok" if not swap_total else "fail" if swap_share >= 0.95 else "warn" if swap_share >= 0.8 else "ok",
            f"{swap_used / gib:.1f} GB used of {swap_total / gib:.1f} GB" if swap_total else "none",
        ),
        check(
            "load",
            "box",
            "Load",
            "fail" if load[1] > 4 * cpus else "warn" if load[1] > 2 * cpus else "ok",
            f"{load[0]:.2f} / {load[1]:.2f} / {load[2]:.2f} on {cpus} cores",
        ),
    ]
    system = {
        "mem_total": total,
        "mem_available": available,
        "swap_total": swap_total,
        "swap_used": swap_used,
        "load": [round(x, 2) for x in load],
        "cpus": cpus,
    }
    return rows, system


SERVICE_UNITS = (
    ("web 3000", "tikrr-web@3000.service"),
    ("web 3001", "tikrr-web@3001.service"),
    ("LocalDB", "tikrr-localdb.service"),
    ("Varnish", "varnish.service"),
    ("Caddy", "caddy.service"),
    ("Trace DB", "trace-localdb.service"),
)
CGROUP_ROOT = "/sys/fs/cgroup"


def _cgroup_numbers(path: str) -> tuple[int | None, int | None]:
    """(memory.current bytes, cpu usage_usec) of one cgroup folder, None when unreadable."""
    memory = cpu = None
    try:
        memory = int(Path(path, "memory.current").read_text().strip())
    except (OSError, ValueError):
        pass
    try:
        for line in Path(path, "cpu.stat").read_text().splitlines():
            if line.startswith("usage_usec "):
                cpu = int(line.split()[1])
    except (OSError, ValueError):
        pass
    return memory, cpu


def service_usage(run: Callable[[list[str]], str]) -> list[dict[str, Any]]:
    """Memory and cumulative CPU per long-running service, plus Firecrawl (docker) and the trace user units."""
    rows: list[dict[str, Any]] = []
    try:
        text = run(["systemctl", "show", "-p", "Id,ControlGroup", *[unit for _, unit in SERVICE_UNITS]])
    except Exception:
        text = ""
    groups: dict[str, str] = {}
    for block in text.strip().split("\n\n"):
        fields = dict(line.split("=", 1) for line in block.splitlines() if "=" in line)
        if fields.get("Id") and fields.get("ControlGroup"):
            groups[fields["Id"]] = fields["ControlGroup"]
    for label, unit in SERVICE_UNITS:
        cgroup = groups.get(unit)
        if not cgroup:
            continue
        memory, cpu = _cgroup_numbers(CGROUP_ROOT + cgroup)
        rows.append({"name": label, "memory": memory, "cpu_usec": cpu})
    docker = [_cgroup_numbers(path) for path in glob.glob(f"{CGROUP_ROOT}/system.slice/docker-*.scope")]
    if docker:
        rows.append({"name": "Firecrawl", "memory": sum(m or 0 for m, _ in docker), "cpu_usec": sum(c or 0 for _, c in docker)})
    user_memory, user_cpu = _cgroup_numbers(f"{CGROUP_ROOT}/user.slice/user-1000.slice/user@1000.service")
    if user_memory is not None:
        rows.append({"name": "Trace jobs", "memory": user_memory, "cpu_usec": user_cpu})
    return rows


def with_cpu_share(rows: list[dict[str, Any]], previous: dict[str, Any] | None, now: datetime) -> list[dict[str, Any]]:
    """CPU % of one core since the previous run, from the cumulative counters (None on the first run or a restart)."""
    before = {row.get("name"): row for row in ((previous or {}).get("services") or []) if isinstance(row, dict)}
    then = parse_iso((previous or {}).get("generated_at"))
    seconds = (now - then).total_seconds() if then else 0
    for row in rows:
        old = before.get(row["name"])
        row["cpu_pct"] = None
        if old and seconds > 0 and isinstance(old.get("cpu_usec"), int) and isinstance(row.get("cpu_usec"), int) and row["cpu_usec"] >= old["cpu_usec"]:
            row["cpu_pct"] = round((row["cpu_usec"] - old["cpu_usec"]) / 1e6 / seconds * 100, 1)
    return rows


def failed_units(run: Callable[[list[str]], str]) -> dict[str, Any]:
    try:
        text = run(["systemctl", "list-units", "--failed", "--plain", "--no-legend", "--no-pager", "tikrr-*", "caddy.service", "varnish.service"])
    except Exception as error:
        return check("failed_units", "box", "Failed units", "unknown", f"systemctl failed: {error}")
    names = sorted({line.split()[0] for line in text.splitlines() if line.strip()})
    if names:
        return check("failed_units", "box", "Failed units", "fail", ", ".join(names[:6]) + (f" and {len(names) - 6} more" if len(names) > 6 else ""), units=names)
    return check("failed_units", "box", "Failed units", "ok", "none")


def backup_check(folder: str = BACKUP_DIR, now: datetime | None = None) -> tuple[dict[str, Any], dict[str, Any] | None]:
    now = now or now_utc()
    try:
        latest = json.loads(Path(folder, "latest.json").read_text())
    except FileNotFoundError:
        return check("backup", "box", "LocalDB backup", "warn", "no backup yet"), None
    except (OSError, ValueError) as error:
        return check("backup", "box", "LocalDB backup", "unknown", f"unreadable: {type(error).__name__}"), None
    last_ok = latest if latest.get("ok") else latest.get("last_ok") or {}
    ok_at = parse_iso(last_ok.get("finished_at") or last_ok.get("created_at"))
    age_h = (now - ok_at).total_seconds() / 3600 if ok_at else None
    summary = {
        "ok": bool(latest.get("ok")),
        "at": latest.get("finished_at") or latest.get("created_at"),
        "error": latest.get("error"),
        "last_ok_at": iso(ok_at),
        "file": last_ok.get("file"),
        "compressed_bytes": last_ok.get("compressed_bytes"),
        "backup_bytes": last_ok.get("backup_bytes"),
        "documents": last_ok.get("documents"),
        "timings": last_ok.get("timings"),
        "dailies": last_ok.get("dailies"),
        "weeklies": last_ok.get("weeklies"),
        "dest_free_bytes": last_ok.get("dest_free_bytes"),
    }
    if age_h is None:
        return check("backup", "box", "LocalDB backup", "fail", f"last run failed: {str(latest.get('error') or '?')[:160]}"), summary
    detail = f"last good one {ago(age_h * 3600)}"
    if not latest.get("ok"):
        detail = f"last run failed ({str(latest.get('error') or '?')[:120]}); {detail}"
    status = "ok" if age_h < 26 and latest.get("ok") else "warn" if age_h < 50 else "fail"
    return check("backup", "box", "LocalDB backup", status, detail), summary


# ---------------------------------------------------------------------------------------------------------------
# Caddy's access log: 5xx rate and p95 over the last minutes.

# Path segments kept as they are: plain words (routes, tickers, slugs) and asset file names. Anything else (an email,
# a token, a long hash, an encoded value, an id with digits) becomes ":id", so no visitor data is ever stored.
_PLAIN_SEGMENT = re.compile(r"^[A-Za-z_][A-Za-z_-]{0,23}$|^[a-z]{1,3}\d{1,2}$|^[A-Z]{1,5}(\.[A-Z]{1,2})?$|^[a-z0-9_-]{1,24}\.(txt|xml|json|ico|png|svg|webmanifest)$|^\d{1,4}$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$")


def clean_path(uri: str) -> str:
    """A request path safe to store: no query string, every segment that is not a plain word replaced, 80 chars at most."""
    path = urllib.parse.urlsplit(uri or "/").path or "/"
    parts = [part if not part or _PLAIN_SEGMENT.match(part) else ":id" for part in path.split("/")]
    return "/".join(parts)[:80]


def read_recent_lines(path: str, since_ts: float, block: int = 512 * 1024, cap: int = 64 * 1024 * 1024) -> list[str]:
    """The log lines written since ``since_ts``, reading backwards from the end only as far as needed.

    Each block is read once (blocks are kept and joined at the end), and the walk stops at the first complete line
    older than ``since_ts`` or after ``cap`` bytes. Lines are filtered by time again by the caller.
    """
    try:
        handle = open(path, "rb")
    except PermissionError:
        raise
    except OSError:
        return []
    chunks: list[bytes] = []
    with handle:
        handle.seek(0, os.SEEK_END)
        end = handle.tell()
        start = end
        while start > 0 and end - start < cap:
            size = min(block, start)
            start -= size
            handle.seek(start)
            chunks.append(handle.read(size))
            if start == 0:
                break
            # The first complete line of this block: everything before its first newline is a fragment.
            head = chunks[-1]
            newline = head.find(b"\n")
            if newline < 0:
                continue
            following = head.find(b"\n", newline + 1)
            line = head[newline + 1 : following if following >= 0 else None]
            try:
                if float(json.loads(line).get("ts") or 0) < since_ts:
                    break
            except (ValueError, AttributeError, TypeError):
                continue
    data = b"".join(reversed(chunks))
    if start > 0:
        data = data[data.find(b"\n") + 1 :]
    return [line for line in data.decode("utf-8", "replace").splitlines() if line]


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, int(round(fraction * len(ordered) + 0.4999)))
    return ordered[min(rank, len(ordered)) - 1]


def parse_access(lines: Iterable[str]) -> list[tuple[float, int, float, str, bool | None]]:
    """Each request once: (ts, status, ms, cleaned path, Varnish hit or None), our own probes left out."""
    out = []
    for line in lines:
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if not isinstance(entry, dict):
            continue
        request = entry.get("request") or {}
        agent = " ".join((request.get("headers") or {}).get("User-Agent") or [])
        if USER_AGENT in agent:
            continue
        status = int(entry.get("status") or 0)
        path = clean_path(str(request.get("uri") or "/")) if status >= 500 else ""
        cache = " ".join((entry.get("resp_headers") or {}).get("X-Cache") or []).upper()
        out.append((float(entry.get("ts") or 0), status, float(entry.get("duration") or 0) * 1000, path, ("HIT" in cache) if cache else None))
    return out


def traffic_stats(records: Iterable[tuple[float, int, float, str, bool | None] | str], since_ts: float) -> dict[str, Any]:
    """Requests, 5xx, p50/p95 (ms) and Varnish hit share since ``since_ts``. Takes parse_access records (or raw lines)."""
    records = list(records)
    if records and isinstance(records[0], str):
        records = parse_access(records)  # type: ignore[arg-type]
    durations: list[float] = []
    errors = 0
    hits = cache_known = 0
    error_paths: dict[str, int] = {}
    for ts, status, ms, path, hit in records:  # type: ignore[misc]
        if ts < since_ts:
            continue
        durations.append(ms)
        if status >= 500:
            errors += 1
            key = f"{status} {path}"
            error_paths[key] = error_paths.get(key, 0) + 1
        if hit is not None:
            cache_known += 1
            hits += hit
    count = len(durations)
    p50 = percentile(durations, 0.5)
    p95 = percentile(durations, 0.95)
    return {
        "requests": count,
        "errors_5xx": errors,
        "error_rate": round(errors / count, 4) if count else None,
        "p50_ms": round(p50) if p50 is not None else None,
        "p95_ms": round(p95) if p95 is not None else None,
        "cache_hit_rate": round(hits / cache_known, 3) if cache_known else None,
        "top_5xx": [{"path": key, "count": value} for key, value in sorted(error_paths.items(), key=lambda kv: -kv[1])[:5]],
    }


def traffic_checks(stats: dict[str, Any], window_min: int) -> list[dict[str, Any]]:
    count, errors, rate, p95 = stats["requests"], stats["errors_5xx"], stats["error_rate"] or 0, stats["p95_ms"]
    if errors >= 5 and rate > 0.05:
        err_status = "fail"
    elif errors >= 2 and rate > 0.01:
        err_status = "warn"
    else:
        err_status = "ok"
    rows = [check("http_5xx", "traffic", "Server errors", err_status, f"{errors} of {count} requests in {window_min} min", rate=rate)]
    if count < 10 or p95 is None:
        rows.append(check("http_p95", "traffic", "Response time", "unknown" if count == 0 else "ok", f"{count} requests in {window_min} min" + (f", p95 {p95} ms" if p95 is not None else "")))
    else:
        rows.append(check("http_p95", "traffic", "Response time", "fail" if p95 > 6000 else "warn" if p95 > 2500 else "ok", f"p95 {p95} ms, p50 {stats['p50_ms']} ms", p95_ms=p95))
    return rows


# ---------------------------------------------------------------------------------------------------------------
# Journal: every tikrr-* run of the last 24 hours, and each agent data step.

RESOURCES_ID = "ae8f7b866b0347b9af31fe1c80b127c0"  # "<unit>: Consumed ... CPU time over ... wall clock time"
FAILED_ID = "d9b373ed55a64feb8242e02dbe79a49c"  # "<unit>: Failed with result '...'"
_SPAN = re.compile(r"(\d+(?:\.\d+)?)\s*(us|µs|ms|s|min|h|d|w)\b")
_SPAN_SECONDS = {"us": 1e-6, "µs": 1e-6, "ms": 1e-3, "s": 1, "min": 60, "h": 3600, "d": 86400, "w": 604800}
_WALL = re.compile(r"over (.+?) wall clock time")
STEP_GREP = r"^\[(frequent|hourly|after_close|weekly|earnings_day|extended_hours)\] (ok|FAILED)"
_STEP = re.compile(r"^\[(frequent|hourly|after_close|weekly|earnings_day|extended_hours)\] (ok|FAILED(?: \(\-?\d+\))?)\s+(.+?)(?: in (\d+)s)?(?: \(stopped at its \d+ min limit\))?(?::.*)?$")
def _not_a_job(unit: str) -> bool:
    """The long-running services (their resource lines come at restarts) and this health check itself."""
    return unit.startswith("tikrr-web@") or unit in ("tikrr-localdb.service", "tikrr-ops-health.service")


def timespan_seconds(text: str) -> float | None:
    parts = _SPAN.findall(text or "")
    if not parts:
        return None
    return sum(float(value) * _SPAN_SECONDS[unit] for value, unit in parts)


def journal_entries(run: Callable[[list[str]], str], args: list[str]) -> list[dict[str, Any]]:
    try:
        text = run(["journalctl", "--no-pager", "-q", "-o", "json", *args])
    except Exception:
        return []
    out = []
    for line in text.splitlines():
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out


def summarize_units(entries: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per tikrr-* job unit: runs, failures, wall-time median/p95/max, CPU seconds, memory peak, last run."""
    units: dict[str, dict[str, Any]] = {}
    for entry in entries:
        unit = str(entry.get("UNIT") or "")
        if not unit.startswith("tikrr-") or _not_a_job(unit):
            continue
        row = units.setdefault(unit, {"unit": unit, "runs": 0, "failures": 0, "walls": [], "cpu_s": 0.0, "mem_peak": 0, "last_at": None, "last_failed_at": None})
        at = int(entry.get("__REALTIME_TIMESTAMP") or 0) / 1e6
        if entry.get("MESSAGE_ID") == FAILED_ID:
            row["failures"] += 1
            row["last_failed_at"] = max(row["last_failed_at"] or 0, at)
            continue
        row["runs"] += 1
        row["last_at"] = max(row["last_at"] or 0, at)
        wall = _WALL.search(str(entry.get("MESSAGE") or ""))
        seconds = timespan_seconds(wall.group(1)) if wall else None
        if seconds is not None:
            row["walls"].append(seconds)
        try:
            row["cpu_s"] += int(entry.get("CPU_USAGE_NSEC") or 0) / 1e9
            row["mem_peak"] = max(row["mem_peak"], int(entry.get("MEMORY_PEAK") or 0))
        except ValueError:
            pass
    out = []
    for row in units.values():
        walls = row.pop("walls")
        row["median_s"] = round(statistics.median(walls), 1) if walls else None
        row["p95_s"] = round(percentile(walls, 0.95), 1) if walls else None  # type: ignore[arg-type]
        row["max_s"] = round(max(walls), 1) if walls else None
        row["cpu_s"] = round(row["cpu_s"], 1)
        row["last_ok"] = not (row["last_failed_at"] and row["last_at"] and row["last_failed_at"] >= row["last_at"] - 1)
        row["last_at"] = iso(datetime.fromtimestamp(row["last_at"], UTC)) if row["last_at"] else None
        row["last_failed_at"] = iso(datetime.fromtimestamp(row["last_failed_at"], UTC)) if row["last_failed_at"] else None
        out.append(row)
    return sorted(out, key=lambda r: (-r["failures"], -r["cpu_s"]))


def summarize_steps(entries: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per agent data step (``[group] ok  label in Ns`` lines from run-agentdata.sh)."""
    steps: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in entries:
        match = _STEP.match(str(entry.get("MESSAGE") or "").strip())
        if not match:
            continue
        group, outcome, label, seconds = match.groups()
        row = steps.setdefault((group, label), {"group": group, "step": label, "runs": 0, "failures": 0, "secs": [], "last_s": None, "last_ok": True, "last_at": 0})
        at = int(entry.get("__REALTIME_TIMESTAMP") or 0) / 1e6
        row["runs"] += 1
        failed = outcome.startswith("FAILED")
        row["failures"] += failed
        if seconds is not None:
            row["secs"].append(int(seconds))
        if at >= row["last_at"]:
            row["last_at"] = at
            row["last_ok"] = not failed
            row["last_s"] = int(seconds) if seconds is not None else None
    out = []
    for row in steps.values():
        secs = row.pop("secs")
        row["median_s"] = round(statistics.median(secs), 1) if secs else None
        row["max_s"] = max(secs) if secs else None
        row["last_at"] = iso(datetime.fromtimestamp(row["last_at"], UTC)) if row["last_at"] else None
        out.append(row)
    return sorted(out, key=lambda r: (r["group"], r["step"]))


# ---------------------------------------------------------------------------------------------------------------
# Writing: tm_ops_health/latest and tm_ops_health/history.


class Store:
    """LocalDB over HTTP when there is a token (the server does the write), else the SQLite file directly."""

    def __init__(self, url: str | None, token: str | None, db_path: str | None):
        self.url = (url or "http://127.0.0.1:8500").rstrip("/")
        self.token = token
        self.db_path = db_path

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any] | None:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            f"{self.url}/documents/{urllib.parse.quote(path)}",
            data=data,
            method=method,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "User-Agent": USER_AGENT},
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code == 404 and method == "GET":
                return None
            raise RuntimeError(f"LocalDB {method} {path}: HTTP {error.code}") from None

    def get(self, path: str) -> dict[str, Any] | None:
        if self.token:
            answer = self._request("GET", path)
            return ((answer or {}).get("document") or {}).get("data") if answer else None
        if not self.db_path:
            return None
        connection = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True, timeout=10.0)
        try:
            row = connection.execute("SELECT data_json FROM documents WHERE path=?", (path,)).fetchone()
        finally:
            connection.close()
        return json.loads(row[0]) if row else None

    def set(self, path: str, data: dict[str, Any]) -> None:
        if self.token:
            self._request("PUT", path, {"data": data, "merge": False})
            return
        if not self.db_path:
            raise RuntimeError("no LOCALDB_API_TOKEN and no LOCALDB_PATH: nowhere to write")
        from backend.localdb.store import LocalDocumentStore

        LocalDocumentStore(self.db_path).upsert(path, data)


def history_entry(result: dict[str, Any]) -> dict[str, Any]:
    traffic = (result.get("traffic") or {}).get("last_5m") or {}
    system = result.get("system") or {}
    total = system.get("mem_total") or 0
    swap_total = system.get("swap_total") or 0
    return {
        "t": result["generated_at"],
        "o": STATUS_LETTER[result["overall"]],
        "c": {row["id"]: STATUS_LETTER[row["status"]] for row in result["checks"]},
        "r": traffic.get("requests"),
        "e": traffic.get("errors_5xx"),
        "p": traffic.get("p95_ms"),
        "m": round(system.get("mem_available", 0) / total, 3) if total else None,
        "s": round(system.get("swap_used", 0) / swap_total, 3) if swap_total else None,
    }


def merge_history(previous: dict[str, Any] | None, entry: dict[str, Any], now: datetime) -> dict[str, Any]:
    cutoff = now - timedelta(hours=HISTORY_HOURS)
    rows = [row for row in ((previous or {}).get("entries") or []) if isinstance(row, dict) and (parse_iso(row.get("t")) or cutoff) > cutoff and row.get("t") != entry["t"]]
    rows.append(entry)
    rows.sort(key=lambda row: row["t"])
    return {"updated_at": entry["t"], "hours": HISTORY_HOURS, "entries": rows[-HISTORY_MAX:]}


# ---------------------------------------------------------------------------------------------------------------
# Alerts (off unless OPS_ALERT_EMAIL is set).


def plan_alert(checks: list[dict[str, Any]], previous_state: dict[str, Any] | None, now: datetime, *, live: bool = False) -> dict[str, Any]:
    """What to send this run. Pure.

    * A check counts as red for alerts after two red runs in a row (``streaks``), so one slow probe never emails.
    * New: a confirmed red not already covered by an email, and not emailed about in the last ALERT_COOLDOWN_HOURS
      (a check flapping red and green emails once, not every ten minutes).
    * Reminder: still red, nothing new, the last email ALERT_REMINDER_HOURS ago.
    * All clear: once, when every check an email named is green again.

    ``live`` says whether email is on: the "would send" record (email off) keeps its own covered set, so turning
    email on while checks are red sends for them at once.
    """
    state = previous_state or {}
    prefix = "" if live else "would_"
    streaks_before = state.get("streaks") or {}
    streaks = {row["id"]: int(streaks_before.get(row["id"], 0)) + 1 for row in checks if row["status"] == "fail"}
    confirmed = sorted(cid for cid, n in streaks.items() if n >= 2)
    covered = set(state.get(f"{prefix}covered") or [])
    sent_at = {cid: parse_iso(at) for cid, at in (state.get(f"{prefix}sent") or {}).items()}
    last_sent = parse_iso(state.get(f"{prefix}last_sent_at"))
    cooldown = timedelta(hours=ALERT_COOLDOWN_HOURS)
    new = [cid for cid in confirmed if cid not in covered and not (sent_at.get(cid) and now - sent_at[cid] < cooldown)]  # type: ignore[operator]
    reminder = bool(confirmed) and not new and bool(covered & set(confirmed)) and last_sent is not None and now - last_sent >= timedelta(hours=ALERT_REMINDER_HOURS)
    all_clear = not confirmed and not streaks and bool(covered)
    labels = {row["id"]: row["label"] for row in checks}
    subject = None
    if new or reminder:
        names = ", ".join(labels[cid] for cid in confirmed[:4]) + (f" and {len(confirmed) - 4} more" if len(confirmed) > 4 else "")
        subject = f"stocksbrew: {len(confirmed)} check{'s' if len(confirmed) != 1 else ''} red ({names})" + (" still" if reminder else "")
    elif all_clear:
        subject = "stocksbrew: all checks back to green"
    lines = [f"{labels[row['id']]}: {row['detail']}" for row in checks if row["id"] in confirmed]
    return {"streaks": streaks, "confirmed": confirmed, "new": new, "reminder": reminder, "all_clear": all_clear, "subject": subject, "lines": lines, "prefix": prefix}


def deliver_alert(plan: dict[str, Any], previous_state: dict[str, Any] | None, now: datetime, *, address: str | None, send: Callable[[str, str, str], bool] | None = None, log: Callable[[str], None] = print) -> dict[str, Any]:
    """Send (or, with no address, only record) the planned alert. Returns the state to store for next time."""
    state = dict(previous_state or {})
    prefix = plan["prefix"]
    state["streaks"] = plan["streaks"]
    state["enabled"] = bool(address)
    state["would_send"] = None if address else state.get("would_send")
    covered = set(state.get(f"{prefix}covered") or [])
    # A check that went green leaves the covered set (unless an all-clear is still owed for it).
    if not plan["all_clear"]:
        covered &= set(plan["confirmed"]) | set(plan["streaks"])
    if not plan["subject"]:
        state[f"{prefix}covered"] = sorted(covered)
        return state
    if not address:
        log(f"[ops-health] alerts are off (OPS_ALERT_EMAIL unset); would send: {plan['subject']}")
        sent = True
        state["would_send"] = {"subject": plan["subject"], "lines": plan["lines"], "at": iso(now)}
    else:
        body = "<p>" + "<br>".join(_html_escape(line) for line in plan["lines"] or ["Everything is green again."]) + "</p>"
        body += f'<p><a href="{APP_URL}/admin/analytics?tab=system">Open the System tab</a></p>'
        if send is None:
            from backend.email import send_email as send  # needs EMAILS_ENABLED=1 and BREVO_API_KEY (in /etc/tikrr/ops.env)
        sent = bool(send(address, plan["subject"], body))
        log(f"[ops-health] alert {'sent' if sent else 'NOT sent'}: {plan['subject']}")
    if sent:
        state[f"{prefix}last_sent_at"] = iso(now)
        sent_map = dict(state.get(f"{prefix}sent") or {})
        for cid in plan["confirmed"]:
            sent_map[cid] = iso(now)
        state[f"{prefix}sent"] = sent_map
        covered = set() if plan["all_clear"] else covered | set(plan["confirmed"])
    # Not sent (mail off or Brevo down): nothing is marked covered, so the next run tries again.
    state[f"{prefix}covered"] = sorted(covered)
    return state


def read_alert_state(folder: str | None) -> dict[str, Any] | None:
    """The alert state kept on the box (StateDirectory), so an outage of the store cannot turn every run into a new alert."""
    if not folder:
        return None
    try:
        data = json.loads(Path(folder, "alert-state.json").read_text())
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def write_alert_state(folder: str | None, state: dict[str, Any]) -> None:
    if not folder:
        return
    try:
        target = Path(folder, "alert-state.json")
        tmp = target.with_name(".alert-state.json.tmp")
        tmp.write_text(json.dumps(state, default=str))
        os.replace(tmp, target)
    except OSError as error:
        print(f"[ops-health] could not keep the alert state: {error}", file=sys.stderr)


def _html_escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ---------------------------------------------------------------------------------------------------------------
# One run.


def _run_command(argv: list[str]) -> str:
    return subprocess.run(argv, capture_output=True, text=True, timeout=30, check=False).stdout


def collect(
    *,
    now: datetime | None = None,
    previous: dict[str, Any] | None = None,
    db_path: str | None = None,
    token: str | None = None,
    fetcher: Callable[..., tuple[int, float, bytes]] = fetch,
    run: Callable[[list[str]], str] = _run_command,
) -> dict[str, Any]:
    """Every check, the system numbers and the summaries. Writes nothing."""
    now = now or now_utc()
    started = time.monotonic()
    checks: list[dict[str, Any]] = []

    probes = [
        ("site_home", "site", "Home page", SITE + "/", 2000, 6000, None),
        ("site_stock", "site", "Stock page", SITE + STOCK_PATH, 3000, 8000, None),
        ("web_3000", "services", "Web 3000", "http://127.0.0.1:3000/api/health", 1500, 5000, LOCAL_HOST_HEADERS),
        ("web_3001", "services", "Web 3001", "http://127.0.0.1:3001/api/health", 1500, 5000, LOCAL_HOST_HEADERS),
        ("varnish", "services", "Varnish", "http://127.0.0.1:6081/robots.txt", 1000, 5000, LOCAL_HOST_HEADERS),
    ]
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(http_check, cid, group, label, url, warn_ms=warn, fail_ms=fail, headers=headers, fetcher=fetcher) for cid, group, label, url, warn, fail, headers in probes]
        db_future = pool.submit(localdb_health, fetcher)
        metrics_future = pool.submit(localdb_metrics, token, fetcher)
        checks.extend(future.result() for future in futures)
        checks.append(db_future.result())
        metrics = metrics_future.result()

    # Data freshness.
    if db_path:
        try:
            wanted = freshness_paths(FRESHNESS, now)
            written = read_write_times(db_path, wanted, stage_paths(FRESHNESS, wanted))
            checks.extend(judge_freshness(spec, written, now) for spec in FRESHNESS)
        except Exception as error:
            checks.append(check("freshness", "data", "Data freshness", "unknown", f"could not read the store: {type(error).__name__}: {error}"[:200]))
    else:
        checks.append(check("freshness", "data", "Data freshness", "unknown", "LOCALDB_PATH is not set"))

    # The box.
    staging = staging_in_use()
    try:
        staging_dev = os.stat(STAGING_DIR).st_dev if staging else None
    except OSError:
        staging_dev = None
    checks.extend(disk_checks(staging=staging, staging_dev=staging_dev))
    try:
        info = meminfo(Path("/proc/meminfo").read_text())
        load = os.getloadavg()
    except OSError:
        info, load = {}, (0.0, 0.0, 0.0)
    rows, system = memory_checks(info, load, os.cpu_count() or 1)
    if info:
        checks.extend(rows)
    system["disks"] = [{"mount": row["mount"], "label": row["label"], "free": row["free"], "total": row["total"]} for row in checks if row["id"].startswith("disk:") and "free" in row]
    checks.append(failed_units(run))
    backup_row, backup = backup_check()
    checks.append(backup_row)

    # Traffic: the last 60 minutes of the access log, judged on the last 15.
    now_ts = now.timestamp()
    log_problem = None
    try:
        records = parse_access(read_recent_lines(CADDY_LOG, now_ts - 3600))
    except PermissionError:
        records, log_problem = [], f"no permission to read {CADDY_LOG}"
    if not records and log_problem is None:
        log_problem = f"no access log at {CADDY_LOG}" if not os.path.exists(CADDY_LOG) else "no requests in the last hour"
    traffic = {
        "last_5m": traffic_stats(records, now_ts - 300),
        "last_15m": traffic_stats(records, now_ts - 900),
        "last_60m": traffic_stats(records, now_ts - 3600),
    }
    if records:
        checks.extend(traffic_checks(traffic["last_15m"], 15))
    else:
        checks.append(check("http_5xx", "traffic", "Server errors", "unknown", log_problem or "no requests"))

    # Journal (24 h).
    # Only the fields and lines needed: the step query would otherwise pull every line the jobs print.
    units = summarize_units(
        journal_entries(run, ["--since", "-24h", "--output-fields=UNIT,MESSAGE,MESSAGE_ID,CPU_USAGE_NSEC,MEMORY_PEAK", f"MESSAGE_ID={RESOURCES_ID}", f"MESSAGE_ID={FAILED_ID}"])
    )
    steps = summarize_steps(
        journal_entries(run, ["--since", "-24h", "--output-fields=MESSAGE", "SYSLOG_IDENTIFIER=run-agentdata.sh", "-g", STEP_GREP])
    )

    services = with_cpu_share(service_usage(run), previous, now)
    result = {
        "version": 1,
        "generated_at": iso(now),
        "host": socket.gethostname(),
        "overall": worst(row["status"] for row in checks),
        "checks": checks,
        "system": system,
        "services": services,
        "localdb": metrics,
        "traffic": traffic,
        "jobs": units,
        "steps": steps,
        "backup": backup,
        "took_ms": None,
    }
    result["took_ms"] = round((time.monotonic() - started) * 1000)
    return result


def print_summary(result: dict[str, Any], out: Any = sys.stdout) -> None:
    marks = {"ok": "ok  ", "warn": "WARN", "fail": "FAIL", "unknown": "  ? "}
    print(f"overall {result['overall'].upper()} at {result['generated_at']} ({result['took_ms']} ms)", file=out)
    for row in result["checks"]:
        print(f"  {marks[row['status']]}  {row['group']:8s} {row['label']:22s} {row['detail']}", file=out)
    bad_jobs = [row for row in result["jobs"] if row["failures"]]
    if bad_jobs:
        print("  jobs with failures in 24h:", file=out)
        for row in bad_jobs[:12]:
            print(f"    {row['unit']:44s} {row['failures']} of {row['runs']} runs failed, last {row['last_failed_at']}", file=out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check the box and write tm_ops_health.")
    parser.add_argument("--write", action="store_true", help="store the result in tm_ops_health and run the alert hook (the timer does this)")
    parser.add_argument("--json", action="store_true", help="print the whole result as JSON")
    args = parser.parse_args(argv)

    token = (os.environ.get("LOCALDB_API_TOKEN") or "").strip() or None
    db_path = (os.environ.get("LOCALDB_PATH") or "").strip() or None
    store = Store(os.environ.get("LOCALDB_URL"), token, db_path)
    now = now_utc()
    previous = None
    try:
        previous = store.get(f"{COLLECTION}/latest")
    except Exception as error:
        print(f"[ops-health] could not read the previous run: {error}", file=sys.stderr)

    result = collect(now=now, previous=previous, db_path=db_path, token=token)
    if args.json:
        print(json.dumps(result, indent=2, default=str))
    elif not args.write:
        print_summary(result)
    if not args.write:
        return 0

    # The journal gets one line per run; the red and amber checks only when there are any.
    bad = [f"{row['label']} ({row['status']}): {row['detail']}" for row in result["checks"] if row["status"] in ("warn", "fail")]
    print(f"[ops-health] {result['overall']} in {result['took_ms']} ms" + (f"; {'; '.join(bad)}" if bad else ""))
    address = (os.environ.get("OPS_ALERT_EMAIL") or "").strip() or None
    previous_alert = read_alert_state(STATE_DIR) or (previous or {}).get("alert")
    try:
        plan = plan_alert(result["checks"], previous_alert, now, live=bool(address))
        result["alert"] = deliver_alert(plan, previous_alert, now, address=address)
        write_alert_state(STATE_DIR, result["alert"])
    except Exception as error:  # an alert problem never stops the record
        result["alert"] = {**(previous_alert or {}), "error": f"{type(error).__name__}: {error}"[:200]}
    try:
        history = store.get(f"{COLLECTION}/history")
    except Exception:
        history = None
    store.set(f"{COLLECTION}/latest", result)
    store.set(f"{COLLECTION}/history", merge_history(history, history_entry(result), now))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
