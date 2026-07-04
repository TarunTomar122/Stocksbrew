#!/usr/bin/env bash
set -euo pipefail

HOST="${TIKRR_VPS_HOST:-144.217.6.112}"
REMOTE="${TIKRR_VPS_REMOTE:-ubuntu@${HOST}}"
REMOTE_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"

ssh "${REMOTE}" "cd ${REMOTE_DIR} && git pull --ff-only && .venv/bin/pip install -r backend/requirements.txt && bash -n backend/vps/run-dispatch.sh backend/vps/install-systemd.sh"
