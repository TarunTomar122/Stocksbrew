#!/usr/bin/env bash
# One command for the usual operations. Works on the VPS, or from the laptop (it then runs itself on the VPS
# over ssh, alias "vps" or TIKRR_VPS_HOST; `deploy` always runs on the laptop).
#
#   ops.sh status                 every health check now (site, services, box, data freshness, backup, traffic)
#   ops.sh logs [since]           recent errors: web, LocalDB, failed jobs, job tracebacks, Caddy 5xx (default: 1 hour ago)
#   ops.sh backup-now             take a backup now, through the unit (same low-priority limits as the nightly one)
#   ops.sh backups                the kept backups
#   ops.sh restore <file> [...]   restore-localdb.sh: a scratch copy by default; production only with --production --yes
#   ops.sh deploy [ref]           build and ship the web app (backend/vps/web/deploy-web.sh), from the laptop
#
# Nothing here prints a token or an env value.
set -euo pipefail

REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
VPS_HOST="${TIKRR_VPS_HOST:-vps}"
PYTHON_BIN="${REPO_DIR}/.venv/bin/python"
BACKUP_DIR="${LOCALDB_BACKUP_DIR:-/srv/tikrr-data/backups/localdb}"
LIVE_DB="/var/lib/tikrr/localdb/documents.sqlite3"
FAILED_ID="d9b373ed55a64feb8242e02dbe79a49c"

usage() {
  cat <<'EOF'
ops.sh status | logs [since] | backup-now | backups | restore <file> [--to PATH] [--quick-check] [--production [--yes]] | deploy [ref]
EOF
}

on_vps() { [[ -x "${PYTHON_BIN}" && -d /etc/tikrr ]]; }

CMD="${1:-}"
[[ -n "${CMD}" ]] || { usage; exit 2; }
shift || true

if [[ "${CMD}" == "deploy" ]]; then
  on_vps && { echo "deploy runs from the laptop (the VPS has too little memory to build)" >&2; exit 2; }
  REPO="$(git rev-parse --show-toplevel)"
  exec bash "${REPO}/backend/vps/web/deploy-web.sh" "$@"
fi

if ! on_vps; then
  # Run this same script on the VPS; its python modules and restore script come from the checkout there.
  exec ssh -o ClearAllForwardings=yes "${VPS_HOST}" "bash -s -- $(printf '%q ' "${CMD}" "$@")" < "${BASH_SOURCE[0]}"
fi

as_service() {
  # Run like the timer does (as ubuntu, journal readable, the store token in its env) without printing the env.
  if sudo -n true 2>/dev/null; then
    sudo systemd-run --quiet --wait --pipe --collect \
      -p User=ubuntu -p Group=ubuntu -p SupplementaryGroups=systemd-journal \
      -p WorkingDirectory="${REPO_DIR}" -p EnvironmentFile=-/etc/tikrr/agentdata-localdb.env \
      -E LOCALDB_PATH="${LIVE_DB}" "$@"
  else
    ( cd "${REPO_DIR}" && LOCALDB_PATH="${LIVE_DB}" "$@" )
  fi
}

case "${CMD}" in
  status)
    as_service "${PYTHON_BIN}" -m backend.ops.health
    echo
    ( cd "${REPO_DIR}" && "${PYTHON_BIN}" -m backend.ops.localdb_backup list --dest "${BACKUP_DIR}" 2>/dev/null | head -n 3 ) || true
    systemctl list-timers tikrr-ops-health.timer tikrr-localdb-backup.timer --all --no-pager 2>/dev/null | head -n 4 || true
    ;;

  logs)
    SINCE="${1:-1 hour ago}"
    J=(journalctl --no-pager -q -o short-iso --since "${SINCE}")
    sudo -n true 2>/dev/null && J=(sudo "${J[@]}")
    echo "== web and LocalDB warnings and errors since ${SINCE}"
    "${J[@]}" -p warning -u 'tikrr-web@*' -u tikrr-localdb.service -u varnish.service -u caddy.service | tail -n 60 || true
    echo
    echo "== failed units since ${SINCE}"
    mapfile -t FAILED < <("${J[@]}" -o cat "MESSAGE_ID=${FAILED_ID}" | grep -o '^tikrr-[^:]*' | sort | uniq -c | sort -rn || true)
    if (( ${#FAILED[@]} )); then
      printf '  %s\n' "${FAILED[@]}"
      for line in "${FAILED[@]:0:5}"; do
        unit="$(awk '{print $2}' <<<"${line}")"
        echo "-- last lines of ${unit}"
        "${J[@]}" -u "${unit}" -n 12 | tail -n 12 || true
      done
    else
      echo "  none"
    fi
    echo
    echo "== job errors since ${SINCE} (tracebacks, FAILED steps)"
    "${J[@]}" -u 'tikrr-*' | grep -E 'Traceback|Error:|FAILED|error:' | grep -v 'tikrr-web@' | tail -n 40 || true
    echo
    echo "== Caddy 5xx in the last 20,000 requests (time, status, method, path without query, seconds)"
    CADDY_TAIL=(tail -n 20000 /var/log/caddy/stocksbrew.log)
    sudo -n true 2>/dev/null && CADDY_TAIL=(sudo "${CADDY_TAIL[@]}")
    "${CADDY_TAIL[@]}" | python3 -c '
import json, sys, time, urllib.parse
rows = []
for line in sys.stdin:
    try:
        e = json.loads(line)
    except ValueError:
        continue
    if int(e.get("status") or 0) >= 500:
        r = e.get("request") or {}
        rows.append("%s %s %s %s %.2f" % (time.strftime("%m-%d %H:%M:%S", time.gmtime(e.get("ts", 0))), e.get("status"), r.get("method"), urllib.parse.urlsplit(r.get("uri") or "/").path[:80], e.get("duration") or 0))
print("\n".join(rows[-25:]) if rows else "  none")
' || true
    ;;

  backup-now)
    systemctl cat tikrr-localdb-backup.service >/dev/null 2>&1 || { echo "not installed: sudo bash ${REPO_DIR}/backend/vps/install-ops.sh" >&2; exit 1; }
    echo "backing up (about 5 minutes; low priority, pages are not slowed)..."
    started="$(date '+%Y-%m-%d %H:%M:%S')"
    status=0
    sudo systemctl start tikrr-localdb-backup.service || status=$?
    sudo journalctl --no-pager -q -o cat -u tikrr-localdb-backup.service --since "${started}" | tail -n 20
    exit "${status}"
    ;;

  backups)
    cd "${REPO_DIR}" && "${PYTHON_BIN}" -m backend.ops.localdb_backup list --dest "${BACKUP_DIR}"
    ;;

  restore)
    (( $# )) || { echo "ops.sh restore <file|latest> [--to PATH] [--quick-check] [--production [--yes]]" >&2; exit 2; }
    production=0; yes=0
    for arg in "$@"; do
      [[ "${arg}" == "--production" ]] && production=1
      [[ "${arg}" == "--yes" ]] && yes=1
    done
    if (( production && yes )); then
      # As its own unit: if this ssh session drops, the swap still finishes (or rolls back) on its own.
      echo "starting tikrr-localdb-restore (follow it with: sudo journalctl -fu tikrr-localdb-restore)"
      started="$(date '+%Y-%m-%d %H:%M:%S')"
      status=0
      sudo systemd-run --quiet --wait --collect --unit=tikrr-localdb-restore -p TimeoutStartSec=2h \
        bash "${REPO_DIR}/backend/vps/restore-localdb.sh" "$@" || status=$?
      sudo journalctl --no-pager -q -o cat -u tikrr-localdb-restore --since "${started}"
      exit "${status}"
    fi
    exec bash "${REPO_DIR}/backend/vps/restore-localdb.sh" "$@"
    ;;

  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac
