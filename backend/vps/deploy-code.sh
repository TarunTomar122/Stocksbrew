#!/usr/bin/env bash
set -euo pipefail

# TIKRR_VPS_HOST is the VPS address. The default is the `vps` alias from
# ~/.ssh/config (Host vps / HostName <your server>), so no address lives here.
HOST="${TIKRR_VPS_HOST:-vps}"
REMOTE="${TIKRR_VPS_REMOTE:-ubuntu@${HOST}}"
REMOTE_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"

# The node jobs (standing agents, reason checks) run from this checkout's node_modules, so a changed
# package-lock.json reinstalls them. `npm install` (not `npm ci`) keeps node_modules in place while a job
# may be running; it still installs exactly what the lockfile pins.
ssh "${REMOTE}" "cd ${REMOTE_DIR} && git pull --ff-only && .venv/bin/pip install -r backend/requirements.txt && \
  if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then npm install --no-audit --no-fund --no-save; fi && \
  bash -n backend/vps/run-dispatch.sh backend/vps/install-systemd.sh"
