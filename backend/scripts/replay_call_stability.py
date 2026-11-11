"""Replay the stored daily calls through the stability rule (backend/call_stability.py).

Read-only by default: prints how often the call people would have seen changed,
how often a change was undone, and how often it went straight between Buy more
and Sell some, for the raw calls and for the steady ones. Each day only sees
prices and reports known by that day, and the reports come from the same reads
as the live pipeline (``call_stability.load_report_rows``). Calls are one per
stock per trading day (``tm_directive_history`` keeps a day's last call), so
flips inside a day cannot be counted here.

``--seed-current --write`` is the step before switching the rule on: it writes
``tm_call_stability/{instrument_id}`` so each stock starts from the call people
see now (its last stored call, since the day it took that value). The first
published steady call then matches yesterday's, and nothing looks changed on the
day of the switch. Existing state is skipped unless ``--overwrite`` is given.

    python -m backend.scripts.replay_call_stability                     # report only
    python -m backend.scripts.replay_call_stability --since 2026-11-12  # a later, unseen period
    python -m backend.scripts.replay_call_stability --seed-current --write --overwrite
"""

from __future__ import annotations

import argparse
import bisect
import json
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from backend import call_stability as cs
from backend.storage import TraceMoneyStore

MARKET_TICKER = "SPY"


def ticker_for(instrument_id: str) -> str:
    return instrument_id.split("_", 1)[1].replace("_", ".") if "_" in instrument_id else instrument_id


def _series(store: TraceMoneyStore, ticker: str) -> tuple[list[str], list[float]]:
    snap = store.db.collection("tm_price_history_daily").document(ticker).get()
    data = (snap.to_dict() or {}) if snap.exists else {}
    pairs = [(str(d)[:10], float(c)) for d, c in zip(data.get("dates") or [], data.get("closes") or []) if isinstance(c, (int, float))]
    return [d for d, _ in pairs], [c for _, c in pairs]


def trading_day(generated_at: Any, fallback: str) -> str:
    """The New York day a call was written on."""
    try:
        stamp = datetime.fromisoformat(str(generated_at).replace("Z", "+00:00"))
    except ValueError:
        return str(fallback)[:10]
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return cs.new_york_day(stamp)


def _vote(call: dict[str, Any]) -> str | None:
    # Once the steady call is live the ledger's `stance` is the steady one; the vote is `raw_stance`.
    return cs.vote_from_directive({"stance": call.get("raw_stance") or call.get("stance"), "text": call.get("text")})


def _levels(call: dict[str, Any]) -> dict[str, Any]:
    """The level the ledger kept for a call (it keeps one). A "price_above" on a "watch"
    call is a breakout level, not a sell-some one, so it is left out."""
    kind, value = call.get("trigger_type"), call.get("trigger_value")
    if kind == "price_below":
        return {"accumulate_below": value}
    if kind == "price_above" and str(call.get("raw_stance") or call.get("stance") or "").lower() != "watch":
        return {"trim_above": value}
    return {}


def replay_stock(
    calls: list[dict[str, Any]],
    dates: list[str],
    closes: list[float],
    market: tuple[list[str], list[float]],
    reports: list[dict[str, Any]],
    upcoming: list[str],
    name: str,
    rules: cs.Rules = cs.DEFAULT_RULES,
) -> tuple[dict[str, Any] | None, list[tuple[str, str, str]]]:
    """(final state, [(day, raw call, steady call)]) for one stock's calls, oldest first."""
    state = None
    out: list[tuple[str, str, str]] = []
    for call in calls:
        day = str(call.get("day"))[:10]
        vote = _vote(call)
        raw = cs.call_word(vote)
        if not raw:
            continue
        facts = cs.build_facts(dates, closes, market[0], market[1], reports, upcoming, day)
        state, view = cs.stabilise(state, vote, cs.session_day(facts.dates, day), facts, raw_levels=_levels(call), name=name, rules=rules)
        if view:
            out.append((day, raw, view["call"]))
    return state, out


def seed_from_current(calls: list[dict[str, Any]]) -> dict[str, Any] | None:
    """A state whose call is the last stored call, standing since the day it took that value."""
    votes = [(str(c.get("day"))[:10], cs.call_word(_vote(c))) for c in calls]
    votes = [(day, word) for day, word in votes if word]
    if not votes:
        return None
    last_day, call = votes[-1]
    since = last_day
    for day, word in reversed(votes):
        if word != call:
            break
        since = day
    # Levels from the last day that had a price and voted; a "price_above" trigger is only
    # a sell-some level on a Sell some or Keep call (on Buy more it is a breakout level).
    last_priced = next((c for c in reversed(calls) if cs.call_word(_vote(c))), calls[-1])
    levels = {
        key: round(float(value), 2)
        for key, value in _levels(last_priced).items()
        if isinstance(value, (int, float)) and value > 0 and not (key == "trim_above" and call == "Add")
    }
    core = {
        "version": cs.VERSION, "call": call, "since": since, "since_reason": None, "since_trigger": "start",
        "levels": {**levels, "set_on": last_day}, "changes": [], "used_events": [], "session": last_day,
    }
    return {
        **core,
        "votes": [{"day": day, "call": word} for day, word in votes[-cs.MAX_VOTES:]],
        "prior": dict(core),
        "changed_on": None,
        "last_raw": call,
        "seeded_from": "tm_directive_history",
    }


def flip_stats(series: dict[str, list[tuple[str, str]]], sessions: list[str]) -> dict[str, Any]:
    """Changes per stock-year (per call day x 252), share undone within 5/10/20 sessions,
    and turns into Buy more or Sell some while the other one was shown in the last 5 sessions."""
    days = changes = 0
    undone = {5: [0, 0], 10: [0, 0], 20: [0, 0]}
    straight = 0
    for rows in series.values():
        idx = [(bisect.bisect_right(sessions, d) - 1, c) for d, c in rows]
        days += len(idx)
        for k in range(1, len(idx)):
            (_, before), (at, after) = idx[k - 1], idx[k]
            if before == after:
                continue
            changes += 1
            for n in undone:
                window = [c for i, c in idx[k + 1:] if i <= at + n]
                if before in window:
                    undone[n][0] += 1
                    undone[n][1] += 1
                elif idx[-1][0] >= at + n:
                    undone[n][1] += 1
            if after in ("Add", "Trim"):
                opposite = "Trim" if after == "Add" else "Add"
                if any(c == opposite for i, c in idx[:k] if i >= at - 5):
                    straight += 1
    return {
        "call_days": days,
        "changes": changes,
        "changes_per_stock_year": round(changes / days * 252, 1) if days else None,
        **{f"undone_within_{n}_sessions_pct": round(100 * a / b, 1) if b else None for n, (a, b) in undone.items()},
        "add_trim_within_5_sessions": straight,
    }


def run(store: TraceMoneyStore, *, limit: int = 0, since: str = "", write: bool = False, overwrite: bool = False, seed_current: bool = False) -> dict[str, Any]:
    market = _series(store, MARKET_TICKER)
    # The ledger's parent documents are never written, only their "calls", so list those.
    by_stock: dict[str, list[dict[str, Any]]] = {}
    for snap in store.db.collection_group("calls").stream():
        parts = snap.reference.path.split("/")
        if len(parts) != 4 or parts[0] != "tm_directive_history":
            continue
        row = snap.to_dict() or {}
        row["day"] = trading_day(row.get("generated_at"), parts[3])
        by_stock.setdefault(parts[1], []).append(row)
    # The ledger is keyed by the UTC day; an evening run in New York can land on the next
    # one. Count each call on its New York day, keeping the day's latest call.
    for instrument_id, rows in by_stock.items():
        latest: dict[str, dict[str, Any]] = {}
        for row in sorted(rows, key=lambda r: str(r.get("generated_at") or "")):
            latest[row["day"]] = row
        by_stock[instrument_id] = list(latest.values())
    instrument_ids = sorted(by_stock)
    if limit > 0:
        instrument_ids = instrument_ids[:limit]
    raw_series: dict[str, list[tuple[str, str]]] = {}
    steady_series: dict[str, list[tuple[str, str]]] = {}
    triggers: Counter[str] = Counter()
    written = skipped = 0
    for instrument_id in instrument_ids:
        ticker = ticker_for(instrument_id)
        calls = sorted(by_stock[instrument_id], key=lambda row: row["day"])
        dates, closes = _series(store, ticker)
        if dates:
            reports, upcoming = cs.load_report_rows(store, ticker)
            final, out = replay_stock(calls, dates, closes, market, reports, upcoming, ticker)
            for day, raw, steady in out:
                if day >= since:
                    raw_series.setdefault(instrument_id, []).append((day, raw))
                    steady_series.setdefault(instrument_id, []).append((day, steady))
            for change in (final or {}).get("changes") or []:
                triggers[str(change.get("trigger"))] += 1
        if write and seed_current:
            seed = seed_from_current(calls)
            if not seed:
                continue
            existing = store.get_call_stability_state(instrument_id)
            if existing and not overwrite:
                skipped += 1
                continue
            rev = existing.get("rev") if existing else None
            if store.save_call_stability_state(instrument_id, seed, expected_rev=rev):
                written += 1
            else:
                skipped += 1
    sessions = market[0]
    return {
        "stocks": len(raw_series),
        "raw": flip_stats(raw_series, sessions),
        "steady": flip_stats(steady_series, sessions),
        "recent_change_triggers": dict(triggers),
        "status": "written" if write and seed_current else "dry_run",
        "written": written,
        "skipped": skipped,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay stored calls through the call stability rule")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--since", default="", help="only count calls on or after this day (YYYY-MM-DD)")
    parser.add_argument("--seed-current", action="store_true", help="with --write: start each stock from the call shown now")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if args.write and not args.seed_current:
        parser.error("--write only seeds state; pass --seed-current with it")
    result = run(TraceMoneyStore(), limit=max(0, args.limit), since=args.since, write=args.write, overwrite=args.overwrite, seed_current=args.seed_current)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
