#!/usr/bin/env bash
# Daily power-trades job: sync STOCK Act disclosures, then email users whose
# holdings were traded. Sources the VPS env file like run-dispatch.sh does.
set -euo pipefail

ENV_FILE="${TIKRR_ENV_FILE:-/etc/tikrr/backend.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ -z "${FIREBASE_SERVICE_ACCOUNT_PATH:-}" && -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  export FIREBASE_SERVICE_ACCOUNT_PATH="${GOOGLE_APPLICATION_CREDENTIALS}"
fi

REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
cd "${REPO_DIR}"

PYTHON_BIN="python3"
if [[ -x ".venv/bin/python" ]]; then
  PYTHON_BIN=".venv/bin/python"
fi

"${PYTHON_BIN}" -m backend.scripts.sync_power_trades --days 45

export EMAILS_ENABLED="${EMAILS_ENABLED:-1}"
"${PYTHON_BIN}" -m backend.scripts.notify_power_trades --days 8
