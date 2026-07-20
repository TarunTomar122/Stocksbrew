"""Run the full pre-market intelligence chain: news → movers → mover context."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime
from zoneinfo import ZoneInfo


def _run_step(label: str, cmd: list[str]) -> None:
    print(json.dumps({"step": label, "cmd": " ".join(cmd)}))
    subprocess.run(cmd, check=True)


def _is_us_premarket_window(now: datetime | None = None) -> bool:
    """True between 4:00 and 9:30am New York time on a weekday."""
    local = (now or datetime.now(ZoneInfo("America/New_York"))).astimezone(ZoneInfo("America/New_York"))
    if local.weekday() >= 5:
        return False
    minutes = local.hour * 60 + local.minute
    return 4 * 60 <= minutes < 9 * 60 + 30


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-market intelligence pipeline")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--skip-news", action="store_true")
    parser.add_argument("--skip-movers", action="store_true")
    parser.add_argument("--skip-context", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    py = sys.executable
    market = args.market

    # The 10:00 IST pass is intentionally a light global/overnight read. It
    # avoids doing a second full tracked-news enrichment before US pre-market
    # pricing exists. The 15:30 IST pass enters the normal mover/context chain.
    if market == "US" and not _is_us_premarket_window():
        sentiment_cmd = [py, "-m", "backend.scripts.build_premarket_sentiment", "--market", market, "--phase", "early"]
        if args.dry_run:
            sentiment_cmd.append("--dry-run")
        _run_step("premarket_opening_sentiment", sentiment_cmd)
        print(json.dumps({"status": "success", "market": market.upper(), "phase": "early"}))
        return

    if not args.skip_news:
        news_cmd = [py, "-m", "backend.scripts.build_premarket_news", "--market", market]
        if args.dry_run:
            news_cmd.append("--dry-run")
        _run_step("premarket_news", news_cmd)

    if not args.skip_movers:
        movers_cmd = [py, "-m", "backend.scripts.build_premarket_movers", "--market", market]
        if args.dry_run:
            movers_cmd.append("--dry-run")
        _run_step("premarket_movers", movers_cmd)

    if not args.skip_context:
        context_cmd = [py, "-m", "backend.scripts.build_premarket_context", "--market", market]
        if args.dry_run:
            context_cmd.append("--dry-run")
        _run_step("premarket_context", context_cmd)

    sentiment_cmd = [py, "-m", "backend.scripts.build_premarket_sentiment", "--market", market, "--phase", "premarket"]
    if args.dry_run:
        sentiment_cmd.append("--dry-run")
    _run_step("premarket_opening_sentiment", sentiment_cmd)

    print(json.dumps({"status": "success", "market": market.upper(), "dry_run": args.dry_run}))


if __name__ == "__main__":
    main()
