import { fmtPlanDay } from "@/lib/dividend-plan";
import { whenWords } from "@/lib/earnings-season";
import type { CallWord } from "@/lib/portfolio-ideas/types";
import type { DailySeries, Portfolio, PortfolioPosition } from "@/lib/portfolio-shared";
import type { Verdict } from "@/lib/thesis-watch/rules";

import type { HomeMode } from "./pick";

/**
 * My stocks, about the person's stocks (owner, Nov 11: "I'd rather have more useful stuff about my stocks"):
 * one line on how they did today and over the past week against the S&P 500, then each holding as a small card
 * with its move, the person's gain, our call with its own level, and the one thing that matters for it right now.
 * Built only from loaded data (./stocks-server.ts); anything we cannot back is left out. Pure, so it can be tested.
 */

export type PlainCall = "Buy more" | "Keep" | "Sell some";

export const PLAIN_CALL: Record<CallWord, PlainCall> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };

/** Our call on one stock and its level, the level only for a stock the viewer's plan covers. */
export type CallInfo = {
  call: CallWord;
  /** The buy-more level, only when the call is to buy more. */
  addBelow: number | null;
  /** The sell-some level, only when the call is to sell some. */
  trimAbove: number | null;
  /** The call's reason from the company's own numbers, levels taken out for an uncovered stock. */
  reason: string | null;
};

export type CallChangeInfo = { day: string; from: PlainCall | null; to: PlainCall };

export type InsiderBuyInfo = {
  /** Open-market buys by executives and directors in the window. */
  count: number;
  /** Their combined value in dollars, when the filings give one. */
  value: number | null;
  /** The newest buy's day. */
  day: string;
  /** "the CEO", when there is one buyer with a role. */
  who: string | null;
};

export type WeekMove = {
  /** Five sessions: the close on `from` to the close on `to`. */
  from: string;
  to: string;
  pct: number;
  /** Dollars, when share counts exist. */
  dollars: number | null;
  marketPct: number | null;
};

/** What the reason watcher says about one holding (lib/thesis-watch). */
export type ReasonCheck = { ticker: string; verdict: Verdict; signal: string | null };

/** A tax-loss or trim idea on one holding (lib/portfolio-ideas). */
export type IdeaFact = { ticker: string; kind: "loss"; loss: number } | { ticker: string; kind: "weight"; pct: number };

export type BookFacts = {
  calls: Record<string, CallInfo>;
  /** A confirmed reason for the stock's move on the price day, one line. */
  moves: Record<string, string>;
  callChanges: Record<string, CallChangeInfo>;
  insiderBuys: Record<string, InsiderBuyInfo>;
  reasons: ReasonCheck[];
  ideas: IdeaFact[];
};

/** One holding over the past month (21 sessions) against the S&P 500 over the same days. */
export type MonthMove = { pct: number; marketPct: number | null };

export type BookSource = {
  mode: HomeMode;
  today: string;
  portfolio: Portfolio;
  /** The New York day the prices are from. */
  pricesDay: string | null;
  /** The S&P 500 on the same day, or null when it is from another day. */
  marketPct: number | null;
  week: WeekMove | null;
  /** Each holding's past month against the S&P 500 (monthMoves), for a card with nothing more pressing to say. */
  month?: Record<string, MonthMove> | null;
  facts: Omit<BookFacts, "reasons" | "ideas">;
};

export type FactKind = "report" | "call" | "move" | "loss" | "weight" | "insider" | "level" | "reason" | "next-report" | "call-reason" | "month" | "size";

export type StockFact = {
  kind: FactKind;
  text: string;
  /** Higher first. 50 and up asks for the person's attention; below is context. */
  priority: number;
};

export const ATTENTION = 50;

export type StockCard = {
  ticker: string;
  name: string;
  href: string;
  dayPct: number | null;
  /** Dollars the holding moved on the price day, when its share count is known. */
  dayMove: number | null;
  gain: number | null;
  gainPct: number | null;
  weight: number | null;
  call: PlainCall | null;
  /** "below $180" for Buy more, "above $240" for Sell some, null for Keep or an uncovered stock. */
  level: string | null;
  fact: StockFact | null;
};

export type BookLead = {
  /** One line: how the stocks did against the S&P 500. */
  headline: string;
  today: { pct: number; dollars: number | null; marketPct: number | null; label: string } | null;
  week: WeekMove | null;
  gain: { dollars: number; pct: number | null; counted: number; of: number } | null;
};

/* ── formatting ─────────────────────────────────────────────────────────── */

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** "+1.2%", "−0.4%". */
export function signedPct(value: number, digits = 1): string {
  const rounded = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}%`;
}

/** "$1,240", "$12.40" under $100. */
export function dollars(value: number): string {
  const abs = Math.abs(value);
  return `$${abs.toLocaleString("en-US", { maximumFractionDigits: abs < 100 ? 2 : 0, minimumFractionDigits: abs < 100 && abs % 1 !== 0 ? 2 : 0 })}`;
}

/** "+$1,240", "−$124". */
export function signedDollars(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded >= 0 ? "+" : "−"}${dollars(rounded)}`;
}

/** "$1.2M", "$450,000": an insider's buy. */
function bigDollars(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (value >= 10_000) return `$${Math.round(value / 1000).toLocaleString("en-US")}K`;
  return dollars(value);
}

function levelWords(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return !trimmed || /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** The first sentence of a longer text, when it is short enough to read at a glance; else null. */
export function firstSentence(text: string | null | undefined, max = 120): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  // Not after an initial ("U.S. Steel"): a sentence ends after a lower-case letter, a digit, "%" or ")".
  const first = clean.split(/(?<=[a-z0-9%)][.!?])\s+(?=[A-Z])/)[0]!.trim();
  return first.length <= max ? sentence(first) : null;
}

const SESSION: Record<string, string> = { bmo: "before the open", amc: "after the close", during: "during the day" };

/* ── the one thing per stock ───────────────────────────────────────────── */

const REPORT_SOON_DAYS = 7;
const NEXT_REPORT_DAYS = 45;
const BIG_MOVE_PCT = 3;
/** How close the price must be to the call's level to say so, percent of the price. */
const NEAR_LEVEL_PCT = 3;

function daysFrom(today: string, day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

const VERDICT_WORDS: Record<Verdict, string> = { holds: "still holds", weaker: "is weaker", broken: "no longer holds", played_out: "has played out" };

/**
 * Every fact we can back for one holding, highest priority first. The owner's order: a report soon, a call that
 * changed, a big move with its confirmed reason, insider buys, close to its level, the person's reason that broke.
 * A tax-loss idea sits with the moves (it asks for a decision); context (the next report further out, the call's
 * own reason) only fills a card that has nothing else.
 */
export function stockFacts(input: {
  position: PortfolioPosition;
  today: string;
  example: boolean;
  calls: BookFacts["calls"];
  moves: BookFacts["moves"];
  callChanges: BookFacts["callChanges"];
  insiderBuys: BookFacts["insiderBuys"];
  reasons: BookFacts["reasons"];
  ideas: BookFacts["ideas"];
}): StockFact[] {
  const { position, today } = input;
  const ticker = position.ticker;
  const call = input.calls[ticker] ?? null;
  const plain = call ? PLAIN_CALL[call.call] : null;
  const out: StockFact[] = [];
  const your = input.example ? "the example's" : "your";

  const report = position.nextEarnings;
  const gap = report ? daysFrom(today, report.date) : null;
  if (report && gap !== null && gap >= 0 && gap <= REPORT_SOON_DAYS) {
    const session = report.time ? SESSION[report.time] : null;
    out.push({ kind: "report", text: `Reports ${whenWords(report.date, today).replace(/^on /, "")}${session ? `, ${session}` : ""}.`, priority: 100 - gap });
  }

  const change = input.callChanges[ticker];
  // Only a change to the call the card shows: a snapshot that lags the steady call must not contradict it.
  if (change && change.to === plain) {
    out.push({
      kind: "call",
      text: change.from ? `Our call moved from ${change.from} to ${change.to} on ${fmtPlanDay(change.day)}.` : `Our call moved to ${change.to} on ${fmtPlanDay(change.day)}.`,
      priority: 90,
    });
  }

  const reason = input.moves[ticker];
  if (reason && fin(position.dayPct) && Math.abs(position.dayPct) >= BIG_MOVE_PCT) {
    out.push({ kind: "move", text: sentence(reason), priority: 80 });
  }

  for (const idea of input.ideas) {
    if (idea.ticker !== ticker) continue;
    // Never a sale beside a Keep or Buy more call (owner rule 9): the tax-loss idea only stands where we would sell.
    if (idea.kind === "loss" && (plain === "Sell some" || plain === null)) {
      out.push({ kind: "loss", text: `${dollars(Math.abs(idea.loss))} below what ${input.example ? "was" : "you"} paid, a loss ${input.example ? "it could book" : "you could book"} for tax.`, priority: 75 });
    }
    if (idea.kind === "weight") {
      out.push({ kind: "weight", text: `${Math.round(idea.pct)}% of ${your} money once funds are counted.`, priority: 72 });
    }
  }

  const insider = input.insiderBuys[ticker];
  if (insider) {
    const value = insider.value !== null && insider.value > 0 ? ` ${bigDollars(insider.value)}` : "";
    const who = insider.count === 1 ? capital(insider.who ?? "an insider") : `${insider.count} insiders`;
    out.push({ kind: "insider", text: `${who} bought${value} of stock${insider.count === 1 ? ` on ${fmtPlanDay(insider.day)}` : ` by ${fmtPlanDay(insider.day)}`}.`, priority: 70 });
  }

  const price = position.price;
  // Only beside the level the card shows (callLevel), and without repeating its price.
  if (call && fin(price) && price > 0 && callLevel(call, price) !== null) {
    if (call.call === "Add" && call.addBelow !== null) {
      const away = ((price - call.addBelow) / price) * 100;
      if (away <= 0) out.push({ kind: "level", text: `At ${levelWords(price)}, it is under its buy-more level.`, priority: 62 });
      else if (away <= NEAR_LEVEL_PCT) out.push({ kind: "level", text: `${away.toFixed(1)}% above its buy-more level.`, priority: 60 });
    }
    if (call.call === "Trim" && call.trimAbove !== null) {
      const away = ((call.trimAbove - price) / price) * 100;
      if (away <= 0) out.push({ kind: "level", text: `At ${levelWords(price)}, it is over its sell-some level.`, priority: 62 });
      else if (away <= NEAR_LEVEL_PCT) out.push({ kind: "level", text: `${away.toFixed(1)}% under its sell-some level.`, priority: 60 });
    }
  }

  const check = input.reasons.find((item) => item.ticker === ticker && item.verdict !== "holds");
  // A reason that played out, weakened or broke argues against adding, so it never sits under a Buy more call (owner
  // rule 9): "it is no longer cheap" beside "Buy more" reads as two calls at once. The card takes its next fact.
  if (check && plain !== "Buy more") {
    const owner = input.example ? "The example's reason for owning it" : "Your reason for owning it";
    const signal = firstSentence(check.signal, 110);
    out.push({ kind: "reason", text: signal ? `${owner} ${VERDICT_WORDS[check.verdict]}: ${signal.charAt(0).toLowerCase()}${signal.slice(1)}` : `${owner} ${VERDICT_WORDS[check.verdict]}.`, priority: check.verdict === "broken" ? 58 : 55 });
  }

  // Context, for a card with nothing pressing.
  if (report && gap !== null && gap > REPORT_SOON_DAYS && gap <= NEXT_REPORT_DAYS) {
    out.push({ kind: "next-report", text: `Next report ${fmtPlanDay(report.date)}.`, priority: 20 });
  }
  const why = firstSentence(call?.reason, 130);
  if (why) out.push({ kind: "call-reason", text: why, priority: 10 });

  return out.sort((a, b) => b.priority - a.priority);
}

/** The level that goes with the call, and only that one (owner rule 9): "below $180" for Buy more, "above $240" for Sell some. */
export function callLevel(call: CallInfo | null, price: number | null): string | null {
  if (!call) return null;
  // A level more than half the price away says little about today, as on the stock page.
  const near = (level: number) => !fin(price) || price <= 0 || Math.abs(level - price) / price <= 0.5;
  if (call.call === "Add" && call.addBelow !== null && near(call.addBelow)) return `below ${levelWords(call.addBelow)}`;
  if (call.call === "Trim" && call.trimAbove !== null && near(call.trimAbove)) return `above ${levelWords(call.trimAbove)}`;
  return null;
}

/**
 * Each holding as a card, the ones that need the person first (by how much), then by size. Every holding is listed:
 * a long list scrolls inside its box rather than being cut (owner rule 5).
 */
export function stockCards(source: BookSource, extra: Pick<BookFacts, "reasons" | "ideas">): StockCard[] {
  const example = source.mode === "example";
  const sized = source.portfolio.positions.filter((position) => fin(position.weight));
  const biggest = sized.reduce<PortfolioPosition | null>((top, position) => (!top || position.weight! > top.weight! ? position : top), null);
  const cards = source.portfolio.positions.map((position): StockCard => {
    const call = source.facts.calls[position.ticker] ?? null;
    const facts = stockFacts({ position, today: source.today, example, ...source.facts, ...extra });
    const pct = fin(position.weight) && sized.length > 1 ? `${position.weight! >= 9.5 ? Math.round(position.weight!) : position.weight!.toFixed(1).replace(/\.0$/, "")}%` : null;
    const size = pct
      ? position === biggest
        ? `${example ? "The example's biggest holding, " : "Your biggest holding, "}${pct} of ${example ? "its" : "your"} money`
        : `${pct} of ${example ? "the example's" : "your"} money`
      : null;
    // Below the call's own reason: its share of the money and how it did over the past month against the S&P 500, so
    // a fund (no call, no report) or a quiet stock still says something real (owner rule 10).
    const month = source.month?.[position.ticker];
    if (month && fin(month.pct)) {
      const said = monthWords(month);
      facts.push({ kind: "month", text: size ? `${size}, ${said}.` : `${capital(said)}.`, priority: 8 });
      // A bare "Next report Dec 10." is thin on its own (council, Nov 11): the month goes with it.
      const report = facts.find((fact) => fact.kind === "next-report");
      if (report && facts.every((fact) => fact === report || fact.priority < report.priority)) {
        report.text = `${report.text.replace(/\.$/, "")}; ${said}.`;
      }
    }
    // Nothing else to say: its share of the money, so no card is left with nothing on it.
    if (facts.length === 0 && size) facts.push({ kind: "size", text: `${size}.`, priority: 5 });
    facts.sort((a, b) => b.priority - a.priority);
    return {
      ticker: position.ticker,
      name: position.name,
      href: `/stock/${encodeURIComponent(position.ticker)}`,
      dayPct: fin(position.dayPct) ? position.dayPct : null,
      dayMove: fin(position.dayMove) ? position.dayMove : null,
      gain: fin(position.gain) ? position.gain : null,
      gainPct: fin(position.gainPct) ? position.gainPct : null,
      weight: fin(position.weight) ? position.weight : null,
      call: call ? PLAIN_CALL[call.call] : null,
      level: callLevel(call, position.price),
      fact: facts[0] ?? null,
    };
  });
  const urgency = (card: StockCard) => (card.fact && card.fact.priority >= ATTENTION ? card.fact.priority : 0);
  return cards.sort((a, b) => urgency(b) - urgency(a) || (b.weight ?? -1) - (a.weight ?? -1) || a.ticker.localeCompare(b.ticker));
}

/* ── the lead line ─────────────────────────────────────────────────────── */

/** Within this many points of the S&P 500, the stocks moved "in line" with it. */
const IN_LINE_POINTS = 0.15;

function dayLabel(pricesDay: string | null, today: string): string {
  return !pricesDay || pricesDay === today ? "today" : `on ${fmtPlanDay(pricesDay)}`;
}

function verb(pct: number): string {
  return Math.abs(pct) < 0.05 ? "were flat" : pct > 0 ? `rose ${Math.abs(pct).toFixed(1)}%` : `fell ${Math.abs(pct).toFixed(1)}%`;
}

/** "Your stocks rose 1.2% today, 0.8 points more than the S&P 500." One idea, one comparison. */
export function leadHeadline(input: { pct: number; marketPct: number | null; when: string; example: boolean; average: boolean }): string {
  const who = input.example ? "The example's stocks" : "Your stocks";
  const move = `${who} ${verb(input.pct)}${input.average ? " on average" : ""} ${input.when}`;
  if (input.marketPct === null) return `${move}.`;
  const gap = input.pct - input.marketPct;
  if (Math.abs(gap) < IN_LINE_POINTS) return `${move}, in line with the S&P 500.`;
  const points = `${Math.abs(gap).toFixed(1)} ${Math.abs(gap).toFixed(1) === "1.0" ? "point" : "points"}`;
  return `${move}, ${points} ${gap > 0 ? "better" : "worse"} than the S&P 500.`;
}

export function bookLead(source: BookSource): BookLead | null {
  const { portfolio } = source;
  const positions = portfolio.positions;
  if (positions.length === 0) return null;
  const example = source.mode === "example";
  const when = dayLabel(source.pricesDay, source.today);
  const totals = portfolio.totals;
  // With share counts, the day in dollars and percent of the value; without, the plain average of the moves.
  const moved = positions.filter((position) => fin(position.dayPct));
  const average = !fin(totals.dayPct) && moved.length > 0;
  const dayPct = fin(totals.dayPct) ? totals.dayPct : average ? moved.reduce((sum, position) => sum + position.dayPct!, 0) / moved.length : null;
  const today = dayPct !== null ? { pct: dayPct, dollars: fin(totals.dayMove) ? totals.dayMove : null, marketPct: source.marketPct, label: when === "today" ? "Today" : capital(when.replace(/^on /, "")) } : null;
  const gain = fin(totals.gain) && totals.withCost > 0 ? { dollars: totals.gain, pct: fin(totals.gainPct) ? totals.gainPct : null, counted: totals.withCost, of: totals.holdings } : null;
  const headline = today
    ? leadHeadline({ pct: today.pct, marketPct: today.marketPct, when, example, average })
    : source.week
      ? leadHeadline({ pct: source.week.pct, marketPct: source.week.marketPct, when: "over the past five trading days", example, average: source.week.dollars === null })
      : example
        ? "The example's stocks, the ones that need a look first."
        : "Your stocks, the ones that need you first.";
  return { headline, today, week: source.week, gain };
}

/* ── the past week, from stored closes ─────────────────────────────────── */

const WEEK_SESSIONS = 5;
/** The week is said only when the stocks it covers hold at least this share of the value. */
const WEEK_MIN_COVER = 0.8;

/** The close on `day`, else the last one before it within a few days (a fund's close can be a day late). */
function closeOnOrBefore(series: DailySeries | undefined, day: string): number | null {
  if (!series) return null;
  const floor = new Date(Date.parse(`${day}T00:00:00Z`) - 4 * 86_400_000).toISOString().slice(0, 10);
  for (let i = Math.min(series.dates.length, series.closes.length) - 1; i >= 0; i--) {
    const date = series.dates[i]!;
    if (date > day) continue;
    if (date < floor) return null;
    return fin(series.closes[i]) && series.closes[i]! > 0 ? series.closes[i]! : null;
  }
  return null;
}

const MONTH_SESSIONS = 21;
const MONTH_IN_LINE_POINTS = 0.5;

/**
 * "down 7.2% over the past month, 4.9 points behind the S&P 500": the holding's own month and its own gap to the
 * market, so no two cards repeat the same "against −2.3% for the S&P 500" (owner rule 1). The gap is worked out from
 * the one-decimal figures. Under 0.05% either way reads "flat"; within half a point, "in line with".
 */
export function monthWords(month: MonthMove): string {
  const shown = (value: number) => Number(value.toFixed(1));
  const pct = shown(month.pct);
  const move = Math.abs(month.pct) < 0.05 ? "flat over the past month" : `${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% over the past month`;
  if (month.marketPct === null || !fin(month.marketPct)) return move;
  const gap = Number((pct - shown(month.marketPct)).toFixed(1));
  // Over a month, half a point either way is in line with the market.
  if (Math.abs(gap) < MONTH_IN_LINE_POINTS) return `${move}, in line with the S&P 500`;
  return `${move}, ${Math.abs(gap).toFixed(1)} ${Math.abs(gap) === 1 ? "point" : "points"} ${gap > 0 ? "ahead of" : "behind"} the S&P 500`;
}

/**
 * Each holding over the past month (21 sessions) up to the prices on screen, against SPY over the same days: its
 * stored close then to its price now. A holding without a close that far back is left out.
 */
export function monthMoves(input: { positions: PortfolioPosition[]; series: Map<string, DailySeries>; benchmark: DailySeries | null; pricesDay: string | null; marketPct: number | null }): Record<string, MonthMove> {
  const out: Record<string, MonthMove> = {};
  const spy = input.benchmark;
  const day = input.pricesDay;
  if (!spy || !day) return out;
  let last = Math.min(spy.dates.length, spy.closes.length) - 1;
  while (last >= 0 && spy.dates[last]! > day) last--;
  if (last < 0) return out;
  const stored = spy.dates[last] === day;
  const start = stored ? last - MONTH_SESSIONS : last - (MONTH_SESSIONS - 1);
  if (start < 0) return out;
  const from = spy.dates[start]!;
  const spyEnd = stored ? spy.closes[last]! : input.marketPct !== null ? spy.closes[last]! * (1 + input.marketPct / 100) : null;
  const marketPct = spyEnd !== null ? (spyEnd / spy.closes[start]! - 1) * 100 : null;
  for (const position of input.positions) {
    if (position.kind !== "holding" || !fin(position.price) || position.price! <= 0) continue;
    const then = closeOnOrBefore(input.series.get(position.ticker), from);
    if (then === null) continue;
    out[position.ticker] = { pct: (position.price! / then - 1) * 100, marketPct };
  }
  return out;
}

/**
 * The past five sessions up to the prices on screen (`pricesDay`, today's when the market is open): each holding
 * from its stored close five sessions back to its price now, against SPY over the same days (its stored close, or
 * today's S&P move on top of yesterday's close while today is not stored yet). In dollars when share counts exist
 * (shares times the change), else the plain average of the moves. Null when the closes cover too little of the
 * holdings, or SPY has no five sessions.
 */
export function weekMove(input: { positions: PortfolioPosition[]; series: Map<string, DailySeries>; benchmark: DailySeries | null; pricesDay: string | null; marketPct: number | null }): WeekMove | null {
  const spy = input.benchmark;
  const day = input.pricesDay;
  if (!spy || !day) return null;
  let last = Math.min(spy.dates.length, spy.closes.length) - 1;
  while (last >= 0 && spy.dates[last]! > day) last--;
  if (last < 0) return null;
  const stored = spy.dates[last] === day;
  const start = stored ? last - WEEK_SESSIONS : last - (WEEK_SESSIONS - 1);
  if (start < 0) return null;
  const from = spy.dates[start]!;
  const spyEnd = stored ? spy.closes[last]! : input.marketPct !== null ? spy.closes[last]! * (1 + input.marketPct / 100) : null;
  const marketPct = spyEnd !== null ? (spyEnd / spy.closes[start]! - 1) * 100 : null;
  const held = input.positions.filter((position) => position.kind === "holding" && fin(position.price) && position.price! > 0);
  const all = input.positions.filter((position) => position.kind === "holding");
  const withShares = held.filter((position) => fin(position.shares) && position.shares! > 0);
  if (withShares.length > 0) {
    let begin = 0;
    let finish = 0;
    let coveredValue = 0;
    const totalValue = all.reduce((sum, position) => sum + (fin(position.value) ? position.value! : 0), 0);
    for (const position of withShares) {
      const a = closeOnOrBefore(input.series.get(position.ticker), from);
      if (a === null) continue;
      begin += position.shares! * a;
      finish += position.shares! * position.price!;
      coveredValue += fin(position.value) ? position.value! : 0;
    }
    if (begin <= 0 || totalValue <= 0 || coveredValue / totalValue < WEEK_MIN_COVER) return null;
    return { from, to: day, pct: (finish / begin - 1) * 100, dollars: finish - begin, marketPct };
  }
  const moves = held
    .map((position) => {
      const a = closeOnOrBefore(input.series.get(position.ticker), from);
      return a !== null ? (position.price! / a - 1) * 100 : null;
    })
    .filter((move): move is number => move !== null);
  if (all.length === 0 || moves.length / all.length < WEEK_MIN_COVER) return null;
  return { from, to: day, pct: moves.reduce((sum, move) => sum + move, 0) / moves.length, dollars: null, marketPct };
}

/* ── the facts from the slower tools ───────────────────────────────────── */

/** The ideas and reason findings, cut to the one fact each gives a card (./stocks.ts stockFacts). */
export function extraFacts(input: {
  ideas: { losses: Array<{ ticker: string; loss: number }>; plan: { trims: Array<{ ticker: string; kind: string; before: number }> } } | null;
  reasons: Array<{ ticker: string; verdict: BookFacts["reasons"][number]["verdict"]; signals: Array<{ text?: string | null }> }> | null;
}): Pick<BookFacts, "reasons" | "ideas"> {
  const ideas: BookFacts["ideas"] = [];
  for (const loss of input.ideas?.losses ?? []) if (fin(loss.loss) && loss.loss < 0) ideas.push({ ticker: loss.ticker.toUpperCase(), kind: "loss", loss: loss.loss });
  // The biggest company over the line only, so no two cards make the same point.
  const trim = (input.ideas?.plan.trims ?? []).filter((one) => one.kind === "company" && fin(one.before) && one.before >= 10).sort((a, b) => b.before - a.before)[0];
  if (trim) ideas.push({ ticker: trim.ticker.toUpperCase(), kind: "weight", pct: trim.before });
  const reasons = (input.reasons ?? []).map((check) => ({ ticker: check.ticker.toUpperCase(), verdict: check.verdict, signal: check.signals[0]?.text?.trim() || null }));
  return { ideas, reasons };
}
