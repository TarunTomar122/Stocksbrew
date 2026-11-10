#!/usr/bin/env bash
set -euo pipefail

# TIKRR_VPS_HOST is the VPS address. The default is the `vps` alias from
# ~/.ssh/config (Host vps / HostName <your server>), so no address lives here.
HOST="${TIKRR_VPS_HOST:-vps}"
REMOTE="${TIKRR_VPS_REMOTE:-ubuntu@${HOST}}"
REMOTE_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"

ssh "${REMOTE}" "cd ${REMOTE_DIR} && git pull --ff-only && .venv/bin/pip install -r backend/requirements.txt && bash -n backend/vps/run-dispatch.sh backend/vps/install-systemd.sh"
