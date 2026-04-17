from __future__ import annotations

from backend.storage import TraceMoneyStore


def _delete_collection_docs(store: TraceMoneyStore, collection: str, keep_ids: set[str]) -> int:
    deleted = 0
    docs = list(store.db.collection(collection).stream())
    for doc in docs:
        if doc.id in keep_ids:
            continue
        doc.reference.delete()
        deleted += 1
    return deleted


def main() -> None:
    store = TraceMoneyStore()
    eval_meta = store.db.collection("meta").document("tikrrEvalUniverse").get().to_dict() or {}

    keep_stock_ids: set[str] = set()
    keep_sector_ids: set[str] = set()
    keep_market_ids: set[str] = set()

    for market in ("US", "IN"):
        block = eval_meta.get(market) or {}
        symbols = [str(symbol).upper() for symbol in block.get("symbols", [])]
        sector_ids = [str(sector_id) for sector_id in block.get("sectorIds", [])]
        if symbols:
            keep_market_ids.add(market)
        keep_stock_ids.update({f"{market}_{symbol}" for symbol in symbols})
        keep_sector_ids.update(sector_ids)

    deleted_stocks = _delete_collection_docs(store, "stocks", keep_stock_ids)
    deleted_sectors = _delete_collection_docs(store, "sectors", keep_sector_ids)
    deleted_markets = _delete_collection_docs(store, "markets", keep_market_ids)

    for market in ("US", "IN"):
        if market not in keep_market_ids:
            stale_run = store.db.collection("meta_run_status").document(f"{market}__market_open")
            if stale_run.get().exists:
                stale_run.delete()

    dashboard_docs = list(store.db.collection("views_dashboard").stream())
    for doc in dashboard_docs:
        doc.reference.delete()

    print(
        f"purged stale tikrr data: stocks={deleted_stocks} sectors={deleted_sectors} markets={deleted_markets} dashboards={len(dashboard_docs)}"
    )


if __name__ == "__main__":
    main()
