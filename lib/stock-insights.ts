/**
 * The read at the top of the stock page: what today's move means against the
 * stock's group, the market and its own history, what is coming (earnings and
 * how it has reacted before), and where the price sits against our call.
 *
 * Pure: the stock page stream loads the numbers (live quote, the group's live
 * median, SPY, stored daily closes, the earnings calendar, the call) and this
 * turns them into sentences. An insight that the data cannot back is left out.
 *
 * Gating: `levels` and `lastChange` must only be passed for a stock the viewer
 * covers. For anyone else they are null and no level is ever written here.
 */

import { CALL_MEANING, CALL_PLAIN } from "@/lib/plain-copy";
import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { dayGap, dayWord, fin, inDays, median, money, movedWord, pct, shortDay, signedPct } from "@/lib/insight-format";

export type DailyClose = { date: string; close: number };
export type CallWord = "Add" | "Hold" | "Trim";

export type StockInsightInput = {
  ticker: string;
  /** New York day of the run, YYYY-MM-DD. */
  today: string;
  /** New York day the live quote is from. */
  quoteDay: string | null;
  price: number | null;
  dayPct: number | null;
  /** Live median move of the stock's industry or sector, on the same day as the quote. */
  group: { label: string; medianPct: number; count: number } | null;
  /** SPY's live move on the same day as the quote. */
  marketPct: number | null;
  /** Stored adjusted daily closes, oldest first. */
  series: DailyClose[] | null;
  benchmark: DailyClose[] | null;
  /** The move explanation's headline, only when it is a real reason for this day's move. */
  moveReason: string | null;
  nextEarnings: { date: string; time: string | null } | null;
  pastEarnings: Array<{ date: string; time: string | null }>;
  call: { word: CallWord; writtenAt: string | null } | null;
  /** Covered stocks only. */
  levels: { addBelow: number | null; trimAbove: number | null } | null;
  /** Covered stocks only: the last time the call switched. */
  lastChange: { date: string; from: CallWord | null; to: CallWord; priceAtCall: number | null } | null;
  asOf?: string | null;
  /** False on the stock page, where the call sits right above the read: say the move, not the call a second time. */
  callInHeadline?: boolean;
};

const LOOKBACK = 252;

function returnsByDate(series: DailyClose[] | null | undefined, beforeDay: string | null): Array<{ date: string; r: number }> {
  if (!series || series.length < 2) return [];
  const out: Array<{ date: string; r: number }> = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    const cur = series[i]!;
    if (beforeDay && cur.date >= beforeDay) break;
    if (fin(prev.close) && fin(cur.close) && prev.close > 0 && cur.close > 0) out.push({ date: cur.date, r: (cur.close / prev.close - 1) * 100 });
  }
  return out;
}

/**
 * How unusual today's move is against the S&P 500, from stored history: the
 * most recent earlier session where the stock did as badly (or as well)
 * against SPY. Null when the gap is small or the history is short.
 */
export function relativeDayRank(input: {
  dayPct: number;
  marketPct: number;
  quoteDay: string | null;
  series: DailyClose[] | null;
  benchmark: DailyClose[] | null;
}): { rel: number; since: string | null; sessions: number; window: number } | null {
  const rel = input.dayPct - input.marketPct;
  if (Math.abs(rel) < 1.5) return null;
  const stock = returnsByDate(input.series, input.quoteDay);
  const bench = new Map(returnsByDate(input.benchmark, input.quoteDay).map((item) => [item.date, item.r]));
  const history = stock
    .filter((item) => bench.has(item.date))
    .map((item) => ({ date: item.date, rel: item.r - bench.get(item.date)! }))
    .slice(-LOOKBACK);
  if (history.length < 60) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const past = history[i]!.rel;
    if (rel < 0 ? past <= rel : past >= rel) {
      const sessions = history.length - i;
      return sessions >= 21 ? { rel, since: history[i]!.date, sessions, window: history.length } : null;
    }
  }
  return { rel, since: null, sessions: history.length, window: history.length };
}

/** Median absolute daily move over the last three months, before the quote day. */
export function usualMove(series: DailyClose[] | null, quoteDay: string | null): number | null {
  const returns = returnsByDate(series, quoteDay).slice(-63);
  if (returns.length < 40) return null;
  return median(returns.map((item) => Math.abs(item.r)));
}

/**
 * The move the session after a report: after-the-close reports from that
 * day's close to the next, before-the-open reports from the prior close to
 * that day's close. Unknown timing spans both. Null when the closes are not on
 * file around the date.
 */
export function earningsReaction(series: DailyClose[] | null, date: string, time: string | null): number | null {
  if (!series || series.length < 3) return null;
  const day = date.slice(0, 10);
  const at = series.findIndex((point) => point.date >= day);
  if (at <= 0) return null;
  const on = series[at]!.date === day;
  let base: DailyClose | undefined;
  let after: DailyClose | undefined;
  if (time === "amc") {
    if (!on) return null;
    base = series[at];
    after = series[at + 1];
  } else if (time === "bmo" || time === "during") {
    if (!on) return null;
    base = series[at - 1];
    after = series[at];
  } else {
    base = series[at - 1];
    after = on ? series[at + 1] : series[at];
  }
  if (!base || !after || !(base.close > 0) || !(after.close > 0)) return null;
  const span = dayGap(base.date, after.date);
  if (span === null || span > 6) return null;
  return (after.close / base.close - 1) * 100;
}

function timeWord(time: string | null): string {
  return time === "amc" ? " after the close" : time === "bmo" ? " before the open" : "";
}

function closeAround(series: DailyClose[], sessionsBack: number): DailyClose | null {
  const index = series.length - 1 - sessionsBack;
  return index >= 0 ? series[index]! : null;
}

export function buildStockRead(input: StockInsightInput): TheRead | null {
  const { ticker } = input;
  const when = dayWord(input.quoteDay, input.today);
  const day = fin(input.dayPct) ? input.dayPct : null;
  // Defensive lookup: a call word outside Add/Hold/Trim keeps the plain "Our call: X." line instead of throwing.
  const meaning = input.call ? (CALL_MEANING as Record<string, string | undefined>)[input.call.word] : undefined;
  // The call said as what we'd do ("We'd keep it, not buy more."), not as a code word with a gloss.
  const callPart = input.call && input.callInHeadline !== false ? ` ${meaning ?? `Our call: ${input.call.word}`}.` : "";

  // ── headline: today's move against its group (or the market), then the call ──
  let headline = "";
  if (day !== null) {
    const base = input.group
      ? { label: input.group.label, pct: input.group.medianPct }
      : fin(input.marketPct)
        ? { label: "the S&P 500", pct: input.marketPct }
        : null;
    let tail = "";
    if (base) {
      const opposite = Math.sign(day) !== Math.sign(base.pct) && Math.abs(base.pct) >= 0.05 && Math.abs(day) >= 0.05;
      if (opposite) tail = ` while ${base.label} ${movedWord(base.pct)}`;
      else if (Math.abs(day - base.pct) < 0.3) tail = `, in line with ${base.label} (${signedPct(base.pct)})`;
      else tail = `, ${Math.abs(day) > Math.abs(base.pct) ? "more than" : "less than"} ${base.label} (${signedPct(base.pct)})`;
    }
    headline = `${ticker} ${movedWord(day)} ${when}${tail}.${callPart}`;
  } else if (input.call && input.callInHeadline !== false) {
    headline = `Our call on ${ticker}: ${input.call.word}.`;
  }

  // ── today's move in context ──
  let moveInsight: Insight | null = null;
  if (day !== null && Math.abs(day) >= 0.5) {
    const rank = fin(input.marketPct)
      ? relativeDayRank({ dayPct: day, marketPct: input.marketPct, quoteDay: input.quoteDay, series: input.series, benchmark: input.benchmark })
      : null;
    const usual = usualMove(input.series, input.quoteDay);
    let text = "";
    let figure: Insight["figure"];
    if (rank) {
      const side = rank.rel < 0 ? "worst" : "best";
      const span = rank.since
        ? `since ${shortDay(rank.since)}${rank.sessions >= 120 ? `, ${Math.round(rank.sessions / 21)} months ago` : ""}`
        : `in at least ${Math.max(3, Math.round(rank.window / 21))} months`;
      text = `${ticker} ${rank.rel < 0 ? "trailed" : "beat"} the S&P 500 by ${Math.abs(rank.rel).toFixed(1)} points ${when}, its ${side} day against the market ${span}.`;
      figure = { value: `${rank.rel < 0 ? "\u2212" : "+"}${Math.abs(rank.rel).toFixed(1)} pts`, label: "against the S&P 500" };
    } else if (usual !== null && usual > 0 && Math.abs(day) / usual >= 2 && Math.abs(day) >= 1) {
      text = `Today's ${pct(day)} move is ${(Math.abs(day) / usual).toFixed(1)} times bigger than a normal day for ${ticker}, which moves about ${pct(usual)} a day.`;
      figure = { value: `${(Math.abs(day) / usual).toFixed(1)}\u00d7`, label: "a normal day's move" };
    }
    const reason = input.moveReason ? input.moveReason.replace(/\s+/g, " ").trim().replace(/\.$/, "") : "";
    if (text || reason) {
      moveInsight = {
        id: "move",
        tone: day > 0 ? "up" : "down",
        text: text || `Why ${ticker} moved ${when}: ${clip(reason, 150)}.`,
        figure: figure ?? { value: signedPct(day), label: when },
        soWhat: text && reason ? `The reason we found: ${clip(reason, 150)}.` : undefined,
        action: { label: "What changed", href: "#changed" },
      };
    }
  }

  // ── earnings: when, and how it has reacted before ──
  let earningsInsight: Insight | null = null;
  const next = input.nextEarnings;
  const daysToNext = next ? dayGap(input.today, next.date) : null;
  if (next && daysToNext !== null && daysToNext >= 0 && daysToNext <= 30) {
    const reactions = input.pastEarnings
      .filter((event) => event.date < input.today)
      .slice(-8)
      .map((event) => ({ date: event.date, move: earningsReaction(input.series, event.date, event.time) }))
      .filter((item): item is { date: string; move: number } => item.move !== null);
    let soWhat: string | undefined;
    if (reactions.length >= 2) {
      const avg = reactions.reduce((sum, item) => sum + Math.abs(item.move), 0) / reactions.length;
      const biggest = reactions.reduce((a, b) => (Math.abs(b.move) > Math.abs(a.move) ? b : a));
      soWhat = `It has moved ${pct(avg)} on average the session after its last ${reactions.length} reports; the biggest was ${signedPct(biggest.move)} on ${shortDay(biggest.date)}.`;
    } else if (reactions.length === 1) {
      soWhat = `After its last report, on ${shortDay(reactions[0]!.date)}, it moved ${signedPct(reactions[0]!.move)} the next session.`;
    }
    earningsInsight = {
      id: "earnings",
      tone: "flat",
      text: `${ticker} reports ${shortDay(next.date)}${timeWord(next.time)}, ${inDays(daysToNext)}.`,
      figure: { value: shortDay(next.date), label: inDays(daysToNext) },
      soWhat,
      action: { label: "Earnings", href: "#earnings" },
    };
  }

  // ── where the price sits against the call (covered stocks only) ──
  let callInsight: Insight | null = null;
  const price = fin(input.price) && input.price > 0 ? input.price : null;
  if (input.levels && price !== null) {
    // A level more than half the price away says little about today; the page header leaves those out, so the read does too.
    const near = (level: number) => Math.abs(level - price) / price <= 0.5;
    // Only the level that matches the call (owner, Nov 11): the buy-more price on Buy more, the sell-some price on
    // Sell some, neither on Keep; "right at our buy-more price" on a Sell some call would contradict it.
    const word = input.call?.word;
    const add = word === "Add" && fin(input.levels.addBelow) && input.levels.addBelow > 0 && near(input.levels.addBelow) ? input.levels.addBelow : null;
    const trim = word === "Trim" && fin(input.levels.trimAbove) && input.levels.trimAbove > 0 && near(input.levels.trimAbove) ? input.levels.trimAbove : null;
    let text = "";
    let tone: Insight["tone"] = "flat";
    let figure: Insight["figure"];
    if (add !== null && price <= add) {
      text = `At ${money(price)}, ${ticker} is below ${money(add)}, the price where we'd buy more.`;
      figure = { value: money(add), label: "where we'd buy more" };
      tone = "up";
    } else if (trim !== null && price >= trim) {
      text = `At ${money(price)}, ${ticker} is above ${money(trim)}, the price where we'd sell some.`;
      figure = { value: money(trim), label: "where we'd sell some" };
      tone = "down";
    } else if (add !== null) {
      const above = ((price - add) / add) * 100;
      const addPart = above < 0.5 ? `${ticker} is right at our buy-more price (${money(add)})` : `${ticker} is ${pct(above)} above our buy-more price (${money(add)})`;
      text = trim !== null ? `${addPart}, and ${pct(((trim - price) / price) * 100)} below the price where we'd sell some (${money(trim)}).` : `${addPart}.`;
      figure = above < 0.5 ? { value: money(add), label: "our buy-more price" } : { value: pct(above), label: "above our buy-more price" };
    } else if (trim !== null) {
      text = `${ticker} would need to rise ${pct(((trim - price) / price) * 100)} to reach the price where we'd sell some (${money(trim)}).`;
      figure = { value: pct(((trim - price) / price) * 100), label: "to our sell-some price" };
    }
    const change = input.lastChange;
    let since: string | undefined;
    if (change && change.from && fin(change.priceAtCall) && change.priceAtCall > 0) {
      const sinceMove = ((price - change.priceAtCall) / change.priceAtCall) * 100;
      const how = Math.abs(sinceMove) < 0.1 ? "it is about where it was" : `it ${sinceMove >= 0 ? "is up" : "is down"} ${pct(sinceMove)} since`;
      // The call words a reader sees on the page ("Keep"), not the data's codes ("Hold").
      const plain = (call: CallWord) => (CALL_PLAIN as Record<string, string | undefined>)[call] ?? call;
      since = `We changed our call from ${plain(change.from)} to ${plain(change.to)} on ${shortDay(change.date)} at ${money(change.priceAtCall)}, and ${how}.`;
    }
    if (text) callInsight = { id: "call", tone, text, figure, soWhat: since, action: { label: "The reasoning", href: "#read" } };
    else if (since && change) callInsight = { id: "call", tone: "flat", text: since, figure: { value: shortDay(change.date), label: "our call changed" } };
  }

  // ── the longer trend, as a fallback ──
  let trendInsight: Insight | null = null;
  const series = input.series ?? [];
  if (series.length > LOOKBACK && price !== null) {
    const yearAgo = closeAround(series, LOOKBACK);
    const benchmark = input.benchmark ?? [];
    const benchLast = benchmark[benchmark.length - 1];
    const benchStart = yearAgo ? [...benchmark].reverse().find((point) => point.date <= yearAgo.date) : undefined;
    if (yearAgo && yearAgo.close > 0) {
      const last = series[series.length - 1]!;
      const stockYear = (last.close / yearAgo.close - 1) * 100;
      const benchYear = benchStart && benchLast && benchStart.close > 0 ? (benchLast.close / benchStart.close - 1) * 100 : null;
      const high = Math.max(...series.slice(-LOOKBACK).map((point) => point.close), price);
      const fromHigh = ((price - high) / high) * 100;
      const highPart = fromHigh <= -1 ? `, and it trades ${pct(fromHigh)} below its 52-week high` : ", and it trades at its 52-week high";
      trendInsight = {
        id: "trend",
        tone: benchYear !== null ? (stockYear >= benchYear ? "up" : "down") : stockYear >= 0 ? "up" : "down",
        text: `${ticker} ${stockYear >= 0 ? "is up" : "is down"} ${pct(stockYear)} over the past year${benchYear !== null ? ` against ${signedPct(benchYear)} for the S&P 500` : ""}${highPart}.`,
        figure: { value: signedPct(stockYear), label: "over the past year" },
      };
    }
  }

  const insights = pickInsights([moveInsight, earningsInsight, callInsight, trendInsight], 3);
  if (!headline && insights.length === 0) return null;
  return { headline, insights, asOf: input.asOf ?? null };
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : max).replace(/[,;:]$/, "")}…`;
}
