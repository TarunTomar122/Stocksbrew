<!-- ai-memory:start -->
## Long-term memory (ai-memory)

This project uses [ai-memory](https://github.com/akitaonrails/ai-memory)
for cross-session continuity.

**Default to the current project - always.** Every ai-memory tool
auto-scopes to the project resolved from your session's working
directory. **Do NOT pass `project`, `workspace`, or `cwd` arguments unless
the user explicitly references a *different* project by name** (e.g. "what
did we decide in the `other-app` project?"). Phrases like "this project",
"here", "we", "our work", and "where did we leave off" all mean the
*current* project, so call tools with no scoping args.

This default assumes the MCP client can identify the current agent
session. Static MCP clients in parallel sessions for the same user cannot
forward the real agent session id automatically; pass explicit
`workspace` + `project` / `scopes`, or use a session-aware bridge that
forwards the lifecycle-hook session id on MCP calls.

**Lifecycle hooks already capture every prompt and tool call
automatically.** Do not manually write routine notes. Only write durable
memory when the user explicitly asks to remember or annotate something
permanently.

### Use the installed ai-memory Agent Skills

Detailed tool-routing guidance lives in the installed ai-memory Agent
Skills. When a task matches an installed ai-memory Agent Skill, load and
follow that skill before calling ai-memory tools. The skills cover memory
retrieval, handoffs, durable pages, learning maintenance, and routing
install or refresh work.

### When you write a project rule, write it here

If you're about to write a durable project rule ("always X", "never
Y", "all PRs must ..."), write it in the project's canonical agent instruction file.
Many projects use CLAUDE.md for Claude Code and
AGENTS.md for Codex / OpenCode / Cursor / Gemini CLI, but if the project
says one file is canonical, use that file.

If the rule is a standing *user/team* preference that should apply to
every project (tech choices, code style, personal conventions), save it
to ai-memory's reserved global scope instead — the durable-pages skill
covers how. Default memory reads surface global-scope pages in every
project automatically.

### Refreshing this snippet

This block is maintained by ai-memory. Two ways to refresh it with the
latest binary's recommended copy:

- **From the agent** (no terminal needed): ask "refresh the ai-memory
  routing in this project". The agent calls `memory_install_self_routing`,
  picks the right filename for itself (Claude Code -> `CLAUDE.md`; Codex /
  OpenCode / Cursor / Gemini -> `AGENTS.md`), uses its Write / Edit tool
  to replace or append the returned `markered_block` while preserving
  non-ai-memory user content, then writes or updates each returned
  `managed_skills` item under the selected skill root from `target_hints`
  using its `relative_path`.
- **From the CLI**: `ai-memory install-instructions` (defaults to
  `CLAUDE.md`; pass `--target AGENTS.md` for non-Claude agents or projects
  that use `AGENTS.md` as the canonical instruction file).

Both are idempotent: re-runs replace the block delimited by the ai-memory
start/end HTML-comment markers, without disturbing the rest of the file.
<!-- ai-memory:end -->

## StocksBrew LocalDB/VPS runtime

- The web app and pipeline jobs use the VPS SQLite document store through the Firestore-shaped adapter in `lib/local-firestore.ts`. `lib/firebase-admin.ts` selects LocalDB when `LOCALDB_URL` and `LOCALDB_API_TOKEN` are present; Firebase Admin remains for Auth and explicit rollback only.
- The production LocalDB service runs from `/opt/tikrr` as `tikrr-localdb.service`, backed by `/srv/tikrr-data/localdb/documents.sqlite3`, bound to `127.0.0.1:8500`, and exposed to Vercel through Caddy at `https://db.stocksbrew.online`. The Tailscale Funnel URL is an emergency fallback only.
- Vercel must define `LOCALDB_URL` and `LOCALDB_API_TOKEN` in the environment used by the deployment. Local builds use the ignored, permission-600 `.env.vps.local`; never commit or print its token.
- After backend changes, update the VPS checkout with `git pull --ff-only origin main` and restart `tikrr-localdb.service`. Check the deployed revision before debugging frontend data.
- A `LocalDB batch read failed (404)` with `/health` still returning `200` means the VPS service is running stale server code, not that Vercel cannot reach the VPS. Verify `/documents:batchGet`, update `/opt/tikrr`, restart the service, and retest before changing app callers.
- Do not delete Firebase data. Keep Firebase available for Auth, rollback, and parity checks until a separately confirmed migration cutover.

See `docs/local-db-migration.md` for the API contract, migration safety rules, and operational commands.

## Mandatory memory checkpoint

This is a standing user rule and overrides the generated guidance above when a task produces durable project knowledge.

For any task that changes code, data, infrastructure, deployment, product behavior, configuration, or a lasting product or engineering decision:

1. Search ai-memory for relevant project context before making substantial changes.
2. Let lifecycle hooks capture the session automatically.
3. Before the final response, run `ai-memory finalize-session --agent codex` when the current runtime is Codex.
4. If the session was not captured, the MCP tools are unavailable, or finalization reports no open session, write a concise fallback handoff with the ai-memory MCP write tool. If only the CLI is available, run `ai-memory write-page --path handoffs/latest.md --kind decision --tier episodic --body "<concise markdown summary>"`.
5. The fallback handoff must include the goal, decisions, important files or data changed, commit or deployment state, validation performed, and any unfinished work.
6. Verify the saved result with `ai-memory read-page --path handoffs/latest.md` or an equivalent MCP read before claiming the task is complete.

Do not save secrets, credentials, private keys, raw environment values, personal data, or unnecessarily large command output. Routine read-only answers do not require a manual handoff when hooks are healthy.

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
