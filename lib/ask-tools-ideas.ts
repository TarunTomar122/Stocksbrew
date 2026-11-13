import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { listJobs } from "@/lib/agent-jobs-data";
import {
  cardForModel,
  errorCard,
  round,
  roundOrNull,
  type AskCard,
  type FilingChangesCard,
  type FilingLink,
  type IdeaBasketCard,
  type IdeaBasketDecision,
  type IdeaBasketRow,
  type IdeaBasketsCard,
  type SignInCard,
  type WatchIdeaCard,
} from "@/lib/ask-cards";
import { runningBasketCount } from "@/lib/basket-agent/count";
import { listBaskets, quotesFor } from "@/lib/basket-agent/data";
import {
  BASKET_ID_RE,
  MAX_BASKETS_PER_USER,
  MAX_LINES,
  MIN_LINES,
  basketHref,
  cleanTicker,
  reasonText,
  watchIdeaHref,
} from "@/lib/basket-agent/model";
import { loadBasketDetail, loadBasketSummaries, type BasketDecisionView, type BasketSummary } from "@/lib/basket-agent/read";
import { fromIdea } from "@/lib/basket-agent/start";
import { etToday } from "@/lib/day-words";
import { limitFor, type Plan } from "@/lib/entitlements";
import type { Viewer } from "@/lib/entitlements-server";
import type { FilingRef } from "@/lib/filing-changes/diff";
import { filingChangesHref } from "@/lib/filing-changes/inbox";
import { comparisonSentence, filingName, newerLine, readFilingChangesOf } from "@/lib/filing-changes/read";
import { getFilingChanges } from "@/lib/filing-changes/server";
import { resolveInstrumentByTicker } from "@/lib/instrument-resolver";

/**
 * Ask's tools over two newer stores: what a company changed in its risk factors (lib/filing-changes) and the person's
 * idea baskets (lib/basket-agent). Every tool returns a card with a source and an as-of time, like the rest of Ask
 * (lib/ask-tools.ts).
 *
 * Plan: what a filing says is public and the same for every reader (lib/entitlements.ts rule 1: filings are never
 * gated), so get_filing_changes answers anyone, signed out too. The baskets are the person's own data: they need an
 * account, and are never gated beyond that. The only plan rule here is the agents' running limit, which watch_idea
 * states before anything is saved, the way suggest_watch states it for an agent.
 *
 * Scoping: a basket is read with the session's uid only; the model never passes a uid, and another person's basket id
 * finds nothing. Writes: none. watch_idea links to the basket editor, where the person replays the idea and saves it.
 */

export type IdeaToolContext = {
  uid: string | null;
  viewer: Viewer | null;
  now?: Date;
};

function signIn(message: string): SignInCard {
  return { card: "sign_in", message };
}

async function safeIdea(name: string, run: () => Promise<AskCard>): Promise<AskCard> {
  try {
    return await run();
  } catch (error) {
    console.error("ask_tool_failed", name, error);
    return errorCard("That lookup failed on our side. Nothing was returned, so do not guess the answer.");
  }
}

/** The signed-in person's plan, from the session's own viewer. A viewer for someone else counts as Free. */
function planOf(context: IdeaToolContext): Plan {
  return context.uid && context.viewer?.uid === context.uid ? context.viewer.plan : "free";
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* ── filing changes ─────────────────────────────────────────────────────── */

function linkOf(ref: FilingRef): FilingLink {
  return { form: ref.form, filed: ref.filed, period: ref.period, url: ref.url };
}

export async function filingChangesCard(raw: string, now: Date): Promise<AskCard> {
  const ticker = cleanTicker(raw);
  if (!ticker) return errorCard("That does not look like a ticker.");
  const today = etToday(now);
  const read = readFilingChangesOf(await getFilingChanges(ticker), today);
  if (read.kind === "none") {
    // Missing from the store and missing from the catalog are different answers; a failed catalog read says neither.
    const known = await resolveInstrumentByTicker(ticker, "US").catch(() => undefined);
    if (known === null) return errorCard(`${ticker} isn't a US stock in our catalog.`);
    return errorCard(`We haven't compared ${ticker}'s 10-K and 10-Q risk factors yet, so there is nothing to say about what it added or dropped. Do not guess.`);
  }
  if (read.kind === "unreadable") {
    return errorCard(`We couldn't read the risk section of ${read.ticker}'s ${filingName(read.filing, today)}, so there is no comparison to show. Do not guess what changed.`);
  }
  const { shown, newer, unread } = read;
  const since = newer ? newerLine(newer, today) : null;
  const newest = [shown.filing.filed, newer?.filing.filed, unread?.filed].filter((day): day is string => Boolean(day)).sort().pop()!;
  const card: FilingChangesCard = {
    card: "filing_changes",
    ticker: read.ticker,
    company: read.company,
    status: shown.status === "unreadable" ? "changes" : shown.status,
    scope: shown.scope,
    filing: linkOf(shown.filing),
    base: shown.base ? linkOf(shown.base) : null,
    headline: comparisonSentence(read.ticker, shown, today),
    added: shown.added,
    repeated: shown.repeated ?? [],
    dropped: shown.dropped,
    reworded: shown.reworded.map((pair) => ({ from: pair.from, to: pair.to })),
    unchanged: shown.same,
    since: newer && since ? { filing: linkOf(newer.filing), line: since } : null,
    unread: unread ? linkOf(unread) : null,
    source: "SEC EDGAR filings",
    as_of: newest,
    // The stock page has the section only when a comparison there changed something.
    source_url: read.onPage ? filingChangesHref(read.ticker) : `/stock/${encodeURIComponent(read.ticker)}`,
  };
  return card;
}

/* ── idea baskets ───────────────────────────────────────────────────────── */

function decisionCard(view: BasketDecisionView | null): IdeaBasketDecision | null {
  if (!view) return null;
  return { day: view.day, decision: view.decision, decision_words: view.decision_words, summary: view.summary, changes: view.changes, missing: view.missing };
}

function rowOf(summary: BasketSummary): IdeaBasketRow {
  return {
    id: summary.id,
    name: summary.name,
    idea: summary.idea,
    enabled: summary.enabled,
    paused_by_plan: summary.paused_by_plan,
    counts: summary.counts,
    needs_look: summary.companies
      .filter((company) => company.verdict === "broken" || company.verdict === "played_out" || company.verdict === "weaker")
      .slice(0, 4)
      .map((company) => ({ ticker: company.ticker, verdict: company.verdict, verdict_words: company.verdict_words, line: company.line })),
    tickers: summary.companies.map((company) => company.ticker),
    latest: decisionCard(summary.latest),
    href: summary.href,
  };
}

const BASKETS_SOURCE = "Your baskets, checked after each close";

export async function basketsCard(context: IdeaToolContext): Promise<AskCard> {
  if (!context.uid) return signIn("Sign in to ask about your idea baskets.");
  const summaries = await loadBasketSummaries(context.uid, planOf(context));
  const rows = summaries.map(rowOf);
  const days = rows.map((row) => row.latest?.day).filter((day): day is string => Boolean(day)).sort();
  return {
    card: "idea_baskets",
    total: rows.length,
    rows,
    source: BASKETS_SOURCE,
    as_of: days.pop() ?? null,
    source_url: "/agents/jobs",
  } satisfies IdeaBasketsCard;
}

export async function basketCard(context: IdeaToolContext, input: { basket_id?: string; name?: string }): Promise<AskCard> {
  if (!context.uid) return signIn("Sign in to ask about your idea baskets.");
  const plan = planOf(context);
  let id = input.basket_id?.trim().toLowerCase() ?? "";
  if (!id && input.name?.trim()) {
    // By name: the person's own baskets only, an exact name first, then one whose name contains the words.
    const wanted = input.name.trim().toLowerCase();
    const all = await listBaskets(context.uid);
    const exact = all.filter((basket) => basket.name.toLowerCase() === wanted);
    const matches = exact.length > 0 ? exact : all.filter((basket) => basket.name.toLowerCase().includes(wanted));
    const one = matches.length === 1 ? matches[0]! : null;
    if (!one) {
      return errorCard(
        matches.length > 1
          ? `Several of your baskets match "${input.name.trim()}": ${list(matches.map((basket) => `"${basket.name}"`))}. Ask which one.`
          : `You have no idea basket called "${input.name.trim()}". Call get_my_baskets to list them.`,
      );
    }
    id = one.id;
  }
  if (!id) return errorCard("Name the basket, or call get_my_baskets to list them.");
  if (!BASKET_ID_RE.test(id)) return errorCard("You have no idea basket with that id. Call get_my_baskets to list them.");
  const detail = await loadBasketDetail(context.uid, id, plan);
  if (!detail) return errorCard("You have no idea basket with that id. Call get_my_baskets to list them.");
  // Every company shows its price beside its move, as on the basket's page (quotesFor never throws).
  const quotes = await quotesFor(detail.companies.map((company) => company.ticker));
  return {
    card: "idea_basket",
    id: detail.id,
    name: detail.name,
    idea: detail.idea,
    enabled: detail.enabled,
    paused_by_plan: detail.paused_by_plan,
    counts: detail.counts,
    companies: detail.companies.map((company) => {
      const quote = quotes[company.ticker];
      return { ...company, price: quote ? round(quote.price) : null, day_change_pct: quote ? roundOrNull(quote.dayPct) : null };
    }),
    latest: decisionCard(detail.latest),
    recent: detail.recent.map((run) => ({ day: run.day, decision_words: run.decision_words, summary: run.summary })),
    replay: detail.replay,
    href: detail.href,
    source: "Your basket, checked after each close",
    as_of: detail.latest?.day ?? null,
    source_url: detail.href,
  } satisfies IdeaBasketCard;
}

/* ── watch this idea ────────────────────────────────────────────────────── */

export type WatchIdeaInput = {
  idea: string;
  tickers: string[];
  /** Why each company fits, from the answer: used only where the editor has no reviewed reason of its own. */
  reasons?: Array<{ ticker: string; reason: string }>;
};

/**
 * What saving a basket would do on the person's plan, in one sentence for before they open the editor, with the
 * editor's own rules (lib/basket-agent/data.ts createBasket): no room for another basket at all, then the running
 * limit on agents (jobs and baskets together), past which it is saved paused. Null when it would simply start. Pure.
 */
export function basketOutlook(input: { saved: number; running: number; plan: Plan }): WatchIdeaCard["outlook"] {
  if (input.saved >= MAX_BASKETS_PER_USER) {
    return { kind: "full", line: `You have ${MAX_BASKETS_PER_USER} idea baskets, the most one account can keep. Remove one to add this.` };
  }
  const limit = limitFor("agents", input.plan);
  if (input.running < limit) return null;
  const runs = limit === 1 ? "one agent" : limit === 2 ? "two agents" : `${limit} agents`;
  const plan = input.plan === "free" ? `Free runs ${runs} at a time` : `Your plan runs ${runs} at a time`;
  const on = input.running === 1 ? "you have 1 on" : `you have ${input.running} on`;
  return { kind: "paused", line: `${plan} and ${on}, so this basket would be saved paused. Pause another agent to switch it on.` };
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export async function watchIdeaCard(context: IdeaToolContext, input: WatchIdeaInput): Promise<AskCard> {
  const idea = input.idea.replace(/\s+/g, " ").trim();
  if (idea.length < 3) return errorCard("Say the idea in a few words first.");
  const asked = [...new Set(input.tickers.map(cleanTicker).filter((ticker): ticker is string => ticker !== null))].slice(0, MAX_LINES);
  if (asked.length < MIN_LINES) {
    return errorCard(`An idea basket needs at least ${MIN_LINES} companies. Call build_basket for the idea first, then pass its tickers.`);
  }
  // The editor's own starting basket for this idea and these companies: what the link opens is what the card shows.
  const start = await fromIdea(idea, asked);
  const kept = start.draft.lines.filter((line) => asked.includes(line.ticker));
  const leftOut = asked.filter((ticker) => !kept.some((line) => line.ticker === ticker));
  if (kept.length < MIN_LINES) {
    return errorCard(
      `We follow too few of those companies to watch them as a basket${leftOut.length > 0 ? `: we don't follow ${list(leftOut)}` : ""}. An agent can only check companies we follow.`,
    );
  }
  const given = new Map((input.reasons ?? []).flatMap((entry) => {
    const ticker = cleanTicker(entry.ticker);
    const reason = reasonText(entry.reason);
    return ticker && reason ? [[ticker, reason] as const] : [];
  }));
  const lines = kept.map((line) => ({ ticker: line.ticker, company: line.company, reason: line.reason || given.get(line.ticker) || "" }));
  const tickers = lines.map((line) => line.ticker);

  let existing: WatchIdeaCard["existing"] = null;
  let outlook: WatchIdeaCard["outlook"] = null;
  if (context.uid) {
    const [baskets, jobs, running] = await Promise.all([
      listBaskets(context.uid).catch(() => null),
      listJobs(context.uid).catch(() => null),
      runningBasketCount(context.uid).catch(() => null),
    ]);
    const same = baskets?.find((basket) => sameSet(basket.lines.map((line) => line.ticker), tickers)) ?? null;
    if (same) existing = { id: same.id, name: same.name, enabled: same.enabled, href: basketHref(same.id) };
    // Only when every count was read: a guess about the plan is worse than saying nothing.
    if (!same && baskets && jobs && running !== null) {
      outlook = basketOutlook({ saved: baskets.length, running: jobs.filter((job) => job.enabled).length + running, plan: planOf(context) });
    }
  }
  return {
    card: "watch_idea",
    status: existing ? "already" : "ready",
    name: start.draft.name,
    idea: start.draft.idea,
    lines,
    left_out: leftOut,
    href: watchIdeaHref({ idea: start.draft.idea, tickers }),
    existing,
    outlook,
    signed_in: Boolean(context.uid),
    source: existing ? "Your idea baskets" : "Nothing is saved until the person saves it in the basket editor",
    as_of: null,
    source_url: existing?.href ?? null,
  } satisfies WatchIdeaCard;
}

/* ── the tools ──────────────────────────────────────────────────────────── */

const TICKER = z.string().min(1).max(12).describe("US ticker, like AMD or BRK.B");

const modelView = ({ output }: { output: unknown }) => ({ type: "json" as const, value: cardForModel(output as AskCard) as never });

export function buildIdeaTools(context: IdeaToolContext): ToolSet {
  const now = () => context.now ?? new Date();
  return {
    get_filing_changes: tool({
      description:
        "What one US company added to, dropped from or reworded in the risk factors of its newest 10-K or 10-Q, against the filing before it, with the filing dates and SEC links. Every risk is the company's own heading. Use it for 'what did AMD add to its risks', 'what changed in NVDA's 10-K' or 'any new risks for TSLA'.",
      inputSchema: z.object({ ticker: TICKER }),
      execute: async ({ ticker }) => safeIdea("get_filing_changes", () => filingChangesCard(ticker, now())),
      toModelOutput: modelView,
    }),

    get_my_baskets: tool({
      description:
        "The signed-in person's idea baskets (ideas an agent checks after each close): each basket's companies, how many reasons hold or are weaker or broken, the ones that need a look, and what the latest check decided.",
      inputSchema: z.object({}),
      execute: async () => safeIdea("get_my_baskets", () => basketsCard(context)),
      toModelOutput: modelView,
    }),

    get_my_basket: tool({
      description:
        "One of the signed-in person's idea baskets in full: every company with the latest check's verdict on its reason and the fact behind it, what the check decided and proposes, the checks before it, and the replay it ran before it started. Pass the basket's id from get_my_baskets or a link, or its name.",
      inputSchema: z.object({
        basket_id: z.string().max(24).optional().describe("The basket's id, from get_my_baskets or a link"),
        name: z.string().max(60).optional().describe("The basket's name, when there is no id"),
      }),
      execute: async (input) => safeIdea("get_my_basket", () => basketCard(context, input)),
      toModelOutput: modelView,
    }),

    watch_idea: tool({
      description:
        "Offer to watch an idea already discussed in this conversation as an idea basket: an agent that checks each company's reason after every close and proposes changes. It switches nothing on: the card opens the basket editor with the idea and its companies, where the person replays the last four weeks and saves it. Call it only when the person asks to watch, follow or track an idea, after a build_basket card, with that card's tickers.",
      inputSchema: z.object({
        idea: z.string().min(3).max(400).describe("The idea in the person's own words, as build_basket took it"),
        tickers: z.array(TICKER).min(2).max(MAX_LINES).describe("The companies from the basket card"),
        reasons: z
          .array(z.object({ ticker: TICKER, reason: z.string().min(8).max(200).describe("Why it fits, one sentence, no figures") }))
          .max(MAX_LINES)
          .optional(),
      }),
      execute: async (input) => safeIdea("watch_idea", () => watchIdeaCard(context, input)),
      toModelOutput: modelView,
    }),
  };
}
