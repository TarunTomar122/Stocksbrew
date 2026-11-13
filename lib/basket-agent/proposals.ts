/**
 * Idea-basket changes as agent proposals (lib/proposals.ts): the newest check of each basket that is switched on
 * drafts "drop X" (its reason broke or played out) and "add Y" (it now fits better than the weakest company) into the
 * person's "Needs you" queue. Accepting edits the basket only (lib/basket-agent/data.ts applyBasketChange): nothing is
 * bought or sold. Pure; the reads are in lib/proposals-server.ts.
 */

import { daysFromToday, onDayWords } from "@/lib/day-words";
// lib/proposals.ts imports this module too; isWaiting is only called later, so the cycle is safe.
import {
  isWaiting,
  type Proposal,
  type ProposalAction,
  type ProposalDraft,
  type ProposalFigure,
  type ProposalSource,
} from "@/lib/proposals";

import {
  basketHref,
  instrumentIdOf,
  KIND_WORDS,
  wordCount,
  type BasketChange,
} from "./model";

/** One basket as the proposal rules read it: its companies now, and its recent checks, newest first. */
export type ProposalBasket = {
  id: string;
  name: string;
  enabled: boolean;
  tickers: string[];
  runs: Array<{
    day: string;
    ran_at: string;
    decision?: string;
    changes: BasketChange[];
  }>;
};

export type BasketEditAction = Extract<ProposalAction, { type: "basket_edit" }>;

/** A check older than this many days proposes nothing new (lib/proposals.ts EVENT_DAYS). */
const RECENT_DAYS = 5;

const TITLE_MAX = 10;

function quotedName(name: string): string {
  return `“${name}”`;
}

/** The title, with the basket's name when it fits in ten words, else "your idea basket". */
function title(op: BasketChange["op"], ticker: string, name: string): string {
  const named =
    op === "drop"
      ? `Drop ${ticker} from ${quotedName(name)}`
      : `Add ${ticker} to ${quotedName(name)}`;
  if (wordCount(named) <= TITLE_MAX) return named;
  return op === "drop"
    ? `Drop ${ticker} from your idea basket`
    : `Add ${ticker} to your idea basket`;
}

const same = (a: BasketChange, b: BasketChange) =>
  a.op === b.op && a.ticker === b.ticker;

/** The first day of the unbroken run of checks that proposed this change: one proposal per stretch, not per day. */
function since(runs: ProposalBasket["runs"], change: BasketChange): string {
  // Stored with the change since the runner kept it; older runs work it out from the ones read.
  if (change.since) return change.since;
  let first = runs[0]!.day;
  for (const run of runs) {
    if (run.decision === "could_not_check") continue;
    if (!run.changes.some((entry) => same(entry, change))) break;
    first = run.day;
  }
  return first;
}

export function basketDrafts(
  baskets: readonly ProposalBasket[] | null | undefined,
  today: string,
): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  for (const basket of baskets ?? []) {
    // The newest check that decided: a day that could not check says nothing new.
    const latest = basket.runs.find(
      (run) => run.decision !== "could_not_check",
    );
    if (!basket.enabled || !latest) continue;
    const gap = daysFromToday(latest.day, today);
    if (gap === null || gap > 0 || gap < -RECENT_DAYS) continue;
    const href = basketHref(basket.id);
    for (const change of latest.changes) {
      const has = basket.tickers.includes(change.ticker);
      if ((change.op === "drop" && !has) || (change.op === "add" && has))
        continue;
      const first = since(basket.runs, change);
      const when = onDayWords(latest.day, today) || `on ${latest.day}`;
      const kind = KIND_WORDS[change.kind].toLowerCase();
      const read: ProposalSource[] = [
        {
          label: `${quotedName(basket.name)} check`,
          at: latest.ran_at || latest.day,
          href,
        },
        change.op === "drop"
          ? {
              label: `${change.ticker} ${kind} reason check`,
              at: latest.day,
              href: `/stock/${encodeURIComponent(change.ticker)}`,
            }
          : {
              label: `${change.ticker} figures${change.fact?.versus ? ` against ${change.fact.versus.ticker}` : ""}`,
              at: latest.day,
              href: `/stock/${encodeURIComponent(change.ticker)}`,
            },
      ];
      const figures: ProposalFigure[] =
        change.op === "drop"
          ? [
              {
                label: "Reason check",
                value:
                  change.verdict === "played_out" ? "Played out" : "Broken",
              },
              { label: "Kind of reason", value: KIND_WORDS[change.kind] },
              {
                label: "Companies left",
                value: String(Math.max(0, basket.tickers.length - 1)),
              },
            ]
          : [
              ...(change.fact
                ? [
                    {
                      label: `${change.fact.label}, ${change.ticker}`,
                      value: change.fact.text,
                    },
                  ]
                : []),
              ...(change.fact?.versus
                ? [
                    {
                      label: `${change.fact.label}, ${change.fact.versus.ticker}`,
                      value: change.fact.versus.text,
                    },
                  ]
                : []),
              { label: "Its reason check", value: "Holds" },
            ];
      const action: BasketEditAction = {
        type: "basket_edit",
        basket_id: basket.id,
        basket_name: basket.name,
        op: change.op,
        ticker: change.ticker,
        company: change.company,
        kind: change.kind,
        reason: change.reason ?? null,
      };
      out.push({
        kind: change.op === "drop" ? "basket_drop" : "basket_add",
        ticker: change.ticker,
        instrument_id: instrumentIdOf(change.ticker),
        event: {
          key: `basket:${basket.id}:${change.op}:${change.ticker}:${first}`,
          kind: change.op === "drop" ? "basket_drop" : "basket_add",
          at: latest.ran_at || latest.day,
          refs: [`basket:${basket.id}`],
        },
        idea: `basket_${change.op}:${basket.id}:${change.ticker}`,
        title: title(change.op, change.ticker, basket.name),
        why:
          change.op === "drop"
            ? [
                `Its ${kind} reason ${change.verdict === "played_out" ? "played out" : "broke"} ${when}.`,
                change.line,
              ]
            : [change.line, `Your basket agent found it ${when}.`],
        does:
          change.op === "drop"
            ? `Takes ${change.ticker} out of ${quotedName(basket.name)}. Nothing is sold.`
            : `Puts ${change.ticker} in ${quotedName(basket.name)} with the reason the agent found. Nothing is bought.`,
        read,
        figures,
        action,
        // Below every proposal about the person's holdings (alerts 85, calls 75, levels 70), so a basket never crowds them out.
        priority: change.op === "drop" ? 40 : 30,
      });
    }
  }
  return out;
}

/** Why a waiting basket proposal no longer fits, or null; null too when the baskets were not read. */
export function basketStale(
  action: BasketEditAction,
  baskets: readonly ProposalBasket[] | null | undefined,
): string | null {
  if (!baskets) return null;
  const basket = baskets.find((entry) => entry.id === action.basket_id);
  if (!basket) return "basket_gone";
  const has = basket.tickers.includes(action.ticker);
  if ((action.op === "drop" && !has) || (action.op === "add" && has))
    return "basket_already";
  return null;
}

/** Whether a proposal from this basket waits in the person's queue now (what "Answer in Needs you" links to). */
export function basketWaiting(
  proposals: ReadonlyArray<
    Pick<Proposal, "status" | "expires_at" | "updated_at" | "action">
  >,
  basketId: string,
  now: Date,
): boolean {
  return proposals.some(
    (proposal) =>
      isWaiting(proposal, now) &&
      proposal.action.type === "basket_edit" &&
      proposal.action.basket_id === basketId,
  );
}
