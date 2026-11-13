"""Write the price tails that are missing or were cut from an older history (prices.py ``tail_doc``).

The writers keep tails current as they write histories (``prices.load_many``, ``backtest_strategies.sync_prices``,
which also repairs the tails of histories it leaves alone). This fills them in once, or after a write outside those
paths::

    python3 -m backend.agentdata.price_tails [--dry-run] [--force]

Additive: it writes only ``tm_price_tail``. Each tail is cut from the body and the hash of one read, so it names
exactly the version it was cut from.
"""

from __future__ import annotations

import argparse
from typing import Any

from . import prices
from .store import DocStore


def backfill(store: DocStore, *, dry_run: bool = False, force: bool = False, chunk: int = 25) -> dict[str, int]:
    paths = [path for path in store.list_paths(prices.COLLECTION) if path.count("/") == 1]
    hashes = store.read_with_hashes(paths, [])
    held = store.read_with_hashes([f"{prices.TAIL_COLLECTION}/{path.split('/', 1)[1]}" for path in hashes], ["pt_v", "pt_src"])

    def current(path: str) -> bool:
        tail = (held.get(f"{prices.TAIL_COLLECTION}/{path.split('/', 1)[1]}") or {}).get("data") or {}
        return tail.get("pt_v") == prices.TAIL_VERSION and tail.get("pt_src") == hashes[path].get("hash")

    todo = [path for path in hashes if force or not current(path)]
    written = 0
    local_differs = 0
    no_arrays = 0
    for start in range(0, len(todo), chunk):
        writes: list[tuple[str, dict[str, Any]]] = []
        for path, row in store.read_with_hashes(todo[start : start + chunk]).items():
            tail = prices.tail_doc(path, row["data"])
            if tail is None:
                no_arrays += 1
                continue
            tail_path, data = tail
            # The store's hash of the body just read is the one the page checks; count any local disagreement.
            if data["pt_src"] != row.get("hash"):
                local_differs += 1
            data["pt_src"] = row.get("hash")
            writes.append((tail_path, data))
        if writes and not dry_run:
            written += store.set_many(writes)
    return {
        "histories": len(hashes),
        "stale": len(todo),
        "written": written,
        "would_write": len(todo) - no_arrays,
        "no_arrays": no_arrays,
        "local_hash_differs": local_differs,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Write missing or old price tails (tm_price_tail)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="rewrite every tail, current or not")
    args = parser.parse_args()
    print(backfill(DocStore.from_env(), dry_run=args.dry_run, force=args.force), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
