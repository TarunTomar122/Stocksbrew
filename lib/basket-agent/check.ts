/**
 * One check of an idea basket on one day. Pure: the facts go in, a decision comes out.
 *
 * Every company's reason is checked with the reason watcher's rules for its kind (lib/thesis-watch/rules.ts
 * `evaluate`). A reason that broke or played out drafts "drop X". Then the candidates (the idea's theme, the screens
 * that match it) are checked the same way, and the best one that holds drafts "add Y" when it now fits better than
 * the weakest company in the basket, on the one figure this kind of reason is about. Every check ends in a decision,
 * including "nothing to change".
 *
 * The same function runs the nightly check and each day of the replay; it only reads the facts it is handed, so the
 * replay's facts builder (lib/basket-agent/history.ts) decides what a day may see.
 */

import type { ThesisKind } from "@/lib/thesis";
import {
  evaluate,
  pctWords,
  type ReasonCheck,
  type Signal,
  type Verdict,
} from "@/lib/thesis-watch/rules";
import type { StockFacts } from "@/lib/thesis-watch/facts";

import {
  MAX_LINES,
  MIN_LINES,
  wordCount,
  type BasketChange,
  type BasketDecision,
  type BasketEvaluation,
  type LineStatus,
  type MetricValue,
} from "./model";

/** The facts the check reads for one company on one day. */
export type TickerFacts = {
  facts: StockFacts;
  /** Move over about a month of sessions, percent. */
  ret1m: number | null;
};

export type CheckLine = {
  ticker: string;
  company: string | null;
  kind: ThesisKind;
  reason: string;
  added_at: string;
};
export type CheckCandidate = {
  ticker: string;
  company: string | null;
  reason: string;
};

export type CheckInput = {
  day: string;
  lines: readonly CheckLine[];
  /** The kind new companies are checked as. */
  kind: ThesisKind;
  facts: ReadonlyMap<string, TickerFacts>;
  candidates?: readonly CheckCandidate[];
  /** The close on the day each company joined, by ticker: what a long-term or trade reason is held against. */
  savedCloses?: Readonly<Record<string, number | null>>;
  /** Tickers the person took out recently: never proposed back. */
  skip?: ReadonlySet<string>;
};

export const LINE_MAX_WORDS = 15;

/** How far a candidate must beat the weakest company to be worth an add, per kind of figure. */
export const ADD_MARGIN: Record<ThesisKind, number> = {
  growth: 10,
  product: 10,
  long_term: 10,
  value: 20,
  dividend: 1,
  trade: 5,
};

/* ── the figure each kind is compared on ───────────────────────────────── */

function signedWords(value: number): string {
  const rounded =
    Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)}%`;
}

/**
 * The middle of the basket on one figure, said the way that figure's own cards say it ("+42%"): what each company's
 * bar is held against on the basket page (owner rule 5: a bar compares). Null with fewer than three companies, where
 * a middle says nothing a pair of bars does not.
 */
export function basketMedian(label: string, values: readonly number[]): { value: number; text: string } | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length < 3) return null;
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const text =
    label === "Dividend yield" ? `${value.toFixed(1)}%` : label === "Cheaper than its own past" ? `${Math.round(value)}%` : signedWords(value);
  return { value, text };
}

/** The figure a basket compares companies on for this kind of reason, or null when the facts do not have it. */
export function metricOf(
  kind: ThesisKind,
  input: TickerFacts,
): MetricValue | null {
  const { facts } = input;
  switch (kind) {
    case "value":
      // Cheaper reads longer: the share of its own stored past when the P/E was higher than today.
      return facts.pePercentile === null
        ? null
        : {
            label: "Cheaper than its own past",
            value: 100 - facts.pePercentile,
            text: `${Math.round(100 - facts.pePercentile)}%`,
            better: "higher",
          };
    case "dividend":
      return facts.divYield === null
        ? null
        : {
            label: "Dividend yield",
            value: facts.divYield,
            text: `${facts.divYield.toFixed(1)}%`,
            better: "higher",
          };
    case "trade":
      return input.ret1m === null
        ? null
        : {
            label: "Move over a month",
            value: input.ret1m,
            text: signedWords(input.ret1m),
            better: "higher",
          };
    default:
      return facts.revenueGrowth === null
        ? null
        : {
            label: "Revenue growth",
            value: facts.revenueGrowth,
            text: signedWords(facts.revenueGrowth),
            better: "higher",
          };
  }
}

/** Positive when `a` is better than `b` on this figure. */
function edge(a: MetricValue, b: MetricValue): number {
  return a.better === "higher" ? a.value - b.value : b.value - a.value;
}

/* ── short lines ────────────────────────────────────────────────────────── */

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * A rule's finding in one short line (at most 15 words), from its own figures. The rules' full sentences say when
 * and against what; a card has room for the fact.
 */
export function shortLine(
  signal: Pick<Signal, "id" | "data" | "text">,
): string {
  const d = signal.data;
  const pct = (key: string) => {
    const value = num(d[key]);
    return value === null ? null : pctWords(value);
  };
  // Short enough for one line on a card (about 45 characters), with the figure that matters.
  const lines: Record<string, () => string | null> = {
    revenue_shrinking: () =>
      pct("revenue_growth_pct") &&
      `Revenue fell ${pct("revenue_growth_pct")} over the last year.`,
    growth_slowing: () =>
      pct("revenue_growth_pct") &&
      pct("prior_growth_pct") &&
      `Revenue growth slowed to ${pct("revenue_growth_pct")}, from ${pct("prior_growth_pct")}.`,
    estimates_falling: () =>
      pct("eps_next_year_pct") &&
      `Analysts see EPS falling ${pct("eps_next_year_pct")} next year.`,
    guidance_cut: () => "It lowered its guidance in its last report.",
    call_trim: () =>
      num(d.days) !== null
        ? `Our call has said Sell some for ${num(d.days)} days.`
        : null,
    dividend_cut: () =>
      pct("cut_pct") && `It cut its dividend by ${pct("cut_pct")}.`,
    dividend_stopped: () =>
      num(d.days) !== null
        ? `No dividend has gone ex in ${num(d.days)} days.`
        : null,
    payout_high: () =>
      pct("payout_pct") && `It pays out ${pct("payout_pct")} of its earnings.`,
    cash_short: () => "Its cash flow no longer covers the dividend.",
    dividend_lower: () =>
      pct("div_growth_pct") &&
      `Its dividend is ${pct("div_growth_pct")} lower than a year ago.`,
    losses: () => "It lost money over the last year.",
    value_trap: () =>
      pct("eps_growth_pct") &&
      `EPS fell ${pct("eps_growth_pct")} while it still looks cheap.`,
    no_longer_cheap: () =>
      num(d.pe_percentile_pct) !== null
        ? `Its P/E is above ${num(d.pe_percentile_pct)}% of its past.`
        : null,
    trouble: () =>
      pct("move_pct") && `It fell ${pct("move_pct")} on news of trouble.`,
    news_negative: () =>
      num(d.negative_pct) !== null && num(d.headlines) !== null
        ? `${num(d.negative_pct)}% of ${num(d.headlines)} recent headlines were negative.`
        : null,
    behind_sector: () => "Its revenue growth trails most of its sector.",
    deep_loss: () =>
      pct("move_pct") &&
      `Down ${pct("move_pct")} since it joined, call Sell some.`,
    revenue_down_year: () => "Revenue has fallen for more than a year.",
    trade_stop: () =>
      pct("move_pct") && `It is down ${pct("move_pct")} since it joined.`,
    trade_target: () =>
      pct("move_pct") && `It is up ${pct("move_pct")} since it joined.`,
    trade_too_long: () =>
      num(d.days) !== null
        ? `It has been a short-term trade for ${num(d.days)} days.`
        : null,
    earnings_no_plan: () => "It reports within days and has no plan.",
    insider_selling: () => "Insiders sold over $10 million in 30 days.",
    fund_cut: () =>
      typeof d.fund === "string" && d.fund.split(/\s+/).length <= 3
        ? `${d.fund} cut or sold its stake.`
        : "A fund we track cut or sold its stake.",
    call_turned_down: () =>
      num(d.days) !== null
        ? `Our call turned to Sell some ${num(d.days)} days ago.`
        : null,
    unexplained_fall: () =>
      pct("move_pct") &&
      `It fell ${pct("move_pct")} in a day, far more than the market.`,
    revenue: () =>
      num(d.revenue_growth_pct) !== null
        ? `Revenue ${num(d.revenue_growth_pct)! >= 0 ? "grew" : "fell"} ${pct("revenue_growth_pct")} over the last year.`
        : null,
    call: () => (typeof d.call === "string" ? `Our call is ${d.call}.` : null),
  };
  const line = lines[signal.id]?.() ?? null;
  if (line && wordCount(line) <= LINE_MAX_WORDS) return line;
  const first = signal.text.split(/(?<=[.!?])\s+/)[0] ?? "";
  return wordCount(first) <= LINE_MAX_WORDS ? first : "";
}

/** The line for a reason that holds: its figure, said once, so no two cards carry the same sentence. */
function holdsLine(check: ReasonCheck, metric: MetricValue | null): string {
  for (const signal of check.checked) {
    const line = shortLine(signal);
    if (line) return line;
  }
  if (metric) return `${metric.label}: ${metric.text}.`;
  return "";
}

/* ── one company ────────────────────────────────────────────────────────── */

export function statusOf(
  line: Pick<CheckLine, "ticker" | "kind" | "reason" | "added_at">,
  input: TickerFacts | undefined,
  day: string,
  savedClose: number | null,
): LineStatus {
  if (!input)
    return {
      ticker: line.ticker,
      kind: line.kind,
      verdict: "unknown",
      line: "",
      signal: null,
      metric: null,
      asOf: null,
    };
  const check = evaluate(
    { kind: line.kind, reason: line.reason, created_at: line.added_at },
    input.facts,
    { avgCost: null, savedClose },
    day,
  );
  const worst = check.signals[0] ?? null;
  const metric = metricOf(line.kind, input);
  return {
    ticker: line.ticker,
    kind: line.kind,
    verdict: check.verdict,
    line:
      check.verdict === "holds"
        ? holdsLine(check, metric)
        : worst
          ? shortLine(worst)
          : "",
    signal: worst
      ? { id: worst.id, level: worst.level, text: worst.text, asOf: worst.asOf }
      : null,
    metric,
    asOf: input.facts.close?.day ?? input.facts.day,
  };
}

/* ── the basket ─────────────────────────────────────────────────────────── */

const dropping = (verdict: LineStatus["verdict"]): verdict is Verdict =>
  verdict === "broken" || verdict === "played_out";

/**
 * The order a company counts as the basket's weakest: the ones it drops first (broken, then played out), so a
 * company taking a dropped one's place needs no margin, then weaker, then holds.
 */
const WEAKEST_RANK: Record<Verdict, number> = {
  broken: 0,
  played_out: 1,
  weaker: 2,
  holds: 3,
};

/** Worst first: broken, played out, weaker, holds; within a verdict, the worse figure first; unknown last. */
function weakestOf(
  statuses: readonly LineStatus[],
  kind: ThesisKind,
  facts: ReadonlyMap<string, TickerFacts>,
): { status: LineStatus; metric: MetricValue | null } | null {
  const known = statuses
    .filter((status) => status.verdict !== "unknown")
    .map((status) => ({
      status,
      metric: facts.get(status.ticker)
        ? metricOf(kind, facts.get(status.ticker)!)
        : null,
    }));
  if (known.length === 0) return null;
  return known.sort((a, b) => {
    const rank =
      WEAKEST_RANK[a.status.verdict as Verdict] -
      WEAKEST_RANK[b.status.verdict as Verdict];
    if (rank !== 0) return rank;
    if (!a.metric || !b.metric) return a.metric ? 1 : b.metric ? -1 : 0;
    return edge(a.metric, b.metric);
  })[0]!;
}

function list(names: string[]): string {
  return names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function summaryOf(
  decision: BasketDecision,
  statuses: readonly LineStatus[],
  changes: readonly BasketChange[],
  missing: readonly string[],
): string {
  if (decision === "could_not_check")
    return statuses.length === 0
      ? "There are no companies to check."
      : `Couldn't check ${missing.length} of ${statuses.length} companies.`;
  if (decision === "propose") {
    const drops = changes
      .filter((change) => change.op === "drop")
      .map((change) => change.ticker);
    const adds = changes
      .filter((change) => change.op === "add")
      .map((change) => change.ticker);
    if (drops.length && adds.length)
      return `Drop ${list(drops)} and add ${list(adds)}.`;
    if (drops.length)
      return drops.length === 1
        ? `Drop ${drops[0]}: its reason ${changes[0]!.verdict === "played_out" ? "played out" : "broke"}.`
        : `Drop ${list(drops)}: their reasons no longer hold.`;
    return `Add ${list(adds)}: it now fits better than the weakest company.`;
  }
  const holds = statuses.filter((status) => status.verdict === "holds").length;
  const weaker = statuses.filter(
    (status) => status.verdict === "weaker",
  ).length;
  const checked = statuses.filter(
    (status) => status.verdict !== "unknown",
  ).length;
  if (weaker === 0 && holds === checked)
    return `Nothing to change: all ${checked} reasons hold.`;
  return `Nothing to change: ${holds} hold, ${weaker} ${weaker === 1 ? "is" : "are"} weaker.`;
}

/**
 * The basket's check for one day. A company with no facts is "not checked", never "holds"; with half the basket or
 * more unchecked the decision is "could not check" and nothing is proposed.
 */
export function checkBasket(input: CheckInput): BasketEvaluation {
  const statuses = input.lines.map((line) =>
    statusOf(
      line,
      input.facts.get(line.ticker),
      input.day,
      input.savedCloses?.[line.ticker] ?? null,
    ),
  );
  const missing = statuses
    .filter((status) => status.verdict === "unknown")
    .map((status) => status.ticker);
  if (statuses.length === 0 || missing.length * 2 >= statuses.length) {
    return {
      day: input.day,
      decision: "could_not_check",
      summary: summaryOf("could_not_check", statuses, [], missing),
      statuses,
      changes: [],
      missing,
    };
  }

  const changes: BasketChange[] = [];
  const company = new Map(
    input.lines.map((line) => [line.ticker, line.company]),
  );
  // Only drops that can be applied: the basket never goes under MIN_LINES. When more reasons broke than that allows,
  // the most severe go first: broken before played out, a hard finding before a soft one, then the basket's order.
  const LEVEL: Record<string, number> = { hard: 0, done: 1, soft: 2, info: 3 };
  const room = Math.max(0, input.lines.length - MIN_LINES);
  const toDrop = statuses
    .map((status, index) => ({ status, index }))
    .filter(({ status }) => dropping(status.verdict))
    .sort(
      (a, b) =>
        WEAKEST_RANK[a.status.verdict as Verdict] -
          WEAKEST_RANK[b.status.verdict as Verdict] ||
        (LEVEL[a.status.signal?.level ?? "info"] ?? 3) -
          (LEVEL[b.status.signal?.level ?? "info"] ?? 3) ||
        a.index - b.index,
    )
    .slice(0, room)
    .map(({ status }) => status);
  for (const status of toDrop) {
    changes.push({
      op: "drop",
      ticker: status.ticker,
      company: company.get(status.ticker) ?? null,
      kind: status.kind,
      line:
        status.line ||
        (status.verdict === "played_out"
          ? "Its reason played out."
          : "Its reason no longer holds."),
      verdict: status.verdict as Verdict,
      signal_id: status.signal?.id ?? null,
    });
  }

  const add = bestAdd(input, statuses, changes.length);
  if (add) changes.push(add);
  const decision: BasketDecision = changes.length > 0 ? "propose" : "nothing";
  return {
    day: input.day,
    decision,
    summary: summaryOf(decision, statuses, changes, missing),
    statuses,
    changes,
    missing,
  };
}

function bestAdd(
  input: CheckInput,
  statuses: readonly LineStatus[],
  drops: number,
): BasketChange | null {
  const inBasket = new Set(input.lines.map((line) => line.ticker));
  // A full basket only takes a company in place of one it drops.
  if (input.lines.length - drops >= MAX_LINES) return null;
  const weakest = weakestOf(statuses, input.kind, input.facts);
  if (!weakest) return null;
  const replacing = dropping(weakest.status.verdict);
  let best: {
    candidate: CheckCandidate;
    metric: MetricValue;
    status: LineStatus;
  } | null = null;
  for (const candidate of input.candidates ?? []) {
    if (inBasket.has(candidate.ticker) || input.skip?.has(candidate.ticker))
      continue;
    const facts = input.facts.get(candidate.ticker);
    if (!facts) continue;
    const status = statusOf(
      {
        ticker: candidate.ticker,
        kind: input.kind,
        reason: candidate.reason,
        added_at: `${input.day}T00:00:00.000Z`,
      },
      facts,
      input.day,
      null,
    );
    if (status.verdict !== "holds" || !status.metric) continue;
    if (!best || edge(status.metric, best.metric) > 0)
      best = { candidate, metric: status.metric, status };
  }
  if (!best) return null;
  const against = weakest.metric;
  // Next to a company that still holds, a candidate must clearly beat it on the figure, never just tie it.
  if (
    !replacing &&
    (!against || edge(best.metric, against) < ADD_MARGIN[input.kind])
  )
    return null;
  // In place of a company whose reason broke, the figure is the newcomer's own: held against the one leaving, a lower
  // figure would read as a step down when the point is that the other reason no longer holds.
  const versus =
    against && !replacing
      ? {
          ticker: weakest.status.ticker,
          value: against.value,
          text: against.text,
        }
      : null;
  const gone = weakest.status.verdict === "played_out" ? "played out" : "broke";
  const line = versus
    ? `${best.metric.label}: ${best.metric.text}, against ${versus.text} for ${versus.ticker}, the weakest.`
    : replacing
      ? `${best.metric.label}: ${best.metric.text}. Its reason holds; ${weakest.status.ticker}'s ${gone}.`
      : `${best.metric.label}: ${best.metric.text}, and its reason holds.`;
  return {
    op: "add",
    ticker: best.candidate.ticker,
    company: best.candidate.company,
    kind: input.kind,
    line:
      wordCount(line) <= LINE_MAX_WORDS
        ? line
        : `${best.metric.label}: ${best.metric.text}.`,
    reason: best.candidate.reason,
    fact: {
      label: best.metric.label,
      value: best.metric.value,
      text: best.metric.text,
      versus,
    },
  };
}
