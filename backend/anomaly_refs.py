"""Small copies of the explained-moves docs, for pages that only list which stocks moved and why.

``tm_daily_anomalies/{MARKET}__latest`` and ``{MARKET}__{YYYY-MM-DD}`` hold every mover row with its full research
(evidence, why it matters, scores...), ~70 KB a day. The landing and the agent replays only need, per confirmed
move, the ticker, the move, the reason's headline and when each was measured (lib/seo/family-data.ts
readRecentMoves). Next to each doc the writers put ``tm_daily_anomaly_refs/{same id}``:

    {mr_v, mr_src: <store hash of the source doc>, mr_date: <its date>, mr_rows: [<verified rows, projected>]}

A row is kept only when its ``narrative_status`` is "verified" (the first test of lib/seo/families.ts
isConfirmedMove) and carries exactly the fields that test and ``toMove`` read for a MoveRef, untouched (the sources
cut to one that is sure to pass, see ``_project_evidence``), so the page runs its own rules on the copy and gets the
same answer. The reader uses the copy only while ``mr_src`` is still the
source doc's hash, and reads the source docs otherwise.

``python3 -m backend.anomaly_refs`` writes the copies for every source doc whose copy is missing or old (dated docs
of the last 90 days and the latest feed). Additive: it writes only ``tm_daily_anomaly_refs``.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from typing import Any

SOURCE_COLLECTION = "tm_daily_anomalies"
REFS_COLLECTION = "tm_daily_anomaly_refs"
# Bump with lib/anomaly-refs.ts ANOMALY_REFS_VERSION when the projection changes.
REFS_VERSION = 1
# lib/seo/families.ts MOVE_SITEMAP_DAYS: the furthest back a reader looks.
BACKFILL_DAYS = 90

_ROW_FIELDS = ("ticker", "name", "day_change_pct", "narrative_status", "narrative_as_of", "price_as_of")
_EXPLANATION_FIELDS = ("headline", "confidence", "cause_type", "external_source")


def _surely_linkable(item: Any) -> bool:
    """Whether lib/seo/families.ts moveSources is certain to keep this source: a title with a letter or digit in it
    (non-empty however JavaScript trims it) and a link that starts with http:// or https:// (nothing to trim before it).
    """
    if not isinstance(item, dict):
        return False
    title, url = item.get("title"), item.get("url")
    return (
        isinstance(title, str)
        and any(char.isascii() and char.isalnum() for char in title)
        and isinstance(url, str)
        and url.startswith(("http://", "https://"))
    )


def _project_evidence(evidence: Any) -> Any:
    """The sources as the copy keeps them. A move reference only asks whether one source can be linked, so the first
    source that surely can stands for all of them; when none surely can, every source is kept (title and link only)
    and the page's own test decides. Anything that is not a list is kept as it is.
    """
    if not isinstance(evidence, list):
        return evidence
    for item in evidence:
        if _surely_linkable(item):
            return [{"title": item["title"], "url": item["url"]}]
    return [{key: item[key] for key in ("title", "url") if key in item} if isinstance(item, dict) else item for item in evidence]


def _project_row(row: dict[str, Any]) -> dict[str, Any]:
    out = {key: row[key] for key in _ROW_FIELDS if key in row}
    explanation = row.get("move_explanation")
    if "move_explanation" in row:
        if isinstance(explanation, dict):
            kept: dict[str, Any] = {key: explanation[key] for key in _EXPLANATION_FIELDS if key in explanation}
            if "evidence" in explanation:
                kept["evidence"] = _project_evidence(explanation["evidence"])
            out["move_explanation"] = kept
        else:
            out["move_explanation"] = explanation
    return out


def refs_doc(path: str, data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """The copy of the source doc ``data`` stored at ``path``, as (copy path, copy data)."""
    from backend.localdb.codec import stable_document_hash

    rows = data.get("anomalies")
    kept = [
        _project_row(row)
        for row in (rows if isinstance(rows, list) else [])
        if isinstance(row, dict) and row.get("narrative_status") == "verified"
    ]
    return (
        f"{REFS_COLLECTION}/{path.split('/', 1)[1]}",
        {"mr_v": REFS_VERSION, "mr_src": stable_document_hash(path, data), "mr_date": data.get("date"), "mr_rows": kept},
    )


def write_refs(db: Any, path: str, data: dict[str, Any]) -> None:
    """Write the copy of a source doc just written with ``db`` (a Firestore-shaped client). Never raises.

    Only on the LocalDB store, whose hashes the reader checks; on a Firebase client the reader never uses a copy.
    A copy that fails to land is caught by its hash, and the page reads the source doc.
    """
    try:
        from backend.localdb.firestore import LocalFirestoreClient

        if not isinstance(db, LocalFirestoreClient):
            return
        refs_path, refs = refs_doc(path, data)
        db.document(refs_path).set(refs)
    except Exception as error:  # the source doc is written; a missing copy only costs the page a bigger read
        print(f"[anomaly_refs] copy of {path} not written: {type(error).__name__}: {str(error)[:160]}", flush=True)


def backfill(store: Any, *, market: str = "US", days: int = BACKFILL_DAYS, dry_run: bool = False, force: bool = False) -> dict[str, int]:
    """Write the copies that are missing or old, for the dated docs of the last ``days`` days and the latest feed.

    ``store`` is a ``backend.agentdata.store.DocStore``. Each copy is cut from the body and hash of one read, so it
    names exactly the version it was cut from.
    """
    today = datetime.now(timezone.utc).date()
    ids = [f"{market}__latest"] + [f"{market}__{(today - timedelta(days=offset)).isoformat()}" for offset in range(days + 1)]
    paths = [f"{SOURCE_COLLECTION}/{doc_id}" for doc_id in ids]
    hashes = store.read_with_hashes(paths, [])
    copy_path = lambda path: f"{REFS_COLLECTION}/{path.split('/', 1)[1]}"  # noqa: E731
    held = store.read_with_hashes([copy_path(path) for path in hashes], ["mr_v", "mr_src"])

    def current(path: str) -> bool:
        copy = (held.get(copy_path(path)) or {}).get("data") or {}
        return copy.get("mr_v") == REFS_VERSION and copy.get("mr_src") == hashes[path].get("hash")

    todo = [path for path in hashes if force or not current(path)]
    writes: list[tuple[str, dict[str, Any]]] = []
    mismatched = 0
    for start in range(0, len(todo), 10):
        for path, row in store.read_with_hashes(todo[start : start + 10]).items():
            refs_path, refs = refs_doc(path, row["data"])
            # The store's own hash of the body just read; the local hash of the read-back body can differ when the
            # doc holds typed values (timestamps come back as strings), and the store's is the one the page checks.
            if refs["mr_src"] != row.get("hash"):
                mismatched += 1
            refs["mr_src"] = row.get("hash")
            writes.append((refs_path, refs))
    if writes and not dry_run:
        store.set_many(writes)
    return {"sources": len(hashes), "written": 0 if dry_run else len(writes), "would_write": len(writes), "local_hash_differs": mismatched}


def main() -> int:
    parser = argparse.ArgumentParser(description="Write the small copies of the explained-moves docs")
    parser.add_argument("--market", default="US")
    parser.add_argument("--days", type=int, default=BACKFILL_DAYS)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="rewrite every copy, current or not")
    args = parser.parse_args()
    from backend.agentdata.store import DocStore

    print(backfill(DocStore.from_env(), market=args.market, days=args.days, dry_run=args.dry_run, force=args.force), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
