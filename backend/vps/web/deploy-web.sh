#!/usr/bin/env bash
# Build the web app on this machine (the VPS has too little memory to build) and ship it to the VPS.
#   bash backend/vps/web/deploy-web.sh [git-ref]      default: HEAD
# Needs: ssh alias "vps", the production env at $WEB_ENV (default ~/.config/tikrr/web.env, mode 600; it holds
# NEXT_PUBLIC_* values, which are baked into the build). Keeps the last 5 releases; rollback = point
# /opt/tikrr-web/current at an older one and restart tikrr-web.
set -euo pipefail
REF="${1:-HEAD}"
WEB_ENV="${WEB_ENV:-$HOME/.config/tikrr/web.env}"
REPO="$(git rev-parse --show-toplevel)"
SHA="$(git -C "$REPO" rev-parse --short "$REF")"
# A dedicated worktree with its own real node_modules: a symlinked node_modules makes Next's standalone file
# tracing write outside the build folder. Created once: git worktree add --detach ~/.cache/tikrr-web-build main
# && (cd ~/.cache/tikrr-web-build && npm ci --ignore-scripts).
WORK="${WEB_BUILD_DIR:-$HOME/.cache/tikrr-web-build}"
[ -s "$WEB_ENV" ] || { echo "missing $WEB_ENV" >&2; exit 1; }
[ -d "$WORK/node_modules" ] || { echo "missing build worktree $WORK (see the comment above)" >&2; exit 1; }
git -C "$WORK" checkout -q -f --detach "$(git -C "$REPO" rev-parse "$REF")"
git -C "$WORK" clean -fdq -e node_modules -e .next
if ! git -C "$WORK" diff --quiet HEAD -- package-lock.json 2>/dev/null || [ "$WORK/package-lock.json" -nt "$WORK/node_modules/.package-lock.json" ]; then
  ( cd "$WORK" && npm ci --no-audit --no-fund --ignore-scripts >/dev/null )
fi
trap 'rm -f "$WORK/.env.production.local"' EXIT
cp "$WEB_ENV" "$WORK/.env.production.local"
( cd "$WORK" && rm -rf .next/standalone && NEXT_OUTPUT=standalone NEXT_PUBLIC_APP_VERSION="$SHA" npx next build )
rm -f "$WORK/.env.production.local"
OUT="$WORK/.next/standalone"
mkdir -p "$OUT/.next" && cp -R "$WORK/.next/static" "$OUT/.next/static"
[ -d "$WORK/public" ] && cp -R "$WORK/public" "$OUT/public"
# Never ship env files inside the build.
find "$OUT" -maxdepth 1 -name '.env*' -delete
SHARP="$(node -p "require('$REPO/node_modules/sharp/package.json').version")"
ssh vps "mkdir -p /opt/tikrr-web/releases/$SHA"
rsync -a --delete "$OUT/" "vps:/opt/tikrr-web/releases/$SHA/"
# Native modules must match the VPS (linux x64), not this laptop.
# sharp's prebuilt binaries (@img/sharp-*) are per platform: swap the laptop's for linux-x64 ones, installed in a
# scratch folder so npm never touches the release's own tree.
ssh vps "set -e; REL=/opt/tikrr-web/releases/$SHA; T=\$(mktemp -d); cd \$T && npm init -y >/dev/null && npm install --no-audit --no-fund --os=linux --cpu=x64 --libc=glibc sharp@$SHARP >/dev/null; rm -rf \$REL/node_modules/sharp \$REL/node_modules/@img; cp -R \$T/node_modules/sharp \$T/node_modules/@img \$REL/node_modules/; rm -rf \$T"
ssh vps "ln -sfn /opt/tikrr-web/releases/$SHA /opt/tikrr-web/current && sudo systemctl restart tikrr-web && ls -1dt /opt/tikrr-web/releases/* | tail -n +6 | xargs -r rm -rf"
echo "deployed $SHA"
