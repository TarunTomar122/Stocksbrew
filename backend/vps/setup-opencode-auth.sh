#!/usr/bin/env bash
# Configure OpenCode API key on the VPS. Run on the server only.
# Usage: OPENCODE_API_KEY='sk-...' bash setup-opencode-auth.sh
set -euo pipefail

KEY="${OPENCODE_API_KEY:-${OPENCODE_GO_API_KEY:-}}"
if [[ -z "$KEY" ]]; then
  echo "Set OPENCODE_API_KEY before running." >&2
  exit 1
fi

AUTH_DIR="${HOME}/.local/share/opencode"
CRED_DIR="${HOME}/.config/opencode"
mkdir -p "$AUTH_DIR" "$CRED_DIR" "${HOME}/bin"

python3 <<PY
import json, os
from pathlib import Path

key = os.environ["OPENCODE_API_KEY"]
auth_path = Path.home() / ".local/share/opencode/auth.json"
auth = {}
if auth_path.exists():
    auth = json.loads(auth_path.read_text() or "{}")
for provider in ("opencode", "opencode-go"):
    auth[provider] = {"type": "api", "key": key}
auth_path.write_text(json.dumps(auth, indent=2) + "\n")
auth_path.chmod(0o600)

cred_env = Path.home() / ".config/opencode/credentials.env"
cred_env.write_text(
    f'OPENCODE_API_KEY="{key}"\nOPENCODE_GO_API_KEY="{key}"\n'
)
cred_env.chmod(0o600)

openclaw_env = Path.home() / ".openclaw/.env"
if openclaw_env.parent.exists():
    lines = []
    if openclaw_env.exists():
        lines = [
            l for l in openclaw_env.read_text().splitlines()
            if l and not l.startswith(("OPENCODE_API_KEY=", "OPENCODE_GO_API_KEY="))
        ]
    lines.extend([
        f"OPENCODE_API_KEY={key}",
        f"OPENCODE_GO_API_KEY={key}",
    ])
    openclaw_env.write_text("\n".join(lines) + "\n")
    openclaw_env.chmod(0o600)

bashrc = Path.home() / ".bashrc"
marker = "# opencode credentials"
if marker not in bashrc.read_text():
    bashrc.write_text(
        bashrc.read_text().rstrip()
        + f"\n\n{marker}\n"
        + '[ -f "$HOME/.config/opencode/credentials.env" ] && set -a && source "$HOME/.config/opencode/credentials.env" && set +a\n'
    )

profile = Path.home() / ".profile"
if marker not in profile.read_text():
    profile.write_text(
        profile.read_text().rstrip()
        + f"\n\n{marker}\n"
        + '[ -f "$HOME/.config/opencode/credentials.env" ] && set -a && source "$HOME/.config/opencode/credentials.env" && set +a\n'
    )

print("configured auth.json + credentials.env + openclaw .env")
PY

export PATH="${HOME}/.opencode/bin:${HOME}/.local/bin:${PATH}"
opencode auth list 2>&1 | head -20 || true
