from __future__ import annotations

import argparse
import subprocess
import sys
from typing import Sequence


def _run(cmd: Sequence[str]) -> None:
    print({"cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Open-session anomaly worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="open_anomalies")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--threshold-pct", type=float, default=1.0)
    parser.add_argument("--limit", type=int, default=15)
    parser.add_argument("--per-stock-cap", type=int, default=3)
    parser.add_argument("--chunk-workers", type=int, default=4)
    parser.add_argument(
        "--price-session-phase",
        choices=["pre_open", "open_check", "mid_check", "close_check", "post_close", "manual"],
        default=None,
        help="Require selected mover prices to be fresh for this session phase.",
    )
    args = parser.parse_args()

    # `build_daily_anomalies` accepts `--universe`; the others below take only
    # `--market` + `--ai-universe` / `--price-universe`. Passing `--universe`
    # to them fails argparse and silently kills the heat/divergence/sentiment
    # refresh — see the open-anomalies job logs prior to this fix.
    anomaly_cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_daily_anomalies",
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--threshold-pct",
        str(args.threshold_pct),
        "--limit",
        str(args.limit),
        "--per-stock-cap",
        str(args.per_stock_cap),
        "--chunk-workers",
        str(args.chunk_workers),
        "--mover-reasoning-only",
        "--require-web-revalidate",
    ]
    if args.price_session_phase:
        anomaly_cmd.extend(["--require-price-session-phase", args.price_session_phase])

    # First materialize the session's movers from canonical prices. Reasons are
    # deliberately a separate job: a stock brief is broad product context,
    # whereas an anomaly reason must be evidence tied to this specific move.
    _run(anomaly_cmd)
    research_cmd = [
        sys.executable,
        "-m",
        "backend.scripts.research_daily_anomaly_reasons",
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--require-web-revalidate",
    ]
    if args.price_session_phase:
        research_cmd.extend(["--expected-price-session-phase", args.price_session_phase])
    _run(research_cmd)

    # The feed and its evidence-backed explanations are complete at this
    # point. Send the opening email before the optional discovery read models
    # below: heat/divergence/sentiment can take many minutes and must never
    # delay a fresh 20-minute-after-open report.
    if args.price_session_phase == "open_check":
        _run(
            [
                sys.executable,
                "-m",
                "backend.scripts.send_open_briefs",
                "--market",
                args.market,
                "--limit",
                "0",
            ]
        )

    # These are independent discovery models. They may be slow, but they are
    # not a dependency of the mover feed or its email.
    market_only = ["--market", args.market]
    universe_pair = ["--ai-universe", args.universe, "--price-universe", args.universe]
    _run([sys.executable, "-m", "backend.scripts.build_heat_list", *market_only, *universe_pair])
    _run([sys.executable, "-m", "backend.scripts.build_interesting_stocks", *market_only, *universe_pair])
    _run([sys.executable, "-m", "backend.scripts.build_divergence", *market_only, *universe_pair])
    _run([sys.executable, "-m", "backend.scripts.build_sentiment_flip", *market_only, *universe_pair])


if __name__ == "__main__":
    main()
