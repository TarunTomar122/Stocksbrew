# Tikrr Pipeline (Current)

Canonical runner:

```bash
python3 -m backend.scripts.run_pipeline --markets US --session-phase auto
```

## Universe model (US single key)

From `tm_config/active_universes`:

- `US_universe` (required)
- `IN_price_universe`, `IN_ai_universe` (legacy IN split, unchanged)

Rules:

- US display + materialized views use `US_universe`.
- US AI briefs/news intelligence use `US_universe`, plus paid tracked stocks unioned at runtime.
- No legacy `US`/`IN` flat fallback keys are used.

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
