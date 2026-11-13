#!/usr/bin/env bash
# Restore a LocalDB backup (backend/ops/localdb_backup.py archives). Runbook: docs/localdb-restore.md.
#
#   restore-localdb.sh ARCHIVE                         a scratch copy to look at; production is not touched
#   restore-localdb.sh ARCHIVE --to /path/new.sqlite3  the same, somewhere else (never an existing file)
#   restore-localdb.sh ARCHIVE --quick-check           also run quick_check on the scratch copy (slow on /srv)
#   restore-localdb.sh ARCHIVE --production            prints what it would do, changes nothing
#   ops.sh restore ARCHIVE --production --yes          swaps it in for the live database (run through systemd-run,
#                                                      so a dropped ssh connection cannot stop it halfway)
#
# ARCHIVE is a path, a file name in the backup folder (daily/ or weekly/), or "latest" (the newest daily).
#
# --production --yes, in order: decompress next to the live database and check it (hash + quick_check) while
# everything still runs; pause the tikrr-* timers and wait for running jobs; stop tikrr-localdb; move the live file
# (and any -wal/-shm) aside as documents.sqlite3.pre-restore-<time>; move the restored copy in; start tikrr-localdb
# and wait for /health; restart the timers. If LocalDB does not come back healthy, the old file is put back.
# The old file is kept: delete it (or move it to /srv) once the restored store looks right.
set -euo pipefail

BACKUP_DIR="${LOCALDB_BACKUP_DIR:-/srv/tikrr-data/backups/localdb}"
LIVE_LINK="${LOCALDB_LIVE_PATH:-/srv/tikrr-data/localdb/documents.sqlite3}"
REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
SCRATCH_DIR="${LOCALDB_RESTORE_DIR:-/srv/tikrr-data/restore}"
SERVICE_USER="${TIKRR_USER:-ubuntu}"
HEALTH_URL="${LOCALDB_HEALTH_URL:-http://127.0.0.1:8500/health}"

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; }

ARCHIVE=""
TARGET=""
PRODUCTION=0
YES=0
QUICK=0
while (( $# )); do
  case "$1" in
    --production) PRODUCTION=1 ;;
    --yes) YES=1 ;;
    --quick-check) QUICK=1 ;;
    --to) TARGET="${2:?--to needs a path}"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *) [[ -z "${ARCHIVE}" ]] || { echo "one archive at a time" >&2; exit 2; }; ARCHIVE="$1" ;;
  esac
  shift
done
[[ -n "${ARCHIVE}" ]] || { usage >&2; exit 2; }

resolve_archive() {
  local name="$1"
  if [[ "${name}" == "latest" ]]; then
    ls -1 "${BACKUP_DIR}"/daily/localdb-*.sqlite3.* 2>/dev/null | grep -v '\.json$' | sort | tail -n 1 || true
    return
  fi
  if [[ -f "${name}" ]]; then readlink -f "${name}"; return; fi
  for folder in daily weekly; do
    if [[ -f "${BACKUP_DIR}/${folder}/${name}" ]]; then echo "${BACKUP_DIR}/${folder}/${name}"; return; fi
  done
}
ARCHIVE_PATH="$(resolve_archive "${ARCHIVE}")"
[[ -n "${ARCHIVE_PATH}" && -f "${ARCHIVE_PATH}" ]] || { echo "no archive '${ARCHIVE}' (looked in ${BACKUP_DIR}/daily and weekly)" >&2; exit 2; }

PYTHON_BIN="python3"
[[ -x "${REPO_DIR}/.venv/bin/python" ]] && PYTHON_BIN="${REPO_DIR}/.venv/bin/python"
LIVE="$(readlink -f "${LIVE_LINK}" 2>/dev/null || echo "${LIVE_LINK}")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

restore_py() {
  # The python side refuses the live database and any existing file, and checks the hash against the manifest.
  ( cd "${REPO_DIR}" && "${PYTHON_BIN}" -m backend.ops.localdb_backup restore "$@" --live "${LIVE}" --live "${LIVE_LINK}" )
}

if (( ! PRODUCTION )); then
  [[ -n "${TARGET}" ]] || TARGET="${SCRATCH_DIR}/documents-${STAMP}.sqlite3"
  flags=()
  (( QUICK )) || flags+=(--no-quick-check)
  echo "restoring $(basename "${ARCHIVE_PATH}") into ${TARGET} (production is not touched)"
  restore_py "${ARCHIVE_PATH}" --to "${TARGET}" ${flags[@]+"${flags[@]}"}
  (( QUICK )) || echo "hash checked against the manifest (the copy passed quick_check when it was taken); add --quick-check to run it again here"
  echo "look inside: ${PYTHON_BIN} -c \"import sqlite3; c=sqlite3.connect('file:${TARGET}?mode=ro', uri=True); print(c.execute('select count(*) from documents').fetchone())\""
  echo "delete it when done: rm ${TARGET}"
  exit 0
fi

LIVE_DIR="$(dirname "${LIVE}")"
STAGED="${LIVE_DIR}/.restore-${STAMP}.sqlite3"
ASIDE="${LIVE}.pre-restore-${STAMP}"
cat <<PLAN
Production restore plan
  archive:   ${ARCHIVE_PATH}
  live file: ${LIVE}
  1. decompress and check into ${STAGED} (hash + quick_check), while everything runs
  2. pause the active tikrr-* timers, wait for running jobs to finish (10 min at most)
  3. stop tikrr-localdb.service (pages that need the store fail until step 5)
  4. move ${LIVE} (and -wal/-shm) to ${ASIDE}, move the restored copy in
  5. start tikrr-localdb.service, wait for ${HEALTH_URL}; on failure put the old file back
  6. restart the paused timers
  Writes made after the archive was taken are lost (they stay in the old file).
PLAN
if (( ! YES )); then
  echo "nothing changed. Run again with --yes (as root) to do it."
  exit 2
fi
[[ "$(id -u)" == "0" ]] || { echo "--production --yes needs root (sudo)" >&2; exit 2; }
# Only as a systemd unit (ops.sh restore ... --production --yes starts one): a terminal or ssh session that drops
# halfway would otherwise leave LocalDB stopped and the timers paused.
[[ -n "${INVOCATION_ID:-}" ]] || { echo "run it through: bash ${REPO_DIR}/backend/vps/ops.sh restore ${ARCHIVE} --production --yes" >&2; exit 2; }
[[ -f "${LIVE}" ]] || { echo "no live database at ${LIVE}" >&2; exit 2; }

echo "[1/6] decompress and check"
( cd "${REPO_DIR}" && sudo -u "${SERVICE_USER}" "${PYTHON_BIN}" -m backend.ops.localdb_backup restore "${ARCHIVE_PATH}" --to "${STAGED}" --live "${LIVE}" --live "${LIVE_LINK}" )

PAUSED=()
LOCALDB_STOPPED=0
SWAPPED=0
finish() {
  local code=$?
  if (( LOCALDB_STOPPED )); then
    if (( ! SWAPPED )) && [[ ! -e "${LIVE}" && -e "${ASIDE}" ]]; then
      mv "${ASIDE}" "${LIVE}"
      for ext in -wal -shm; do [[ -e "${ASIDE}${ext}" ]] && mv "${ASIDE}${ext}" "${LIVE}${ext}"; done
    fi
    systemctl start tikrr-localdb.service || true
  fi
  if (( ${#PAUSED[@]} )); then
    echo "restarting ${#PAUSED[@]} timers"
    systemctl start "${PAUSED[@]}" || true
  fi
  [[ -e "${STAGED}" ]] && rm -f "${STAGED}"
  exit "${code}"
}
trap finish EXIT

echo "[2/6] pause timers"
while IFS= read -r unit; do [[ -n "${unit}" ]] && PAUSED+=("${unit}"); done < <(systemctl list-units --type=timer --state=active --plain --no-legend 'tikrr-*' | awk '{print $1}')
(( ${#PAUSED[@]} )) && systemctl stop "${PAUSED[@]}"
for _ in $(seq 1 60); do
  RUNNING=()
  while IFS= read -r unit; do [[ -n "${unit}" ]] && RUNNING+=("${unit}"); done < <(systemctl list-units --type=service --state=activating,deactivating --plain --no-legend 'tikrr-*' | awk '{print $1}' | grep -v -e '^tikrr-web@' -e '^tikrr-localdb\.service$' -e '^tikrr-localdb-restore\.service$' || true)
  (( ${#RUNNING[@]} == 0 )) && break
  echo "  waiting for: ${RUNNING[*]}"
  sleep 10
done
(( ${#RUNNING[@]} == 0 )) || { echo "jobs still running after 10 min: ${RUNNING[*]}; nothing swapped" >&2; exit 1; }

echo "[3/6] stop tikrr-localdb"
LOCALDB_STOPPED=1
systemctl stop tikrr-localdb.service

echo "[4/6] swap files"
mv "${LIVE}" "${ASIDE}"
for ext in -wal -shm; do [[ -e "${LIVE}${ext}" ]] && mv "${LIVE}${ext}" "${ASIDE}${ext}"; done
mv "${STAGED}" "${LIVE}"
SWAPPED=1
chown "${SERVICE_USER}:${SERVICE_USER}" "${LIVE}"
chmod 600 "${LIVE}"

echo "[5/6] start tikrr-localdb"
systemctl start tikrr-localdb.service
healthy=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "${HEALTH_URL}" 2>/dev/null | grep -q '"ok": *true'; then healthy=1; break; fi
  sleep 2
done
if (( ! healthy )); then
  echo "LocalDB is not healthy on the restored file: putting the old one back" >&2
  systemctl stop tikrr-localdb.service
  mv "${LIVE}" "${LIVE}.failed-restore-${STAMP}"
  for ext in -wal -shm; do [[ -e "${LIVE}${ext}" ]] && mv "${LIVE}${ext}" "${LIVE}.failed-restore-${STAMP}${ext}"; done
  mv "${ASIDE}" "${LIVE}"
  for ext in -wal -shm; do [[ -e "${ASIDE}${ext}" ]] && mv "${ASIDE}${ext}" "${LIVE}${ext}"; done
  systemctl start tikrr-localdb.service
  exit 1
fi
LOCALDB_STOPPED=0

echo "[6/6] restart timers (on exit)"
echo "restored $(basename "${ARCHIVE_PATH}"). The old file is ${ASIDE} ($(du -h "${ASIDE}" | cut -f1)); delete it or move it to /srv once the store looks right."
echo "cached pages: Varnish keeps signed-out pages for minutes; to drop them now: curl -X BAN -H 'X-Ban-Url: ^/(?!_next/static/)' http://127.0.0.1:6081/"
