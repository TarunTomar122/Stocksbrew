from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import os
import subprocess
import sys
from typing import Any

from backend.instrument_universe import (
    get_coverage_universe_id,
    list_instruments,
)
from backend.market_session_state import MarketSessionState
from backend.morning_brief_selection import (
    DEFAULT_BRIEF_CAP,
    load_recent_earnings,
    load_typical_moves,
    previous_session_lookback_hours,
    select_morning_briefs,
    session_dates_from_prices,
)
from backend.price_pipeline_contract import (
    PriceFreshnessPolicy,
    partition_fresh_price_documents,
)
from backend.scripts.materialize_views import materialize_views
from backend.scripts.run_priority_price_pipeline import _rank_instruments
from backend.search_heat import rank_search_heat_rows
from backend.storage import TraceMoneyStore
from backend.subscription_entitlement import has_current_pro_entitlement

from backend.cloudrun.orchestrator.local_api import LocalJobsClient
from backend.cloudrun.orchestrator.run_api import RunJobsClient
from backend.cloudrun.orchestrator.state import PipelineStateStore, ShardRef


def _utc_run_id(lane: str, market: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{lane}_{market}_{stamp}"


def _chunk(values: list[str], size: int) -> list[list[str]]:
    size = max(1, size)
    if not values:
        return []
    shard_count = (len(values) + size - 1) // size
    base_size, larger_shards = divmod(len(values), shard_count)
    chunks: list[list[str]] = []
    start = 0
    for index in range(shard_count):
        chunk_size = base_size + int(index < larger_shards)
        chunks.append(values[start : start + chunk_size])
        start += chunk_size
    return chunks


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
        if not has_current_pro_entitlement(user):
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


def _ai_brief_ids(
    store: TraceMoneyStore,
    market: str,
    universe_id: str,
    *,
    persist: bool = True,
) -> list[str]:
    """Runtime core plus active-Pro Radar and genuine search demand."""
    ids: list[str] = []
    seen: set[str] = set()
    for instrument in list_instruments(market, universe_id):
        instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
        if instrument_id and instrument_id not in seen:
            seen.add(instrument_id)
            ids.append(instrument_id)
    for instrument_id in _tracked_ids(store, market):
        if instrument_id not in seen:
            seen.add(instrument_id)
            ids.append(instrument_id)
    for instrument_id in _search_heat_ids(store, market, persist=persist):
        if instrument_id not in seen:
            seen.add(instrument_id)
            ids.append(instrument_id)
    return ids


def _fresh_open_brief_ids(
    store: TraceMoneyStore,
    instrument_ids: list[str],
    *,
    market: str,
    session_phase: str,
    max_age_hours: float = 3.0,
) -> list[str]:
    """Drop unavailable quotes before making shards; reject an all-stale run."""
    latest = store.get_latest_prices(instrument_ids)
    fresh, stale = partition_fresh_price_documents(
        latest,
        instrument_ids,
        policy=PriceFreshnessPolicy(
            required_phase=session_phase,
            max_age_hours=max(0.25, max_age_hours),
            market=market,
        ),
    )
    if stale:
        print(
            {
                "stage": "brief_dispatch_price_freshness",
                "expected_phase": session_phase,
                "fresh_count": len(fresh),
                "stale_count": len(stale),
                "stale_ids": stale,
            }
        )
    if not fresh:
        raise RuntimeError(
            f"No prices match required phase {session_phase}; refusing an all-stale brief run"
        )
    return list(fresh)


def _search_heat_ids(
    store: TraceMoneyStore,
    market: str,
    *,
    now: datetime | None = None,
    cap: int = 20,
    persist: bool = True,
) -> list[str]:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    cutoff = (current - timedelta(hours=72)).isoformat()
    valid_ids = _search_heat_valid_ids(store, market)
    docs = (
        store.db.collection("tm_stock_views")
        .where("created_at", ">=", cutoff)
        .select(["instrument_id", "ticker", "market", "uid", "anon_id", "created_at", "updated_at"])
        .stream()
    )
    rows = [doc.to_dict() or {} for doc in docs]
    ranked = rank_search_heat_rows(
        rows,
        market=market,
        valid_ids=valid_ids,
        now=current,
        cap=cap,
    )
    if persist:
        try:
            store.save_search_heat_cohort(market, ranked)
        except Exception:
            # Cohort persistence is observability only; selection remains usable.
            pass
    return [str(row["instrument_id"]) for row in ranked]


def _zone_brief_ids(store: TraceMoneyStore, market: str) -> list[str]:
    """Today's anomaly movers plus Reddit-buzz names (formerly zone-briefs).

    Many of these sit outside the brief cohort, so without this a stock that
    just moved 9% or lit up Reddit could keep a weeks-old brief.
    """
    from backend.scripts.build_zone_briefs import (
        _anomaly_instrument_ids,
        _reddit_instrument_ids,
    )

    ids: list[str] = []
    seen: set[str] = set()
    try:
        anomaly_ids = _anomaly_instrument_ids(store, market)
    except Exception as exc:
        print({"stage": "morning_zone_ids", "source": "anomaly", "error": str(exc)[:200]})
        anomaly_ids = []
    try:
        reddit_ids = _reddit_instrument_ids(
            store,
            market,
            min_mentions=1,
            min_confidence=0.55,
            llm_fallback=False,
        )
    except Exception as exc:
        print({"stage": "morning_zone_ids", "source": "reddit", "error": str(exc)[:200]})
        reddit_ids = []
    for instrument_id in [*anomaly_ids, *reddit_ids]:
        iid = str(instrument_id or "").strip().upper()
        if iid and iid.startswith(f"{market.upper()}_") and iid not in seen:
            seen.add(iid)
            ids.append(iid)
    return ids


def _wait_for_open_anomalies(store: TraceMoneyStore, market: str, timeout_minutes: int) -> bool:
    """Let the opening anomaly reasons land first so briefs can cite them.

    The anomaly run is a sibling of this one (both start when the 09:50 price
    batch succeeds), not a hard dependency: if it is slow or failed, the
    briefs still go out after the timeout, just without today's move reasons.
    """
    if timeout_minutes <= 0:
        return False
    try:
        MarketSessionState(store).wait_for_stages(
            market=market,
            phase="open_check",
            stages=["anomalies"],
            timeout_seconds=timeout_minutes * 60,
            poll_seconds=15,
        )
        return True
    except RuntimeError as exc:
        print({"stage": "morning_brief_anomaly_wait", "status": "timeout", "error": str(exc)[:300]})
        return False


def _select_morning_brief_ids(
    store: TraceMoneyStore,
    *,
    market: str,
    universe_id: str,
    candidate_ids: list[str],
    zone_ids: list[str],
    cap: int,
    now: datetime | None = None,
) -> tuple[list[str], dict[str, Any], int]:
    """Morning rule: changed news + material moves + held earnings + stale zone names."""
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    prices = store.get_latest_prices(candidate_ids)
    held_ids = _tracked_ids(store, market)
    held_set = set(held_ids)
    selection = select_morning_briefs(
        candidate_ids,
        prices=prices,
        freshness=store.get_news_freshness_docs(market, candidate_ids),
        briefs=store.get_stock_intelligence_docs_batch(market, universe_id, candidate_ids),
        typical_moves=load_typical_moves(store, candidate_ids, prices, now=current),
        earnings_by_id=load_recent_earnings(
            store,
            market,
            [iid for iid in candidate_ids if iid in held_set],
            prices,
            now=current,
        ),
        held_ids=held_ids,
        zone_ids=zone_ids,
        now=current,
        cap=cap,
    )
    lookback = previous_session_lookback_hours(session_dates_from_prices(prices), now=current)
    summary = {
        "stage": "morning_brief_selection",
        **selection.summary(sample=max(1, len(candidate_ids))),
        "synthesis_lookback_hours": lookback,
    }
    return selection.selected, summary, lookback


def _search_heat_valid_ids(store: TraceMoneyStore, market: str) -> set[str]:
    """The live catalog, not the checked-in SEO set, defines valid demand."""
    return {
        str(row.get("instrument_id") or "").strip().upper()
        for row in store.list_instruments(market)
        if str(row.get("instrument_id") or "").strip()
        and str(row.get("status") or "active").strip().lower() != "inactive"
    }


def _resolve_universe(store: TraceMoneyStore, market: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    return store.get_active_price_universe(market) or ""


def _lane_universe_id(
    store: TraceMoneyStore,
    market: str,
    lane: str,
    explicit: str | None,
) -> str:
    # Public pre-earnings surfaces should cover the full supported market
    # catalog, not just the active runtime core. Only honor an explicit
    # universe override for that lane.
    if lane == "pre_earnings_intel":
        return str(explicit or "").strip()
    return _resolve_universe(store, market, explicit)


def _brief_base_universe_id(
    market: str,
    configured_universe: str,
    explicit_universe: str | None,
) -> str:
    """Use the small runtime cohort unless a brief run explicitly overrides it."""
    if explicit_universe or market.upper() != "US":
        return configured_universe
    return "us_core_100"


def _price_core_ids(store: TraceMoneyStore, market: str, universe_id: str, limit: int) -> list[str]:
    # `limit` only caps the ranked runtime core. Price-core overrides are the
    # extended high-priority coverage set and must be included for every
    # price-core phase, including intraday.
    coverage_universe_id = get_coverage_universe_id(market) or universe_id
    try:
        ranked = _rank_instruments(store, market, coverage_universe_id, limit)
    except ValueError:
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
    raw_overrides = [
        str(iid or "").strip().upper()
        for iid in store.get_price_core_overrides(market)
        if str(iid or "").strip()
    ]
    valid_override_ids = {
        str(row.get("instrument_id") or "").strip().upper()
        for row in store.list_instruments(market, raw_overrides)
        if str(row.get("instrument_id") or "").strip()
    }
    for iid in raw_overrides:
        if iid not in valid_override_ids:
            continue
        if iid in seen:
            continue
        seen.add(iid)
        ids.append(iid)
    return ids


def _tracked_lane_extra_args(args: argparse.Namespace) -> list[str]:
    extra = [
        "--per-stock-cap",
        str(args.per_stock_cap),
        "--chunk-workers",
        str(args.chunk_workers),
    ]
    if args.lane == "tracked_open_briefs":
        extra.extend(
            [
                "--session-phase",
                str(args.session_phase),
                "--max-workers",
                str(max(1, args.max_workers)),
            ]
        )
    return extra


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
    client: Any,
    state: PipelineStateStore,
    wait_for_completion: bool = False,
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
            pool.submit(
                client.run_job,
                job_name=job_name,
                args=args,
                wait_for_execution_name=wait_for_completion,
            ): (ref, ids)
            for ref, ids, args in plan
        }
        execution_names: dict[str, tuple[ShardRef, list[str]]] = {}
        for future in as_completed(futures):
            ref, ids = futures[future]
            execution_or_operation = future.result()
            state.mark_shard_started(ref, execution_or_operation)
            execution_names[execution_or_operation] = (ref, ids)

        if not wait_for_completion:
            return {
                "lane": lane,
                "market": market,
                "universe_id": universe_id,
                "run_id": run_id,
                "shard_count": len(shards),
                "failed_count": 0,
                "status": "dispatched",
                "results": sorted(
                    [
                        {
                            "shard_id": ref.shard_id,
                            "instrument_count": len(ids),
                            "status": "dispatched",
                            "operation": exec_name,
                        }
                        for exec_name, (ref, ids) in execution_names.items()
                    ],
                    key=lambda item: item["shard_id"],
                ),
            }

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
    client: Any,
    wait_for_completion: bool = False,
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
    exec_name = client.run_job(
        job_name=job_name,
        args=args,
        wait_for_execution_name=wait_for_completion,
    )
    if not wait_for_completion:
        return {
            "lane": lane,
            "market": market,
            "universe_id": universe_id,
            "run_id": run_id,
            "operation": exec_name,
            "status": "dispatched",
        }
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


def price_stage_phase(lane: str, session_phase: str) -> bool:
    """Whether a successful price batch records the session's `price` stage.

    The open and close batches have always gated their anomaly passes. The
    midday mover rebuild (12:30 and 14:30 ET) runs on the intraday lane with
    `mid_check`, and its anomaly pass waits on this stage. The hourly intraday
    batches record it too; nothing else reads the mid_check session record.
    """
    if lane == "price_core_open":
        return session_phase in {"open_check", "mid_check", "post_close"}
    if lane == "price_core_intraday":
        return session_phase == "mid_check"
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Tikrr lane dispatcher")
    parser.add_argument(
        "--lane",
        choices=[
            "tracked_news_prep",
            "tracked_incremental_refresh",
            "price_core_open",
            "tracked_open_briefs",
            "price_core_intraday",
            "open_anomalies",
            "market_discovery",
            "reddit_buzz",
            "zone_briefs",
            "market_events",
            "market_daily",
            "data_health",
            "stock_facts",
            "earnings_intel",
            "pre_earnings_intel",
            "daily_postclose",
            "on_demand_news",
            "stock_requests",
            "sector_regimes",
            "trump_logic",
            "premarket_movers",
            "premarket_intel",
            "premarket_email",
            "premarket_pipeline",
            "open_email",
            "weekly_email",
            "business_questions",
            "newsletter_email",
            "newsletter_pipeline",
            "contrarian_calls",
            "radar_official_sources",
            "radar_materialize",
            "radar_outcomes",
            "radar_alerts",
            "research_themes",
        ],
        required=True,
    )
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--universe", default="")
    parser.add_argument("--project", default=os.getenv("GOOGLE_CLOUD_PROJECT", ""))
    parser.add_argument("--region", default=os.getenv("GOOGLE_CLOUD_REGION", "us-central1"))
    parser.add_argument(
        "--executor",
        choices=["cloudrun", "local"],
        default=os.getenv("TIKRR_JOB_EXECUTOR", "cloudrun"),
    )
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--shard-size", type=int, default=20)
    parser.add_argument("--max-parallel", type=int, default=5)
    parser.add_argument("--session-phase", default="manual")
    parser.add_argument(
        "--price-session-phase",
        choices=["pre_open", "open_check", "mid_check", "close_check", "post_close", "manual"],
        default=None,
    )
    parser.add_argument("--max-workers", type=int, default=6)
    parser.add_argument("--per-stock-cap", type=int, default=5)
    parser.add_argument("--chunk-workers", type=int, default=4)
    parser.add_argument("--on-demand-broad-cap", type=int, default=0)
    parser.add_argument("--query", default="")
    parser.add_argument("--prioritize-query", default="")
    parser.add_argument("--recent-days", type=int, default=3)
    parser.add_argument("--upcoming-days", type=int, default=7)
    parser.add_argument("--max-events", type=int, default=20)
    parser.add_argument("--skip-if-fresh-hours", type=int, default=0)
    parser.add_argument("--reddit-subreddit-batch-size", type=int, default=4)
    parser.add_argument("--reddit-cache-hours", type=int, default=120)
    parser.add_argument("--model", default="")
    parser.add_argument("--refresh-home", action="store_true")
    parser.add_argument("--refresh-watchlists", action="store_true")
    parser.add_argument("--watchlist-with-llm", action="store_true")
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--with-llm", action="store_true")
    parser.add_argument("--include-discovery", action="store_true")
    parser.add_argument("--not-before-minutes-after-open", type=int, default=0)
    parser.add_argument("--newsletter-mode", choices=["morning", "close"], default="morning")
    parser.add_argument("--include-ir", action="store_true")
    parser.add_argument("--wait-for-completion", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--seed-only", action="store_true")
    parser.add_argument(
        "--brief-cap",
        type=int,
        default=DEFAULT_BRIEF_CAP,
        help="Morning (open_check) brief run: most stocks to rewrite; 0 = no cap.",
    )
    parser.add_argument(
        "--anomaly-wait-minutes",
        type=int,
        default=20,
        help="Morning brief run: wait this long for the opening anomaly stage before writing.",
    )
    args = parser.parse_args()

    # Cost guardrails: cap intraday fanout server-side so a stale scheduler payload
    # cannot explode Cloud Run executions/cost.
    if args.lane == "price_core_intraday":
        # Price fetches are one Yahoo multi-symbol download, not per-ticker
        # API calls. Keep the cohort broad and the execution fanout at one.
        intraday_limit_cap = max(1, int(os.getenv("INTRADAY_LIMIT_CAP", "500")))
        intraday_shard_min = max(1, int(os.getenv("INTRADAY_SHARD_SIZE_MIN", "700")))
        intraday_parallel_cap = max(1, int(os.getenv("INTRADAY_MAX_PARALLEL_CAP", "1")))
        args.limit = min(max(1, args.limit), intraday_limit_cap)
        args.shard_size = max(args.shard_size, intraday_shard_min)
        args.max_parallel = min(max(1, args.max_parallel), intraday_parallel_cap)

    if args.executor == "cloudrun" and not args.project:
        raise ValueError("Missing --project (or GOOGLE_CLOUD_PROJECT)")
    if args.executor == "local":
        args.wait_for_completion = True

    store = TraceMoneyStore()
    state = PipelineStateStore(store)
    universe_id = _lane_universe_id(store, args.market, args.lane, args.universe or None)
    if args.lane not in {"pre_earnings_intel", "research_themes"} and not universe_id:
        raise ValueError(f"No active universe configured for {args.market}")
    run_id = args.run_id or _utc_run_id(args.lane, args.market)

    job_name_by_lane = {
        "tracked_news_prep": os.getenv("TRACKED_NEWS_PREP_JOB_NAME", "tikrr-tracked-news-prep"),
        "tracked_incremental_refresh": os.getenv(
            "TRACKED_INCREMENTAL_REFRESH_JOB_NAME", "tikrr-tracked-incremental-refresh"
        ),
        "price_core_open": os.getenv("PRICE_CORE_OPEN_JOB_NAME", "tikrr-price-core-open"),
        "tracked_open_briefs": os.getenv("TRACKED_OPEN_BRIEFS_JOB_NAME", "tikrr-tracked-open-briefs"),
        "price_core_intraday": os.getenv("PRICE_CORE_INTRADAY_JOB_NAME", "tikrr-price-core-intraday"),
        "open_anomalies": os.getenv("OPEN_ANOMALIES_JOB_NAME", "tikrr-open-anomalies"),
        "market_discovery": os.getenv("MARKET_DISCOVERY_JOB_NAME", "tikrr-market-discovery"),
        "reddit_buzz": os.getenv("REDDIT_BUZZ_JOB_NAME", "tikrr-reddit-buzz"),
        "zone_briefs": os.getenv("ZONE_BRIEFS_JOB_NAME", "tikrr-zone-briefs"),
        "market_events": os.getenv("MARKET_EVENTS_JOB_NAME", "tikrr-market-events"),
        "market_daily": os.getenv("MARKET_DAILY_JOB_NAME", "tikrr-market-daily"),
        "data_health": os.getenv("DATA_HEALTH_JOB_NAME", "tikrr-data-health"),
        "stock_facts": os.getenv("STOCK_FACTS_JOB_NAME", "tikrr-stock-facts"),
        "earnings_intel": os.getenv("EARNINGS_INTEL_JOB_NAME", "tikrr-earnings-intel"),
        "pre_earnings_intel": os.getenv(
            "PRE_EARNINGS_INTEL_JOB_NAME", "tikrr-pre-earnings-intel"
        ),
        "daily_postclose": os.getenv("DAILY_POSTCLOSE_JOB_NAME", "tikrr-daily-postclose"),
        "on_demand_news": os.getenv("ON_DEMAND_NEWS_JOB_NAME", "tikrr-on-demand-news"),
        "stock_requests": os.getenv("STOCK_REQUESTS_JOB_NAME", "tikrr-stock-requests"),
        "sector_regimes": os.getenv("SECTOR_REGIMES_JOB_NAME", "tikrr-sector-regimes"),
        "trump_logic": os.getenv("TRUMP_LOGIC_JOB_NAME", "tikrr-trump-logic"),
        "premarket_movers": os.getenv("PREMARKET_MOVERS_JOB_NAME", "tikrr-premarket-movers"),
        "premarket_intel": os.getenv("PREMARKET_INTEL_JOB_NAME", "tikrr-premarket-intel"),
        "premarket_email": os.getenv("PREMARKET_EMAIL_JOB_NAME", "tikrr-premarket-email"),
        "premarket_pipeline": os.getenv("PREMARKET_PIPELINE_JOB_NAME", "tikrr-premarket-pipeline"),
        "open_email": os.getenv("OPEN_EMAIL_JOB_NAME", "tikrr-open-email"),
        "weekly_email": os.getenv("WEEKLY_EMAIL_JOB_NAME", "tikrr-weekly-email"),
        "business_questions": os.getenv("BUSINESS_QUESTIONS_JOB_NAME", "tikrr-business-questions"),
        "newsletter_email": os.getenv("NEWSLETTER_EMAIL_JOB_NAME", "tikrr-newsletter-email"),
        "newsletter_pipeline": os.getenv("NEWSLETTER_PIPELINE_JOB_NAME", "tikrr-newsletter-pipeline"),
        "contrarian_calls": os.getenv("CONTRARIAN_CALLS_JOB_NAME", "tikrr-contrarian-calls"),
        "radar_official_sources": os.getenv(
            "RADAR_OFFICIAL_SOURCES_JOB_NAME", "tikrr-radar-official-sources"
        ),
        "radar_materialize": os.getenv("RADAR_MATERIALIZE_JOB_NAME", "tikrr-radar-materialize"),
        "radar_outcomes": os.getenv("RADAR_OUTCOMES_JOB_NAME", "tikrr-radar-outcomes"),
        "radar_alerts": os.getenv("RADAR_ALERTS_JOB_NAME", "tikrr-radar-alerts"),
        "research_themes": os.getenv("RESEARCH_THEMES_JOB_NAME", "tikrr-research-themes"),
    }
    job_name = job_name_by_lane[args.lane]
    client: Any
    if args.executor == "local":
        client = LocalJobsClient()
    else:
        client = RunJobsClient(project=args.project, region=args.region)

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
            client=client,
            state=state,
            wait_for_completion=args.wait_for_completion,
        )
        should_refresh_home = args.wait_for_completion and (args.refresh_home or args.lane in {"price_core_open", "price_core_intraday"})
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
        # Price-core lanes own prices plus shared home/dashboard materialization.
        # User watchlists are rebuilt by tracked_open_briefs shortly after open,
        # and by post-close/on-demand flows. Rebuilding them here duplicates
        # broad per-user work without adding coverage.
        should_refresh_watchlists = args.refresh_watchlists
        if should_refresh_watchlists:
            summary["watchlist_refresh"] = _refresh_watchlist_views(
                run_id=run_id,
                no_llm=not args.watchlist_with_llm,
                subscribed_only=False,
            )
    elif args.lane in {"tracked_news_prep", "tracked_open_briefs"}:
        brief_base_universe = _brief_base_universe_id(
            args.market,
            universe_id,
            args.universe or None,
        )
        morning = args.lane == "tracked_open_briefs" and args.session_phase == "open_check"
        instrument_ids = _ai_brief_ids(
            store,
            args.market,
            brief_base_universe,
            persist=not args.dry_run,
        )
        morning_extra_args: list[str] = []
        selection_summary: dict[str, Any] = {}
        if morning:
            if not args.dry_run:
                _wait_for_open_anomalies(store, args.market, args.anomaly_wait_minutes)
            zone_ids = _zone_brief_ids(store, args.market)
            known = set(instrument_ids)
            instrument_ids = instrument_ids + [iid for iid in zone_ids if iid not in known]
            try:
                instrument_ids = _fresh_open_brief_ids(
                    store,
                    instrument_ids,
                    market=args.market,
                    session_phase=args.session_phase,
                )
            except RuntimeError:
                # A dry run outside market hours still shows what the rule
                # would pick from the stored quotes; a real run fails closed.
                if not args.dry_run:
                    raise
                print({"stage": "morning_brief_selection", "warning": "no session-fresh prices; dry run uses stored quotes"})
            instrument_ids, selection_summary, lookback_hours = _select_morning_brief_ids(
                store,
                market=args.market,
                universe_id=universe_id,
                candidate_ids=instrument_ids,
                zone_ids=zone_ids,
                cap=args.brief_cap,
            )
            print(selection_summary, flush=True)
            morning_extra_args = [
                "--refresh-mode",
                "selected",
                "--synthesis-lookback-hours",
                str(lookback_hours),
            ]
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
        if args.lane == "tracked_open_briefs" and not morning:
            instrument_ids = _fresh_open_brief_ids(
                store,
                instrument_ids,
                market=args.market,
                session_phase=args.session_phase,
            )
        state.create_run(
            run_id=run_id,
            lane=args.lane,
            market=args.market,
            universe_id=universe_id,
            metadata={
                "per_stock_cap": args.per_stock_cap,
                "chunk_workers": args.chunk_workers,
                "shard_size": args.shard_size,
                **(
                    {
                        "morning_selection": {
                            key: value
                            for key, value in selection_summary.items()
                            if key not in {"stage", "selected_ids", "dropped_ids"}
                        }
                    }
                    if morning
                    else {}
                ),
            },
        )
        tracked_extra_args = _tracked_lane_extra_args(args) + morning_extra_args
        summary = _run_sharded_lane(
            lane=args.lane,
            market=args.market,
            universe_id=universe_id,
            run_id=run_id,
            job_name=job_name,
            instrument_ids=instrument_ids,
            shard_size=args.shard_size,
            extra_args=tracked_extra_args,
            max_parallel=args.max_parallel,
            client=client,
            state=state,
            wait_for_completion=args.wait_for_completion,
        )
        should_refresh_watchlists = (
            args.wait_for_completion
            and int(summary.get("failed_count") or 0) == 0
            and (args.refresh_watchlists or args.lane == "tracked_open_briefs")
        )
        if should_refresh_watchlists:
            summary["watchlist_refresh"] = _refresh_watchlist_views(
                run_id=run_id,
                no_llm=not args.watchlist_with_llm,
                subscribed_only=False,
            )
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
                "--max-workers",
                str(max(1, args.max_workers)),
            ]
        elif args.lane == "stock_requests":
            single_extra_args = ["--limit", str(max(1, args.limit))]
            query = str(args.query or "").strip().upper()
            prioritize = str(args.prioritize_query or "").strip().upper()
            if query:
                single_extra_args.extend(["--query", query])
            if prioritize:
                single_extra_args.extend(["--prioritize-query", prioritize])
        elif args.lane == "earnings_intel":
            single_extra_args = [
                "--recent-days",
                str(max(0, args.recent_days)),
                "--max-events",
                str(max(1, args.max_events)),
            ]
            if str(args.model or "").strip():
                single_extra_args.extend(["--model", str(args.model).strip()])
        elif args.lane == "pre_earnings_intel":
            single_extra_args = [
                "--upcoming-days",
                str(max(1, args.upcoming_days)),
                "--max-events",
                str(max(1, args.max_events)),
            ]
            if str(args.model or "").strip():
                single_extra_args.extend(["--model", str(args.model).strip()])
        elif args.lane == "zone_briefs":
            single_extra_args = [
                "--per-stock-cap",
                str(args.per_stock_cap),
                "--chunk-workers",
                str(args.chunk_workers),
            ]
        elif args.lane == "tracked_incremental_refresh":
            single_extra_args = [
                "--per-stock-cap",
                str(args.per_stock_cap),
                "--chunk-workers",
                str(args.chunk_workers),
            ]
        elif args.lane == "open_anomalies":
            single_extra_args = [
                "--not-before-minutes-after-open",
                str(max(0, args.not_before_minutes_after_open)),
            ]
            if args.price_session_phase:
                single_extra_args.extend(["--price-session-phase", args.price_session_phase])
            if args.include_discovery:
                single_extra_args.append("--include-discovery")
        elif args.lane == "market_events":
            single_extra_args = ["--limit", str(max(1, args.limit))]
            if args.skip_if_fresh_hours > 0:
                single_extra_args.extend(["--skip-if-fresh-hours", str(args.skip_if_fresh_hours)])
        elif args.lane == "market_daily":
            if str(args.model or "").strip():
                single_extra_args = ["--model", str(args.model).strip()]
        elif args.lane == "reddit_buzz":
            single_extra_args = [
                "--subreddit-batch-size",
                str(max(0, args.reddit_subreddit_batch_size)),
                "--cache-hours",
                str(max(1, args.reddit_cache_hours)),
            ]
        elif args.lane == "stock_facts":
            single_extra_args = [
                "--limit",
                str(max(0, args.limit)),
                "--max-workers",
                str(max(1, args.max_workers)),
            ]
        elif args.lane == "business_questions":
            single_extra_args = ["--max-workers", str(max(1, args.max_workers))]
        elif args.lane == "premarket_pipeline":
            single_extra_args = ["--limit", str(max(0, args.limit))]
        elif args.lane == "newsletter_pipeline":
            single_extra_args = [
                "--mode",
                args.newsletter_mode,
                "--limit",
                str(max(0, args.limit)),
            ]
        elif args.lane == "newsletter_email":
            single_extra_args = ["--limit", str(max(0, args.limit))]
        elif args.lane == "radar_official_sources":
            single_extra_args = ["--recent-days", str(max(1, args.recent_days))]
            if args.include_ir:
                single_extra_args.append("--include-ir")
        elif args.lane == "radar_materialize":
            if args.activate:
                single_extra_args.append("--activate")
            if args.with_llm:
                single_extra_args.append("--with-llm")
        elif args.lane == "radar_outcomes":
            single_extra_args = ["--limit", str(max(0, args.limit))]
        elif args.lane == "research_themes":
            single_extra_args = [
                "--min-candidates",
                "8",
                "--max-candidates",
                "12",
            ]
            if args.seed_only:
                single_extra_args.append("--seed-only")

        summary = _run_single_job_lane(
            lane=args.lane,
            market=args.market,
            universe_id=universe_id,
            run_id=run_id,
            job_name=job_name,
            extra_args=single_extra_args,
            client=client,
            wait_for_completion=args.wait_for_completion,
        )

    status = "success"
    if summary.get("status") == "dispatched":
        status = "dispatched"
    if args.lane in {"price_core_open", "price_core_intraday", "tracked_news_prep", "tracked_open_briefs"} and summary.get("failed_count", 0) > 0:
        status = "failed"
    if args.lane in {
        "daily_postclose",
        "tracked_incremental_refresh",
        "open_anomalies",
        "market_discovery",
        "reddit_buzz",
        "zone_briefs",
        "market_events",
        "market_daily",
        "data_health",
        "stock_facts",
        "earnings_intel",
        "pre_earnings_intel",
        "on_demand_news",
        "stock_requests",
        "sector_regimes",
        "trump_logic",
        "premarket_movers",
        "premarket_intel",
        "premarket_email",
        "premarket_pipeline",
        "open_email",
        "weekly_email",
        "business_questions",
        "newsletter_email",
        "newsletter_pipeline",
        "contrarian_calls",
        "radar_official_sources",
        "radar_materialize",
        "radar_outcomes",
        "radar_alerts",
        "research_themes",
    } and summary.get("status") not in {"success", "dispatched"}:
        status = "failed"
    if status == "dispatched":
        state.mark_run_dispatched(run_id=run_id, summary=summary)
    else:
        if status == "success":
            session_state = MarketSessionState(store)
            if price_stage_phase(args.lane, args.session_phase):
                session_state.record_stage(
                    market=args.market,
                    phase=args.session_phase,
                    stage="price",
                    run_id=run_id,
                    metadata={
                        "shard_count": summary.get("shard_count"),
                        "failed_count": summary.get("failed_count"),
                    },
                )
            elif args.lane == "daily_postclose":
                session_state.record_stage(
                    market=args.market,
                    phase="post_close",
                    stage="price",
                    run_id=run_id,
                    metadata={"read_models_complete": True},
                )
            elif args.lane == "tracked_open_briefs" and args.session_phase in {
                "open_check",
                "post_close",
            }:
                session_state.record_stage(
                    market=args.market,
                    phase=args.session_phase,
                    stage="briefs",
                    run_id=run_id,
                    metadata={
                        "shard_count": summary.get("shard_count"),
                        "failed_count": summary.get("failed_count"),
                    },
                )
        state.mark_run_finished(run_id=run_id, status=status, summary=summary)
    print(summary)
    if status not in {"success", "dispatched"}:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
