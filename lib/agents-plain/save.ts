import type { AgentJobDraft } from "@/lib/agent-jobs";

/** Two agents that would do the same thing: same template, same rule, same stocks (in any order). Names don't count. */
export function sameJob(a: Pick<AgentJobDraft, "template" | "trigger" | "scope">, b: Pick<AgentJobDraft, "template" | "trigger" | "scope">): boolean {
  if (a.template !== b.template) return false;
  const trigger = (draft: Pick<AgentJobDraft, "trigger">) => JSON.stringify(Object.entries(draft.trigger).sort(([x], [y]) => x.localeCompare(y)));
  if (trigger(a) !== trigger(b)) return false;
  if (a.scope.kind !== b.scope.kind) return false;
  if (a.scope.kind !== "tickers" || b.scope.kind !== "tickers") return true;
  return [...a.scope.tickers].sort().join(",") === [...b.scope.tickers].sort().join(",");
}

/** What the save says back, in one sentence. */
export function savedSentence(input: { saved: Array<{ name: string; enabled: boolean }>; already: string[]; failed?: string[]; limit: number | null }): string {
  const on = input.saved.filter((job) => job.enabled).map((job) => job.name);
  const off = input.saved.filter((job) => !job.enabled).map((job) => job.name);
  const list = (names: string[]) => (names.length <= 1 ? `“${names[0] ?? ""}”` : `${names.slice(0, -1).map((n) => `“${n}”`).join(", ")} and “${names[names.length - 1]}”`);
  const parts: string[] = [];
  if (on.length) parts.push(`${list(on)} ${on.length === 1 ? "is" : "are"} on. Reports show up below after the next check.`);
  if (off.length) {
    const plan = input.limit != null ? `Your plan runs ${input.limit === 2 ? "two" : input.limit} agents at a time, so ` : "";
    parts.push(`${plan}${list(off)} ${off.length === 1 ? "is" : "are"} saved and paused. Pause another agent to switch ${off.length === 1 ? "it" : "them"} on.`);
  }
  if (input.failed?.length) {
    parts.push(`${list(input.failed)} didn't save. Build it again and save: the ones already saved won't be added twice.`);
  }
  if (input.already.length) parts.push(`You already had ${list(input.already)}, so ${input.already.length === 1 ? "it was" : "they were"} left as ${input.already.length === 1 ? "it was" : "they were"}.`);
  return parts.join(" ") || "Nothing new to save.";
}
