# Tikrr Pipeline (Current)

Canonical runner:

```bash
python3 -m backend.scripts.run_pipeline --markets US --session-phase auto
```

## Universe model (2 keys only)

From `tm_config/active_universes`:

- `<MARKET>_price_universe` (required)
- `<MARKET>_ai_universe` (required)

Rules:

- Display + materialized dashboard/instrument views are built from `price_universe`.
- AI briefs/news intelligence are built from `ai_universe`.
- Paid tracked stocks are unioned into per-stock AI generation at runtime.
- No legacy `US`/`IN` fallback keys are used.

## Stage groups (high level)

1. **Market data (price universe):**
   - `sync_price_snapshots`
   - `sync_stock_metrics`
   - `sync_sector_benchmarks`
   - `sync_stock_facts`
   - `build_stock_intel_pro`
   - `build_stock_technicals`
   - `build_market_breadth`
   - `build_thematic_screens`
   - `build_user_alert_flags`

2. **AI/news (AI universe):**
   - `build_per_stock_intelligence`
   - `build_heat_list`
   - `build_divergence`
   - `build_sentiment_flip`

3. **Precomputed views + archives:**
   - `materialize_views` (price universe)
   - `build_snapshot`
   - `build_watchlist_views`
