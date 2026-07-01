#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"

ARCHIVE="$HOME/projects/openclaw-migration.tar.gz"
STEVE_CHANNEL="1521819223670784123"
GUILD="1521815250192568400"
USER_ID="656484722943328286"
OPENCODE_GO_KEY="${OPENCODE_GO_API_KEY:-${OPENCODE_API_KEY:-}}"

log() { echo "[openclaw-setup] $*"; }

log "Installing OpenClaw CLI..."
npm install -g openclaw@latest

log "Restoring backup from $ARCHIVE..."
RESTORE_DIR="/tmp/openclaw-restore-$$"
mkdir -p "$RESTORE_DIR"
tar -xzf "$ARCHIVE" -C "$RESTORE_DIR"
PAYLOAD=$(find "$RESTORE_DIR" -type d -path '*/payload/posix/home/ubuntu/.openclaw' | head -1)
if [[ -z "$PAYLOAD" ]]; then
  echo "Could not find .openclaw payload in archive" >&2
  exit 1
fi
if [[ -d "$HOME/.openclaw" ]]; then
  mv "$HOME/.openclaw" "$HOME/.openclaw.pre-restore.$(date +%s)"
fi
cp -a "$PAYLOAD" "$HOME/.openclaw"
rm -rf "$RESTORE_DIR"

log "Writing OpenCode Go API key..."
if [[ -z "$OPENCODE_GO_KEY" ]]; then
  echo "Set OPENCODE_GO_API_KEY before running this script." >&2
  exit 1
fi
mkdir -p "$HOME/.openclaw"
touch "$HOME/.openclaw/.env"
grep -v '^OPENCODE_GO_API_KEY=' "$HOME/.openclaw/.env" 2>/dev/null | grep -v '^OPENCODE_API_KEY=' > "$HOME/.openclaw/.env.tmp" || true
{
  cat "$HOME/.openclaw/.env.tmp" 2>/dev/null || true
  echo "OPENCODE_GO_API_KEY=$OPENCODE_GO_KEY"
  echo "OPENCODE_API_KEY=$OPENCODE_GO_KEY"
} > "$HOME/.openclaw/.env"
rm -f "$HOME/.openclaw/.env.tmp"
chmod 600 "$HOME/.openclaw/.env"

log "Patching openclaw.json for Steve + MiMo + Discord #steve..."
python3 <<'PY'
import json, os
from pathlib import Path

p = Path.home() / ".openclaw/openclaw.json"
data = json.loads(p.read_text())

STEVE = "1521819223670784123"
GUILD = "1521815250192568400"
USER = "656484722943328286"

# Model: OpenCode Go MiMo v2.5 Pro
model = "opencode-go/mimo-v2.5-pro"
data.setdefault("agents", {}).setdefault("defaults", {}).setdefault("model", {})["primary"] = model
data["agents"]["defaults"]["imageModel"] = model
for agent in data.get("agents", {}).get("list", []):
    agent["model"] = model

# Disable Telegram on this VPS to avoid fighting the old gateway.
channels = data.setdefault("channels", {})
channels["telegram"] = {"enabled": False}

# Discord: steve channel only. Token must be supplied separately.
discord = channels.setdefault("discord", {})
discord.update({
    "enabled": True,
    "groupPolicy": "allowlist",
    "allowFrom": [f"discord:{USER}", USER],
})
accounts = discord.setdefault("accounts", {})
default = accounts.setdefault("default", {})
default.update({
    "enabled": True,
    "groupPolicy": "allowlist",
    "guilds": {
        GUILD: {
            "channels": {
                STEVE: {"allow": True, "requireMention": False},
            }
        }
    },
})
token = os.environ.get("OPENCLAW_DISCORD_BOT_TOKEN", "").strip()
if token:
    default["token"] = token
    discord["token"] = token

# Owner allowlist for slash commands
data.setdefault("commands", {})["ownerAllowFrom"] = [f"discord:{USER}", USER]

# Bind main agent to discord
bindings = [b for b in data.get("bindings", []) if b.get("match", {}).get("channel") != "discord"]
bindings.append({"agentId": "main", "match": {"channel": "discord"}})
data["bindings"] = bindings

p.write_text(json.dumps(data, indent=2) + "\n")
print("patched", p)
PY

log "Running openclaw doctor..."
openclaw doctor --non-interactive 2>&1 || openclaw doctor 2>&1 || true

log "Installing gateway service..."
openclaw gateway install --force 2>&1 || true
loginctl enable-linger "$USER" 2>/dev/null || true

if [[ -n "${OPENCLAW_DISCORD_BOT_TOKEN:-}" ]]; then
  log "Starting gateway (Discord token present)..."
  openclaw gateway restart 2>&1 || openclaw gateway start 2>&1 || true
else
  log "SKIP gateway start: set OPENCLAW_DISCORD_BOT_TOKEN for Steve bot, then run: openclaw gateway restart"
fi

openclaw --version
openclaw gateway status 2>&1 || true
log "Done."
