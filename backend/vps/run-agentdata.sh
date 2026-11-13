#!/usr/bin/env bash
# Run one group of the agent data jobs (backend/agentdata/schedule.py).
# Usage: run-agentdata.sh frequent|hourly|after_close|weekly|earnings_day|extended_hours
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

GROUP="${1:?group: frequent, hourly, after_close, weekly, earnings_day or extended_hours}"

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

# After the group, the web app refreshes the cached pages its data shows up on (best effort, never fails the
# group): backend/scripts/trigger_web_revalidate.py, same token file as run-dispatch.sh.
WEB_REVALIDATE_TOKEN_FILE="${WEB_REVALIDATE_TOKEN_FILE:-/etc/tikrr/web-revalidate-token}"
if [[ -z "${WEB_REVALIDATE_TOKEN:-}" && -r "${WEB_REVALIDATE_TOKEN_FILE}" ]]; then
  WEB_REVALIDATE_TOKEN="$(tr -d '\r\n' < "${WEB_REVALIDATE_TOKEN_FILE}")"
  export WEB_REVALIDATE_TOKEN
fi
if [[ -n "${WEB_REVALIDATE_TOKEN:-}" ]]; then
  # Straight to Varnish on this box, not out through Cloudflare and back (the route fans out to both instances).
  export WEB_REVALIDATE_BASE_URL="${WEB_REVALIDATE_BASE_URL:-http://127.0.0.1:6081}"
fi
case "${GROUP}" in
  # Every 30 minutes (news feed, tone, markets).
  frequent) REVALIDATE_KINDS="news"; REVALIDATE_MIN_INTERVAL=0 ;;
  hourly) REVALIDATE_KINDS="filings,calendar"; REVALIDATE_MIN_INTERVAL=0 ;;
  after_close) REVALIDATE_KINDS="prices,earnings,filings"; REVALIDATE_MIN_INTERVAL=0 ;;
  weekly) REVALIDATE_KINDS="filings"; REVALIDATE_MIN_INTERVAL=0 ;;
  earnings_day) REVALIDATE_KINDS="earnings"; REVALIDATE_MIN_INTERVAL=0 ;;
  # Every 10 minutes from 06:00 to 20:00 ET: every stock page at most every 30.
  extended_hours) REVALIDATE_KINDS="prices"; REVALIDATE_MIN_INTERVAL=1800 ;;
  *) REVALIDATE_KINDS="" ;;
esac
run_group() {
  local status=0
  "${PYTHON_BIN}" -m backend.agentdata.schedule --group "${GROUP}" || status=$?
  # The group is done: let the next one have the machine-wide lock while the pages refresh.
  exec 9<&-
  if [[ -n "${REVALIDATE_KINDS}" ]]; then
    "${PYTHON_BIN}" -m backend.scripts.trigger_web_revalidate --kinds "${REVALIDATE_KINDS}" --min-interval "${REVALIDATE_MIN_INTERVAL}" || true
  fi
  return "${status}"
}

LOCK_FILE="${TIKRR_AGENTDATA_LOCK:-/tmp/tikrr-agentdata.lock}"
if command -v flock >/dev/null 2>&1; then
  # Hold the lock on fd 9, which this shell keeps until it exits. Say when the group had
  # to queue and for how long, so the journal shows lock waits apart from slow steps.
  # A read descriptor is enough for flock, and works even when another user owns the file.
  [[ -e "${LOCK_FILE}" ]] || : >>"${LOCK_FILE}"
  exec 9<"${LOCK_FILE}"
  if ! flock --nonblock 9; then
    echo "[${GROUP}] waiting for another agent data group to finish"
    WAIT_STARTED=$(date +%s)
    if ! flock --wait 3600 9; then
      echo "[${GROUP}] gave up after waiting 60 min for the lock"
      exit 1
    fi
    echo "[${GROUP}] started after waiting $(( $(date +%s) - WAIT_STARTED ))s for the lock"
  fi
  # fd 9 (the lock) stays open in this shell until it exits.
  run_group
  exit $?
fi
run_group
