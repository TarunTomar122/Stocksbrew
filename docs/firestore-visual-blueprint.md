# Firestore Blueprint (Current Universe Model)

Last updated: 2026-05-04

This doc is the source of truth for how backend and frontend read universes.

## 1) Canonical universe config

Document: `tm_config/active_universes`

Required keys per market:

- `<MARKET>_price_universe`
- `<MARKET>_ai_universe`

Example:

```json
{
  "US_price_universe": "us_core_155",
  "US_ai_universe": "us_test_10",
  "IN_price_universe": "in_core_150",
  "IN_ai_universe": "in_ai_launch",
  "updated_at": "..."
}
```

Important:

- No legacy fallback to `US` / `IN`.
- Missing required keys should be treated as configuration errors.

## 2) Universe responsibilities

- `price_universe`:
  - price sync
  - stock metrics + intel_pro scoring
  - technicals, breadth, screens, alert flags
  - materialized dashboard/instrument views (frontend display namespace)
- `ai_universe`:
  - per-stock AI intelligence
  - sector/market context docs in `tm_news_runs`
  - sentiment gauge inputs

Runtime extension:

- Paid tracked stocks are unioned into per-stock AI generation (on top of base `ai_universe`).

## 3) Primary collections and namespace rules

- Prices:
  - `tm_latest_prices/{instrument_id}`
  - `market_price_snapshots/{market}/shards/*`
- Scoring:
  - `tm_stock_intel_pro/{market}__{price_universe}/stocks/{instrument_id}`
- AI/news:
  - `tm_news_runs/{market}__{ai_universe}/stock_intelligence/{instrument_id}`
  - `tm_news_runs/{market}__{ai_universe}/sector_context/{sector_id}`
  - `tm_news_runs/{market}__{ai_universe}/market_context/overview`
- Materialized views (display):
  - `tm_views_dashboard/{market}__{price_universe}`
  - `tm_views_instrument/{instrument_id}__{price_universe}`
- User-facing derived:
  - `tm_watchlist_views/{uid}`
  - `tm_user_alert_flags/*`
  - `tm_heat_list/{market}`
  - `tm_divergence/{market}`
  - `tm_sentiment_flip/{market}`

## 4) Frontend read contract

- Dashboard / stock instrument views: read `price_universe`.
- Stock AI brief / news / sector context: read `ai_universe`.
- Market snapshot tape/search surfaces: read `market_price_snapshots`.

## 5) Backend activation semantics

- `sync_price_snapshots --activate` updates `<MARKET>_price_universe`.
- `materialize_views --activate` updates `<MARKET>_price_universe` (display namespace is price).
- AI universe changes are explicit via `save_active_ai_universe` paths or config operations.

## 6) Operational sanity checklist

Before market open:

1. `tm_config/active_universes` has all required keys.
2. `run_pipeline --dry-run` resolves both `price_universe` and `ai_universe`.
3. `tm_views_dashboard/{market}__{price_universe}` exists after materialize stage.
4. `tm_news_runs/{market}__{ai_universe}` has recent `stock_intelligence` updates.
