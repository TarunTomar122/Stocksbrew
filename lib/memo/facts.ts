import { CALL_PLAIN, asSentence, companyFirstMove, plainCallReason, wholeSentences } from "@/lib/plain-copy";

/** The call in the words the rest of the app uses ("Buy more", "Keep", "Sell some"), in quotes so it reads as a label. */
const say = (call: string): string => `"${(CALL_PLAIN as Record<string, string>)[call] ?? call}"`;

import type {
  CallWord,
  DailySeries,
  MemoItemCard,
  MemoCurvePoint,
  MemoFact,
  MemoHolding,
  MemoInputs,
  MemoTone,
} from "./types";
import { pct, points, signedPct } from "./format";
import { addDays, longDay, shortDay, weekdayName, weekdayOf } from "./week";

/**
 * The week's facts for one portfolio, chosen and written by plain rules from
 * stored data. Every number in a fact's text is computed here and kept in its
 * `data`, so a model that words the memo can be checked against it.
 *
 * Thresholds are written down here, before they are tuned:
 * - a driver must move the portfolio by at least 0.2 points;
 * - insider selling counts at $10 million or more in a week, buying at $1 million;
 * - one company is a concentration risk at 20% of the portfolio, a sector at 40%;
 * - an upcoming report is a risk when the stock is 10% or more of the portfolio
 *   and it typically moves 4% or more on report days;
 * - a past shock is worth a line when the mix fell at least 3 points more than the S&P 500.
 */

export const DRIVER_MIN_POINTS = 0.2;
/** Words in a card's line under its figure. */
export const CARD_WORDS = 10;
export const INSIDER_SELL_MIN = 10_000_000;
export const INSIDER_BUY_MIN = 1_000_000;
export const COMPANY_RISK_PCT = 20;
export const SECTOR_RISK_PCT = 40;
export const REPORT_RISK_WEIGHT = 10;
export const REPORT_RISK_MOVE = 4;
export const STRESS_GAP_POINTS = 3;
/** How far ahead the memo looks for ex-dividend dates. */
export const DIVIDEND_LOOKAHEAD_DAYS = 21;

/* ── formatting ─────────────────────────────────────────────────────────── */

export { pct, points, signedPct };

/** "$24.1 million", "$1.2 billion", "$350,000", "$42". */
export function money(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)} billion`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)} million`;
  if (abs >= 1000) return `$${Math.round(abs).toLocaleString("en-US")}`;
  return `$${abs >= 100 ? Math.round(abs) : abs.toFixed(2).replace(/\.00$/, "")}`;
}

/** "$24.1M", "$1.2B", "$350K", "$42": a figure for a card, where "million" does not fit. */
export function shortMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(abs / 1e3)}K`;
  return `$${abs >= 100 ? Math.round(abs) : abs.toFixed(2).replace(/\.00$/, "")}`;
}

/** "$0.82", "$1.50": per-share amounts keep their cents. */
export function cents(value: number): string {
  return `$${Math.abs(value).toFixed(2)}`;
}

/** Words in a line: "S&P 500" counts as two. */
export function wordsIn(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countWord(n: number): string {
  return ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/* ── prices ─────────────────────────────────────────────────────────────── */

function closeOnOrBefore(series: DailySeries | undefined | null, day: string): { date: string; close: number } | null {
  if (!series) return null;
  for (let i = Math.min(series.dates.length, series.closes.length) - 1; i >= 0; i--) {
    const date = series.dates[i]!;
    const close = series.closes[i]!;
    if (date <= day && Number.isFinite(close) && close > 0) return { date, close };
  }
  return null;
}

export type WeekMove = {
  ticker: string;
  name: string;
  pct: number;
  /** Percentage points of the portfolio's move. */
  contribution: number;
  /** Share of the portfolio at the end of the week, 0 to 100. */
  weight: number;
};

export type LeftOut = { ticker: string; name: string; why: "shares" | "early" | "closes"; last?: string };

export type WeekPerformance = {
  from: string;
  to: string;
  portfolioPct: number;
  marketPct: number | null;
  moves: WeekMove[];
  /** Holdings left out for want of closes or a share count. */
  missing: string[];
  /** The same, each with why: no share count, closes that stop before the memo's last day (`last` is its last close), or none. */
  left: LeftOut[];
  /** Holdings measured, and holdings in all. */
  priced: number;
  total: number;
  basis: "value" | "equal";
  /** The close before Monday (at 0), then every S&P 500 close to `to`, as percent from that close. */
  daily: MemoCurvePoint[];
};

/**
 * The week's return from the last close before Monday to the memo's end day.
 * Weighted by what each holding was worth at the start (shares x close), or
 * equal starting amounts when no holding has a share count. Exact, not a
 * weighted average of returns: sum of end values over sum of start values.
 */
export function weekPerformance(input: Pick<MemoInputs, "week" | "holdings" | "series" | "benchmark">): WeekPerformance | null {
  const { week, benchmark } = input;
  if (!week.endDay) return null;
  const startRef = closeOnOrBefore(benchmark, addDays(week.monday, -1));
  const endRef = closeOnOrBefore(benchmark, week.endDay);
  if (!startRef || !endRef || endRef.date < week.monday) return null;
  const from = startRef.date;
  const to = endRef.date;
  const anyUnits = input.holdings.some((holding) => holding.units !== null && holding.units > 0);
  const rows: Array<{ holding: MemoHolding; c0: number; c1: number; units: number }> = [];
  const missing: string[] = [];
  const left: LeftOut[] = [];
  const leave = (holding: MemoHolding, why: LeftOut["why"], last?: string) => {
    missing.push(holding.ticker);
    left.push({ ticker: holding.ticker, name: holding.name || holding.ticker, why, ...(last ? { last } : {}) });
  };
  for (const holding of input.holdings) {
    const series = input.series.get(holding.ticker);
    const c0 = closeOnOrBefore(series, from);
    const c1 = closeOnOrBefore(series, to);
    if (anyUnits && !(holding.units !== null && holding.units > 0)) {
      leave(holding, "shares");
      continue;
    }
    // Both closes must be the benchmark's own days (a stale series would read as a flat week).
    if (!c0 || !c1 || c0.date !== from || c1.date !== to) {
      leave(holding, c0?.date === from && c1 && c1.date < to && c1.date >= from ? "early" : "closes", c1?.date);
      continue;
    }
    rows.push({ holding, c0: c0.close, c1: c1.close, units: anyUnits ? holding.units! : 1 / c0.close });
  }
  if (rows.length < 2) return null;
  const start = rows.reduce((sum, row) => sum + row.units * row.c0, 0);
  const end = rows.reduce((sum, row) => sum + row.units * row.c1, 0);
  if (!(start > 0)) return null;
  const moves = rows.map((row) => ({
    ticker: row.holding.ticker,
    name: row.holding.name,
    pct: round((row.c1 / row.c0 - 1) * 100),
    contribution: round(((row.units * (row.c1 - row.c0)) / start) * 100),
    weight: round(((row.units * row.c1) / end) * 100, 1),
  }));
  const market = (endRef.close / startRef.close - 1) * 100;
  // Each S&P 500 close in the stretch, priced with the same holdings and share counts as the week's figure.
  const daily: MemoCurvePoint[] = [];
  const bench = benchmark!;
  for (let i = 0; i < Math.min(bench.dates.length, bench.closes.length); i++) {
    const day = bench.dates[i]!;
    const close = bench.closes[i]!;
    if (day < from || day > to || !(Number.isFinite(close) && close > 0)) continue;
    let value = 0;
    for (const row of rows) value += row.units * (closeOnOrBefore(input.series.get(row.holding.ticker), day)?.close ?? row.c0);
    daily.push({ day, portfolio: round((value / start - 1) * 100), market: round((close / startRef.close - 1) * 100) });
  }
  return {
    from,
    to,
    portfolioPct: round((end / start - 1) * 100),
    marketPct: round(market),
    moves,
    missing,
    left,
    priced: rows.length,
    total: input.holdings.length,
    basis: anyUnits ? "value" : "equal",
    daily,
  };
}

/**
 * Which holdings the week's figure leaves out, and why, in one sentence: "Vanguard S&P 500 ETF is left out
 * because its prices stop at Monday's close." Empty when every holding is counted.
 */
export function leftOutSentence(perf: Pick<WeekPerformance, "left" | "from">): string {
  const left = perf.left;
  if (left.length === 0) return "";
  const why = (row: LeftOut) =>
    row.why === "shares"
      ? "it has no share count"
      : row.why === "early" && row.last
        ? `its prices stop at ${row.last > perf.from ? `${weekdayName(row.last)}'s` : `the ${shortDay(row.last)}`} close`
        : "we have no closes for it this week";
  if (left.length === 1) return `${left[0]!.name} is left out because ${why(left[0]!)}.`;
  const reasons = new Set(left.map((row) => row.why));
  const names = joinList(left.slice(0, 4).map((row) => row.name)) + (left.length > 4 ? ` and ${countWord(left.length - 4)} more` : "");
  if (reasons.size === 1 && left[0]!.why === "shares") return `${names} are left out because they have no share count.`;
  if (!reasons.has("shares")) return `${names} are left out because we do not have all of this week's closes for them.`;
  return `${names} are left out for want of a share count or this week's closes.`;
}

/* ── the facts ──────────────────────────────────────────────────────────── */

type Words = { holdings: string; possessive: string; shares: string; portfolio: string };

function wordsFor(subject: MemoInputs["subject"]): Words {
  return subject === "example"
    ? { holdings: "The example portfolio", possessive: "the example's", shares: "the example's shares", portfolio: "the example portfolio" }
    : { holdings: "Your holdings", possessive: "your", shares: "your shares", portfolio: "your portfolio" };
}

/** "rose" / "fell" for a finished week, "are up" / "is down" while it runs ("Your holdings are", "The example portfolio is"). */
export function rise(value: number, past: boolean, subject: MemoInputs["subject"] = "mine"): string {
  if (past) return value >= 0 ? "rose" : "fell";
  const be = subject === "example" ? "is" : "are";
  return value >= 0 ? `${be} up` : `${be} down`;
}

/** "Seven of your holdings" takes the plural, whatever the subject. */
function riseMany(value: number, past: boolean): string {
  return past ? (value >= 0 ? "rose" : "fell") : value >= 0 ? "are up" : "are down";
}

/** "2.3%", or "less than 0.1%" for a week that barely moved, so it never says "fell 0.0%". */
export function moveSize(value: number): string {
  return Math.abs(value) < 0.05 ? "less than 0.1%" : pct(value);
}

const capital = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

function marketClause(market: number): string {
  return market >= 0 ? `a ${pct(market)} rise in the S&P 500` : `a ${pct(market)} fall in the S&P 500`;
}

function toneVs(gap: number, band = 0.25): MemoTone {
  return gap >= band ? "up" : gap <= -band ? "down" : "flat";
}

function nameOf(inputs: MemoInputs, ticker: string): string {
  return inputs.holdings.find((holding) => holding.ticker === ticker)?.name || ticker;
}

function coveredTicker(inputs: MemoInputs, ticker: string): boolean {
  return inputs.holdings.find((holding) => holding.ticker === ticker)?.covered ?? false;
}

function inWeek(inputs: Pick<MemoInputs, "week" | "today">, day: string): boolean {
  const end = inputs.week.complete ? inputs.week.friday : inputs.today;
  return day >= inputs.week.monday && day <= end;
}

type NetCall = MemoInputs["calls"][number] & { from: CallWord };

/**
 * Each stock's call change over the week: the call before its first change and the call after its last,
 * dated the last change. A call that changed and changed back is left out. Oldest first.
 */
export function netCallChanges(inputs: Pick<MemoInputs, "calls" | "week" | "today">): NetCall[] {
  const net = new Map<string, NetCall>();
  for (const call of [...inputs.calls].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!inWeek(inputs, call.date) || !call.from || call.from === call.to) continue;
    const held = net.get(call.ticker);
    net.set(call.ticker, held ? { ...call, from: held.from } : { ...call, from: call.from });
  }
  return [...net.values()].filter((call) => call.from !== call.to).sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
}

export type FactsResult = {
  facts: MemoFact[];
  performance: WeekPerformance | null;
  /** Reasons left out because the stock is not covered for this viewer. */
  heldBack: number;
};

export function buildFacts(inputs: MemoInputs): FactsResult {
  const facts: MemoFact[] = [];
  const words = wordsFor(inputs.subject);
  const past = inputs.week.complete;
  const weekWords = past ? "this week" : "so far this week";
  let heldBack = 0;

  /* performance and drivers */
  const perf = weekPerformance(inputs);
  if (perf) {
    const gap = perf.marketPct === null ? 0 : perf.portfolioPct - perf.marketPct;
    const through = past ? "" : `, through ${weekdayName(perf.to)}'s close`;
    const against = perf.marketPct === null ? "" : `, against ${marketClause(perf.marketPct)}`;
    const partial = perf.priced < perf.total;
    // "Seven of your 10 holdings": a figure about part of the portfolio says so.
    // "Together, eight of your nine holdings": one figure for the group, not each holding's move.
    const subjectWords = partial ? `Together, ${countWord(perf.priced)} of ${words.possessive} ${countWord(perf.total)} holdings` : words.holdings;
    const verb = partial ? riseMany(perf.portfolioPct, past) : rise(perf.portfolioPct, past, inputs.subject);
    const leftWords = leftOutSentence(perf);
    const left = leftWords ? ` ${leftWords}` : "";
    facts.push({
      id: "performance",
      kind: "performance",
      section: "changed",
      rank: 100,
      tickers: [],
      text: `${subjectWords} ${verb} ${moveSize(perf.portfolioPct)} ${weekWords}${through}${against}.${left}`,
      short: `${partial ? `${countWord(perf.priced)} of ${words.possessive} ${countWord(perf.total)} holdings` : words.holdings.toLowerCase()} ${verb} ${moveSize(perf.portfolioPct)}`,
      href: inputs.subject === "example" ? "/watchlist" : "/watchlist?tab=analytics",
      linkLabel: inputs.subject === "example" ? "The example portfolio" : "Your portfolio",
      tone: perf.marketPct === null ? (perf.portfolioPct >= 0 ? "up" : "down") : toneVs(gap),
      source: "Daily closes with dividends",
      asOf: perf.to,
      data: {
        portfolio_pct: perf.portfolioPct,
        sp500_pct: perf.marketPct,
        gap_points: perf.marketPct === null ? null : round(gap),
        from_close: perf.from,
        to_close: perf.to,
        holdings_priced: perf.priced,
        holdings_total: perf.total,
      },
    });

    const sorted = [...perf.moves].sort((a, b) => b.contribution - a.contribution);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const parts: string[] = [];
    const tickers: string[] = [];
    const data: Record<string, string | number | null> = {};
    const up = best && best.contribution >= DRIVER_MIN_POINTS ? best : null;
    const down = worst && worst !== best && worst.contribution <= -DRIVER_MIN_POINTS ? worst : null;
    const upLine = up ? `${up.name} added the most: it rose ${pct(up.pct)}, worth ${points(up.contribution)} of the week's move.` : null;
    const downLine = down ? `${down.name} cost the most: it fell ${pct(down.pct)}, costing ${points(down.contribution)}.` : null;
    // The side that moved the week the way it went comes first.
    const ordered = perf.portfolioPct >= 0 ? [[up, upLine], [down, downLine]] : [[down, downLine], [up, upLine]];
    for (const [move, line] of ordered as Array<[WeekMove | null, string | null]>) {
      if (!move || !line) continue;
      parts.push(line);
      tickers.push(move.ticker);
    }
    if (up) Object.assign(data, { best: up.ticker, best_pct: up.pct, best_points: up.contribution, best_weight: up.weight });
    if (down) Object.assign(data, { worst: down.ticker, worst_pct: down.pct, worst_points: down.contribution, worst_weight: down.weight });
    if (parts.length > 0) {
      // The first named move leads; say which way it pushed, so a drag on a rising week is never "did the most".
      const leadTicker = tickers[0]!;
      const leadUp = up?.ticker === leadTicker;
      facts.push({
        id: "drivers",
        kind: "drivers",
        section: "changed",
        rank: 90,
        tickers,
        text: parts.join(" "),
        short: `${nameOf(inputs, leadTicker)} ${leadUp ? "lifted it the most" : "cost it the most"}`,
        href: `/stock/${encodeURIComponent(tickers[0]!)}`,
        linkLabel: nameOf(inputs, tickers[0]!),
        tone: perf.portfolioPct >= 0 ? "up" : "down",
        source: "Daily closes with dividends",
        asOf: perf.to,
        data,
      });
    }
  }

  /* reports this week (they explain their own moves, so a move on a report day is left to the report) */
  const reportedOn = new Set<string>();
  const reported = new Set<string>();
  for (const report of inputs.reports) {
    if (!inWeek(inputs, report.day)) continue;
    const name = nameOf(inputs, report.ticker);
    const sentences = [`${name} reported on ${longDay(report.day)}.`];
    const data: Record<string, string | number | null> = { ticker: report.ticker, report_day: report.day };
    const clauses: string[] = [];
    if (report.verdict === "beat" || report.verdict === "miss" || report.verdict === "in_line") {
      const verb = report.verdict === "beat" ? "beat" : report.verdict === "miss" ? "missed" : "matched";
      const figures =
        report.epsActual !== null && report.epsEstimate !== null ? `, ${cents(report.epsActual)} a share against ${cents(report.epsEstimate)}` : "";
      clauses.push(`earnings ${verb} estimates${figures}`);
      Object.assign(data, { verdict: report.verdict, eps_actual: report.epsActual, eps_estimate: report.epsEstimate });
    }
    if (report.guidance === "raised" || report.guidance === "lowered") {
      clauses.push(report.guidance === "raised" ? "the company raised its forecast" : "the company cut its forecast");
      data.guidance = report.guidance;
    }
    if (report.reactionPct !== null && (report.reactionBasis === "next_session" || report.reactionBasis === "report_day")) {
      const when = report.reactionBasis === "next_session" ? "the next session" : "on the day";
      clauses.push(`the stock ${report.reactionPct >= 0 ? "rose" : "fell"} ${pct(report.reactionPct)} ${when}`);
      data.reaction_pct = report.reactionPct;
      if (report.typicalAbsPct !== null && report.typicalAbsPct > 0) data.typical_move_pct = report.typicalAbsPct;
    }
    if (clauses.length > 0) {
      const joined = joinList(clauses);
      sentences.push(`${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`);
    }
    // The report explains the move on its day and the session after.
    reportedOn.add(`${report.ticker}|${report.day}`);
    reportedOn.add(`${report.ticker}|${nextWeekday(report.day)}`);
    reported.add(`${report.ticker}|${report.day}`);
    const reaction = typeof data.reaction_pct === "number" ? data.reaction_pct : null;
    const forecast = report.guidance === "raised" ? ", forecast raised" : report.guidance === "lowered" ? ", forecast cut" : "";
    const result =
      report.verdict === "beat" ? "beat estimates" : report.verdict === "miss" ? "missed estimates" : report.verdict === "in_line" ? "matched estimates" : null;
    const reportCard: MemoItemCard =
      reaction !== null
        ? {
            figure: signedPct(reaction),
            // A move that rounds to 0.0% is neither a gain nor a loss.
            sign: Math.abs(reaction) < 0.05 ? null : reaction > 0 ? "up" : "down",
            label: `for ${name} after its report${result ? ` ${result}` : ""}`,
          }
        : report.verdict === "beat" || report.verdict === "miss" || report.verdict === "in_line"
          ? {
              figure: report.verdict === "beat" ? "Beat" : report.verdict === "miss" ? "Missed" : "In line",
              label: `${report.verdict === "in_line" ? "with estimates" : "estimates"} in ${name}'s report on ${weekdayName(report.day)}${forecast}`,
            }
          : { figure: "Reported", label: `${name}'s earnings on ${weekdayName(report.day)}${forecast}` };
    facts.push({
      card: reportCard,
      id: `report:${report.ticker}:${report.day}`,
      kind: "report",
      section: "changed",
      rank: 75 + Math.min(10, Math.abs(report.reactionPct ?? 0)),
      tickers: [report.ticker],
      text: sentences.join(" "),
      short: `${name} reported earnings`,
      href: `/stock/${encodeURIComponent(report.ticker)}/earnings/${report.day}`,
      linkLabel: "The earnings report",
      tone: report.reactionPct !== null ? (report.reactionPct >= 0 ? "up" : "down") : report.verdict === "beat" ? "up" : report.verdict === "miss" ? "down" : "flat",
      source: "Company filing and earnings estimates",
      asOf: report.day,
      data,
    });
  }

  /* call changes: the week's net change per stock, grouped when several moved the same way */
  const callGroups = new Map<string, Array<MemoInputs["calls"][number] & { from: string }>>();
  for (const call of netCallChanges(inputs)) callGroups.set(call.to, [...(callGroups.get(call.to) ?? []), call]);
  for (const [to, calls] of callGroups) {
    const section = to === "Trim" ? "hurt" : to === "Add" ? "look" : "changed";
    const tone: MemoTone = to === "Add" ? "up" : to === "Trim" ? "down" : "flat";
    calls.sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
    if (calls.length === 1) {
      const call = calls[0]!;
      const name = nameOf(inputs, call.ticker);
      const first = `Our call on ${name} moved from ${say(call.from)} to ${say(call.to)} on ${longDay(call.date)}.`;
      let reason = "";
      let held = 0;
      if (call.text) {
        if (coveredTicker(inputs, call.ticker)) reason = asSentence(wholeSentences(plainCallReason(call.text), 1), { quote: true });
        else held = 1;
      }
      facts.push({
        card: { figure: CALL_PLAIN[call.to], label: `on ${name}, from ${CALL_PLAIN[call.from]} on ${weekdayName(call.date)}` },
        id: `call:${call.ticker}:${call.date}`,
        kind: "call",
        section,
        rank: 80,
        tickers: [call.ticker],
        text: reason ? `${first} ${reason}` : first,
        short: `our call on ${name} moved to ${say(call.to)}`,
        href: `/stock/${encodeURIComponent(call.ticker)}`,
        linkLabel: `${name}'s call`,
        tone,
        source: "stocksbrew call history",
        asOf: call.date,
        data: { ticker: call.ticker, from: call.from, to: call.to, date: call.date, ...(reason ? { reason } : {}) },
        heldBack: held,
      });
      heldBack += held;
      continue;
    }
    const named = calls.map((call) => `${nameOf(inputs, call.ticker)} (from ${say(call.from)})`);
    const first = calls[0]!;
    facts.push({
      card: { figure: CALL_PLAIN[to as CallWord], label: `on ${countWord(calls.length)} holdings: ${calls.slice(0, 3).map((call) => call.ticker).join(", ")}${calls.length > 3 ? " and more" : ""}` },
      id: `calls:${to}:${first.date}`,
      kind: "call",
      section,
      rank: 80,
      tickers: calls.map((call) => call.ticker),
      text: `Our call moved to ${say(to)} on ${countWord(calls.length)} of ${words.possessive} holdings this week: ${joinList(named)}.`,
      short: `our call moved to ${say(to)} on ${joinList(calls.slice(0, 2).map((call) => nameOf(inputs, call.ticker)))}${calls.length > 2 ? " and others" : ""}`,
      href: `/stock/${encodeURIComponent(first.ticker)}`,
      linkLabel: `${nameOf(inputs, first.ticker)}'s call`,
      tone,
      source: "stocksbrew call history",
      asOf: calls[calls.length - 1]!.date,
      data: { to, count: calls.length, ...Object.fromEntries(calls.map((call) => [`${call.ticker}_from`, call.from])) },
    });
  }

  /* explained moves: the biggest per stock */
  const bestMove = new Map<string, MemoInputs["moves"][number]>();
  for (const move of inputs.moves) {
    if (!inWeek(inputs, move.day) || reportedOn.has(`${move.ticker}|${move.day}`)) continue;
    const held = bestMove.get(move.ticker);
    if (!held || Math.abs(move.pct) > Math.abs(held.pct)) bestMove.set(move.ticker, move);
  }
  for (const move of bestMove.values()) {
    const name = nameOf(inputs, move.ticker);
    const covered = coveredTicker(inputs, move.ticker);
    const day = longDay(move.day);
    const verb = move.pct >= 0 ? "rose" : "fell";
    let text = `${name} ${verb} ${pct(move.pct)} on ${day}.`;
    let held = 0;
    if (covered && move.headline) {
      // "Nvidia rose 7.1% after record data-center sales", when the reason reads that way; else the reason as its own sentence.
      const sentence = companyFirstMove(move.headline, move.pct, { withPct: true, company: { name, ticker: move.ticker } });
      text = sentence ? `On ${day}, ${sentence}.` : `${text} ${asSentence(move.headline)}`;
    } else if (!covered && move.headline) {
      held = 1;
    }
    heldBack += held;
    facts.push({
      card: { figure: signedPct(move.pct), sign: move.pct >= 0 ? "up" : "down", label: `for ${name} on ${weekdayName(move.day)}` },
      id: `move:${move.ticker}:${move.day}`,
      kind: "move",
      section: "changed",
      rank: 60 + Math.min(20, Math.abs(move.pct)),
      tickers: [move.ticker],
      text: text.replace(/\.\.$/, "."),
      short: `${name} ${verb} ${pct(move.pct)} on ${weekdayName(move.day)}`,
      href: `/stock/${encodeURIComponent(move.ticker)}/moves/${move.day}`,
      linkLabel: covered ? "Why it moved" : `${name} that day`,
      tone: move.pct >= 0 ? "up" : "down",
      source: "Researched move explanations",
      asOf: move.day,
      data: { ticker: move.ticker, day: move.day, move_pct: round(move.pct), ...(covered && move.headline ? { reason: move.headline } : {}) },
      heldBack: held,
    });
  }

  /* upcoming reports */
  // After the memo's last close, up to the next week's Friday; a report already in this memo is not "coming".
  const upcomingTo = addDays(inputs.week.friday, 7);
  const upcoming = inputs.upcoming
    .filter((event) => event.date > (inputs.week.endDay ?? inputs.week.friday) && event.date <= upcomingTo && !reported.has(`${event.ticker}|${event.date}`))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length > 0) {
    const timeWords = (time: string | null) => (time === "amc" ? " after the close" : time === "bmo" ? " before the open" : "");
    const named = upcoming.slice(0, 4).map((event, index) => {
      const name = nameOf(inputs, event.ticker);
      return index === 0 ? `${name} reports on ${longDay(event.date)}${timeWords(event.time)}` : `${name} on ${longDay(event.date)}`;
    });
    const more = upcoming.length - named.length;
    const lastDay = upcoming[upcoming.length - 1]!.date;
    const firstUp = upcoming[0]!;
    facts.push({
      card: {
        figure: shortDay(firstUp.date),
        label: `${nameOf(inputs, firstUp.ticker)} reports${timeWords(firstUp.time)}${upcoming.length > 1 ? `, then ${countWord(upcoming.length - 1)} more` : ""}`,
      },
      id: "upcoming",
      kind: "upcoming",
      section: "look",
      rank: 55,
      tickers: upcoming.slice(0, 4).map((event) => event.ticker),
      text: `Coming up: ${joinList(named)}${more > 0 ? `, and ${countWord(more)} more after that` : ""}.`,
      short: `${nameOf(inputs, upcoming[0]!.ticker)} reports on ${weekdayName(upcoming[0]!.date)}`,
      href: "/calendar",
      linkLabel: "Calendar",
      tone: "flat",
      source: "Earnings calendar",
      asOf: inputs.today,
      data: Object.fromEntries(upcoming.slice(0, 4).map((event) => [`report_${event.ticker}`, event.date])),
    });

    const weights = new Map((perf?.moves ?? []).map((move) => [move.ticker, move.weight]));
    const risky = upcoming
      .map((event) => ({ event, weight: weights.get(event.ticker) ?? null }))
      .filter((row) => row.weight !== null && row.weight >= REPORT_RISK_WEIGHT && (row.event.typicalAbsPct ?? 0) >= REPORT_RISK_MOVE)
      .sort((a, b) => b.weight! * (b.event.typicalAbsPct ?? 0) - a.weight! * (a.event.typicalAbsPct ?? 0))[0];
    if (risky) {
      const name = nameOf(inputs, risky.event.ticker);
      facts.push({
        card: {
          figure: pct(risky.weight!),
          label: `of ${words.portfolio} is ${name}, reporting ${weekdayName(risky.event.date)}`,
          visual: { kind: "share", pct: risky.weight!, benchmarkPct: null, label: risky.event.ticker },
        },
        id: `upcoming_risk:${risky.event.ticker}`,
        kind: "upcoming_risk",
        section: "hurt",
        rank: 70,
        tickers: [risky.event.ticker],
        text: `${name} reports on ${longDay(risky.event.date)} and is ${pct(risky.weight!)} of ${words.portfolio}. Its shares have moved about ${pct(risky.event.typicalAbsPct!)} on a typical report day.`,
        short: `${name} reports on ${weekdayName(risky.event.date)}`,
        href: `/stock/${encodeURIComponent(risky.event.ticker)}`,
        linkLabel: name,
        tone: "down",
        source: "Earnings calendar and past report-day moves",
        asOf: inputs.today,
        data: { ticker: risky.event.ticker, report_day: risky.event.date, weight_pct: risky.weight, typical_move_pct: risky.event.typicalAbsPct },
      });
    }
  }

  /* funds (13F) */
  const fundsByTicker = new Map<string, MemoInputs["funds"]>();
  for (const move of inputs.funds) {
    if (!inWeek(inputs, move.filedDate)) continue;
    fundsByTicker.set(move.ticker, [...(fundsByTicker.get(move.ticker) ?? []), move]);
  }
  for (const [ticker, moves] of fundsByTicker) {
    const weight = (move: MemoInputs["funds"][number]) =>
      move.action === "sold" ? 1000 : move.action === "new" ? 900 : Math.abs(move.changePct ?? 0);
    const lead = [...moves].sort((a, b) => weight(b) - weight(a))[0]!;
    const name = nameOf(inputs, ticker);
    const what =
      lead.action === "sold"
        ? `sold all of its ${name} shares`
        : lead.action === "new"
          ? `bought ${name} for the first time`
          : lead.changePct !== null
            ? `${lead.action === "added" ? "added to" : "cut"} its ${name} stake by ${pct(lead.changePct)}`
            : `${lead.action === "added" ? "added to" : "cut"} its ${name} stake`;
    const others = moves.length - 1;
    const fundWhat =
      lead.action === "sold"
        ? `sold all its ${name} shares`
        : lead.action === "new"
          ? `bought ${name} for the first time`
          : `${lead.action === "added" ? "added to" : "cut"} its ${name} stake`;
    facts.push({
      card: {
        figure:
          lead.action === "sold"
            ? "Sold"
            : lead.action === "new"
              ? "New"
              : lead.changePct !== null
                ? `${lead.action === "added" ? "+" : "−"}${pct(lead.changePct)}`
                : lead.action === "added"
                  ? "Added"
                  : "Cut",
        // A long fund name would push the line past ten words; the full name is behind "Why".
        label: wordsIn(`${lead.fund} ${fundWhat}`) <= CARD_WORDS ? `${lead.fund} ${fundWhat}` : `A tracked fund ${fundWhat}`,
      },
      id: `fund:${ticker}`,
      kind: "fund",
      section: lead.action === "sold" || lead.action === "trimmed" ? "changed" : "look",
      rank: 45,
      tickers: [ticker],
      text: `${lead.fund} ${what} in a 13F filed on ${longDay(lead.filedDate)}${others > 0 ? `, and ${countWord(others)} other tracked ${others === 1 ? "fund" : "funds"} filed on ${name} this week` : ""}.`,
      short: `${lead.fund} ${lead.action === "sold" ? "sold" : lead.action === "new" ? "bought" : lead.action === "added" ? "added to" : "cut"} ${name}`,
      href: `/follow/${encodeURIComponent(lead.slug)}`,
      linkLabel: lead.fund,
      tone: lead.action === "sold" || lead.action === "trimmed" ? "down" : "up",
      source: "SEC form 13F",
      asOf: lead.filedDate,
      data: { ticker, fund: lead.fund, action: lead.action, change_pct: lead.changePct, filed: lead.filedDate, other_funds: others },
    });
  }

  /* insiders (Form 4) */
  const insiderTotals = new Map<string, { sold: number; planned: number; bought: number; buyers: Set<string>; latest: string }>();
  for (const trade of inputs.insiders) {
    if (!inWeek(inputs, trade.filedDate) || trade.valueUsd === null) continue;
    const row = insiderTotals.get(trade.ticker) ?? { sold: 0, planned: 0, bought: 0, buyers: new Set<string>(), latest: trade.filedDate };
    if (trade.action === "sell") {
      row.sold += trade.valueUsd;
      if (trade.planned) row.planned += trade.valueUsd;
    } else {
      row.bought += trade.valueUsd;
      row.buyers.add(trade.insider);
    }
    if (trade.filedDate > row.latest) row.latest = trade.filedDate;
    insiderTotals.set(trade.ticker, row);
  }
  for (const [ticker, row] of insiderTotals) {
    const name = nameOf(inputs, ticker);
    if (row.bought >= INSIDER_BUY_MIN) {
      const who = row.buyers.size === 1 ? "An insider" : `${countWord(row.buyers.size).replace(/^./, (c) => c.toUpperCase())} insiders`;
      facts.push({
        card: { figure: shortMoney(row.bought), label: `of ${name} stock bought by insiders` },
        id: `insider_buy:${ticker}`,
        kind: "insider",
        section: "look",
        rank: 50,
        tickers: [ticker],
        text: `${who} at ${name} bought ${money(row.bought)} of stock on the open market, in Form 4s filed this week.`,
        short: `insiders bought ${name}`,
        href: `/insiders/${encodeURIComponent(ticker)}`,
        linkLabel: `${name} insiders`,
        tone: "up",
        source: "SEC form 4",
        asOf: row.latest,
        data: { ticker, bought_usd: Math.round(row.bought), buyers: row.buyers.size },
      });
    }
    if (row.sold >= INSIDER_SELL_MIN) {
      const plannedShare = row.planned > 0 ? ` ${money(row.planned)} of it was under trading plans set in advance.` : "";
      facts.push({
        card: { figure: shortMoney(row.sold), label: `of ${name} stock sold by insiders` },
        id: `insider_sell:${ticker}`,
        kind: "insider",
        section: "hurt",
        rank: row.planned >= row.sold * 0.8 ? 35 : 55,
        tickers: [ticker],
        text: `${name} insiders sold ${money(row.sold)} of stock in Form 4s filed this week.${plannedShare}`,
        short: `${name} insiders sold ${money(row.sold)}`,
        href: `/insiders/${encodeURIComponent(ticker)}`,
        linkLabel: `${name} insiders`,
        tone: "down",
        source: "SEC form 4",
        asOf: row.latest,
        data: { ticker, sold_usd: Math.round(row.sold), planned_usd: Math.round(row.planned) },
      });
    }
  }

  /* Congress */
  const congress = inputs.congress.filter((trade) => inWeek(inputs, trade.disclosureDate)).sort((a, b) => (b.amountHigh ?? 0) - (a.amountHigh ?? 0));
  const congressLead = congress[0];
  if (congressLead) {
    const name = nameOf(inputs, congressLead.ticker);
    const size =
      congressLead.amountLow !== null && congressLead.amountHigh !== null
        ? ` worth ${money(congressLead.amountLow)} to ${money(congressLead.amountHigh)}`
        : "";
    const others = congress.length - 1;
    facts.push({
      card: {
        figure:
          congressLead.amountLow !== null && congressLead.amountHigh !== null
            ? `${shortMoney(congressLead.amountLow)}–${shortMoney(congressLead.amountHigh)}`
            : congressLead.action === "buy"
              ? "Bought"
              : "Sold",
        label: `${congressLead.person} ${congressLead.action === "buy" ? "bought" : "sold"} ${name}`,
      },
      id: `congress:${congressLead.ticker}:${congressLead.disclosureDate}`,
      kind: "congress",
      section: "look",
      rank: 30,
      tickers: [...new Set(congress.slice(0, 3).map((trade) => trade.ticker))],
      text: `${congressLead.person} disclosed ${congressLead.action === "buy" ? "buying" : "selling"} ${name}${size} on ${longDay(congressLead.disclosureDate)}${others > 0 ? `, one of ${countWord(congress.length)} trades in ${words.possessive} stocks disclosed by members of Congress this week` : ""}.`,
      short: `${congressLead.person} ${congressLead.action === "buy" ? "bought" : "sold"} ${name}`,
      href: `/stock/${encodeURIComponent(congressLead.ticker)}`,
      linkLabel: name,
      tone: congressLead.action === "buy" ? "up" : "down",
      source: "House and Senate disclosures",
      asOf: congressLead.disclosureDate,
      data: {
        ticker: congressLead.ticker,
        person: congressLead.person,
        amount_low: congressLead.amountLow,
        amount_high: congressLead.amountHigh,
        trades: congress.length,
      },
    });
  }

  /* concentration and hidden exposure */
  const exposure = inputs.exposure;
  if (exposure?.company && exposure.company.pct >= COMPANY_RISK_PCT) {
    const company = exposure.company;
    const via = company.fundPct >= 1 && company.via.length > 0 ? `, ${points(company.fundPct)} of it inside ${joinList(company.via.slice(0, 3))}` : "";
    facts.push({
      card: {
        figure: pct(company.pct),
        label: `of what ${inputs.subject === "example" ? "the example owns" : "you own"} is ${company.name}, counting funds`,
        visual: { kind: "share", pct: company.pct, benchmarkPct: null, label: company.ticker },
      },
      id: `concentration:${company.ticker}`,
      kind: "concentration",
      section: "hurt",
      rank: 65 + Math.min(20, company.pct - COMPANY_RISK_PCT),
      tickers: [company.ticker],
      text: `${company.name} is ${pct(company.pct)} of what ${inputs.subject === "example" ? "the example owns" : "you own"} once funds are counted${via}. One bad week for it moves the whole portfolio.`,
      short: `${company.name} is ${pct(company.pct)} of the portfolio`,
      href: "/portfolio/xray",
      linkLabel: "What you really own",
      tone: "down",
      source: "Holdings with funds opened up from their SEC filings",
      asOf: exposure.asOf ?? inputs.today,
      data: { ticker: company.ticker, share_pct: round(company.pct, 1), via_funds_points: round(company.fundPct, 1) },
    });
  } else if (exposure?.company && exposure.company.fundPct >= 3 && exposure.company.pct >= 10) {
    const company = exposure.company;
    facts.push({
      card: {
        figure: pct(company.pct),
        label: `of what ${inputs.subject === "example" ? "the example owns" : "you own"} is ${company.name}, counting funds`,
        visual: { kind: "share", pct: company.pct, benchmarkPct: null, label: company.ticker },
      },
      id: `hidden:${company.ticker}`,
      kind: "concentration",
      section: "look",
      rank: 40,
      tickers: [company.ticker],
      text: `${company.name} is ${pct(company.pct)} of what ${inputs.subject === "example" ? "the example owns" : "you own"} once funds are counted, ${points(company.fundPct)} of it inside ${joinList(company.via.slice(0, 3))}.`,
      short: `${company.name} is ${pct(company.pct)} once funds are counted`,
      href: "/portfolio/xray",
      linkLabel: "What you really own",
      tone: "flat",
      source: "Holdings with funds opened up from their SEC filings",
      asOf: exposure.asOf ?? inputs.today,
      data: { ticker: company.ticker, share_pct: round(company.pct, 1), via_funds_points: round(company.fundPct, 1) },
    });
  }
  if (exposure?.sector && exposure.sector.pct >= SECTOR_RISK_PCT) {
    const sector = exposure.sector;
    const bench = sector.benchmarkPct !== null ? `, against ${pct(sector.benchmarkPct)} of the S&P 500` : "";
    facts.push({
      card: {
        figure: pct(sector.pct),
        label:
          sector.benchmarkPct !== null
            ? `in ${sector.sector}, against ${pct(sector.benchmarkPct)} of the S&P 500`
            : `of ${words.portfolio} is in ${sector.sector}`,
        visual: { kind: "share", pct: sector.pct, benchmarkPct: sector.benchmarkPct, label: sector.sector },
      },
      id: `sector:${sector.sector}`,
      kind: "sector",
      section: "hurt",
      rank: 60,
      tickers: [],
      text: `${sector.sector} is ${pct(sector.pct)} of ${words.portfolio} once funds are counted${bench}. A bad stretch for that one sector would hit most of it.`,
      short: `${sector.sector} is ${pct(sector.pct)} of the portfolio`,
      href: "/portfolio/xray",
      linkLabel: "What you really own",
      tone: "down",
      source: "Holdings with funds opened up from their SEC filings",
      asOf: exposure.asOf ?? inputs.today,
      data: { sector: sector.sector, share_pct: round(sector.pct, 1), sp500_pct: sector.benchmarkPct === null ? null : round(sector.benchmarkPct, 1) },
    });
  }

  /* dividends */
  const horizon = addDays(inputs.week.endDay ?? inputs.week.friday, DIVIDEND_LOOKAHEAD_DAYS);
  const after = inputs.week.endDay ?? inputs.week.friday;
  const nextDividends = inputs.dividends
    .filter((dividend): dividend is typeof dividend & { exDate: string; perShare: number } =>
      dividend.exDate !== null && dividend.perShare !== null && dividend.perShare > 0 && dividend.exDate > after && dividend.exDate <= horizon,
    )
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  if (nextDividends.length > 0) {
    const lines = nextDividends.slice(0, 3).map((dividend) => {
      const amount = dividend.amount !== null && dividend.amount > 0 ? `, about ${money(dividend.amount)} on ${words.shares}` : "";
      return `${dividend.name} goes ex-dividend on ${shortDay(dividend.exDate)} (${cents(dividend.perShare)} a share${amount})`;
    });
    const data: Record<string, string | number | null> = {};
    for (const dividend of nextDividends.slice(0, 3)) {
      data[`${dividend.ticker}_ex_date`] = dividend.exDate;
      data[`${dividend.ticker}_per_share`] = dividend.perShare;
      if (dividend.amount !== null) data[`${dividend.ticker}_amount`] = round(dividend.amount);
    }
    const nextUp = nextDividends[0]!;
    const moreDividends = nextDividends.length > 1 ? `, then ${countWord(nextDividends.length - 1)} more` : "";
    facts.push({
      card:
        nextUp.amount !== null && nextUp.amount > 0
          ? { figure: shortMoney(nextUp.amount), label: `from ${nextUp.name}, ex-dividend ${shortDay(nextUp.exDate)}${moreDividends}` }
          : { figure: cents(nextUp.perShare), label: `a share from ${nextUp.name}, ex-dividend ${shortDay(nextUp.exDate)}${moreDividends}` },
      id: "dividends",
      kind: "dividend",
      section: "look",
      rank: 35,
      tickers: nextDividends.slice(0, 3).map((dividend) => dividend.ticker),
      text: `Announced dividends coming up: ${joinList(lines)}.`,
      short: `${nextDividends[0]!.name} goes ex-dividend on ${shortDay(nextDividends[0]!.exDate)}`,
      href: "/portfolio/dividends",
      linkLabel: "Dividends",
      tone: "up",
      source: "Announced dividends",
      asOf: inputs.today,
      data,
    });
  }
  const atRisk = inputs.dividends
    .filter((dividend, index, all) => dividend.atRisk && dividend.payout !== null && all.findIndex((other) => other.ticker === dividend.ticker) === index)
    .sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0))[0];
  if (atRisk) {
    facts.push({
      card:
        atRisk.payout! < 0
          ? { figure: "Loss", label: `${atRisk.name} pays a dividend while losing money` }
          : {
              figure: pct(atRisk.payout!),
              label: `of ${atRisk.name}'s earnings go out as dividends`,
              visual: { kind: "share", pct: Math.min(100, atRisk.payout!), benchmarkPct: null, label: atRisk.ticker },
            },
      id: `dividend_risk:${atRisk.ticker}`,
      kind: "dividend_risk",
      section: "hurt",
      rank: 40,
      tickers: [atRisk.ticker],
      text:
        atRisk.payout! < 0
          ? `${atRisk.name} still pays a dividend while it is losing money, which is hard to keep up for long.`
          : `${atRisk.name} pays out ${pct(atRisk.payout!)} of its earnings as dividends, which leaves little room if profits slip.`,
      short: `${atRisk.name}'s dividend looks stretched`,
      href: "/portfolio/dividends",
      linkLabel: "Dividends",
      tone: "down",
      source: "Dividend history and earnings",
      asOf: inputs.today,
      data: { ticker: atRisk.ticker, payout_pct: round(atRisk.payout!, 1) },
    });
  }

  /* reasons the person gave that weakened or broke (lib/thesis-watch) */
  for (const reason of inputs.reasons ?? []) {
    const name = nameOf(inputs, reason.ticker);
    const phrase = reason.verdict === "broken" ? "looks broken" : "is weaker";
    facts.push({
      card: { figure: reason.verdict === "broken" ? "Broken" : "Weaker", label: `your reason for owning ${name}` },
      id: `reason:${reason.ticker}`,
      kind: "reason",
      section: "hurt",
      rank: reason.verdict === "broken" ? 80 : 58,
      tickers: [reason.ticker],
      text: `Your reason for owning ${name} ${phrase}. ${reason.finding}`,
      short: `your reason for owning ${name} ${phrase}`,
      href: `/stock/${encodeURIComponent(reason.ticker)}`,
      linkLabel: "Your reason",
      tone: "down",
      source: reason.source,
      asOf: reason.asOf,
      data: { ...reason.data, ticker: reason.ticker },
    });
  }

  /* the closest past shock */
  const stress = inputs.stress;
  if (stress && stress.portfolio < 0 && stress.portfolio <= stress.market - STRESS_GAP_POINTS) {
    facts.push({
      card: {
        figure: signedPct(stress.portfolio),
        sign: "down",
        label: `for today's mix in the ${stress.name}`,
        visual: { kind: "pair", portfolio: round(stress.portfolio, 1), market: round(stress.market, 1) },
      },
      id: "stress",
      kind: "stress",
      section: "hurt",
      rank: 25,
      tickers: [],
      text: `In the ${stress.name}, today's mix would have fallen ${pct(stress.portfolio)}, while the S&P 500 ${stress.market >= 0 ? "rose" : "fell"} ${pct(stress.market)}. It is history, not a forecast, but it shows which way this mix leans.`,
      short: `this mix fell harder than the market in the ${stress.name}`,
      href: "/portfolio/stress",
      linkLabel: "Stress test",
      tone: "down",
      source: "Daily closes with dividends",
      asOf: stress.end,
      data: { episode: stress.name, start: stress.start, end: stress.end, portfolio_pct: round(stress.portfolio, 1), sp500_pct: round(stress.market, 1) },
    });
  }

  // A card's line stays at ten words: a long company name gives way to its ticker (the logo sits beside it).
  for (const fact of facts) {
    const card = fact.card;
    if (!card || wordsIn(card.label) <= CARD_WORDS) continue;
    let label = card.label;
    for (const holding of inputs.holdings) {
      if (wordsIn(label) <= CARD_WORDS) break;
      if (holding.name && holding.name !== holding.ticker && wordsIn(holding.name) > 1) label = label.split(holding.name).join(holding.ticker);
    }
    if (exposure?.company && wordsIn(label) > CARD_WORDS) label = label.split(exposure.company.name).join(exposure.company.ticker);
    fact.card = { ...card, label };
  }

  return { facts, performance: perf, heldBack };
}

/** The next Monday-to-Friday day. */
function nextWeekday(day: string): string {
  let next = addDays(day, 1);
  while (weekdayOf(next) > 4) next = addDays(next, 1);
  return next;
}
