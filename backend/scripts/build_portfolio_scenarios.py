"""Build portfolio exposure + scenario suggestions for one Radar user.

Local-first MVP for testing scenario-driven rebalance suggestions.

Writes:
- tm_portfolio_exposure/{uid}
- tm_portfolio_scenarios/{uid}/US__nvda_earnings
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from typing import Any

from backend.storage import TraceMoneyStore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _num(v: Any) -> float:
    try:
        n = float(v)
    except Exception:
        return 0.0
    if n != n:  # NaN
        return 0.0
    return n


def _find_user_by_email(store: TraceMoneyStore, email: str) -> tuple[str | None, dict[str, Any]]:
    value = email.strip().lower()
    if not value:
        return None, {}
    docs = (
        store.db.collection("users")
        .where("email_lower", "==", value)
        .limit(1)
        .stream()
    )
    for d in docs:
        payload = d.to_dict() or {}
        payload["uid"] = d.id
        return d.id, payload
    return None, {}


def _directive_to_weight_band(stance: str) -> tuple[float, float, str]:
    s = stance.strip().lower()
    if s == "accumulate":
        return 0.9, 1.2, "Increase modestly on weakness"
    if s == "trim":
        return 0.6, 0.9, "Reduce into strength"
    if s == "avoid":
        return 0.0, 0.5, "Do not add until thesis improves"
    if s == "watch":
        return 0.8, 1.0, "Keep small / starter size"
    return 0.85, 1.05, "Hold near current size"


def _build_exposure(rows: list[dict[str, Any]]) -> dict[str, Any]:
    holdings = [r for r in rows if str(r.get("position_type") or "").lower() == "holding"]
    if not holdings:
        return {
            "generated_at": _now_iso(),
            "holding_count": 0,
            "total_abs_change": 0.0,
            "sector_weights": [],
            "top_weights": [],
            "concentration": {
                "top1_pct": 0.0,
                "top3_pct": 0.0,
                "hhi": 0.0,
                "risk_label": "low",
            },
            "weight_recommendations": [],
        }

    raw_weights: list[tuple[dict[str, Any], float]] = []
    for row in holdings:
        magnitude = max(0.1, abs(_num(row.get("day_change_pct"))) + 1.0)
        score = _num(((row.get("scores") or {}).get("overall")))
        score_adj = 1.0 + max(-0.5, min(0.5, (score - 50.0) / 100.0))
        w = magnitude * score_adj
        raw_weights.append((row, w))

    total = sum(w for _, w in raw_weights) or 1.0
    norm_rows: list[dict[str, Any]] = []
    for row, w in raw_weights:
        wt = w / total
        sector = str(row.get("sector_label") or "Unknown").strip() or "Unknown"
        ticker = str(row.get("ticker") or "").upper()
        stance = str(((row.get("ai_directive") or {}).get("stance") or "hold")).lower()
        low, high, note = _directive_to_weight_band(stance)
        norm_rows.append(
            {
                "instrument_id": str(row.get("instrument_id") or "").upper(),
                "ticker": ticker,
                "sector": sector,
                "weight": round(wt, 4),
                "directive": stance,
                "weight_target_range": {
                    "min": round(max(0.0, wt * low), 4),
                    "max": round(min(1.0, wt * high), 4),
                },
                "rebalance_note": note,
            }
        )

    by_sector: dict[str, float] = {}
    for item in norm_rows:
        by_sector[item["sector"]] = by_sector.get(item["sector"], 0.0) + float(item["weight"])

    top_weights = sorted(norm_rows, key=lambda x: x["weight"], reverse=True)
    top1 = top_weights[0]["weight"] if top_weights else 0.0
    top3 = sum(x["weight"] for x in top_weights[:3]) if top_weights else 0.0
    hhi = sum((float(x["weight"]) ** 2) for x in norm_rows)
    risk_label = "high" if top3 >= 0.65 or hhi >= 0.22 else "medium" if top3 >= 0.5 or hhi >= 0.16 else "low"

    return {
        "generated_at": _now_iso(),
        "holding_count": len(holdings),
        "total_abs_change": round(sum(abs(_num(r.get("day_change_pct"))) for r in holdings), 2),
        "sector_weights": [
            {"sector": sector, "weight": round(weight, 4)}
            for sector, weight in sorted(by_sector.items(), key=lambda kv: kv[1], reverse=True)
        ],
        "top_weights": top_weights,
        "concentration": {
            "top1_pct": round(top1 * 100.0, 1),
            "top3_pct": round(top3 * 100.0, 1),
            "hhi": round(hhi, 4),
            "risk_label": risk_label,
        },
        "weight_recommendations": top_weights[:8],
    }


def _scenario_payload(rows: list[dict[str, Any]], exposure: dict[str, Any]) -> dict[str, Any]:
    holdings = [r for r in rows if str(r.get("position_type") or "").lower() == "holding"]
    ticker_map = {str(r.get("ticker") or "").upper(): r for r in holdings}

    semis = []
    mega_tech = []
    for row in holdings:
        sector = str(row.get("sector_label") or "").lower()
        ticker = str(row.get("ticker") or "").upper()
        if "semi" in sector or ticker in {"NVDA", "AMD", "AVGO", "MU", "INTC", "TSM", "ASML", "SMCI", "KLAC", "LRCX", "AMAT", "QCOM"}:
            semis.append(row)
        if ticker in {"AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA"}:
            mega_tech.append(row)

    def _impact_rows(pool: list[dict[str, Any]], direction: str, base: float) -> list[dict[str, Any]]:
        out = []
        for row in pool:
            t = str(row.get("ticker") or "").upper()
            score = _num(((row.get("scores") or {}).get("overall")))
            sensitivity = 1.15 if t == "NVDA" else 1.0
            if score < 60:
                sensitivity += 0.08
            if score > 80:
                sensitivity -= 0.05
            est = round(base * sensitivity, 2)
            out.append(
                {
                    "ticker": t,
                    "direction": direction,
                    "estimated_move_pct": est if direction == "up" else -abs(est),
                    "confidence": "med" if t != "NVDA" else "high",
                    "driver": "AI infra read-through" if t != "NVDA" else "Direct earnings reaction",
                }
            )
        out.sort(key=lambda x: abs(x["estimated_move_pct"]), reverse=True)
        return out[:8]

    beat_impacts = _impact_rows(semis + [r for r in mega_tech if r not in semis], "up", 2.1)
    miss_impacts = _impact_rows(semis + [r for r in mega_tech if r not in semis], "down", 2.6)

    concentration = exposure.get("concentration") or {}
    top3_pct = float(concentration.get("top3_pct") or 0.0)

    suggestions_beat = [
        "If NVDA beats: trim 5-10% from your most extended semi if top-3 concentration stays above 60%.",
        "Rotate a slice into non-semi high-quality names to reduce single-theme drawdown risk.",
    ]
    suggestions_miss = [
        "If NVDA misses: avoid adding to weakest-momentum semis first 24h; prioritize balance-sheet quality.",
        "Keep dry powder for second-day dislocation instead of first candle chase.",
    ]
    if top3_pct >= 60.0:
        suggestions_beat.insert(0, f"Current top-3 concentration is {top3_pct:.1f}%. Pre-plan one trim candidate before earnings.")
        suggestions_miss.insert(0, f"Current top-3 concentration is {top3_pct:.1f}%. A miss can hit your book harder than market beta.")

    return {
        "scenario_id": "US__nvda_earnings",
        "title": "NVDA earnings scenario map",
        "generated_at": _now_iso(),
        "inputs": {
            "event": "NVDA earnings",
            "holding_count": len(holdings),
            "nvidia_in_book": "NVDA" in ticker_map,
        },
        "scenarios": [
            {
                "case": "beat",
                "label": "Upside surprise",
                "market_mood": "risk-on",
                "impacts": beat_impacts,
                "actions": suggestions_beat,
            },
            {
                "case": "miss",
                "label": "Guide-down / miss",
                "market_mood": "risk-off",
                "impacts": miss_impacts,
                "actions": suggestions_miss,
            },
        ],
    }


def _print_summary(uid: str, email: str, exposure: dict[str, Any], scenario: dict[str, Any]) -> None:
    c = exposure.get("concentration") or {}
    print("--- Portfolio Scenario Build ---")
    print(f"uid: {uid}")
    print(f"email: {email}")
    print(f"holding_count: {exposure.get('holding_count')}")
    print(f"top1: {c.get('top1_pct')}% | top3: {c.get('top3_pct')}% | hhi: {c.get('hhi')} | risk: {c.get('risk_label')}")
    print("top sector weights:")
    for item in (exposure.get("sector_weights") or [])[:4]:
        print(f"  - {item.get('sector')}: {round(float(item.get('weight') or 0.0) * 100.0, 1)}%")
    print("nvda scenarios:")
    for case in scenario.get("scenarios") or []:
        impacts = case.get("impacts") or []
        first = impacts[0] if impacts else {}
        print(f"  - {case.get('case')}: impacts={len(impacts)} top={first.get('ticker')} {first.get('estimated_move_pct')}%")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build portfolio exposure + scenario doc for one user")
    parser.add_argument("--email", default="", help="Target user email")
    parser.add_argument("--uid", default="", help="Target user uid (optional if email provided)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()

    uid = args.uid.strip()
    email = args.email.strip().lower()
    user: dict[str, Any] = {}
    if uid:
        snap = store.db.collection("users").document(uid).get()
        if not snap.exists:
            raise RuntimeError(f"No user found for uid={uid}")
        user = snap.to_dict() or {}
        email = email or str(user.get("email") or user.get("email_lower") or "").strip().lower()
    else:
        if not email:
            raise RuntimeError("Provide --uid or --email")
        uid, user = _find_user_by_email(store, email)
        if not uid:
            raise RuntimeError(f"No user found for email={email}")

    view = store.get_watchlist_view(uid)
    if not view:
        raise RuntimeError(f"No tm_watchlist_views doc for uid={uid}. Build watchlist view first.")

    rows = view.get("rows") or []
    exposure = _build_exposure(rows)
    scenario = _scenario_payload(rows, exposure)

    if not args.dry_run:
        store.db.collection("tm_portfolio_exposure").document(uid).set(
            {
                "uid": uid,
                "email": email,
                "source": "local_scenario_mvp",
                **exposure,
            },
            merge=False,
        )
        store.db.collection("tm_portfolio_scenarios").document(uid).collection("events").document("US__nvda_earnings").set(
            {
                "uid": uid,
                "email": email,
                "source": "local_scenario_mvp",
                **scenario,
            },
            merge=False,
        )

    _print_summary(uid, email, exposure, scenario)
    if args.dry_run:
        print("dry_run: no Firestore writes")
    else:
        print("wrote: tm_portfolio_exposure/{uid} and tm_portfolio_scenarios/{uid}/events/US__nvda_earnings")


if __name__ == "__main__":
    main()
