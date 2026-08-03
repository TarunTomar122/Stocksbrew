"""Build, validate, compare, and publish Market Daily editions."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from typing import Any
from zoneinfo import ZoneInfo

from backend.market_daily import (
    DEFAULT_WRITER_MODEL,
    article_document,
    build_evidence_pack,
    build_market_tape,
    generate_validated_article,
    latest_market_days,
    save_article,
)
from backend.scripts.trigger_web_revalidate import trigger_web_revalidate
from backend.storage import TraceMoneyStore


def _summary(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "edition_date": document.get("edition_date"),
        "status": document.get("status"),
        "headline": document.get("headline"),
        "model": document.get("model"),
        "quality": document.get("quality"),
        "source_count": len(document.get("sources") or []),
        "evidence_hash": document.get("evidence_hash"),
        "skip_reason": document.get("skip_reason"),
    }


def _run_one(
    store: TraceMoneyStore,
    *,
    edition_date: str,
    model: str,
    publish: bool,
    save_draft: bool,
    with_research: bool,
) -> dict[str, Any]:
    if publish:
        existing = store.get_market_daily("US", edition_date)
        if existing:
            return {**existing, "skip_reason": "already_published"}

    tape = build_market_tape(edition_date)
    if publish:
        latest = store.get_market_daily("US")
        if (
            latest
            and latest.get("edition_date") != edition_date
            and latest.get("previous_session_date") == tape.get("previous_session_date")
        ):
            return {
                "edition_date": edition_date,
                "status": "skipped",
                "skip_reason": "no_new_market_session",
                "previous_session_date": tape.get("previous_session_date"),
            }

    evidence = build_evidence_pack(
        store,
        edition_date=edition_date,
        with_research=with_research,
        tape=tape,
    )
    article, validation = generate_validated_article(evidence, model=model)
    document = article_document(
        article=article,
        evidence=evidence,
        validation=validation,
        status="published" if publish and validation.passed else "draft",
    )
    if publish:
        if not validation.passed:
            raise RuntimeError(
                f"Market Daily {edition_date} failed closed: "
                + "; ".join(validation.blockers)
            )
        save_article(store, document)
        trigger_web_revalidate(
            [
                "/market-daily",
                f"/market-daily/{edition_date}",
                "/sitemap.xml",
                "/feed.xml",
                "/llms.txt",
            ],
            force=True,
            notify_indexnow=True,
        )
    elif save_draft:
        store.save_market_daily_draft(document)
    return document


def _promote_draft(store: TraceMoneyStore, edition_date: str) -> dict[str, Any]:
    document = store.get_market_daily_draft("US", edition_date)
    if not document:
        raise RuntimeError(f"No saved Market Daily draft for {edition_date}")
    if not bool((document.get("quality") or {}).get("passed")):
        raise RuntimeError(f"Saved Market Daily draft for {edition_date} did not pass")
    now = datetime.now(timezone.utc).isoformat()
    document.update(
        {
            "status": "published",
            "published_at": now,
            "updated_at": now,
        }
    )
    save_article(store, document)
    trigger_web_revalidate(
        [
            "/market-daily",
            f"/market-daily/{edition_date}",
            "/sitemap.xml",
            "/feed.xml",
            "/llms.txt",
        ],
        force=True,
        notify_indexnow=True,
    )
    return document


def main() -> None:
    parser = argparse.ArgumentParser(description="Evidence-first Market Daily publisher")
    parser.add_argument("--edition-date", default="")
    parser.add_argument("--backfill-days", type=int, default=0)
    parser.add_argument("--model", default=DEFAULT_WRITER_MODEL)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--save-draft", action="store_true")
    parser.add_argument("--promote-draft", action="store_true")
    parser.add_argument("--show-content", action="store_true")
    parser.add_argument("--skip-research", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    if args.promote_draft:
        if not args.edition_date:
            parser.error("--promote-draft requires --edition-date")
        document = _promote_draft(store, args.edition_date)
        print(json.dumps(_summary(document), indent=2), flush=True)
        return
    today_et = datetime.now(ZoneInfo("America/New_York")).date()
    dates = (
        latest_market_days(args.backfill_days, reference=today_et)
        if args.backfill_days > 0
        else [args.edition_date or today_et.isoformat()]
    )

    results: list[dict[str, Any]] = []
    for edition_date in dates:
        document = _run_one(
            store,
            edition_date=edition_date,
            model=args.model,
            publish=args.publish,
            save_draft=args.save_draft,
            with_research=not args.skip_research,
        )
        results.append(_summary(document))
        print(json.dumps(_summary(document), indent=2), flush=True)
        if args.show_content:
            print("\n# " + str(document.get("headline") or ""), flush=True)
            print("\n" + str(document.get("dek") or ""), flush=True)
            print("\n" + str(document.get("article_markdown") or ""), flush=True)

    print(
        json.dumps(
            {
                "status": "success",
                "published": args.publish,
                "edition_count": len(results),
                "results": results,
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
