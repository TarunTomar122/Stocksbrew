#!/usr/bin/env bash
set -euo pipefail
TOKEN_FILE="$HOME/.config/github/token"
if [[ "${1:-}" == "" ]]; then
  echo "Usage: setup-gh-token <github-pat>"
  echo "Create at: https://github.com/settings/tokens?type=beta"
  echo "Scopes: Contents R/W, Pull requests, Issues, Metadata"
  exit 1
fi
TOKEN="$1"
umask 077
mkdir -p "$(dirname "$TOKEN_FILE")"
chmod 700 "$(dirname "$TOKEN_FILE")"
printf '%s' "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
printf '%s' "$TOKEN" | gh auth login --with-token
gh auth setup-git
# Sync to Hermes if present
if [[ -f "$HOME/.hermes/.env" ]]; then
  grep -v '^GITHUB_TOKEN=' "$HOME/.hermes/.env" > /tmp/hermes.env || true
  echo "GITHUB_TOKEN=$TOKEN" >> /tmp/hermes.env
  mv /tmp/hermes.env "$HOME/.hermes/.env"
  chmod 600 "$HOME/.hermes/.env"
fi
echo "OK: gh authenticated as $(gh api user -q .login)"

# OpenClaw gateway (systemd reads gateway.systemd.env)
GATEWAY_ENV="$HOME/.openclaw/gateway.systemd.env"
if [[ -f "$GATEWAY_ENV" ]]; then
  grep -v '^GH_TOKEN=' "$GATEWAY_ENV" | grep -v '^GITHUB_TOKEN=' > /tmp/gw.env || true
  cat /tmp/gw.env > "$GATEWAY_ENV"
  echo "GH_TOKEN=$TOKEN" >> "$GATEWAY_ENV"
  echo "GITHUB_TOKEN=$TOKEN" >> "$GATEWAY_ENV"
  chmod 600 "$GATEWAY_ENV"
fi
export PATH="$HOME/.npm-global/bin:$PATH"
if command -v openclaw >/dev/null; then
  openclaw gateway restart >/dev/null 2>&1 || true
fi
