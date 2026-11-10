#!/usr/bin/env bash
# Runs one backend/mail job: daily | weekly | alerts | lifecycle, plus flags.
set -euo pipefail
REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
ENV_FILE="${TIKRR_ENV_FILE:-/etc/tikrr/backend.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi
cd "${REPO_DIR}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
[[ -x ".venv/bin/python" ]] && PYTHON_BIN=".venv/bin/python"
LOCK_DIR="${TIKRR_LOCK_DIR:-/tmp/tikrr-locks}"
mkdir -p "${LOCK_DIR}"
exec flock -n "${LOCK_DIR}/mail-${1:-job}.lock" "${PYTHON_BIN}" -m backend.mail.jobs "$@"
