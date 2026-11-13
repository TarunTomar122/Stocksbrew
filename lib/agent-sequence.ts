/**
 * One real proposal as the landing's "agent at work" strip: what happened, what the agent checked, what it drafted,
 * your decision, and what comes next. Pure: the proposal comes from the proposal engine (lib/proposals.ts
 * `candidates`), run over the example portfolio by lib/agent-sequence-server.ts. Every figure here is one the engine
 * read, each with the day or time it is from. Nothing is made up and nothing is worded by a model.
 */

import { capitalize, dayPossessive, etDayOf, weekdayName } from "@/lib/day-words";
import type { AgentCall } from "@/lib/agent-jobs";
import { latestPrice, usd, type ProposalAction, type ProposalDraft, type ProposalInputs, type ProposalKind, type ProposalLevel } from "@/lib/proposals";

/** A figure the strip shows: what it is, its value, and the day or time it is from (with its source, for a hover). */
export type SequenceFigure = { label: string; value: string; asOf: string; source: string; tone?: "up" | "down" | null };

export type AgentSequence = {
  ticker: string;
  kind: ProposalKind;
  /** The New York day of the event (YYYY-MM-DD). */
  day: string;
  /** The New York day the strip was worked out on. */
  today: string;
  /** The proposal as the engine titled it (the hover and the screen reader's line). */
  title: string;
  /** The step's label, at most four words ("Tuesday's move"), and the one figure that says what happened. */
  event: { label: string; figure: SequenceFigure | null };
  /** Two or three figures the agent weighed. */
  checked: SequenceFigure[];
  /** "Proposed alert" and its price ("$158"). */
  proposal: { label: string; value: string; actionType: ProposalAction["type"]; level: ProposalLevel | null };
  /** What accepting would do, in the engine's words. */
  does: string;
  /**
   * When the agents check next ("Next check", "Fri after the close"; a real weekday, never "tomorrow", which would go
   * stale in the cache), or when they last checked; and the price now.
   */
  next: { label: string; when: string; price: number | null; dayPct: number | null; at: string | null };
  /** The example agents' last few market days, oldest first: whether any run that day found something. */
  runs: SequenceRunDay[];
  /** The New York day of the next check, when the agents are proven to be running. */
  nextDay: string | null;
};

export type SequenceRunDay = { day: string; found: boolean };

/** How many past run days the strip shows. */
export const RUN_DAYS_SHOWN = 4;

/** The agents' runs as one mark per day, newest RUN_DAYS_SHOWN days, oldest first; a day counts as found when any run notified. */
export function runDaysOf(runs: ReadonlyArray<{ day: string; decision: string }>): SequenceRunDay[] {
  const days = new Map<string, boolean>();
  for (const run of runs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(run.day) || run.decision === "could_not_check") continue;
    days.set(run.day, (days.get(run.day) ?? false) || run.decision === "notify");
  }
  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-RUN_DAYS_SHOWN)
    .map(([day, found]) => ({ day, found }));
}

/**
 * The kinds the strip can tell on one stock with a level to draw. Not a report coming up: the engine reads only its date
 * and usual move for it, too little for a step of checks.
 */
const SEQUENCE_KINDS = new Set<ProposalKind>(["results", "big_move", "call_change", "level_reached", "alert_hit"]);

const fits = (draft: ProposalDraft) => Boolean(draft.ticker && SEQUENCE_KINDS.has(draft.kind) && draft.level);

/** The strongest proposal the strip can show: the engine's own order (priority, then newest), on a stock, with a level. */
export function pickSequenceDraft(drafts: ProposalDraft[]): ProposalDraft | null {
  return drafts.find(fits) ?? null;
}

/** The strongest proposal that makes a whole strip, so one that cannot (too few checks) gives way to the next. */
export function firstSequence(drafts: ProposalDraft[], context: SequenceContext): AgentSequence | null {
  for (const draft of drafts) {
    if (!fits(draft)) continue;
    const sequence = sequenceOf(draft, context);
    if (sequence) return sequence;
  }
  return null;
}

const LEVEL_LABELS = ["Buy-more level", "Sell-some level", "60-day low", "60-day high"];

/**
 * Whether the strip may show a figure under our call (owner rule 9: a call shows only its own level). Buy more shows its
 * buy-more level, Sell some its sell-some level, Keep neither; the 60-day low and high are the price's, not the call's.
 */
export function callAllows(label: string, call: AgentCall | null): boolean {
  if (label === "Buy-more level") return call === "Add";
  if (label === "Sell-some level") return call === "Trim";
  return true;
}

/** The level's name: the figure with the same value ("Buy-more level"), so "$33.66" reads as what it is; never one the call hides. */
function levelName(draft: ProposalDraft, call: AgentCall | null): string | null {
  if (!draft.level) return null;
  const value = usd(draft.level.price);
  return draft.figures.find((figure) => LEVEL_LABELS.includes(figure.label) && callAllows(figure.label, call) && figure.value === value)?.label ?? null;
}

/** The source a figure came from, by its label, among the sources the engine read. */
function sourceOf(label: string, draft: ProposalDraft, today: string, levelsAsOf: string | null): { source: string; at: string } {
  // A call's level is as of the day it was set (tm_call_stability `levels.set_on`), whatever else the engine read.
  if (/level$/.test(label) && levelsAsOf && draft.ticker) return { source: `Our call on ${draft.ticker}`, at: levelsAsOf };
  const find = (re: RegExp) => draft.read.find((source) => re.test(source.label));
  const pick =
    /^(Price|Today)$/.test(label) ? find(/latest price|last close/i)
    : /60-day/.test(label) ? find(/daily closes/i)
    : /Earnings per share/.test(label) ? find(/earnings against the estimate/i)
    : /^Revenue/.test(label) ? find(/revenue/i)
    : /Guidance/.test(label) ? find(/outlook/i)
    : /^Move/.test(label) ? find(/move on the report|story/i)
    : /level|^Call/.test(label) ? find(/^Our call on/)
    : /Report|When|Usual move/.test(label) ? find(/earnings calendar/i)
    : undefined;
  // The close that crossed is the event itself, on its own day.
  if (label === "Close that crossed") return { source: find(/daily closes/i)?.label ?? `${draft.ticker} daily closes`, at: draft.event.at };
  if (pick) return { source: pick.label, at: pick.at };
  // Our call's levels are read as they stand today (tm_call_stability), with no source line of their own on a drop.
  if (/level|^Call/.test(label) && draft.ticker) return { source: `Our call on ${draft.ticker}`, at: levelsAsOf ?? today };
  // Nothing read matches: the event's day, and no source rather than a wrong one.
  return { source: "", at: draft.event.at };
}

function figure(draft: ProposalDraft, label: string, today: string, levelsAsOf: string | null = null): SequenceFigure | null {
  const found = draft.figures.find((entry) => entry.label === label);
  if (!found) return null;
  const { source, at } = sourceOf(label, draft, today, levelsAsOf);
  const tone = /^[+−-]\d/.test(found.value) ? (found.value.startsWith("+") ? "up" : "down") : null;
  return { label: found.label, value: found.value, asOf: at, source, tone };
}

/** What happened, as a label of at most four words ("Tuesday's move"), and the one figure that says it. */
function eventOf(draft: ProposalDraft, day: string, today: string): { words: string; figureLabel: string | null; alsoShown: string[] } {
  const on = capitalize(dayPossessive(day, today));
  const has = (label: string) => draft.figures.some((entry) => entry.label === label);
  switch (draft.kind) {
    case "results": {
      const cut = draft.figures.some((entry) => entry.label === "Guidance" && entry.value === "Lowered");
      // A cut with no move read yet: the guidance is the figure, and the checks do not say it again.
      const figureLabel = has("Move on the report") ? "Move on the report" : cut ? "Guidance" : null;
      return { words: cut ? `${on} guidance cut` : `${on} results`, figureLabel, alsoShown: cut ? ["Guidance"] : [] };
    }
    case "big_move":
      return { words: `${on} move`, figureLabel: "Move", alsoShown: [] };
    case "call_change":
      return { words: `${on} call change`, figureLabel: "Call now", alsoShown: [] };
    case "level_reached":
      return { words: `${on} close`, figureLabel: "Close that crossed", alsoShown: [] };
    case "alert_hit":
      return { words: `${on} alert`, figureLabel: "Price", alsoShown: [] };
    default:
      return { words: "What happened", figureLabel: null, alsoShown: [] };
  }
}

/** The proposal as a label of at most four words, and the price it is about. */
function proposalOf(draft: ProposalDraft & { level: ProposalLevel }): { label: string; value: string } {
  const action = draft.action;
  if (action.type === "practice_ticket") return { label: action.side === "buy" ? "Proposed practice buy" : "Proposed practice sale", value: usd(draft.level.price) };
  return { label: "Proposed alert", value: usd(draft.level.price) };
}

/** Two or three figures the agent weighed, leaving out the ones the other steps already show. */
function checkedOf(
  draft: ProposalDraft,
  event: { figureLabel: string | null; alsoShown: string[] },
  call: AgentCall | null,
  today: string,
  levelsAsOf: string | null,
): SequenceFigure[] {
  const eventLabel = event.figureLabel;
  const levelValue = draft.level ? usd(draft.level.price) : null;
  // A level the call does not show counts as shown already: it is left out everywhere.
  const shownElsewhere = new Set([
    "New alert",
    "Price",
    "Today",
    ...(eventLabel ? [eventLabel] : []),
    ...event.alsoShown,
    ...draft.figures.filter((entry) => !callAllows(entry.label, call)).map((entry) => entry.label),
  ]);
  const primary = draft.figures.filter((entry) => !shownElsewhere.has(entry.label) && entry.value !== levelValue).map((entry) => entry.label);
  // Too few: the price it was weighed against, then the level itself (shown again in the proposal), so the step always
  // has two figures when the engine read two.
  const spare = (entry: { label: string }) => !primary.includes(entry.label) && (entry.label === "Price" ? eventLabel !== "Price" : !shownElsewhere.has(entry.label));
  const extra = [
    ...draft.figures.filter((entry) => spare(entry) && entry.label === "Price"),
    ...draft.figures.filter((entry) => spare(entry) && entry.label !== "Price" && entry.value === levelValue),
  ].map((entry) => entry.label);
  const labels = primary.length >= 2 ? primary : [...primary, ...extra].slice(0, 2);
  return labels
    .slice(0, 3)
    .map((label) => figure(draft, label, today, levelsAsOf))
    .filter((entry): entry is SequenceFigure => entry !== null);
}

/**
 * The last step: the agents' next check by its weekday ("Fri after the close"), or, when they are not proven to be
 * running, the day they last checked; null with neither. A weekday, not "tomorrow": the strip is cached.
 */
function nextOf(nextCheck: string | null, runs: SequenceRunDay[]): { label: string; when: string } | null {
  const short = (day: string) => weekdayName(day).slice(0, 3);
  if (nextCheck && short(nextCheck)) return { label: "Next check", when: `${short(nextCheck)} after the close` };
  const last = runs[runs.length - 1];
  return last && short(last.day) ? { label: "Last check", when: `${short(last.day)} after the close` } : null;
}

const dollars = (value: string): number | null => {
  const parsed = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The 60-day low and high come from daily closes (lib/proposals.ts closesOf), the price from the live quote, so the price
 * can sit past a low that closed today. Say so: "60-day closing low", and "Price, under it" when it is.
 */
function closingWords(checked: SequenceFigure[]): SequenceFigure[] {
  const low = checked.find((entry) => entry.label === "60-day low");
  const high = checked.find((entry) => entry.label === "60-day high");
  return checked.map((entry) => {
    if (entry === low) return { ...entry, label: "60-day closing low" };
    if (entry === high) return { ...entry, label: "60-day closing high" };
    if (entry.label !== "Price") return entry;
    const price = dollars(entry.value);
    const lowValue = low ? dollars(low.value) : null;
    const highValue = high ? dollars(high.value) : null;
    if (price !== null && lowValue !== null && price < lowValue) return { ...entry, label: "Price, under it" };
    if (price !== null && highValue !== null && price > highValue) return { ...entry, label: "Price, over it" };
    return entry;
  });
}

export type SequenceContext = {
  inputs: ProposalInputs;
  today: string;
  /** The New York day of the agents' next check, or null when they are not proven to be running. */
  nextCheck: string | null;
  /** The agents' runs, any order. */
  runs?: ReadonlyArray<{ day: string; decision: string }>;
  /** The day each stock's call levels were set (tm_call_stability `levels.set_on`), by ticker. */
  levelsAsOf?: Record<string, string>;
};

export function sequenceOf(draft: ProposalDraft, context: SequenceContext): AgentSequence | null {
  const ticker = draft.ticker;
  const day = etDayOf(draft.event.at);
  if (!ticker || !day) return null;
  const { today, inputs } = context;
  const event = eventOf(draft, day, today);
  const eventFigure = event.figureLabel ? figure(draft, event.figureLabel, today) : null;
  // A call that could not be read shows none of its levels.
  const call = inputs.calls?.[ticker]?.call ?? null;
  const checked = checkedOf(draft, event, call, today, context.levelsAsOf?.[ticker] ?? null);
  const point = latestPrice(inputs, ticker);
  if (!eventFigure || checked.length < 2 || !point || !draft.level) return null;
  const quote = inputs.quotes?.[ticker] ?? null;
  // The marks run up to the next check, never past it: today's mark gives way when the next check is today.
  const runs = runDaysOf((context.runs ?? []).filter((run) => !context.nextCheck || run.day < context.nextCheck));
  const next = nextOf(context.nextCheck, runs);
  if (!next) return null;
  const level = draft.level;
  return {
    ticker,
    kind: draft.kind,
    day,
    today,
    title: draft.title,
    event: { label: event.words, figure: eventFigure },
    checked: closingWords(checked),
    proposal: { ...proposalOf({ ...draft, level }), actionType: draft.action.type, level: { price: level.price, label: levelName(draft, call) ?? level.label } },
    does: draft.does,
    next: { ...next, price: point.price, dayPct: point.source === "quote" ? quote?.dayPct ?? null : null, at: point.at },
    runs,
    nextDay: context.nextCheck,
  };
}
