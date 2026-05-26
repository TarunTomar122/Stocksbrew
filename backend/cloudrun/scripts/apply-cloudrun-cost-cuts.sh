#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-${1:-}}"
REGION="${GOOGLE_CLOUD_REGION:-${2:-us-central1}}"
SCHED_LOC="${SCHEDULER_LOCATION:-${3:-us-central1}}"

if [[ -z "${PROJECT}" ]]; then
  echo "Usage: GOOGLE_CLOUD_PROJECT=<project> $0 [project] [region] [scheduler_location]"
  exit 1
fi

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}
need gcloud

echo "Applying safe Cloud Run/Scheduler cost cuts for project=${PROJECT}"

# 1) Reduce scheduler retry amplification.
SCHED_JOBS=(
  tikrr-preopen-news
  tikrr-open-price
  tikrr-open-briefs
  tikrr-open-anomalies
  tikrr-reddit-buzz
  tikrr-close-anomalies
  tikrr-close-reddit-buzz
  tikrr-open-emails
  tikrr-intraday-price
  tikrr-postclose
  tikrr-earnings-intel
  tikrr-on-demand-news
)

for job in "${SCHED_JOBS[@]}"; do
  if gcloud scheduler jobs describe "$job" --location="$SCHED_LOC" --project="$PROJECT" >/dev/null 2>&1; then
    echo "- scheduler retry=0: $job"
    gcloud scheduler jobs update http "$job" \
      --location="$SCHED_LOC" \
      --project="$PROJECT" \
      --max-retry-attempts=0 \
      --min-backoff=5s \
      --max-backoff=60s \
      --max-doublings=1 >/dev/null
  fi
done

# 2) Reduce job-level retries for heavy jobs.
RUN_JOBS=(
  tikrr-dispatch
  tikrr-price-core-intraday
  tikrr-price-core-open
  tikrr-daily-postclose
)

for job in "${RUN_JOBS[@]}"; do
  if gcloud run jobs describe "$job" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
    echo "- run job max-retries=0: $job"
    gcloud run jobs update "$job" \
      --region="$REGION" \
      --project="$PROJECT" \
      --max-retries=0 >/dev/null
  fi
done

# 3) Lower intraday fanout (keep same schedule, cheaper burst).
# Update through setup script env so cron body carries lower limit/higher shard.
if [[ -f backend/cloudrun/scripts/setup-scheduler.sh ]]; then
  echo "- updating scheduler payload knobs: LIMIT=80 SHARD_SIZE=40 MAX_PARALLEL=2"
  GOOGLE_CLOUD_PROJECT="$PROJECT" \
  GOOGLE_CLOUD_REGION="$REGION" \
  SCHEDULER_LOCATION="$SCHED_LOC" \
  SCHEDULER_SERVICE_ACCOUNT_EMAIL="${SCHEDULER_SERVICE_ACCOUNT_EMAIL:-tikrr-scheduler@${PROJECT}.iam.gserviceaccount.com}" \
  LIMIT=80 SHARD_SIZE=40 MAX_PARALLEL=2 \
  bash backend/cloudrun/scripts/setup-scheduler.sh >/dev/null
fi

echo "Done. Re-run audit script to verify drops in retries/fanout."
