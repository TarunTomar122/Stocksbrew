# monthly rating audit: average rating over last month vs next month

boundaries: 2026-05-27 to 2026-08-13 | stock-month rows: 13758 | rows with vibe calls: 4104

method: for every stock and every trading day, average the score over the past 21 sessions, then measure the return over the next 21 sessions. buckets are equal-weight portfolios per day, averaged across days.

## mechanical baseline: trailing month average vs next month

| avg technical score | stock-days | boundaries | next-month return | relative to spy | hit rate |
|---|---:|---:|---:|---:|---:|
| avg +0.1..+0.4 | 5172 | 57 | 0.337% | -0.94% | 50.5% |
| avg -0.1..+0.1 (neutral) | 3189 | 57 | 3.129% | 1.855% | 50.6% |
| avg -0.4..-0.1 | 3853 | 56 | 2.998% | 1.699% | 57.2% |
| avg <= -0.4 (bearish tech) | 299 | 50 | 6.08% | 4.424% | 59.2% |
| avg >= +0.4 (bullish tech) | 1245 | 54 | 1.444% | 0.109% | 52.9% |

### by month

| month | bucket | n | next-month return |
|---|---|---:|---:|
| 2026-05 | avg +0.1..+0.4 | 144 | 1.159% |
| 2026-05 | avg -0.1..+0.1 (neutral) | 86 | -0.795% |
| 2026-05 | avg -0.4..-0.1 | 65 | -0.189% |
| 2026-05 | avg >= +0.4 (bullish tech) | 1 | 7.89% |
| 2026-06 | avg +0.1..+0.4 | 1045 | -2.082% |
| 2026-06 | avg -0.1..+0.1 (neutral) | 635 | 3.845% |
| 2026-06 | avg -0.4..-0.1 | 690 | 3.901% |
| 2026-06 | avg <= -0.4 (bearish tech) | 44 | 6.129% |
| 2026-06 | avg >= +0.4 (bullish tech) | 195 | -1.45% |
| 2026-07 | avg +0.1..+0.4 | 2308 | 2.374% |
| 2026-07 | avg -0.1..+0.1 (neutral) | 1399 | 4.1% |
| 2026-07 | avg -0.4..-0.1 | 1985 | 5.127% |
| 2026-07 | avg <= -0.4 (bearish tech) | 169 | 6.283% |
| 2026-07 | avg >= +0.4 (bullish tech) | 564 | 2.654% |
| 2026-08 | avg +0.1..+0.4 | 1675 | -1.384% |
| 2026-08 | avg -0.1..+0.1 (neutral) | 1069 | -1.098% |
| 2026-08 | avg -0.4..-0.1 | 1113 | -0.746% |
| 2026-08 | avg <= -0.4 (bearish tech) | 86 | -0.056% |
| 2026-08 | avg >= +0.4 (bullish tech) | 485 | -0.12% |

## our vibe directives: trailing month average vs next month

| avg call over month | stock-days | boundaries | next-month return | relative to spy | hit rate |
|---|---:|---:|---:|---:|---:|
| avg -0.5..+0.5 (mixed) | 1941 | 35 | 0.745% | -0.874% | 54.8% |
| avg <= -0.5 (bearish call) | 15 | 12 | 8.015% | 7.314% | 20.0% |
| avg >= +0.5 (bullish call) | 2148 | 34 | 2.799% | 1.104% | 60.1% |

### by month

| month | bucket | n | next-month return |
|---|---|---:|---:|
| 2026-06 | avg -0.5..+0.5 (mixed) | 61 | -14.776% |
| 2026-06 | avg >= +0.5 (bullish call) | 71 | -4.064% |
| 2026-07 | avg -0.5..+0.5 (mixed) | 1177 | 3.635% |
| 2026-07 | avg <= -0.5 (bearish call) | 6 | -18.681% |
| 2026-07 | avg >= +0.5 (bullish call) | 1415 | 5.662% |
| 2026-08 | avg -0.5..+0.5 (mixed) | 703 | 0.585% |
| 2026-08 | avg <= -0.5 (bearish call) | 9 | 34.368% |
| 2026-08 | avg >= +0.5 (bullish call) | 662 | -0.659% |

## concurrent check: did the rating describe the month it was in?

| avg technical score | trailing-month return |
|---|---:|
| avg +0.1..+0.4 | 8.681% |
| avg -0.1..+0.1 (neutral) | -0.363% |
| avg -0.4..-0.1 | -9.133% |
| avg <= -0.4 (bearish tech) | -17.847% |
| avg >= +0.4 (bullish tech) | 12.695% |

| avg call over month | trailing-month return |
|---|---:|
| avg -0.5..+0.5 (mixed) | -0.199% |
| avg <= -0.5 (bearish call) | 17.362% |
| avg >= +0.5 (bullish call) | -0.971% |
