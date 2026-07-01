#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "" || "${1:-}" == --* ]]; then
  LANE="${LANE:-price_core_open}"
else
  LANE="$1"
  shift
fi

ENV_FILE="${TIKRR_ENV_FILE:-/etc/tikrr/backend.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
MARKET="${MARKET:-US}"
LIMIT="${LIMIT:-100}"
SHARD_SIZE="${SHARD_SIZE:-20}"
MAX_PARALLEL="${MAX_PARALLEL:-3}"
PER_STOCK_CAP="${PER_STOCK_CAP:-4}"
CHUNK_WORKERS="${CHUNK_WORKERS:-4}"
LOCK_DIR="${TIKRR_LOCK_DIR:-/tmp/tikrr-locks}"

mkdir -p "${LOCK_DIR}"
cd "${REPO_DIR}"

if [[ -f ".venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source ".venv/bin/activate"
fi
PYTHON_BIN="${PYTHON_BIN:-python3}"
if [[ -x ".venv/bin/python" ]]; then
  PYTHON_BIN=".venv/bin/python"
fi

CMD=(
  "${PYTHON_BIN}" -m backend.cloudrun.orchestrator.dispatch
    --executor local \
    --lane "${LANE}" \
    --market "${MARKET}" \
    --limit "${LIMIT}" \
    --shard-size "${SHARD_SIZE}" \
    --max-parallel "${MAX_PARALLEL}" \
    --per-stock-cap "${PER_STOCK_CAP}" \
    --chunk-workers "${CHUNK_WORKERS}" \
    "$@"
)

if command -v flock >/dev/null 2>&1; then
  exec flock -n "${LOCK_DIR}/${LANE}.lock" "${CMD[@]}"
fi

echo "warning: flock not found; running without lane lock" >&2
exec "${CMD[@]}"
