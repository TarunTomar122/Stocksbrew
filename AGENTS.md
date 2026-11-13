## StocksBrew hosting (self-hosted since 2026-11-13)

- Cloudflare (free plan) sits in front since Nov 13: DNS lives at Cloudflare (nameservers changed at Hostinger), `@` and `www` are proxied (orange cloud), `db` is DNS only, SSL mode Full (strict). It caches build files at the edge; HTML and APIs pass through to Caddy. The visitor IP is in `CF-Connecting-IP` (Caddy here is 2.6, which has no trusted-proxy option).
- The web app no longer runs on Vercel (the Hobby team was paused for CPU on Nov 12). It runs on the VPS: Caddy (HTTPS for www.stocksbrew.online; the bare domain redirects to www) → Varnish on 127.0.0.1:6081 (caches only public routes: build files, logos, share images, sitemaps) → two Next standalone instances, `tikrr-web@3000` and `tikrr-web@3001`. Files: `backend/vps/web/`.
- Deploy with `bash backend/vps/web/deploy-web.sh [ref]` from the laptop: it builds in `~/.cache/tikrr-web-build` with the production env in `~/.config/tikrr/web.env` (mode 600, never printed or committed), ships the build, swaps the sharp binaries for linux, restarts one instance at a time and warms the busiest pages. The runtime env on the VPS is `/etc/tikrr/web.env`; after editing the laptop copy, `scp` it there before deploying. Never build on the VPS (not enough memory).
- Load tested Nov 13: ~110 req/s per page type through Caddy with 0 errors, ~3,500 req/s for cached logos.
- The LocalDB database lives on the fast system disk at /var/lib/tikrr/localdb (moved Nov 13; /srv/tikrr-data/localdb is a symlink to it, the old copy sits in /srv/tikrr-data/localdb.on-slow-disk-20261113). /srv/tikrr-data (sdb) reads at ~0.5 MB/s random: never put a hot database there.
- Traces: Caddy writes every request as JSON to /var/log/caddy/stocksbrew.log (status, duration); app errors are in `journalctl -u tikrr-web@3000 -u tikrr-web@3001`.

## StocksBrew LocalDB/VPS runtime

- The web app and pipeline jobs use the VPS SQLite document store through the Firestore-shaped adapter in `lib/local-firestore.ts`. `lib/firebase-admin.ts` selects LocalDB when `LOCALDB_URL` and `LOCALDB_API_TOKEN` are present; Firebase Admin remains for Auth and explicit rollback only.
- The production LocalDB service runs from `/opt/tikrr` as `tikrr-localdb.service`, backed by `/srv/tikrr-data/localdb/documents.sqlite3`, bound to `127.0.0.1:8500`, and exposed to Vercel through Caddy at the host in `LOCALDB_URL` (kept out of the repo). The Tailscale Funnel URL is an emergency fallback only.
- Vercel must define `LOCALDB_URL` and `LOCALDB_API_TOKEN` in the environment used by the deployment. Local builds use the ignored, permission-600 `.env.vps.local`; never commit or print its token.
- After backend changes, update the VPS checkout with `git pull --ff-only origin main` and restart `tikrr-localdb.service`. Check the deployed revision before debugging frontend data.
- A `LocalDB batch read failed (404)` with `/health` still returning `200` means the VPS service is running stale server code, not that Vercel cannot reach the VPS. Verify `/documents:batchGet`, update `/opt/tikrr`, restart the service, and retest before changing app callers.
- Do not delete Firebase data. Keep Firebase available for Auth, rollback, and parity checks until a separately confirmed migration cutover.

See `docs/local-db-migration.md` for the API contract, migration safety rules, and operational commands.

## Mandatory frontend visual verification

This is a standing user rule. Never approve or ship a frontend change based on typecheck, lint, tests, or SSR HTML alone. Before the final response, look at the actual rendered UI:

1. Capture screenshots of every affected page or component, on **desktop and mobile viewports** (for example 1280x900 and 390x844).
2. Exercise the interactive states that matter: expanded/collapsed, hover, open menu, empty state, dark mode, error state.
3. Check for overlap and stacking problems against existing fixed/sticky elements (mobile nav, chat composer, modals, banners), transparent backgrounds from scoped design tokens (the `--oa-*` tokens only exist under `.oa-landing` / `.oa-app`), clipped text, and contrast.
4. Report what was verified and paste or attach the screenshots when anything visual changed.

A working setup in this environment: Chrome for Testing from `~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/..."` driven via CDP (see the throwaway helper at `/var/folders/.../T/opencode/shot.mjs`), or `--headless=new --screenshot=... --window-size=W,H`. Read the PNG back with the Read tool and inspect it before approving.

## Mandatory quality pass before completion

This is a standing user rule. Upon completing any work, spawn a subagent to do a full and thorough quality pass through it for any remaining bugs, issues, or quality-of-life improvements. Do this before the final response, without waiting to be asked. The quality pass must cover:

1. Correctness: edge cases, off-by-one errors, null/empty handling, concurrency, and error paths in the changed code.
2. Regressions: anything the change could break elsewhere (callers, tests, jobs, UI states).
3. Data safety: no stale, partial, or inconsistent writes; no secrets or tokens printed or committed.
4. Quality of life: naming, comments, dead code, inconsistent copy, unclear UX, and small improvements worth proposing.
5. Verification: run the relevant tests, typecheck, and lint where available, and report anything that was not run.

Report the subagent's findings to the user, fix confirmed issues before finishing, and list anything intentionally left open. If a subagent cannot be spawned for some reason, say so explicitly and do the pass directly instead of skipping it.

## Vercel commit identity

Commits deployed to the `yourtraceonline-5491s-projects` Vercel team must use `Tarun Tomar <yourtrace.online@gmail.com>` as the Git author. The `ttomar@adobe.com` identity is not a member of that team and causes Vercel deployments to be blocked.

## Writing voice

For user-facing conversation and writing, prefer the voice of Tarat's Garden: direct, first-person, concrete, informal, and lightly playful when it fits. Use lowercase and short replies by default (unless the task genuinely needs detail). Start with what actually happened, keep the useful details, and avoid polished generic AI/product-marketing phrasing, empty framing, em dashes, and over-structured lists. Do not imitate distinctive wording verbatim; use the qualities of the voice rather than copying it.
