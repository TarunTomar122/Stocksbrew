# Tikrr Pipeline

This is the source-of-truth runbook for the current pipeline.

## Architecture

The app currently has two tracks in code:

1. **Primary Tikrr track (active)**
- Firestore collections: `stocks`, `markets`, `sectors`, `portfolio_briefs`, `meta`, `meta_run_status`
- Frontend pages: `/dashboard`, `/dashboard/signals`, `/stock/[symbol]`, `/sector/[id]`
- Read path: `lib/api.ts`
- Write path: backend scripts -> `app/api/tikrr/*` -> Firestore

2. **Legacy `tm_*` track (compatibility)**
- Firestore collections: `tm_*`, `tm_views_*`
- Still used by: `/instrument/[instrumentId]`
- Read path: `lib/firestore-views.ts`

## Main Runtime Flow (Primary)

```text
yfinance + SearXNG + OpenAI
  -> backend/scripts/run_tikrr_demo_batch.py
  -> POST /api/tikrr/{stock|market|sector|run-status}
  -> Firestore (stocks, markets, sectors, meta, meta_run_status)
  -> Next.js server components via lib/api.ts
```

## Required Config

### Universe/config files

- `backend/config/tikrr_eval_universe.json`
- `backend/config/tikrr_ai_universe.json`
- `backend/config/instrument_universe.json`
- `backend/config/sources.json` (legacy/other flows)
- `lib/stocks-universe.ts` (generated search universe)

### Environment variables

Backend scripts (from `backend/.env`):

```bash
OPENAI_API_KEY=sk-...
FIREBASE_SERVICE_ACCOUNT_PATH=./backend/trace-money-72276-firebase-adminsdk-fbsvc-87d8bdd9a5.json
SEARXNG_BASE_URL=http://localhost:8888
TIKRR_API_BASE_URL=http://localhost:3000/api/tikrr
TIKRR_API_KEY=your-secret
```

Next.js app/API routes:

```bash
TIKRR_API_KEY=your-secret
# or TIKRR_SECRET_KEY=your-secret
```

## Scripts (Primary)

### `seed_tikrr_meta.py`
Seeds:
- `meta/stocks`
- `meta/sectors`
- `meta/schedule`
- `meta/tikrrEvalUniverse` (from eval universe file)

```bash
python3 -m backend.scripts.seed_tikrr_meta
```

### `bootstrap_prices.py`
Creates/updates base `stocks/{market}_{symbol}` docs with quote + fundamentals.

```bash
python3 -m backend.scripts.bootstrap_prices --market US --universe us_core_155
python3 -m backend.scripts.bootstrap_prices --market IN --universe in_core_150
```

### `refresh_prices.py` (fast, non-AI)
Updates only `stocks/*` price fields + `meta/lastRun`.
Also writes `tm_latest_prices` snapshots for legacy compatibility.

```bash
python3 -m backend.scripts.refresh_prices --market US --market IN
```

### `run_tikrr_demo_batch.py` (main AI run)
For each market:
- Builds stock payloads for symbols from `tikrr_ai_universe.json` (or `--symbols` override)
- Builds market payload from index/global cues + SearXNG evidence
- Builds sector payloads using all sector stock price docs + SearXNG evidence
- Pushes all payloads through `app/api/tikrr/*`
- Writes run status into `meta_run_status` and `meta/lastRun`

```bash
python3 -m backend.scripts.run_tikrr_demo_batch --market ALL --run-type market_open
```

`--run-type` values: `pre_market | market_open | midday | market_close`

### `generate_stocks_universe.py`
Regenerates static client search universe used by `components/shell.tsx`.

```bash
python3 -m backend.scripts.generate_stocks_universe
```

## Important Behavior Notes

- `run_tikrr_demo_batch.py` updates `meta/tikrrEvalUniverse.{market}.symbols` with symbols successfully processed in that run.
- `lib/api.ts` filters market stock lists by `meta/tikrrEvalUniverse`, so this can change what appears on dashboard/stock navigation.
- `app/api/tikrr/run-status` also writes `views_dashboard/{market}` snapshots; these are auxiliary and not the primary read path for dashboard pages.

## Typical Workflow

### First-time setup

```bash
python3 -m backend.scripts.seed_tikrr_meta
python3 -m backend.scripts.bootstrap_prices --market US --universe us_core_155
python3 -m backend.scripts.bootstrap_prices --market IN --universe in_core_150
python3 -m backend.scripts.run_tikrr_demo_batch --market ALL --run-type market_open
python3 -m backend.scripts.generate_stocks_universe
```

### Day-to-day

```bash
# frequent quote refresh
python3 -m backend.scripts.refresh_prices --market US --market IN

# AI refresh at chosen checkpoints
python3 -m backend.scripts.run_tikrr_demo_batch --market ALL --run-type midday
```

## Firestore Collections (Primary)

- `stocks/{US|IN}_{SYMBOL}`
- `markets/{US|IN}`
- `sectors/{sector-id}`
- `portfolio_briefs/{US_default|IN_default}`
- `meta/stocks`
- `meta/sectors`
- `meta/schedule`
- `meta/tikrrEvalUniverse`
- `meta/lastRun`
- `meta_run_status/{market}__{runType}`

## Legacy Collections Still in Use

- `tm_config/*`
- `tm_latest_prices/*`
- `tm_views_dashboard/*`
- `tm_views_instrument/*`
- other `tm_*` collections used by legacy scripts
