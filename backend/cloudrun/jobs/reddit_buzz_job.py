from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Reddit buzz worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="reddit_buzz")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--posts-per-subreddit", type=int, default=25)
    parser.add_argument("--max-tickers", type=int, default=20)
    parser.add_argument("--max-top-posts", type=int, default=12)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_reddit_buzz",
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--posts-per-subreddit",
        str(args.posts_per_subreddit),
        "--max-tickers",
        str(args.max_tickers),
        "--max-top-posts",
        str(args.max_top_posts),
    ]
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
