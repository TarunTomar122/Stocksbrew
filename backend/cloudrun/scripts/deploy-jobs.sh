#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GOOGLE_CLOUD_PROJECT:-}" ]]; then
  echo "Missing GOOGLE_CLOUD_PROJECT"
  exit 1
fi
if [[ -z "${GOOGLE_CLOUD_REGION:-}" ]]; then
  echo "Missing GOOGLE_CLOUD_REGION"
  exit 1
fi
if [[ -z "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  echo "Missing FIREBASE_SERVICE_ACCOUNT_JSON"
  exit 1
fi

load_tavily_key_from_env_files() {
  if [[ -n "${TAVILY_API_KEY:-}" ]]; then
    return
  fi
  local repo_root
  repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
  local env_file key line
  for env_file in "${repo_root}/.env.local" "${repo_root}/.env" "${repo_root}/backend/.env"; do
    [[ -f "${env_file}" ]] || continue
    line="$(grep -E '^[[:space:]]*TAVILY_API_KEY=' "${env_file}" 2>/dev/null | tail -1 || true)"
    [[ -n "${line}" ]] || continue
    key="${line#TAVILY_API_KEY=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#\"}"
    key="${key%\"}"
    key="${key#\'}"
    key="${key%\'}"
    if [[ -n "${key}" ]]; then
      export TAVILY_API_KEY="${key}"
      return
    fi
  done
}

load_tavily_key_from_env_files

IMAGE_NAME="${IMAGE_NAME:-tikrr-pipeline-runner}"
IMAGE_URI="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/tikrr/${IMAGE_NAME}:latest"
FIREBASE_SECRET_NAME="${FIREBASE_SECRET_NAME:-tikrr-firebase-service-account-json}"
OPENAI_SECRET_NAME="${OPENAI_SECRET_NAME:-tikrr-openai-api-key}"
TAVILY_SECRET_NAME="${TAVILY_SECRET_NAME:-tikrr-tavily-api-key}"
BREVO_SECRET_NAME="${BREVO_SECRET_NAME:-tikrr-brevo-api-key}"
TWELVE_DATA_SECRET_NAME="${TWELVE_DATA_SECRET_NAME:-tikrr-twelve-data-api-key}"
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4.1-mini}"
PAUSE_DIRECTIVE_CHANGE_EMAILS="${PAUSE_DIRECTIVE_CHANGE_EMAILS:-1}"
EMAILS_ENABLED="${EMAILS_ENABLED:-0}"
INTRADAY_LIMIT_CAP="${INTRADAY_LIMIT_CAP:-80}"
INTRADAY_SHARD_SIZE_MIN="${INTRADAY_SHARD_SIZE_MIN:-40}"
INTRADAY_MAX_PARALLEL_CAP="${INTRADAY_MAX_PARALLEL_CAP:-2}"
CLOUD_RUN_JOB_MAX_RETRIES="${CLOUD_RUN_JOB_MAX_RETRIES:-0}"

DISPATCH_JOB_NAME="${DISPATCH_JOB_NAME:-tikrr-dispatch}"
TRACKED_NEWS_PREP_JOB_NAME="${TRACKED_NEWS_PREP_JOB_NAME:-tikrr-tracked-news-prep}"
TRACKED_INCREMENTAL_REFRESH_JOB_NAME="${TRACKED_INCREMENTAL_REFRESH_JOB_NAME:-tikrr-tracked-incremental-refresh}"
PRICE_CORE_OPEN_JOB_NAME="${PRICE_CORE_OPEN_JOB_NAME:-tikrr-price-core-open}"
TRACKED_OPEN_BRIEFS_JOB_NAME="${TRACKED_OPEN_BRIEFS_JOB_NAME:-tikrr-tracked-open-briefs}"
PRICE_CORE_INTRADAY_JOB_NAME="${PRICE_CORE_INTRADAY_JOB_NAME:-tikrr-price-core-intraday}"
OPEN_ANOMALIES_JOB_NAME="${OPEN_ANOMALIES_JOB_NAME:-tikrr-open-anomalies}"
REDDIT_BUZZ_JOB_NAME="${REDDIT_BUZZ_JOB_NAME:-tikrr-reddit-buzz}"
DAILY_POSTCLOSE_JOB_NAME="${DAILY_POSTCLOSE_JOB_NAME:-tikrr-daily-postclose}"
ON_DEMAND_NEWS_JOB_NAME="${ON_DEMAND_NEWS_JOB_NAME:-tikrr-on-demand-news}"
STOCK_REQUESTS_JOB_NAME="${STOCK_REQUESTS_JOB_NAME:-tikrr-stock-requests}"
EARNINGS_INTEL_JOB_NAME="${EARNINGS_INTEL_JOB_NAME:-tikrr-earnings-intel}"
PRE_EARNINGS_INTEL_JOB_NAME="${PRE_EARNINGS_INTEL_JOB_NAME:-tikrr-pre-earnings-intel}"
ZONE_BRIEFS_JOB_NAME="${ZONE_BRIEFS_JOB_NAME:-tikrr-zone-briefs}"
MARKET_EVENTS_JOB_NAME="${MARKET_EVENTS_JOB_NAME:-tikrr-market-events}"
DATA_HEALTH_JOB_NAME="${DATA_HEALTH_JOB_NAME:-tikrr-data-health}"
STOCK_FACTS_JOB_NAME="${STOCK_FACTS_JOB_NAME:-tikrr-stock-facts}"
SECTOR_REGIMES_JOB_NAME="${SECTOR_REGIMES_JOB_NAME:-tikrr-sector-regimes}"
TRUMP_LOGIC_JOB_NAME="${TRUMP_LOGIC_JOB_NAME:-tikrr-trump-logic}"
PREMARKET_MOVERS_JOB_NAME="${PREMARKET_MOVERS_JOB_NAME:-tikrr-premarket-movers}"
PREMARKET_INTEL_JOB_NAME="${PREMARKET_INTEL_JOB_NAME:-tikrr-premarket-intel}"
PREMARKET_EMAIL_JOB_NAME="${PREMARKET_EMAIL_JOB_NAME:-tikrr-premarket-email}"
CONTRARIAN_CALLS_JOB_NAME="${CONTRARIAN_CALLS_JOB_NAME:-tikrr-contrarian-calls}"

ensure_repo() {
  if ! gcloud artifacts repositories describe tikrr --location="${GOOGLE_CLOUD_REGION}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
    gcloud artifacts repositories create tikrr \
      --repository-format=docker \
      --location="${GOOGLE_CLOUD_REGION}" \
      --description="tikrr backend images" \
      --project="${GOOGLE_CLOUD_PROJECT}"
  fi
}

build_image() {
  local cfg
  cfg="$(mktemp -t tikrr-cloudbuild-XXXX.yaml)"
  cat > "${cfg}" <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - backend/cloudrun/Dockerfile.runner
      - -t
      - ${IMAGE_URI}
      - .
images:
  - ${IMAGE_URI}
EOF
  gcloud builds submit --project="${GOOGLE_CLOUD_PROJECT}" --config="${cfg}" .
  rm -f "${cfg}"
}

upsert_secret() {
  if ! gcloud secrets describe "${FIREBASE_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
    gcloud secrets create "${FIREBASE_SECRET_NAME}" --replication-policy=automatic --project="${GOOGLE_CLOUD_PROJECT}"
  fi
  printf '%s' "${FIREBASE_SERVICE_ACCOUNT_JSON}" | gcloud secrets versions add "${FIREBASE_SECRET_NAME}" --data-file=- --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null
}

upsert_optional_openai_secret() {
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    if ! gcloud secrets describe "${OPENAI_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
      echo "Missing OPENAI_API_KEY and secret ${OPENAI_SECRET_NAME} does not exist."
      echo "Set OPENAI_API_KEY once or create secret ${OPENAI_SECRET_NAME} before deploy."
      exit 1
    fi
    return
  fi
  if ! gcloud secrets describe "${OPENAI_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
    gcloud secrets create "${OPENAI_SECRET_NAME}" --replication-policy=automatic --project="${GOOGLE_CLOUD_PROJECT}"
  fi
  printf '%s' "${OPENAI_API_KEY}" | gcloud secrets versions add "${OPENAI_SECRET_NAME}" --data-file=- --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null
}

upsert_optional_brevo_secret() {
  if [[ -z "${BREVO_API_KEY:-}" ]]; then
    return
  fi
  if ! gcloud secrets describe "${BREVO_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
    gcloud secrets create "${BREVO_SECRET_NAME}" --replication-policy=automatic --project="${GOOGLE_CLOUD_PROJECT}"
  fi
  printf '%s' "${BREVO_API_KEY}" | gcloud secrets versions add "${BREVO_SECRET_NAME}" --data-file=- --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null
}

upsert_optional_twelve_data_secret() {
  if [[ -z "${TWELVE_DATA_API_KEY:-}" ]]; then
    return
  fi
  if ! gcloud secrets describe "${TWELVE_DATA_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
    gcloud secrets create "${TWELVE_DATA_SECRET_NAME}" --replication-policy=automatic --project="${GOOGLE_CLOUD_PROJECT}"
  fi
  printf '%s' "${TWELVE_DATA_API_KEY}" | gcloud secrets versions add "${TWELVE_DATA_SECRET_NAME}" --data-file=- --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null
}

upsert_optional_tavily_secret() {
  if [[ -z "${TAVILY_API_KEY:-}" ]]; then
    return
  fi
  if ! gcloud secrets describe "${TAVILY_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
    gcloud secrets create "${TAVILY_SECRET_NAME}" --replication-policy=automatic --project="${GOOGLE_CLOUD_PROJECT}"
  fi
  printf '%s' "${TAVILY_API_KEY}" | gcloud secrets versions add "${TAVILY_SECRET_NAME}" --data-file=- --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null
}

tavily_secret_available() {
  if [[ -n "${TAVILY_API_KEY:-}" ]]; then
    return 0
  fi
  gcloud secrets describe "${TAVILY_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1
}

twelve_data_secret_available() {
  if [[ -n "${TWELVE_DATA_API_KEY:-}" ]]; then
    return 0
  fi
  gcloud secrets describe "${TWELVE_DATA_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1
}

deploy_job() {
  local job_name="$1"
  local memory="$2"
  local cpu="$3"
  local timeout="$4"
  local job_args="${5:-}"

  local job_secrets="FIREBASE_SERVICE_ACCOUNT_JSON=${FIREBASE_SECRET_NAME}:latest,OPENAI_API_KEY=${OPENAI_SECRET_NAME}:latest"
  if tavily_secret_available; then
    job_secrets="${job_secrets},TAVILY_API_KEY=${TAVILY_SECRET_NAME}:latest"
  fi
  if [[ -n "${BREVO_API_KEY:-}" ]] || gcloud secrets describe "${BREVO_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
    job_secrets="${job_secrets},BREVO_API_KEY=${BREVO_SECRET_NAME}:latest"
  fi
  if twelve_data_secret_available; then
    job_secrets="${job_secrets},TWELVE_DATA_API_KEY=${TWELVE_DATA_SECRET_NAME}:latest"
  fi

  local deploy_args=(
    run jobs deploy "${job_name}"
    --project="${GOOGLE_CLOUD_PROJECT}"
    --region="${GOOGLE_CLOUD_REGION}"
    --image="${IMAGE_URI}"
    --command=python
    --memory="${memory}"
    --cpu="${cpu}"
    --task-timeout="${timeout}"
    --max-retries="${CLOUD_RUN_JOB_MAX_RETRIES}"
    --parallelism=1
    --tasks=1
    --set-secrets="${job_secrets}"
    --set-env-vars="GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_REGION=${GOOGLE_CLOUD_REGION},OPENAI_MODEL=${OPENAI_MODEL},EMAILS_ENABLED=${EMAILS_ENABLED},PAUSE_DIRECTIVE_CHANGE_EMAILS=${PAUSE_DIRECTIVE_CHANGE_EMAILS},INTRADAY_LIMIT_CAP=${INTRADAY_LIMIT_CAP},INTRADAY_SHARD_SIZE_MIN=${INTRADAY_SHARD_SIZE_MIN},INTRADAY_MAX_PARALLEL_CAP=${INTRADAY_MAX_PARALLEL_CAP},TRACKED_NEWS_PREP_JOB_NAME=${TRACKED_NEWS_PREP_JOB_NAME},TRACKED_INCREMENTAL_REFRESH_JOB_NAME=${TRACKED_INCREMENTAL_REFRESH_JOB_NAME},PRICE_CORE_OPEN_JOB_NAME=${PRICE_CORE_OPEN_JOB_NAME},TRACKED_OPEN_BRIEFS_JOB_NAME=${TRACKED_OPEN_BRIEFS_JOB_NAME},PRICE_CORE_INTRADAY_JOB_NAME=${PRICE_CORE_INTRADAY_JOB_NAME},OPEN_ANOMALIES_JOB_NAME=${OPEN_ANOMALIES_JOB_NAME},REDDIT_BUZZ_JOB_NAME=${REDDIT_BUZZ_JOB_NAME},DAILY_POSTCLOSE_JOB_NAME=${DAILY_POSTCLOSE_JOB_NAME},ON_DEMAND_NEWS_JOB_NAME=${ON_DEMAND_NEWS_JOB_NAME},STOCK_REQUESTS_JOB_NAME=${STOCK_REQUESTS_JOB_NAME},EARNINGS_INTEL_JOB_NAME=${EARNINGS_INTEL_JOB_NAME},PRE_EARNINGS_INTEL_JOB_NAME=${PRE_EARNINGS_INTEL_JOB_NAME},ZONE_BRIEFS_JOB_NAME=${ZONE_BRIEFS_JOB_NAME},MARKET_EVENTS_JOB_NAME=${MARKET_EVENTS_JOB_NAME},DATA_HEALTH_JOB_NAME=${DATA_HEALTH_JOB_NAME},STOCK_FACTS_JOB_NAME=${STOCK_FACTS_JOB_NAME},SECTOR_REGIMES_JOB_NAME=${SECTOR_REGIMES_JOB_NAME},TRUMP_LOGIC_JOB_NAME=${TRUMP_LOGIC_JOB_NAME},PREMARKET_MOVERS_JOB_NAME=${PREMARKET_MOVERS_JOB_NAME},PREMARKET_INTEL_JOB_NAME=${PREMARKET_INTEL_JOB_NAME},PREMARKET_EMAIL_JOB_NAME=${PREMARKET_EMAIL_JOB_NAME},CONTRARIAN_CALLS_JOB_NAME=${CONTRARIAN_CALLS_JOB_NAME}"
  )

  if [[ -n "${SERVICE_ACCOUNT_EMAIL:-}" ]]; then
    deploy_args+=(--service-account="${SERVICE_ACCOUNT_EMAIL}")
  fi
  if [[ -n "${job_args}" ]]; then
    deploy_args+=(--args="${job_args}")
  fi

  gcloud "${deploy_args[@]}"
}

# ---------------------------------------------------------------------------
# Job registry: short-name -> "full-job-name memory cpu timeout"
# Usage:
#   bash deploy-jobs.sh                         # build image + deploy ALL jobs
#   bash deploy-jobs.sh daily-postclose         # build image + deploy one job
#   bash deploy-jobs.sh daily-postclose tracked-open-briefs  # deploy two jobs
#   SKIP_BUILD=1 bash deploy-jobs.sh daily-postclose        # skip image build
# ---------------------------------------------------------------------------
declare -A JOB_REGISTRY
JOB_REGISTRY[dispatch]="${DISPATCH_JOB_NAME} 1Gi 1 1200s"
JOB_REGISTRY[tracked-news-prep]="${TRACKED_NEWS_PREP_JOB_NAME} 2Gi 2 2400s"
JOB_REGISTRY[tracked-incremental-refresh]="${TRACKED_INCREMENTAL_REFRESH_JOB_NAME} 3Gi 2 3600s"
JOB_REGISTRY[price-core-open]="${PRICE_CORE_OPEN_JOB_NAME} 2Gi 2 1800s"
JOB_REGISTRY[tracked-open-briefs]="${TRACKED_OPEN_BRIEFS_JOB_NAME} 3Gi 2 2400s"
JOB_REGISTRY[price-core-intraday]="${PRICE_CORE_INTRADAY_JOB_NAME} 2Gi 2 1800s"
JOB_REGISTRY[open-anomalies]="${OPEN_ANOMALIES_JOB_NAME} 2Gi 2 2400s"
JOB_REGISTRY[reddit-buzz]="${REDDIT_BUZZ_JOB_NAME} 1Gi 1 1200s"
JOB_REGISTRY[daily-postclose]="${DAILY_POSTCLOSE_JOB_NAME} 3Gi 2 5400s"
JOB_REGISTRY[on-demand-news]="${ON_DEMAND_NEWS_JOB_NAME} 2Gi 1 1800s"
JOB_REGISTRY[stock-requests]="${STOCK_REQUESTS_JOB_NAME} 2Gi 1 3600s"
JOB_REGISTRY[earnings-intel]="${EARNINGS_INTEL_JOB_NAME} 3Gi 2 3600s"
JOB_REGISTRY[pre-earnings-intel]="${PRE_EARNINGS_INTEL_JOB_NAME} 3Gi 2 3600s"
JOB_REGISTRY[zone-briefs]="${ZONE_BRIEFS_JOB_NAME} 3Gi 2 3600s"
JOB_REGISTRY[market-events]="${MARKET_EVENTS_JOB_NAME} 1Gi 1 900s"
JOB_REGISTRY[data-health]="${DATA_HEALTH_JOB_NAME} 512Mi 1 300s"
JOB_REGISTRY[stock-facts]="${STOCK_FACTS_JOB_NAME} 2Gi 2 5400s"
JOB_REGISTRY[sector-regimes]="${SECTOR_REGIMES_JOB_NAME} 1Gi 1 900s"
JOB_REGISTRY[trump-logic]="${TRUMP_LOGIC_JOB_NAME} 1Gi 1 1200s"
JOB_REGISTRY[premarket-movers]="${PREMARKET_MOVERS_JOB_NAME} 1Gi 1 900s"
JOB_REGISTRY[premarket-intel]="${PREMARKET_INTEL_JOB_NAME} 3Gi 2 3600s"
JOB_REGISTRY[premarket-email]="${PREMARKET_EMAIL_JOB_NAME} 512Mi 1 600s"
JOB_REGISTRY[contrarian-calls]="${CONTRARIAN_CALLS_JOB_NAME} 1Gi 1 900s"

TARGET_JOBS=("$@")

# Validate any specified job names up front so we fail fast before building.
for key in "${TARGET_JOBS[@]}"; do
  if [[ -z "${JOB_REGISTRY[$key]:-}" ]]; then
    echo "Unknown job: '${key}'"
    echo "Known jobs: ${!JOB_REGISTRY[*]}"
    exit 1
  fi
done

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  echo "SKIP_BUILD=1 — skipping image build and secret updates."
else
  echo "Ensuring artifact registry..."
  ensure_repo

  echo "Building runner image ${IMAGE_URI}..."
  build_image

  echo "Updating firebase secret ${FIREBASE_SECRET_NAME}..."
  upsert_secret
  echo "Verifying/updating OpenAI secret ${OPENAI_SECRET_NAME}..."
  upsert_optional_openai_secret
  if [[ -n "${BREVO_API_KEY:-}" ]]; then
    echo "Updating Brevo secret ${BREVO_SECRET_NAME}..."
    upsert_optional_brevo_secret
  fi
  if [[ -n "${TWELVE_DATA_API_KEY:-}" ]]; then
    echo "Updating Twelve Data secret ${TWELVE_DATA_SECRET_NAME}..."
    upsert_optional_twelve_data_secret
  fi
  if [[ -n "${TAVILY_API_KEY:-}" ]]; then
    echo "Updating Tavily secret ${TAVILY_SECRET_NAME}..."
    upsert_optional_tavily_secret
  elif ! tavily_secret_available; then
    echo "Note: TAVILY_API_KEY not set; pre-earnings web research will skip until secret ${TAVILY_SECRET_NAME} exists."
  fi
fi

run_deploy() {
  local key="$1"
  read -r job_name memory cpu timeout <<< "${JOB_REGISTRY[$key]}"
  local job_args=""
  case "${key}" in
    tracked-incremental-refresh)
      job_args="-m,backend.cloudrun.jobs.tracked_incremental_refresh_job,--run-id,manual,--lane,tracked_incremental_refresh,--market,US,--universe,us_ai_launch"
      ;;
    premarket-movers)
      job_args="-m,backend.cloudrun.jobs.premarket_movers_job,--run-id,manual,--lane,premarket_movers,--market,US"
      ;;
    premarket-intel)
      job_args="-m,backend.cloudrun.jobs.premarket_intel_job,--run-id,manual,--lane,premarket_intel,--market,US"
      ;;
    premarket-email)
      job_args="-m,backend.cloudrun.jobs.premarket_email_job,--run-id,manual,--lane,premarket_email,--market,US"
      ;;
  esac
  deploy_job "${job_name}" "${memory}" "${cpu}" "${timeout}" "${job_args}"
}

if [[ ${#TARGET_JOBS[@]} -eq 0 ]]; then
  echo "Deploying all jobs..."
  for key in "${!JOB_REGISTRY[@]}"; do
    run_deploy "${key}"
  done
  echo "Done. All jobs deployed."
else
  echo "Deploying: ${TARGET_JOBS[*]}..."
  for key in "${TARGET_JOBS[@]}"; do
    run_deploy "${key}"
  done
  echo "Done. Deployed: ${TARGET_JOBS[*]}"
fi
