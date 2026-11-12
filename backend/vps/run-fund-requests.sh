#!/usr/bin/env bash
# Cover the funds people asked for (backend/scripts/process_fund_requests.py).
# Sources the VPS env file the same way run-power-trades.sh does; the worker
# needs LOCALDB_PATH from it and stops without it.
set -euo pipefail

ENV_FILE="${TIKRR_ENV_FILE:-/etc/tikrr/backend.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
cd "${REPO_DIR}"

PYTHON_BIN="python3"
if [[ -x ".venv/bin/python" ]]; then
  PYTHON_BIN=".venv/bin/python"
fi

exec "${PYTHON_BIN}" -m backend.scripts.process_fund_requests --limit 6
