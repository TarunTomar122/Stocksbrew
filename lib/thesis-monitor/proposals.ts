/**
 * "Review your thesis" as an agent proposal (lib/proposals.ts). When a thesis's latest check broke a line on a stock
 * the person holds, or moved the thesis to a worse status, the agent drafts one safe step: a price alert under the
 * company that broke it, at the next meaningful level, with the thesis page (the evidence) first in "How I got here".
 * Nothing is bought or sold, and the thesis itself is not changed.
 *
 * Within the queue's rules: a thesis is a basket, so its proposals share the basket cap (one per basket, two baskets in
 * all, lib/proposals.ts pickProposals); one held company ranks with the holding proposals' alerts (60, under a broken
 * reason, a fired alert, results, a call change, a level or a big move), one the person does not hold ranks below
 * every holding proposal (35). The alert idea is the same as any other alert on that stock, so its cooldown applies.
 * Pure; the reads are in lib/thesis-monitor/data.ts readProposalTheses.
 */

import { daysFromToday } from "@/lib/day-words";
// lib/proposals.ts imports this module too; its helpers are only called later, so the cycle is safe.
import {
  alertAction,
  alertDoes,
  alertUnder,
  latestPrice,
  levelBelow,
  levelFigures,
  priceFigures,
  priceSource,
  seriesSource,
  usd,
  type ProposalDraft,
  type ProposalFigure,
  type ProposalInputs,
  type ProposalQuote,
  type ProposalSource,
} from "@/lib/proposals";

import { STATUS_RANK, STATUS_WORDS, thesisHref, wordCount, type ThesisEvent, type ThesisState } from "./model";

/** A check older than this many days asks for nothing new (lib/proposals.ts EVENT_DAYS). */
export const THESIS_RECENT_DAYS = 5;
/** Priorities: a held company with the holding alerts; one not held under every holding proposal. */
export const HELD_PRIORITY = 60;
export const OTHER_PRIORITY = 35;

export type ProposalThesis = {
  id: string;
  name: string;
  enabled: boolean;
  state: Pick<ThesisState, "day" | "checked_at" | "status" | "status_since" | "previous_status" | "counts" | "affected" | "events">;
  /** Prices of affected companies the person does not track (their tracked ones come with the inputs). */
  quotes: Record<string, ProposalQuote>;
};

function recent(day: string | null | undefined, today: string): boolean {
  if (!day) return false;
  const gap = daysFromToday(day, today);
  return gap !== null && gap <= 0 && gap >= -THESIS_RECENT_DAYS;
}

function quoted(name: string): string {
  return `“${name}”`;
}

/** "“AI infrastructure” is under strain: 5 of 6 lines hold." (or "Your thesis …" when the name will not fit). */
function statusLine(thesis: ProposalThesis): string {
  const { status, counts } = thesis.state;
  const verb = status === "holds" ? "still holds" : `is ${STATUS_WORDS[status].toLowerCase()}`;
  const tail = `${verb}: ${counts.holds} of ${counts.lines} lines hold.`;
  const named = `${quoted(thesis.name)} ${tail}`;
  return wordCount(named) <= 15 ? named : `Your thesis ${tail}`;
}

type Trigger = { key: string; ticker: string; evidence: ThesisEvent | null };

/** What asks for a review, strongest first: a broken line on a holding, then a worse status. Null when nothing does. */
export function triggerOf(thesis: ProposalThesis, held: ReadonlySet<string>, today: string): Trigger | null {
  const { state } = thesis;
  if (!recent(state.day, today)) return null;
  const news = state.events.filter((event) => !event.baseline && recent(event.day, today));
  const brokeOnHolding = news.find((event) => event.verdict === "broken" && event.ticker && held.has(event.ticker));
  if (brokeOnHolding) return { key: `thesis:${thesis.id}:line:${brokeOnHolding.key}`, ticker: brokeOnHolding.ticker!, evidence: brokeOnHolding };
  const worse = state.previous_status !== null && STATUS_RANK[state.status] > STATUS_RANK[state.previous_status] && (state.status === "strain" || state.status === "broken");
  if (!worse || !recent(state.status_since, today)) return null;
  // Only with dated evidence on an affected company (a line that broke on a new figure, a new filing): a status the
  // person moved with their own edit, or one that rests on what was on file, asks for nothing.
  const proof = (ticker: string) => news.find((event) => event.ticker === ticker && (event.verdict === "broken" || event.kind === "filing")) ?? null;
  const ticker = state.affected.find((entry) => held.has(entry) && proof(entry)) ?? state.affected.find((entry) => proof(entry));
  if (!ticker) return null;
  return { key: `thesis:${thesis.id}:status:${state.status}:${state.status_since}`, ticker, evidence: proof(ticker) };
}

export function thesisDrafts(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  // Without the person's alerts there is no knowing whether one is already set: no alert proposal at all.
  if (!inputs.alerts) return out;
  const held = new Set(inputs.stocks.filter((stock) => stock.position === "holding").map((stock) => stock.ticker));
  for (const thesis of inputs.theses ?? []) {
    if (!thesis.enabled) continue;
    const trigger = triggerOf(thesis, held, inputs.today);
    if (!trigger) continue;
    const ticker = trigger.ticker;
    // The person's own quotes first; a company they do not track brings its own.
    const local: ProposalInputs = { ...inputs, quotes: { ...thesis.quotes, ...(inputs.quotes ?? {}) } };
    const point = latestPrice(local, ticker);
    if (!point) continue;
    const next = levelBelow(local, ticker, point.price);
    const replaces = alertUnder(local, ticker, point.price, next);
    if (replaces === false) continue;
    const { state } = thesis;
    const evidence = trigger.evidence;
    const title = replaces ? `Review your thesis: move ${ticker}'s alert to ${usd(next.price)}` : `Review your thesis: set an alert on ${ticker} at ${usd(next.price)}`;
    const read: ProposalSource[] = [
      { label: `${quoted(thesis.name)} thesis check`, at: state.checked_at || state.day, href: thesisHref(thesis.id) },
      ...(evidence ? [{ label: evidence.source || `${ticker} figures`, at: evidence.at, href: evidence.href }] : []),
      priceSource(ticker, point),
      ...seriesSource(local, ticker),
    ];
    const figures: ProposalFigure[] = [
      { label: "Thesis", value: STATUS_WORDS[state.status] },
      { label: "Lines that hold", value: `${state.counts.holds} of ${state.counts.lines}` },
      ...priceFigures(ticker, point, local),
      ...(replaces ? [{ label: "Your alert (below)", value: usd(replaces.price!) }] : []),
      ...levelFigures(local, ticker, "below"),
      { label: "New alert", value: usd(next.price) },
    ];
    out.push({
      kind: "thesis_review",
      ticker,
      instrument_id: `US_${ticker.replace(/[.\-]/g, "_")}`,
      event: { key: trigger.key, kind: "thesis_review", at: evidence?.at || state.status_since, refs: [`basket:${thesis.id}`, `thesis:${thesis.id}:${state.day}`] },
      idea: `alert:${ticker}:below:${next.price}`,
      title,
      why: [...(evidence ? [evidence.text] : []), statusLine(thesis)],
      does: alertDoes(ticker, "below", next.price, replaces),
      read,
      figures,
      action: alertAction(ticker, `US_${ticker.replace(/[.\-]/g, "_")}`, "below", next.price, replaces),
      priority: held.has(ticker) ? HELD_PRIORITY : OTHER_PRIORITY,
    });
  }
  return out;
}

/** The basket a thesis proposal comes from (its event names it), for the queue's basket cap; null for any other. */
export function thesisBasketOf(entry: { kind?: string; event?: { refs?: readonly string[] } }): string | null {
  if (entry.kind !== "thesis_review") return null;
  const ref = entry.event?.refs?.find((value) => value.startsWith("basket:"));
  return ref ? ref.slice("basket:".length) : null;
}
