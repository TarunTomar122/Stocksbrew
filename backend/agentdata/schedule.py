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
                   the reason checks, the filing changes and the thesis checks (TypeScript, see "Node jobs" below)
* ``weekly``       13F fund portfolios, who holds each stock, House trade reports, Senate
                   trade reports (off until ``SENATE_PTR_ENABLED=1``),
                   then the copy tests built from them (off until ``COPY_TRADES_ENABLED=1``),
                   fund facts and fund instruments, ETF holdings, stock logo tiles and the
                   analytics' country database (a new file once a month)
* ``earnings_day`` the report on each covered stock that filed earnings today
                   (every 10 minutes on weekdays; the job itself stays off until
                   ``EARNINGS_DAY_ENABLED=1``)
* ``extended_hours`` after-hours and pre-market quotes for today's reporters, tracked
                   and covered stocks (every 15 minutes from 16:05 to 19:50 New York,
                   a last snapshot at 20:05, and three runs before the open)

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
        # Prices first and on their own: every later step reads them from the store. Only the
        # series newer than the stored copy are written (~550 on a market day).
        ("prices", ["backend.agentdata.backtest_strategies", "--prices-only"]),
        # The strategies run on the series the step above just cached on disk, so a slow price
        # write can time out without costing the strategies their nightly update.
        ("strategies", ["backend.agentdata.backtest_strategies", "--no-price-write"]),
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
        # What changed in each company's risk factors: a 10-K or 10-Q newer than the stored one is compared with the
        # filing it should be read against and stored in tm_filing_changes (rules only, no model). One SEC request per
        # stock on a quiet night, 400ms apart so it and the hourly SEC filings step (:20, ~7 a second) stay under SEC's
        # 10 a second together; documents only for new filings.
        ("filing changes", ["node:scripts/run-filing-changes.ts", "--quiet", "--budget-minutes=20"]),
        # Each thesis's measurable lines judged per report and its companies' new 10-K/10-Q risk changes recorded,
        # stored in tm_agent_thesis_checks (rules only, no model). After the filing changes, so tonight's are seen.
        ("thesis checks", ["node:scripts/run-thesis-checks.ts"]),
    ],
    "weekly": [
        ("13F funds", ["backend.agentdata.funds_13f"]),
        ("fund holders", ["backend.agentdata.fund_holders"]),
        # No --years: the job replaces each member's whole profile, so a run
        # limited to one year would shrink every record to that year.
        ("house trade reports", ["backend.agentdata.house_ptr"]),
        # Senators' reports from the Senate eFD site: only reports filed since the last run, so a
        # routine run is a few search pages and a handful of report pages. Off until
        # SENATE_PTR_ENABLED=1: eFD refuses non-browser clients with a 403 today, and the job stops
        # on the first 403 (exit 2) rather than retrying. Weekly is enough for a public-interest
        # page; a more frequent run only pays off once eFD lets the job in.
        ("senate trade reports", ["backend.agentdata.senate_ptr"]),
        # Copy tests for every fund and member, from the 13F and House jobs above. Off until
        # COPY_TRADES_ENABLED=1; the job itself exits early without it.
        ("copy trade tests", ["backend.agentdata.copy_trades"]),
        # The fund pages: expense ratio, size, yield and inception from Yahoo for the popular funds
        # (backend/config/popular_funds.json) and every fund users hold, then register any of them that
        # has no instrument yet (create-only, plus a search entry and a first price). The second step
        # writes tm_instruments through TraceMoneyStore and stops unless LOCALDB_PATH is set.
        ("fund facts", ["backend.agentdata.fund_facts"]),
        ("fund instruments", ["backend.scripts.register_fund_instruments"]),
        # What each ETF holds, from its latest SEC N-PORT filing (the x-ray page). Funds whose
        # filing has not changed are skipped, so most runs are a few dozen SEC requests.
        ("ETF holdings", ["backend.agentdata.etf_holdings"]),
        # Square logo tiles for every covered stock and fund (Finnhub, then FMP), stored in
        # tm_stock_logos for /api/logo. Logos 30+ days old are fetched again; a failed fetch never
        # replaces a stored tile. Needs Pillow on the host.
        ("stock logos", ["backend.agentdata.stock_logos"]),
        # db-ip.com's monthly IP-to-country file for the first-party analytics (/admin/analytics), into
        # /srv/tikrr-data/geo. A stat call unless a new month's file is out; the web app picks it up by mtime.
        ("geo database", ["backend.agentdata.geo_db"]),
    ],
    # Minutes after a company files its earnings release (8-K Item 2.02). Cheap when
    # nobody reports: one store read. Today and yesterday, so an evening release
    # still gets its next-session reaction.
    "earnings_day": [
        ("earnings day reports", ["backend.agentdata.earnings_day", "--days", "1"]),
    ],
    # Each stock's newest print outside the regular session against the close it moved from, into
    # tm_extended_quotes: Yahoo's batch quote, 50 symbols a request (~20 requests, ~15 s for ~850 stocks).
    # Yahoo and the store only, no SEC, so its unit takes its own lock and never waits behind after_close.
    "extended_hours": [
        ("extended quotes", ["backend.agentdata.extended_hours"]),
    ],
}

# A job that hangs must not hold the group, and the next timer run, forever.
TIMEOUT_SECONDS = {"frequent": 20 * 60, "hourly": 40 * 60, "after_close": 90 * 60, "weekly": 4 * 60 * 60, "earnings_day": 9 * 60, "extended_hours": 9 * 60}

# Per-step limits where the group's default is far too generous. A step that hits its limit
# fails on its own and the group moves on, instead of one stuck step eating the group's time
# and leaving everything after it stale. Each limit is several times the step's usual run on
# the VPS (in brackets, Nov 2026), and wins over TIMEOUT_SECONDS.
STEP_TIMEOUT_SECONDS: dict[tuple[str, str], int] = {
    # [Before Nov 11: 65-90+ min, ~15-20 s per stored series.] Now: fetch ~2 min, then ~550
    # series written in batches; a timeout keeps what was committed and the next run picks up
    # the rest.
    ("after_close", "prices"): 30 * 60,
    ("after_close", "strategies"): 15 * 60,  # [~1 min on cached prices]
    ("after_close", "earnings calendar"): 15 * 60,  # [3-4 min]
    ("after_close", "earnings history"): 15 * 60,  # [~2 min]
    ("after_close", "earnings reactions"): 10 * 60,  # [1-1.5 min]
    ("after_close", "dividend history"): 20 * 60,  # [~800 Yahoo requests, ~8 min]
    ("after_close", "screener snapshot"): 10 * 60,  # [1-1.5 min]
    # The two node steps have no clean run on the VPS yet (env errors through Nov 11), so these
    # limits are generous guesses; tighten them once the journal shows a few nights.
    ("after_close", "standing agents"): 20 * 60,
    ("after_close", "reason checks"): 15 * 60,
    # [first full fill from a laptop, Nov 13: 585 stocks in 6.6 min at 150ms; a quiet night is ~600 SEC list requests,
    # ~4 min at 400ms]
    ("after_close", "filing changes"): 25 * 60,
    # [new; a few figure reads per thesis, well under a minute for a handful of theses]
    ("after_close", "thesis checks"): 15 * 60,
    # [~50 funds, two or three Yahoo requests each, ~1 min]
    ("weekly", "fund facts"): 15 * 60,
    ("weekly", "fund instruments"): 10 * 60,
    # [one ~4 MB download a month, seconds]
    ("weekly", "geo database"): 5 * 60,
}


def timeout_for(group: str, label: str) -> int:
    """Seconds one step may run before it is stopped and counted as failed."""
    return STEP_TIMEOUT_SECONDS.get((group, label), TIMEOUT_SECONDS[group])


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
            print(f"[{group}] would run {label}: {' '.join(command)} (limit {timeout_for(group, label) // 60} min)", file=out, flush=True)
            continue
        limit = timeout_for(group, label)
        started = time.monotonic()
        timed_out = False
        try:
            code = subprocess.run(command, cwd=_ROOT, env=env, timeout=limit, check=False).returncode
        except subprocess.TimeoutExpired:
            code = 124
            timed_out = True
        seconds = time.monotonic() - started
        status = "ok" if code == 0 else f"FAILED ({code})"
        note = f" (stopped at its {limit // 60} min limit)" if timed_out else ""
        print(f"[{group}] {status:12s} {label} in {seconds:.0f}s{note}", file=out, flush=True)
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
