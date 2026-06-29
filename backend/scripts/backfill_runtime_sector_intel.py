"""Backfill sector_slug/label on runtime intel docs from coverage intel + rescrape gaps."""
from __future__ import annotations

import argparse
import subprocess
import sys

from backend.instrument_universe import get_coverage_universe_id
from backend.sector_slugs import resolve_sector_fields
from backend.storage import TraceMoneyStore


def _has_sector(doc: dict) -> bool:
    slug, label = resolve_sector_fields(
        sector_slug=str(doc.get("sector_slug") or ""),
        sector_label=str(doc.get("sector_label") or ""),
        instrument_sector=str(doc.get("sector") or ""),
        instrument_industry=str(doc.get("industry") or ""),
    )
    return bool(slug or label)


def _load_intel_by_id(store: TraceMoneyStore, market: str, universe_id: str) -> dict[str, dict]:
    rows = store.list_stock_intel_pro(market, universe_id)
    out: dict[str, dict] = {}
    for row in rows:
        instrument_id = str(row.get("instrument_id") or "").strip().upper()
        if instrument_id:
            out[instrument_id] = row
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill runtime sector fields on stock intel pro docs")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--runtime-universe", default=None)
    parser.add_argument("--rescrape-missing", action="store_true", help="Run sync_stock_metrics + build_stock_intel_pro for remaining gaps")
    args = parser.parse_args()

    store = TraceMoneyStore()
    market = args.market
    runtime_universe = args.runtime_universe or store.get_active_price_universe(market) or "us_core_100"
    coverage_universe = get_coverage_universe_id(market)

    runtime_by_id = _load_intel_by_id(store, market, runtime_universe)
    coverage_by_id = _load_intel_by_id(store, market, coverage_universe)

    patched = 0
    still_missing: list[str] = []
    for instrument_id, runtime_doc in sorted(runtime_by_id.items()):
        if _has_sector(runtime_doc):
            continue
        coverage_doc = coverage_by_id.get(instrument_id)
        if coverage_doc and _has_sector(coverage_doc):
            merged = {
                **runtime_doc,
                "sector_slug": coverage_doc.get("sector_slug") or runtime_doc.get("sector_slug", ""),
                "sector_label": coverage_doc.get("sector_label") or runtime_doc.get("sector_label", ""),
                "industry_label": coverage_doc.get("industry_label") or runtime_doc.get("industry_label", ""),
            }
            store.save_stock_intel_pro(market, runtime_universe, instrument_id, merged)
            patched += 1
            continue
        still_missing.append(instrument_id)

    print(
        {
            "market": market,
            "runtime_universe": runtime_universe,
            "coverage_universe": coverage_universe,
            "patched_from_coverage": patched,
            "still_missing": len(still_missing),
        }
    )

    if still_missing and args.rescrape_missing:
        ids_csv = ",".join(still_missing)
        common = ["--market", market, "--instrument-ids", ids_csv]
        subprocess.run(
            [
                sys.executable,
                "-m",
                "backend.scripts.sync_stock_metrics",
                *common,
                "--universe",
                coverage_universe,
                "--max-workers",
                "2",
                "--pause",
                "0.4",
            ],
            check=True,
        )
        subprocess.run(
            [sys.executable, "-m", "backend.scripts.build_stock_intel_pro", *common, "--universe", coverage_universe],
            check=True,
        )
        subprocess.run(
            [sys.executable, "-m", "backend.scripts.build_stock_intel_pro", *common, "--universe", runtime_universe],
            check=True,
        )
        # Re-run patch pass for anything newly scored in coverage.
        coverage_by_id = _load_intel_by_id(store, market, coverage_universe)
        repatched = 0
        for instrument_id in still_missing:
            runtime_doc = store.get_stock_intel_pro(market, runtime_universe, instrument_id) or {}
            if _has_sector(runtime_doc):
                continue
            coverage_doc = coverage_by_id.get(instrument_id)
            if not coverage_doc or not _has_sector(coverage_doc):
                continue
            merged = {
                **runtime_doc,
                "sector_slug": coverage_doc.get("sector_slug") or "",
                "sector_label": coverage_doc.get("sector_label") or "",
                "industry_label": coverage_doc.get("industry_label") or "",
            }
            store.save_stock_intel_pro(market, runtime_universe, instrument_id, merged)
            repatched += 1
        print({"repatched_after_rescrape": repatched})


if __name__ == "__main__":
    main()
