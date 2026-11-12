"""List (and optionally repair) stored stock briefs whose body opens by describing the coverage.

The check is the same one the brief writer now runs (backend/brief_lead.py):

- ``drop``: the first sentence only describes the coverage, has no figure in it, and the rest of the body
  stands on its own. ``--strip`` removes that sentence from the stored brief.
- ``flag``: anything else that opens on the coverage. Its words are kept; ``--requeue`` marks the stock's
  news-freshness doc ``needs_brief_refresh`` so the next brief run rewrites it with the new prompt.

Dry run by default: nothing is written unless ``--strip`` or ``--requeue`` is passed.

Writes are additive and guarded:

- ``--strip`` merges the new ``body``, ``body_lead_issue: ""``, ``body_lead_dropped`` and a
  ``body_lead_repair`` record (the old body word for word, the body it wrote, when) into the brief, and the same
  brief into the stock page view in one commit. It skips a brief whose stored body changed since this run
  listed it; a brief run landing in the instant between that re-read and the commit is not guarded.
- ``--requeue`` merges ``needs_brief_refresh: true`` and ``brief_refresh_reason`` into existing freshness docs
  only; a stock with no freshness doc is reported, never created. The pre-open and pre-close news runs reset
  ``needs_brief_refresh`` from their own article check, so requeue after those finish and before the brief run
  (after 09:00 ET for the 09:50 ET open briefs, or 15:55 ET for the close briefs).

Read-only from a laptop (LocalDB over HTTPS with LOCALDB_URL and LOCALDB_API_TOKEN):

    python -m backend.scripts.repair_brief_coverage_leads --http --out /tmp/brief-leads.json

On the VPS (LOCALDB_PATH from /etc/tikrr/backend.env; the script refuses to write anywhere else):

    python -m backend.scripts.repair_brief_coverage_leads                      # dry run
    python -m backend.scripts.repair_brief_coverage_leads --strip              # drop pure coverage openers
    python -m backend.scripts.repair_brief_coverage_leads --requeue --limit 80 # rewrite the flagged ones
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from typing import Any

from backend.brief_lead import coverage_lead_pattern, fix_coverage_lead, split_sentences

REFRESH_REASON = "coverage_lead"


def classify(doc: dict[str, Any]) -> dict[str, Any] | None:
    """One row for a brief whose body opens on the coverage, or None when its lead is about the company."""
    body = str(doc.get("body") or "").strip()
    if not body:
        return None
    sentences = split_sentences(body)
    fix = fix_coverage_lead(body)
    if not fix.issue and not fix.dropped:
        return None
    return {
        "instrument_id": str(doc.get("instrument_id") or "").strip().upper(),
        "coverage_type": doc.get("coverage_type"),
        "generated_at": doc.get("generated_at"),
        "pattern": fix.issue or coverage_lead_pattern(sentences[0]) or "",
        "action": "flag" if fix.issue else "drop",
        "first_sentence": sentences[0] if sentences else "",
        "body": body,
        "fixed_body": fix.body,
        "dropped": list(fix.dropped),
    }


def requeue_order(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flagged briefs, worst first: no-news briefs (the page shows no lead at all), then the oldest."""
    flagged = [row for row in rows if row["action"] == "flag"]
    return sorted(
        flagged,
        key=lambda row: (row["coverage_type"] != "on_demand_no_news", str(row["generated_at"] or ""), row["instrument_id"]),
    )


def summarize(rows: list[dict[str, Any]], total: int) -> dict[str, Any]:
    return {
        "briefs": total,
        "coverage_leads": len(rows),
        "by_pattern": dict(Counter(row["pattern"] for row in rows).most_common()),
        "by_action": dict(Counter(row["action"] for row in rows).most_common()),
        "by_coverage_type": dict(Counter(str(row["coverage_type"]) for row in rows).most_common()),
    }


def _load_docs_http(market: str, universe_id: str | None) -> tuple[str, list[dict[str, Any]]]:
    from backend.mail.source import HttpSource

    source = HttpSource()
    universe = universe_id or str((source.get("tm_config/active_universes") or {}).get(f"{market}_universe") or "")
    if not universe:
        raise SystemExit(f"no {market}_universe in tm_config/active_universes; pass --universe")
    rows = source.children(f"tm_news_runs/{market}__{universe}", "stock_intelligence", limit=5000)
    return universe, [data for _, data in rows]


def _load_docs_store(store: Any, market: str, universe_id: str | None) -> tuple[str, list[dict[str, Any]]]:
    universe = universe_id
    if not universe:
        snap = store.db.collection("tm_config").document("active_universes").get()
        universe = str(((snap.to_dict() if snap.exists else None) or {}).get(f"{market}_universe") or "")
    if not universe:
        raise SystemExit(f"no {market}_universe in tm_config/active_universes; pass --universe")
    return universe, store.list_stock_intelligence_docs(market, universe)


def strip_leads(store: Any, market: str, universe: str, rows: list[dict[str, Any]]) -> dict[str, int]:
    from backend.stock_page_view import merge_stock_view_sections

    counts = {"stripped": 0, "changed_since_read": 0, "missing": 0}
    now = datetime.now(timezone.utc).isoformat()
    for row in rows:
        if row["action"] != "drop":
            continue
        instrument_id = row["instrument_id"]
        current = store.get_stock_intelligence_doc(market, universe, instrument_id)
        if not current:
            counts["missing"] += 1
            continue
        if str(current.get("body") or "").strip() != row["body"]:
            counts["changed_since_read"] += 1
            continue
        patch = {
            "body": row["fixed_body"],
            "body_lead_issue": "",
            "body_lead_dropped": row["dropped"],
        }
        # Kept on the brief only. If a later run rewrites the body, `fixed_body` no longer matches `body`, which
        # says this record is history.
        repair = {"previous_body": current.get("body"), "fixed_body": row["fixed_body"], "fixed_at": now}
        ref = store._news_namespace(market, universe).collection("stock_intelligence").document(instrument_id)
        batch = store.db.batch()
        batch.set(ref, {**patch, "body_lead_repair": repair}, merge=True)
        # The stock page reads its own copy of the brief; keep the two the same, in one commit.
        merge_stock_view_sections(store.db, market, instrument_id, {"intelligence": {**current, **patch}}, batch=batch)
        batch.commit()
        counts["stripped"] += 1
    return counts


def requeue(store: Any, market: str, rows: list[dict[str, Any]], *, limit: int) -> dict[str, Any]:
    ordered = requeue_order(rows)
    wanted = [row["instrument_id"] for row in ordered]
    existing = store.get_news_freshness_docs(market, wanted)
    queued = [instrument_id for instrument_id in wanted if instrument_id in existing]
    if limit > 0:
        queued = queued[:limit]
    now = datetime.now(timezone.utc).isoformat()
    store.save_news_freshness_docs([
        {
            "market": market.upper(),
            "instrument_id": instrument_id,
            "needs_brief_refresh": True,
            "brief_refresh_reason": REFRESH_REASON,
            "brief_refresh_requested_at": now,
        }
        for instrument_id in queued
    ])
    return {
        "requeued": len(queued),
        "left_for_a_later_run": max(0, len([i for i in wanted if i in existing]) - len(queued)),
        "no_freshness_doc": sorted(set(wanted) - set(existing)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--market", default="US")
    parser.add_argument("--universe", default=None, help="Defaults to tm_config/active_universes <market>_universe")
    parser.add_argument("--http", action="store_true", help="Read over LOCALDB_URL (read-only; no writes allowed)")
    parser.add_argument("--strip", action="store_true", help="Drop pure coverage openers where the rest stands")
    parser.add_argument("--requeue", action="store_true", help="Queue flagged briefs for the next brief run")
    parser.add_argument(
        "--limit",
        type=int,
        default=80,
        help="With --requeue: queue at most this many (no-news first, then oldest); 0 queues all. The open run "
        "rewrites at most 160 briefs, and requeued ones rank below earnings, big moves and missing briefs.",
    )
    parser.add_argument("--out", default=None, help="Write every affected brief to this JSON file")
    parser.add_argument("--show", type=int, default=12, help="Print this many examples per action")
    args = parser.parse_args()
    market = args.market.upper()

    if args.http and (args.strip or args.requeue):
        raise SystemExit("--http is read-only; run --strip/--requeue on the VPS")
    if not args.http and not os.getenv("LOCALDB_PATH", "").strip():
        # Without it TraceMoneyStore falls back to Firebase, the rollback store.
        raise SystemExit("LOCALDB_PATH is not set: run on the VPS with /etc/tikrr/backend.env, or pass --http")

    store = None
    if args.http:
        universe, docs = _load_docs_http(market, args.universe)
    else:
        from backend.storage import TraceMoneyStore

        store = TraceMoneyStore()
        universe, docs = _load_docs_store(store, market, args.universe)

    rows = [row for row in (classify(doc) for doc in docs) if row]
    rows.sort(key=lambda row: (row["action"], row["pattern"], row["instrument_id"]))
    print(json.dumps({"universe": universe, **summarize(rows, len(docs))}, indent=2))
    for action in ("drop", "flag"):
        sample = [row for row in rows if row["action"] == action][: max(0, args.show)]
        for row in sample:
            print(f"[{action}:{row['pattern']}] {row['instrument_id']}: {row['first_sentence'][:160]}")
            if action == "drop":
                print(f"    -> {row['fixed_body'][:160]}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(rows, handle, indent=1, ensure_ascii=False)
        print(f"wrote {len(rows)} rows to {args.out}")

    if store is None or not (args.strip or args.requeue):
        print("dry run: nothing written")
        return
    if args.strip:
        print({"strip": strip_leads(store, market, universe, rows)})
    if args.requeue:
        print({"requeue": requeue(store, market, rows, limit=args.limit)})


if __name__ == "__main__":
    main()
