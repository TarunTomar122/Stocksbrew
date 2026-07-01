#!/usr/bin/env bash
set -euo pipefail

HOST="${TIKRR_VPS_HOST:-144.217.6.112}"
REMOTE="${TIKRR_VPS_REMOTE:-ubuntu@${HOST}}"
REMOTE_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"

rsync -az --delete --exclude='__pycache__' --exclude='*.pyc' backend/ "${REMOTE}:${REMOTE_DIR}/backend/"
ssh "${REMOTE}" "cd ${REMOTE_DIR} && .venv/bin/pip install -r backend/requirements.txt && bash -n backend/vps/run-dispatch.sh backend/vps/install-systemd.sh && .venv/bin/python -m unittest backend.tests.test_dispatch"
