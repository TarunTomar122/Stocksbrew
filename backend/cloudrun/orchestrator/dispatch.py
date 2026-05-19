from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import os
import subprocess
import sys
from typing import Any

from backend.instrument_universe import list_instruments
from backend.scripts.materialize_views import materialize_views
from backend.scripts.run_priority_price_pipeline import _rank_instruments
from backend.storage import TraceMoneyStore

from backend.cloudrun.orchestrator.run_api import RunJobsClient
from backend.cloudrun.orchestrator.state import PipelineStateStore, ShardRef


def _utc_run_id(lane: str, market: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{lane}_{market}_{stamp}"


def _chunk(values: list[str], size: int) -> list[list[str]]:
    size = max(1, size)
    return [values[i : i + size] for i in range(0, len(values), size)]


def _successful_execution(payload: dict[str, Any]) -> bool:
    failed = int(payload.get("failedCount") or 0)
    cancelled = int(payload.get("cancelledCount") or 0)
    succeeded = int(payload.get("succeededCount") or 0)
    return failed == 0 and cancelled == 0 and succeeded > 0


def _tracked_ids(store: TraceMoneyStore, market: str) -> list[str]:
    prefix = f"{market.upper()}_"
    seen: set[str] = set()
    out: list[str] = []
    for user in store.list_subscribed_users():
        if not bool(user.get("is_subscribed")):
            continue
        tracked = user.get("tracked_stocks") or []
        if not isinstance(tracked, list):
            continue
        for raw in tracked:
            iid = str(raw or "").strip().upper()
            if not iid or not iid.startswith(prefix) or iid in seen:
                continue
            seen.add(iid)
            out.append(iid)
    return out


def _resolve_universe(store: TraceMoneyStore, market: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    return store.get_active_price_universe(market) or ""


def _price_core_ids(store: TraceMoneyStore, market: str, universe_id: str, limit: int) -> list[str]:
    ranked = _rank_instruments(store, market, universe_id, limit)
    ids: list[str] = []
    seen: set[str] = set()
    for row in ranked:
        iid = str(row.get("instrument_id") or "").strip().upper()
        if not iid:
            continue
        if iid in seen:
            continue
        seen.add(iid)
        ids.append(iid)
    for iid in store.get_price_core_overrides(market):
        if iid in seen:
            continue
        seen.add(iid)
        ids.append(iid)
    return ids


def _run_sharded_lane(
    *,
    lane: str,
    market: str,
    universe_id: str,
    run_id: str,
    job_name: str,
    instrument_ids: list[str],
    shard_size: int,
    extra_args: list[str],
    max_parallel: int,
    client: RunJobsClient,
    state: PipelineStateStore,
) -> dict[str, Any]:
    shards = _chunk(instrument_ids, shard_size)
    stage = "main"
    plan: list[tuple[ShardRef, list[str], list[str]]] = []
    for index, ids in enumerate(shards, start=1):
        shard_id = f"{index:03d}"
        ref = ShardRef(run_id=run_id, lane=lane, stage=stage, shard_id=shard_id)
        args = [
            "-m",
            f"backend.cloudrun.jobs.{lane}_job",
            "--run-id",
            run_id,
            "--lane",
            lane,
            "--market",
            market,
            "--universe",
            universe_id,
            "--shard-id",
            shard_id,
            "--instrument-ids",
            ",".join(ids),
            *extra_args,
        ]
        state.upsert_shard_plan(ref=ref, instrument_ids=ids, task_args=args)
        plan.append((ref, ids, args))

    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(1, max_parallel)) as pool:
        futures = {
            pool.submit(client.run_job, job_name=job_name, args=args): (ref, ids)
            for ref, ids, args in plan
        }
        execution_names: dict[str, tuple[ShardRef, list[str]]] = {}
        for future in as_completed(futures):
            ref, ids = futures[future]
            exec_name = future.result()
            state.mark_shard_started(ref, exec_name)
            execution_names[exec_name] = (ref, ids)

        wait_futures = {
            pool.submit(client.wait_execution, exec_name): (exec_name, ref, ids)
            for exec_name, (ref, ids) in execution_names.items()
        }
        for future in as_completed(wait_futures):
            exec_name, ref, ids = wait_futures[future]
            payload = future.result()
            ok = _successful_execution(payload)
            status = "success" if ok else "failed"
            if ok:
                state.mark_shard_finished(
                    ref,
                    status="success",
                    result={
                        "execution": exec_name,
                        "succeededCount": payload.get("succeededCount"),
                    },
                )
            else:
                state.mark_shard_finished(
                    ref,
                    status="failed",
                    error=f"execution failed: {exec_name}",
                    result={
                        "execution": exec_name,
                        "failedCount": payload.get("failedCount"),
                        "cancelledCount": payload.get("cancelledCount"),
                    },
                )
            results.append(
                {
                    "shard_id": ref.shard_id,
                    "instrument_count": len(ids),
                    "status": status,
                    "execution": exec_name,
                }
            )
    failed = [row for row in results if row["status"] != "success"]
    return {
        "lane": lane,
        "market": market,
        "universe_id": universe_id,
        "run_id": run_id,
        "shard_count": len(shards),
        "failed_count": len(failed),
        "results": sorted(results, key=lambda item: item["shard_id"]),
    }


def _run_single_job_lane(
    *,
    lane: str,
    market: str,
    universe_id: str,
    run_id: str,
    job_name: str,
    extra_args: list[str],
    client: RunJobsClient,
) -> dict[str, Any]:
    args = [
        "-m",
        f"backend.cloudrun.jobs.{lane}_job",
        "--run-id",
        run_id,
        "--lane",
        lane,
        "--market",
        market,
        "--universe",
        universe_id,
        *extra_args,
    ]
    exec_name = client.run_job(job_name=job_name, args=args)
    payload = client.wait_execution(exec_name)
    ok = _successful_execution(payload)
    return {
        "lane": lane,
        "market": market,
        "universe_id": universe_id,
        "run_id": run_id,
        "execution": exec_name,
        "status": "success" if ok else "failed",
    }


def _refresh_watchlist_views(
    *,
    run_id: str,
    no_llm: bool,
    subscribed_only: bool = False,
) -> dict[str, Any]:
    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_watchlist_views",
        "--input-version",
        run_id,
        "--skip-if-version-matches",
    ]
    if no_llm:
        cmd.append("--no-llm")
    if subscribed_only:
        cmd.append("--subscribed-only")
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return {
        "status": "success",
        "cmd": " ".join(cmd),
        "stdout_tail": "\n".join(proc.stdout.strip().splitlines()[-8:]) if proc.stdout else "",
    }


def _send_directive_change_alerts() -> dict[str, Any]:
    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.send_directive_change_alerts",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return {
        "status": "success",
        "cmd": " ".join(cmd),
        "stdout_tail": "\n".join(proc.stdout.strip().splitlines()[-8:]) if proc.stdout else "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Cloud Run lane dispatcher")
    parser.add_argument(
        "--lane",
        choices=[
            "tracked_news_prep",
            "price_core_open",
            "tracked_open_briefs",
            "price_core_intraday",
            "open_anomalies",
            "reddit_buzz",
            "market_open_email",
            "daily_postclose",
            "on_demand_news",
            "stock_requests",
        ],
        required=True,
    )
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--universe", default="")
    parser.add_argument("--project", default=os.getenv("GOOGLE_CLOUD_PROJECT", ""))
    parser.add_argument("--region", default=os.getenv("GOOGLE_CLOUD_REGION", "us-central1"))
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--shard-size", type=int, default=20)
    parser.add_argument("--max-parallel", type=int, default=5)
    parser.add_argument("--session-phase", default="manual")
    parser.add_argument("--max-workers", type=int, default=6)
    parser.add_argument("--per-stock-cap", type=int, default=5)
    parser.add_argument("--chunk-workers", type=int, default=4)
    parser.add_argument("--on-demand-broad-cap", type=int, default=0)
    parser.add_argument("--query", default="")
    parser.add_argument("--refresh-home", action="store_true")
    parser.add_argument("--refresh-watchlists", action="store_true")
    parser.add_argument("--watchlist-with-llm", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.project:
        raise ValueError("Missing --project (or GOOGLE_CLOUD_PROJECT)")

    store = TraceMoneyStore()
    state = PipelineStateStore(store)
    universe_id = _resolve_universe(store, args.market, args.universe or None)
    if not universe_id:
        raise ValueError(f"No active universe configured for {args.market}")
    run_id = args.run_id or _utc_run_id(args.lane, args.market)

    job_name_by_lane = {
        "tracked_news_prep": os.getenv("TRACKED_NEWS_PREP_JOB_NAME", "tikrr-tracked-news-prep"),
        "price_core_open": os.getenv("PRICE_CORE_OPEN_JOB_NAME", "tikrr-price-core-open"),
        "tracked_open_briefs": os.getenv("TRACKED_OPEN_BRIEFS_JOB_NAME", "tikrr-tracked-open-briefs"),
        "price_core_intraday": os.getenv("PRICE_CORE_INTRADAY_JOB_NAME", "tikrr-price-core-intraday"),
        "open_anomalies": os.getenv("OPEN_ANOMALIES_JOB_NAME", "tikrr-open-anomalies"),
        "reddit_buzz": os.getenv("REDDIT_BUZZ_JOB_NAME", "tikrr-reddit-buzz"),
        "market_open_email": os.getenv("MARKET_OPEN_EMAIL_JOB_NAME", "tikrr-market-open-email"),
        "daily_postclose": os.getenv("DAILY_POSTCLOSE_JOB_NAME", "tikrr-daily-postclose"),
        "on_demand_news": os.getenv("ON_DEMAND_NEWS_JOB_NAME", "tikrr-on-demand-news"),
        "stock_requests": os.getenv("STOCK_REQUESTS_JOB_NAME", "tikrr-stock-requests"),
    }
    job_name = job_name_by_lane[args.lane]

    if args.lane in {"price_core_open", "price_core_intraday"}:
        instrument_ids = _price_core_ids(store, args.market, universe_id, args.limit)
        if args.dry_run:
            print(
                {
                    "lane": args.lane,
                    "market": args.market,
                    "universe_id": universe_id,
                    "run_id": run_id,
                    "selected": len(instrument_ids),
                    "shards": len(_chunk(instrument_ids, args.shard_size)),
                }
            )
            return
        state.create_run(
            run_id=run_id,
            lane=args.lane,
            market=args.market,
            universe_id=universe_id,
            metadata={
                "session_phase": args.session_phase,
                "limit": args.limit,
                "shard_size": args.shard_size,
            },
        )
        summary = _run_sharded_lane(
            lane=args.lane,
            market=args.market,
            universe_id=universe_id,
            run_id=run_id,
            job_name=job_name,
            instrument_ids=instrument_ids,
            shard_size=args.shard_size,
            extra_args=[
                "--session-phase",
                args.session_phase,
                "--max-workers",
                str(args.max_workers),
            ],
            max_parallel=args.max_parallel,
            client=RunJobsClient(project=args.project, region=args.region),
            state=state,
        )
        should_refresh_home = args.refresh_home or args.lane in {"price_core_open", "price_core_intraday"}
        if should_refresh_home:
            home_refresh = materialize_views(
                market=args.market,
                universe_id=universe_id,
                instrument_ids=None,
                activate=False,
                allow_missing_context=True,
                skip_sector_scrape=True,
                skip_dashboard=False,
                dashboard_only=True,
                store=store,
            )
            summary["home_refresh"] = home_refresh
        should_refresh_watchlists = args.refresh_watchlists or args.lane in {"price_core_open", "price_core_intraday"}
        if should_refresh_watchlists:
            summary["watchlist_refresh"] = _refresh_watchlist_views(
                run_id=run_id,
                no_llm=not args.watchlist_with_llm,
                subscribed_only=False,
            )
            summary["directive_change_alerts"] = _send_directive_change_alerts()
    elif args.lane in {"tracked_news_prep", "tracked_open_briefs"}:
        instrument_ids = _tracked_ids(store, args.market)
        if args.dry_run:
            print(
                {
                    "lane": args.lane,
                    "market": args.market,
                    "universe_id": universe_id,
                    "run_id": run_id,
                    "selected": len(instrument_ids),
                    "shards": len(_chunk(instrument_ids, args.shard_size)),
                }
            )
            return
        state.create_run(
            run_id=run_id,
            lane=args.lane,
            market=args.market,
            universe_id=universe_id,
            metadata={
                "per_stock_cap": args.per_stock_cap,
                "chunk_workers": args.chunk_workers,
                "shard_size": args.shard_size,
            },
        )
        summary = _run_sharded_lane(
            lane=args.lane,
            market=args.market,
            universe_id=universe_id,
            run_id=run_id,
            job_name=job_name,
            instrument_ids=instrument_ids,
            shard_size=args.shard_size,
            extra_args=[
                "--per-stock-cap",
                str(args.per_stock_cap),
                "--chunk-workers",
                str(args.chunk_workers),
            ],
            max_parallel=args.max_parallel,
            client=RunJobsClient(project=args.project, region=args.region),
            state=state,
        )
        should_refresh_watchlists = args.refresh_watchlists or args.lane == "tracked_open_briefs"
        if should_refresh_watchlists:
            summary["watchlist_refresh"] = _refresh_watchlist_views(
                run_id=run_id,
                no_llm=not args.watchlist_with_llm,
                subscribed_only=False,
            )
            summary["directive_change_alerts"] = _send_directive_change_alerts()
    else:
        if args.dry_run:
            print(
                {
                    "lane": args.lane,
                    "market": args.market,
                    "universe_id": universe_id,
                    "run_id": run_id,
                }
            )
            return
        state.create_run(
            run_id=run_id,
            lane=args.lane,
            market=args.market,
            universe_id=universe_id,
            metadata={},
        )
        single_extra_args: list[str] = []
        if args.lane == "on_demand_news":
            single_extra_args = [
                "--limit",
                str(args.limit),
                "--per-stock-cap",
                str(args.per_stock_cap),
                "--broad-cap",
                str(args.on_demand_broad_cap),
            ]
        elif args.lane == "stock_requests":
            single_extra_args = ["--limit", str(args.limit)]
            query = str(args.query or "").strip().upper()
            if query:
                single_extra_args.extend(["--query", query])
        summary = _run_single_job_lane(
            lane=args.lane,
            market=args.market,
            universe_id=universe_id,
            run_id=run_id,
            job_name=job_name,
            extra_args=single_extra_args,
            client=RunJobsClient(project=args.project, region=args.region),
        )

    status = "success"
    if args.lane in {"price_core_open", "price_core_intraday", "tracked_news_prep", "tracked_open_briefs"} and summary.get("failed_count", 0) > 0:
        status = "failed"
    if args.lane in {"daily_postclose", "open_anomalies", "reddit_buzz", "market_open_email", "on_demand_news", "stock_requests"} and summary.get("status") != "success":
        status = "failed"
    state.mark_run_finished(run_id=run_id, status=status, summary=summary)
    print(summary)
    if status != "success":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
