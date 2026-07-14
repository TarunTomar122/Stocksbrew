#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:${HOME}/.npm-global/bin"

echo "==> Installing T3 CLI globally..."
npm install -g "t3@0.0.29-nightly.20260703.715"
command -v t3
t3 --version 2>/dev/null || true

echo "==> Guarding tmux-helpers in .bashrc (interactive only)..."
python3 <<'PY'
from pathlib import Path

bashrc = Path.home() / ".bashrc"
text = bashrc.read_text()
old = '[[ -f "$HOME/bin/tmux-helpers.sh" ]] && source "$HOME/bin/tmux-helpers.sh"'
new = 'case $- in *i*) [[ -f "$HOME/bin/tmux-helpers.sh" ]] && source "$HOME/bin/tmux-helpers.sh" ;; esac'
if old in text and new not in text:
    bashrc.write_text(text.replace(old, new))
    print("fixed bashrc")
elif new in text:
    print("bashrc already guarded")
else:
    print("bashrc pattern not found; skipping")

profile = Path.home() / ".profile"
line = 'export PATH="$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"'
content = profile.read_text()
if line not in content:
    profile.write_text(content.rstrip() + "\n\n# tikrr helpers + node\n" + line + "\n")
    print("updated profile")
PY

echo "==> Stopping stale T3 processes..."
pkill -f "t3 serve --host 127.0.0.1 --port 3773" 2>/dev/null || true
sleep 1

echo "==> Installing systemd user service..."
mkdir -p "${HOME}/.config/systemd/user"
cat > "${HOME}/.config/systemd/user/t3code.service" <<UNIT
[Unit]
Description=T3 Code remote server (see backend/vps/T3_ACCESS.md)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=PATH=${HOME}/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=${HOME}
ExecStart=${HOME}/.npm-global/bin/t3 serve --host 127.0.0.1 --port 3773 --base-dir ${HOME}/.t3
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now t3code.service
sleep 3

echo "==> Status:"
systemctl --user status t3code.service --no-pager | head -20 || true
ss -tlnp | grep 3773 || true
curl -sf -o /dev/null -w "http_status:%{http_code}\n" http://127.0.0.1:3773/ || echo "curl failed"

echo "==> Non-interactive shell check:"
bash -lc 'which node; node -v; which t3; t3 --version 2>/dev/null | head -1'

echo "done"
