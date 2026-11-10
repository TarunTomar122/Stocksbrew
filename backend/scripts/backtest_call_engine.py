"""Walk-forward factor research for the call engine (read-only, local files).

Builds a weekly point-in-time panel for the covered universe and lets the data
choose the factors:

  1. Per factor: rank IC against 1/3/6/12-month forward returns with
     Newey-West t-stats, top-minus-bottom quintile spread, IC by third of the
     sample, and month-to-month rank autocorrelation (a turnover proxy). Run on
     the whole universe and on the 200 largest names at each date.
  2. Walk-forward composite: at each month only the forward returns that had
     already completed are used to pick factors (expanding window, IC t-stat
     above a bar) and to weight them (half equal, half IC-proportional). No
     optimiser. The composite is evaluated only on dates after its selection.
  3. Calls are not replayed here any more: call engine v3 is a per-family
     scorecard, checked by ``backtest_call_engine_v3.py`` (this script's
     v2 call replay was removed with v2).

Point-in-time rules: fundamentals are used from their SEC filing date; the
earnings reaction from the close after the report window; insider purchases
from their filing date; prices up to the decision close only.

Known limits, stated in the output too: the universe is the tickers covered
today (no delisted names), sectors are today's classification, and the
decision price is the same close the forward return starts from.

Usage:
  python3 -m backend.scripts.backtest_call_engine --data-dir <dir> [--out report.json]

``--data-dir`` holds prices.json, sec/, splits.json, raw_monthly.json,
insider/insider_buys.json and screener_rows.json (see the fetch jobs).
"""

from __future__ import annotations

import argparse
import json
import math
import pickle
import statistics
from bisect import bisect_right
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from backend import call_factors as cf
from backend.agentdata.insider_history import cluster_buyers

BENCHMARK = "SPY"
EXCLUDE = {"SPY", "QQQ"}
HORIZONS = (21, 63, 126, 252)
RETURN_CAP = 3.0
TIMING_ONLY = {"reversal_1m"}  # measured, but never part of the composite
SELECTION_HORIZON = 63
MIN_HISTORY_MONTHS = 36
T_BAR = 2.0
LARGE_CAP_N = 200


# --------------------------------------------------------------------------
# statistics
# --------------------------------------------------------------------------

def rank_ic(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 20:
        return float("nan")

    def ranks(values: list[float]) -> list[float]:
        order = sorted(range(n), key=lambda i: values[i])
        out = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and values[order[j + 1]] == values[order[i]]:
                j += 1
            for k in range(i, j + 1):
                out[order[k]] = (i + j) / 2
            i = j + 1
        return out

    rx, ry = ranks(xs), ranks(ys)
    mean = (n - 1) / 2
    num = sum((a - mean) * (b - mean) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mean) ** 2 for a in rx) * sum((b - mean) ** 2 for b in ry))
    return num / den if den else float("nan")


def nw_tstat(series: list[float], lags: int) -> float:
    """t-stat of the mean with Newey-West errors (overlapping forward windows)."""
    values = [v for v in series if v == v]
    n = len(values)
    if n < 8:
        return float("nan")
    mean = sum(values) / n
    dev = [v - mean for v in values]
    variance = sum(d * d for d in dev) / n
    for lag in range(1, min(lags, n - 1) + 1):
        cov = sum(dev[i] * dev[i - lag] for i in range(lag, n)) / n
        variance += 2 * (1 - lag / (lags + 1)) * cov
    return mean / math.sqrt(variance / n) if variance > 0 else float("nan")


def mean(values: list[float]) -> float:
    values = [v for v in values if v == v]
    return sum(values) / len(values) if values else float("nan")


# --------------------------------------------------------------------------
# panel
# --------------------------------------------------------------------------

def load_inputs(data_dir: Path) -> dict[str, Any]:
    prices = json.loads((data_dir / "prices.json").read_text())
    rows = json.loads((data_dir / "screener_rows.json").read_text()) if (data_dir / "screener_rows.json").exists() else {}
    splits = json.loads((data_dir / "splits.json").read_text()) if (data_dir / "splits.json").exists() else {}
    raw = json.loads((data_dir / "raw_monthly.json").read_text()) if (data_dir / "raw_monthly.json").exists() else {}
    insider_path = data_dir / "insider" / "insider_buys.json"
    insiders = json.loads(insider_path.read_text()) if insider_path.exists() else {}
    return {"prices": prices, "rows": rows, "splits": splits, "raw": raw, "insiders": insiders}


def split_factor_after(splits: list[list[Any]] | None, day: str) -> float:
    factor = 1.0
    for split_day, ratio in splits or []:
        if split_day > day and ratio and ratio > 0:
            factor *= ratio
    return factor


class RawRatio:
    """raw close / adjusted close by month: undoes the dividend adjustment so
    market cap uses the price people actually paid."""

    def __init__(self, rows: list[list[Any]] | None) -> None:
        rows = [row for row in rows or [] if row[1] and row[2]]
        self.days = [row[0] for row in rows]
        self.ratio = [row[1] / row[2] for row in rows]

    def at(self, day: str) -> float:
        i = bisect_right(self.days, day) - 1
        if i < 0:
            return self.ratio[0] if self.ratio else 1.0
        return self.ratio[i]


def build_panel(data_dir: Path, log: Any = print) -> dict[str, Any]:
    inputs = load_inputs(data_dir)
    prices = inputs["prices"]
    bench = prices[BENCHMARK]
    calendar: list[str] = bench["dates"]
    bench_by_day = dict(zip(bench["dates"], bench["closes"]))
    sec_dir = data_dir / "sec"

    stocks: dict[str, dict[str, Any]] = {}
    for symbol in sorted(prices):
        if symbol in EXCLUDE or symbol.startswith("^"):
            continue
        sec_path = sec_dir / f"{symbol}.json"
        if not sec_path.exists():
            continue  # ETFs and foreign filers without XBRL: no fundamentals, not a stock call
        series = cf.PriceSeries(prices[symbol]["dates"], prices[symbol]["closes"], bench_by_day)
        if len(series.closes) < 300:
            continue
        doc = json.loads(sec_path.read_text())
        row = inputs["rows"].get(symbol) or {}
        stocks[symbol] = {
            "prices": series,
            "fund": cf.Fundamentals(doc),
            "sector": row.get("sector") or (f"sic{str(doc.get('sic') or '')[:2]}" if doc.get("sic") else ""),
            "splits": inputs["splits"].get(symbol) or [],
            "raw": RawRatio(inputs["raw"].get(symbol)),
            "insiders": inputs["insiders"].get(symbol) or [],
            "ey_history": [],
            "market_cap_now": row.get("market_cap"),
        }
    log(f"stocks with prices and SEC facts: {len(stocks)}")
    sector_of = {symbol: item["sector"] for symbol, item in stocks.items()}

    # decision dates: the first session of each ISO week
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
        raw_by_factor: dict[str, dict[str, float]] = defaultdict(dict)
        info: dict[str, dict[str, Any]] = {}
        monthly = count % 4 == 0
        for symbol, item in stocks.items():
            series: cf.PriceSeries = item["prices"]
            i = series.index_on(day, max_stale_days=0)
            if i is None:
                continue
            price = series.features(i)
            if not price:
                continue
            fund = item["fund"].as_of(day)
            market_cap = None
            if fund and fund.get("shares"):
                market_cap = fund["shares"] * split_factor_after(item["splits"], fund["shares_date"]) * series.closes[i] * item["raw"].at(day)
            reaction = cf.earnings_reaction(series, i, item["fund"].last_earnings_date(day))
            buyers = cluster_buyers(item["insiders"], day) if item["insiders"] else 0
            raw = cf.raw_factors(
                price,
                fund,
                market_cap=market_cap,
                day=day,
                reaction=reaction,
                insider_buyers=buyers,
                earnings_yield_history=item["ey_history"][-60:],
            )
            if monthly and "earnings_yield" in raw:
                item["ey_history"].append(raw["earnings_yield"])
            for name, value in raw.items():
                raw_by_factor[name][symbol] = value
            fwd = {}
            for h in HORIZONS:
                if i + h < len(series.closes) and series.dates[i + h] == calendar[min(cal_index + h, len(calendar) - 1)]:
                    fwd[h] = min(RETURN_CAP, series.closes[i + h] / series.closes[i] - 1)
            info[symbol] = {"fwd": fwd, "mcap": market_cap, "sigma": price["sigma_daily"]}
        # Insider buying is mostly zero: only rank it where someone bought, everyone else is neutral.
        scores = {name: cf.rank_scores(values, sector_of) for name, values in raw_by_factor.items() if name != "insider_buying"}
        if "insider_buying" in raw_by_factor:
            scores["insider_buying"] = {s: (1.0 if v >= 3 else 0.5 if v >= 2 else 0.0) for s, v in raw_by_factor["insider_buying"].items()}
        bench_fwd = {
            h: bench["closes"][cal_index + h] / bench["closes"][cal_index] - 1
            for h in HORIZONS
            if cal_index + h < len(calendar)
        }
        panel.append({"day": day, "cal_index": cal_index, "monthly": monthly, "scores": scores, "info": info, "bench_fwd": bench_fwd})
        if log and count % 60 == 0:
            log(f"panel {day}: {len(info)} stocks, {len(scores)} factors")

    # sanity: reconstructed market cap versus today's screener value
    ratios = []
    last = panel[-1]["info"]
    for symbol, item in stocks.items():
        now = item["market_cap_now"]
        mine = (last.get(symbol) or {}).get("mcap")
        if now and mine:
            ratios.append(mine / now)
    check = {"n": len(ratios), "median_ratio": round(statistics.median(ratios), 3) if ratios else None, "within_15pct": round(100 * sum(1 for r in ratios if 0.85 <= r <= 1.15) / len(ratios), 1) if ratios else None}
    log(f"market cap check versus screener: {check}")
    return {"panel": panel, "sector_of": sector_of, "calendar": calendar, "mcap_check": check, "n_stocks": len(stocks)}


# --------------------------------------------------------------------------
# factor evaluation
# --------------------------------------------------------------------------

def large_caps(row: dict[str, Any], n: int = LARGE_CAP_N) -> set[str]:
    ranked = sorted(((item["mcap"], symbol) for symbol, item in row["info"].items() if item.get("mcap")), reverse=True)
    return {symbol for _, symbol in ranked[:n]}


def factor_ic_series(panel: list[dict[str, Any]], factor: str, horizon: int, *, subset: str = "all") -> list[tuple[int, float, float]]:
    """Per monthly date: (panel index, rank IC, top-minus-bottom quintile return)."""
    out = []
    for index, row in enumerate(panel):
        if not row["monthly"]:
            continue
        scores = row["scores"].get(factor) or {}
        keep = large_caps(row) if subset == "large" else None
        xs, ys = [], []
        for symbol, score in scores.items():
            if keep is not None and symbol not in keep:
                continue
            fwd = row["info"][symbol]["fwd"].get(horizon)
            if fwd is not None:
                xs.append(score)
                ys.append(fwd)
        if len(xs) < (60 if subset == "all" else 40):
            continue
        ic = rank_ic(xs, ys)
        order = sorted(range(len(xs)), key=lambda i: xs[i])
        fifth = max(1, len(order) // 5)
        spread = mean([ys[i] for i in order[-fifth:]]) - mean([ys[i] for i in order[:fifth]])
        if factor == "insider_buying":
            # Not a ranking: buyers versus everyone else.
            buyers = [y for x, y in zip(xs, ys) if x > 0]
            rest = [y for x, y in zip(xs, ys) if x <= 0]
            if len(buyers) < 5:
                continue
            spread = mean(buyers) - mean(rest)
        out.append((index, ic, spread))
    return out


def factor_table(panel: list[dict[str, Any]], factors: list[str], subset: str = "all") -> dict[str, Any]:
    table: dict[str, Any] = {}
    for factor in factors:
        entry: dict[str, Any] = {}
        for h in HORIZONS:
            series = factor_ic_series(panel, factor, h, subset=subset)
            ics = [ic for _, ic, _ in series]
            spreads = [s for _, _, s in series]
            lags = max(0, h // 21 - 1)
            entry[h] = {
                "months": len(ics),
                "ic": round(mean(ics), 4),
                "ic_t": round(nw_tstat(ics, lags), 2),
                "spread_pct": round(100 * mean(spreads), 2),
                "spread_t": round(nw_tstat(spreads, lags), 2),
            }
            if h == SELECTION_HORIZON and ics:
                third = max(1, len(ics) // 3)
                entry["ic_by_third"] = [round(mean(ics[:third]), 3), round(mean(ics[third : 2 * third]), 3), round(mean(ics[2 * third :]), 3)]
        # month-to-month rank autocorrelation
        auto = []
        previous = None
        for row in panel:
            if not row["monthly"]:
                continue
            current = row["scores"].get(factor) or {}
            if previous:
                common = [s for s in current if s in previous]
                if len(common) >= 60:
                    auto.append(rank_ic([previous[s] for s in common], [current[s] for s in common]))
            previous = current
        entry["rank_autocorr_1m"] = round(mean(auto), 3)
        coverage = [len(row["scores"].get(factor) or {}) / max(1, len(row["info"])) for row in panel if row["monthly"]]
        entry["coverage_pct"] = round(100 * mean(coverage), 0)
        table[factor] = entry
    return table


# --------------------------------------------------------------------------
# walk-forward composite
# --------------------------------------------------------------------------

def walk_forward_weights(panel: list[dict[str, Any]], factors: list[str], t_bar: float = T_BAR) -> dict[int, dict[str, float]]:
    """Panel index (monthly rows) -> factor weights chosen from data that had
    fully played out before that date."""
    series = {factor: factor_ic_series(panel, factor, SELECTION_HORIZON) for factor in factors if factor not in TIMING_ONLY}
    weights_at: dict[int, dict[str, float]] = {}
    monthly_rows = [index for index, row in enumerate(panel) if row["monthly"]]
    for position, index in enumerate(monthly_rows):
        cutoff = panel[index]["cal_index"] - SELECTION_HORIZON
        chosen: dict[str, float] = {}
        for factor, rows in series.items():
            known = [ic for row_index, ic, _ in rows if panel[row_index]["cal_index"] <= cutoff and ic == ic]
            if len(known) < MIN_HISTORY_MONTHS:
                continue
            t = nw_tstat(known, SELECTION_HORIZON // 21 - 1)
            if t == t and t >= t_bar and mean(known) > 0:
                chosen[factor] = mean(known)
        if chosen:
            total = sum(chosen.values())
            k = len(chosen)
            weights_at[index] = {factor: 0.5 / k + 0.5 * value / total for factor, value in chosen.items()}
    return weights_at


def attach_composite(panel: list[dict[str, Any]], weights_at: dict[int, dict[str, float]]) -> list[int]:
    """Store the composite on each weekly row using the latest monthly weights
    chosen on or before it. Returns the indices that have one."""
    out = []
    current: dict[str, float] | None = None
    for index, row in enumerate(panel):
        if index in weights_at:
            current = weights_at[index]
        if not current:
            continue
        result = cf.composite(row["scores"], current, row["info"].keys(), min_coverage=0.6)
        if len(result) < 100:
            continue
        pct = cf.percentile_ranks({symbol: item["score"] for symbol, item in result.items()})
        row["composite"] = {symbol: pct[symbol] for symbol in result}
        row["weights"] = current
        out.append(index)
    return out


def composite_table(panel: list[dict[str, Any]], indices: list[int], subset: str = "all") -> dict[str, Any]:
    out: dict[str, Any] = {}
    for h in HORIZONS:
        ics, spreads, quintiles = [], [], [[] for _ in range(5)]
        for index in indices:
            row = panel[index]
            if not row["monthly"]:
                continue
            keep = large_caps(row) if subset == "large" else None
            xs, ys = [], []
            for symbol, pct in row["composite"].items():
                if keep is not None and symbol not in keep:
                    continue
                fwd = row["info"][symbol]["fwd"].get(h)
                if fwd is not None:
                    xs.append(pct)
                    ys.append(fwd)
            if len(xs) < 50:
                continue
            universe = mean(ys)
            order = sorted(range(len(xs)), key=lambda i: xs[i])
            fifth = len(order) // 5
            for q in range(5):
                members = order[q * fifth : (q + 1) * fifth] if q < 4 else order[4 * fifth :]
                quintiles[q].append(mean([ys[i] for i in members]) - universe)
            ics.append(rank_ic(xs, ys))
            spreads.append(quintiles[4][-1] - quintiles[0][-1])
        lags = max(0, h // 21 - 1)
        out[h] = {
            "months": len(ics),
            "ic": round(mean(ics), 4),
            "ic_t": round(nw_tstat(ics, lags), 2),
            "quintile_excess_pct": [round(100 * mean(q), 2) for q in quintiles],
            "top_minus_bottom_pct": round(100 * mean(spreads), 2),
            "top_minus_bottom_t": round(nw_tstat(spreads, lags), 2),
            "months_positive_pct": round(100 * sum(1 for s in spreads if s > 0) / len(spreads), 0) if spreads else None,
        }
    return out


# A fixed, literature-prior composite: five families, equal weight, factors
# equal within a family. Nothing here was chosen from this data set, so the
# whole period is a test of it.
FAMILY_WEIGHTS: dict[str, float] = {
    "momentum_12_1": 0.10, "residual_momentum": 0.10,
    "gross_profitability": 0.10, "low_accruals": 0.10,
    "earnings_yield": 0.2 / 3, "fcf_yield": 0.2 / 3, "sales_yield": 0.2 / 3,
    "low_asset_growth": 0.10, "low_net_issuance": 0.10,
    "earnings_surprise": 0.10, "earnings_reaction": 0.10,
}


def fixed_weights(panel: list[dict[str, Any]], weights: dict[str, float]) -> dict[int, dict[str, float]]:
    """The same weights from the first monthly row with three years of history."""
    monthly_rows = [index for index, row in enumerate(panel) if row["monthly"]]
    return {monthly_rows[MIN_HISTORY_MONTHS]: dict(weights)} if len(monthly_rows) > MIN_HISTORY_MONTHS else {}


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def print_factor_table(title: str, table: dict[str, Any]) -> None:
    print(f"\n{title}")
    print(f"  {'factor':24s} cover  " + "  ".join(f"IC{h:>3}d  (t)  Q5-Q1%  (t) " for h in (21, 63, 126, 252)) + "  IC thirds (63d)        autocorr")
    for factor, entry in sorted(table.items(), key=lambda item: -(item[1][63]["ic_t"] if item[1][63]["ic_t"] == item[1][63]["ic_t"] else -9)):
        cells = "  ".join(f"{entry[h]['ic']:+.3f} {entry[h]['ic_t']:+5.1f} {entry[h]['spread_pct']:+6.2f} {entry[h]['spread_t']:+5.1f}" for h in (21, 63, 126, 252))
        print(f"  {factor:24s} {entry['coverage_pct']:4.0f}%  {cells}  {str(entry.get('ic_by_third')):22s} {entry['rank_autocorr_1m']:+.2f}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--out", help="write the report as JSON")
    parser.add_argument("--panel-cache", help="pickle the weekly panel here and reuse it on the next run")
    parser.add_argument("--t-bar", type=float, default=T_BAR, help="walk-forward IC t-stat a factor needs to enter the composite")
    parser.add_argument("--skip-factor-tables", action="store_true")
    parser.add_argument("--fixed", choices=("families",), help="skip selection: test the literature-prior family composite")
    args = parser.parse_args()
    data_dir = Path(args.data_dir)

    cache = Path(args.panel_cache) if args.panel_cache else None
    if cache and cache.exists():
        built = pickle.loads(cache.read_bytes())
        print(f"panel loaded from {cache}")
    else:
        built = build_panel(data_dir)
        if cache:
            cache.write_bytes(pickle.dumps(built))
    panel = built["panel"]
    factors = sorted({name for row in panel for name in row["scores"]})
    print(f"{built['n_stocks']} stocks, {len(panel)} weekly dates {panel[0]['day']}..{panel[-1]['day']}, {len(factors)} factors")
    report: dict[str, Any] = {"stocks": built["n_stocks"], "dates": [panel[0]["day"], panel[-1]["day"]], "mcap_check": built["mcap_check"]}

    if not args.skip_factor_tables:
        report["factors_all"] = factor_table(panel, factors)
        print_factor_table("FACTORS, whole universe (monthly rank IC, Newey-West t; Q5-Q1 = top minus bottom fifth forward return)", report["factors_all"])
        report["factors_large"] = factor_table(panel, factors, subset="large")
        print_factor_table(f"FACTORS, {LARGE_CAP_N} largest by market cap at each date", report["factors_large"])

    if args.fixed:
        weights_at = fixed_weights(panel, FAMILY_WEIGHTS)
        print(f"\nFIXED WEIGHTS ({args.fixed}): no selection from this data")
    else:
        weights_at = walk_forward_weights(panel, factors, args.t_bar)
    indices = attach_composite(panel, weights_at)
    if not indices:
        print("\nno factor cleared the bar in any month: no composite")
        return
    first, last = indices[0], indices[-1]
    print(f"\nWALK-FORWARD COMPOSITE: selection needs {MIN_HISTORY_MONTHS} months of completed {SELECTION_HORIZON}-session ICs with t >= {args.t_bar}")
    print(f"  out-of-sample dates {panel[first]['day']}..{panel[last]['day']} ({len(indices)} weeks)")
    usage: dict[str, int] = defaultdict(int)
    for weights in weights_at.values():
        for factor in weights:
            usage[factor] += 1
    print("  months each factor was selected:", dict(sorted(usage.items(), key=lambda item: -item[1])), "of", len(weights_at))
    print("  weights at the last date:", {k: round(v, 3) for k, v in sorted(panel[last]["weights"].items(), key=lambda item: -item[1])})
    report["selection_months"] = dict(usage)
    report["final_weights"] = panel[last]["weights"]
    for subset in ("all", "large"):
        table = composite_table(panel, indices, subset)
        report[f"composite_{subset}"] = table
        print(f"\n  composite, {'whole universe' if subset == 'all' else f'{LARGE_CAP_N} largest'} (excess over the equal-weight universe):")
        for h in HORIZONS:
            row = table[h]
            print(f"    {h:>3}d: IC {row['ic']:+.3f} (t {row['ic_t']:+.1f}, {row['months']} months)  quintiles {row['quintile_excess_pct']}  top-bottom {row['top_minus_bottom_pct']:+.2f}% (t {row['top_minus_bottom_t']:+.1f}), positive {row['months_positive_pct']}% of months")

    # ADD / HOLD / TRIM calls are checked by backtest_call_engine_v3.py, which
    # replays call engine v3's own rule; this script is factor research only.
    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=1, default=str))
        print(f"\nreport written to {args.out}")


if __name__ == "__main__":
    main()
