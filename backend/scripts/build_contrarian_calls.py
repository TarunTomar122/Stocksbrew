"""Build the crowd-vs-us contrarian calls for the homepage hero.

Finds names where Wall Street's stance and ours diverge, computed entirely from
data we already have (intel-pro pillar scores + analyst consensus + price vs
target). No LLM, so the job is cheap and the homepage reads a single cached doc.

Two kinds of disagreement:
  - Crowd bullish, we are cautious: analysts say buy but the stock is at/above
    their target with a rich valuation. Our call: trim / avoid.
  - Crowd cool, we are constructive: analysts say hold/sell but growth and
    quality are top-tier with real room to the target. Our call: accumulate.

Usage:
    python -m backend.scripts.build_contrarian_calls --market US --dry-run
    python -m backend.scripts.build_contrarian_calls --market US
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.storage import TraceMoneyStore

BULL_LABELS = {"strong buy", "buy", "outperform", "overweight"}
BEAR_LABELS = {"sell", "strong sell", "underperform", "underweight", "reduce"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _f(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _pillar(row: dict[str, Any], key: str) -> float | None:
    p = (row.get("pillars") or {}).get(key)
    if isinstance(p, dict):
        return _f(p.get("score"))
    return _f(p)


def _build_cards(store: TraceMoneyStore, market: str) -> list[dict[str, Any]]:
    market = market.upper()
    universe = store.get_active_ai_universe(market) or store.get_active_price_universe(market) or ""
    if not universe:
        return []
    rows = store.list_stock_intel_pro(market, universe)
    if not rows:
        return []

    ids = [r["instrument_id"] for r in rows if r.get("instrument_id")]
    prices = store.get_latest_prices(ids)
    names = {i["instrument_id"]: i.get("name") for i in list_instruments(market)}

    cautious: list[dict[str, Any]] = []
    constructive: list[dict[str, Any]] = []

    for row in rows:
        iid = row.get("instrument_id")
        ticker = str(row.get("ticker") or "").upper()
        if not iid or not ticker:
            continue
        price_doc = prices.get(iid) or {}
        quote = price_doc.get("quote") or {}
        ac = price_doc.get("analyst_consensus") or {}
        current = _f(quote.get("current"))
        target = _f(ac.get("target_price"))
        label = str(ac.get("label") or "").strip()
        label_l = label.lower()
        buy_n = int(ac.get("buy") or 0)
        if not current or current <= 0:
            continue

        valuation = _pillar(row, "valuation")
        growth = _pillar(row, "growth")
        quality = _pillar(row, "quality")
        upside = ((target - current) / current * 100.0) if target and target > 0 else None

        # Crowd bullish + we are cautious: priced in, rich, no upside left.
        if label_l in BULL_LABELS and upside is not None and upside <= 3.0:
            rich = valuation is not None and valuation <= 50
            score = (3.0 - upside) + (50 - (valuation or 50)) + min(buy_n, 30) * 0.4
            stance = "Avoid" if (upside <= -3 and rich) else "Trim"
            who = f"{buy_n} analysts" if buy_n else "The Street"
            if upside <= -8:
                reason = (
                    f"{who} still say buy, but it is trading {abs(round(upside))}% above their own "
                    "price target. The crowd is chasing. We would not."
                )
            elif rich:
                reason = (
                    f"{who} still say buy, but it is already at target with a rich valuation. "
                    "We would fade strength here."
                )
            else:
                reason = f"{who} are bullish, but the upside to their own target is used up."
            cautious.append({
                "ticker": ticker, "instrument_id": iid,
                "name": names.get(iid) or ticker,
                "sector": row.get("sector_label"),
                "crowd_label": label or "Buy", "crowd_side": "bull",
                "our_stance": stance, "our_side": "bear",
                "reason": reason,
                "upside_pct": round(upside, 1),
                "_score": score,
            })
            continue

        # Crowd cool + we are constructive: room to run, strong growth/quality.
        if (label_l in {"hold"} or label_l in BEAR_LABELS) and upside is not None and upside >= 15.0:
            strong = (quality is not None and quality >= 65) and (growth is not None and growth >= 60)
            if not strong:
                continue
            score = upside + (quality or 0) * 0.4 + (growth or 0) * 0.4
            reason = (
                f"The Street is lukewarm, but growth and quality are top-tier with {round(upside)}% "
                "still to the target. We would accumulate."
            )
            constructive.append({
                "ticker": ticker, "instrument_id": iid,
                "name": names.get(iid) or ticker,
                "sector": row.get("sector_label"),
                "crowd_label": label or "Hold", "crowd_side": "bear",
                "our_stance": "Accumulate", "our_side": "bull",
                "reason": reason,
                "upside_pct": round(upside, 1),
                "_score": score,
            })

    cautious.sort(key=lambda c: c["_score"], reverse=True)
    constructive.sort(key=lambda c: c["_score"], reverse=True)

    # Interleave both directions so the wall shows we cut both ways.
    cards: list[dict[str, Any]] = []
    for a, b in zip(cautious[:4], constructive[:4]):
        cards.append(a)
        cards.append(b)
    leftover = cautious[len(constructive):4] + constructive[len(cautious):4]
    cards.extend(leftover)
    for c in cards:
        c.pop("_score", None)
    return cards[:8]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build crowd-vs-us contrarian calls")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    market = args.market.upper()
    store = TraceMoneyStore()
    cards = _build_cards(store, market)

    if args.dry_run:
        print(json.dumps({"market": market, "cards": cards}, indent=2)[:3000])
        return

    payload = {
        "market": market,
        "generated_at": _now_iso(),
        "date": datetime.now(timezone.utc).date().isoformat(),
        "cards": cards,
    }
    store.save_contrarian_calls(market, payload)
    print(json.dumps({
        "market": market,
        "cards": len(cards),
        "bull_calls": sum(1 for c in cards if c["our_side"] == "bull"),
        "bear_calls": sum(1 for c in cards if c["our_side"] == "bear"),
    }))


if __name__ == "__main__":
    main()
