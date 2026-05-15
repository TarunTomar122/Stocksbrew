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

IMAGE_NAME="${IMAGE_NAME:-tikrr-pipeline-runner}"
IMAGE_URI="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/tikrr/${IMAGE_NAME}:latest"
FIREBASE_SECRET_NAME="${FIREBASE_SECRET_NAME:-tikrr-firebase-service-account-json}"
MIMO_SECRET_NAME="${MIMO_SECRET_NAME:-tikrr-mimo-api-key}"

DISPATCH_JOB_NAME="${DISPATCH_JOB_NAME:-tikrr-dispatch}"
TRACKED_NEWS_PREP_JOB_NAME="${TRACKED_NEWS_PREP_JOB_NAME:-tikrr-tracked-news-prep}"
PRICE_CORE_OPEN_JOB_NAME="${PRICE_CORE_OPEN_JOB_NAME:-tikrr-price-core-open}"
TRACKED_OPEN_BRIEFS_JOB_NAME="${TRACKED_OPEN_BRIEFS_JOB_NAME:-tikrr-tracked-open-briefs}"
PRICE_CORE_INTRADAY_JOB_NAME="${PRICE_CORE_INTRADAY_JOB_NAME:-tikrr-price-core-intraday}"
DAILY_POSTCLOSE_JOB_NAME="${DAILY_POSTCLOSE_JOB_NAME:-tikrr-daily-postclose}"

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

upsert_optional_mimo_secret() {
  if [[ -z "${MIMO_API_KEY:-}" ]]; then
    return
  fi
  if ! gcloud secrets describe "${MIMO_SECRET_NAME}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
    gcloud secrets create "${MIMO_SECRET_NAME}" --replication-policy=automatic --project="${GOOGLE_CLOUD_PROJECT}"
  fi
  printf '%s' "${MIMO_API_KEY}" | gcloud secrets versions add "${MIMO_SECRET_NAME}" --data-file=- --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null
}

deploy_job() {
  local job_name="$1"
  local memory="$2"
  local cpu="$3"
  local timeout="$4"

  local deploy_args=(
    run jobs deploy "${job_name}"
    --project="${GOOGLE_CLOUD_PROJECT}"
    --region="${GOOGLE_CLOUD_REGION}"
    --image="${IMAGE_URI}"
    --command=python
    --memory="${memory}"
    --cpu="${cpu}"
    --task-timeout="${timeout}"
    --max-retries=1
    --parallelism=1
    --tasks=1
    --set-secrets="FIREBASE_SERVICE_ACCOUNT_JSON=${FIREBASE_SECRET_NAME}:latest"
    --set-env-vars="GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_REGION=${GOOGLE_CLOUD_REGION},TRACKED_NEWS_PREP_JOB_NAME=${TRACKED_NEWS_PREP_JOB_NAME},PRICE_CORE_OPEN_JOB_NAME=${PRICE_CORE_OPEN_JOB_NAME},TRACKED_OPEN_BRIEFS_JOB_NAME=${TRACKED_OPEN_BRIEFS_JOB_NAME},PRICE_CORE_INTRADAY_JOB_NAME=${PRICE_CORE_INTRADAY_JOB_NAME},DAILY_POSTCLOSE_JOB_NAME=${DAILY_POSTCLOSE_JOB_NAME}"
  )

  if [[ -n "${MIMO_API_KEY:-}" ]]; then
    deploy_args+=(--set-secrets="MIMO_API_KEY=${MIMO_SECRET_NAME}:latest")
  fi

  if [[ -n "${SERVICE_ACCOUNT_EMAIL:-}" ]]; then
    deploy_args+=(--service-account="${SERVICE_ACCOUNT_EMAIL}")
  fi

  gcloud "${deploy_args[@]}"
}

echo "Ensuring artifact registry..."
ensure_repo

echo "Building runner image ${IMAGE_URI}..."
build_image

echo "Updating firebase secret ${FIREBASE_SECRET_NAME}..."
upsert_secret
if [[ -n "${MIMO_API_KEY:-}" ]]; then
  echo "Updating MIMO secret ${MIMO_SECRET_NAME}..."
  upsert_optional_mimo_secret
fi

echo "Deploying jobs..."
deploy_job "${DISPATCH_JOB_NAME}" "1Gi" "1" "1200s"
deploy_job "${TRACKED_NEWS_PREP_JOB_NAME}" "2Gi" "2" "2400s"
deploy_job "${PRICE_CORE_OPEN_JOB_NAME}" "2Gi" "2" "1800s"
deploy_job "${TRACKED_OPEN_BRIEFS_JOB_NAME}" "3Gi" "2" "2400s"
deploy_job "${PRICE_CORE_INTRADAY_JOB_NAME}" "2Gi" "2" "1800s"
deploy_job "${DAILY_POSTCLOSE_JOB_NAME}" "3Gi" "2" "5400s"

echo "Done. Jobs deployed: ${DISPATCH_JOB_NAME}, ${TRACKED_NEWS_PREP_JOB_NAME}, ${PRICE_CORE_OPEN_JOB_NAME}, ${TRACKED_OPEN_BRIEFS_JOB_NAME}, ${PRICE_CORE_INTRADAY_JOB_NAME}, ${DAILY_POSTCLOSE_JOB_NAME}"
