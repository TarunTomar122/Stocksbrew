# Cloud Run Pipeline (Tikrr)

## Lanes (target shape)

1. `tracked_news_prep` (pre-open): fetch + enrich tracked-stock news only.
2. `price_core_open` (market open): fast sharded price refresh for core list.
3. `tracked_open_briefs` (after open): build tracked AI briefs from fresh prices + cached enriched news, then targeted materialize.
4. `price_core_intraday` (every 15-20 min): sharded price refresh + lightweight materialize.
5. `market_open_email` (after open chain): send market-open digest emails (pro personalized + free generic).
6. `daily_postclose` (once post-close): heavier daily chain.

## Folder layout

- `orchestrator/dispatch.py`: lane dispatcher + sharded fanout + run state.
- `orchestrator/state.py`: Firestore state in `tm_pipeline_runs/*`.
- `orchestrator/run_api.py`: Cloud Run Jobs API client.
- `jobs/*.py`: lane workers.
- `scripts/deploy-jobs.sh`: build image + deploy all jobs.
- `scripts/run-dispatch.sh`: run one lane manually.
- `scripts/setup-scheduler.sh`: create/update Cloud Scheduler jobs.

## Required env vars

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_REGION="us-central1"
export FIREBASE_SERVICE_ACCOUNT_JSON="$(cat /abs/path/firebase-service-account.json)"
export SERVICE_ACCOUNT_EMAIL="tikrr-runner@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-4.1-mini"  # cheap default
```

For scheduler setup:

```bash
export SCHEDULER_SERVICE_ACCOUNT_EMAIL="tikrr-scheduler@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"
```

## One-time API enablement

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  --project "$GOOGLE_CLOUD_PROJECT"
```

## Deploy jobs

```bash
bash backend/cloudrun/scripts/deploy-jobs.sh
```

## Manual lane tests

```bash
LANE=tracked_news_prep SHARD_SIZE=2 MAX_PARALLEL=2 PER_STOCK_CAP=3 bash backend/cloudrun/scripts/run-dispatch.sh
LANE=price_core_open LIMIT=5 SHARD_SIZE=2 MAX_PARALLEL=2 bash backend/cloudrun/scripts/run-dispatch.sh
LANE=tracked_open_briefs SHARD_SIZE=2 MAX_PARALLEL=2 PER_STOCK_CAP=3 bash backend/cloudrun/scripts/run-dispatch.sh
LANE=price_core_intraday LIMIT=5 SHARD_SIZE=2 MAX_PARALLEL=2 bash backend/cloudrun/scripts/run-dispatch.sh
LANE=daily_postclose bash backend/cloudrun/scripts/run-dispatch.sh
```

## Scheduler setup (7 PM IST baseline)

```bash
bash backend/cloudrun/scripts/setup-scheduler.sh
```

Default cron assumes open at `7:00 PM IST`.
When US open shifts to `8:00 PM IST`, update scheduler cron envs by +1 hour and rerun setup.
