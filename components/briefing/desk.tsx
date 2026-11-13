import * as React from "react";

import { ProposalCards } from "@/components/proposals/proposal-cards";
import { ANSWERED_SHOWN, type DeskCard } from "@/lib/briefing-desk";
import type { ProposalCard, WatchSummary } from "@/lib/proposals";

import { CheckedCards, DecidedList } from "./desk-block";

/**
 * The agent's desk at the top of the briefing (lib/briefing-desk.ts), kept to about half the first screen so the market
 * read follows it there (council, Nov 13): the proposals waiting for an answer, folded to their first row (the same
 * cards as on /agent, with their own Accept and Dismiss); what the person decided lately, a line each; the day's moves
 * and reports the agent checked and found nothing to do about, a small card each with the fact that settled it. Each
 * part is gone when it has nothing.
 */

export type DeskProps = {
  /** The waiting proposals as cards (signed in only: Accept and Dismiss need the person). */
  proposals: ProposalCard[];
  /** The agent's status: the tile that fills an odd row of proposals (never a strip above them). */
  watch?: WatchSummary | null;
  today: string;
  answered: DeskCard[];
  checked: DeskCard[];
};

/** The proposals folded to their first row (two across; one on a phone), so the market read stays on the first screen. */
const FIRST_ROW = 2;

export function Desk({ proposals, watch = null, today, answered, checked }: DeskProps) {
  if (proposals.length === 0 && answered.length === 0 && checked.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {proposals.length > 0 ? <ProposalCards initial={proposals} watch={watch} today={today} compact fold={FIRST_ROW} /> : null}
      <DecidedList cards={answered} max={ANSWERED_SHOWN} />
      <CheckedCards cards={checked} />
    </div>
  );
}
