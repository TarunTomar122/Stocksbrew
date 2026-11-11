import { parseJobDraft, type AgentJobDraft } from "@/lib/agent-jobs";

/**
 * An agent handed to /agents by a link, so a visitor lands on it filled in and
 * can look it over before signing in.
 *
 * Two ways in: `?q=` (a request in words, read by the page with the fixed
 * rules) and `?draft=` (the page's own copy of a draft, written into the
 * address just before a sign-in so the same agent is waiting afterwards). The
 * draft param is untrusted input like any other: it goes through
 * parseJobDraft, which is also what the save route runs. Pure, no server
 * imports: the page and the client both use it.
 */

export type LinkedDraft = {
  draft: AgentJobDraft;
  /** What to expect that the person may not, from the reading of their words. */
  note?: string | null;
};

/** Longest `?draft=` value read. A draft is a template, a rule and up to 25 tickers, well under this. */
export const DRAFT_PARAM_MAX = 1200;

/** The parts of a draft that go in the address. The name is left out: the server names it again on save. */
function compact(draft: Pick<AgentJobDraft, "template" | "trigger" | "scope">) {
  return { template: draft.template, trigger: draft.trigger, scope: draft.scope };
}

/** `?draft=` for a draft, ready to put in a URL (already encoded). */
export function draftParam(draft: Pick<AgentJobDraft, "template" | "trigger" | "scope">): string {
  return encodeURIComponent(JSON.stringify(compact(draft)));
}

/** /agents with this draft filled in. */
export function draftHref(draft: Pick<AgentJobDraft, "template" | "trigger" | "scope">): string {
  return `/agents?draft=${draftParam(draft)}`;
}

/** Read `?draft=` back (Next has already decoded it). Null for anything that is not a valid draft. */
export function draftFromParam(value: string | string[] | undefined, hidden: string[]): AgentJobDraft | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > DRAFT_PARAM_MAX) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = parseJobDraft(parsed, { hidden });
  return result.ok ? result.draft : null;
}
