# factor lab: what actually predicts next month in our data

panel: 11460 stock-days | 53 boundaries | 2026-06-02 to 2026-08-13 | target: next-21-session return relative to spy

all features are causal (computed from bars up to the boundary). IC = cross-sectional rank correlation with next-month relative return, averaged across days.

## information coefficient by feature

| feature | days | mean IC | t-stat | % days positive | IC by month (2026-06 | 2026-07 | 2026-08) |
|---|---:|---:|---:|---:|---|
| dist_from_1m_low | 52 | -0.113 | -4.56 | 25.0% | -0.2463 | -0.0035 | -0.0778 |
| vibe_avg | 34 | 0.1104 | 3.22 | 73.5% | 0.3587 | 0.1657 | -0.1416 |
| volatility_1m | 52 | -0.1065 | -3.73 | 30.8% | -0.1892 | -0.0748 | 0.0195 |
| volume_ratio | 52 | -0.1005 | -7.72 | 15.4% | -0.1382 | -0.0969 | -0.0117 |
| rsi_proxy | 52 | -0.0981 | -4.9 | 30.8% | -0.1697 | -0.0519 | -0.0427 |
| baseline_score | 52 | -0.0653 | -3.62 | 30.8% | -0.1226 | -0.0108 | -0.0714 |
| trailing_3m_return | 13 | -0.0644 | -2.82 | 15.4% | - | -0.024 | -0.0897 |
| baseline_ma_score | 52 | -0.0635 | -3.33 | 30.8% | -0.1214 | -0.005 | -0.0798 |
| trailing_1m_return | 52 | -0.0597 | -2.63 | 38.5% | -0.17 | 0.0253 | -0.0143 |
| trailing_1w_return | 52 | -0.0586 | -2.27 | 42.3% | -0.1019 | -0.0006 | -0.1115 |
| baseline_osc_score | 52 | -0.044 | -3.27 | 34.6% | -0.0729 | -0.0332 | 0.0009 |
| sma20_gap | 52 | -0.0331 | -1.4 | 44.2% | -0.1029 | 0.0581 | -0.112 |
| sma50_gap | 26 | -0.0091 | -0.34 | 53.8% | - | 0.0148 | -0.063 |
| dist_from_1m_high | 52 | 0.0088 | 0.36 | 53.8% | 0.0026 | 0.0655 | -0.1377 |

## quintiles: dist_from_1m_low (q1 = lowest, q5 = highest)

| bucket | days | avg next-month relative |
|---|---:|---:|
| q1 | 51 | 2.928% |
| q2 | 51 | 1.203% |
| q3 | 51 | 1.141% |
| q4 | 51 | 1.113% |
| q5 | 51 | -2.43% |

spread by month (q5 minus q1): {"2026-06": -12.233, "2026-07": -0.679, "2026-08": -2.36}

## quintiles: vibe_avg (q1 = lowest, q5 = highest)

| bucket | days | avg next-month relative |
|---|---:|---:|
| q1 | 34 | -3.807% |
| q2 | 34 | -1.222% |
| q3 | 34 | 2.495% |
| q4 | 34 | 1.9% |
| q5 | 34 | 0.464% |

spread by month (q5 minus q1): {"2026-06": 11.022, "2026-07": 5.909, "2026-08": -2.903}

## quintiles: volatility_1m (q1 = lowest, q5 = highest)

| bucket | days | avg next-month relative |
|---|---:|---:|
| q1 | 51 | 0.751% |
| q2 | 51 | 2.066% |
| q3 | 51 | 1.629% |
| q4 | 51 | 3.365% |
| q5 | 51 | -3.738% |

spread by month (q5 minus q1): {"2026-06": -10.624, "2026-07": -1.438, "2026-08": 0.886}

## quintiles: volume_ratio (q1 = lowest, q5 = highest)

| bucket | days | avg next-month relative |
|---|---:|---:|
| q1 | 51 | 1.446% |
| q2 | 51 | 1.709% |
| q3 | 51 | 1.207% |
| q4 | 51 | 1.348% |
| q5 | 51 | -1.639% |

spread by month (q5 minus q1): {"2026-06": -5.493, "2026-07": -2.618, "2026-08": 0.01}

## greedy composite

chosen features: {"dist_from_1m_low": -1.0, "vibe_avg": 1.0, "volatility_1m": -1.0, "volume_ratio": -1.0, "rsi_proxy": -1.0, "baseline_score": -1.0}

composite IC: 0.2098 (t=6.37, days=34)

| bucket | days | avg next-month relative |
|---|---:|---:|
| q1 | 34 | -5.42% |
| q2 | 34 | -1.333% |
| q3 | 34 | 1.01% |
| q4 | 34 | 1.98% |
| q5 | 34 | 3.309% |

spread by month: {"2026-06": 32.515, "2026-07": 7.585, "2026-08": 3.346}

## illustrative monthly portfolio (top 20 by composite, equal weight)

| month | boundary | names | portfolio | universe avg | excess | cumulative portfolio | cumulative universe |
|---|---|---:|---:|---:|---:|---:|---:|
| 2026-06 | 2026-06-30 | 20 | -1.253% | -11.549% | 10.296% | -1.25% | -11.55% |
| 2026-07 | 2026-07-31 | 20 | 8.83% | 5.444% | 3.387% | 7.47% | -6.73% |
| 2026-08 | 2026-08-12 | 20 | 1.006% | -1.491% | 2.497% | 8.55% | -8.12% |

### portfolio size sweep (cumulative excess vs universe)

| top N | cumulative portfolio | cumulative universe | excess |
|---:|---:|---:|---:|
| 10 | 9.66% | -8.12% | 17.78% |
| 20 | 8.55% | -8.12% | 16.67% |
| 50 | -6.44% | -8.12% | 1.68% |

## leave-one-month-out validation (features picked without the scored month)

| held-out month | oos IC | days | chosen features |
|---|---:|---:|---|
| 2026-06 | 0.4352 | 3 | vibe_avg(+1), volume_ratio(-1), volatility_1m(-1), rsi_proxy(-1), trailing_1w_return(-1) |
| 2026-07 | 0.0035 | 23 | dist_from_1m_low(-1) |
| 2026-08 | 0.0582 | 8 | vibe_avg(+1), volatility_1m(-1), rsi_proxy(-1), trailing_1m_return(-1) |

caveats: ~4 months, one regime, overlapping windows, in-sample feature selection, no costs or slippage. treat as a lead generator, not a backtest.