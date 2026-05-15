#!/usr/bin/env bash
set -euo pipefail

# Executes one small subset price sync on Cloud Run Job.
# Required env vars:
#   GOOGLE_CLOUD_PROJECT
#   GOOGLE_CLOUD_REGION
#
# Optional:
#   JOB_NAME         default: price-sync-smol
#   MARKET           default: US
#   UNIVERSE         default: active price universe in Firestore (script default behavior)
#   SESSION_PHASE    default: manual
#   MAX_WORKERS      default: 4
#   INSTRUMENT_IDS   default: US_NVDA (single id keeps argument passing simple)

if [[ -z "${GOOGLE_CLOUD_PROJECT:-}" ]]; then
  echo "Missing GOOGLE_CLOUD_PROJECT"
  exit 1
fi
if [[ -z "${GOOGLE_CLOUD_REGION:-}" ]]; then
  echo "Missing GOOGLE_CLOUD_REGION"
  exit 1
fi

JOB_NAME="${JOB_NAME:-price-sync-smol}"
MARKET="${MARKET:-US}"
SESSION_PHASE="${SESSION_PHASE:-manual}"
MAX_WORKERS="${MAX_WORKERS:-4}"
INSTRUMENT_IDS="${INSTRUMENT_IDS:-US_NVDA}"

OVERRIDE_ARGS=(
  "-m" "backend.scripts.sync_price_snapshots"
  "--market" "${MARKET}"
  "--session-phase" "${SESSION_PHASE}"
  "--max-workers" "${MAX_WORKERS}"
  "--instrument-ids" "${INSTRUMENT_IDS}"
  "--merge-market-snapshot"
)

if [[ -n "${UNIVERSE:-}" ]]; then
  OVERRIDE_ARGS+=("--universe" "${UNIVERSE}")
fi

echo "Executing ${JOB_NAME} with args: ${OVERRIDE_ARGS[*]}"
gcloud run jobs execute "${JOB_NAME}" \
  --project="${GOOGLE_CLOUD_PROJECT}" \
  --region="${GOOGLE_CLOUD_REGION}" \
  --args="$(IFS=, ; echo "${OVERRIDE_ARGS[*]}")" \
  --wait
