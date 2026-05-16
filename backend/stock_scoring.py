"""Score stocks across four pillars using the scraped metrics + sector benchmarks.

Weights are growth-tilted (Growth 35 / Momentum 25 / Valuation 20 / Quality 20).
Each metric is mapped to a 0-100 signal via a piecewise-linear `score_curve`
whose endpoints encode the thresholds we've agreed on. Pillar score is the
weighted average of its metric scores (skipping any None/missing fields,
renormalizing to the remaining weight).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# ────────────────────────────── thresholds ─────────────────────────────────

PILLAR_WEIGHTS = {
    "growth": 0.35,
    "momentum": 0.25,
    "valuation": 0.20,
    "quality": 0.20,
}

# Each curve: list of (input_value, score_0_100) anchor points. Interpolate
# linearly between anchors; clamp outside the endpoints.
_CURVES: dict[str, list[tuple[float, float]]] = {
    # Valuation - cheaper = higher score. PE/FwdPE are expressed as
    # ratio-to-sector (stock_pe / sector_pe); 0.7 means 30% cheaper.
    "pe_ratio_to_sector":       [(0.6, 100), (0.9, 75), (1.1, 40), (1.5, 0)],
    "fwd_pe_ratio_to_sector":   [(0.6, 100), (0.9, 75), (1.1, 40), (1.5, 0)],
    "peg_absolute":             [(0.0, 100), (1.0, 85), (2.0, 50), (3.0, 10)],
    "target_upside_pct":        [(-20, 0), (-5, 30), (5, 55), (15, 85), (30, 100)],
    # Growth - higher = better
    "growth_pct_tall":          [(0.0, 0), (10, 50), (25, 85), (40, 100)],
    "growth_pct_short":         [(-5, 0), (0, 40), (10, 70), (20, 100)],
    # Quality
    "roe_pct":                  [(0.0, 0), (10, 50), (20, 80), (30, 100)],
    "oper_margin_pct":          [(0.0, 0), (10, 45), (25, 85), (40, 100)],
    "payout_pct":               [(0.0, 60), (40, 85), (60, 60), (80, 20), (100, 0)],
    "debt_eq":                  [(0.0, 100), (0.5, 85), (1.0, 55), (2.0, 15), (4.0, 0)],
    "inst_own_pct":             [(0.0, 10), (30, 50), (60, 85), (80, 100)],
    # Momentum - Recom 1=strong buy, 5=strong sell
    "recom_reverse":            [(1.0, 100), (2.0, 80), (3.0, 50), (4.0, 20), (5.0, 0)],
    "short_float_pct":          [(0.0, 100), (5.0, 70), (10, 40), (15, 15), (25, 0)],
    "insider_trans_pct":        [(-2, 0), (-0.5, 35), (0, 50), (0.5, 75), (2, 100)],
    "perf_1m_pct":              [(-15, 0), (-5, 30), (0, 50), (5, 70), (15, 100)],
    "rsi_14":                   [(20, 10), (35, 50), (55, 90), (70, 60), (80, 25)],
    # Zacks - rank 1=strong buy, 5=strong sell (reversed)
    "zacks_rank":               [(1.0, 100), (2.0, 80), (3.0, 50), (4.0, 20), (5.0, 0)],
    # Earnings ESP - positive percent means likely to beat consensus
    "zacks_esp":                [(-5, 0), (-1, 30), (0, 50), (1, 75), (5, 100)],
    # IN momentum substitutes: analyst buy % (0-100) - higher = stronger consensus
    "analyst_buy_pct":          [(0, 0), (50, 40), (70, 70), (90, 95), (100, 100)],
    # 5-year stock CAGR (% annualized) - long-horizon momentum
    "cagr_5y_pct":              [(-10, 0), (0, 30), (10, 60), (20, 85), (30, 100)],
}


def _interp(curve_name: str, value: float | None) -> float | None:
    if value is None:
        return None
    curve = _CURVES[curve_name]
    if value <= curve[0][0]:
        return curve[0][1]
    if value >= curve[-1][0]:
        return curve[-1][1]
    for i in range(len(curve) - 1):
        x0, y0 = curve[i]
        x1, y1 = curve[i + 1]
        if x0 <= value <= x1:
            if x1 == x0:
                return y0
            t = (value - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return None


# ────────────────────────────── scoring primitives ─────────────────────────


@dataclass
class MetricScore:
    label: str
    value: float | None
    benchmark: float | None
    benchmark_label: str
    signal: str  # green | yellow | red | na
    summary: str
    weight: float
    _score: float | None  # 0-100 or None if missing

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "value": round(self.value, 2) if isinstance(self.value, (int, float)) else None,
            "benchmark": round(self.benchmark, 2) if isinstance(self.benchmark, (int, float)) else None,
            "benchmark_label": self.benchmark_label,
            "signal": self.signal,
            "summary": self.summary,
            "score": round(self._score, 1) if isinstance(self._score, (int, float)) else None,
        }


def _signal_from_score(score: float | None) -> str:
    if score is None:
        return "na"
    if score >= 70:
        return "green"
    if score >= 40:
        return "yellow"
    return "red"


def _verdict_from_score(score: float) -> str:
    if score >= 75:
        return "strong"
    if score >= 55:
        return "solid"
    if score >= 35:
        return "mixed"
    return "weak"


def _weighted(metrics: list[MetricScore]) -> float:
    total_w = 0.0
    total_s = 0.0
    for m in metrics:
        if m._score is None:
            continue
        total_w += m.weight
        total_s += m.weight * m._score
    return round(total_s / total_w, 1) if total_w > 0 else 0.0


# ────────────────────────────── pillar builders ────────────────────────────


def _build_valuation(metrics: dict[str, float], benchmarks: dict[str, float]) -> list[MetricScore]:
    out: list[MetricScore] = []
    sector_pe = benchmarks.get("pe")
    pe = metrics.get("pe")
    ratio = pe / sector_pe if pe and sector_pe else None
    score = _interp("pe_ratio_to_sector", ratio)
    out.append(MetricScore(
        label="P/E TTM", value=pe, benchmark=sector_pe,
        benchmark_label="Sector avg",
        signal=_signal_from_score(score),
        summary=_val_summary("P/E", pe, sector_pe),
        weight=25, _score=score,
    ))

    sector_fwd = benchmarks.get("fwd_pe")
    fwd = metrics.get("fwd_pe")
    ratio = fwd / sector_fwd if fwd and sector_fwd else None
    score = _interp("fwd_pe_ratio_to_sector", ratio)
    out.append(MetricScore(
        label="Forward P/E", value=fwd, benchmark=sector_fwd,
        benchmark_label="Sector avg",
        signal=_signal_from_score(score),
        summary=_val_summary("Forward P/E", fwd, sector_fwd),
        weight=25, _score=score,
    ))

    peg = metrics.get("peg")
    score = _interp("peg_absolute", peg)
    out.append(MetricScore(
        label="PEG", value=peg, benchmark=1.0, benchmark_label="Fair value <1",
        signal=_signal_from_score(score),
        summary=_peg_summary(peg),
        weight=20, _score=score,
    ))

    price = metrics.get("price")
    target = metrics.get("target_price")
    upside = ((target - price) / price * 100) if price and target else None
    score = _interp("target_upside_pct", upside)
    out.append(MetricScore(
        label="Analyst target", value=target, benchmark=price,
        benchmark_label="Current price",
        signal=_signal_from_score(score),
        summary=(f"{upside:+.1f}% vs target" if upside is not None else "No analyst target"),
        weight=30, _score=score,
    ))
    return out


def _build_growth(metrics: dict[str, float], benchmarks: dict[str, float]) -> list[MetricScore]:
    # IN feeds (Screener) don't expose TTM YoY growth, only 3/5/10Y CAGR tables,
    # and have no forward consensus. Branch so each market uses what it has.
    has_us_growth = "sales_yy_ttm" in metrics or "eps_yy_ttm" in metrics
    if has_us_growth:
        pairs = [
            ("Revenue growth (TTM)", "sales_yy_ttm", 20, "growth_pct_tall", "sales_growth_past_5y", "Sector 5Y avg"),
            ("EPS growth (TTM)", "eps_yy_ttm", 20, "growth_pct_tall", "eps_growth_past_5y", "Sector 5Y avg"),
            ("EPS forecast (5Y)", "eps_growth_next_5y", 25, "growth_pct_tall", "eps_growth_next_5y", "Sector fwd avg"),
            ("EPS next year", "eps_next_y_growth", 20, "growth_pct_short", None, ""),
            ("EPS growth (Q/Q)", "eps_qq", 15, "growth_pct_short", None, ""),
        ]
    else:
        pairs = [
            ("Revenue CAGR (3Y)", "sales_growth_past_3y", 25, "growth_pct_tall", None, ""),
            ("Revenue CAGR (5Y)", "sales_growth_past_5y", 20, "growth_pct_tall", None, ""),
            ("Profit CAGR (3Y)", "profit_growth_past_3y", 25, "growth_pct_tall", None, ""),
            ("Profit CAGR (5Y)", "profit_growth_past_5y", 20, "growth_pct_tall", None, ""),
            ("Profit CAGR (10Y)", "profit_growth_past_10y", 10, "growth_pct_tall", None, ""),
        ]
    out = []
    for label, key, weight, curve, bench_key, bench_label in pairs:
        value = metrics.get(key)
        score = _interp(curve, value)
        bench_val = benchmarks.get(bench_key) if bench_key else None
        out.append(MetricScore(
            label=label, value=value, benchmark=bench_val,
            benchmark_label=bench_label,
            signal=_signal_from_score(score),
            summary=_growth_summary(label, value, bench_val, score),
            weight=weight, _score=score,
        ))
    return out


def _build_quality(metrics: dict[str, float], benchmarks: dict[str, float]) -> list[MetricScore]:
    pairs = [
        ("ROE", "roe", 30, "roe_pct", None),
        ("Operating margin", "oper_margin", 25, "oper_margin_pct", None),
        ("Payout ratio", "payout_ratio", 15, "payout_pct", "sustainable <60%"),
        ("Debt / Equity", "debt_eq", 15, "debt_eq", "lower is safer"),
        ("Institutional ownership", "inst_own_pct", 15, "inst_own_pct", "smart-money validation"),
    ]
    out = []
    for label, key, weight, curve, desc in pairs:
        value = metrics.get(key)
        score = _interp(curve, value)
        out.append(MetricScore(
            label=label, value=value, benchmark=None,
            benchmark_label=desc or "",
            signal=_signal_from_score(score),
            summary=_quality_summary(label, value, score),
            weight=weight, _score=score,
        ))
    return out


def _build_momentum(metrics: dict[str, float]) -> list[MetricScore]:
    # Branch on data source: US feeds have zacks_* + Finviz recom, insider, short
    # float. IN feeds have analyst_buy_pct + perf_1m + 5Y CAGR and no insider/short
    # transparency, so we substitute with what's available.
    has_zacks = "zacks_rank" in metrics or "zacks_esp" in metrics
    if has_zacks:
        pairs = [
            ("Quant rank", "zacks_rank", 25, "zacks_rank", "1=buy, 5=sell"),
            ("Beat likelihood", "zacks_esp", 15, "zacks_esp", "positive = beat-likely"),
            ("Analyst rating", "recom", 15, "recom_reverse", "1=buy, 5=sell"),
            ("Short float", "short_float_pct", 15, "short_float_pct", "lower is calmer"),
            ("Insider activity", "insider_trans_pct", 10, "insider_trans_pct", "net 6-month"),
            ("1-month performance", "perf_1m", 15, "perf_1m_pct", "vs last 30 days"),
            ("RSI (14)", "rsi_14", 5, "rsi_14", "50-65 is healthy"),
        ]
    else:
        pairs = [
            ("Analyst consensus", "analyst_buy_pct", 30, "analyst_buy_pct", "% of analysts saying buy"),
            ("1-month performance", "perf_1m", 20, "perf_1m_pct", "vs last 30 days"),
            ("1-week performance", "perf_1w", 10, "perf_1m_pct", "vs last 7 days"),
            ("5-year CAGR", "perf_5y_cagr", 25, "cagr_5y_pct", "annualized price return"),
            ("1-year performance", "stock_cagr_1y", 15, "perf_1m_pct", "trailing 1-year return"),
        ]
    out = []
    for label, key, weight, curve, desc in pairs:
        value = metrics.get(key)
        score = _interp(curve, value)
        out.append(MetricScore(
            label=label, value=value, benchmark=None,
            benchmark_label=desc or "",
            signal=_signal_from_score(score),
            summary=_momentum_summary(label, value, score),
            weight=weight, _score=score,
        ))
    return out


# ────────────────────────────── summaries ──────────────────────────────────


def _val_summary(name: str, v: float | None, sector: float | None) -> str:
    if v is None or sector is None:
        return f"No {name} data"
    diff = (v - sector) / sector * 100
    if abs(diff) < 5:
        return f"In line with sector ({v:.1f} vs {sector:.1f})"
    tag = "cheaper" if diff < 0 else "richer"
    return f"{abs(diff):.0f}% {tag} than sector ({v:.1f} vs {sector:.1f})"


def _peg_summary(peg: float | None) -> str:
    if peg is None:
        return "No PEG data"
    if peg < 1:
        return f"Growth-adjusted valuation looks cheap ({peg:.2f})"
    if peg < 2:
        return f"Fairly priced for growth ({peg:.2f})"
    return f"Pricing in heavy growth ({peg:.2f})"


def _tier(score: float | None) -> str:
    if score is None:
        return ""
    if score >= 75:
        return "strong"
    if score >= 55:
        return "solid"
    if score >= 40:
        return "average"
    if score >= 20:
        return "below average"
    return "weak"


def _growth_summary(
    label: str,
    value: float | None,
    benchmark: float | None,
    score: float | None,
) -> str:
    if value is None:
        return f"No {label} data"
    tier = _tier(score)
    if benchmark is not None:
        diff = value - benchmark
        direction = "ahead of" if diff > 1 else "below" if diff < -1 else "in line with"
        return f"{value:+.1f}% - {tier} pace, {direction} sector ({benchmark:+.1f}%)"
    if tier:
        return f"{value:+.1f}% - {tier} pace"
    return f"{value:+.1f}%"


def _quality_summary(label: str, v: float | None, score: float | None) -> str:
    if v is None:
        return f"No {label} data"
    tier = _tier(score)
    descriptors = {
        "ROE": "capital efficiency",
        "Operating margin": "pricing power",
        "Payout ratio": "dividend coverage",
        "Debt / Equity": "leverage",
        "Institutional ownership": "smart-money backing",
    }
    thing = descriptors.get(label, "")
    if not tier:
        return f"{v:.1f}"
    if label == "Debt / Equity":
        return f"{v:.2f} - {tier} {thing}"
    if thing:
        return f"{v:.1f}% - {tier} {thing}"
    return f"{v:.1f} - {tier}"


def _momentum_summary(label: str, v: float | None, score: float | None) -> str:
    if v is None:
        return f"No {label} data"
    tier = _tier(score)
    if label == "Quant rank":
        tiers = {1: "Strong Buy", 2: "Buy", 3: "Hold", 4: "Sell", 5: "Strong Sell"}
        return f"{int(v)} - {tiers.get(int(v), '')} signal"
    if label == "Beat likelihood":
        if v > 1:
            return f"+{v:.1f}% - beat-likely this quarter"
        if v < -1:
            return f"{v:+.1f}% - miss-likely this quarter"
        return f"{v:+.1f}% - in line with consensus"
    if label == "Analyst rating":
        if v <= 2:
            return f"{v:.2f} - buy-tilted consensus"
        if v >= 4:
            return f"{v:.2f} - sell-tilted consensus"
        return f"{v:.2f} - hold-tilted consensus"
    if label == "1-month performance":
        direction = "outperformed" if v > 2 else "lagged" if v < -2 else "tracked"
        return f"{v:+.1f}% - {direction} over last month"
    if label == "Short float":
        if v < 3:
            return f"{v:.1f}% - calm short interest"
        if v < 8:
            return f"{v:.1f}% - moderate short interest"
        return f"{v:.1f}% - heavy short interest"
    if label == "Insider activity":
        if abs(v) < 0.1:
            return f"{v:+.2f}% - quiet on insider side"
        direction = "buying" if v > 0 else "selling"
        return f"{v:+.2f}% - net insider {direction} (6M)"
    if label == "RSI (14)":
        if v >= 70:
            return f"{v:.1f} - overbought zone"
        if v <= 30:
            return f"{v:.1f} - oversold zone"
        if 50 <= v < 70:
            return f"{v:.1f} - healthy uptrend"
        return f"{v:.1f} - {tier or 'neutral'} trend"
    if label == "Analyst consensus":
        if v >= 80:
            return f"{v:.0f}% of analysts rate buy - strong conviction"
        if v >= 60:
            return f"{v:.0f}% of analysts rate buy - constructive tilt"
        if v >= 40:
            return f"{v:.0f}% of analysts rate buy - split view"
        return f"{v:.0f}% of analysts rate buy - bearish consensus"
    if label == "1-week performance":
        direction = "up" if v > 1 else "down" if v < -1 else "flat"
        return f"{v:+.1f}% - {direction} over last week"
    if label == "1-year performance":
        direction = "ahead" if v > 5 else "behind" if v < -5 else "flat"
        return f"{v:+.1f}% - {direction} over trailing year"
    if label == "5-year CAGR":
        if v >= 20:
            return f"{v:+.1f}% annualized - multibagger pace"
        if v >= 10:
            return f"{v:+.1f}% annualized - solid long-run return"
        if v >= 0:
            return f"{v:+.1f}% annualized - muted long-run return"
        return f"{v:+.1f}% annualized - value destroyed"
    return f"{v:.1f}"


# ────────────────────────────── catalysts ──────────────────────────────────


def build_catalysts(
    today: dict[str, float],
    previous: dict[str, float] | None,
    earnings_date: str,
) -> list[dict[str, Any]]:
    catalysts: list[dict[str, Any]] = []
    if earnings_date:
        catalysts.append({
            "kind": "earnings",
            "title": f"Earnings {earnings_date}",
            "urgency": "high",
        })
    if not previous:
        return catalysts

    def delta(key: str) -> float | None:
        a, b = today.get(key), previous.get(key)
        if a is None or b is None:
            return None
        return a - b

    short_delta = delta("short_float_pct")
    if short_delta is not None and short_delta >= 3:
        catalysts.append({
            "kind": "short_spike",
            "title": f"Short float up {short_delta:+.1f}pp",
            "urgency": "med",
        })

    target_delta = delta("target_price")
    today_target = today.get("target_price")
    if target_delta is not None and today_target:
        pct = target_delta / (today_target - target_delta) * 100 if (today_target - target_delta) else 0
        if abs(pct) >= 5:
            catalysts.append({
                "kind": "target_revision",
                "title": f"Analyst target {pct:+.1f}%",
                "urgency": "med",
            })

    insider_delta = delta("insider_trans_pct")
    if insider_delta is not None and abs(insider_delta) >= 0.5:
        catalysts.append({
            "kind": "insider_flow",
            "title": f"Insider activity shift {insider_delta:+.2f}pp",
            "urgency": "low",
        })

    rank_delta = delta("zacks_rank")
    if rank_delta is not None and abs(rank_delta) >= 1:
        direction = "upgrade" if rank_delta < 0 else "downgrade"
        catalysts.append({
            "kind": f"rank_{direction}",
            "title": f"Quant rank {direction} ({rank_delta:+.0f})",
            "urgency": "high" if abs(rank_delta) >= 2 else "med",
        })

    return catalysts


# ────────────────────────────── top-level scorer ───────────────────────────


def score_stock(
    instrument: dict[str, Any],
    today_snapshot: dict[str, Any],
    previous_snapshot: dict[str, Any] | None,
    sector_benchmarks_doc: dict[str, Any],
) -> dict[str, Any]:
    """Produce the four-pillar scored payload for a single stock."""
    metrics = today_snapshot.get("metrics", {})
    sector_slug = today_snapshot.get("sector_slug", "")
    benchmarks = (sector_benchmarks_doc or {}).get("benchmarks", {}).get(sector_slug, {})

    pillar_builders = {
        "valuation": _build_valuation(metrics, benchmarks),
        "growth": _build_growth(metrics, benchmarks),
        "quality": _build_quality(metrics, benchmarks),
        "momentum": _build_momentum(metrics),
    }

    pillars_out: dict[str, Any] = {}
    overall_weighted = 0.0
    overall_weight_used = 0.0
    for key, metric_list in pillar_builders.items():
        pillar_score = _weighted(metric_list)
        pillar_weight = PILLAR_WEIGHTS[key]
        if metric_list and any(m._score is not None for m in metric_list):
            overall_weighted += pillar_weight * pillar_score
            overall_weight_used += pillar_weight
        pillars_out[key] = {
            "score": pillar_score,
            "verdict": _verdict_from_score(pillar_score),
            "weight": pillar_weight,
            "metrics": [m.to_dict() for m in metric_list],
        }

    overall_score = round(overall_weighted / overall_weight_used, 1) if overall_weight_used else 0.0

    previous_metrics = (previous_snapshot or {}).get("metrics", {})
    catalysts = build_catalysts(
        metrics, previous_metrics, today_snapshot.get("earnings_date", "")
    )

    return {
        "instrument_id": instrument["instrument_id"],
        "ticker": instrument.get("ticker", ""),
        "sector_slug": sector_slug,
        "sector_label": today_snapshot.get("sector_label", ""),
        "industry_label": today_snapshot.get("industry_label", ""),
        "pillars": pillars_out,
        "overall": {
            "score": overall_score,
            "verdict": _verdict_from_score(overall_score),
            "stance": "growth",
        },
        "catalysts": catalysts,
        "snapshot_date": today_snapshot.get("snapshot_date", ""),
        "generated_at": today_snapshot.get("captured_at", ""),
    }
