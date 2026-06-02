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

JOB_NAME="${JOB_NAME:-tikrr-pre-earnings-intel}"
MARKET="${MARKET:-US}"
UPCOMING_DAYS="${UPCOMING_DAYS:-7}"
MAX_EVENTS="${MAX_EVENTS:-40}"
RUN_ID="${RUN_ID:-pre-earnings-$(date +%Y%m%d-%H%M%S)}"
FORCE="${FORCE:-0}"
UNIVERSE="${UNIVERSE:-}"

OVERRIDE_ARGS=(
  "-m" "backend.cloudrun.jobs.pre_earnings_intel_job"
  "--run-id" "${RUN_ID}"
  "--lane" "pre_earnings_intel"
  "--market" "${MARKET}"
  "--upcoming-days" "${UPCOMING_DAYS}"
  "--max-events" "${MAX_EVENTS}"
)

if [[ -n "${UNIVERSE}" ]]; then
  OVERRIDE_ARGS+=("--universe" "${UNIVERSE}")
fi
if [[ "${FORCE}" == "1" ]]; then
  OVERRIDE_ARGS+=("--force")
fi

echo "Executing ${JOB_NAME} with args: ${OVERRIDE_ARGS[*]}"
gcloud run jobs execute "${JOB_NAME}" \
  --project="${GOOGLE_CLOUD_PROJECT}" \
  --region="${GOOGLE_CLOUD_REGION}" \
  --args="$(IFS=, ; echo "${OVERRIDE_ARGS[*]}")" \
  --wait
