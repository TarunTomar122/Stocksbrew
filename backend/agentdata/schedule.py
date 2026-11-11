"""Run the agent data jobs in groups, on a schedule.

Each group is a list of the modules in this package with the arguments a
routine refresh needs. The runner starts them one after another (several talk
to SEC EDGAR, which rate-limits by address, so they must not overlap), keeps
going when one fails, and exits non-zero if any did so the timer shows red.

Run it::

    python3 -m backend.agentdata.schedule --group frequent
    python3 -m backend.agentdata.schedule --group after_close --dry-run   # print the plan, run nothing
    python3 -m backend.agentdata.schedule --list

Groups and what they keep fresh:

* ``frequent``     the wire (headlines, then their tone and themes) and the markets page (every 30 minutes)
* ``hourly``       SEC filings, Form 4 insiders, the calendar's releases, IPOs and dividends
* ``after_close``  daily prices, strategy baskets and their live record, earnings
                   dates and reactions, the screener snapshot, then the standing agents
                   and the reason checks (both TypeScript, see "Node jobs" below)
* ``weekly``       13F fund portfolios, who holds each stock, House trade reports,
                   then the copy tests built from them (off until ``COPY_TRADES_ENABLED=1``),
                   ETF holdings and stock logo tiles
* ``earnings_day`` the report on each covered stock that filed earnings today
                   (every 10 minutes on weekdays; the job itself stays off until
                   ``EARNINGS_DAY_ENABLED=1``)

Node jobs: an entry starting with ``node:`` runs a TypeScript script under
vite-node with ``scripts/jobs.config.ts`` (not the test config: that one has no
stand-ins for Next's ``cache``/``unstable_cache``, so the app code died on
import). These scripts reach the store over HTTP through lib/firebase-admin.ts,
which needs ``LOCALDB_API_TOKEN`` and a service account. On the VPS the token
is in ``/etc/tikrr/agentdata-localdb.env``, a root-only file holding that one
line, which the after-close unit loads with ``EnvironmentFile=`` (not the
server's own localdb.env, whose settings must not reach the Python steps); the
URL defaults to the local service and the service account to
``GOOGLE_APPLICATION_CREDENTIALS``, see ``node_env``. A node job whose
environment is still short fails with the missing names, never values; with
the token set, a machine without node fails the step instead of skipping it.

Nothing here is installed by importing it. The systemd units that call it are
in ``backend/vps/units/tikrr-agentdata-*.{service,timer}``.

Standard library only.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]

# (label, argv). A plain list is a Python module run as ``python -m``.
# A list starting with "node:" is the TypeScript agent runner.
GROUPS: dict[str, list[tuple[str, list[str]]]] = {
    "frequent": [
        ("news", ["backend.agentdata.news_feed", "--days", "3"]),
        # Tone and theme for each new headline; skips itself without ANTHROPIC_API_KEY.
        ("news tone", ["backend.agentdata.news_tone", "--hours", "50"]),
        ("markets", ["backend.agentdata.markets"]),
    ],
    "hourly": [
        ("sec filings", ["backend.agentdata.sec_filings", "--days", "7"]),
        ("insider trades", ["backend.agentdata.insiders_form4", "--days", "7"]),
        ("calendar events", ["backend.agentdata.calendar_events"]),
    ],
    "after_close": [
        ("prices and strategies", ["backend.agentdata.backtest_strategies"]),
        ("earnings calendar", ["backend.agentdata.earnings_calendar"]),
        # Three years of 8-K earnings release dates and times from EDGAR (about 800 requests, ~2 minutes),
        # read by the reactions step below and the earnings season planner.
        ("earnings history", ["backend.agentdata.earnings_history"]),
        ("earnings reactions", ["backend.agentdata.earnings_reactions"]),
        # Past dividends per stock for the dividend planner; a bad source reply never overwrites a good history.
        ("dividend history", ["backend.agentdata.dividend_history"]),
        ("screener snapshot", ["backend.agentdata.screener"]),
        ("standing agents", ["node:scripts/run-agent-jobs.ts"]),
        # Every saved reason on a tracked stock, checked against tonight's facts and stored in
        # tm_thesis_checks (rules only, no model), so the reason watcher is current without a visit.
        ("reason checks", ["node:scripts/run-reason-checks.ts"]),
    ],
    "weekly": [
        ("13F funds", ["backend.agentdata.funds_13f"]),
        ("fund holders", ["backend.agentdata.fund_holders"]),
        # No --years: the job replaces each member's whole profile, so a run
        # limited to one year would shrink every record to that year.
        ("house trade reports", ["backend.agentdata.house_ptr"]),
        # Copy tests for every fund and member, from the 13F and House jobs above. Off until
        # COPY_TRADES_ENABLED=1; the job itself exits early without it.
        ("copy trade tests", ["backend.agentdata.copy_trades"]),
        # What each ETF holds, from its latest SEC N-PORT filing (the x-ray page). Funds whose
        # filing has not changed are skipped, so most runs are a few dozen SEC requests.
        ("ETF holdings", ["backend.agentdata.etf_holdings"]),
        # Square logo tiles for every covered stock and fund (Finnhub, then FMP), stored in
        # tm_stock_logos for /api/logo. Logos 30+ days old are fetched again; a failed fetch never
        # replaces a stored tile. Needs Pillow on the host.
        ("stock logos", ["backend.agentdata.stock_logos"]),
    ],
    # Minutes after a company files its earnings release (8-K Item 2.02). Cheap when
    # nobody reports: one store read. Today and yesterday, so an evening release
    # still gets its next-session reaction.
    "earnings_day": [
        ("earnings day reports", ["backend.agentdata.earnings_day", "--days", "1"]),
    ],
}

# A job that hangs must not hold the group, and the next timer run, forever.
TIMEOUT_SECONDS = {"frequent": 20 * 60, "hourly": 40 * 60, "after_close": 90 * 60, "weekly": 4 * 60 * 60, "earnings_day": 9 * 60}


# The vite-node config for node jobs (aliases plus stand-ins for Next-only APIs).
NODE_JOBS_CONFIG = "scripts/jobs.config.ts"
# The LocalDB HTTP service on the VPS (backend/vps/localdb.service binds it here).
DEFAULT_LOCALDB_PORT = "8500"


def command_for(argv: list[str]) -> list[str] | None:
    """The process to start for one job, or None when it cannot run on this machine."""
    head = argv[0]
    if head.startswith("node:"):
        runner = _ROOT / "node_modules" / ".bin" / "vite-node"
        if not runner.exists() or shutil.which("node") is None:
            return None
        return [str(runner), "-c", NODE_JOBS_CONFIG, head.split(":", 1)[1], *argv[1:]]
    return [sys.executable, "-m", head, *argv[1:]]


def node_env(environ: dict[str, str]) -> dict[str, str]:
    """The environment for a node job: the given one plus the two defaults the VPS env file lacks.

    * ``LOCALDB_URL``: the local service, when a token is present and no URL is set.
    * ``FIREBASE_SERVICE_ACCOUNT_PATH``: ``GOOGLE_APPLICATION_CREDENTIALS``, when neither
      Firebase variable is set (lib/firebase-admin.ts needs one for Auth, even with LocalDB).

    Values set explicitly always win; nothing is printed.
    """
    env = dict(environ)
    if env.get("LOCALDB_API_TOKEN", "").strip() and not env.get("LOCALDB_URL", "").strip():
        port = env.get("LOCALDB_PORT", "").strip() or DEFAULT_LOCALDB_PORT
        env["LOCALDB_URL"] = f"http://127.0.0.1:{port}"
    has_firebase = env.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip() or env.get("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()
    google = env.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if not has_firebase and google:
        env["FIREBASE_SERVICE_ACCOUNT_PATH"] = google
    return env


def node_env_missing(env: dict[str, str]) -> list[str]:
    """Names (never values) a node job still needs after ``node_env``. Empty when it can start."""
    missing = []
    if not env.get("LOCALDB_API_TOKEN", "").strip() and env.get("FIRESTORE_BACKEND", "").strip().lower() != "firebase":
        missing.append("LOCALDB_API_TOKEN")
    if not (env.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip() or env.get("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()):
        missing.append("FIREBASE_SERVICE_ACCOUNT_PATH")
    return missing


def plan(group: str) -> list[tuple[str, list[str] | None]]:
    if group not in GROUPS:
        raise KeyError(group)
    return [(label, command_for(argv)) for label, argv in GROUPS[group]]


def run_group(group: str, *, dry_run: bool = False, out=sys.stdout, environ: dict[str, str] | None = None) -> int:
    failures = 0
    base_env = dict(os.environ if environ is None else environ)
    for (label, argv), (_, command) in zip(GROUPS[group], plan(group)):
        if command is None:
            # On a laptop a missing node is a skip. Where the job is meant to run (the store token is
            # set, or TIKRR_REQUIRE_NODE=1) it is a failure, so the timer does not stay green without it.
            required = bool(base_env.get("LOCALDB_API_TOKEN", "").strip()) or base_env.get("TIKRR_REQUIRE_NODE", "").strip() == "1"
            if required:
                print(f"[{group}] FAILED       {label}: needs node and node_modules on this machine", file=out, flush=True)
                failures += 1
            else:
                print(f"[{group}] skip  {label}: needs node and node_modules on this machine", file=out, flush=True)
            continue
        env = base_env
        if argv[0].startswith("node:"):
            env = node_env(base_env)
            missing = node_env_missing(env)
            if missing:
                # Counted as a failure so the timer shows red; the names say what the unit is missing.
                print(f"[{group}] FAILED       {label}: set {', '.join(missing)} for this unit", file=out, flush=True)
                failures += 1
                continue
        if dry_run:
            print(f"[{group}] would run {label}: {' '.join(command)}", file=out, flush=True)
            continue
        started = time.monotonic()
        try:
            code = subprocess.run(command, cwd=_ROOT, env=env, timeout=TIMEOUT_SECONDS[group], check=False).returncode
        except subprocess.TimeoutExpired:
            code = 124
        seconds = time.monotonic() - started
        status = "ok" if code == 0 else f"FAILED ({code})"
        print(f"[{group}] {status:12s} {label} in {seconds:.0f}s", file=out, flush=True)
        if code != 0:
            failures += 1
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run one group of the agent data jobs.")
    parser.add_argument("--group", choices=sorted(GROUPS))
    parser.add_argument("--dry-run", action="store_true", help="print the plan and run nothing")
    parser.add_argument("--list", action="store_true", help="print every group and its jobs")
    args = parser.parse_args(argv)
    if args.list:
        for group, jobs in GROUPS.items():
            print(f"{group}: {', '.join(label for label, _ in jobs)}")
        return 0
    if not args.group:
        parser.error("--group is required (or --list)")
    return run_group(args.group, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
