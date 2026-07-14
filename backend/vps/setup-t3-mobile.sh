#!/usr/bin/env bash
# Enable T3 Code mobile access via Tailscale Serve (HTTPS on your tailnet).
# Run on the VPS after Tailscale is authenticated.
set -euo pipefail

export PATH="${HOME}/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Tailscale not installed. Run: curl -fsSL https://tailscale.com/install.sh | sh"
  exit 1
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale not connected. Run: sudo tailscale up"
  echo "Then open the auth URL it prints and approve this machine in your tailnet."
  exit 1
fi

mkdir -p "${HOME}/.config/systemd/user"

cat > "${HOME}/.config/systemd/user/t3code.service" <<UNIT
[Unit]
Description=T3 Code server (Tailscale mobile access)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=PATH=${HOME}/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=${HOME}
ExecStart=${HOME}/.npm-global/bin/t3 serve --host 127.0.0.1 --port 3773 --base-dir ${HOME}/.t3 --tailscale-serve
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now t3code.service
sleep 4

echo ""
echo "==> T3 status:"
systemctl --user status t3code.service --no-pager | head -15 || true

echo ""
echo "==> Tailscale Serve (if configured):"
tailscale serve status 2>/dev/null || true

echo ""
echo "==> Pairing info from logs (look for Pairing URL / QR):"
journalctl --user -u t3code.service -n 40 --no-pager 2>/dev/null | rg -i "pair|token|tailscale|https|ready|3773" || journalctl --user -u t3code.service -n 20 --no-pager

echo ""
TS_IP="$(tailscale ip -4 2>/dev/null || true)"
echo "Tailscale IP: ${TS_IP:-unknown}"
echo ""
echo "On phone:"
echo "  1) Install Tailscale app, sign in to SAME account"
echo "  2) Install ChatGPT... no — use Safari or T3:"
echo "     - Open the HTTPS URL from 'tailscale serve status' above, OR"
echo "     - Use app.t3.codes with the Pairing URL from the logs"
echo "  3) Add /opt/tikrr as a project once connected"
