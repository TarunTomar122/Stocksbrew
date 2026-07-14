#!/usr/bin/env bash
# Kill orphan T3 servers spawned by the desktop app (127.0.0.1:3773).
# Keeps the systemd t3code.service instance (Tailscale IP binding).
set -euo pipefail

MAIN_PID=""
if systemctl --user is-active t3code.service >/dev/null 2>&1; then
  MAIN_PID="$(systemctl --user show -p MainPID --value t3code.service 2>/dev/null || true)"
fi

killed=0
while read -r pid; do
  [[ -z "$pid" ]] && continue
  [[ "$pid" == "$MAIN_PID" ]] && continue
  kill "$pid" 2>/dev/null && killed=$((killed + 1)) || true
done < <(pgrep -f "t3 serve --host 127.0.0.1 --port 3773" 2>/dev/null || true)

if [[ "$killed" -gt 0 ]]; then
  logger -t t3-dedupe "killed ${killed} orphan t3 serve process(es) on 127.0.0.1:3773"
fi
