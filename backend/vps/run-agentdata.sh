#!/usr/bin/env bash
# Run one group of the agent data jobs (backend/agentdata/schedule.py).
# Usage: run-agentdata.sh frequent|hourly|after_close|weekly
# Sources the VPS env file the same way run-power-trades.sh does. The Python
# jobs use LOCALDB_PATH when it is set (straight to the SQLite store); the
# "standing agents" and "reason checks" steps are TypeScript and go over HTTP:
# they need LOCALDB_API_TOKEN (the after-close unit loads it from the root-only
# /etc/tikrr/agentdata-localdb.env) plus node and node_modules. schedule.py fills in LOCALDB_URL (the
# local service) and the service account (GOOGLE_APPLICATION_CREDENTIALS) when
# the env file leaves them out, and names anything still missing.
#
# One group at a time, machine-wide: several jobs read SEC EDGAR, which
# rate-limits by address, so a second group waits for the first to finish.
set -euo pipefail

GROUP="${1:?group: frequent, hourly, after_close or weekly}"

ENV_FILE="${TIKRR_ENV_FILE:-/etc/tikrr/backend.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

# TIKRR_AGENTDATA_DIR wins over TIKRR_REPO_DIR: the env file sets the latter
# for the main pipeline, and these jobs can live in their own folder.
REPO_DIR="${TIKRR_AGENTDATA_DIR:-${TIKRR_REPO_DIR:-/opt/tikrr}}"
cd "${REPO_DIR}"

PYTHON_BIN="python3"
for candidate in ".venv/bin/python" "/opt/tikrr/.venv/bin/python"; do
  if [[ -x "${candidate}" ]]; then
    PYTHON_BIN="${candidate}"
    break
  fi
done

LOCK_FILE="${TIKRR_AGENTDATA_LOCK:-/tmp/tikrr-agentdata.lock}"
if command -v flock >/dev/null 2>&1; then
  exec flock --wait 3600 "${LOCK_FILE}" "${PYTHON_BIN}" -m backend.agentdata.schedule --group "${GROUP}"
fi
exec "${PYTHON_BIN}" -m backend.agentdata.schedule --group "${GROUP}"
