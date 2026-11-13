#!/usr/bin/env bash
# Nightly LocalDB backup (backend/ops/localdb_backup.py): an online SQLite copy, checked with quick_check,
# compressed onto the slow volume, 7 dailies and 4 weeklies kept. Run by tikrr-localdb-backup.service at 03:30
# New York; by hand: `bash backend/vps/ops.sh backup-now` (goes through the unit, so it gets the same limits).
#   backup-localdb.sh [--dry-run] [any other `localdb_backup run` flag]
# Low priority on its own too (nice 19, idle IO class), for when it is started outside the unit.
set -euo pipefail

REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
cd "${REPO_DIR}"
PYTHON_BIN="python3"
[[ -x "${REPO_DIR}/.venv/bin/python" ]] && PYTHON_BIN="${REPO_DIR}/.venv/bin/python"

IONICE=()
command -v ionice >/dev/null && IONICE=(ionice -c 3)
exec nice -n 19 ${IONICE[@]+"${IONICE[@]}"} "${PYTHON_BIN}" -m backend.ops.localdb_backup run \
  --source "${LOCALDB_BACKUP_SOURCE:-/var/lib/tikrr/localdb/documents.sqlite3}" \
  --dest "${LOCALDB_BACKUP_DIR:-/srv/tikrr-data/backups/localdb}" \
  --staging "${LOCALDB_BACKUP_STAGING:-/var/lib/tikrr/backup-staging}" \
  "$@"
