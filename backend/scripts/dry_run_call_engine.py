"""Dry run: the stored call next to call engine v3's, for real tickers.

Read-only. Nothing is written anywhere.

Inputs come from the document store (``tm_price_history_daily``,
``tm_fundamentals_pit``, ``tm_insider_buy_history``, ``tm_screener_snapshot``)
or, with ``--data-dir``, from the local research cache. The stored brief
(``tm_news_runs/US__us_core_155/stock_intelligence``) supplies the old call.

Warm start: there is no stored engine state yet, so the universe is re-scored
for each of the last ``--replay-weeks`` weeks first. That gives each call a
"since" date and a change log. Those past weeks use today's market caps for the
value factors, so their dates are indicative, not a backtest.

Also printed: the call distribution, each family's weight in the call and its
share of the votes cast, a check that no level contradicts the close, and the
reason for every requested ticker that got no call.

Usage:
  python3 -m backend.scripts.dry_run_call_engine                       # NVDA AAPL COIN TSLA MU + one small cap
  python3 -m backend.scripts.dry_run_call_engine MSFT PLTR --data-dir <cache> --json out.json
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any

from backend import call_engine as ce
from backend.agentdata import call_scores

DEFAULT_SYMBOLS = ["NVDA", "AAPL", "COIN", "TSLA", "MU"]
BRIEF_NAMESPACE = "tm_news_runs/US__us_core_155/stock_intelligence"


def replay(inputs: dict[str, Any], weeks: int) -> dict[str, Any]:
    """Score the first close of each of the last ``weeks`` ISO weeks, then today."""
    calendar = inputs["prices"][call_scores.BENCHMARK]["dates"]
    firsts: list[str] = []
    seen = None
    for day in calendar:
        key = date.fromisoformat(day).isocalendar()[:2]
        if key != seen:
            firsts.append(day)
        seen = key
    days = firsts[-weeks:] if weeks > 0 else []
    if not days or days[-1] != calendar[-1]:
        days.append(calendar[-1])
    result: dict[str, Any] = {}
    states: dict[str, Any] = dict(inputs.get("states") or {})
    for day in days:
        result = call_scores.score_universe({**inputs, "states": states}, day=day)
        states = result["calls"]
    return result


def stored_call(brief: dict[str, Any] | None) -> dict[str, Any]:
    brief = brief or {}
    directive = brief.get("directive_v2") if isinstance(brief.get("directive_v2"), dict) else {}
    zones = directive.get("zones") if isinstance(directive.get("zones"), dict) else {}
    return {
        "label": (directive.get("action") or {}).get("label"),
        "stance": directive.get("stance"),
        "confidence": directive.get("confidence"),
        "horizon": directive.get("horizon"),
        "add_below": zones.get("accumulate_below"),
        "trim_above": zones.get("trim_above"),
        "price_at_call": brief.get("current_price"),
        "written_at": brief.get("generated_at"),
    }


def family_shares(calls: list[dict[str, Any]]) -> dict[str, Any]:
    """Per family: its weight in the call (1 / scored families) and its share of
    the votes actually cast (|vote| / all |votes|), averaged over ``calls``."""
    weight: dict[str, list[float]] = {name: [] for name in ce.FAMILY_ORDER}
    cast: dict[str, list[float]] = {name: [] for name in ce.FAMILY_ORDER}
    for call in calls:
        rows = [row for row in call["families"] if row["status"] == "scored"]
        votes = sum(abs(row["vote"]) for row in rows)
        for row in rows:
            weight[row["family"]].append(row["weight"])
            if votes:
                cast[row["family"]].append(abs(row["vote"]) / votes)
    return {
        name: {
            "scored_in": len(weight[name]),
            "avg_weight_pct": round(100 * sum(weight[name]) / len(weight[name]), 1) if weight[name] else None,
            "max_weight_pct": round(100 * max(weight[name]), 1) if weight[name] else None,
            "avg_vote_share_pct": round(100 * sum(cast[name]) / len(cast[name]), 1) if cast[name] else None,
        }
        for name in ce.FAMILY_ORDER
    }


def level_check(call: dict[str, Any]) -> str | None:
    """A level that contradicts the close, or None."""
    zones, close = call["zones"], call["close"]
    add, trim, state = zones.get("accumulate_below"), zones.get("trim_above"), zones.get("entry_state")
    if state == "wait_for_pullback" and add and add >= close:
        return f"waits for a pullback but the add level {add} is not below the close {close}"
    if state == "in_zone" and add and add < close:
        return f"says in zone but the close {close} is above the add level {add}"
    if trim and trim <= close:
        return f"trim level {trim} is not above the close {close}"
    return None


def print_one(symbol: str, call: dict[str, Any], old: dict[str, Any]) -> None:
    close = call["close"]
    zones = call["zones"]
    print(f"\n=== {symbol}  close {close:.2f} on {call['as_of']}  ({call['peer_group']}, {call['model_label']}) ===")
    print(
        f"  old : {old['label']} ({old['stance']}), confidence {old['confidence']}, horizon {old['horizon']}, "
        f"add below {old['add_below']}, trim above {old['trim_above']}, written {str(old['written_at'])[:16]} at {old['price_at_call']}"
    )
    votes, conf = call["votes"], call["confidence"]
    print(f"  v3  : {call['call'].upper()} since {call['since']}; {votes['for']} for, {votes['against']} against, {votes['neutral']} neutral of {votes['scored']} scored; confidence {conf['label']}")
    print(f"        {call['trend']['text']}")
    for row in call["families"]:
        weight = f"{100 * row['weight']:4.1f}%" if row.get("weight") else "  -  "
        print(f"    [{weight}] {row['text']}")
    add, trim = zones.get("accumulate_below"), zones.get("trim_above")
    add_text = f"add below {add} ({(add / close - 1) * 100:+.1f}%; {zones.get('add_anchor')}; {zones.get('entry_state')})" if add else f"no add level ({zones.get('entry_state')})"
    trim_text = f"trim above {trim} ({(trim / close - 1) * 100:+.1f}%; {zones.get('trim_anchor')})" if trim else "no trim level"
    print(f"  levels from the {zones.get('anchored_on')} close: {add_text}; {trim_text}")
    problem = level_check(call)
    if problem:
        print(f"  LEVEL PROBLEM: {problem}")
    print("  what would change it:")
    for item in call["what_would_change"]:
        print(f"    - {item['text']}")
    log = [entry for entry in call["change_log"] if entry.get("from")]
    print(f"  changes in the replay window: {len(log)}")
    for entry in log[-3:]:
        print(f"    {entry['day']}: {entry['from'].upper()} -> {entry['to'].upper()}. {entry['reason']}")


def unscored_reason(symbol: str, inputs: dict[str, Any], result: dict[str, Any]) -> str:
    if symbol in result.get("skipped", {}):
        return result["skipped"][symbol]
    if symbol not in inputs["prices"]:
        return "not in the covered price history (tm_price_history_daily), so it cannot be scored."
    if symbol not in inputs["funds"]:
        return "no SEC fundamentals document (no CIK match, or a foreign filer without US-GAAP XBRL)."
    return "not scored."


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("symbols", nargs="*", help="tickers (default: NVDA AAPL COIN TSLA MU plus one small cap)")
    parser.add_argument("--data-dir", help="local research cache instead of the document store for the engine inputs")
    parser.add_argument("--briefs-json", help="local cache of stored briefs ({path: data}) instead of reading them from the store")
    parser.add_argument("--replay-weeks", type=int, default=26)
    parser.add_argument("--json", help="also write the engine output here")
    args = parser.parse_args()

    store = None
    if args.data_dir:
        inputs = call_scores.load_from_dir(Path(args.data_dir))
    else:
        from backend.agentdata.store import DocStore

        store = DocStore.from_env()
        inputs = call_scores.load_from_store(store)
    inputs["states"] = {}
    result = replay(inputs, args.replay_weeks)
    print(call_scores.summary(result))
    print(f"basis: {ce.BASIS}")
    print(f"rule: {ce.RULE_TEXT}")
    print(f"evidence: {ce.EVIDENCE['summary']}")
    print(f"limits: {ce.EVIDENCE['limits']}")

    symbols = [s.upper() for s in args.symbols] or list(DEFAULT_SYMBOLS)
    if not args.symbols:
        small = sorted(
            (row for symbol, row in inputs["rows"].items() if row.get("cap_tier") == "small" and symbol in result["calls"]),
            key=lambda row: -(row.get("market_cap") or 0),
        )
        if small:
            symbols.append(str(small[0]["symbol"]).upper())

    briefs: dict[str, Any] = {}
    if args.briefs_json:
        cached = json.loads(Path(args.briefs_json).read_text())
        briefs = {symbol: cached.get(f"{BRIEF_NAMESPACE}/US_{symbol}") for symbol in symbols}
    else:
        if store is None:
            from backend.agentdata.store import DocStore

            store = DocStore.from_env()
        got = store.get_many([f"{BRIEF_NAMESPACE}/US_{symbol}" for symbol in symbols])
        briefs = {symbol: got.get(f"{BRIEF_NAMESPACE}/US_{symbol}") for symbol in symbols}

    out: dict[str, Any] = {}
    for symbol in symbols:
        call = result["calls"].get(symbol)
        if not call:
            reason = unscored_reason(symbol, inputs, result)
            print(f"\n=== {symbol}: not scored: {reason} ===")
            out[symbol] = {"v3": None, "not_scored": reason}
            continue
        old = stored_call(briefs.get(symbol))
        print_one(symbol, call, old)
        out[symbol] = {"v3": call, "old": old, "legacy_shape": ce.to_directive_v2(call, call["close"])}
    shown = [item["v3"] for item in out.values() if item.get("v3")]
    counts: dict[str, int] = {}
    for call in shown:
        counts[call["call"]] = counts.get(call["call"], 0) + 1
    shares = family_shares(shown)
    problems = {call["symbol"]: level_check(call) for call in shown if level_check(call)}
    print(f"\nrequested {len(symbols)}, scored {len(shown)}: calls {dict(sorted(counts.items()))}")
    print("family weight in the call (1 / scored families) and share of the votes cast, averaged over the scored names:")
    for name, row in shares.items():
        print(f"  {name:11s} scored in {row['scored_in']:2d}  avg weight {row['avg_weight_pct']}%  max weight {row['max_weight_pct']}%  avg share of votes cast {row['avg_vote_share_pct']}%")
    print(f"levels contradicting the close: {problems or 'none'}")
    out["_summary"] = {"calls": counts, "family_shares": shares, "level_problems": problems, "universe": call_scores.summary(result)}
    if args.json:
        Path(args.json).write_text(json.dumps(out, indent=1))
        print(f"\nwritten to {args.json}")


if __name__ == "__main__":
    main()
