#!/usr/bin/env bash
# Install the nightly LocalDB backup and the 5-minute health check on the VPS (run as root, after `git pull`):
#
#   sudo bash /opt/tikrr/backend/vps/install-ops.sh            install, verify, enable both timers
#   sudo ENABLE_TIMERS=0 bash .../install-ops.sh               install and verify only
#   sudo bash .../install-ops.sh --uninstall                   stop and remove the four units (backups are kept)
#
# It creates the backup folder (/srv/tikrr-data/backups/localdb, 0750) and the staging folder next to the live
# database (/var/lib/tikrr/backup-staging, 0700), copies the units from backend/vps/units/, checks them with
# systemd-analyze verify, and enables the timers. It never starts a backup itself: take the first one with
# `bash backend/vps/ops.sh backup-now`, then `ops.sh status`.
set -euo pipefail

REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
USER_NAME="${TIKRR_USER:-ubuntu}"
BACKUP_DIR="${LOCALDB_BACKUP_DIR:-/srv/tikrr-data/backups/localdb}"
STAGING_DIR="${LOCALDB_BACKUP_STAGING:-/var/lib/tikrr/backup-staging}"
UNITS=(tikrr-localdb-backup.service tikrr-localdb-backup.timer tikrr-ops-health.service tikrr-ops-health.timer)
TIMERS=(tikrr-localdb-backup.timer tikrr-ops-health.timer)

[[ "$(id -u)" == "0" ]] || { echo "run as root: sudo bash $0" >&2; exit 2; }

if [[ "${1:-}" == "--uninstall" ]]; then
  systemctl disable --now "${TIMERS[@]}" 2>/dev/null || true
  for unit in "${UNITS[@]}"; do rm -f "${UNIT_DIR}/${unit}"; done
  systemctl daemon-reload
  echo "removed the units; backups in ${BACKUP_DIR} are kept"
  exit 0
fi

for unit in "${UNITS[@]}"; do
  [[ -f "${REPO_DIR}/backend/vps/units/${unit}" ]] || { echo "missing ${REPO_DIR}/backend/vps/units/${unit} (git pull first?)" >&2; exit 1; }
done
[[ -x "${REPO_DIR}/.venv/bin/python" ]] || { echo "missing ${REPO_DIR}/.venv/bin/python" >&2; exit 1; }
command -v zstd >/dev/null || echo "note: zstd is not installed; backups will be gzip (apt-get install zstd for smaller, faster ones)"

install -d -m 0750 -o "${USER_NAME}" -g "${USER_NAME}" "${BACKUP_DIR}" "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"
install -d -m 0700 -o "${USER_NAME}" -g "${USER_NAME}" "${STAGING_DIR}"
chmod 0755 "${REPO_DIR}/backend/vps/backup-localdb.sh" "${REPO_DIR}/backend/vps/restore-localdb.sh" "${REPO_DIR}/backend/vps/ops.sh"

for unit in "${UNITS[@]}"; do
  install -m 0644 "${REPO_DIR}/backend/vps/units/${unit}" "${UNIT_DIR}/${unit}"
done
systemctl daemon-reload
# Fails on a typo in a unit before anything is enabled.
systemd-analyze verify "${UNITS[@]/#/${UNIT_DIR}/}"

# A dry run of each job as the service user: the backup's space plan, and one health check that writes nothing.
sudo -u "${USER_NAME}" bash "${REPO_DIR}/backend/vps/backup-localdb.sh" --dry-run
( cd "${REPO_DIR}" && sudo -u "${USER_NAME}" env LOCALDB_PATH=/var/lib/tikrr/localdb/documents.sqlite3 "${REPO_DIR}/.venv/bin/python" -m backend.ops.health ) | head -n 1

if [[ "${ENABLE_TIMERS:-1}" == "1" ]]; then
  systemctl enable --now "${TIMERS[@]}"
fi
systemctl list-timers "${TIMERS[@]}" --all --no-pager
echo
echo "next: bash ${REPO_DIR}/backend/vps/ops.sh backup-now   (the first backup, ~5 min)"
echo "      bash ${REPO_DIR}/backend/vps/ops.sh status"
