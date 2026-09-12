# technical baseline vs model directives audit

sample: 2026-06-24 to 2026-09-10 | calls scored: 9433 | horizons: 1d / 7d / 30d

signal mapping: accumulate=+1, hold/watch=0, trim/avoid=-1; baseline strong_buy/buy=+1, neutral=0, sell/strong_sell=-1. returns are close-to-close, signal returns are half-weighted so long+short max out at 0.5.

## horizon 1d

market context for the same call set (long-only, no signal):

- n: 9433 | avg stock return: 0.03% | avg benchmark return: 0.074% | avg relative: -0.043%

| strategy | n | active | date-avg signal ret | hit rate | date-avg relative |
|---|---:|---:|---:|---:|---:|
| vibe | 9433 | 6705 | -0.054% | 48.3% | -0.029% |
| baseline | 9433 | 8509 | -0.031% | 48.3% | -0.017% |
| agree_then_vibe_else_baseline | 9433 | 6705 | -0.069% | 48.0% | -0.027% |
| vibe_only_when_agree | 9433 | 3386 | -0.024% | 47.2% | -0.027% |
| vibe_blocked_by_strong_baseline | 9433 | 5837 | -0.05% | 47.9% | -0.025% |
| strong_baseline_outranks_vibe | 9433 | 9130 | -0.044% | 48.2% | -0.014% |
| vibe_inverted | 9433 | 6705 | 0.054% | 51.1% | 0.029% |
| baseline_inverted | 9433 | 8509 | 0.031% | 51.0% | 0.017% |

### per-label outcomes

| family | label | n | avg ret | median | hit rate | avg relative | avg max dd |
|---|---|---:|---:|---:|---:|---:|---:|
| vibe | accumulate | 5774 | -0.01% | -0.04% | 48.6% | -0.06% | -1.13% |
| vibe | avoid | 483 | 0.29% | 0.08% | 52.0% | 0.19% | -1.2% |
| vibe | hold | 2029 | 0.08% | 0.02% | 50.3% | -0.04% | -1.06% |
| vibe | trim | 448 | 0.24% | 0.2% | 54.5% | 0.18% | -1.21% |
| vibe | watch | 699 | -0.09% | 0.0% | 48.1% | -0.19% | -1.85% |
| baseline | buy | 2250 | -0.02% | -0.07% | 48.2% | -0.07% | -1.12% |
| baseline | neutral | 924 | -0.01% | -0.06% | 47.8% | -0.07% | -1.2% |
| baseline | sell | 2850 | 0.08% | 0.01% | 50.1% | -0.0% | -1.19% |
| baseline | strong_buy | 1822 | -0.04% | -0.07% | 48.1% | -0.1% | -1.11% |
| baseline | strong_sell | 1587 | 0.12% | 0.08% | 52.1% | 0.0% | -1.29% |

### baseline score vs forward return

| score bucket | n | avg ret | hit rate |
|---|---:|---:|---:|
| >= +0.5 | 1822 | -0.043% | 48.1% |
| +0.1 .. +0.5 | 2250 | -0.024% | 48.2% |
| -0.1 .. +0.1 | 924 | -0.01% | 47.8% |
| -0.5 .. -0.1 | 2850 | 0.084% | 50.1% |
| <= -0.5 | 1587 | 0.115% | 52.1% |

### model vs baseline agreement

| bucket | n | avg ret | hit rate | avg relative |
|---|---:|---:|---:|---:|
| disagree | 2698 | 0.1% | 49.8% | 0.01% |
| agree | 3386 | -0.04% | 49.0% | -0.08% |

## horizon 7d

market context for the same call set (long-only, no signal):

- n: 7830 | avg stock return: -0.066% | avg benchmark return: 0.112% | avg relative: -0.179%

| strategy | n | active | date-avg signal ret | hit rate | date-avg relative |
|---|---:|---:|---:|---:|---:|
| vibe | 7830 | 5534 | -0.029% | 46.7% | -0.1% |
| baseline | 7830 | 7069 | -0.327% | 47.2% | -0.294% |
| agree_then_vibe_else_baseline | 7830 | 5534 | -0.191% | 46.5% | -0.226% |
| vibe_only_when_agree | 7830 | 2917 | -0.117% | 45.2% | -0.146% |
| vibe_blocked_by_strong_baseline | 7830 | 4900 | -0.105% | 45.4% | -0.167% |
| strong_baseline_outranks_vibe | 7830 | 7581 | -0.311% | 45.8% | -0.32% |
| vibe_inverted | 7830 | 5534 | 0.029% | 53.1% | 0.1% |
| baseline_inverted | 7830 | 7069 | 0.327% | 52.7% | 0.294% |

### per-label outcomes

| family | label | n | avg ret | median | hit rate | avg relative | avg max dd |
|---|---|---:|---:|---:|---:|---:|---:|
| vibe | accumulate | 4794 | -0.28% | -0.43% | 45.8% | -0.26% | -3.65% |
| vibe | avoid | 377 | 1.0% | -0.02% | 49.6% | 0.95% | -3.57% |
| vibe | hold | 1608 | 0.04% | -0.23% | 47.6% | -0.26% | -3.36% |
| vibe | trim | 363 | -0.2% | -0.4% | 45.7% | -0.06% | -3.25% |
| vibe | watch | 688 | 0.63% | 0.13% | 50.4% | -0.13% | -5.18% |
| baseline | buy | 2011 | -0.58% | -0.54% | 45.3% | -0.53% | -3.59% |
| baseline | neutral | 761 | -0.43% | -0.66% | 44.3% | -0.47% | -3.75% |
| baseline | sell | 2260 | -0.19% | -0.45% | 45.9% | -0.26% | -3.86% |
| baseline | strong_buy | 1655 | -0.9% | -0.68% | 43.6% | -1.06% | -3.74% |
| baseline | strong_sell | 1143 | 2.53% | 1.08% | 57.4% | 2.07% | -3.53% |

### baseline score vs forward return

| score bucket | n | avg ret | hit rate |
|---|---:|---:|---:|
| >= +0.5 | 1655 | -0.896% | 43.6% |
| +0.1 .. +0.5 | 2011 | -0.577% | 45.3% |
| -0.1 .. +0.1 | 761 | -0.435% | 44.3% |
| -0.5 .. -0.1 | 2260 | -0.191% | 45.9% |
| <= -0.5 | 1143 | 2.526% | 57.4% |

### model vs baseline agreement

| bucket | n | avg ret | hit rate | avg relative |
|---|---:|---:|---:|---:|
| disagree | 2105 | 0.57% | 49.9% | 0.44% |
| agree | 2917 | -0.68% | 44.1% | -0.55% |

## horizon 30d

market context for the same call set (long-only, no signal):

- n: 3826 | avg stock return: 2.107% | avg benchmark return: 1.55% | avg relative: 0.557%

| strategy | n | active | date-avg signal ret | hit rate | date-avg relative |
|---|---:|---:|---:|---:|---:|
| vibe | 3826 | 2352 | 0.269% | 54.3% | 0.039% |
| baseline | 3826 | 3534 | -0.546% | 47.3% | -0.449% |
| agree_then_vibe_else_baseline | 3826 | 2352 | -0.242% | 48.7% | -0.173% |
| vibe_only_when_agree | 3826 | 1215 | 0.064% | 52.4% | -0.047% |
| vibe_blocked_by_strong_baseline | 3826 | 2038 | 0.146% | 53.5% | -0.025% |
| strong_baseline_outranks_vibe | 3826 | 3713 | -0.332% | 49.5% | -0.386% |
| vibe_inverted | 3826 | 2352 | -0.269% | 45.7% | -0.039% |
| baseline_inverted | 3826 | 3534 | 0.546% | 52.7% | 0.449% |

### per-label outcomes

| family | label | n | avg ret | median | hit rate | avg relative | avg max dd |
|---|---|---:|---:|---:|---:|---:|---:|
| vibe | accumulate | 2094 | 1.89% | 1.46% | 55.4% | 0.6% | -8.87% |
| vibe | avoid | 148 | 8.47% | 4.24% | 62.8% | 7.4% | -6.99% |
| vibe | hold | 802 | 1.38% | 1.34% | 54.1% | -0.26% | -8.12% |
| vibe | trim | 110 | -1.1% | -2.06% | 42.7% | -1.24% | -9.47% |
| vibe | watch | 672 | 2.76% | 3.47% | 59.8% | 0.19% | -11.56% |
| baseline | buy | 1027 | 1.51% | 1.01% | 54.7% | 0.35% | -8.26% |
| baseline | neutral | 292 | 0.38% | 1.18% | 53.1% | -0.95% | -9.84% |
| baseline | sell | 1033 | 2.54% | 2.24% | 57.9% | 0.7% | -10.04% |
| baseline | strong_buy | 859 | 0.28% | 0.46% | 51.3% | -1.02% | -8.43% |
| baseline | strong_sell | 615 | 5.75% | 4.04% | 61.8% | 3.57% | -9.7% |

### baseline score vs forward return

| score bucket | n | avg ret | hit rate |
|---|---:|---:|---:|
| >= +0.5 | 859 | 0.275% | 51.3% |
| +0.1 .. +0.5 | 1027 | 1.514% | 54.7% |
| -0.1 .. +0.1 | 292 | 0.378% | 53.1% |
| -0.5 .. -0.1 | 1033 | 2.537% | 57.9% |
| <= -0.5 | 615 | 5.754% | 61.8% |

### model vs baseline agreement

| bucket | n | avg ret | hit rate | avg relative |
|---|---:|---:|---:|---:|
| disagree | 958 | 2.33% | 55.7% | 0.64% |
| agree | 1215 | 2.33% | 55.2% | 1.45% |

## model confidence calibration (7d, directional calls only)

| confidence | n | avg signal ret | hit rate |
|---|---:|---:|---:|
| high | 1930 | -0.124% | 48.5% |
| med | 888 | 0.012% | 51.2% |
| medium | 2712 | -0.204% | 44.0% |
| low | 4 | -7.396% | 0.0% |
