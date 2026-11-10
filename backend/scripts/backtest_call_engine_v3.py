"""Walk-forward check of call engine v3 (read-only, local files).

Replays the engine's own code (``call_engine.family_scores``, ``advance``)
weekly over a point-in-time panel and reports ADD minus TRIM forward returns
the way the v2 review asked for:

* non-overlapping periods only: the weekly series of six-month (three-month)
  gaps is sampled every 26 (13) weeks, for every possible starting week, and
  the median t-stat is reported with its range and the number of periods;
* raw, and demeaned by peer group x size tercile (each stock's forward return
  minus the average of stocks in the same peer group and size third that week);
* the 200 largest companies at each date; banks, brokers, insurers and REITs
  on their own;
* the development half and the holdout half separately.

The rule is fixed in ``call_engine.py``; nothing here fits anything. The
holdout half is printed only with ``--show-holdout PREREG``, where PREREG is
the pre-registration file written before the holdout was looked at. Its path,
modification time and SHA-256 are printed with the results.

Point-in-time rules: fundamentals from their SEC filing date; insider
purchases from their filing date; prices up to the decision close. Known
limits, printed too: the universe is the tickers covered today (no delisted
names), peer groups use today's sector labels, market caps are rebuilt from
filed share counts, and the decision close is the close the forward return
starts from.

Usage:
  python3 -m backend.scripts.backtest_call_engine_v3 --data-dir <dir> --panel-cache <file> [--show-holdout PREREG] [--out report.json]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pickle
import statistics
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable

from backend import call_engine as ce
from backend import call_factors as cf
from backend.agentdata.insider_history import cluster_buyers
from backend.scripts.backtest_call_engine import BENCHMARK, EXCLUDE, RETURN_CAP, RawRatio, load_inputs, split_factor_after

HORIZONS = (63, 126)
PRIMARY_HORIZON = 126
DEV_START = "2018-08-27"   # the v2 review's out-of-sample start, kept for comparison
SPLIT_DAY = "2022-10-03"   # first week of the holdout half
LARGE_N = 200
MIN_NAMES = 5              # ADD and TRIM names a week needs to count
FIN_MODELS = (cf.FINANCIAL, cf.REIT)
USED_FACTORS = sorted({name for families in ce.FAMILIES.values() for names in families.values() for name in names})


# --------------------------------------------------------------------------
# panel
# --------------------------------------------------------------------------

def build_panel(data_dir: Path, log: Callable[[str], None] = print) -> dict[str, Any]:
    inputs = load_inputs(data_dir)
    prices = inputs["prices"]
    bench = prices[BENCHMARK]
    calendar: list[str] = bench["dates"]
    bench_by_day = dict(zip(bench["dates"], bench["closes"]))
    stocks: dict[str, dict[str, Any]] = {}
    for symbol in sorted(prices):
        if symbol in EXCLUDE or symbol.startswith("^"):
            continue
        path = data_dir / "sec" / f"{symbol}.json"
        if not path.exists():
            continue
        series = cf.PriceSeries(prices[symbol]["dates"], prices[symbol]["closes"], bench_by_day)
        if len(series.closes) < 300:
            continue
        doc = json.loads(path.read_text())
        fund = cf.Fundamentals(doc)
        model = cf.factor_model(fund.sic)
        if model not in ce.FAMILIES:
            continue
        row = inputs["rows"].get(symbol) or {}
        stocks[symbol] = {
            "prices": series,
            "fund": fund,
            "model": model,
            "group": ce.peer_group(model, row.get("sector"), fund.sic),
            "splits": inputs["splits"].get(symbol) or [],
            "raw": RawRatio(inputs["raw"].get(symbol)),
            "insiders": inputs["insiders"].get(symbol) or [],
        }
    log(f"stocks with prices, SEC facts and a factor model: {len(stocks)}")

    decision: list[int] = []
    last_week = None
    for index, day in enumerate(calendar):
        week = date.fromisoformat(day).isocalendar()[:2]
        if week != last_week and index >= 260:
            decision.append(index)
        last_week = week

    panel: list[dict[str, Any]] = []
    for count, cal_index in enumerate(decision):
        day = calendar[cal_index]
        week: dict[str, Any] = {}
        for symbol, item in stocks.items():
            series: cf.PriceSeries = item["prices"]
            i = series.index_on(day, max_stale_days=0)
            if i is None:
                continue
            price = series.features(i)
            if not price:
                continue
            known = item["fund"].as_of(day)
            market_cap = None
            if known and known.get("shares"):
                market_cap = known["shares"] * split_factor_after(item["splits"], known["shares_date"]) * series.closes[i] * item["raw"].at(day)
            raw = cf.raw_factors(price, known, market_cap=market_cap, day=day)
            fwd = {}
            for h in HORIZONS:
                if i + h < len(series.closes) and series.dates[i + h] == calendar[min(cal_index + h, len(calendar) - 1)]:
                    fwd[h] = min(RETURN_CAP, series.closes[i + h] / series.closes[i] - 1)
            week[symbol] = {
                "model": item["model"],
                "group": item["group"],
                "size": market_cap,
                "raw": {name: raw[name] for name in USED_FACTORS if name in raw},
                "insider_buyers": cluster_buyers(item["insiders"], day) if item["insiders"] else 0,
                "trend_up": price["price"] >= price["sma_200"],
                "fwd": fwd,
            }
        bench_fwd = {h: bench["closes"][cal_index + h] / bench["closes"][cal_index] - 1 for h in HORIZONS if cal_index + h < len(calendar)}
        panel.append({"day": day, "stocks": week, "bench_fwd": bench_fwd})
        if log and count % 60 == 0:
            log(f"panel {day}: {len(week)} stocks")
    return {"panel": panel, "n_stocks": len(stocks), "groups": {s: v["group"] for s, v in stocks.items()}, "models": {s: v["model"] for s, v in stocks.items()}}


# --------------------------------------------------------------------------
# replay
# --------------------------------------------------------------------------

def replay(panel: list[dict[str, Any]], params: ce.Params = ce.DEFAULT_PARAMS) -> dict[str, Any]:
    """The engine's calls, week by week: {index: {symbol: call}} and the
    per-family votes behind them."""
    states: dict[str, dict[str, Any]] = {}
    calls: dict[int, dict[str, str]] = {}
    votes: dict[int, dict[str, dict[str, int]]] = {}
    changes: dict[int, int] = {}
    for index, week in enumerate(panel):
        families = ce.family_scores(week["stocks"], params)
        calls[index], votes[index], changes[index] = {}, {}, 0
        for symbol, entry in families.items():
            if not ce.has_enough_families(entry, params):
                continue
            state = ce.advance(states.get(symbol), day=week["day"], votes=ce.tally(entry), trend_up=week["stocks"][symbol]["trend_up"], params=params)
            if state.get("change") and state["change"].get("from"):
                changes[index] += 1
            states[symbol] = state
            calls[index][symbol] = state["call"]
            votes[index][symbol] = {family: e.get("vote", 0) for family, e in entry.items() if e.get("status") == "scored"}
    return {"calls": calls, "votes": votes, "changes": changes}


# --------------------------------------------------------------------------
# statistics
# --------------------------------------------------------------------------

def t_stat(values: list[float]) -> float:
    n = len(values)
    if n < 3:
        return float("nan")
    sd = statistics.stdev(values)
    return statistics.fmean(values) / (sd / math.sqrt(n)) if sd > 0 else float("nan")


def non_overlapping(series: list[float], step: int) -> dict[str, Any]:
    """t-stats of every non-overlapping subsample (one per starting week)."""
    ts, ns = [], []
    for offset in range(step):
        sample = series[offset::step]
        if len(sample) >= 3:
            t = t_stat(sample)
            if t == t:
                ts.append(t)
                ns.append(len(sample))
    if not ts:
        return {"t_median": None, "t_min": None, "t_max": None, "periods": 0}
    return {"t_median": round(statistics.median(ts), 2), "t_min": round(min(ts), 2), "t_max": round(max(ts), 2), "periods": int(statistics.median(ns))}


def size_terciles(week: dict[str, Any]) -> dict[str, int]:
    sized = sorted((v["size"], s) for s, v in week["stocks"].items() if v.get("size"))
    n = len(sized)
    return {s: min(2, 3 * k // n) for k, (_, s) in enumerate(sized)} if n else {}


def largest(week: dict[str, Any], n: int = LARGE_N) -> set[str]:
    return {s for _, s in sorted(((v["size"], s) for s, v in week["stocks"].items() if v.get("size")), reverse=True)[:n]}


def spread_series(
    panel: list[dict[str, Any]],
    calls: dict[int, dict[str, str]],
    lo: int,
    hi: int,
    h: int,
    *,
    keep: Callable[[int, str], bool] | None = None,
    demean: bool = False,
) -> list[dict[str, float]]:
    """Per week in [lo, hi): ADD mean - TRIM mean forward return, plus each
    call's mean minus the mean of every called stock."""
    out = []
    for index in range(lo, hi):
        week = panel[index]
        adjust: dict[str, float] = {}
        if demean:
            tercile = size_terciles(week)
            groups: dict[tuple[str, int], list[float]] = defaultdict(list)
            for symbol in calls.get(index, {}):
                f = week["stocks"][symbol]["fwd"].get(h)
                if f is not None and symbol in tercile:
                    groups[(week["stocks"][symbol]["group"], tercile[symbol])].append(f)
            for symbol in calls.get(index, {}):
                key = (week["stocks"][symbol]["group"], tercile.get(symbol, -1))
                if key in groups and len(groups[key]) >= 3:
                    adjust[symbol] = statistics.fmean(groups[key])
        buckets: dict[str, list[float]] = defaultdict(list)
        for symbol, call in calls.get(index, {}).items():
            if keep and not keep(index, symbol):
                continue
            f = week["stocks"][symbol]["fwd"].get(h)
            if f is None:
                continue
            if demean:
                if symbol not in adjust:
                    continue
                f -= adjust[symbol]
            buckets[call].append(f)
        if len(buckets.get(ce.ADD, [])) < MIN_NAMES or len(buckets.get(ce.TRIM, [])) < MIN_NAMES:
            continue
        everyone = statistics.fmean([v for values in buckets.values() for v in values])
        add, trim = statistics.fmean(buckets[ce.ADD]), statistics.fmean(buckets[ce.TRIM])
        hold = statistics.fmean(buckets[ce.HOLD]) if buckets.get(ce.HOLD) else float("nan")
        out.append({"index": index, "add_trim": add - trim, "add_all": add - everyone, "hold_all": hold - everyone, "trim_all": trim - everyone, "n_add": len(buckets[ce.ADD]), "n_trim": len(buckets[ce.TRIM])})
    return out


def summarize(rows: list[dict[str, float]], h: int) -> dict[str, Any]:
    if len(rows) < 10:
        return {"weeks": len(rows), "testable": False}
    gaps = [row["add_trim"] for row in rows]
    step = h // 5 + 1
    holds = [row["hold_all"] for row in rows if row["hold_all"] == row["hold_all"]]
    return {
        "weeks": len(rows),
        "testable": True,
        "add_minus_trim_pct": round(100 * statistics.fmean(gaps), 2),
        **non_overlapping(gaps, step),
        "add_vs_all_pct": round(100 * statistics.fmean(row["add_all"] for row in rows), 2),
        "hold_vs_all_pct": round(100 * statistics.fmean(holds), 2) if holds else None,
        "trim_vs_all_pct": round(100 * statistics.fmean(row["trim_all"] for row in rows), 2),
        "weeks_add_beats_trim_pct": round(100 * sum(1 for g in gaps if g > 0) / len(gaps), 0),
        "avg_names": [round(statistics.fmean(row["n_add"] for row in rows)), round(statistics.fmean(row["n_trim"] for row in rows))],
    }


def churn(calls: dict[int, dict[str, str]], changes: dict[int, int], lo: int, hi: int) -> dict[str, Any]:
    stock_weeks = sum(len(calls.get(i, {})) for i in range(lo, hi))
    share: dict[str, int] = defaultdict(int)
    for i in range(lo, hi):
        for call in calls.get(i, {}).values():
            share[call] += 1
    total_changes = sum(changes.get(i, 0) for i in range(lo, hi))
    return {
        "stock_years": round(stock_weeks / 52, 1),
        "changes_per_stock_year": round(total_changes / (stock_weeks / 52), 2) if stock_weeks else None,
        "time_share_pct": {c: round(100 * share[c] / stock_weeks, 1) if stock_weeks else 0.0 for c in (ce.ADD, ce.HOLD, ce.TRIM)},
    }


def family_spreads(panel: list[dict[str, Any]], votes: dict[int, dict[str, dict[str, int]]], lo: int, hi: int, h: int) -> dict[str, Any]:
    """Each family on its own: forward return of its top third minus its bottom third."""
    out = {}
    for family in ce.FAMILY_ORDER:
        gaps = []
        for index in range(lo, hi):
            up, down = [], []
            for symbol, fam in votes.get(index, {}).items():
                f = panel[index]["stocks"][symbol]["fwd"].get(h)
                if f is None or family not in fam:
                    continue
                (up if fam[family] == 1 else down if fam[family] == -1 else []).append(f)
            if family == "insider":
                rest = [panel[index]["stocks"][s]["fwd"].get(h) for s, fam in votes.get(index, {}).items() if fam.get("insider") == 0]
                down = [f for f in rest if f is not None]
            if len(up) >= MIN_NAMES and len(down) >= MIN_NAMES:
                gaps.append(statistics.fmean(up) - statistics.fmean(down))
        if len(gaps) >= 10:
            out[family] = {"weeks": len(gaps), "gap_pct": round(100 * statistics.fmean(gaps), 2), **non_overlapping(gaps, h // 5 + 1)}
        else:
            out[family] = {"weeks": len(gaps), "testable": False}
    return out


# --------------------------------------------------------------------------
# pre-registered survival test
# --------------------------------------------------------------------------

T_BAR = 2.0


def survival(results: dict[str, Any]) -> list[tuple[str, bool, str]]:
    """The pre-registered conditions a number must pass before any copy may quote it."""
    h = PRIMARY_HORIZON
    checks = []

    def get(period: str, subset: str) -> dict[str, Any]:
        return results[period][subset][h]

    for label, period, subset, need_t in (
        ("holdout, all stocks", "holdout", "raw", True),
        ("holdout, sector x size demeaned", "holdout", "demeaned", True),
        ("holdout, 200 largest", "holdout", "top200", False),
        ("holdout, banks/brokers/insurers/REITs", "holdout", "financials", False),
        ("development half, all stocks", "dev", "raw", False),
    ):
        row = get(period, subset)
        if not row.get("testable"):
            checks.append((label, False, f"not testable ({row.get('weeks')} weeks with {MIN_NAMES}+ ADD and TRIM names)"))
            continue
        ok = row["add_minus_trim_pct"] > 0 and (not need_t or (row["t_median"] or 0) >= T_BAR)
        detail = f"gap {row['add_minus_trim_pct']:+.2f}%, non-overlapping t {row['t_median']:+.2f} [{row['t_min']:+.2f}, {row['t_max']:+.2f}], {row['periods']} periods"
        checks.append((label, ok, detail + (f" (needs > 0 and t >= {T_BAR})" if need_t else " (needs > 0)")))
    return checks


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

SUBSETS = ("raw", "demeaned", "top200", "financials", "ex_financials")


def evaluate(panel: list[dict[str, Any]], replayed: dict[str, Any], periods: dict[str, tuple[int, int]]) -> dict[str, Any]:
    calls = replayed["calls"]
    big = {i: largest(panel[i]) for i in range(len(panel))}
    keeps: dict[str, Any] = {
        "raw": None,
        "demeaned": None,
        "top200": lambda i, s: s in big[i],
        "financials": lambda i, s: panel[i]["stocks"][s]["model"] in FIN_MODELS,
        "ex_financials": lambda i, s: panel[i]["stocks"][s]["model"] not in FIN_MODELS,
    }
    out: dict[str, Any] = {}
    for period, (lo, hi) in periods.items():
        out[period] = {"churn": churn(calls, replayed["changes"], lo, hi), "days": [panel[lo]["day"], panel[hi - 1]["day"]]}
        for subset in SUBSETS:
            out[period][subset] = {h: summarize(spread_series(panel, calls, lo, hi, h, keep=keeps[subset], demean=subset == "demeaned"), h) for h in HORIZONS}
        out[period]["families"] = {h: family_spreads(panel, replayed["votes"], lo, hi, h) for h in HORIZONS}
    return out


def print_period(name: str, block: dict[str, Any]) -> None:
    print(f"\n== {name}: {block['days'][0]} .. {block['days'][1]}  churn {block['churn']}")
    for subset in SUBSETS:
        for h in HORIZONS:
            r = block[subset][h]
            if not r.get("testable"):
                print(f"  {subset:13s} h={h:3d}: not testable ({r['weeks']} weeks)")
                continue
            print(
                f"  {subset:13s} h={h:3d}: ADD-TRIM {r['add_minus_trim_pct']:+6.2f}%  non-overlapping t {r['t_median']:+.2f} [{r['t_min']:+.2f},{r['t_max']:+.2f}] n={r['periods']:2d}"
                f" | vs all: ADD {r['add_vs_all_pct']:+.2f} HOLD {r['hold_vs_all_pct']:+.2f} TRIM {r['trim_vs_all_pct']:+.2f} | ADD>TRIM {r['weeks_add_beats_trim_pct']:.0f}% of {r['weeks']} weeks | names {r['avg_names']}"
            )
    for h in HORIZONS:
        fams = block["families"][h]
        print(f"  each family alone, top third minus bottom third (insider: buyers minus the rest), h={h}: " + "; ".join(
            f"{f} {v['gap_pct']:+.2f}% t {v['t_median']:+.2f}" if v.get("gap_pct") is not None else f"{f} n/a" for f, v in fams.items()
        ))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--panel-cache", help="pickle the weekly panel here and reuse it")
    parser.add_argument("--show-holdout", metavar="PREREG", help="pre-registration file; without it only the development half is shown")
    parser.add_argument("--out", help="write the report as JSON")
    args = parser.parse_args()

    cache = Path(args.panel_cache) if args.panel_cache else None
    if cache and cache.exists():
        built = pickle.loads(cache.read_bytes())
        print(f"panel loaded from {cache}")
    else:
        built = build_panel(Path(args.data_dir))
        if cache:
            cache.write_bytes(pickle.dumps(built))
    panel = built["panel"]
    days = [week["day"] for week in panel]
    first = next(i for i, d in enumerate(days) if d >= DEV_START)
    middle = next(i for i, d in enumerate(days) if d >= SPLIT_DAY)
    print(f"{built['n_stocks']} stocks, {len(panel)} weekly dates {days[0]}..{days[-1]}; development {days[first]}..{days[middle - 1]}, holdout {days[middle]}..{days[-1]}")
    print("limits: listed-today universe (no delisted names), today's sector labels, market caps rebuilt from filed share counts, decision close = start of the forward return")

    replayed = replay(panel)
    periods = {"dev": (first, middle)}
    if args.show_holdout:
        prereg = Path(args.show_holdout)
        if not prereg.exists():
            raise SystemExit(f"pre-registration file {prereg} does not exist: write it before looking at the holdout")
        stamp = datetime.fromtimestamp(prereg.stat().st_mtime, tz=timezone.utc).isoformat()
        print(f"pre-registration: {prereg} modified {stamp} sha256 {hashlib.sha256(prereg.read_bytes()).hexdigest()}")
        periods.update({"holdout": (middle, len(panel)), "whole": (first, len(panel))})
    results = evaluate(panel, replayed, periods)
    for name in periods:
        print_period(name, results[name])
    if "holdout" in results:
        checks = survival(results)
        print("\nPRE-REGISTERED SURVIVAL TEST (h=126 ADD minus TRIM):")
        for label, ok, detail in checks:
            print(f"  {'PASS' if ok else 'FAIL'}  {label}: {detail}")
        verdict = all(ok for _, ok, _ in checks)
        print(f"  verdict: {'a gap may be quoted' if verdict else 'no return gap, t-stat or win rate may be quoted'}")
        results["survival"] = {"checks": checks, "quotable": verdict}
    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=1, default=str))
        print(f"\nreport written to {args.out}")


if __name__ == "__main__":
    main()
