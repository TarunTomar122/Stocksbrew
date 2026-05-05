"""Idempotent Trace Money pipeline runner.

Run this as often as needed. It checks the last successful run/output time for
each stage, skips fresh work, and runs downstream stages when their inputs were
refreshed in the current pass.
"""
# flake8: noqa: E501
from __future__ import annotations

import argparse
import logging
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from zoneinfo import ZoneInfo

from backend.instrument_universe import list_instruments
from backend.pipeline_logging import configure_pipeline_logging
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)


DAILY = timedelta(hours=24)
FIVE_DAYS = timedelta(days=5)
STATE_DOC = "master_pipeline_state"
PRICE_PHASES = ("pre_open", "open_check", "mid_check", "close_check", "post_close")
MARKET_CLOCKS = {
    "US": {
        "tz": "America/New_York",
        "open": (9, 30),
        "close": (16, 0),
    },
    "IN": {
        "tz": "Asia/Kolkata",
        "open": (9, 15),
        "close": (15, 30),
    },
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: object) -> datetime | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(raw[:10] + "T12:00:00+00:00")
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _freshest(*values: datetime | None) -> datetime | None:
    present = [value for value in values if value is not None]
    return max(present) if present else None


def _age_label(value: datetime | None, now: datetime) -> str:
    if value is None:
        return "never"
    hours = (now - value).total_seconds() / 3600
    if hours < 48:
        return f"{hours:.1f}h old"
    return f"{hours / 24:.1f}d old"


def _doc_time(doc: dict | None, *fields: str) -> datetime | None:
    if not doc:
        return None
    for field_name in fields:
        parsed = _parse_dt(doc.get(field_name))
        if parsed:
            return parsed
    return None


def _state_time(state: dict, key: str) -> datetime | None:
    stages = state.get("stages") or {}
    if not isinstance(stages, dict):
        return None
    stage = stages.get(key) or {}
    if not isinstance(stage, dict):
        return None
    return _parse_dt(stage.get("completed_at"))


def _phase_state_time(state: dict, market: str, local_date: str, phase: str) -> datetime | None:
    price_phases = state.get("price_phases") or {}
    if not isinstance(price_phases, dict):
        return None
    market_phases = price_phases.get(market) or {}
    if not isinstance(market_phases, dict):
        return None
    date_phases = market_phases.get(local_date) or {}
    if not isinstance(date_phases, dict):
        return None
    return _parse_dt(date_phases.get(phase))


def _load_state(store: TraceMoneyStore) -> dict:
    doc = store.db.collection("tm_config").document(STATE_DOC).get()
    return doc.to_dict() or {} if doc.exists else {}


def _save_stage_success(store: TraceMoneyStore, stage: "Stage", elapsed_s: float) -> None:
    completed_at = _now().isoformat()
    store.db.collection("tm_config").document(STATE_DOC).set({
        "updated_at": completed_at,
        "stages": {
            stage.key: {
                "completed_at": completed_at,
                "elapsed_s": round(elapsed_s, 2),
                "command": " ".join(stage.command),
                "market": stage.market,
            }
        },
    }, merge=True)
    if stage.price_phase and stage.price_phase_date and stage.market:
        store.db.collection("tm_config").document(STATE_DOC).set({
            "updated_at": completed_at,
            "price_phases": {
                stage.market: {
                    stage.price_phase_date: {
                        stage.price_phase: completed_at,
                    }
                }
            },
        }, merge=True)


def _market_doc_time(store: TraceMoneyStore, collection: str, market: str) -> datetime | None:
    doc = store.db.collection(collection).document(market).get()
    return _doc_time(doc.to_dict() if doc.exists else None, "generated_at", "updated_at", "captured_at")


def _dated_doc_time(store: TraceMoneyStore, collection: str, doc_prefix: str, lookback_days: int = 7) -> datetime | None:
    today = _now().date()
    for offset in range(lookback_days):
        date_str = (today - timedelta(days=offset)).isoformat()
        doc = store.db.collection(collection).document(f"{doc_prefix}_{date_str}").get()
        if doc.exists:
            data = doc.to_dict() or {}
            return _doc_time(data, "generated_at", "captured_at", "as_of_date") or _parse_dt(date_str)
    return None


def _first_instrument_id(market: str, universe_id: str) -> str | None:
    try:
        instruments = list_instruments(market, universe_id)
    except Exception:
        return None
    if not instruments:
        return None
    return str(instruments[0].get("instrument_id") or "") or None


def _stock_metrics_time(store: TraceMoneyStore, market: str, universe_id: str) -> datetime | None:
    instrument_id = _first_instrument_id(market, universe_id)
    if not instrument_id:
        return None
    return _doc_time(
        store.get_latest_stock_metrics_snapshot(instrument_id),
        "captured_at",
        "snapshot_date",
    )


def _stock_intel_pro_time(store: TraceMoneyStore, market: str, universe_id: str) -> datetime | None:
    instrument_id = _first_instrument_id(market, universe_id)
    if not instrument_id:
        return None
    return _doc_time(
        store.get_stock_intel_pro(market, universe_id, instrument_id),
        "generated_at",
        "snapshot_date",
    )


def _technicals_time(store: TraceMoneyStore, market: str, universe_id: str) -> datetime | None:
    instrument_id = _first_instrument_id(market, universe_id)
    if not instrument_id:
        return None
    docs = store.get_latest_stock_technicals_batch([instrument_id], lookback_days=7)
    return _doc_time(docs.get(instrument_id), "generated_at", "captured_at", "as_of_date")


def _price_snapshot_time(store: TraceMoneyStore, market: str, universe_id: str) -> datetime | None:
    instrument_id = _first_instrument_id(market, universe_id)
    if not instrument_id:
        return None
    price = store.get_latest_prices([instrument_id]).get(instrument_id)
    return _doc_time(price, "captured_at", "updated_at")


def _local_dt(market: str, now: datetime) -> datetime:
    clock = MARKET_CLOCKS[market]
    return now.astimezone(ZoneInfo(str(clock["tz"])))


def _with_local_time(day: datetime, hour_minute: tuple[int, int]) -> datetime:
    hour, minute = hour_minute
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _auto_price_phase(market: str, now: datetime) -> tuple[str | None, str, str]:
    local_now = _local_dt(market, now)
    local_date = local_now.date().isoformat()
    if local_now.weekday() >= 5:
        return None, local_date, "market weekend"

    clock = MARKET_CLOCKS[market]
    open_at = _with_local_time(local_now, clock["open"])  # type: ignore[arg-type]
    close_at = _with_local_time(local_now, clock["close"])  # type: ignore[arg-type]

    if open_at - timedelta(minutes=45) <= local_now < open_at:
        return "pre_open", local_date, "pre-open window"
    if open_at <= local_now < open_at + timedelta(minutes=20):
        return "open_check", local_date, "market open window"
    if open_at + timedelta(minutes=20) <= local_now < close_at - timedelta(minutes=20):
        return "mid_check", local_date, "market-hours mid-check window"
    if close_at - timedelta(minutes=20) <= local_now < close_at + timedelta(minutes=15):
        return "close_check", local_date, "close window"
    if close_at + timedelta(minutes=15) <= local_now < close_at + timedelta(hours=8):
        return "post_close", local_date, "post-close window"
    return None, local_date, "outside market refresh windows"


@dataclass
class Stage:
    key: str
    label: str
    command: list[str]
    ttl: timedelta
    deps: list[str] = field(default_factory=list)
    market: str | None = None
    freshness: Callable[[TraceMoneyStore], datetime | None] | None = None
    price_phase: str | None = None
    price_phase_date: str | None = None
    phase_note: str | None = None

    def last_success(self, store: TraceMoneyStore, state: dict) -> datetime | None:
        output_time = self.freshness(store) if self.freshness else None
        return _freshest(_state_time(state, self.key), output_time)


def _resolve_universe(store: TraceMoneyStore, market: str, kind: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    if kind == "price":
        active = store.get_active_price_universe(market)
    else:
        active = store.get_active_ai_universe(market)
    return active or ""


def _market_stages(
    store: TraceMoneyStore,
    market: str,
    *,
    price_universe: str,
    ai_universe: str,
    session_phase: str,
    now: datetime,
) -> list[Stage]:
    py = sys.executable
    prefix = [py, "-m", "backend.scripts"]

    def script(name: str, *args: str) -> list[str]:
        return [prefix[0], "-m", f"{prefix[2]}.{name}", *args]

    scrape_workers = "4" if market == "US" else "1"
    scrape_pause = "0.25" if market == "US" else "1.5"

    if session_phase == "auto":
        price_phase, phase_date, phase_note = _auto_price_phase(market, now)
    else:
        price_phase = session_phase
        phase_date = _local_dt(market, now).date().isoformat()
        phase_note = "explicit session phase"
    command_phase = price_phase or "manual"

    stages: list[Stage] = [
        Stage(
            key=f"{market}:sync_price_snapshots",
            label=f"{market} prices ({command_phase})",
            command=script("sync_price_snapshots", "--market", market, "--universe", price_universe, "--session-phase", command_phase),
            ttl=DAILY,
            market=market,
            freshness=lambda s, m=market, u=price_universe: _price_snapshot_time(s, m, u),
            price_phase=price_phase,
            price_phase_date=phase_date,
            phase_note=phase_note,
        ),
        Stage(
            key=f"{market}:sync_stock_metrics",
            label=f"{market} stock metrics",
            command=script(
                "sync_stock_metrics",
                "--market",
                market,
                "--universe",
                price_universe,
                "--max-workers",
                scrape_workers,
                "--pause",
                scrape_pause,
            ),
            ttl=FIVE_DAYS,
            market=market,
            freshness=lambda s, m=market, u=price_universe: _stock_metrics_time(s, m, u),
        ),
        Stage(
            key=f"{market}:sync_sector_benchmarks",
            label=f"{market} sector benchmarks",
            command=script("sync_sector_benchmarks", "--market", market, "--universe", price_universe),
            ttl=FIVE_DAYS,
            market=market,
            freshness=lambda s, m=market: _doc_time(s.get_sector_benchmarks(m), "captured_at", "snapshot_date"),
        ),
    ]

    stages.append(Stage(
        key=f"{market}:sync_stock_facts",
        label=f"{market} stock facts",
        command=script(
            "sync_stock_facts",
            "--market",
            market,
            "--universe",
            price_universe,
            "--max-workers",
            scrape_workers,
            "--pause",
            scrape_pause,
        ),
        ttl=DAILY,
        deps=[f"{market}:sync_price_snapshots"],
        market=market,
    ))

    stages.extend([
        Stage(
            key=f"{market}:build_stock_intel_pro",
            label=f"{market} stock intel pro",
            command=script("build_stock_intel_pro", "--market", market, "--universe", price_universe),
            ttl=FIVE_DAYS,
            deps=[f"{market}:sync_stock_metrics", f"{market}:sync_sector_benchmarks"],
            market=market,
            freshness=lambda s, m=market, u=price_universe: _stock_intel_pro_time(s, m, u),
        ),
        Stage(
            key=f"{market}:build_stock_technicals",
            label=f"{market} technicals",
            command=script("build_stock_technicals", "--market", market, "--universe", price_universe),
            ttl=DAILY,
            deps=[f"{market}:sync_price_snapshots"],
            market=market,
            freshness=lambda s, m=market, u=price_universe: _technicals_time(s, m, u),
        ),
        Stage(
            key=f"{market}:build_market_breadth",
            label=f"{market} market breadth",
            command=script("build_market_breadth", "--market", market, "--universe", price_universe),
            ttl=DAILY,
            deps=[f"{market}:sync_price_snapshots", f"{market}:build_stock_technicals"],
            market=market,
            freshness=lambda s, m=market: _dated_doc_time(s, "tm_market_breadth", m.upper()),
        ),
        Stage(
            key=f"{market}:build_per_stock_intelligence",
            label=f"{market} per-stock AI intelligence",
            command=script(
                "build_per_stock_intelligence",
                "--market",
                market,
                "--universe",
                ai_universe,
                "--paid-only",
                "--upsert",
                "--broad-cap",
                "0",
                "--skip-context",
                "--skip-materialize",
            ),
            ttl=DAILY,
            deps=[f"{market}:build_stock_intel_pro"],
            market=market,
            freshness=lambda s, m=market, u=ai_universe: _doc_time(
                (s.db.collection("tm_news_runs").document(f"{m}__{u}").get().to_dict() or {}),
                "last_stock_intelligence_at",
                "last_enriched_at",
            ),
        ),
        Stage(
            key=f"{market}:build_thematic_screens",
            label=f"{market} thematic screens",
            command=script("build_thematic_screens", "--market", market, "--universe", price_universe),
            ttl=DAILY,
            deps=[f"{market}:sync_price_snapshots", f"{market}:build_stock_intel_pro", f"{market}:build_stock_technicals"],
            market=market,
            freshness=lambda s, m=market: _doc_time(s.get_thematic_screens(m), "generated_at"),
        ),
        Stage(
            key=f"{market}:build_user_alert_flags",
            label=f"{market} user alert flags",
            command=script("build_user_alert_flags", "--market", market, "--universe", price_universe),
            ttl=DAILY,
            deps=[f"{market}:sync_price_snapshots", f"{market}:build_stock_technicals"],
            market=market,
        ),
        Stage(
            key=f"{market}:materialize_views",
            label=f"{market} materialized views",
            command=script("materialize_views", "--market", market, "--universe", price_universe, "--activate"),
            ttl=DAILY,
            deps=[f"{market}:sync_price_snapshots", f"{market}:build_per_stock_intelligence"],
            market=market,
            freshness=lambda s, m=market, u=price_universe: _doc_time(s.get_dashboard_view(m, u), "generated_at"),
        ),
        Stage(
            key=f"{market}:build_snapshot",
            label=f"{market} snapshot archive",
            command=script("build_snapshot", "--market", market),
            ttl=DAILY,
            deps=[f"{market}:materialize_views"],
            market=market,
            freshness=lambda s, m=market: _doc_time(s.get_latest_snapshot(m), "generated_at", "as_of_date"),
        ),
        Stage(
            key=f"{market}:build_heat_list",
            label=f"{market} heat list",
            command=script("build_heat_list", "--market", market, "--ai-universe", ai_universe, "--price-universe", price_universe),
            ttl=DAILY,
            deps=[f"{market}:sync_price_snapshots", f"{market}:build_stock_intel_pro", f"{market}:build_stock_technicals", f"{market}:build_per_stock_intelligence"],
            market=market,
            freshness=lambda s, m=market: _doc_time(s.get_heat_list(m), "generated_at"),
        ),
        Stage(
            key=f"{market}:build_divergence",
            label=f"{market} divergence",
            command=script("build_divergence", "--market", market, "--ai-universe", ai_universe, "--price-universe", price_universe),
            ttl=DAILY,
            deps=[f"{market}:sync_price_snapshots", f"{market}:build_per_stock_intelligence"],
            market=market,
            freshness=lambda s, m=market: _doc_time(s.get_divergence_list(m), "generated_at"),
        ),
        Stage(
            key=f"{market}:build_sentiment_flip",
            label=f"{market} sentiment flip",
            command=script("build_sentiment_flip", "--market", market, "--ai-universe", ai_universe, "--price-universe", price_universe),
            ttl=DAILY,
            deps=[f"{market}:build_per_stock_intelligence"],
            market=market,
            freshness=lambda s, m=market: _doc_time(s.get_sentiment_flip_list(m), "generated_at"),
        ),
    ])
    return stages


def _global_stages() -> list[Stage]:
    return []


def _watchlist_stage(changed_market_keys: list[str]) -> Stage:
    py = sys.executable
    return Stage(
        key="GLOBAL:build_watchlist_views",
        label="watchlist views",
        command=[py, "-m", "backend.scripts.build_watchlist_views"],
        ttl=DAILY,
        deps=changed_market_keys,
    )


def _should_run(stage: Stage, last_success: datetime | None, changed: set[str], now: datetime, force: set[str], state: dict) -> tuple[bool, str]:
    if "all" in force or stage.key in force:
        return True, "forced"
    if stage.key.endswith(":sync_price_snapshots"):
        if not stage.price_phase:
            return False, stage.phase_note or "no active market price phase"
        if stage.price_phase != "manual" and stage.market and stage.price_phase_date:
            completed_at = _phase_state_time(
                state,
                stage.market,
                stage.price_phase_date,
                stage.price_phase,
            )
            if completed_at:
                return False, f"{stage.price_phase} already ran at {completed_at.isoformat()}"
            return True, f"{stage.price_phase} due: {stage.phase_note}"
    price_deps = [
        dep for dep in stage.deps
        if dep.endswith(":sync_price_snapshots")
    ]
    if price_deps and not any(dep in changed for dep in price_deps):
        return False, "waiting for fresh price snapshot"
    triggered_by = [dep for dep in stage.deps if dep in changed]
    if triggered_by:
        return True, "input refreshed: " + ", ".join(triggered_by)
    if last_success is None:
        return True, "no successful output/run found"
    if now - last_success >= stage.ttl:
        return True, f"stale: {_age_label(last_success, now)} >= {stage.ttl}"
    return False, f"fresh: {_age_label(last_success, now)}"


def _run_stage(stage: Stage, *, dry_run: bool, store: TraceMoneyStore, cwd: Path) -> bool:
    print(f"\n==> {stage.label}")
    print("    " + " ".join(stage.command))
    if dry_run:
        logger.info("pipeline stage dry-run key=%s", stage.key)
        return True
    started = time.time()
    logger.info("pipeline stage start key=%s command=%s", stage.key, " ".join(stage.command))
    result = subprocess.run(stage.command, cwd=str(cwd), check=False)
    elapsed = time.time() - started
    if result.returncode != 0:
        cmd = " ".join(stage.command)
        logger.error(
            "pipeline stage failed key=%s returncode=%s elapsed_s=%.2f command=%s",
            stage.key,
            result.returncode,
            elapsed,
            cmd,
        )
        print(f"    failed with exit code {result.returncode}")
        return False
    _save_stage_success(store, stage, elapsed)
    logger.info(
        "pipeline stage ok key=%s elapsed_s=%.2f market=%s",
        stage.key,
        elapsed,
        stage.market or "",
    )
    print(f"    ok in {elapsed:.1f}s")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Run only the stale Trace Money pipeline stages.")
    parser.add_argument("--markets", default="US", help="Comma-separated markets to manage. Default: US")
    parser.add_argument("--dry-run", action="store_true", help="Print the plan without running scripts or writing run state.")
    parser.add_argument("--force", action="append", default=[], help="Force a stage key, or 'all'. Can be repeated.")
    parser.add_argument(
        "--session-phase",
        default="auto",
        choices=["auto", "pre_open", "open_check", "mid_check", "close_check", "post_close", "manual"],
        help="Price snapshot phase. Default auto chooses by market timezone/window.",
    )
    parser.add_argument("--us-price-universe")
    parser.add_argument("--us-ai-universe")
    parser.add_argument("--in-price-universe")
    parser.add_argument("--in-ai-universe")
    args = parser.parse_args()

    configure_pipeline_logging()
    markets = [market.strip().upper() for market in args.markets.split(",") if market.strip()]
    unsupported = sorted(set(markets) - {"US", "IN"})
    if unsupported:
        raise ValueError(f"Unsupported markets: {', '.join(unsupported)}")

    store = TraceMoneyStore()
    state = _load_state(store)
    repo_root = Path(__file__).resolve().parents[2]
    now = _now()
    force = set(args.force)

    logger.info(
        "pipeline start markets=%s session_phase=%s dry_run=%s force=%s",
        ",".join(markets),
        args.session_phase,
        args.dry_run,
        sorted(force) if force else [],
    )

    stages: list[Stage] = _global_stages()
    market_terminal_keys: list[str] = []
    for market in markets:
        price_arg = getattr(args, f"{market.lower()}_price_universe")
        ai_arg = getattr(args, f"{market.lower()}_ai_universe")
        price_universe = _resolve_universe(store, market, "price", price_arg)
        ai_universe = _resolve_universe(store, market, "ai", ai_arg)
        if not price_universe or not ai_universe:
            raise ValueError(f"Could not resolve price/AI universes for {market}")
        logger.info(
            "pipeline market universes market=%s price_universe=%s ai_universe=%s",
            market,
            price_universe,
            ai_universe,
        )
        print(f"{market}: price_universe={price_universe}, ai_universe={ai_universe}")
        stages.extend(_market_stages(
            store,
            market,
            price_universe=price_universe,
            ai_universe=ai_universe,
            session_phase=args.session_phase,
            now=now,
        ))
        market_terminal_keys.append(f"{market}:materialize_views")
        market_terminal_keys.append(f"{market}:build_user_alert_flags")

    stages.append(_watchlist_stage(market_terminal_keys))

    changed: set[str] = set()
    due_count = 0
    skipped_count = 0
    print("\nPipeline plan:")
    for stage in stages:
        last_success = stage.last_success(store, state)
        should_run, reason = _should_run(stage, last_success, changed, now, force, state)
        marker = "RUN " if should_run else "skip"
        print(f"  [{marker}] {stage.key:<38} {reason}")
        if should_run:
            due_count += 1
            logger.info("pipeline run stage key=%s reason=%s", stage.key, reason)
            ok = _run_stage(stage, dry_run=args.dry_run, store=store, cwd=repo_root)
            if not ok:
                logger.error("pipeline aborted after failed stage key=%s", stage.key)
                raise SystemExit(1)
            changed.add(stage.key)
        else:
            skipped_count += 1

    mode = "dry run" if args.dry_run else "run"
    logger.info(
        "pipeline complete mode=%s due=%s skipped=%s",
        mode,
        due_count,
        skipped_count,
    )
    print(f"\n{mode} complete: {due_count} due, {skipped_count} skipped.")


if __name__ == "__main__":
    main()
