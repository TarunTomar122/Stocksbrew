"""Keeping the stock page's serving docs honest from the writers' side.

The web app serves each stock page from one small doc, ``tm_serve_stock/{TICKER}``
(lib/serve, docs/serving-docs.md). Most parts prove they are current by
themselves (they carry their source docs' hashes). Three cannot, because their
source is a query or a field that changes all day: ``snapshot`` (the rolling
window in ``tm_latest_prices``), ``calls`` (``tm_directive_history``) and
``news`` (headlines and their tone). Their writers call this module:

* ``mark_dirty`` stamps ``dirty_<part>`` on the stocks they touched, before and
  after the source write. A part built before the stamp is not served; the
  page reads that part the old way until the builder
  (scripts/run-serve-docs.ts) rebuilds it. Stamping after covers a build that
  read the source while the write was landing; stamping before covers every
  part built earlier if the stamp after fails. (A build that reads in between
  plus a failed stamp after leave a stale part until its age limit.)
* ``mark_all_dirty`` stamps ``tm_serve_stock/_all`` when a writer cannot name
  the stocks (a whole-collection replace): every stock's part is stale.
* ``snapshot_part_writes`` lets the price writer refresh its own slice: the
  window rows in the same shape lib/serve/stock-serve-shared.ts stores.

Every hook is best effort: a failed stamp is logged and never fails the
writer, and the stamp before the write keeps the page from serving a part the
write may have made stale. Only ``tm_serve_stock`` is written.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

SERVE_COLLECTION = "tm_serve_stock"
# The doc every stock page also reads: stamps here apply to every stock.
ALL_DOC_ID = "_all"
# lib/serve/stock-serve-shared.ts SERVE_SCHEMA and SERVE_PARTS.snapshot.v; bump them together.
SERVE_SCHEMA = 1
SNAPSHOT_PART_VERSION = 1
DIRTY_PARTS = ("snapshot", "calls", "news")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def serve_doc_id(ticker: Any) -> str | None:
    """The serve doc id for a ticker (upper case), or None for anything that is not one."""
    value = str(ticker or "").strip().upper()
    if not value or "/" in value or len(value) > 24 or value == ALL_DOC_ID.upper():
        return None
    return value


def us_ticker(instrument_id: Any) -> str | None:
    """``US_AAPL`` -> ``AAPL``; None for any other market (serving docs are US only)."""
    value = str(instrument_id or "").strip().upper()
    if not value.startswith("US_"):
        return None
    return serve_doc_id(value[3:])


def dirty_fields(parts: Iterable[str], stamp: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for part in parts:
        if part not in DIRTY_PARTS:
            raise ValueError(f"unknown serving part: {part}")
        fields[f"dirty_{part}"] = stamp
    return fields


def doc_id_for_ticker(ticker: Any) -> str | None:
    """A ticker's serve doc id: the house instrument id rule (BRK.B is US_BRK_B, so BRK_B)."""
    return serve_doc_id(str(ticker or "").strip().upper().replace(".", "_"))


def dirty_writes(tickers: Iterable[Any], parts: Iterable[str], stamp: str | None = None) -> list[tuple[str, dict[str, Any]]]:
    """(path, merge data) pairs that stamp the parts dirty on each ticker's serve doc."""
    fields = dirty_fields(tuple(parts), stamp or now_iso())
    ids = sorted({doc_id for doc_id in (doc_id_for_ticker(ticker) for ticker in tickers) if doc_id})
    return [(f"{SERVE_COLLECTION}/{doc_id}", dict(fields)) for doc_id in ids]


def serving(db: Any) -> bool:
    """Serving docs live in LocalDB only. On a Firebase rollback client the hooks do nothing."""
    return str(type(db).__module__).split(".", 1)[0] not in {"google", "firebase_admin"}


def mark_dirty(db: Any, tickers: Iterable[Any], parts: Iterable[str], *, stamp: str | None = None) -> int:
    """Stamp parts dirty on a Firestore-shaped client (backend/storage.py's ``self.db``). Best effort."""
    writes = dirty_writes(tickers, parts, stamp)
    if not writes or not serving(db):
        return 0
    try:
        for start in range(0, len(writes), 400):
            batch = db.batch()
            for path, data in writes[start : start + 400]:
                collection, doc_id = path.split("/", 1)
                batch.set(db.collection(collection).document(doc_id), data, merge=True)
            batch.commit()
    except Exception as error:  # noqa: BLE001 - a stamp must never fail the writer
        print(f"[serve-docs] dirty stamp failed ({type(error).__name__}); pages read those parts the old way")
        return 0
    return len(writes)


# The stock pages whose parts this process stamped, for refresh_stamped_pages.
_STAMPED_PAGES: set[str] = set()


def mark_dirty_in_store(store: Any, tickers: Iterable[Any], parts: Iterable[str], *, stamp: str | None = None) -> int:
    """The same stamp through backend/agentdata/store.py's DocStore (the agent data jobs). Best effort."""
    tickers = [str(ticker or "").strip().upper() for ticker in tickers]
    writes = dirty_writes(tickers, parts, stamp)
    if not writes:
        return 0
    _STAMPED_PAGES.update(ticker for ticker in tickers if doc_id_for_ticker(ticker))
    try:
        store.set_many(writes, merge=True)
    except Exception as error:  # noqa: BLE001
        print(f"[serve-docs] dirty stamp failed ({type(error).__name__}); pages read those parts the old way")
        return 0
    return len(writes)


def refresh_stamped_pages() -> bool:
    """Drop the cached copies (Varnish and Next) of the stock pages this process stamped, once, after its last write.

    The stamps already keep the serving doc from answering for those parts; without this the cached HTML would
    keep the old headlines until it expires (5 minutes in Varnish). Best effort, through
    backend/scripts/trigger_web_revalidate.py (needs WEB_REVALIDATE_BASE_URL and WEB_REVALIDATE_TOKEN, which
    run-agentdata.sh sets), and a no-op when nothing was stamped.
    """
    symbols = sorted(_STAMPED_PAGES)
    _STAMPED_PAGES.clear()
    if not symbols:
        return False
    try:
        from backend.scripts.trigger_web_revalidate import revalidate_after_write
    except Exception as error:  # noqa: BLE001 - requests missing, say
        print(f"[serve-docs] page refresh unavailable ({type(error).__name__})")
        return False
    return revalidate_after_write([], symbols=symbols)


def mark_all_dirty(db: Any, parts: Iterable[str], *, stamp: str | None = None) -> bool:
    """Stamp parts dirty for every stock at once (a writer that replaced a whole collection). Best effort."""
    fields = dirty_fields(tuple(parts), stamp or now_iso())
    if not serving(db):
        return False
    try:
        db.collection(SERVE_COLLECTION).document(ALL_DOC_ID).set(fields, merge=True)
    except Exception as error:  # noqa: BLE001
        print(f"[serve-docs] dirty stamp failed ({type(error).__name__}); pages read those parts the old way")
        return False
    return True


def headline_stamp(store: Any, chunk: list[tuple[str, dict[str, Any]]]) -> int:
    """Stamp ``news`` dirty for every stock a chunk of headline writes touches: the tags being written and the tags
    the stored docs carry now (a write that drops a tag moves the headline off that stock). Called before and after
    the write, it sees the old tags the first time and the new ones the second. Best effort."""
    docs: list[dict[str, Any]] = [doc for _, doc in chunk]
    try:
        docs.extend(store.get_many([path for path, _ in chunk]).values())
    except Exception as error:  # noqa: BLE001
        print(f"[serve-docs] could not read the stored tags ({type(error).__name__}); stamping the new ones only")
    return mark_dirty_in_store(store, news_tickers(docs), ["news"])


def news_tickers(articles: Iterable[dict[str, Any]]) -> set[str]:
    """Every ticker a batch of headlines names (``stock_tickers``), upper case."""
    out: set[str] = set()
    for article in articles:
        if not isinstance(article, dict):
            continue
        # A retag moves a headline off a stock as well as onto one.
        for ticker in [*(article.get("stock_tickers") or []), *(article.get("stock_tickers_previous") or [])]:
            doc_id = serve_doc_id(ticker)
            if doc_id:
                out.add(doc_id)
    return out


def _number(value: Any) -> float | int | None:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def snapshot_rows(window: Any) -> list[list[Any]]:
    """Each ``history_window`` row as [captured_at, close, P/E], as lib/serve/stock-serve-shared.ts snapshotRows."""
    if not isinstance(window, list):
        return []
    rows: list[list[Any]] = []
    for row in window:
        item = row if isinstance(row, dict) else {}
        quote = item.get("quote") if isinstance(item.get("quote"), dict) else {}
        fundamentals = item.get("fundamentals") if isinstance(item.get("fundamentals"), dict) else {}
        captured_at = item.get("captured_at")
        rows.append([
            captured_at if isinstance(captured_at, str) else None,
            _number(quote.get("current")),
            _number(fundamentals.get("pe_ttm")),
        ])
    return rows


def snapshot_part_write(instrument_id: Any, latest_payload: dict[str, Any], stamp: str) -> tuple[str, dict[str, Any]] | None:
    """The serve doc merge for a price write that changed the window, or None (no window change, not US).

    Writes the part and its dirty stamp with the same time, so the part is current
    from this write until the next one stamps it again.
    """
    ticker = us_ticker(instrument_id)
    window = latest_payload.get("history_window")
    if not ticker or not isinstance(window, list):
        return None
    captured_at = latest_payload.get("captured_at")
    return (
        f"{SERVE_COLLECTION}/{ticker}",
        {
            "schema": SERVE_SCHEMA,
            "ticker": ticker,
            "market": "US",
            "instrument_id": f"US_{ticker}",
            "p_snapshot": {
                "v": SNAPSHOT_PART_VERSION,
                "built_at": stamp,
                "as_of": captured_at if isinstance(captured_at, str) else None,
                "data": {"rows": snapshot_rows(window)},
            },
            "dirty_snapshot": stamp,
        },
    )


def write_merges(db: Any, writes: list[tuple[str, dict[str, Any]]]) -> int:
    """Commit (path, data) merges on a Firestore-shaped client. Best effort, like the stamps."""
    if not writes or not serving(db):
        return 0
    try:
        for start in range(0, len(writes), 200):
            batch = db.batch()
            for path, data in writes[start : start + 200]:
                collection, doc_id = path.split("/", 1)
                batch.set(db.collection(collection).document(doc_id), data, merge=True)
            batch.commit()
    except Exception as error:  # noqa: BLE001
        print(f"[serve-docs] serving part write failed ({type(error).__name__}); pages read it the old way")
        return 0
    return len(writes)
