# Firestore Blueprint (Current Universe Model)

Last updated: 2026-05-04

This doc is the source of truth for how backend and frontend read universes.

## 1) Canonical universe config

Document: `tm_config/active_universes`

Required keys:

- `US_universe` (single canonical US universe)
- `IN_price_universe`, `IN_ai_universe` (legacy IN split)

Example:

```json
{
  "US_universe": "us_core_155",
  "IN_price_universe": "in_core_150",
  "IN_ai_universe": "in_ai_launch",
  "updated_at": "..."
}
```

Important:

- No legacy fallback to `US` / `IN`.
- Missing required keys should be treated as configuration errors.

## 2) Universe responsibilities

- `US_universe`:
  - price sync
  - stock metrics + intel_pro scoring
  - technicals, breadth, screens, alert flags
  - materialized dashboard/instrument views (frontend display namespace)
- `US_universe` AI namespace:
  - per-stock AI intelligence
  - sector/market context docs in `tm_news_runs`
  - sentiment gauge inputs

Runtime extension:

- Paid tracked stocks are unioned into per-stock AI generation (on top of base `US_universe`).

## 3) Primary collections and namespace rules

- Prices:
  - `tm_latest_prices/{instrument_id}`
  - `market_price_snapshots/{market}/shards/*`
- Scoring:
  - `tm_stock_intel_pro/{market}__{universe}/stocks/{instrument_id}`
- AI/news:
  - `tm_news_runs/{market}__{universe}/stock_intelligence/{instrument_id}`
  - `tm_news_runs/{market}__{universe}/sector_context/{sector_id}`
  - `tm_news_runs/{market}__{universe}/market_context/overview`
- Materialized views (display):
  - `tm_views_dashboard/{market}__{universe}`
  - `tm_views_instrument/{instrument_id}__{universe}`
- User-facing derived:
  - `tm_watchlist_views/{uid}`
  - `tm_radar_user_views/{uid}` and `/history/{timestamp}` — validated daily brief, max-three attention items, upcoming events, and quiet state
  - `tm_radar_inbox/{uid}/items/{event_id}` — per-user item lifecycle (`new`, seen, snoozed, resolved)
  - `tm_user_alert_flags/*`
  - `tm_heat_list/{market}`
  - `tm_divergence/{market}`
  - `tm_sentiment_flip/{market}`
- Radar evidence and event ledger:
  - `tm_radar_evidence/{evidence_id}` — normalized, cited SEC/IR and provider evidence
  - `tm_radar_events/{event_id}` — immutable deduplicated state transitions
  - `tm_radar_stock_state/{instrument_id}` and `/history/{timestamp}` — latest reducer state and run snapshots
  - `tm_directive_history/{instrument_id}/calls/{date}` — original calls plus measured 1d/7d/30d outcomes

## 4) Frontend read contract

- Dashboard / stock instrument views: read `US_universe`.
- Stock AI brief / news / sector context: read `US_universe`.
- Market snapshot tape/search surfaces: read `market_price_snapshots`.

## 5) Backend activation semantics

- `sync_price_snapshots --activate` updates `US_universe` for US runs.
- `materialize_views --activate` updates `US_universe` for US runs.
- IN keeps legacy split activation paths.

## 6) Operational sanity checklist

Before market open:

1. `tm_config/active_universes.US_universe` is set.
2. `run_pipeline --dry-run` resolves US universe cleanly.
3. `tm_views_dashboard/{market}__{universe}` exists after materialize stage.
4. `tm_news_runs/{market}__{universe}` has recent `stock_intelligence` updates.
