# Landing Data Build Plan (MVP)

Last updated: April 19, 2026

This doc tracks the data capabilities we need to build next for the landing experience.

## Initial Scope (Phase 1)

1. Market breadth dataset
- Build and store market breadth metrics for the active US price universe.
- Target collection: `tm_market_breadth/{market}_{date}`
- Initial fields:
  - `advancers`, `decliners`, `unchanged`
  - `up_volume`, `down_volume`
  - `new_52w_high`, `new_52w_low`
  - `pct_above_20dma`, `pct_above_50dma`, `pct_above_200dma`

2. Fear/Greed-style sentiment gauge
- Build a daily composite sentiment score from breadth + volatility-related components.
- Target collection: `tm_sentiment_gauge/{market}_{date}`
- Initial fields:
  - `score` (`0-100`)
  - `label` (`fear`, `neutral`, `greed`)
  - `components[]` (name, value, normalized score, weight)
  - `explanation`

3. Portfolio/watchlist red-flag layer
- Build user-level watchlist + red-flag outputs for high-signal monitoring.
- Target collections:
  - `tm_user_watchlists/{userId}`
  - `tm_user_alert_flags/{userId}_{instrumentId}`
- Initial red flags:
  - price shock
  - sentiment drop
  - news-risk spike
  - volume anomaly

4. Lightweight technical summary layer (stock-level)
- Build a small, explainable technicals pack (not full TA suite).
- Target collection: `tm_stock_technicals/{instrumentId}_{date}`
- Initial indicators:
  - `rsi_14` + status (`overbought`, `oversold`, `neutral`)
  - `sma_20`, `sma_50`, `sma_200` + simple trend state (price above/below)
  - `ema_20` + slope state (`rising`, `flat`, `falling`)
  - `distance_from_52w_high_pct` and `distance_from_52w_low_pct`
- Notes:
  - This is enough to power a summary card + simple indicator table.
  - Support/resistance and advanced indicators can be added in a later phase.
