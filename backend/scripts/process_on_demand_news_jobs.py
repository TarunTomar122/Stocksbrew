"""Process queued per-stock news coverage jobs.

`/api/track` writes one job per newly tracked instrument. This worker does the
expensive part outside the user request: fetch ticker-specific articles,
enrich them, synthesize a source-backed stock intelligence doc, and upsert it
into the active AI namespace.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
import time
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from google.cloud import firestore

from backend.brief_ready_alerts import notify_brief_ready
from backend.instrument_universe import get_instrument
from backend.llm_enrichment import OpenAIArticleEnricher
from backend.news_pipeline import collect_per_ticker_articles
from backend.pipeline_logging import configure_pipeline_logging
from backend.llm_client import (
    LLM_BRIEF_SOURCE,
    begin_llm_usage_collection,
    end_llm_usage_collection,
    summarize_llm_usage,
)
from backend.stock_intelligence import build_stock_intelligence_docs
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)


JOB_COLLECTION = "tm_on_demand_news_jobs"
RETRYABLE_TERMINAL_STATUSES = {"no_articles", "no_brief", "failed"}
RETRY_COOLDOWN_MINUTES = 15
NO_COVERAGE_RETRY_COOLDOWN_MINUTES = 120
RUNNING_STALE_MINUTES = 30
MAX_RETRY_ATTEMPTS = 6


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_doc(doc: dict[str, Any]) -> dict[str, Any]:
    """Make stock_intelligence docs match the app's current AI-tab contract."""
    out = dict(doc)
    out["source"] = LLM_BRIEF_SOURCE
    if not out.get("coverage_type"):
        out["coverage_type"] = "on_demand_news"

    body = " ".join(str(out.get("body") or "").split()).strip()
    thesis = " ".join(str(out.get("thesis") or "").split()).strip()
    catalyst = " ".join(str(out.get("catalyst") or "").split()).strip()
    headline = " ".join(str(out.get("headline") or "").split()).strip()

    out.setdefault("today_brief", body or headline)

    visual = out.get("visual_summary") if isinstance(out.get("visual_summary"), dict) else {}
    catalyst_cards = visual.get("catalyst_cards") if isinstance(visual, dict) else None
    drivers = visual.get("drivers") if isinstance(visual, dict) else None
    risk_cards = visual.get("risk_cards") if isinstance(visual, dict) else None
    if catalyst_cards or drivers or risk_cards:
        out["visual_cards"] = {
            "catalyst_cards": catalyst_cards or [],
            "drivers": drivers or [],
            "risk_cards": risk_cards or [],
        }

    out["visual_summary"] = {
        "what_changed": body or headline,
        "why_it_matters": thesis or body or headline,
        "what_to_watch": catalyst or "Watch whether fresh coverage confirms the move.",
    }
    return out


def _parse_iso(ts: str) -> datetime | None:
    text = str(ts or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:
        return None


def _load_instrument(store: TraceMoneyStore, market: str, instrument_id: str) -> dict[str, Any] | None:
    rows = store.list_instruments(market, [instrument_id])
    if rows:
        return rows[0]
    return get_instrument(instrument_id)


def _queued_jobs(store: TraceMoneyStore, limit: int) -> list[Any]:
    """Read only runnable queue rows instead of scanning the whole catalog."""
    collection = store.db.collection(JOB_COLLECTION)
    now = datetime.now(timezone.utc)
    candidates: dict[str, Any] = {}
    # Backward-compatible lane for jobs queued before runnable_at existed.
    for status in ("queued", "retry"):
        for doc in collection.where("status", "==", status).limit(max(limit * 3, limit)).stream():
            candidates[doc.id] = doc
    # New jobs use one indexed timestamp for queued, retry, and stale-running
    # recovery, keeping empty five-minute polls near zero reads.
    for doc in (
        collection
        .where("runnable_at", "<=", now.isoformat())
        .limit(max(limit * 4, limit))
        .stream()
    ):
        candidates[doc.id] = doc
    runnable = []
    for doc in candidates.values():
        data = doc.to_dict() or {}
        if _is_runnable_job(data, now):
            runnable.append(doc)
    runnable.sort(key=lambda doc: str((doc.to_dict() or {}).get("requested_at") or ""))
    return runnable[:limit]


def _is_runnable_job(data: dict[str, Any], now: datetime) -> bool:
    status = str(data.get("status") or "").strip().lower()
    attempts = int(data.get("attempts") or 0)
    if status in {"queued", "retry"}:
        return True
    if status == "running":
        started_at = _parse_iso(str(data.get("started_at") or data.get("updated_at") or ""))
        if not started_at:
            return False
        return (now - started_at).total_seconds() / 60.0 >= RUNNING_STALE_MINUTES
    if status not in RETRYABLE_TERMINAL_STATUSES or attempts >= MAX_RETRY_ATTEMPTS:
        return False
    updated_at = _parse_iso(str(data.get("updated_at") or data.get("finished_at") or ""))
    if not updated_at:
        return False
    age_mins = (now - updated_at).total_seconds() / 60.0
    cooldown = (
        NO_COVERAGE_RETRY_COOLDOWN_MINUTES
        if status in {"no_articles", "no_brief"}
        else RETRY_COOLDOWN_MINUTES
    )
    return age_mins >= cooldown


def _next_runnable_at(status: str, now: datetime) -> str | Any:
    if status == "complete":
        return firestore.DELETE_FIELD
    minutes = (
        NO_COVERAGE_RETRY_COOLDOWN_MINUTES
        if status in {"no_articles", "no_brief"}
        else RETRY_COOLDOWN_MINUTES
    )
    return (now + timedelta(minutes=minutes)).isoformat()


def _job_metrics(started_monotonic: float, usage_records: list[dict[str, Any]]) -> dict[str, Any]:
    usage = summarize_llm_usage(usage_records)
    return {
        "duration_seconds": round(time.monotonic() - started_monotonic, 3),
        "llm_usage": usage,
        "estimated_monthly_cost_at_public_cap_usd": round(
            float(usage.get("estimated_cost_usd") or 0.0) * 20 * 30,
            4,
        ),
    }


def _claim_job(store: TraceMoneyStore, ref: Any, claim_id: str) -> dict[str, Any] | None:
    """Atomically claim an on-demand job so overlapping scheduler/manual
    executions do not fetch and enrich the same ticker twice."""

    @firestore.transactional
    def _txn(tx: Any) -> dict[str, Any] | None:
        snap = ref.get(transaction=tx)
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        if not _is_runnable_job(data, datetime.now(timezone.utc)):
            return None
        attempts = int(data.get("attempts") or 0) + 1
        claimed_at = datetime.now(timezone.utc)
        queued_at = _parse_iso(str(data.get("queued_at") or data.get("requested_at") or ""))
        tx.set(
            ref,
            {
                "status": "running",
                "attempts": attempts,
                "processing_claim_id": claim_id,
                "started_at": claimed_at.isoformat(),
                "updated_at": claimed_at.isoformat(),
                "runnable_at": (
                    claimed_at + timedelta(minutes=RUNNING_STALE_MINUTES)
                ).isoformat(),
                "queue_latency_seconds": (
                    round(max(0.0, (claimed_at - queued_at).total_seconds()), 3)
                    if queued_at
                    else None
                ),
                "error": "",
            },
            merge=True,
        )
        data["attempts"] = attempts
        return data

    return _txn(store.db.transaction())


def process_job(
    store: TraceMoneyStore,
    job_doc: Any,
    *,
    per_stock_cap: int,
    broad_cap: int,
) -> str:
    started_monotonic = time.monotonic()
    ref = job_doc.reference
    job = _claim_job(store, ref, uuid4().hex)
    if not job:
        return "already_claimed"
    usage_records, usage_token = begin_llm_usage_collection()
    instrument_id = str(job.get("instrument_id") or job_doc.id).strip()
    market = str(job.get("market") or instrument_id.split("_", 1)[0] or "US").upper()
    universe_id = str(job.get("universe_id") or store.get_active_ai_universe(market) or "").strip()
    attempts = int(job.get("attempts") or 1)
    run_per_stock_cap = per_stock_cap
    run_broad_cap = broad_cap
    if attempts >= 2:
        run_per_stock_cap = max(run_per_stock_cap, 10)
        run_broad_cap = max(run_broad_cap, 30)

    logger.info(
        "on_demand_job start job_id=%s instrument_id=%s market=%s universe=%s attempt=%s",
        job_doc.id,
        instrument_id,
        market,
        universe_id,
        attempts,
    )

    try:
        if market not in {"US", "IN"}:
            raise ValueError(f"Unsupported market {market!r}")
        if not universe_id:
            raise ValueError(f"No active AI universe for {market}")

        instrument = _load_instrument(store, market, instrument_id)
        if not instrument:
            raise ValueError(f"No instrument found for {instrument_id}")

        raw_articles, source_health = collect_per_ticker_articles(
            market=market,
            universe_id=universe_id,
            per_stock_cap=run_per_stock_cap,
            broad_cap=run_broad_cap,
            instruments_override=[instrument],
        )
        raw_payload = [article.to_dict() for article in raw_articles]
        store.upsert_news_articles(market, universe_id, raw_payload, source_health=source_health)

        if not raw_articles:
            finished = datetime.now(timezone.utc)
            ref.set({
                "status": "no_articles",
                "article_count": 0,
                "source_health": source_health,
                **_job_metrics(started_monotonic, usage_records),
                "finished_at": finished.isoformat(),
                "updated_at": finished.isoformat(),
                "runnable_at": _next_runnable_at("no_articles", finished),
            }, merge=True)
            return "no_articles"

        enriched_articles = OpenAIArticleEnricher(store=store).enrich_articles(raw_articles)
        enriched_payload = [article.to_dict() for article in enriched_articles]
        store.upsert_article_enrichments(market, universe_id, enriched_payload)

        docs = build_stock_intelligence_docs(
            market,
            universe_id,
            [instrument],
            enriched_articles,
            store=store,
            include_options_digest=True,
        )
        docs = [_normalize_doc(doc) for doc in docs if doc.get("instrument_id") == instrument_id]

        if not docs:
            finished = datetime.now(timezone.utc)
            ref.set({
                "status": "no_brief",
                "article_count": len(raw_articles),
                "enrichment_count": len(enriched_articles),
                **_job_metrics(started_monotonic, usage_records),
                "finished_at": finished.isoformat(),
                "updated_at": finished.isoformat(),
                "runnable_at": _next_runnable_at("no_brief", finished),
            }, merge=True)
            return "no_brief"

        store.upsert_stock_intelligence_docs(market, universe_id, docs)
        try:
            notify_brief_ready(
                store,
                instrument_id=instrument_id,
                ticker=str(instrument.get("ticker") or ""),
                headline=docs[0].get("headline") if docs else None,
            )
        except Exception:
            logger.exception("brief_ready notification failed job_id=%s instrument_id=%s", job_doc.id, instrument_id)
        finished = datetime.now(timezone.utc)
        ref.set({
            "status": "complete",
            "article_count": len(raw_articles),
            "enrichment_count": len(enriched_articles),
            "brief_count": len(docs),
            **_job_metrics(started_monotonic, usage_records),
            "finished_at": finished.isoformat(),
            "updated_at": finished.isoformat(),
            "runnable_at": _next_runnable_at("complete", finished),
        }, merge=True)
        return "complete"
    except Exception as exc:
        logger.exception(
            "on_demand_job failed job_id=%s instrument_id=%s market=%s universe=%s",
            job_doc.id,
            instrument_id,
            market,
            universe_id,
        )
        finished = datetime.now(timezone.utc)
        ref.set({
            "status": "failed",
            "error": str(exc),
            "traceback": traceback.format_exc()[-4000:],
            **_job_metrics(started_monotonic, usage_records),
            "finished_at": finished.isoformat(),
            "updated_at": finished.isoformat(),
            "runnable_at": _next_runnable_at("failed", finished),
        }, merge=True)
        raise
    finally:
        end_llm_usage_collection(usage_token)


def main() -> None:
    parser = argparse.ArgumentParser(description="Process on-demand news coverage jobs")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--per-stock-cap", type=int, default=6)
    parser.add_argument("--broad-cap", type=int, default=0)
    parser.add_argument("--max-workers", type=int, default=2)
    parser.add_argument("--dry-run", action="store_true", help="List runnable jobs without claiming or processing them")
    args = parser.parse_args()

    configure_pipeline_logging()

    store = TraceMoneyStore()
    jobs = _queued_jobs(store, args.limit)
    if not jobs:
        logger.info("on_demand_job queue empty")
        print("No on-demand news jobs queued.")
        return

    logger.info("on_demand_job batch size=%s", len(jobs))
    if args.dry_run:
        for job in jobs:
            data = job.to_dict() or {}
            instrument_id = data.get("instrument_id") or job.id
            market = data.get("market") or str(instrument_id).split("_", 1)[0] or "US"
            status = data.get("status") or "queued"
            print(f"  [dry] {job.id} instrument_id={instrument_id} market={market} status={status}")
        return

    batch_started = time.monotonic()
    results: list[tuple[str, str]] = []
    failures: list[tuple[str, Exception]] = []

    def run_one(job: Any) -> tuple[str, str]:
        data = job.to_dict() or {}
        instrument_id = str(data.get("instrument_id") or job.id)
        status = process_job(
            store,
            job,
            per_stock_cap=args.per_stock_cap,
            broad_cap=args.broad_cap,
        )
        return instrument_id, status

    with ThreadPoolExecutor(max_workers=max(1, min(args.max_workers, len(jobs)))) as executor:
        futures = {executor.submit(run_one, job): job for job in jobs}
        for future in as_completed(futures):
            job = futures[future]
            data = job.to_dict() or {}
            instrument_id = str(data.get("instrument_id") or job.id)
            try:
                resolved_id, status = future.result()
                results.append((resolved_id, status))
                logger.info(
                    "on_demand_job finished job_id=%s instrument_id=%s status=%s",
                    job.id,
                    resolved_id,
                    status,
                )
                print(f"  [ok] {resolved_id}: {status}")
            except Exception as exc:
                failures.append((instrument_id, exc))
                logger.exception(
                    "on_demand_job worker error job_id=%s instrument_id=%s err=%s",
                    job.id,
                    instrument_id,
                    exc,
                )
                print(f"  [fail] {instrument_id}: {exc}")

    status_counts: dict[str, int] = {}
    for _, status in results:
        status_counts[status] = status_counts.get(status, 0) + 1
    usage_totals = {
        "calls": 0,
        "cache_hits": 0,
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "estimated_cost_usd": 0.0,
        "cost_complete": True,
    }
    for job in jobs:
        fresh = job.reference.get().to_dict() or {}
        usage = fresh.get("llm_usage") if isinstance(fresh.get("llm_usage"), dict) else {}
        for key in ("calls", "cache_hits", "input_tokens", "cached_input_tokens", "output_tokens"):
            usage_totals[key] += int(usage.get(key) or 0)
        usage_totals["estimated_cost_usd"] += float(usage.get("estimated_cost_usd") or 0.0)
        usage_totals["cost_complete"] = bool(
            usage_totals["cost_complete"] and usage.get("cost_complete", True)
        )
    usage_totals["estimated_cost_usd"] = round(usage_totals["estimated_cost_usd"], 8)
    completed_jobs = max(1, status_counts.get("complete", 0))
    cost_per_completed_job = usage_totals["estimated_cost_usd"] / completed_jobs
    store.db.collection("tm_pipeline_metrics").document("on_demand_news_latest").set(
        {
            "job_count": len(jobs),
            "success_count": len(results),
            "failure_count": len(failures),
            "status_counts": status_counts,
            "max_workers": max(1, args.max_workers),
            "elapsed_seconds": round(time.monotonic() - batch_started, 3),
            "llm_usage": usage_totals,
            "estimated_cost_per_completed_job_usd": round(cost_per_completed_job, 8),
            "estimated_monthly_cost_at_public_cap_usd": round(
                cost_per_completed_job * 20 * 30,
                4,
            ),
            "updated_at": _now(),
        },
        merge=True,
    )

    if failures:
        raise RuntimeError(f"{len(failures)} on-demand research job(s) failed")


if __name__ == "__main__":
    main()
