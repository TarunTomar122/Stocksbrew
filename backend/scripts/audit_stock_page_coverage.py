"""Audit baseline data completeness for every public company stock page."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.cloudrun.jobs.stock_facts_job import _is_financial_depth_candidate
from backend.storage import TraceMoneyStore


def _parse_iso(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def summarize_stock_page_coverage(
    instruments: list[dict[str, Any]],
    prices: dict[str, dict[str, Any]],
    facts: dict[str, dict[str, Any]],
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    fresh_cutoff = current - timedelta(days=14)
    candidates = [row for row in instruments if _is_financial_depth_candidate(row)]
    missing_price: list[str] = []
    missing_facts: list[str] = []
    missing_depth: list[str] = []
    stale_facts: list[str] = []
    with_valuation = 0
    with_quality = 0
    with_analyst = 0

    for row in candidates:
        instrument_id = str(row.get("instrument_id") or "").strip().upper()
        ticker = str(row.get("ticker") or instrument_id).strip().upper()
        price = prices.get(instrument_id) or {}
        quote = price.get("quote") if isinstance(price.get("quote"), dict) else {}
        if not isinstance(quote.get("current"), (int, float)):
            missing_price.append(ticker)

        stock_facts = facts.get(instrument_id) or {}
        has_baseline = any(
            bool(stock_facts.get(key))
            for key in ("quick_stats", "financials", "returns", "analyst", "events")
        )
        if not has_baseline:
            missing_facts.append(ticker)
        history = stock_facts.get("financial_history")
        if not isinstance(history, list) or len(history) < 2:
            missing_depth.append(ticker)
        if stock_facts.get("valuation"):
            with_valuation += 1
        if stock_facts.get("quality"):
            with_quality += 1
        analyst_trend = stock_facts.get("analyst_trend") or stock_facts.get("analyst")
        if analyst_trend:
            with_analyst += 1
        captured_at = _parse_iso(stock_facts.get("captured_at") or stock_facts.get("updated_at"))
        if not captured_at or captured_at < fresh_cutoff:
            stale_facts.append(ticker)

    total = len(candidates)

    def coverage(missing: list[str]) -> float:
        return round((total - len(missing)) / total, 4) if total else 0.0

    return {
        "company_count": total,
        "price_coverage": coverage(missing_price),
        "baseline_facts_coverage": coverage(missing_facts),
        "financial_depth_coverage": coverage(missing_depth),
        "fresh_facts_coverage": coverage(stale_facts),
        "valuation_coverage": round(with_valuation / total, 4) if total else 0.0,
        "quality_coverage": round(with_quality / total, 4) if total else 0.0,
        "analyst_coverage": round(with_analyst / total, 4) if total else 0.0,
        "missing_price": missing_price,
        "missing_baseline_facts": missing_facts,
        "missing_financial_depth": missing_depth,
        "stale_facts": stale_facts,
        "audited_at": current.isoformat(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit public stock-page baseline coverage")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--require-price-coverage", type=float, default=0.0)
    parser.add_argument("--require-baseline-coverage", type=float, default=0.0)
    parser.add_argument("--require-depth-coverage", type=float, default=0.0)
    parser.add_argument("--show-missing", type=int, default=25)
    args = parser.parse_args()

    store = TraceMoneyStore()
    instruments = store.list_instruments(args.market)
    candidate_ids = [
        str(row.get("instrument_id") or "").strip().upper()
        for row in instruments
        if _is_financial_depth_candidate(row)
    ]
    summary = summarize_stock_page_coverage(
        instruments,
        store.get_latest_prices(candidate_ids),
        store.get_stock_facts_batch(candidate_ids),
    )
    if args.write:
        store.db.collection("tm_data_health").document(f"{args.market}_stock_pages").set(
            summary,
            merge=True,
        )

    display = dict(summary)
    for key in ("missing_price", "missing_baseline_facts", "missing_financial_depth", "stale_facts"):
        rows = summary[key]
        display[key] = {"count": len(rows), "sample": rows[: max(0, args.show_missing)]}
    print(json.dumps(display, indent=2, sort_keys=True))

    requirements = {
        "price_coverage": args.require_price_coverage,
        "baseline_facts_coverage": args.require_baseline_coverage,
        "financial_depth_coverage": args.require_depth_coverage,
    }
    failed = [
        f"{key}={summary[key]:.4f} below {minimum:.4f}"
        for key, minimum in requirements.items()
        if minimum > 0 and float(summary[key]) < minimum
    ]
    if failed:
        raise RuntimeError("; ".join(failed))


if __name__ == "__main__":
    main()
