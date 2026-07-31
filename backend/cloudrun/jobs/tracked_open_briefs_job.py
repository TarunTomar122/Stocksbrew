from __future__ import annotations

import argparse
from datetime import datetime, timezone
import subprocess
import sys

from backend.price_pipeline_contract import (
    PriceFreshnessPolicy,
    partition_fresh_price_documents,
)
from backend.scripts.materialize_views import materialize_views
from backend.storage import TraceMoneyStore


def _parse_ids(value: str) -> list[str]:
    return [item.strip().upper() for item in value.split(",") if item.strip()]


def _fresh_price_ids(
    store: TraceMoneyStore,
    instrument_ids: list[str],
    *,
    market: str,
    session_phase: str,
    max_age_hours: float,
    now: datetime | None = None,
) -> tuple[list[str], list[str]]:
    latest = store.get_latest_prices(instrument_ids)
    fresh, stale = partition_fresh_price_documents(
        latest,
        instrument_ids,
        policy=PriceFreshnessPolicy(
            required_phase=session_phase,
            max_age_hours=max_age_hours,
            market=market,
        ),
        now=now,
    )
    return list(fresh), stale


def _parse_time(value: object) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _stale_news_ids(
    store: TraceMoneyStore,
    instrument_ids: list[str],
    *,
    market: str,
    max_age_minutes: int,
) -> list[str]:
    freshness = store.get_news_freshness_docs(market, instrument_ids)
    cutoff = datetime.now(timezone.utc).timestamp() - (max(1, max_age_minutes) * 60)
    stale: list[str] = []
    for instrument_id in instrument_ids:
        discovered = _parse_time((freshness.get(instrument_id) or {}).get("last_discovery_at"))
        if discovered is None or discovered.timestamp() < cutoff:
            stale.append(instrument_id)
    return stale


def main() -> None:
    parser = argparse.ArgumentParser(description="Tracked open brief synthesis shard worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="tracked_open_briefs")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--shard-id", required=True)
    parser.add_argument("--instrument-ids", required=True)
    parser.add_argument("--session-phase", default="open_check")
    parser.add_argument("--max-workers", type=int, default=4)
    parser.add_argument("--per-stock-cap", type=int, default=4)
    parser.add_argument("--chunk-workers", type=int, default=4)
    parser.add_argument(
        "--max-news-age-minutes",
        type=int,
        default=120,
        help="Fail closed when the source-discovery input is older than this.",
    )
    parser.add_argument(
        "--max-price-age-hours",
        type=float,
        default=3.0,
        help="Exclude latest-price documents that were not written by the current session run.",
    )
    parser.add_argument(
        "--brief-timeout-seconds",
        type=int,
        default=2400,
        help="Hard ceiling for one synthesis shard; allows slow structured responses without killing valid work.",
    )
    args = parser.parse_args()

    ids = _parse_ids(args.instrument_ids)
    if not ids:
        raise ValueError("No instrument ids provided")

    store = TraceMoneyStore()
    fresh_ids, stale_ids = _fresh_price_ids(
        store,
        ids,
        market=args.market,
        session_phase=args.session_phase,
        max_age_hours=max(0.25, args.max_price_age_hours),
    )
    if stale_ids:
        print(
            {
                "stage": "brief_price_freshness",
                "shard_id": args.shard_id,
                "expected_phase": args.session_phase,
                "fresh_count": len(fresh_ids),
                "stale_count": len(stale_ids),
                "stale_ids": stale_ids,
            }
        )
    if not fresh_ids:
        raise RuntimeError(
            f"No prices in shard {args.shard_id} match required phase {args.session_phase}"
        )
    stale_news_ids = _stale_news_ids(
        store,
        fresh_ids,
        market=args.market,
        max_age_minutes=args.max_news_age_minutes,
    )
    if stale_news_ids:
        # A delayed price recovery can push the otherwise-successful pre-open
        # discovery run past its freshness window. Refresh this shard's stale
        # prerequisite before synthesis instead of leaving the sequential
        # chain permanently wedged until tomorrow's timer.
        refresh_cmd = [
            sys.executable,
            "-m",
            "backend.scripts.build_per_stock_intelligence",
            "--market",
            args.market,
            "--universe",
            args.universe,
            "--instrument-ids",
            ",".join(stale_news_ids),
            "--upsert",
            "--incremental",
            "--enrich-only",
            "--per-stock-cap",
            str(args.per_stock_cap),
            "--broad-cap",
            "0",
            "--chunk-size",
            "10",
            "--chunk-workers",
            str(args.chunk_workers),
            "--skip-context",
            "--skip-materialize",
        ]
        print(
            {
                "stage": "refresh_stale_news",
                "shard_id": args.shard_id,
                "instrument_count": len(stale_news_ids),
                "cmd": " ".join(refresh_cmd),
            }
        )
        subprocess.run(refresh_cmd, check=True, timeout=900)
        stale_news_ids = _stale_news_ids(
            store,
            fresh_ids,
            market=args.market,
            max_age_minutes=args.max_news_age_minutes,
        )
        if stale_news_ids:
            raise RuntimeError(
                f"News refresh remained stale for {len(stale_news_ids)}/{len(fresh_ids)} "
                f"brief inputs in shard {args.shard_id}: {','.join(stale_news_ids[:12])}"
            )
    ids_csv = ",".join(fresh_ids)

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_per_stock_intelligence",
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--instrument-ids",
        ids_csv,
        "--upsert",
        "--synthesis-only",
        "--incremental",
        "--include-no-news",
        "--require-complete",
        "--price-trigger-phase",
        args.session_phase,
        "--synthesis-lookback-hours",
        "24",
        "--per-stock-cap",
        str(args.per_stock_cap),
        "--broad-cap",
        "0",
        "--chunk-size",
        "10",
        "--chunk-workers",
        str(args.chunk_workers),
        "--skip-context",
        "--skip-materialize",
    ]
    print({"run_id": args.run_id, "lane": args.lane, "shard_id": args.shard_id, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True, timeout=max(60, args.brief_timeout_seconds))

    materialize_result = materialize_views(
        market=args.market,
        universe_id=args.universe,
        instrument_ids=fresh_ids,
        activate=False,
        allow_missing_context=True,
        skip_sector_scrape=True,
        skip_dashboard=True,
        store=store,
    )

    print({
        "run_id": args.run_id,
        "lane": args.lane,
        "shard_id": args.shard_id,
        "instrument_count": len(fresh_ids),
        "stale_price_count": len(stale_ids),
        "materialize": materialize_result,
    })


if __name__ == "__main__":
    main()
