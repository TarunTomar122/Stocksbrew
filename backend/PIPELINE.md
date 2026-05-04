# Backend Pipeline (Current)

Primary entrypoint:

```bash
python3 -m backend.scripts.run_pipeline --markets US --session-phase auto
```

## Active universe keys (required)

`tm_config/active_universes` must include:

- `US_price_universe`, `US_ai_universe`
- `IN_price_universe`, `IN_ai_universe`

No legacy fallback to `US` / `IN`.

## Operational model

- `price_universe`: broad coverage for prices, technicals, scores, screens, materialized views.
- `ai_universe`: scheduled AI/news generation scope.
- Paid tracked stocks are added to per-stock AI generation in addition to the base AI universe.

## Pipeline shape

- Price/scoring chain: `sync_price_snapshots` → `sync_stock_metrics` → `build_stock_intel_pro` → `build_stock_technicals` → `build_market_breadth`.
- AI chain: `build_per_stock_intelligence` → `build_heat_list` / `build_divergence` / `build_sentiment_flip`.
- View chain: `materialize_views` (price universe) → `build_snapshot` + `build_watchlist_views`.
