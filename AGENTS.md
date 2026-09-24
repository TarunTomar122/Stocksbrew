## StocksBrew LocalDB/VPS runtime

- The web app and pipeline jobs use the VPS SQLite document store through the Firestore-shaped adapter in `lib/local-firestore.ts`. `lib/firebase-admin.ts` selects LocalDB when `LOCALDB_URL` and `LOCALDB_API_TOKEN` are present; Firebase Admin remains for Auth and explicit rollback only.
- The production LocalDB service runs from `/opt/tikrr` as `tikrr-localdb.service`, backed by `/srv/tikrr-data/localdb/documents.sqlite3`, bound to `127.0.0.1:8500`, and exposed to Vercel through Caddy at `https://db.stocksbrew.online`. The Tailscale Funnel URL is an emergency fallback only.
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
