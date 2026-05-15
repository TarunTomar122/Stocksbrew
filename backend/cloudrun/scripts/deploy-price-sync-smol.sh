#!/usr/bin/env bash
set -euo pipefail

# Minimal deploy for one small Cloud Run Job that runs sync_price_snapshots.
# Required env vars:
#   GOOGLE_CLOUD_PROJECT
#   GOOGLE_CLOUD_REGION            (example: us-central1)
#   FIREBASE_SERVICE_ACCOUNT_JSON  (raw json string)
#
# Optional env vars:
#   JOB_NAME                       (default: price-sync-smol)
#   IMAGE_NAME                     (default: price-sync-runner)
#   SERVICE_ACCOUNT_EMAIL          (runtime service account; optional)
#   FIREBASE_SECRET_NAME           (default: tikrr-firebase-service-account-json)

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

JOB_NAME="${JOB_NAME:-price-sync-smol}"
IMAGE_NAME="${IMAGE_NAME:-price-sync-runner}"
IMAGE_URI="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/tikrr/${IMAGE_NAME}:latest"
FIREBASE_SECRET_NAME="${FIREBASE_SECRET_NAME:-tikrr-firebase-service-account-json}"

echo "Ensuring Artifact Registry repo exists..."
if ! gcloud artifacts repositories describe tikrr \
  --location="${GOOGLE_CLOUD_REGION}" \
  --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
  gcloud artifacts repositories create tikrr \
    --repository-format=docker \
    --location="${GOOGLE_CLOUD_REGION}" \
    --description="tikrr backend images" \
    --project="${GOOGLE_CLOUD_PROJECT}"
fi

echo "Building image via Cloud Build: ${IMAGE_URI}"
TMP_CLOUDBUILD="$(mktemp -t tikrr-cloudbuild-XXXX.yaml)"
cat > "${TMP_CLOUDBUILD}" <<EOF
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
gcloud builds submit \
  --project="${GOOGLE_CLOUD_PROJECT}" \
  --config="${TMP_CLOUDBUILD}" \
  .
rm -f "${TMP_CLOUDBUILD}"

echo "Upserting Secret Manager secret: ${FIREBASE_SECRET_NAME}"
if ! gcloud secrets describe "${FIREBASE_SECRET_NAME}" \
  --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
  gcloud secrets create "${FIREBASE_SECRET_NAME}" \
    --replication-policy=automatic \
    --project="${GOOGLE_CLOUD_PROJECT}"
fi
printf '%s' "${FIREBASE_SERVICE_ACCOUNT_JSON}" | gcloud secrets versions add "${FIREBASE_SECRET_NAME}" \
  --data-file=- \
  --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null

echo "Deploying Cloud Run Job: ${JOB_NAME}"
DEPLOY_ARGS=(
  run jobs deploy "${JOB_NAME}"
  --project="${GOOGLE_CLOUD_PROJECT}"
  --region="${GOOGLE_CLOUD_REGION}"
  --image="${IMAGE_URI}"
  --memory=1Gi
  --cpu=1
  --command=python
  --max-retries=1
  --parallelism=1
  --tasks=1
  --set-secrets="FIREBASE_SERVICE_ACCOUNT_JSON=${FIREBASE_SECRET_NAME}:latest"
)

if [[ -n "${SERVICE_ACCOUNT_EMAIL:-}" ]]; then
  DEPLOY_ARGS+=(--service-account="${SERVICE_ACCOUNT_EMAIL}")
fi

gcloud "${DEPLOY_ARGS[@]}"

echo "Deployed ${JOB_NAME}."
echo "Next: run backend/cloudrun/scripts/run-price-sync-smol.sh"
