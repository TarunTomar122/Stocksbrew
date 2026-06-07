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

DISPATCH_JOB_NAME="${DISPATCH_JOB_NAME:-tikrr-dispatch}"
LANE="${LANE:-price_core_open}"
MARKET="${MARKET:-US}"
LIMIT="${LIMIT:-5}"
SHARD_SIZE="${SHARD_SIZE:-2}"
MAX_PARALLEL="${MAX_PARALLEL:-2}"
UNIVERSE="${UNIVERSE:-}"
DRY_RUN="${DRY_RUN:-0}"

ARGS=(
  "-m" "backend.cloudrun.orchestrator.dispatch"
  "--lane" "${LANE}"
  "--market" "${MARKET}"
  "--project" "${GOOGLE_CLOUD_PROJECT}"
  "--region" "${GOOGLE_CLOUD_REGION}"
  "--limit" "${LIMIT}"
  "--shard-size" "${SHARD_SIZE}"
  "--max-parallel" "${MAX_PARALLEL}"
)

if [[ -n "${UNIVERSE}" ]]; then
  ARGS+=("--universe" "${UNIVERSE}")
fi
if [[ "${DRY_RUN}" == "1" ]]; then
  ARGS+=("--dry-run")
fi

echo "Executing ${DISPATCH_JOB_NAME} with args: ${ARGS[*]}"
GCLOUD_ARGS=(run jobs execute "${DISPATCH_JOB_NAME}"
  --project="${GOOGLE_CLOUD_PROJECT}"
  --region="${GOOGLE_CLOUD_REGION}"
  --wait
)
for arg in "${ARGS[@]}"; do
  GCLOUD_ARGS+=(--args="${arg}")
done
gcloud "${GCLOUD_ARGS[@]}"
