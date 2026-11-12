from __future__ import annotations

import argparse
from datetime import datetime, timedelta
import subprocess
import sys
import time
from typing import Sequence
from zoneinfo import ZoneInfo

from backend.market_session_state import MarketSessionState


def _run(cmd: Sequence[str]) -> None:
    print({"cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


def _wait_until_after_open(market: str, minutes: int) -> None:
    if minutes <= 0:
        return
    timezone = ZoneInfo("America/New_York" if market == "US" else "Asia/Kolkata")
    now = datetime.now(timezone)
    open_hour, open_minute = (9, 30) if market == "US" else (9, 15)
    target = now.replace(hour=open_hour, minute=open_minute, second=0, microsecond=0) + timedelta(
        minutes=minutes
    )
    wait_seconds = max(0.0, (target - now).total_seconds())
    if wait_seconds > 0:
        print(
            {
                "stage": "wait_for_settled_open_tape",
                "market": market,
                "target": target.isoformat(),
                "wait_seconds": round(wait_seconds, 1),
            },
            flush=True,
        )
        time.sleep(wait_seconds)


# Phases whose mover pass hangs off a price batch only (no brief stage first).
MOVER_ONLY_PHASES = frozenset({"open_check", "mid_check"})


def barrier_stages(phase: str) -> list[str]:
    """Stages that must be done before this anomaly pass may select movers.

    Close: post-close prices -> closing briefs -> anomalies, one chain.
    Open: the 09:50 price batch starts anomalies and the morning briefs side
    by side, and the briefs wait for these reasons so they can cite them.
    Waiting on briefs here would deadlock that order.
    Midday (12:30 and 14:30 ET): a price batch alone re-selects the movers. No
    brief run exists at midday, so waiting on one would hang, then fail.
    """
    return ["price"] if phase in MOVER_ONLY_PHASES else ["price", "briefs"]


# Session hours in local market time, and how long before the close a midday
# rebuild may still start (it must finish well before the close chain).
SESSION_HOURS = {"US": ((9, 30), (16, 0)), "IN": ((9, 15), (15, 30))}
MIDDAY_LAST_START_BEFORE_CLOSE = timedelta(minutes=30)


def midday_rebuild_allowed(market: str, now: datetime | None = None) -> bool:
    """Whether a mid_check rebuild may replace the feed now.

    The midday timers are Persistent, so a VPS that was down at 14:30 would
    fire the missed run on boot, possibly after the close. A mid_check feed
    must never replace the post-close one, so outside the session it skips.
    """
    zone = ZoneInfo("America/New_York" if market == "US" else "Asia/Kolkata")
    local = (now or datetime.now(zone)).astimezone(zone)
    if local.weekday() >= 5:
        return False
    (open_hour, open_minute), (close_hour, close_minute) = SESSION_HOURS.get(market, SESSION_HOURS["US"])
    opens = local.replace(hour=open_hour, minute=open_minute, second=0, microsecond=0)
    last_start = local.replace(hour=close_hour, minute=close_minute, second=0, microsecond=0) - MIDDAY_LAST_START_BEFORE_CLOSE
    return opens <= local < last_start


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
        "--not-before-minutes-after-open",
        type=int,
        default=0,
        help="Dependency-safe delay before selecting movers; useful for the opening run.",
    )
    parser.add_argument(
        "--include-discovery",
        action="store_true",
        help="Also build non-critical heat/divergence/sentiment discovery models.",
    )
    parser.add_argument("--skip-session-barrier", action="store_true")
    parser.add_argument(
        "--barrier-timeout-seconds",
        type=int,
        default=3600,
        help="Wait up to one hour for the sequential price (and, after the close, brief) dependency before failing closed.",
    )
    parser.add_argument(
        "--price-session-phase",
        choices=["pre_open", "open_check", "mid_check", "close_check", "post_close", "manual"],
        default=None,
        help="Require selected mover prices to be fresh for this session phase.",
    )
    args = parser.parse_args()
    if args.price_session_phase == "mid_check" and not midday_rebuild_allowed(args.market):
        print({"stage": "skip_midday_rebuild_outside_session", "market": args.market}, flush=True)
        return
    _wait_until_after_open(args.market, max(0, args.not_before_minutes_after_open))
    barrier = None if args.skip_session_barrier else MarketSessionState()
    if args.price_session_phase and barrier is not None:
        barrier.wait_for_stages(
            market=args.market,
            phase=args.price_session_phase,
            stages=barrier_stages(args.price_session_phase),
            timeout_seconds=max(0, args.barrier_timeout_seconds),
        )
        # The wait can be long; never start a midday rebuild after the window.
        if args.price_session_phase == "mid_check" and not midday_rebuild_allowed(args.market):
            print({"stage": "skip_midday_rebuild_after_barrier_wait", "market": args.market}, flush=True)
            return

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
    if args.price_session_phase == "mid_check":
        # Keep the morning's source-backed reasons for stocks still moving the
        # same way; the research pass below then only covers what is new.
        anomaly_cmd.append("--carry-session-reasons")

    # First materialize the session's movers from canonical prices. Reasons are
    # deliberately a separate job: a stock brief is broad product context,
    # whereas an anomaly reason must be tied to this specific move.
    _run(anomaly_cmd)

    research_cmd = [
        sys.executable,
        "-m",
        "backend.scripts.research_daily_anomaly_reasons",
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--only-unresolved",
        "--require-complete",
        "--require-web-revalidate",
    ]
    if args.price_session_phase:
        research_cmd.extend(["--expected-price-session-phase", args.price_session_phase])
    _run(research_cmd)
    if args.price_session_phase and barrier is not None:
        barrier.record_stage(
            market=args.market,
            phase=args.price_session_phase,
            stage="anomalies",
            run_id=args.run_id,
        )

    # The feed and its evidence-backed explanations are complete at this
    # point. Send the opening email before the optional discovery read models
    # below: heat/divergence/sentiment can take many minutes and must never
    # delay a fresh 20-minute-after-open report. Only the open sends mail; the
    # midday and close rebuilds refresh the feed silently.
    if args.price_session_phase == "open_check":
        if barrier is not None:
            barrier.wait_for_stages(
                market=args.market,
                phase=args.price_session_phase,
                stages=["price", "anomalies"],
                timeout_seconds=max(0, args.barrier_timeout_seconds),
            )
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

    if args.include_discovery:
        market_only = ["--market", args.market]
        universe_pair = ["--ai-universe", args.universe, "--price-universe", args.universe]
        _run([sys.executable, "-m", "backend.scripts.build_heat_list", *market_only, *universe_pair])
        _run([sys.executable, "-m", "backend.scripts.build_interesting_stocks", *market_only, *universe_pair])
        _run([sys.executable, "-m", "backend.scripts.build_divergence", *market_only, *universe_pair])
        _run([sys.executable, "-m", "backend.scripts.build_sentiment_flip", *market_only, *universe_pair])


if __name__ == "__main__":
    main()
