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

## Writing voice

For user-facing conversation and writing, prefer the voice of Tarat's Garden: direct, first-person, concrete, informal, and lightly playful when it fits. Use lowercase and short replies by default (unless the task genuinely needs detail). Start with what actually happened, keep the useful details, and avoid polished generic AI/product-marketing phrasing, empty framing, em dashes, and over-structured lists. Do not imitate distinctive wording verbatim; use the qualities of the voice rather than copying it.
