/**
 * "Agents I'd set up for you": two or three standing agents from the existing templates (lib/agent-jobs.ts), each
 * watching the person's own stocks, ordered by what the first look found on them, and never more than the plan has
 * room to run (lib/entitlements.ts `agents`: jobs and idea-basket agents count together). Nothing is switched on here:
 * each offer is a draft the person's tap sends to POST /api/agent-jobs. Pure, so it can be tested.
 */

import type { Plan } from "@/lib/entitlements";

import type { AgentOffer, AgentOffers, Finding } from "./types";

/** Most agents offered at once. */
export const MAX_OFFERS = 3;

type Catalog = {
  template: string;
  title: string;
  does: string;
  name: string;
  trigger: Record<string, unknown>;
  /** Which findings show it would have something to say now. */
  kinds: Finding["kind"][];
  /** A few words beside the logos of the stocks it would speak about now. */
  hint: string;
  /** The order with nothing found: the reminders people ask for first. */
  base: number;
};

/** The offers, in our words; each is one of lib/agent-jobs.ts AGENT_TEMPLATES with its options set. */
export const OFFER_CATALOG: Catalog[] = [
  {
    template: "earnings-ahead",
    hint: "report within two weeks",
    title: "The day before a report",
    does: "A note the day before any of your stocks reports earnings.",
    name: "The day before my stocks report",
    trigger: { days_before: 1 },
    kinds: ["report"],
    base: 30,
  },
  {
    template: "mover",
    hint: "moved a lot this week",
    title: "Big moves, with the reason",
    does: "When one of your stocks makes a big move, with its reason when there is one.",
    name: "Big moves in my stocks",
    trigger: {},
    kinds: ["move", "results"],
    base: 28,
  },
  {
    template: "sec-filing",
    hint: "filed new risks lately",
    title: "Filings that matter",
    does: "When one of your companies files something big with the SEC.",
    name: "Big SEC filings from my stocks",
    trigger: { filings: { major: true } },
    kinds: ["filing"],
    base: 26,
  },
  {
    template: "call-change",
    hint: "call changed lately",
    title: "Our call changes",
    does: "When our call on one of your stocks changes, and why.",
    name: "Our call changes",
    trigger: {},
    kinds: ["call"],
    base: 20,
  },
  {
    template: "insider-trade",
    hint: "insiders traded lately",
    title: "Insider trades",
    does: "When an executive or director buys or sells one of your stocks.",
    name: "Insider trades in my stocks",
    trigger: {},
    kinds: ["insider"],
    base: 18,
  },
  {
    template: "buy-zone",
    hint: "near that price now",
    title: "Buy-more prices",
    does: "When one of your stocks closes at its buy-more price.",
    name: "Stocks reaching their buy-more level",
    trigger: {},
    kinds: ["level"],
    base: 16,
  },
];

/** What a finding of the kind it watches adds: an agent that would have spoken this week comes first. */
const FOUND_BONUS = 15;

const NUMBER_WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };

function count(n: number, noun: string): string {
  return `${NUMBER_WORDS[n] ?? n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The limit, said once: "Free runs two agents at a time, and one is on." */
export function limitWords(plan: Plan, limit: number, running: number): string {
  const name = plan === "pro" ? "Pro" : "Free";
  const full = running >= limit ? (limit === 1 ? "yours is" : limit === 2 ? "both are" : `all ${NUMBER_WORDS[limit] ?? limit} are`) : null;
  const on = running <= 0 ? "" : `, and ${full ?? `${NUMBER_WORDS[running] ?? running} ${running === 1 ? "is" : "are"}`} on`;
  return `${name} runs ${count(limit, "agent")} at a time${on}.`;
}

export type ExistingJob = { id: string; template: string; enabled: boolean; created_at: string };

export function pickOffers(input: {
  plan: Plan;
  /** How many agents the plan runs at once (limitFor("agents", plan)). */
  limit: number;
  /** Jobs switched on plus idea-basket agents switched on. */
  running: number;
  /** The person's agents that exist, on or off: a template they have is never offered again. */
  existing: readonly ExistingJob[];
  /**
   * When their first look started: an agent made from one of these offers since then is still shown, with its
   * toggle, so turning it on never makes its card disappear on the next visit.
   */
  since: string | null;
  /** Templates not offered right now (lib/agent-jobs.ts hiddenTemplateIds). */
  hidden: readonly string[];
  /** Whether the plan may run an agent of this template at all (lib/agent-jobs.ts planMayRun). */
  mayRun: (template: string) => boolean;
  /** Everything the first look found, best first (not only the cards shown): what each agent would have caught. */
  findings: ReadonlyArray<Pick<Finding, "kind" | "ticker">>;
}): AgentOffers {
  const tickersFor = (entry: Catalog) => [...new Set(input.findings.filter((finding) => entry.kinds.includes(finding.kind)).map((finding) => finding.ticker))].slice(0, 3);
  const toOffer = (entry: Catalog, job: AgentOffer["job"]): AgentOffer => ({
    template: entry.template,
    title: entry.title,
    does: entry.does,
    hint: entry.hint,
    draft: { template: entry.template, name: entry.name, trigger: entry.trigger, scope: { kind: "watchlist" } },
    tickers: tickersFor(entry),
    job,
  });
  // Set up from this first look: kept, newest per template.
  const adopted = new Map<string, ExistingJob>();
  if (input.since) {
    for (const job of [...input.existing].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (job.created_at >= input.since && OFFER_CATALOG.some((entry) => entry.template === job.template)) adopted.set(job.template, job);
    }
  }
  const kept = OFFER_CATALOG.filter((entry) => adopted.has(entry.template))
    .slice(0, MAX_OFFERS)
    .map((entry) => toOffer(entry, { id: adopted.get(entry.template)!.id, enabled: adopted.get(entry.template)!.enabled }));
  const existing = new Set(input.existing.map((job) => job.template));
  const hidden = new Set(input.hidden);
  const ranked = OFFER_CATALOG.filter((entry) => !existing.has(entry.template) && !hidden.has(entry.template) && input.mayRun(entry.template))
    .map((entry) => ({ entry, score: entry.base + (tickersFor(entry).length > 0 ? FOUND_BONUS : 0) }))
    .sort((a, b) => b.score - a.score);
  const room = Math.max(0, input.limit - Math.max(0, input.running));
  const wanted = Math.min(MAX_OFFERS - kept.length, ranked.length);
  const take = Math.min(wanted, room);
  const offers = [...kept, ...ranked.slice(0, take).map(({ entry }) => toOffer(entry, null))];
  // Said once, and only when the limit is what kept an offer out.
  const limitNote = take < wanted ? limitWords(input.plan, input.limit, input.running) : null;
  return { offers, limitNote };
}
