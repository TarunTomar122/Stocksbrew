"use client";

import * as React from "react";
import Link from "next/link";

import { LockCard } from "@/components/oa/gate";
import type { Plan } from "@/lib/entitlements";
import { FREE_COVERED_WORD } from "@/lib/paywall-flag";
import type { BriefingLockedMove } from "@/lib/briefing";

import { signedPct } from "./format";

/** How many uncovered moves the card names before it says "and N more". */
const NAMED = 4;

/**
 * The briefing's "rest of your stocks" line on Free: the real moves on stocks
 * the agent does not cover (prices are public), with no explanation, and the
 * two ways forward. The server only sends tickers and moves for these.
 */
export function BriefingLockedMoves({
  moves,
  plan,
  trialEligible,
  archived = false,
}: {
  moves: BriefingLockedMove[];
  plan: Plan;
  trialEligible: boolean;
  /** An earlier day's saved briefing: "that day", not "today". */
  archived?: boolean;
}) {
  if (plan === "pro" || moves.length === 0) return null;
  const named = moves.slice(0, NAMED);
  const more = moves.length - named.length;
  const verb = moves.length === 1 ? "moved" : moves.length === 2 ? "both moved" : "all moved";
  const when = archived ? "that day" : "today";
  const body = (
    <>
      {named.map((move, index) => (
        <React.Fragment key={move.ticker}>
          {index > 0 ? (index === named.length - 1 && more === 0 ? " and " : ", ") : null}
          <Link prefetch={false} href={`/stock/${encodeURIComponent(move.ticker)}`} className="whitespace-nowrap text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
            <span className="oa-mono font-semibold">{move.ticker}</span>{" "}
            <span className={`oa-mono tabular-nums ${move.day_change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{signedPct(move.day_change_pct, 1)}</span>
          </Link>
        </React.Fragment>
      ))}
      {more > 0 ? `, and ${more} more` : ""}
      {` ${verb} enough to matter ${when}. Your agent explains the ${FREE_COVERED_WORD} stocks it covers for you. ${moves.length === 1 ? "Swap it in" : "Swap one of these in"} (one swap a week on Free), or go Pro and it explains every stock you own.`}
    </>
  );
  return (
    <LockCard
      feature="briefing_personal"
      plan={plan}
      trialEligible={trialEligible}
      title={moves.length === 1 ? `One more of your stocks moved ${when}` : "The rest of your stocks moved too"}
      body={body}
      stacked
    />
  );
}
