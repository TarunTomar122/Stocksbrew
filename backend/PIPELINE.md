# Backend Pipeline Reference

This file mirrors the current backend behavior.
Primary operational runbook is `docs/pipeline.md`.

## Active Pipelines

### 1) Primary Tikrr pipeline (current app)

Core scripts:

- `backend/scripts/seed_tikrr_meta.py`
- `backend/scripts/bootstrap_prices.py`
- `backend/scripts/refresh_prices.py`
- `backend/scripts/run_tikrr_demo_batch.py`
- `backend/scripts/generate_stocks_universe.py`

Data path:

```text
backend/scripts/run_tikrr_demo_batch.py
  -> backend/tikrr_pipeline/client.py
  -> /api/tikrr/*
  -> Firestore (stocks, markets, sectors, meta, meta_run_status)
```

### 2) Legacy `tm_*` materialization pipeline (still present)

Core scripts:

- `backend/scripts/sync_instrument_universe.py`
- `backend/scripts/sync_price_snapshots.py`
- `backend/scripts/ingest_news.py`
- `backend/scripts/enrich_articles.py`
- `backend/scripts/build_stock_intelligence.py`
- `backend/scripts/build_context_intelligence.py`
- `backend/scripts/materialize_views.py`
- `backend/scripts/build_news_intelligence.py`

This track writes `tm_*` and `tm_views_*` collections and is still used by `/instrument/[instrumentId]`.

## Notes on Older Script

`backend/scripts/bootstrap_tikrr_dynamic.py` is still in the repo and still writes primary Tikrr collections, but the actively used batch flow for current docs is `run_tikrr_demo_batch.py`.

## Recommended Commands

```bash
# seed + bootstrap
python3 -m backend.scripts.seed_tikrr_meta
python3 -m backend.scripts.bootstrap_prices --market US --universe us_core_155
python3 -m backend.scripts.bootstrap_prices --market IN --universe in_core_150

# fast refresh
python3 -m backend.scripts.refresh_prices --market US --market IN

# AI run
python3 -m backend.scripts.run_tikrr_demo_batch --market ALL --run-type market_open
```
