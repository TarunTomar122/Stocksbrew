/**
 * The replay before a basket agent switches on: the same check (lib/basket-agent/check.ts) on every market session of
 * the last four weeks, each day built only from records dated on or before it (lib/basket-agent/history.ts). Pure.
 *
 * The basket stays as the person built it through the replay: a change it would have proposed is shown on the first
 * day it would have, and repeated days of the same proposal count as one (the queue would have kept one card).
 */

import { addDays, closeOn } from "@/lib/thesis-watch/facts";

import {
  checkBasket,
  type CheckCandidate,
  type CheckLine,
  type TickerFacts,
} from "./check";
import { factsAsOf, type Series, type TickerHistory } from "./history";
import type {
  BasketChange,
  BasketDecision,
  BasketEvaluation,
  ReplaySummary,
} from "./model";
import type { ThesisKind } from "@/lib/thesis";

export const REPLAY_WEEKS = 4;

export type ReplayDay = BasketEvaluation;

export type BasketReplay = Omit<ReplaySummary, "replayed_at"> & {
  /** Every session's decision, newest first. */
  runs: ReplayDay[];
};

export type ReplayInput = {
  lines: ReadonlyArray<
    Pick<CheckLine, "ticker" | "company" | "kind" | "reason">
  >;
  kind: ThesisKind;
  candidates: readonly CheckCandidate[];
  histories: ReadonlyMap<string, TickerHistory>;
  /** The S&P 500 (SPY): its sessions are the replay's calendar. */
  market: Series | null;
  /** The last session to replay (the last settled close). */
  end: string;
  weeks?: number;
};

/** Market sessions in (from, to], from the S&P 500's own closes, or every company's when it is missing. */
export function sessionsIn(
  market: Series | null,
  histories: ReadonlyMap<string, TickerHistory>,
  from: string,
  to: string,
): string[] {
  const days = new Set<string>();
  for (const day of market?.dates ?? [])
    if (day > from && day <= to) days.add(day);
  if (days.size === 0)
    for (const history of histories.values())
      for (const day of history.series?.dates ?? [])
        if (day > from && day <= to) days.add(day);
  return [...days].sort();
}

function sameChange(
  a: BasketChange,
  b: { op: string; ticker: string },
): boolean {
  return a.op === b.op && a.ticker === b.ticker;
}

export function replayBasket(input: ReplayInput): BasketReplay {
  const weeks = input.weeks ?? REPLAY_WEEKS;
  const from = addDays(input.end, -7 * weeks);
  const sessions = sessionsIn(input.market, input.histories, from, input.end);
  const start = sessions[0] ?? input.end;
  // As if the basket was switched on the session before the window: each company joined at that close.
  const before = sessionsIn(
    input.market,
    input.histories,
    addDays(from, -10),
    from,
  );
  const joinDay = before[before.length - 1] ?? from;
  const joined = `${joinDay}T21:00:00.000Z`;
  const lines: CheckLine[] = input.lines.map((line) => ({
    ...line,
    added_at: joined,
  }));
  const savedCloses: Record<string, number | null> = {};
  for (const line of lines)
    savedCloses[line.ticker] =
      closeOn(input.histories.get(line.ticker)?.series ?? null, joinDay)
        ?.value ?? null;

  const runs: ReplayDay[] = [];
  const counts: Record<BasketDecision, number> = {
    propose: 0,
    nothing: 0,
    could_not_check: 0,
  };
  const proposals: ReplaySummary["proposals"] = [];
  let open: BasketChange[] = [];
  for (const day of sessions) {
    const facts = new Map<string, TickerFacts>();
    for (const [ticker, history] of input.histories)
      facts.set(ticker, factsAsOf(history, day, input.market));
    const run = checkBasket({
      day,
      lines,
      kind: input.kind,
      facts,
      candidates: input.candidates,
      savedCloses,
    });
    runs.push(run);
    counts[run.decision] += 1;
    for (const change of run.changes) {
      // Still waiting from the day before: the same card, one more day.
      const shown = open.some((prev) => sameChange(prev, change))
        ? [...proposals].reverse().find((entry) => sameChange(change, entry))
        : undefined;
      if (shown) shown.days += 1;
      else
        proposals.push({
          op: change.op,
          ticker: change.ticker,
          line: change.line,
          first: day,
          days: 1,
        });
    }
    // A day that could not check keeps what was waiting; any other day replaces it.
    if (run.decision !== "could_not_check") open = run.changes;
  }

  // What the replay can and cannot know, said plainly (shown as the replay line's tooltip).
  const notes = [
    "A replay, not a record.",
    "Each company's figures are the ones dated on or before each day: closes, weekly snapshots, calls, filings and headlines.",
    "The companies it could add come from today's lists, and today's screen matches are left out.",
    "The basket stays as you built it through the replay.",
  ];
  return {
    from: start,
    to: input.end,
    sessions: sessions.length,
    days: sessions,
    runs: runs.reverse(),
    proposals,
    counts,
    notes,
  };
}
