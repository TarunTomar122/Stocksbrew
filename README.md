# Tikrr

Market intelligence app built with:

- Next.js frontend/server routes (`app/`)
- Python pipeline scripts (`backend/scripts/`)
- Firestore as the system of record

## Current Architecture

There are two data tracks in this repo:

1. **Primary Tikrr track (active dashboard/stock/sector pages)**
- Collections: `stocks`, `markets`, `sectors`, `portfolio_briefs`, `meta`, `meta_run_status`
- Read layer: `lib/api.ts`
- Write layer: `app/api/tikrr/*` via `lib/tikrr-admin.ts`
- Main pipeline scripts: `run_tikrr_demo_batch.py`, `refresh_prices.py`, `bootstrap_prices.py`, `seed_tikrr_meta.py`

2. **Legacy materialized-view track (still used by instrument page)**
- Collections: `tm_*` and `tm_views_*`
- Read layer: `lib/firestore-views.ts`
- Used by: `app/instrument/[instrumentId]/page.tsx`

If you are working on dashboard/stock/sector behavior, use the **primary Tikrr track**.

## Main Docs

- Primary pipeline runbook: `docs/pipeline.md`
- Secondary backend reference: `backend/PIPELINE.md`

## Local Setup

### 1) Install dependencies

```bash
npm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### 2) Configure environment

Backend scripts load from `backend/.env` (and repo-root `.env` if present).

Minimum for primary Tikrr pipeline:

```bash
OPENAI_API_KEY=sk-...
FIREBASE_SERVICE_ACCOUNT_PATH=./backend/trace-money-72276-firebase-adminsdk-fbsvc-87d8bdd9a5.json
SEARXNG_BASE_URL=http://localhost:8888
TIKRR_API_BASE_URL=http://localhost:3000/api/tikrr
TIKRR_API_KEY=your-secret
```

For Next.js API routes, set the same API key in app env:

```bash
TIKRR_API_KEY=your-secret
```

### 3) Seed + bootstrap (first time)

```bash
python3 -m backend.scripts.seed_tikrr_meta
python3 -m backend.scripts.bootstrap_prices --market US --universe us_core_155
python3 -m backend.scripts.bootstrap_prices --market IN --universe in_core_150
```

### 4) Run app + pipeline

```bash
npm run dev
python3 -m backend.scripts.run_tikrr_demo_batch --market ALL --run-type market_open
```

Optional frequent quote refresh:

```bash
python3 -m backend.scripts.refresh_prices --market US --market IN
```

## Verification

```bash
npm run lint
npm run test
npm run typecheck
npm run build
npm run backend:test
```
