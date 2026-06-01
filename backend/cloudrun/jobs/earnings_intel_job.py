from __future__ import annotations

import argparse
import json
import subprocess
import sys


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

    # Step 2: build the post-earnings intel reports.
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
    build = subprocess.run(cmd, check=True, capture_output=True, text=True)
    # Re-emit captured output so the job logs still show the build summary.
    if build.stdout:
        print(build.stdout, end="")
    if build.stderr:
        print(build.stderr, end="", file=sys.stderr)

    # Step 3: refresh the AI news brief for every stock that just reported, so a
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
