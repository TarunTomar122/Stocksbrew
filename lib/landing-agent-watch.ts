/**
 * The landing's "Tell it what to watch, in plain English": up to six cards, each a request someone could type and what
 * the agent sent back, worked out from stored data on the public example portfolio and a theme. Pure: the reads live
 * in ./landing-agent-watch-server.ts. Every request maps to something the agent really does (an agent template in
 * lib/agent-jobs.ts, a measurable line, an idea basket, a thesis, or the filing check it runs on every holding).
 *
 * - Earnings ahead: the next report among the example portfolio's holdings (the earnings-ahead template's own rule).
 * - A big move: the example portfolio's own big-move agent's latest run that found one (tm_agent_runs).
 * - A filing change: the newest 10-K or 10-Q among the example and showcase stocks that added (or dropped) a risk,
 *   quoting the company's own heading when it fits a card line (lib/filing-changes).
 * - A measurable reason: one of the example portfolio's made-up lines ("Holds if revenue growth > 40%") judged on the
 *   real stored figure by the conditions engine (lib/thesis-watch/conditions.ts), the one with the newest report.
 * - A replay: a theme's basket replayed over the last four weeks by the basket agent's own replay (lib/basket-agent).
 * - A thesis: the same made-up lines as one thesis, rolled up the way the thesis monitor does (lib/thesis-monitor).
 *
 * The lines and the thesis are examples, and the section says so; every figure, filing and replay day is real. A card
 * with nothing real to show is left out, never filled in.
 */

import { onDayWords } from "@/lib/day-words";
import { addDays } from "@/lib/thesis-watch/facts";
import type { Comparison } from "@/lib/filing-changes/diff";
import { viewOf, type FilingChangesDoc } from "@/lib/filing-changes/store";
import { quote } from "@/lib/filing-changes/words";
import {
  barScale,
  formatValue,
  holdsIfText,
  shortDay,
  wordCount,
  type BarScale,
  type Condition,
  type ConditionResult,
} from "@/lib/thesis-watch/conditions";

/** A card line's word budget (docs/owner-design-rules.md rule 8). */
export const CARD_WORDS = 15;

/* ── the example lines ──────────────────────────────────────────────────── */

/**
 * Made-up measurable lines on the example portfolio's holdings (lib/portfolio-data.ts), set where a person might set
 * them: a round number under where each figure has run. They are judged on the real stored figures, nothing is written.
 */
export const EXAMPLE_LINES: ReadonlyArray<{ ticker: string; condition: Condition }> = [
  { ticker: "NVDA", condition: { metric: "revenue_growth", op: "above", value: 40 } },
  { ticker: "MSFT", condition: { metric: "revenue_growth", op: "above", value: 15 } },
  { ticker: "AAPL", condition: { metric: "gross_margin", op: "above", value: 45 } },
  { ticker: "COST", condition: { metric: "revenue_growth", op: "above", value: 5 } },
];

/** The example thesis those lines make up, and the day it was "written" (risks filed before it are context). */
export const EXAMPLE_THESIS = { name: "My big names keep growing", savedAt: "2026-06-22" } as const;

/** The theme whose basket is replayed. */
export const REPLAY_THEME = "ai-capex";

/* ── the cards ──────────────────────────────────────────────────────────── */

export type FilingCard = {
  kind: "filing";
  ticker: string;
  form: string;
  filed: string;
  url: string;
  op: "added" | "dropped";
  count: number;
  /** The company's own heading, whole or cut to a clause, within the card's word budget. */
  quote: string;
};

export type LineCard = {
  kind: "line";
  ticker: string;
  condition: Condition;
  /** "Holds if gross margin > 45%". */
  holdsIf: string;
  holds: boolean;
  now: number;
  nowText: string;
  /** "Q4 report, Nov 2", or the figure's day when it is not a report figure. */
  when: string;
  scale: BarScale;
  source: string;
};

export type ReplayCard = {
  kind: "replay";
  name: string;
  slug: string;
  from: string;
  to: string;
  /** One mark per market day, oldest first: true where the agent would have proposed a change. */
  marks: boolean[];
  /** The days it could check (a day with no figures is not counted as quiet). */
  checked: number;
  changeDays: number;
  /** The changes it would have proposed, each once, in order. */
  changes: Array<{ op: "drop" | "add"; ticker: string }>;
  line: string;
};

export type ThesisCardStatus = "holds" | "strain" | "broken" | "waiting";

export type ThesisCard = {
  kind: "thesis";
  name: string;
  status: ThesisCardStatus;
  lines: number;
  holds: number;
  broke: number;
  /** Each company once, with whether its line holds and whether its latest filing added risks. */
  companies: Array<{ ticker: string; status: "holds" | "broken" | "unknown"; risk: boolean }>;
  line: string;
};

export type EarningsCard = {
  kind: "earnings";
  ticker: string;
  /** YYYY-MM-DD of the report. */
  date: string;
  time: "bmo" | "amc" | "during" | null;
};

export type MoveCard = {
  kind: "move";
  ticker: string;
  /** The day's move, in percent. */
  pct: number;
  /** YYYY-MM-DD of the move. */
  day: string;
  /** The agent's own sentence ("NVDA fell 5.47% in a day"). */
  headline: string;
  /** YYYY-MM-DD of the agent's run that flagged it. */
  ranOn: string;
};

export type WatchCard = EarningsCard | MoveCard | FilingCard | LineCard | ReplayCard | ThesisCard;

/* ── the requests ───────────────────────────────────────────────────────── */

/** "Tell me if AAPL's gross margin drops under 45%.": the line as a person would ask for it. */
export function lineAsk(ticker: string, condition: Condition): string {
  const words: Record<Condition["metric"], string> = {
    revenue_growth: "revenue growth",
    gross_margin: "gross margin",
    operating_margin: "operating margin",
    eps_surprise: "earnings beat",
    dividend: "dividend",
    price: "price",
    pe: "P/E",
  };
  return `Tell me if ${ticker}'s ${words[condition.metric]} ${condition.op === "above" ? "drops under" : "rises over"} ${formatValue(condition.metric, condition.value)}.`;
}

/** What each card's person asked for, in their words (the line card's depends on its line). */
export function askOf(card: WatchCard): string {
  switch (card.kind) {
    case "earnings":
      return "Warn me a few days before my stocks report.";
    case "move":
      return "Tell me when one of my stocks moves 5% in a day.";
    case "filing":
      return "Tell me when a company I own adds a new risk.";
    case "line":
      return lineAsk(card.ticker, card.condition);
    case "replay":
      return `Watch my ${card.name} idea and tell me what to change.`;
    case "thesis":
      return "Tell me if my big-names thesis starts to crack.";
  }
}

/* ── earnings ahead and the big move ────────────────────────────────────── */

/** How far ahead a report may be and still be the card's (the agent warns a few days before; two weeks shows what's next). */
export const EARNINGS_AHEAD_DAYS = 14;

/** The holding that reports next, from today to EARNINGS_AHEAD_DAYS ahead; null when none does. */
export function pickEarningsCard(
  positions: ReadonlyArray<{ ticker: string; kind: string; nextEarnings: { date: string; time: EarningsCard["time"] } | null }>,
  today: string,
): EarningsCard | null {
  const next = positions
    .filter((entry) => entry.kind === "holding" && entry.nextEarnings && entry.nextEarnings.date >= today && entry.nextEarnings.date <= addDays(today, EARNINGS_AHEAD_DAYS))
    .sort((a, b) => a.nextEarnings!.date.localeCompare(b.nextEarnings!.date) || a.ticker.localeCompare(b.ticker))[0];
  return next ? { kind: "earnings", ticker: next.ticker, date: next.nextEarnings!.date, time: next.nextEarnings!.time } : null;
}

const SESSION: Record<NonNullable<EarningsCard["time"]>, string> = { bmo: "before the open", amc: "after the close", during: "during the day" };

/** "NVDA reports on Tuesday, after the close." */
export function earningsSentence(card: EarningsCard, today: string): string {
  const when = onDayWords(card.date, today);
  return `${card.ticker} reports ${when}${card.time ? `, ${SESSION[card.time]}` : ""}.`;
}

/** The newest run that found a move: its biggest measured move. */
export function pickMoveCard(
  runs: ReadonlyArray<{ day: string; decision: string; findings: ReadonlyArray<{ ticker?: string | null; headline: string; change_pct?: number | null; at?: string | null }> }>,
): MoveCard | null {
  for (const run of [...runs].sort((a, b) => b.day.localeCompare(a.day))) {
    if (run.decision !== "notify") continue;
    const found = run.findings
      .filter((finding) => finding.ticker && typeof finding.change_pct === "number" && Number.isFinite(finding.change_pct))
      .sort((a, b) => Math.abs(b.change_pct!) - Math.abs(a.change_pct!))[0];
    if (found) {
      const day = /^\d{4}-\d{2}-\d{2}/.exec(found.at ?? "")?.[0] ?? run.day;
      return { kind: "move", ticker: found.ticker!.toUpperCase(), pct: found.change_pct!, day, headline: found.headline.replace(/\.$/, ""), ranOn: run.day };
    }
  }
  return null;
}

/* ── the filing change ──────────────────────────────────────────────────── */

const fits = (text: string) => wordCount(text) <= CARD_WORDS;

/** The first heading of a list that can be quoted within the budget, or null. */
function quotable(headings: readonly string[]): string | null {
  for (const heading of headings) {
    // Two words go to the quote marks' line around it, so the quote itself stays a little under the budget.
    const quoted = quote(heading, CARD_WORDS);
    if (quoted.fits && fits(quoted.text)) return quoted.text;
  }
  return null;
}

/**
 * The newest comparison the stock page shows (lib/filing-changes/store.ts viewOf) that added a risk with a quotable
 * heading, newest filing first, ties by ticker. Null when none can be quoted (the request is about a new risk, so a
 * dropped one never stands in).
 */
export function pickFilingCard(docs: readonly FilingChangesDoc[], today: string): FilingCard | null {
  const shown = docs
    .map((doc) => ({ doc, view: viewOf(doc, today) }))
    .filter((entry): entry is { doc: FilingChangesDoc; view: NonNullable<ReturnType<typeof viewOf>> } => entry.view !== null)
    .sort((a, b) => b.view.shown.filing.filed.localeCompare(a.view.shown.filing.filed) || a.doc.ticker.localeCompare(b.doc.ticker));
  const card = (doc: FilingChangesDoc, comparison: Comparison, op: FilingCard["op"], text: string): FilingCard => ({
    kind: "filing",
    ticker: doc.ticker,
    form: comparison.filing.form,
    filed: comparison.filing.filed,
    url: comparison.filing.url,
    op,
    count: op === "added" ? comparison.added.length : comparison.dropped.length,
    quote: text,
  });
  for (const { doc, view } of shown) {
    const added = quotable(view.shown.added);
    if (added) return card(doc, view.shown, "added", added);
  }
  return null;
}

/* ── the measurable line ────────────────────────────────────────────────── */

function whenOf(result: ConditionResult): string {
  if (result.report) return `${result.report.quarter ? `${result.report.quarter} report` : "report"}, ${shortDay(result.report.date)}`;
  return result.asOf ? shortDay(result.asOf) : "";
}

/**
 * The example line with the newest judged figure (a report figure by its report's day), when it holds or broke on a
 * real figure. A line still waiting for its figure is not shown.
 */
export function pickLineCard(judged: ReadonlyArray<{ ticker: string; result: ConditionResult }>): LineCard | null {
  const ready = judged
    .filter(({ result }) => result.status !== "unknown" && result.now !== null && result.nowText !== null)
    .sort((a, b) => (b.result.report?.date ?? b.result.asOf ?? "").localeCompare(a.result.report?.date ?? a.result.asOf ?? "") || a.ticker.localeCompare(b.ticker));
  const first = ready[0];
  if (!first) return null;
  const { result } = first;
  return {
    kind: "line",
    ticker: first.ticker,
    condition: result.condition,
    holdsIf: holdsIfText(result.condition),
    holds: result.status === "holds",
    now: result.now!,
    nowText: result.nowText!,
    when: whenOf(result),
    scale: barScale(result.condition.metric, result.now!, result.condition.value),
    source: result.source,
  };
}

/* ── the replay ─────────────────────────────────────────────────────────── */

type ReplayLike = {
  from: string;
  to: string;
  /** Every day's decision, newest first (lib/basket-agent/replay.ts). */
  runs: ReadonlyArray<{ day: string; decision: "propose" | "nothing" | "could_not_check" }>;
  proposals: ReadonlyArray<{ op: "drop" | "add"; ticker: string; line: string }>;
};

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The replay as a card; null when it checked no market day. */
export function replayCard(name: string, slug: string, replay: ReplayLike): ReplayCard | null {
  const days = [...replay.runs].sort((a, b) => a.day.localeCompare(b.day));
  if (days.length === 0) return null;
  const marks = days.map((run) => run.decision === "propose");
  const seen = new Set<string>();
  const changes = replay.proposals
    .filter((proposal) => {
      const key = `${proposal.op}:${proposal.ticker}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((proposal) => ({ op: proposal.op, ticker: proposal.ticker }));
  // A replay, said as one: what it would have said, never as today's advice.
  let line: string;
  if (changes.length === 0) line = `No change proposed in ${days.filter((run) => run.decision !== "could_not_check").length} market days.`;
  else {
    const said = changes
      .slice(0, 3)
      .map((change) => `${change.op} ${change.ticker}`)
      .join(", ");
    const why = replay.proposals[0]?.line.trim() ?? "";
    const both = why ? `Would have said: ${said}. ${capital(why.replace(/\.$/, ""))}.` : `Would have said: ${said}.`;
    line = fits(both) ? both : `Would have said: ${said}.`;
  }
  const checked = days.filter((run) => run.decision !== "could_not_check").length;
  return { kind: "replay", name, slug, from: days[0]!.day, to: days[days.length - 1]!.day, marks, checked, changeDays: marks.filter(Boolean).length, changes, line };
}

/* ── the thesis ─────────────────────────────────────────────────────────── */

/** The thesis card's one sentence, from its rollup and the newest risk filing. */
export function thesisSentence(input: {
  lines: number;
  holds: number;
  broke: number;
  risk: { ticker: string; form: string; filed: string; added: number } | null;
  today: string;
}): string {
  const { lines, holds, broke, risk, today } = input;
  if (holds === 0 && broke === 0) return risk ? `Waiting for figures; ${risk.ticker}'s ${risk.form} added ${risk.added === 1 ? "a risk" : `${risk.added} risks`}.` : `Waiting for the figures on all ${lines} lines.`;
  const said = broke > 0 ? `${broke} of ${lines} lines broke` : holds === lines ? `All ${lines} lines hold` : `${holds} of ${lines} lines hold`;
  if (!risk) return `${said}, and no new risks filed.`;
  const day = onDayWords(risk.filed, today);
  const added = risk.added === 1 ? "a risk" : `${risk.added} risks`;
  const joint = broke > 0 ? "and" : "but";
  const sentence = `${said}, ${joint} ${risk.ticker}'s ${risk.form} added ${added} ${day}.`;
  return fits(sentence) ? sentence : `${said}, ${joint} ${risk.ticker} added ${added}.`;
}

/** Plain words for each status, as the thesis page says them (lib/thesis-monitor/model.ts STATUS_WORDS). */
export const STATUS_LABEL: Record<ThesisCardStatus, string> = {
  holds: "Holds",
  strain: "Under strain",
  broken: "Broken",
  waiting: "Waiting for figures",
};

/** "Oct 16 – Nov 12". */
export function spanWords(from: string, to: string): string {
  return from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`;
}
