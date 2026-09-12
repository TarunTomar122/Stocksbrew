"""Factor lab: search for predictive combos in our own data (read-only).

Builds a cross-sectional panel of causal features for every US stock at every
trading day, then:

  1. IC report: correlation of each feature with next-month relative return
     (computed cross-sectionally per day, averaged across days, with a t-stat).
  2. Quintile tables for the strongest features: does the top bucket beat the
     bottom bucket consistently, per month.
  3. Greedy composite: orient features by the sign of their IC, combine the
     best subset with equal z-score weights, report IC + quintile spread.
  4. Monthly portfolio simulation: at each month end, equal-weight the top 20
     names by the composite, hold 21 sessions, compare with SPX. Illustrative,
     in-sample, tiny window.

Everything is causal: features at day i only use bars up to i. Usage on VPS:

  LOCALDB_PATH=/srv/tikrr-data/localdb/documents.sqlite3 \
    python3 -m backend.scripts.audit_factor_lab --write-report
"""

from __future__ import annotations

import argparse
import json
import math
import os
from collections import defaultdict
from typing import Any, Callable

from backend.scripts.audit_technical_baseline import (
    SIGNAL,
    baseline_rating_series,
    load_store_rows,
)

LOOKBACK = 21
FORWARD = 21
MIN_BARS = 25


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = _mean(values)
    return math.sqrt(sum((v - mean) ** 2 for v in values) / (len(values) - 1))


def _corr(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 3:
        return 0.0
    mx, my = _mean(xs), _mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ys))
    return num / (den_x * den_y) if den_x > 0 and den_y > 0 else 0.0


# ─── features (causal, per instrument) ────────────────────────────────────────

def build_feature_matrix(bars: list[dict[str, Any]]) -> dict[str, list[float | None]]:
    closes = [b["close"] for b in bars]
    volumes = [b["volume"] for b in bars]
    n = len(closes)
    ratings = baseline_rating_series(bars)

    def ret(offset: int, i: int) -> float | None:
        if i - offset < 0 or closes[i - offset] <= 0:
            return None
        return (closes[i] / closes[i - offset] - 1) * 100

    def momentum(i: int) -> list[float]:
        window = closes[i - LOOKBACK + 1 : i + 1]
        return [window[j] / window[j - 1] - 1 for j in range(1, len(window)) if window[j - 1] > 0]

    features: dict[str, list[float | None]] = {
        "trailing_1m_return": [ret(LOOKBACK, i) for i in range(n)],
        "trailing_3m_return": [ret(63, i) for i in range(n)],
        "trailing_1w_return": [ret(5, i) for i in range(n)],
        "baseline_score": [ratings[i]["score"] for i in range(n)],
        "baseline_ma_score": [ratings[i]["ma_score"] for i in range(n)],
        "baseline_osc_score": [ratings[i]["osc_score"] for i in range(n)],
        "volatility_1m": [(_std(momentum(i)) * 100 if i >= LOOKBACK else None) for i in range(n)],
        "volume_ratio": [
            (
                _mean(volumes[i - 4 : i + 1]) / _mean(volumes[i - LOOKBACK + 1 : i + 1])
                if i >= LOOKBACK and _mean(volumes[i - LOOKBACK + 1 : i + 1]) > 0
                else None
            )
            for i in range(n)
        ],
        "dist_from_1m_high": [
            (
                (closes[i] / max(closes[i - LOOKBACK + 1 : i + 1]) - 1) * 100
                if i >= LOOKBACK
                else None
            )
            for i in range(n)
        ],
        "dist_from_1m_low": [
            (
                (closes[i] / min(closes[i - LOOKBACK + 1 : i + 1]) - 1) * 100
                if i >= LOOKBACK
                else None
            )
            for i in range(n)
        ],
        "rsi_proxy": [
            (
                100
                * sum(1 for j in range(i - LOOKBACK + 1, i + 1) if closes[j] > closes[j - 1])
                / LOOKBACK
                if i >= LOOKBACK
                else None
            )
            for i in range(n)
        ],
        "sma20_gap": [
            (
                (closes[i] / _mean(closes[i - 19 : i + 1]) - 1) * 100
                if i >= 20
                else None
            )
            for i in range(n)
        ],
        "sma50_gap": [
            (
                (closes[i] / _mean(closes[i - 49 : i + 1]) - 1) * 100
                if i >= 50
                else None
            )
            for i in range(n)
        ],
    }
    return features


# ─── panel ────────────────────────────────────────────────────────────────────

def build_panel(
    bars_by_instrument: dict[str, list[dict[str, Any]]],
    calls: list[dict[str, Any]],
    sectors: dict[str, str],
) -> list[dict[str, Any]]:
    vibe_calls: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for call in calls:
        iid = str(call.get("instrument_id") or "")
        day = str(call.get("call_date") or "")[:10]
        stance = str(call.get("stance") or "")
        if iid and day and stance in SIGNAL:
            vibe_calls[iid][day].append(float(SIGNAL[stance]))
    vibe_by_day = {
        iid: {day: _mean(vals) for day, vals in days.items()}
        for iid, days in vibe_calls.items()
    }

    benchmark = bars_by_instrument.get("US_IDX_SPX") or []
    bench_by_date = {bar["date"]: bar["close"] for bar in benchmark}

    def bench_return(start_day: str, end_day: str) -> float | None:
        start = bench_close_on_or_after(bench_by_date, start_day)
        end = bench_close_on_or_after(bench_by_date, end_day)
        if start and end and start > 0:
            return (end / start - 1) * 100
        return None

    panel: list[dict[str, Any]] = []
    for iid, bars in bars_by_instrument.items():
        if len(bars) < MIN_BARS or iid == "US_IDX_SPX":
            continue
        features = build_feature_matrix(bars)
        days = [bar["date"] for bar in bars]
        for i in range(MIN_BARS, len(bars) - FORWARD):
            close = bars[i]["close"]
            forward_close = bars[i + FORWARD]["close"]
            if close <= 0 or forward_close <= 0:
                continue
            window_days = days[i - LOOKBACK + 1 : i + 1]
            signals = [
                vibe_by_day[iid][day]
                for day in window_days
                if day in vibe_by_day.get(iid, {})
            ]
            row: dict[str, Any] = {
                "instrument_id": iid,
                "date": days[i],
                "sector": sectors.get(iid, ""),
                "forward_return_pct": (forward_close / close - 1) * 100,
            }
            bench = bench_return(days[i], days[i + FORWARD])
            if bench is not None:
                row["relative_return_pct"] = row["forward_return_pct"] - bench
            for name, series in features.items():
                row[name] = series[i]
            row["vibe_avg"] = _mean(signals) if len(signals) >= 3 else None
            row["vibe_calls"] = len(signals)
            panel.append(row)
    return panel


def bench_close_on_or_after(bench_by_date: dict[str, float], day: str) -> float | None:
    from datetime import date, timedelta

    try:
        base = date.fromisoformat(day)
    except ValueError:
        return None
    for offset in range(5):
        candidate = (base + timedelta(days=offset)).isoformat()
        if candidate in bench_by_date:
            return bench_by_date[candidate]
    return None


# ─── IC + quintiles ───────────────────────────────────────────────────────────

FEATURES = (
    "trailing_1m_return",
    "trailing_3m_return",
    "trailing_1w_return",
    "baseline_score",
    "baseline_ma_score",
    "baseline_osc_score",
    "volatility_1m",
    "volume_ratio",
    "dist_from_1m_high",
    "dist_from_1m_low",
    "rsi_proxy",
    "sma20_gap",
    "sma50_gap",
    "vibe_avg",
)


def compute_ic(panel: list[dict[str, Any]], feature: str, target: str = "relative_return_pct") -> dict[str, Any]:
    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in panel:
        if row.get(feature) is not None and row.get(target) is not None:
            by_day[row["date"]].append(row)
    ics: list[float] = []
    for day, rows in by_day.items():
        if len(rows) < 20:
            continue
        ics.append(_corr([float(r[feature]) for r in rows], [float(r[target]) for r in rows]))
    if not ics:
        return {"feature": feature, "n_days": 0}
    mean_ic = _mean(ics)
    std_ic = _std(ics)
    t_stat = mean_ic / (std_ic / math.sqrt(len(ics))) if std_ic > 0 else 0.0
    return {
        "feature": feature,
        "n_days": len(ics),
        "mean_ic": round(mean_ic, 4),
        "ic_std": round(std_ic, 4),
        "t_stat": round(t_stat, 2),
        "positive_day_pct": round(100 * sum(1 for v in ics if v > 0) / len(ics), 1),
    }


def quintile_returns(panel: list[dict[str, Any]], feature: str, n_buckets: int = 5) -> list[dict[str, Any]]:
    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in panel:
        if row.get(feature) is not None and row.get("relative_return_pct") is not None:
            by_day[row["date"]].append(row)
    bucket_day_returns: dict[int, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for day, rows in by_day.items():
        if len(rows) < n_buckets * 5:
            continue
        rows_sorted = sorted(rows, key=lambda r: float(r[feature]))
        size = len(rows_sorted) // n_buckets
        for bucket in range(n_buckets):
            chunk = rows_sorted[bucket * size : (bucket + 1) * size] if bucket < n_buckets - 1 else rows_sorted[(n_buckets - 1) * size :]
            bucket_day_returns[bucket][day].append(_mean([float(r["relative_return_pct"]) for r in chunk]))
    out: list[dict[str, Any]] = []
    for bucket in sorted(bucket_day_returns):
        day_means = [_mean(v) for v in bucket_day_returns[bucket].values()]
        out.append(
            {
                "bucket": bucket + 1,
                "n_days": len(day_means),
                "avg_relative_pct": round(_mean(day_means), 3),
            }
        )
    return out


def monthly_quintile_returns(panel: list[dict[str, Any]], feature: str, n_buckets: int = 5) -> dict[str, float]:
    """Spread (top bucket minus bottom bucket) per calendar month, date-averaged."""
    by_month_day: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in panel:
        if row.get(feature) is not None and row.get("relative_return_pct") is not None:
            by_month_day[row["date"][:7]][row["date"]].append(row)
    spreads: dict[str, list[float]] = defaultdict(list)
    for month, days in by_month_day.items():
        for rows in days.values():
            if len(rows) < n_buckets * 5:
                continue
            rows_sorted = sorted(rows, key=lambda r: float(r[feature]))
            size = len(rows_sorted) // n_buckets
            bottom = rows_sorted[:size]
            top = rows_sorted[-size:]
            spreads[month].append(
                _mean([float(r["relative_return_pct"]) for r in top])
                - _mean([float(r["relative_return_pct"]) for r in bottom])
            )
    return {month: round(_mean(vals), 3) for month, vals in sorted(spreads.items())}


# ─── greedy composite ─────────────────────────────────────────────────────────

def zscore_by_day(panel: list[dict[str, Any]], feature: str) -> dict[str, float]:
    by_day: dict[str, list[float]] = defaultdict(list)
    for row in panel:
        value = row.get(feature)
        if value is not None:
            by_day[row["date"]].append(float(value))
    stats = {day: (_mean(vals), _std(vals)) for day, vals in by_day.items()}
    out: dict[str, float] = {}
    for row in panel:
        value = row.get(feature)
        if value is None:
            continue
        mean, std = stats.get(row["date"], (0.0, 0.0))
        if std > 0:
            out[f"{row['date']}|{row['instrument_id']}"] = (float(value) - mean) / std
    return out


def composite_score(panel: list[dict[str, Any]], weights: dict[str, float]) -> list[dict[str, Any]]:
    zs = {feature: zscore_by_day(panel, feature) for feature in weights}
    out: list[dict[str, Any]] = []
    for row in panel:
        key = f"{row['date']}|{row['instrument_id']}"
        total = 0.0
        used = 0
        for feature, weight in weights.items():
            z = zs[feature].get(key)
            if z is not None:
                total += weight * z
                used += 1
        if used == len(weights):
            out.append({**row, "composite": total})
    return out


def greedy_features(panel: list[dict[str, Any]], ic_rows: list[dict[str, Any]]) -> dict[str, float]:
    ranked = [row for row in ic_rows if row.get("n_days") and abs(row["mean_ic"]) >= 0.01]
    ranked.sort(key=lambda row: abs(row["mean_ic"]), reverse=True)
    chosen: dict[str, float] = {}
    best_ic = 0.0
    for row in ranked[:8]:
        trial = {**chosen, row["feature"]: 1.0 if row["mean_ic"] >= 0 else -1.0}
        scored = composite_score(panel, trial)
        ic = compute_ic(scored, "composite")["mean_ic"]
        if abs(ic) > abs(best_ic):
            chosen = trial
            best_ic = ic
    return chosen


# ─── monthly portfolio sim ────────────────────────────────────────────────────

def ic_by_month(panel: list[dict[str, Any]], feature: str, target: str = "relative_return_pct") -> dict[str, float]:
    out: dict[str, float] = {}
    months = sorted({row["date"][:7] for row in panel})
    for month in months:
        subset = [row for row in panel if row["date"][:7] == month]
        ic = compute_ic(subset, feature, target)
        if ic.get("n_days"):
            out[month] = ic["mean_ic"]
    return out


def leave_one_month_out(panel: list[dict[str, Any]], features: tuple[str, ...], target: str = "relative_return_pct") -> list[dict[str, Any]]:
    """Pick the composite on all months except one, then score the held-out month."""
    out: list[dict[str, Any]] = []
    months = sorted({row["date"][:7] for row in panel})
    for held_out in months:
        train = [row for row in panel if row["date"][:7] != held_out]
        test = [row for row in panel if row["date"][:7] == held_out]
        if len(train) < 200 or len(test) < 100:
            continue
        ic_rows = [compute_ic(train, feature, target) for feature in features]
        chosen = greedy_features(train, ic_rows)
        if not chosen:
            continue
        scored = composite_score(test, chosen)
        ic = compute_ic(scored, "composite", target)
        out.append(
            {
                "held_out_month": held_out,
                "chosen": chosen,
                "oos_ic": ic.get("mean_ic"),
                "oos_days": ic.get("n_days"),
            }
        )
    return out


def monthly_portfolio(panel: list[dict[str, Any]], weights: dict[str, float], top_n: int = 20) -> list[dict[str, Any]]:
    scored = composite_score(panel, weights)
    by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in scored:
        by_date[row["date"]].append(row)
    # month-end boundaries: last available day per month
    month_end: dict[str, str] = {}
    for day in sorted(by_date):
        month_end[day[:7]] = day

    results: list[dict[str, Any]] = []
    cumulative = 1.0
    cumulative_market = 1.0
    for month, day in sorted(month_end.items()):
        rows = sorted(by_date[day], key=lambda r: r["composite"], reverse=True)[:top_n]
        if len(rows) < 5:
            continue
        portfolio_return = _mean([float(r["forward_return_pct"]) for r in rows])
        market_return = _mean(
            [float(r["forward_return_pct"]) for r in by_date[day]]
        )
        cumulative *= 1 + portfolio_return / 100
        cumulative_market *= 1 + market_return / 100
        results.append(
            {
                "month": month,
                "boundary": day,
                "n": len(rows),
                "portfolio_return_pct": round(portfolio_return, 3),
                "universe_avg_return_pct": round(market_return, 3),
                "excess_pct": round(portfolio_return - market_return, 3),
                "cumulative_portfolio_pct": round((cumulative - 1) * 100, 2),
                "cumulative_universe_pct": round((cumulative_market - 1) * 100, 2),
            }
        )
    return results


def render(
    panel: list[dict[str, Any]],
    ic_rows: list[dict[str, Any]],
    chosen: dict[str, float],
    portfolio: list[dict[str, Any]],
    lomo_rows: list[dict[str, Any]] | None = None,
    size_sweeps: dict[int, list[dict[str, Any]]] | None = None,
) -> str:
    lines: list[str] = []
    lines.append("# factor lab: what actually predicts next month in our data")
    lines.append("")
    days = sorted({row["date"] for row in panel})
    lines.append(
        f"panel: {len(panel)} stock-days | {len(days)} boundaries | {days[0]} to {days[-1]} | "
        f"target: next-21-session return relative to spy"
    )
    lines.append("")
    lines.append("all features are causal (computed from bars up to the boundary). IC = cross-sectional rank correlation with next-month relative return, averaged across days.")
    lines.append("")
    lines.append("## information coefficient by feature")
    lines.append("")
    months = sorted({row["date"][:7] for row in panel})
    header_months = " | ".join(months)
    lines.append(f"| feature | days | mean IC | t-stat | % days positive | IC by month ({header_months}) |")
    lines.append("|---|---:|---:|---:|---:|---|")
    for row in sorted(ic_rows, key=lambda r: -abs(r.get("mean_ic") or 0)):
        if not row.get("n_days"):
            continue
        by_month = ic_by_month(panel, row["feature"])
        month_cells = " | ".join(str(by_month.get(month, "-")) for month in months)
        lines.append(
            f"| {row['feature']} | {row['n_days']} | {row['mean_ic']} | {row['t_stat']} | {row['positive_day_pct']}% | {month_cells} |"
        )
    lines.append("")
    strongest = [row for row in sorted(ic_rows, key=lambda r: -abs(r.get("mean_ic") or 0))[:4] if row.get("n_days")]
    for row in strongest:
        lines.append(f"## quintiles: {row['feature']} (q1 = lowest, q5 = highest)")
        lines.append("")
        lines.append("| bucket | days | avg next-month relative |")
        lines.append("|---|---:|---:|")
        for bucket in quintile_returns(panel, row["feature"]):
            lines.append(f"| q{bucket['bucket']} | {bucket['n_days']} | {bucket['avg_relative_pct']}% |")
        lines.append("")
        lines.append(f"spread by month (q5 minus q1): {json.dumps(monthly_quintile_returns(panel, row['feature']))}")
        lines.append("")
    lines.append("## greedy composite")
    lines.append("")
    lines.append(f"chosen features: {json.dumps(chosen)}")
    lines.append("")
    scored = composite_score(panel, chosen) if chosen else []
    if scored:
        ic = compute_ic(scored, "composite")
        lines.append(f"composite IC: {ic.get('mean_ic')} (t={ic.get('t_stat')}, days={ic.get('n_days')})")
        lines.append("")
        lines.append("| bucket | days | avg next-month relative |")
        lines.append("|---|---:|---:|")
        for bucket in quintile_returns(scored, "composite"):
            lines.append(f"| q{bucket['bucket']} | {bucket['n_days']} | {bucket['avg_relative_pct']}% |")
        lines.append("")
        lines.append(f"spread by month: {json.dumps(monthly_quintile_returns(scored, 'composite'))}")
        lines.append("")
    lines.append("## illustrative monthly portfolio (top 20 by composite, equal weight)")
    lines.append("")
    lines.append("| month | boundary | names | portfolio | universe avg | excess | cumulative portfolio | cumulative universe |")
    lines.append("|---|---|---:|---:|---:|---:|---:|---:|")
    for row in portfolio:
        lines.append(
            f"| {row['month']} | {row['boundary']} | {row['n']} | {row['portfolio_return_pct']}% | "
            f"{row['universe_avg_return_pct']}% | {row['excess_pct']}% | "
            f"{row['cumulative_portfolio_pct']}% | {row['cumulative_universe_pct']}% |"
        )
    lines.append("")
    if size_sweeps:
        lines.append("### portfolio size sweep (cumulative excess vs universe)")
        lines.append("")
        lines.append("| top N | cumulative portfolio | cumulative universe | excess |")
        lines.append("|---:|---:|---:|---:|")
        for size, rows in sorted(size_sweeps.items()):
            if not rows:
                continue
            lines.append(
                f"| {size} | {rows[-1]['cumulative_portfolio_pct']}% | "
                f"{rows[-1]['cumulative_universe_pct']}% | "
                f"{round(rows[-1]['cumulative_portfolio_pct'] - rows[-1]['cumulative_universe_pct'], 2)}% |"
            )
        lines.append("")
    if lomo_rows:
        lines.append("## leave-one-month-out validation (features picked without the scored month)")
        lines.append("")
        lines.append("| held-out month | oos IC | days | chosen features |")
        lines.append("|---|---:|---:|---|")
        for row in lomo_rows:
            lines.append(
                f"| {row['held_out_month']} | {row['oos_ic']} | {row['oos_days']} | "
                f"{', '.join(f'{k}({v:+.0f})' for k, v in row['chosen'].items())} |"
            )
        lines.append("")
    lines.append("caveats: ~4 months, one regime, overlapping windows, in-sample feature selection, no costs or slippage. treat as a lead generator, not a backtest.")
    return "\n".join(lines)


def load_sectors(db_path: str) -> dict[str, str]:
    import sqlite3

    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=15)
    rows = con.execute(
        "select path, data_json from documents where path like 'tm_instruments/%'"
    ).fetchall()
    con.close()
    out: dict[str, str] = {}
    for path, data_json in rows:
        iid = path.split("/")[-1]
        try:
            data = json.loads(data_json)
        except ValueError:
            continue
        sector = str(data.get("sector") or "").strip()
        if sector:
            out[iid] = sector
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Factor lab")
    parser.add_argument("--db", default=os.getenv("LOCALDB_PATH", ""))
    parser.add_argument("--write-report", action="store_true")
    parser.add_argument("--out-dir", default="explorations")
    parser.add_argument("--top-n", type=int, default=20)
    args = parser.parse_args()
    if not args.db:
        raise SystemExit("Set LOCALDB_PATH or pass --db")

    bars, calls, _docs = load_store_rows(args.db)
    sectors = load_sectors(args.db)
    panel = build_panel(bars, calls, sectors)
    ic_rows = [compute_ic(panel, feature) for feature in FEATURES]
    chosen = greedy_features(panel, ic_rows)
    portfolio = monthly_portfolio(panel, chosen, top_n=args.top_n) if chosen else []
    size_sweeps = {
        size: monthly_portfolio(panel, chosen, top_n=size) for size in (10, 20, 50)
    } if chosen else {}
    lomo_rows = leave_one_month_out(panel, FEATURES) if chosen else []
    print(json.dumps({"panel": len(panel), "chosen": chosen, "lomo": [(r["held_out_month"], r["oos_ic"]) for r in lomo_rows]}))
    report = render(panel, ic_rows, chosen, portfolio, lomo_rows=lomo_rows, size_sweeps=size_sweeps)
    if args.write_report:
        os.makedirs(args.out_dir, exist_ok=True)
        path = os.path.join(args.out_dir, "factor-lab.md")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(report)
        raw = os.path.join(args.out_dir, "factor-lab.json")
        with open(raw, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "ic": ic_rows,
                    "chosen": chosen,
                    "portfolio": portfolio,
                    "lomo": lomo_rows,
                    "size_sweeps": {str(k): v for k, v in size_sweeps.items()},
                },
                handle,
                indent=2,
            )
        print(json.dumps({"report": path, "raw": raw}))
    else:
        print(report)


if __name__ == "__main__":
    main()
