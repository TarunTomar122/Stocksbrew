import { jobDocId, type AgentJob, type AgentJobDraft } from "@/lib/agent-jobs";
import { AGENT_JOBS_COLLECTION } from "@/lib/agent-jobs-data";
import { EXAMPLE_AGENTS_UID } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { EXAMPLE_STOCK_TICKERS } from "@/lib/portfolio-data";

/**
 * The example portfolio's standing agents: three real agents, owned by the
 * site's example account (EXAMPLE_AGENTS_UID, lib/entitlements.ts, never a
 * person), watching the example's seven stocks. The after-close runner checks
 * them every market day like anyone else's (lib/agent-jobs-data.ts
 * runAllEnabledJobs) and stores each run in tm_agent_runs, so My stocks and
 * the landing can show a visitor a real, dated check (./example-check.ts).
 *
 * scripts/setup-example-agents.ts writes them. It is idempotent: fixed job
 * ids, and a second run only refreshes the definition (the stocks, the rule),
 * never the run history or the last-checked days.
 */

export type ExampleAgent = {
  /** Fixed, so setup is idempotent (AGENT_JOB_ID_RE: 6-24 lower-case letters and digits). */
  id: string;
  /** The rule as a person would ask for it, about "these" stocks (the panel names them once). */
  ask: string;
  draft: AgentJobDraft;
};

const scope = (): AgentJobDraft["scope"] => ({ kind: "tickers", tickers: [...EXAMPLE_STOCK_TICKERS] });

export const EXAMPLE_AGENTS: ExampleAgent[] = [
  {
    id: "exampleearnings",
    ask: "Tell me 3 days before any of these report earnings.",
    draft: {
      template: "earnings-ahead",
      name: "Earnings in the next 3 days",
      trigger: { type: "event", event: "earnings_approaching", days_before: 3 },
      scope: scope(),
    },
  },
  {
    id: "examplebigmove",
    ask: "Tell me when any of these moves 5% or more in a day.",
    draft: {
      template: "big-move",
      name: "5% moves in a day",
      trigger: { type: "price", rule: "moves_pct", pct: 5 },
      scope: scope(),
    },
  },
  {
    id: "examplefilings",
    ask: "Tell me when any of these files something big with the SEC, like a deal, a restatement or an annual report.",
    draft: {
      template: "sec-filing",
      name: "Big SEC filings",
      trigger: { type: "event", event: "sec_filing", filings: { major: true } },
      scope: scope(),
    },
  },
];

export type SetupLine = { id: string; action: "create" | "update" | "unchanged" };

/** JSON with object keys sorted: the store does not keep key order. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined);
    return `{${entries.sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameDefinition(stored: Record<string, unknown>, agent: ExampleAgent): boolean {
  const { template, name, trigger, scope } = agent.draft;
  return stored.enabled === true && stable({ template: stored.template, name: stored.name, trigger: stored.trigger, scope: stored.scope }) === stable({ template, name, trigger, scope });
}

/**
 * Write the example agents. Only ever touches `tm_agent_jobs/{EXAMPLE_AGENTS_UID}__{id}` for the ids above:
 * a new one is created switched on; an existing one gets its definition merged in (it is switched back on,
 * unarchived), keeping its created_at, last_checked_day and last_close_seen. With `dryRun` it reads and says what it
 * would do, and writes nothing.
 */
export async function ensureExampleAgents(options: { dryRun?: boolean; now?: Date } = {}): Promise<SetupLine[]> {
  const now = options.now ?? new Date();
  const stamp = now.toISOString();
  const collection = adminFirestore.collection(AGENT_JOBS_COLLECTION);
  const refs = EXAMPLE_AGENTS.map((agent) => collection.doc(jobDocId(EXAMPLE_AGENTS_UID, agent.id)));
  const snaps = await adminFirestore.getAll(...refs);
  // Check every doc before writing any, so a refusal never leaves the set half written.
  for (const [index, snap] of snaps.entries()) {
    const stored = snap?.exists ? (snap.data() as Record<string, unknown>) : null;
    if (stored && stored.uid !== EXAMPLE_AGENTS_UID) throw new Error(`refusing to touch ${EXAMPLE_AGENTS[index]!.id}: the stored job belongs to another account`);
  }
  const out: SetupLine[] = [];
  for (const [index, agent] of EXAMPLE_AGENTS.entries()) {
    const snap = snaps[index];
    const stored = snap?.exists ? (snap.data() as Record<string, unknown>) : null;
    if (stored && stored.archived !== true && sameDefinition(stored, agent)) {
      out.push({ id: agent.id, action: "unchanged" });
      continue;
    }
    out.push({ id: agent.id, action: stored ? "update" : "create" });
    if (options.dryRun) continue;
    if (stored) {
      await refs[index].set({ ...agent.draft, enabled: true, archived: false, updated_at: stamp }, { merge: true });
    } else {
      const job: AgentJob = {
        ...agent.draft,
        id: agent.id,
        uid: EXAMPLE_AGENTS_UID,
        mode: "tell_me",
        enabled: true,
        created_at: stamp,
        updated_at: stamp,
        last_checked_day: null,
        last_close_seen: null,
      };
      await refs[index].set(job);
    }
  }
  return out;
}
