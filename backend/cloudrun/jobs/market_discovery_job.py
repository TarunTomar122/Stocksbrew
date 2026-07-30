from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Non-critical market discovery models")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="market_discovery")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    args = parser.parse_args()

    market_only = ["--market", args.market]
    universe_pair = [
        "--ai-universe",
        args.universe,
        "--price-universe",
        args.universe,
    ]
    commands = [
        [sys.executable, "-m", "backend.scripts.build_heat_list", *market_only, *universe_pair],
        [sys.executable, "-m", "backend.scripts.build_interesting_stocks", *market_only, *universe_pair],
        [sys.executable, "-m", "backend.scripts.build_divergence", *market_only, *universe_pair],
        [sys.executable, "-m", "backend.scripts.build_sentiment_flip", *market_only, *universe_pair],
    ]
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=len(commands)) as executor:
        futures = {
            executor.submit(subprocess.run, command, check=False): command
            for command in commands
        }
        for future in as_completed(futures):
            command = futures[future]
            result = future.result()
            if result.returncode != 0:
                failures.append(" ".join(command))
    print(
        {
            "run_id": args.run_id,
            "lane": args.lane,
            "model_count": len(commands),
            "failure_count": len(failures),
            "failures": failures,
        }
    )
    if failures:
        raise RuntimeError(f"{len(failures)} market discovery models failed")


if __name__ == "__main__":
    main()
