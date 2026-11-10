#!/usr/bin/env bash
# Cutover for the new emails (backend/mail). Run once on the VPS as root
# after /etc/tikrr/backend.env has EMAILS_ENABLED=1, EMAIL_UNSUBSCRIBE_SECRET
# (same value as Vercel) and MAIL_V2_ACTIVE=1. MAIL_V2_ACTIVE=1 makes the old
# premarket, open and weekly senders exit early, so nobody gets both.
# Set MAIL_V2_ACTIVE=1 on Vercel first: it stops the web app's own Pro welcome,
# which the lifecycle job replaces. Full steps: docs/email-v2.md.
#
# Undo: systemctl disable --now tikrr-mail-{daily,weekly,alerts,lifecycle}.timer,
# remove MAIL_V2_ACTIVE from backend.env, then from Vercel.
set -euo pipefail
REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
USER_NAME="${TIKRR_USER:-ubuntu}"
ENV_FILE="${TIKRR_ENV_FILE:-/etc/tikrr/backend.env}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"

grep -q '^MAIL_V2_ACTIVE=1' "${ENV_FILE}" || { echo "set MAIL_V2_ACTIVE=1 in ${ENV_FILE} first"; exit 1; }
grep -q '^EMAIL_UNSUBSCRIBE_SECRET=.' "${ENV_FILE}" || { echo "set EMAIL_UNSUBSCRIBE_SECRET in ${ENV_FILE} first"; exit 1; }
grep -Eq '^EMAILS_ENABLED=(1|true|yes|on)' "${ENV_FILE}" || { echo "set EMAILS_ENABLED=1 in ${ENV_FILE} first"; exit 1; }

unit() {
  local name="$1" schedule="$2" args="$3"
  cat > "${UNIT_DIR}/tikrr-mail-${name}.service" <<UNIT
[Unit]
Description=stocksbrew email: ${name}

[Service]
Type=oneshot
User=${USER_NAME}
WorkingDirectory=${REPO_DIR}
Environment=TIKRR_REPO_DIR=${REPO_DIR}
Environment=TIKRR_ENV_FILE=${ENV_FILE}
MemoryMax=2G
ExecStart=${REPO_DIR}/backend/vps/run-mail.sh ${args}
UNIT
  cat > "${UNIT_DIR}/tikrr-mail-${name}.timer" <<UNIT
[Unit]
Description=stocksbrew email: ${name}

[Timer]
OnCalendar=${schedule}
Persistent=false
AccuracySec=1min
Unit=tikrr-mail-${name}.service

[Install]
WantedBy=timers.target
UNIT
  chmod 0644 "${UNIT_DIR}/tikrr-mail-${name}.service" "${UNIT_DIR}/tikrr-mail-${name}.timer"
}

# The daily reads the last close, the night's news and today's earnings
# calendar, all of which are in by 08:30 ET. Persistent=false so a reboot
# never fires a late brief.
unit daily "Mon..Fri *-*-* 08:30:00 America/New_York" "daily --send"
unit weekly "Sat *-*-* 09:00:00 America/New_York" "weekly --send"
unit alerts "*-*-* *:00/15:00" "alerts --send"
unit lifecycle "*-*-* *:20:00" "lifecycle --send"

systemctl daemon-reload
for name in daily weekly alerts lifecycle; do
  systemctl enable --now "tikrr-mail-${name}.timer"
done
systemctl list-timers 'tikrr-mail-*' --no-pager
