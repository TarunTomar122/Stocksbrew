"""Process queued per-stock news coverage jobs.

`/api/track` writes one job per newly tracked instrument. This worker does the
expensive part outside the user request: fetch ticker-specific articles,
enrich them, synthesize a source-backed stock intelligence doc, and upsert it
into the active AI namespace.
"""
from __future__ import annotations

import argparse
import logging
import traceback
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from google.cloud import firestore

from backend.instrument_universe import get_instrument
from backend.llm_enrichment import OpenAIArticleEnricher
from backend.news_pipeline import collect_per_ticker_articles
from backend.pipeline_logging import configure_pipeline_logging
from backend.llm_client import LLM_BRIEF_SOURCE
from backend.stock_intelligence import build_stock_intelligence_docs
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)


JOB_COLLECTION = "tm_on_demand_news_jobs"
RETRYABLE_TERMINAL_STATUSES = {"no_articles", "no_brief", "failed"}
RETRY_COOLDOWN_MINUTES = 120
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
    docs = list(store.db.collection(JOB_COLLECTION).stream())
    runnable = []
    now = datetime.now(timezone.utc)
    for doc in docs:
        data = doc.to_dict() or {}
        status = str(data.get("status") or "").strip().lower()
        attempts = int(data.get("attempts") or 0)
        if status in {"queued", "retry"}:
            runnable.append(doc)
            continue
        if status in RETRYABLE_TERMINAL_STATUSES and attempts < MAX_RETRY_ATTEMPTS:
            updated_at = _parse_iso(str(data.get("updated_at") or data.get("finished_at") or ""))
            if not updated_at:
                continue
            age_mins = (now - updated_at).total_seconds() / 60.0
            if age_mins >= RETRY_COOLDOWN_MINUTES:
                runnable.append(doc)
    runnable.sort(key=lambda doc: str((doc.to_dict() or {}).get("requested_at") or ""))
    return runnable[:limit]


def _is_runnable_job(data: dict[str, Any], now: datetime) -> bool:
    status = str(data.get("status") or "").strip().lower()
    attempts = int(data.get("attempts") or 0)
    if status in {"queued", "retry"}:
        return True
    if status not in RETRYABLE_TERMINAL_STATUSES or attempts >= MAX_RETRY_ATTEMPTS:
        return False
    updated_at = _parse_iso(str(data.get("updated_at") or data.get("finished_at") or ""))
    if not updated_at:
        return False
    age_mins = (now - updated_at).total_seconds() / 60.0
    return age_mins >= RETRY_COOLDOWN_MINUTES


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
        tx.set(
            ref,
            {
                "status": "running",
                "attempts": attempts,
                "processing_claim_id": claim_id,
                "started_at": _now(),
                "updated_at": _now(),
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
    ref = job_doc.reference
    job = _claim_job(store, ref, uuid4().hex)
    if not job:
        return "already_claimed"
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
            ref.set({
                "status": "no_articles",
                "article_count": 0,
                "source_health": source_health,
                "finished_at": _now(),
                "updated_at": _now(),
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
            ref.set({
                "status": "no_brief",
                "article_count": len(raw_articles),
                "enrichment_count": len(enriched_articles),
                "finished_at": _now(),
                "updated_at": _now(),
            }, merge=True)
            return "no_brief"

        store.upsert_stock_intelligence_docs(market, universe_id, docs)
        ref.set({
            "status": "complete",
            "article_count": len(raw_articles),
            "enrichment_count": len(enriched_articles),
            "brief_count": len(docs),
            "finished_at": _now(),
            "updated_at": _now(),
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
        ref.set({
            "status": "failed",
            "error": str(exc),
            "traceback": traceback.format_exc()[-4000:],
            "finished_at": _now(),
            "updated_at": _now(),
        }, merge=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Process on-demand news coverage jobs")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--per-stock-cap", type=int, default=6)
    parser.add_argument("--broad-cap", type=int, default=0)
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
    for job in jobs:
        data = job.to_dict() or {}
        instrument_id = data.get("instrument_id") or job.id
        if args.dry_run:
            market = data.get("market") or str(instrument_id).split("_", 1)[0] or "US"
            status = data.get("status") or "queued"
            print(f"  [dry] {job.id} instrument_id={instrument_id} market={market} status={status}")
            continue
        try:
            status = process_job(
                store,
                job,
                per_stock_cap=args.per_stock_cap,
                broad_cap=args.broad_cap,
            )
            logger.info(
                "on_demand_job finished job_id=%s instrument_id=%s status=%s",
                job.id,
                instrument_id,
                status,
            )
            print(f"  [ok] {instrument_id}: {status}")
        except Exception as exc:
            logger.exception(
                "on_demand_job worker error job_id=%s instrument_id=%s err=%s",
                job.id,
                instrument_id,
                exc,
            )
            print(f"  [fail] {instrument_id}: {exc}")


if __name__ == "__main__":
    main()
