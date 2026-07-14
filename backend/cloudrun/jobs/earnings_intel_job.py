from __future__ import annotations

import argparse
import json
import subprocess
import sys

from backend.scripts.build_earnings_intel import recent_reporter_instrument_ids
from backend.storage import TraceMoneyStore


def _parse_instrument_ids(stdout: str) -> list[str]:
    """Pull instrument_ids out of build_earnings_intel's final JSON line.

    The script prints warnings and progress to stdout, then exactly one JSON
    object summarizing the run. We scan from the bottom for the first line that
    parses as a dict carrying instrument_ids.
    """
    for line in reversed((stdout or "").splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        ids = data.get("instrument_ids")
        if isinstance(ids, list):
            return [str(i).strip() for i in ids if str(i).strip()]
        return []
    return []


def _sync_reporter_market_data(
    *,
    market: str,
    universe_id: str,
    instrument_ids: list[str],
) -> None:
    """Refresh prices and fundamentals for recent reporters outside the core cohort."""
    if not instrument_ids:
        return
    joined = ",".join(instrument_ids)
    common = ["--market", market, "--universe", universe_id, "--instrument-ids", joined]
    cmds = [
        [
            sys.executable,
            "-m",
            "backend.scripts.sync_price_snapshots",
            *common,
            "--session-phase",
            "post_close",
            "--merge-market-snapshot",
        ],
        [
            sys.executable,
            "-m",
            "backend.scripts.sync_stock_metrics",
            *common,
            "--max-workers",
            "2",
            "--pause",
            "0.35",
        ],
        [
            sys.executable,
            "-m",
            "backend.scripts.sync_stock_facts",
            *common,
            "--max-workers",
            "2",
            "--pause",
            "0.35",
            "--no-include-price-core-overrides",
        ],
    ]
    for cmd in cmds:
        print({
            "step": "sync_reporter_market_data",
            "reporters": len(instrument_ids),
            "cmd": " ".join(cmd),
        })
        # Best-effort: intel still builds if a provider is rate-limited.
        subprocess.run(cmd, check=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Post-earnings intelligence worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="earnings_intel")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--recent-days", type=int, default=3)
    parser.add_argument("--max-events", type=int, default=20)
    parser.add_argument("--model", default="")
    args = parser.parse_args()

    # Step 1: enrich recently-reported universe events with ACTUAL reported
    # EPS/surprise from Alpha Vantage, merging them onto tm_earnings_events.
    # This must run before the build so the report grounds in real numbers
    # (and correct past/future tense) instead of repeating the estimate.
    actuals_cmd = [
        sys.executable,
        "-m",
        "backend.scripts.sync_earnings_actuals",
        "--market",
        args.market,
        "--recent-days",
        str(max(0, args.recent_days)),
        "--max-events",
        str(max(1, args.max_events)),
        "--write",
    ]
    print({"run_id": args.run_id, "lane": args.lane, "step": "sync_actuals", "cmd": " ".join(actuals_cmd)})
    # Don't fail the whole job if Alpha Vantage is rate-limited; the build still
    # runs and degrades gracefully (reported_actuals.available = false).
    subprocess.run(actuals_cmd, check=False)

    store = TraceMoneyStore()
    universe_id = args.universe.strip() or store.get_active_price_universe(args.market) or ""
    if not universe_id:
        raise ValueError(f"No active price universe configured for {args.market}")

    # Step 2: refresh prices + fundamentals for recent reporters. Many sit in our
    # calendar universe but outside the ~100-stock price cohort, so the events
    # page and stock detail pages would otherwise show missing quote/facts data.
    # Match build_earnings_intel --all-recent: scope to the full calendar
    # universe (tm_instruments), not the smaller price cohort in args.universe.
    reporter_ids = recent_reporter_instrument_ids(
        store,
        args.market,
        recent_days=max(0, args.recent_days),
        max_events=max(1, args.max_events),
    )
    print({
        "run_id": args.run_id,
        "lane": args.lane,
        "step": "sync_reporter_market_data",
        "reporters": len(reporter_ids),
    })
    _sync_reporter_market_data(
        market=args.market,
        universe_id=universe_id,
        instrument_ids=reporter_ids,
    )

    # Step 3: build the post-earnings intel reports.
    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_earnings_intel",
        "--market",
        args.market,
        "--all-recent",
        "--recent-days",
        str(max(0, args.recent_days)),
        "--max-events",
        str(max(1, args.max_events)),
        "--write",
    ]
    if args.model.strip():
        cmd.extend(["--model", args.model.strip()])

    print({"run_id": args.run_id, "lane": args.lane, "step": "build_intel", "cmd": " ".join(cmd)})
    build = subprocess.run(cmd, check=False, capture_output=True, text=True)
    # Re-emit captured output so the job logs still show the build summary.
    if build.stdout:
        print(build.stdout, end="")
    if build.stderr:
        print(build.stderr, end="", file=sys.stderr)
    if build.returncode != 0:
        raise subprocess.CalledProcessError(
            build.returncode,
            cmd,
            output=build.stdout,
            stderr=build.stderr,
        )

    # Step 4: refresh the AI news brief for every stock that just reported, so a
    # stock nobody is watching (whose brief may be weeks stale) gets a fresh
    # brief that reflects the print instead of showing ancient coverage. The
    # earnings block + post-earnings highlights are now in place, so the brief
    # synthesizer will lead with the result.
    reporter_ids = _parse_instrument_ids(build.stdout)
    if reporter_ids:
        brief_cmd = [
            sys.executable,
            "-m",
            "backend.scripts.build_per_stock_intelligence",
            "--market",
            args.market,
            "--instrument-ids",
            ",".join(reporter_ids),
            "--include-no-news",
            "--upsert",
            "--skip-context",
            "--skip-materialize",
        ]
        print({
            "run_id": args.run_id,
            "lane": args.lane,
            "step": "refresh_briefs",
            "reporters": len(reporter_ids),
            "cmd": " ".join(brief_cmd),
        })
        # Don't fail the job if a brief refresh hiccups; the intel reports are
        # already written and are the primary deliverable.
        subprocess.run(brief_cmd, check=False)
    else:
        print({"run_id": args.run_id, "lane": args.lane, "step": "refresh_briefs", "reporters": 0})


if __name__ == "__main__":
    main()
