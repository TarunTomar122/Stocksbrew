"""Run the full pre-market intelligence chain: news → movers → mover context."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys


def _run_step(label: str, cmd: list[str]) -> None:
    print(json.dumps({"step": label, "cmd": " ".join(cmd)}))
    subprocess.run(cmd, check=True)


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

    print(json.dumps({"status": "success", "market": market.upper(), "dry_run": args.dry_run}))


if __name__ == "__main__":
    main()
