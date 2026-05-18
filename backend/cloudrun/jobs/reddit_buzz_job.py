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
    parser.add_argument("--promote-min-mentions", type=int, default=1)
    parser.add_argument("--promote-max-add", type=int, default=8)
    parser.add_argument("--promote-max-backfill", type=int, default=6)
    parser.add_argument("--skip-promotion", action="store_true")
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

    if args.skip_promotion:
        return

    promote_cmd = [
        sys.executable,
        "-m",
        "backend.scripts.promote_reddit_buzz_to_core",
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--min-mentions",
        str(args.promote_min_mentions),
        "--max-add",
        str(args.promote_max_add),
        "--max-backfill",
        str(args.promote_max_backfill),
    ]
    print({"run_id": args.run_id, "lane": args.lane, "stage": "promote", "cmd": " ".join(promote_cmd)})
    subprocess.run(promote_cmd, check=True)


if __name__ == "__main__":
    main()
