"""Monthly-scale audit: average rating over the last month vs next-month price move.

Product framing: a directive is a stance a reader holds for weeks. So instead
of scoring a single call against the next day, this aggregates per stock:

  trailing 21 trading days -> average mechanical score + average vibe signal
  next 21 trading days     -> price return (and benchmark-relative return)

Then it asks the only question that matters: when our average rating over the
past month was bullish, did the stock actually rise over the following month?
Runs read-only. Usage on the VPS:

  LOCALDB_PATH=/srv/tikrr-data/localdb/documents.sqlite3 \
    python3 -m backend.scripts.audit_monthly_rating --write-report
"""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from typing import Any

from backend.scripts.audit_technical_baseline import (
    BASELINE_TO_SIGNAL,
    SIGNAL,
    baseline_rating_series,
    load_store_rows,
)

LOOKBACK = 21
FORWARD = 21
MIN_CALLS = 3


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _pct(hit: int, total: int) -> float | None:
    return round(100 * hit / total, 1) if total else None


def _bucket_score(score: float) -> str:
    if score >= 0.4:
        return "avg >= +0.4 (bullish tech)"
    if score >= 0.1:
        return "avg +0.1..+0.4"
    if score > -0.1:
        return "avg -0.1..+0.1 (neutral)"
    if score > -0.4:
        return "avg -0.4..-0.1"
    return "avg <= -0.4 (bearish tech)"


def _bucket_vibe(signal: float) -> str:
    if signal >= 0.5:
        return "avg >= +0.5 (bullish call)"
    if signal <= -0.5:
        return "avg <= -0.5 (bearish call)"
    return "avg -0.5..+0.5 (mixed)"


def build_observations(
    bars_by_instrument: dict[str, list[dict[str, Any]]],
    calls: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    # vibe signals per instrument+date (average when a stock was called twice)
    vibe_calls: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for call in calls:
        iid = str(call.get("instrument_id") or "")
        day = str(call.get("call_date") or "")[:10]
        stance = str(call.get("stance") or "")
        if iid and day and stance in SIGNAL:
            vibe_calls[iid][day].append(float(SIGNAL[stance]))
    vibe_by_day: dict[str, dict[str, float]] = {
        iid: {day: _mean(vals) for day, vals in days.items()}
        for iid, days in vibe_calls.items()
    }

    benchmark = bars_by_instrument.get("US_IDX_SPX") or []
    bench_by_date = {bar["date"]: bar["close"] for bar in benchmark}

    def bench_close_on_or_after(day: str) -> float | None:
        for offset in range(4):
            candidate = _shift_day(day, offset)
            if candidate in bench_by_date:
                return bench_by_date[candidate]
        return None

    observations: list[dict[str, Any]] = []
    for iid, bars in bars_by_instrument.items():
        if len(bars) < LOOKBACK + FORWARD + 1:
            continue
        ratings = baseline_rating_series(bars)
        days = [bar["date"] for bar in bars]
        for i in range(LOOKBACK, len(bars) - FORWARD):
            close = bars[i]["close"]
            future_close = bars[i + FORWARD]["close"]
            if close <= 0:
                continue
            avg_score = _mean([ratings[j]["score"] for j in range(i - LOOKBACK + 1, i + 1)])
            trailing_return = (close / bars[i - LOOKBACK + 1]["close"] - 1) * 100 if bars[i - LOOKBACK + 1]["close"] > 0 else None
            forward_return = (future_close / close - 1) * 100

            window_days = days[i - LOOKBACK + 1 : i + 1]
            window_signals = [
                signal
                for day in window_days
                for signal in ([vibe_by_day[iid][day]] if day in vibe_by_day.get(iid, {}) else [])
            ]
            vibe_avg = _mean(window_signals) if len(window_signals) >= MIN_CALLS else None

            bench_now = bench_close_on_or_after(days[i])
            bench_future = bench_close_on_or_after(days[i + FORWARD])
            bench_forward = (
                (bench_future / bench_now - 1) * 100 if bench_now and bench_future and bench_now > 0 else None
            )
            observations.append(
                {
                    "instrument_id": iid,
                    "date": days[i],
                    "month": days[i][:7],
                    "avg_score": round(avg_score, 4),
                    "vibe_avg": round(vibe_avg, 4) if vibe_avg is not None else None,
                    "vibe_calls": len(window_signals),
                    "forward_return_pct": round(forward_return, 3),
                    "relative_return_pct": round(forward_return - bench_forward, 3) if bench_forward is not None else None,
                    "trailing_return_pct": round(trailing_return, 3) if trailing_return is not None else None,
                }
            )
    return observations


def _shift_day(day: str, offset: int) -> str:
    from datetime import date, timedelta

    try:
        base = date.fromisoformat(day)
    except ValueError:
        return day
    return (base + timedelta(days=offset)).isoformat()


def summarize_buckets(
    observations: list[dict[str, Any]],
    key: str,
    bucket_fn,
) -> list[dict[str, Any]]:
    """Per-boundary equal-weight portfolios, then averaged across boundaries."""
    by_bucket_day: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in observations:
        value = row.get(key)
        if value is None:
            continue
        by_bucket_day[bucket_fn(float(value))][row["date"]].append(row)

    out: list[dict[str, Any]] = []
    for bucket, days in by_bucket_day.items():
        day_means = [_mean([r["forward_return_pct"] for r in rows]) for rows in days.values()]
        day_rel = [
            _mean([r["relative_return_pct"] for r in rows if r["relative_return_pct"] is not None])
            for rows in days.values()
            if any(r["relative_return_pct"] is not None for r in rows)
        ]
        all_returns = [r["forward_return_pct"] for rows in days.values() for r in rows]
        hits = sum(1 for v in all_returns if v > 0)
        out.append(
            {
                "bucket": bucket,
                "stock_days": len(all_returns),
                "boundaries": len(days),
                "date_avg_forward_return_pct": round(_mean(day_means), 3),
                "date_avg_relative_pct": round(_mean(day_rel), 3) if day_rel else None,
                "hit_rate_pct": _pct(hits, len(all_returns)),
            }
        )
    out.sort(key=lambda row: row["bucket"])
    return out


def summarize_monthly(
    observations: list[dict[str, Any]],
    key: str,
    bucket_fn,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    months = sorted({row["month"] for row in observations})
    for month in months:
        month_rows = [row for row in observations if row["month"] == month]
        for bucket, rows in sorted(_group_by(month_rows, key, bucket_fn).items()):
            returns = [r["forward_return_pct"] for r in rows]
            out.append(
                {
                    "month": month,
                    "bucket": bucket,
                    "n": len(returns),
                    "avg_forward_return_pct": round(_mean(returns), 3),
                }
            )
    return out


def _group_by(rows: list[dict[str, Any]], key: str, bucket_fn) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        value = row.get(key)
        if value is None:
            continue
        grouped[bucket_fn(float(value))].append(row)
    return grouped


def render(observations: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    vibe_rows = [row for row in observations if row.get("vibe_avg") is not None]
    dates = sorted({row["date"] for row in observations})
    lines.append("# monthly rating audit: average rating over last month vs next month")
    lines.append("")
    lines.append(
        f"boundaries: {dates[0] if dates else '-'} to {dates[-1] if dates else '-'} | "
        f"stock-month rows: {len(observations)} | rows with vibe calls: {len(vibe_rows)}"
    )
    lines.append("")
    lines.append("method: for every stock and every trading day, average the score over the past 21 sessions, then measure the return over the next 21 sessions. buckets are equal-weight portfolios per day, averaged across days.")
    lines.append("")

    lines.append("## mechanical baseline: trailing month average vs next month")
    lines.append("")
    lines.append("| avg technical score | stock-days | boundaries | next-month return | relative to spy | hit rate |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for row in summarize_buckets(observations, "avg_score", _bucket_score):
        lines.append(
            f"| {row['bucket']} | {row['stock_days']} | {row['boundaries']} | "
            f"{row['date_avg_forward_return_pct']}% | "
            f"{row['date_avg_relative_pct'] if row['date_avg_relative_pct'] is not None else '-'}% | {row['hit_rate_pct']}% |"
        )
    lines.append("")
    lines.append("### by month")
    lines.append("")
    lines.append("| month | bucket | n | next-month return |")
    lines.append("|---|---|---:|---:|")
    for row in summarize_monthly(observations, "avg_score", _bucket_score):
        lines.append(f"| {row['month']} | {row['bucket']} | {row['n']} | {row['avg_forward_return_pct']}% |")
    lines.append("")

    lines.append("## our vibe directives: trailing month average vs next month")
    lines.append("")
    if vibe_rows:
        lines.append("| avg call over month | stock-days | boundaries | next-month return | relative to spy | hit rate |")
        lines.append("|---|---:|---:|---:|---:|---:|")
        for row in summarize_buckets(vibe_rows, "vibe_avg", _bucket_vibe):
            lines.append(
                f"| {row['bucket']} | {row['stock_days']} | {row['boundaries']} | "
                f"{row['date_avg_forward_return_pct']}% | "
                f"{row['date_avg_relative_pct'] if row['date_avg_relative_pct'] is not None else '-'}% | {row['hit_rate_pct']}% |"
            )
        lines.append("")
        lines.append("### by month")
        lines.append("")
        lines.append("| month | bucket | n | next-month return |")
        lines.append("|---|---|---:|---:|")
        for row in summarize_monthly(vibe_rows, "vibe_avg", _bucket_vibe):
            lines.append(f"| {row['month']} | {row['bucket']} | {row['n']} | {row['avg_forward_return_pct']}% |")
    else:
        lines.append("no stock had enough calls in a trailing window to score.")
    lines.append("")

    lines.append("## concurrent check: did the rating describe the month it was in?")
    lines.append("")
    lines.append("| avg technical score | trailing-month return |")
    lines.append("|---|---:|")
    for bucket, rows in sorted(_group_by(observations, "avg_score", _bucket_score).items()):
        trailing = [r["trailing_return_pct"] for r in rows if r["trailing_return_pct"] is not None]
        lines.append(f"| {bucket} | {round(_mean(trailing), 3)}% |")
    lines.append("")
    if vibe_rows:
        lines.append("| avg call over month | trailing-month return |")
        lines.append("|---|---:|")
        for bucket, rows in sorted(_group_by(vibe_rows, "vibe_avg", _bucket_vibe).items()):
            trailing = [r["trailing_return_pct"] for r in rows if r["trailing_return_pct"] is not None]
            lines.append(f"| {bucket} | {round(_mean(trailing), 3)}% |")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Monthly rating audit")
    parser.add_argument("--db", default=os.getenv("LOCALDB_PATH", ""))
    parser.add_argument("--write-report", action="store_true")
    parser.add_argument("--out-dir", default="explorations")
    args = parser.parse_args()
    if not args.db:
        raise SystemExit("Set LOCALDB_PATH or pass --db")

    bars, calls, _docs = load_store_rows(args.db)
    observations = build_observations(bars, calls)
    vibe_rows = [row for row in observations if row.get("vibe_avg") is not None]
    print(json.dumps({"stock_days": len(observations), "with_vibe": len(vibe_rows)}))

    report = render(observations)
    if args.write_report:
        os.makedirs(args.out_dir, exist_ok=True)
        path = os.path.join(args.out_dir, "monthly-rating-audit.md")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(report)
        raw = os.path.join(args.out_dir, "monthly-rating-audit.json")
        with open(raw, "w", encoding="utf-8") as handle:
            json.dump(observations, handle)
        print(json.dumps({"report": path, "raw": raw}))
    else:
        print(report)


if __name__ == "__main__":
    main()
